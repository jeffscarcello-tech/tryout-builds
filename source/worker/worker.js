// =====================================================================
// Tryout app server (Cloudflare Worker). Test site: Worker "tryouttest", D1 database "tryouttest" bound as DB.
//
// t1: stage 0. Serves the app file stored in D1 (installed by the GitHub updater, or uploaded at /admin),
//     plus the service worker, manifest, icons and a health check. Copied from the ShotPulse loader (v47),
//     with the game, live, sound, team-sharing and account parts left out. Accounts come in stage 1.
//
// Health check: GET /api/health
// =====================================================================
const LOADER = 'tr-loader-t1';
const APP_KIND = 'tryout';          // only app files built for this app are accepted (a ShotPulse file is refused)
const ADMIN_SALT = 'tr-admin:';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Admin', 'Access-Control-Max-Age': '86400' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
const html = (body, type, extra = {}) => new Response(body, { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra } });
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function sameStr(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

/* is this a complete app file for this app? */
function bundleOk(b) {
  return !!(b && b.app === APP_KIND && typeof b.html === 'string' && b.html.length > 1000 && typeof b.sw === 'string' && b.build && b.manifest && b.icon_svg && b.i192 && b.i512 && b.apple);
}

/* ---- app files live in D1 ---- */
let appCache = null, appChecked = 0, appReady = false;
async function appInit(db) {
  if (appReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS appmeta (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS apppart (ver TEXT NOT NULL, i INTEGER NOT NULL, d TEXT NOT NULL, PRIMARY KEY (ver, i))').run();
  appReady = true;
}
async function loadApp(db) {
  if (appCache && Date.now() - appChecked < 15000) return appCache;
  await appInit(db);
  const m = await db.prepare("SELECT v FROM appmeta WHERE k = 'cur'").first();
  appChecked = Date.now();
  if (!m) { appCache = null; return null; }
  const cur = JSON.parse(m.v);
  if (appCache && appCache.ver === cur.ver) return appCache;
  const rows = (await db.prepare('SELECT d FROM apppart WHERE ver = ?1 ORDER BY i').bind(cur.ver).all()).results || [];
  if (rows.length !== cur.n) return appCache;
  try { const b = JSON.parse(rows.map(r => r.d).join('')); b.ver = cur.ver; appCache = b; } catch (e) { /* keep the previous one */ }
  return appCache;
}
/* admin password. Wrong guesses lock out only the guesser's own network address. */
async function adminGate(db, request, mayCreate) {
  await appInit(db);
  const now = Date.now(), pass = request.headers.get('X-Admin') || '', fk = 'fails:' + (request.headers.get('CF-Connecting-IP') || 'x').slice(0, 60);
  if (pass.length < 4 || pass.length > 200) return json({ error: 'password_short' }, 403);
  const fm = await db.prepare('SELECT v FROM appmeta WHERE k = ?1').bind(fk).first();
  let fl = { n: 0, until: 0 }; try { if (fm) fl = JSON.parse(fm.v); } catch (e) { /* ignore */ }
  if (fl.until > now) return json({ error: 'locked', hint: 'Too many wrong passwords. Try again in ' + Math.ceil((fl.until - now) / 60000) + ' minute(s).' }, 429);
  const ph = await sha256(ADMIN_SALT + pass);
  let ex = await db.prepare("SELECT v FROM appmeta WHERE k = 'pass'").first();
  if (!ex) {
    if (!mayCreate) return json({ error: 'wrong_password' }, 403);
    if (pass.length < 8) return json({ error: 'password_weak', hint: 'Choose a password of at least 8 characters.' }, 400);
    await db.prepare("INSERT OR IGNORE INTO appmeta (k, v) VALUES ('pass', ?1)").bind(ph).run();
    ex = await db.prepare("SELECT v FROM appmeta WHERE k = 'pass'").first();
  }
  if (!sameStr(ex.v, ph)) {
    const n = (fl.n || 0) + 1, until = n >= 5 ? now + Math.min(3600000, 60000 * Math.pow(2, n - 5)) : 0;
    await db.prepare('INSERT OR REPLACE INTO appmeta (k, v) VALUES (?1, ?2)').bind(fk, JSON.stringify({ n, until, at: now })).run();
    return json({ error: 'wrong_password' }, 403);
  }
  if (fl.n || Math.random() < 0.05) await db.prepare("DELETE FROM appmeta WHERE k = ?1 OR (k LIKE 'fails:%' AND json_extract(v, '$.at') < ?2)").bind(fk, now - 86400000).run();
  return null;
}
async function handleApp(request, db, p) {
  { const no = await adminGate(db, request, true); if (no) return no; }
  if (p === '/api/app/check') return json({ ok: true });
  const url = new URL(request.url), ver = (url.searchParams.get('ver') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  if (!ver) return json({ error: 'bad_ver' }, 400);
  if (p === '/api/app/part' && request.method === 'PUT') {
    const i = parseInt(url.searchParams.get('i'), 10), text = await request.text();
    if (!(i >= 0 && i < 100) || text.length > 70000) return json({ error: 'bad_part' }, 413);
    await db.prepare('INSERT OR REPLACE INTO apppart (ver, i, d) VALUES (?1, ?2, ?3)').bind(ver, i, text).run();
    return json({ ok: true });
  }
  if (p === '/api/app/commit' && request.method === 'POST') {
    const n = parseInt(url.searchParams.get('n'), 10);
    const have = await db.prepare('SELECT COUNT(*) AS c FROM apppart WHERE ver = ?1').bind(ver).first();
    if (!(n > 0) || !have || have.c !== n) return json({ error: 'incomplete' }, 409);
    const rows = (await db.prepare('SELECT d FROM apppart WHERE ver = ?1 ORDER BY i').bind(ver).all()).results || [];
    let ok = false; try { ok = bundleOk(JSON.parse(rows.map(r => r.d).join(''))); } catch (e) { ok = false; }
    if (!ok) { await db.prepare('DELETE FROM apppart WHERE ver = ?1').bind(ver).run(); return json({ error: 'bad_bundle', hint: 'That file is damaged or is not an app file for this site. Nothing was changed.' }, 400); }
    await db.prepare("INSERT OR REPLACE INTO appmeta (k, v) VALUES ('cur', ?1)").bind(JSON.stringify({ ver, n })).run();
    await db.prepare('DELETE FROM apppart WHERE ver != ?1').bind(ver).run();
    appCache = null; appChecked = 0;
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}
async function serveApp(request, env, p) {
  const page = () => html(ADMIN_HTML, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  if (p === '/admin') return page();
  if (!env.DB) return new Response('This site needs a D1 database bound to the Worker as DB.', { status: 500 });
  const a = await loadApp(env.DB);
  if (!a) return (p === '/' || p === '/index.html') ? html(EMPTY_HTML, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' }) : null;
  if (p === '/' || p === '/index.html' || /^\/e\/[A-Za-z0-9]{4,12}\/?$/.test(p)) {
    const tag = '"' + a.ver + '"', hd = { 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ETag: tag };
    if ((request.headers.get('If-None-Match') || '').includes(tag)) return new Response(null, { status: 304, headers: hd });
    return html(a.html, 'text/html; charset=utf-8', hd);
  }
  if (p === '/sw.js') return html(a.sw, 'application/javascript; charset=utf-8', { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
  if (p === '/manifest.webmanifest') return html(a.manifest, 'application/manifest+json; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
  if (p === '/icon.svg') return html(a.icon_svg, 'image/svg+xml', { 'Cache-Control': 'public, max-age=86400' });
  if (p === '/icon-192.png') return html(b64(a.i192), 'image/png', { 'Cache-Control': 'public, max-age=86400' });
  if (p === '/icon-512.png') return html(b64(a.i512), 'image/png', { 'Cache-Control': 'public, max-age=86400' });
  if (p === '/apple-touch-icon.png') return html(b64(a.apple), 'image/png', { 'Cache-Control': 'public, max-age=86400' });
  if (a.files && Object.prototype.hasOwnProperty.call(a.files, p)) { const f = a.files[p]; if (f && typeof f.b64 === 'string' && typeof f.type === 'string') return html(b64(f.b64), f.type, { 'Cache-Control': 'public, max-age=86400' }); }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), p = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (p === '/api/app/check' || p === '/api/app/part' || p === '/api/app/commit') {
      if (!env.DB) return json({ error: 'needs_d1' }, 501);
      try { return await handleApp(request, env.DB, p); } catch (e) { return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500); }
    }
    if (p === '/api/health') {
      let ap = null, gh = null;
      if (env.DB) { ap = await loadApp(env.DB).catch(() => null); gh = await env.DB.prepare("SELECT v FROM appmeta WHERE k = 'ghlast'").first().catch(() => null); }
      let last = null; try { last = gh ? JSON.parse(gh.v) : null; } catch (e) { /* ignore */ }
      return json({ ok: true, app: !!ap, build: ap ? ap.build : null, loader: LOADER, db: !!env.DB, updater: last });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    { const r = await serveApp(request, env, p); if (r) return r; }
    return new Response('Not found', { status: 404 });
  }
};

const EMPTY_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Starting up</title><style>body{margin:0;background:#0b0b0e;color:#f6f6f8;font:17px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:32px;text-align:center}b{color:#ff8a1f}</style></head><body><h1>Almost <b>ready</b></h1><p>The app has not been installed on this site yet. Check back in a few minutes.</p></body></html>';

// ---- setup page (manual upload, only needed if the GitHub updater is not used) ----
const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>App setup</title>
<style>
body{margin:0;background:#0b0b0e;color:#f6f6f8;font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:20px;max-width:560px;margin:0 auto}
h1{font-size:24px;margin:8px 0 4px}h1 b{color:#ff8a1f}.m{color:#9a9aa8;font-size:14px}
.c{background:#16161b;border:1px solid #2a2a33;border-radius:16px;padding:16px;margin:16px 0}
label{display:block;font-weight:700;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#9a9aa8;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;font-size:16px;padding:14px;border-radius:12px;border:1px solid #2a2a33;background:#0b0b0e;color:#fff}
button{margin-top:18px;width:100%;font-size:18px;font-weight:800;padding:16px;border:0;border-radius:14px;background:#ff8a1f;color:#1c0d00}
button:disabled{opacity:.5}#log{white-space:pre-wrap;font-size:14px;margin-top:14px;min-height:20px}.ok{color:#5dd68c}.bad{color:#ff7b7b}a{color:#ff8a1f}
</style></head><body>
<h1>App <b>setup</b></h1>
<div class="m" id="state">Checking</div>
<div class="c">
<label for="f">App file</label><input id="f" type="file">
<label for="pw">Admin password</label><input id="pw" type="password" autocomplete="current-password">
<div class="m" style="margin-top:6px">Normally the app updates itself from GitHub and you never need this page.</div>
<button id="go">Upload app</button><div id="log"></div>
</div>
<div class="m"><a href="/">Open the app</a> &middot; <a href="/api/health">Health check</a></div>
<script>
var $=function(i){return document.getElementById(i)},say=function(t,c){var l=$('log');l.textContent=t;l.className=c||''};
fetch('/api/health').then(function(r){return r.json()}).then(function(j){$('state').textContent=j.app?'App installed: version '+j.build:'No app installed yet.'}).catch(function(){$('state').textContent=''});
$('go').onclick=async function(){
  var f=$('f').files[0],pw=$('pw').value;
  if(!f||pw.length<4){say('Choose the app file and enter your password.','bad');return}
  $('go').disabled=true;
  try{
    say('Reading file');var text=await f.text(),b;
    try{b=JSON.parse(text)}catch(e){throw new Error('That is not an app file.')}
    if(!b.html||!b.build)throw new Error('That file is missing the app.');
    var ver=String(b.build).replace(/[^A-Za-z0-9]/g,'')+Date.now().toString(36),N=60000,n=Math.ceil(text.length/N);
    for(var i=0;i<n;i++){
      say('Uploading '+(i+1)+' of '+n);
      var r=await fetch('/api/app/part?ver='+ver+'&i='+i,{method:'PUT',headers:{'X-Admin':pw},body:text.slice(i*N,(i+1)*N)});
      if(!r.ok){var j={};try{j=await r.json()}catch(e){}throw new Error(j.error==='wrong_password'?'Wrong password.':j.error==='locked'?(j.hint||'Too many wrong passwords.'):'Upload failed ('+(j.error||r.status)+'). '+(j.hint||''))}
    }
    var c=await fetch('/api/app/commit?ver='+ver+'&n='+n,{method:'POST',headers:{'X-Admin':pw}});
    if(!c.ok){var k={};try{k=await c.json()}catch(e){}throw new Error(k.error==='bad_bundle'?(k.hint||'That file is damaged.'):'Could not finish ('+(k.error||c.status)+')')}
    say('Done. Version '+b.build+' is live. Open the app and refresh once.','ok');$('state').textContent='App installed: version '+b.build;
  }catch(e){say(e.message||String(e),'bad')}
  $('go').disabled=false;
};
</script></body></html>`;
