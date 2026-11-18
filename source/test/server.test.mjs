// Server tests: the loader and the updater, run in Node against a real SQLite database standing in for D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

function d1() {
  const s = new DatabaseSync(':memory:');
  const conv = sql => sql.replace(/\?(\d+)/g, '?');   // D1 numbered params -> positional
  const mk = (sql, args = []) => {
    // D1 lets ?1 repeat; expand args in the order the numbers appear
    const order = [...sql.matchAll(/\?(\d+)/g)].map(m => +m[1] - 1);
    const a = order.length ? order.map(i => args[i]) : args;
    const st = { sql, args,
      bind: (...x) => mk(sql, x),
      run: async () => { s.prepare(conv(sql)).run(...a); return { success: true }; },
      first: async () => s.prepare(conv(sql)).get(...a) || null,
      all: async () => ({ results: s.prepare(conv(sql)).all(...a) }) };
    return st;
  };
  return { prepare: sql => mk(sql), batch: async sts => { const out = []; for (const x of sts) out.push(/^\s*SELECT/i.test(x.sql) ? await x.all() : await x.run()); return out; }, raw: s };
}

const loader = (await import('../worker/worker.js?' + Date.now())).default;
const updater = (await import('../updater/worker.js?' + Date.now())).default;
const bundleText = readFileSync(new URL('../dist/app.json', import.meta.url), 'utf8');
const bundle = JSON.parse(bundleText);
const buildTxt = readFileSync(new URL('../dist/build.txt', import.meta.url), 'utf8');

const env = { DB: d1() };
const req = (path, opt = {}) => loader.fetch(new Request('https://tryouttest.example' + path, opt), env);
let n = 0; const ok = (name) => { n++; console.log('ok', n, name); };

// 1. empty site
let r = await req('/'); assert.equal(r.status, 200); assert.match(await r.text(), /Almost/); ok('empty site shows the starting page');
r = await req('/api/health'); let j = await r.json(); assert.equal(j.app, false); assert.equal(j.loader, 'tr-loader-t1'); ok('health before install');
r = await req('/nope'); assert.equal(r.status, 404); ok('unknown path 404');

// 2. admin password
r = await req('/api/app/check', { method: 'POST', headers: { 'X-Admin': 'short' } }); assert.equal(r.status, 400); ok('weak first password refused');
r = await req('/api/app/check', { method: 'POST', headers: { 'X-Admin': 'good-password-1' } }); assert.equal(r.status, 200); ok('first password set');
r = await req('/api/app/check', { method: 'POST', headers: { 'X-Admin': 'wrong-password', 'CF-Connecting-IP': '1.1.1.1' } }); assert.equal(r.status, 403); ok('wrong password refused');
for (let i = 0; i < 5; i++) r = await req('/api/app/check', { method: 'POST', headers: { 'X-Admin': 'wrong-password', 'CF-Connecting-IP': '1.1.1.1' } });
assert.equal(r.status, 429); ok('guesser locked out');
r = await req('/api/app/check', { method: 'POST', headers: { 'X-Admin': 'good-password-1', 'CF-Connecting-IP': '2.2.2.2' } }); assert.equal(r.status, 200); ok('owner from another address not locked out');

// 3. manual upload
const H = { 'X-Admin': 'good-password-1', 'CF-Connecting-IP': '2.2.2.2' };
async function upload(text, ver) {
  const N = 60000, cnt = Math.ceil(text.length / N);
  for (let i = 0; i < cnt; i++) { const x = await req(`/api/app/part?ver=${ver}&i=${i}`, { method: 'PUT', headers: H, body: text.slice(i * N, (i + 1) * N) }); assert.equal(x.status, 200); }
  return req(`/api/app/commit?ver=${ver}&n=${cnt}`, { method: 'POST', headers: H });
}
const sp = JSON.stringify(Object.assign({}, bundle, { app: undefined, build: 'nov17-v84' }));
r = await upload(sp, 'spfile1'); assert.equal(r.status, 400); ok('a ShotPulse-style file (not this app) is refused');
r = await req('/api/health'); j = await r.json(); assert.equal(j.app, false); ok('refused file changed nothing');
r = await req('/api/app/commit?ver=abc&n=3', { method: 'POST', headers: H }); assert.equal(r.status, 409); ok('incomplete upload refused');
r = await upload(bundleText, 'good1'); assert.equal(r.status, 200); ok('real app file accepted');

// 4. serving
r = await req('/'); assert.equal(r.status, 200); let t = await r.text(); assert.ok(t.includes("build: '" + bundle.build + "'")); const tag = r.headers.get('ETag'); assert.ok(tag); ok('app page served, version inside matches ' + bundle.build);
r = await req('/', { headers: { 'If-None-Match': tag } }); assert.equal(r.status, 304); ok('unchanged page answers 304');
r = await req('/sw.js'); t = await r.text(); assert.ok(t.includes("const V = 'tr-" + bundle.build + "'")); ok('service worker cache name matches build');
r = await req('/manifest.webmanifest'); assert.equal(JSON.parse(await r.text()).name, bundle.manifest && JSON.parse(bundle.manifest).name); ok('manifest');
for (const p of ['/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/icon-maskable-512.png']) { r = await req(p); assert.equal(r.status, 200, p); }
r = await req('/icon-192.png'); const png = new Uint8Array(await r.arrayBuffer()); assert.deepEqual([...png.slice(1, 4)], [80, 78, 71]); ok('icons served (PNG bytes check)');
r = await req('/admin'); assert.equal(r.headers.get('X-Frame-Options'), 'DENY'); ok('admin page cannot be framed');
r = await req('/api/health'); j = await r.json(); assert.equal(j.build, bundle.build); ok('health shows installed build');

// 5. updater
const env2 = { TEST_DB: d1() };
let files = { 'test/build.txt': buildTxt, 'test/app.json': bundleText };
globalThis.fetch = async (u) => { const p = new URL(u).pathname.split('/main/')[1]; return p in files ? new Response(files[p]) : new Response('nf', { status: 404 }); };
let w = await (await updater.fetch(new Request('https://u/'), env2)).json(); assert.equal(w.repo, 'jeffscarcello-tech/tryout-builds'); ok('updater status page');
const runU = async () => { let done; await updater.scheduled({}, env2, { waitUntil: p => { done = p; } }); await done; return JSON.parse((await env2.TEST_DB.prepare("SELECT v FROM appmeta WHERE k='ghlast'").first()).v).r; };
assert.equal(await runU(), 'installed ' + bundle.build); ok('updater installs from GitHub');
assert.equal(await runU(), 'up_to_date'); ok('updater skips when build.txt unchanged');
const env3 = { DB: env2.TEST_DB }; r = await loader.fetch(new Request('https://x/'), env3); assert.ok((await r.text()).includes(bundle.build)); ok('site serves what the updater installed');
files['test/build.txt'] = 'other-build\n'; assert.equal(await runU(), 'build_name_mismatch'); ok('build.txt and file disagree: refused');
files['test/app.json'] = sp.replace('nov17-v84', 'other-build'); assert.equal(await runU(), 'not_the_tryout_app'); ok('ShotPulse file on GitHub refused');
files['test/app.json'] = '{broken'; assert.equal(await runU(), 'app_file_damaged'); ok('damaged file refused');
r = await loader.fetch(new Request('https://x/'), env3); assert.ok((await r.text()).includes(bundle.build)); ok('site still serves the good version after refused updates');
console.log('ALL', n, 'SERVER TESTS PASSED');
