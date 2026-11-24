// Local test server: the real loader Worker code with SQLite standing in for D1, app pre-installed.
import http from 'node:http'; import { DatabaseSync } from 'node:sqlite'; import { readFileSync } from 'node:fs';
const s = new DatabaseSync(':memory:');
const mk = (sql, args = []) => { const order = [...sql.matchAll(/\?(\d+)/g)].map(m => +m[1] - 1); const a = order.length ? order.map(i => args[i]) : args; const q = sql.replace(/\?(\d+)/g, '?');
  return { sql, bind: (...x) => mk(sql, x), run: async () => { const r = s.prepare(q).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => s.prepare(q).get(...a) || null, all: async () => ({ results: s.prepare(q).all(...a) }) }; };
const env = { DB: { prepare: sql => mk(sql), batch: async x => Promise.all(x.map(y => y.run())) } };
const loader = (await import('../worker/worker.js')).default;
const text = readFileSync(new URL('../dist/app.json', import.meta.url), 'utf8');
const VER = 'loc' + JSON.parse(text).build.replace(/[^A-Za-z0-9]/g, '') + Date.now().toString(36);   // unique per start, like the real updater
const H = { 'X-Admin': 'local-test-pass' };
const N = 60000, n = Math.ceil(text.length / N);
for (let i = 0; i < n; i++) await loader.fetch(new Request(`http://x/api/app/part?ver=${VER}&i=${i}`, { method: 'PUT', headers: H, body: text.slice(i * N, (i + 1) * N) }), env);
console.log((await (await loader.fetch(new Request(`http://x/api/app/commit?ver=${VER}&n=${n}`, { method: 'POST', headers: H }), env)).json()));
http.createServer(async (rq, rs) => { const chunks = []; for await (const c of rq) chunks.push(c); const body = chunks.length && !['GET', 'HEAD'].includes(rq.method) ? Buffer.concat(chunks) : undefined;
  const r = await loader.fetch(new Request('http://localhost:8787' + rq.url, { method: rq.method, headers: rq.headers, body }), env); rs.writeHead(r.status, Object.fromEntries(r.headers)); rs.end(Buffer.from(await r.arrayBuffer())); }).listen(8787, () => console.log('listening'));
