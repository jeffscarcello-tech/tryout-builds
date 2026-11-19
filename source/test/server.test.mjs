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
      run: async () => { const r = s.prepare(conv(sql)).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; },
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
r = await req('/api/health'); let j = await r.json(); assert.equal(j.app, false); assert.equal(j.loader, 'tr-loader-t3'); ok('health before install');
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

// 6. shared events
const env4 = { DB: d1() };
const api = (path, body, headers = {}, ip = '9.9.9.9') => loader.fetch(new Request('https://t.example' + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, headers), body: JSON.stringify(body) }), env4).then(async r => ({ status: r.status, j: await r.json() }));
const evData = { name: 'U15 tryouts', sport: 'volleyball', form: { scale: '5', skills: [{ id: 'k1', name: 'Serving', w: 1 }], tests: [], positions: [], divisions: [] }, groups: [], players: [{ id: 'p1', num: '7', name: 'Jo' }, { id: 'p2', num: '9', name: 'Al' }], sessions: [{ id: 'd1', name: 'Day 1' }] };
let x = await api('/api/ev/share', { eid: 'e1abcdef', data: evData, rev: 100 }); assert.equal(x.status, 200); assert.match(x.j.code, /^[A-Z2-9]{6}$/); assert.equal(x.j.key.length, 32); ok('organizer shares: code and key');
const code = x.j.code, KEY = { 'X-Key': x.j.key };
x = await api('/api/ev/share', { eid: 'e1abcdef', data: evData }); assert.equal(x.status, 409); ok('cannot share the same event twice');
x = await api('/api/ev/join', { code: 'ZZZZZZ', name: 'A' }); assert.equal(x.status, 404); ok('wrong code refused');
x = await api('/api/ev/join', { code: code.toLowerCase(), name: '' }); assert.equal(x.status, 400); ok('name needed');
x = await api('/api/ev/join', { code: code.toLowerCase(), name: 'Coach <b>A</b>' }); assert.equal(x.status, 200); assert.equal(x.j.eid, 'e1abcdef'); assert.equal(x.j.data.players.length, 2); assert.equal(x.j.data.scores, undefined); ok('evaluator joins with the code (any case), gets the roster, no scores');
const A = { 'X-Eval': x.j.vid + '.' + x.j.tok }, vidA = x.j.vid;
x = await api('/api/ev/join', { code, name: 'Coach B' }); const B = { 'X-Eval': x.j.vid + '.' + x.j.tok }, vidB = x.j.vid;
const rec = (id, by, p, v, t, k = 's', sk = 'k1') => ({ id: 'id-' + id, k, by, p, s: sk, d: 'd1', v, t });
x = await api('/api/ev/e1abcdef/sync', { since: 0, rev: 100, recs: [rec('r1', vidA, 'p1', 4, 1000), rec('r2', vidA, 'p2', 3, 1000), rec('r3', vidB, 'p1', 5, 1000)] }, A);
assert.equal(x.j.accepted, 2); assert.equal(x.j.recs.length, 2); assert.ok(x.j.recs.every(r => r.by === vidA)); ok('evaluator writes only their own scores (one for B ignored)');
x = await api('/api/ev/e1abcdef/sync', { since: 0, rev: 100, recs: [rec('r1', vidA, 'p1', 4, 1000)] }, A); assert.equal(x.j.accepted, 0); ok('sending the same score again is ignored (retry is safe)');
x = await api('/api/ev/e1abcdef/sync', { since: 0, rev: 100, recs: [rec('r4', vidB, 'p1', 2, 2000), rec('n1', vidB, 'p1', 'Great <i>hands</i>', 2000, 'n', '')] }, B);
assert.equal(x.j.accepted, 2); assert.equal(x.j.recs.length, 2); ok('second evaluator scores and adds a note');
x = await api('/api/ev/e1abcdef/sync', { since: 0, recs: [rec('r5', 'org1', 'p2', 5, 3000)] }, KEY);
assert.equal(x.j.recs.length, 5); assert.equal(x.j.evaluators.length, 2); assert.equal(x.j.evaluators[0].name, 'Coach bAb'.replace('bAb', '<b>A</b>').replace(/[<>]/g, '')); ok('organizer gets everyone\'s scores and notes, plus the evaluator list');
assert.equal(x.j.recs.find(r => r.id === 'id-n1').v, 'Great ihands/i'); assert.equal(typeof x.j.recs.find(r => r.id === 'id-r1').v, 'number'); ok('notes cleaned, scores come back as numbers');
const seq1 = x.j.seq; x = await api('/api/ev/e1abcdef/sync', { since: seq1, recs: [] }, KEY); assert.equal(x.j.recs.length, 0); ok('nothing new since last sync');
x = await api('/api/ev/e1abcdef/sync', { since: 0, rev: 100, recs: [] }, B); assert.equal(x.j.data, undefined); ok('evaluator up to date: no roster sent');
const evData2 = JSON.parse(JSON.stringify(evData)); evData2.players.push({ id: 'p3', num: '11', name: 'New' });
x = await api('/api/ev/e1abcdef/put', { data: evData2, rev: 200 }, KEY); assert.equal(x.j.rev, 200); ok('organizer updates the roster');
x = await api('/api/ev/e1abcdef/put', { data: evData2 }, A); assert.equal(x.status, 403); ok('evaluator cannot change the roster');
x = await api('/api/ev/e1abcdef/sync', { since: 0, rev: 100, recs: [] }, B); assert.equal(x.j.data.players.length, 3); assert.equal(x.j.rev, 200); ok('evaluator receives the new roster');
x = await api('/api/ev/e1abcdef/sync', { recs: [] }, { 'X-Eval': vidA + '.' + '0'.repeat(32) }); assert.equal(x.status, 403); x = await api('/api/ev/e1abcdef/sync', { recs: [] }, { 'X-Key': 'f'.repeat(32) }); assert.equal(x.status, 403); ok('wrong token or key refused');
x = await api('/api/ev/e1abcdef/remove', { vid: vidA }, KEY); x = await api('/api/ev/e1abcdef/sync', { recs: [] }, A); assert.equal(x.status, 403);
x = await api('/api/ev/e1abcdef/sync', { since: 0, recs: [] }, KEY); assert.equal(x.j.recs.filter(r => r.by === vidA).length, 2); ok('removed evaluator cannot send, their scores stay');
const big = Array.from({ length: 1600 }, (_, i) => rec('b' + i, vidB, 'p2', 3, 5000 + i));
for (let i = 0; i < big.length; i += 400) await api('/api/ev/e1abcdef/sync', { since: 0, recs: big.slice(i, i + 400) }, B);
x = await api('/api/ev/e1abcdef/sync', { since: 0, recs: [] }, KEY); assert.equal(x.j.more, true); assert.equal(x.j.recs.length, 1500);
const x2 = await api('/api/ev/e1abcdef/sync', { since: x.j.seq, recs: [] }, KEY); assert.equal(x.j.recs.length + x2.j.recs.length, 1605); assert.equal(x2.j.more, false); ok('large events come down in pages');
for (let i = 0; i < 40; i++) await api('/api/ev/join', { code: 'QQQQQQ', name: 'x' }, {}, '6.6.6.6');
x = await api('/api/ev/join', { code, name: 'x' }, {}, '6.6.6.6'); assert.equal(x.status, 429); ok('code guessing is limited per network');
x = await api('/api/ev/e1abcdef/sync', { since: 99999, recs: [rec('c1', vidB, 'p1', 1, 9000, 'c', '')] }, B); assert.equal(x.j.accepted, 0); ok('an evaluator not allowed to check in is ignored');
x = await api('/api/ev/e1abcdef/put', { data: { name: 'T', sport: 'volleyball', form: { skills: [] }, players: [{ id: 'p1' }], helpers: [vidB, 'bad id!'], assign: { [vidB]: ['g1'] }, checks: { d1: { p1: [1, 9] } } }, rev: 500 }, KEY); assert.equal(x.status, 200);
x = await api('/api/ev/e1abcdef/sync', { since: 99999, rev: 1, recs: [rec('c2', vidB, 'p1', 1, 9100, 'c', ''), rec('c3', vidB, 'p1', 7, 9200, 'c', '')] }, B);
assert.equal(x.j.accepted, 1); assert.deepEqual(x.j.data.helpers, [vidB]); assert.deepEqual(x.j.data.assign, { [vidB]: ['g1'] }); assert.equal(x.j.data.checks.d1.p1[0], 1); ok('allowed evaluator checks in (only 1 or 0); event copy carries helpers, groups and check-in');
x = await api('/api/ev/e1abcdef/sync', { since: x2.j.seq, recs: [rec('c4', 'orgx', 'p1', 0, 9300, 'c', '')] }, KEY); assert.equal(x.j.accepted, 1);
const cs = x.j.recs.filter(r => r.k === 'c'); assert.equal(cs.length, 2); assert.equal(typeof cs[0].v, 'number'); ok('organizer gets every check-in, as numbers');
x = await api('/api/ev/e1abcdef/stop', {}, KEY); assert.equal(x.status, 200); x = await api('/api/ev/e1abcdef/sync', { recs: [] }, B); assert.equal(x.status, 410); x = await api('/api/ev/join', { code, name: 'Late' }, {}, '7.7.7.7'); assert.equal(x.status, 404); ok('stop sharing: everything removed, evaluators told it is gone');
console.log('ALL', n, 'SERVER TESTS PASSED');
