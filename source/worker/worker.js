// =====================================================================
// Tryout app server (Cloudflare Worker). Test site: Worker "tryouttest", D1 database "tryouttest" bound as DB.
//
// t4: several organizers per event (the owner invites more with one-time 8-character codes; each gets its own token),
//     an organizer copy of the event (full roster with private notes, outcomes, team line) shared between organizers only,
//     team decisions as records (kind 'x', organizers only).
// t3: check-in records (kind 'c', 1 here / 0 not here; evaluators only when the organizer allows them), evaluator groups
//     and helpers carried in the event copy, the about and privacy pages are served fresh, abuse counters cleared more often.
// t2: shared events for several phones. The organizer shares an event (gets a secret organizer key and a 6-letter join code);
//     evaluators join with the code and their name (no account; each phone gets its own token). Scores and notes are
//     append-only records with an id made on the phone: a repeat is ignored, the newest per evaluator/player/skill/day wins
//     on the phones. Evaluators only ever get their own records back; the organizer gets everyone's.
// t1: stage 0. Serves the app file stored in D1 (installed by the GitHub updater, or uploaded at /admin),
//     plus the service worker, manifest, icons and a health check. Copied from the ShotPulse loader (v47),
//     with the game, live, sound, team-sharing and account parts left out. Accounts come in stage 1.
//
// Health check: GET /api/health
// =====================================================================
const LOADER = 'tr-loader-t4';
const APP_KIND = 'tryout';          // only app files built for this app are accepted (a ShotPulse file is refused)
const ADMIN_SALT = 'tr-admin:';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Admin,X-Key,X-Eval,X-Org', 'Access-Control-Max-Age': '86400' };
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
  if (p === '/' || p === '/index.html' || /^\/j\/[A-Za-z0-9]{4,12}\/?$/.test(p)) {
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
  if (a.files && Object.prototype.hasOwnProperty.call(a.files, p)) { const f = a.files[p]; if (f && typeof f.b64 === 'string' && typeof f.type === 'string') return html(b64(f.b64), f.type, { 'Cache-Control': f.type.startsWith('text/html') ? 'no-cache' : 'public, max-age=86400' }); }
  return null;
}

/* =====================================================================
   Shared events (several phones)
   ===================================================================== */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_ORGS = 20, INVITE_MS = 48 * 3600000;
const MAX_EVENT = 600000, MAX_RECS_IN = 400, MAX_RECS_OUT = 1500, MAX_RECS_EVENT = 250000, MAX_EVALS = 60;
const EID_RE = /^[A-Za-z0-9]{6,40}$/, RID_RE = /^[A-Za-z0-9_-]{4,40}$/, ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const rnd = (n, chars) => [...crypto.getRandomValues(new Uint8Array(n))].map(x => chars[x % chars.length]).join('');
const rndHex = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
let evReady = false;
async function evInit(db) {
  if (evReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS sev (eid TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, key_hash TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, seq INTEGER NOT NULL DEFAULT 0, nrec INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, touched INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS srec (eid TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, by TEXT NOT NULL, pid TEXT NOT NULL, kid TEXT NOT NULL, sid TEXT NOT NULL, v TEXT, t INTEGER NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (eid, id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS srec_seq ON srec (eid, seq)'),
    db.prepare('CREATE TABLE IF NOT EXISTS seval (eid TEXT NOT NULL, vid TEXT NOT NULL, tok_hash TEXT NOT NULL, name TEXT NOT NULL, joined INTEGER NOT NULL, seen INTEGER NOT NULL, PRIMARY KEY (eid, vid))'),
    db.prepare('CREATE TABLE IF NOT EXISTS srate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, win INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS sorg (eid TEXT NOT NULL, oid TEXT NOT NULL, tok_hash TEXT NOT NULL, name TEXT NOT NULL, joined INTEGER NOT NULL, seen INTEGER NOT NULL, PRIMARY KEY (eid, oid))'),
    db.prepare('CREATE TABLE IF NOT EXISTS sinv (code TEXT PRIMARY KEY, eid TEXT NOT NULL, created INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS sodata (eid TEXT PRIMARY KEY, data TEXT NOT NULL, rev INTEGER NOT NULL)')
  ]);
  evReady = true;
}
async function rateOk(db, k, max, win) {
  const now = Date.now(), r = await db.prepare('SELECT n, win FROM srate WHERE k = ?1').bind(k).first();
  if (!r || now - r.win > win) { await db.prepare('INSERT OR REPLACE INTO srate (k, n, win) VALUES (?1, 1, ?2)').bind(k, now).run(); return true; }
  if (Math.random() < 0.05) await db.prepare('DELETE FROM srate WHERE win < ?1').bind(now - 2 * 86400000).run();   // network addresses kept only a short time
  if (r.n >= max) return false;
  await db.prepare('UPDATE srate SET n = n + 1 WHERE k = ?1').bind(k).run(); return true;
}
const cleanTxt = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
/* the event as evaluators see it: name, sport, form, groups, players, days (never scores) */
function eventData(d) {
  if (!d || typeof d !== 'object') return null;
  const o = { name: cleanTxt(d.name, 60), sport: cleanTxt(d.sport, 20), form: d.form, groups: Array.isArray(d.groups) ? d.groups : [], players: Array.isArray(d.players) ? d.players : [], sessions: Array.isArray(d.sessions) ? d.sessions : [],
    helpers: Array.isArray(d.helpers) ? d.helpers.map(String).filter(x => ID_RE.test(x)).slice(0, MAX_EVALS) : [],
    assign: d.assign && typeof d.assign === 'object' && !Array.isArray(d.assign) ? d.assign : {},
    checks: d.checks && typeof d.checks === 'object' && !Array.isArray(d.checks) ? d.checks : {} };
  if (!o.form || typeof o.form !== 'object' || o.players.length > 1500) return null;
  return o;
}
/* who is calling: the organizer (X-Key) or an evaluator (X-Eval = vid.token) */
async function evWho(db, request, eid) {
  const row = await db.prepare('SELECT key_hash, rev, seq FROM sev WHERE eid = ?1').bind(eid).first();
  if (!row) return { gone: true };
  const key = request.headers.get('X-Key') || '';
  if (key.length >= 32 && sameStr(await sha256('ek:' + key), row.key_hash)) return { role: 'org', owner: true, row };
  const o = (request.headers.get('X-Org') || '').match(/^(o[a-z0-9]{11})\.([a-f0-9]{32})$/);
  if (o) {
    const og = await db.prepare('SELECT tok_hash, name, seen FROM sorg WHERE eid = ?1 AND oid = ?2').bind(eid, o[1]).first();
    if (og && sameStr(await sha256('eo:' + o[2]), og.tok_hash)) return { role: 'org', owner: false, oid: o[1], name: og.name, seen: og.seen, row };
  }
  const m = (request.headers.get('X-Eval') || '').match(/^([A-Za-z0-9]{8,20})\.([a-f0-9]{32})$/);
  if (m) {
    const ev = await db.prepare('SELECT tok_hash, name, seen FROM seval WHERE eid = ?1 AND vid = ?2').bind(eid, m[1]).first();
    if (ev && sameStr(await sha256('et:' + m[2]), ev.tok_hash)) return { role: 'eval', vid: m[1], name: ev.name, seen: ev.seen, row };
  }
  return { bad: true };
}
async function readBody(request, max) { const t = await request.text(); if (t.length > max) throw Object.assign(new Error('too_big'), { code: 413 }); try { return JSON.parse(t || '{}'); } catch (e) { throw Object.assign(new Error('bad_json'), { code: 400 }); } }

async function handleShared(request, env, p) {
  const db = env.DB; await evInit(db);
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const now = Date.now(), ip = (request.headers.get('CF-Connecting-IP') || 'x').slice(0, 60);
  let body; try { body = await readBody(request, MAX_EVENT + 200000); } catch (e) { return json({ error: e.message }, e.code || 400); }

  /* the organizer starts sharing an event: it gets a join code and a secret organizer key */
  if (p === '/api/ev/share') {
    const eid = String(body.eid || ''); if (!EID_RE.test(eid)) return json({ error: 'bad_event' }, 400);
    const data = eventData(body.data); if (!data) return json({ error: 'bad_event' }, 400);
    const txt = JSON.stringify(data); if (txt.length > MAX_EVENT) return json({ error: 'too_big' }, 413);
    if (!(await rateOk(db, 'share:' + ip, 30, 3600000))) return json({ error: 'too_many', hint: 'Too many shared events from this network. Try again later.' }, 429);
    if (await db.prepare('SELECT eid FROM sev WHERE eid = ?1').bind(eid).first()) return json({ error: 'already_shared' }, 409);
    const key = rndHex(); let code = '';
    for (let i = 0; i < 6 && !code; i++) { const c = rnd(6, CODE_CHARS); if (!(await db.prepare('SELECT eid FROM sev WHERE code = ?1').bind(c).first())) code = c; }
    if (!code) return json({ error: 'busy' }, 503);
    const rev = Math.floor(+body.rev) || now;
    await db.prepare('INSERT INTO sev (eid, code, key_hash, data, rev, seq, nrec, created, touched) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6)').bind(eid, code, await sha256('ek:' + key), txt, rev, now).run();
    const otxt = orgData(body.odata); if (otxt) await db.prepare('INSERT OR REPLACE INTO sodata (eid, data, rev) VALUES (?1, ?2, ?3)').bind(eid, otxt, rev).run();
    if (Math.random() < 0.05) tidyShared(db).catch(() => { /* ignore */ });
    return json({ ok: true, code, key, rev });
  }

  /* an evaluator joins with the code and a name; the phone gets its own token */
  if (p === '/api/ev/join') {
    if (!(await rateOk(db, 'join:' + ip, 40, 3600000))) return json({ error: 'too_many', hint: 'Too many tries. Wait a few minutes.' }, 429);
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const name = cleanTxt(body.name, 30); if (!name) return json({ error: 'name_needed' }, 400);
    if (code.length === 8) {   // an organizer invite: one use, 48 hours
      const inv = await db.prepare('SELECT eid, created FROM sinv WHERE code = ?1').bind(code).first();
      if (!inv || now - inv.created > INVITE_MS) return json({ error: 'bad_code' }, 404);
      const ev = await db.prepare('SELECT eid, code, data, rev FROM sev WHERE eid = ?1').bind(inv.eid).first();
      if (!ev) return json({ error: 'bad_code' }, 404);
      const n = await db.prepare('SELECT COUNT(*) AS c FROM sorg WHERE eid = ?1').bind(ev.eid).first();
      if (n && n.c >= MAX_ORGS) return json({ error: 'full' }, 403);
      const oid = 'o' + rnd(11, CODE_CHARS.toLowerCase() + '0123456789'), tok = rndHex();
      await db.batch([db.prepare('DELETE FROM sinv WHERE code = ?1').bind(code), db.prepare('INSERT INTO sorg (eid, oid, tok_hash, name, joined, seen) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(ev.eid, oid, await sha256('eo:' + tok), name, now)]);
      const od = await db.prepare('SELECT data, rev FROM sodata WHERE eid = ?1').bind(ev.eid).first();
      return json({ ok: true, role: 'org', eid: ev.eid, oid, tok, code: ev.code, rev: ev.rev, data: JSON.parse(ev.data), orev: od ? od.rev : 0, odata: od ? JSON.parse(od.data) : null });
    }
    const row = code.length === 6 ? await db.prepare('SELECT eid, data, rev FROM sev WHERE code = ?1').bind(code).first() : null;
    if (!row) return json({ error: 'bad_code' }, 404);
    const cnt = await db.prepare('SELECT COUNT(*) AS c FROM seval WHERE eid = ?1').bind(row.eid).first();
    if (cnt && cnt.c >= MAX_EVALS) return json({ error: 'full' }, 403);
    const vid = 'v' + rnd(11, CODE_CHARS.toLowerCase() + '0123456789'), tok = rndHex();
    await db.prepare('INSERT INTO seval (eid, vid, tok_hash, name, joined, seen) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(row.eid, vid, await sha256('et:' + tok), name, now).run();
    return json({ ok: true, eid: row.eid, vid, tok, rev: row.rev, data: JSON.parse(row.data) });
  }

  const m = p.match(/^\/api\/ev\/([A-Za-z0-9]{6,40})\/(sync|put|evaluators|remove|stop|leave|orginvite|orgremove)$/);
  if (!m) return json({ error: 'not_found' }, 404);
  const eid = m[1], act = m[2], who = await evWho(db, request, eid);
  if (who.gone) return json({ error: 'gone', hint: 'The organizer stopped sharing this event.' }, 410);
  if (who.bad) return json({ error: 'not_allowed' }, 403);

  if (act === 'leave') {
    if (who.role === 'eval') await db.prepare('DELETE FROM seval WHERE eid = ?1 AND vid = ?2').bind(eid, who.vid).run();
    else if (who.oid) await db.prepare('DELETE FROM sorg WHERE eid = ?1 AND oid = ?2').bind(eid, who.oid).run();
    else return json({ error: 'owner_stops' }, 403);
    return json({ ok: true });
  }

  /* scores and notes in and out */
  if (act === 'sync') {
    if (who.role === 'eval' && now - (who.seen || 0) > 60000) await db.prepare('UPDATE seval SET seen = ?1 WHERE eid = ?2 AND vid = ?3').bind(now, eid, who.vid).run();
    if (who.oid && now - (who.seen || 0) > 60000) await db.prepare('UPDATE sorg SET seen = ?1 WHERE eid = ?2 AND oid = ?3').bind(now, eid, who.oid).run();
    const recs = (Array.isArray(body.recs) ? body.recs : []).slice(0, MAX_RECS_IN), good = [];
    let helper = who.role === 'org';
    if (!helper && recs.some(r => r && r.k === 'c')) { const d = await db.prepare('SELECT data FROM sev WHERE eid = ?1').bind(eid).first(); try { helper = (JSON.parse(d.data).helpers || []).includes(who.vid); } catch (e) { helper = false; } }
    for (const r of recs) {
      if (!r || !RID_RE.test(String(r.id)) || (r.k !== 's' && r.k !== 'n' && r.k !== 'c' && r.k !== 'x')) continue;
      if (r.k === 'x' && (who.role !== 'org' || (r.v != null && !ID_RE.test(String(r.v))))) continue;   // team decisions: organizers only
      if (r.k === 'c' && (!helper || (r.v !== 0 && r.v !== 1))) continue;   // check-in: the organizer, or an evaluator allowed to check in
      const by = String(r.by || ''); if (!ID_RE.test(by)) continue;
      if (who.role === 'eval' && by !== who.vid) continue;   // an evaluator can only write their own scores
      if (!ID_RE.test(String(r.p)) || !ID_RE.test(String(r.d)) || (r.s !== '' && !ID_RE.test(String(r.s)))) continue;
      let v = null; if (r.k === 'x') v = r.v == null ? null : String(r.v); else if (r.k === 'c') v = String(r.v); else if (r.k === 's') { if (r.v != null) { v = Number(r.v); if (!isFinite(v) || Math.abs(v) > 1e7) continue; v = String(v); } } else v = cleanTxt(r.v, 300);
      good.push({ id: String(r.id), k: r.k, by, p: String(r.p), s: String(r.s || ''), d: String(r.d), v, t: Math.min(Math.floor(+r.t) || now, now + 86400000) });
    }
    let accepted = 0;
    if (good.length) {
      if (who.row && who.row.nrec + good.length > MAX_RECS_EVENT) return json({ error: 'event_full' }, 413);
      const up = await db.prepare('UPDATE sev SET seq = seq + ?1, touched = ?2 WHERE eid = ?3 RETURNING seq').bind(good.length, now, eid).first();
      const base = up.seq - good.length;
      const res = await db.batch(good.map((r, i) => db.prepare('INSERT OR IGNORE INTO srec (eid, id, kind, by, pid, kid, sid, v, t, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)').bind(eid, r.id, r.k, r.by, r.p, r.s, r.d, r.v, r.t, base + i + 1)));
      accepted = res.reduce((a, x) => a + ((x.meta && x.meta.changes) || 0), 0);
      if (accepted) await db.prepare('UPDATE sev SET nrec = nrec + ?1 WHERE eid = ?2').bind(accepted, eid).run();
    }
    const since = Math.max(0, Math.floor(+body.since) || 0);
    const q = who.role === 'org'
      ? db.prepare('SELECT id, kind, by, pid, kid, sid, v, t, seq FROM srec WHERE eid = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3').bind(eid, since, MAX_RECS_OUT + 1)
      : db.prepare('SELECT id, kind, by, pid, kid, sid, v, t, seq FROM srec WHERE eid = ?1 AND seq > ?2 AND by = ?4 ORDER BY seq LIMIT ?3').bind(eid, since, MAX_RECS_OUT + 1, who.vid);
    const rows = (await q.all()).results || [], more = rows.length > MAX_RECS_OUT, out = rows.slice(0, MAX_RECS_OUT);
    const cur = await db.prepare('SELECT seq, rev, data FROM sev WHERE eid = ?1').bind(eid).first();
    const reply = { ok: true, accepted, more, seq: out.length ? out[out.length - 1].seq : (more ? since : cur.seq), rev: cur.rev,
      recs: out.map(x => ({ id: x.id, k: x.kind, by: x.by, p: x.pid, s: x.kid, d: x.sid, v: x.kind === 's' || x.kind === 'c' ? (x.v == null ? null : Number(x.v)) : x.v, t: x.t })) };
    if (who.role === 'eval' && Math.floor(+body.rev || 0) !== cur.rev) reply.data = JSON.parse(cur.data);
    if (who.role === 'org') {
      reply.evaluators = ((await db.prepare('SELECT vid, name, joined, seen FROM seval WHERE eid = ?1 ORDER BY joined, rowid').bind(eid).all()).results || []);
      reply.organizers = ((await db.prepare('SELECT oid, name, joined, seen FROM sorg WHERE eid = ?1 ORDER BY joined, rowid').bind(eid).all()).results || []);
      const od = await db.prepare('SELECT data, rev FROM sodata WHERE eid = ?1').bind(eid).first();
      reply.orev = od ? od.rev : 0;
      if (od && Math.floor(+body.orev || 0) !== od.rev) reply.odata = JSON.parse(od.data);
      if (Math.floor(+body.rev || 0) !== cur.rev) reply.data = JSON.parse(cur.data);
    }
    return json(reply);
  }
  if (who.role !== 'org') return json({ error: 'organizer_only' }, 403);
  /* the organizer changed the roster, groups, form or days */
  if (act === 'put') {
    const data = eventData(body.data); if (!data) return json({ error: 'bad_event' }, 400);
    const txt = JSON.stringify(data); if (txt.length > MAX_EVENT) return json({ error: 'too_big' }, 413);
    const rev = Math.max(Math.floor(+body.rev) || now, who.row.rev + 1);
    await db.prepare('UPDATE sev SET data = ?1, rev = ?2, touched = ?3 WHERE eid = ?4').bind(txt, rev, now, eid).run();
    const otxt = orgData(body.odata); let orev = 0;
    if (otxt) { const od = await db.prepare('SELECT rev FROM sodata WHERE eid = ?1').bind(eid).first(); orev = Math.max(now, od ? od.rev + 1 : 0); await db.prepare('INSERT OR REPLACE INTO sodata (eid, data, rev) VALUES (?1, ?2, ?3)').bind(eid, otxt, orev).run(); }
    return json({ ok: true, rev, orev });
  }
  if (act === 'evaluators') return json({ evaluators: ((await db.prepare('SELECT vid, name, joined, seen FROM seval WHERE eid = ?1 ORDER BY joined, rowid').bind(eid).all()).results || []) });
  if (act === 'remove') { await db.prepare('DELETE FROM seval WHERE eid = ?1 AND vid = ?2').bind(eid, String(body.vid || '')).run(); return json({ ok: true }); }   // their scores stay; their phone can no longer send
  /* only the organizer who started sharing (the owner) adds or removes organizers and stops sharing */
  if (!who.owner) return json({ error: 'owner_only' }, 403);
  if (act === 'orginvite') {
    let code = '';
    for (let i = 0; i < 6 && !code; i++) { const c = rnd(8, CODE_CHARS); if (!(await db.prepare('SELECT code FROM sinv WHERE code = ?1').bind(c).first())) code = c; }
    if (!code) return json({ error: 'busy' }, 503);
    await db.batch([db.prepare('DELETE FROM sinv WHERE eid = ?1 AND created < ?2').bind(eid, now - INVITE_MS), db.prepare('INSERT INTO sinv (code, eid, created) VALUES (?1, ?2, ?3)').bind(code, eid, now)]);
    return json({ ok: true, code, expires: now + INVITE_MS });
  }
  if (act === 'orgremove') { await db.prepare('DELETE FROM sorg WHERE eid = ?1 AND oid = ?2').bind(eid, String(body.oid || '')).run(); return json({ ok: true }); }
  if (act === 'stop') { await dropEvent(db, eid); return json({ ok: true }); }
  return json({ error: 'not_found' }, 404);
}
/* the organizers' copy: the full event setup (private roster notes, outcomes, team line), never scores */
function orgData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const t = JSON.stringify(d); return t.length <= MAX_EVENT ? t : null;
}
async function dropEvent(db, eid) {
  await db.batch(['srec', 'seval', 'sorg', 'sinv', 'sodata', 'sev'].map(t => db.prepare('DELETE FROM ' + t + ' WHERE eid = ?1').bind(eid)));
}
/* shared events untouched for 400 days are removed */
async function tidyShared(db) {
  const old = Date.now() - 400 * 86400000;
  const gone = (await db.prepare('SELECT eid FROM sev WHERE touched < ?1 LIMIT 20').bind(old).all()).results || [];
  for (const g of gone) await dropEvent(db, g.eid);
  await db.prepare('DELETE FROM sinv WHERE created < ?1').bind(Date.now() - INVITE_MS).run();
  await db.prepare('DELETE FROM srate WHERE win < ?1').bind(Date.now() - 2 * 86400000).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), p = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (p === '/api/app/check' || p === '/api/app/part' || p === '/api/app/commit') {
      if (!env.DB) return json({ error: 'needs_d1' }, 501);
      try { return await handleApp(request, env.DB, p); } catch (e) { return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500); }
    }
    if (p.startsWith('/api/ev/')) {
      if (!env.DB) return json({ error: 'needs_d1' }, 501);
      try { return await handleShared(request, env, p); } catch (e) { return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500); }
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
