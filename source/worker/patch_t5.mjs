// t5 changes to the loader (from the live t4 copy), as exact replacements. Used locally and in the deploy step.
export const PAIRS = [
["const LOADER = 'tr-loader-t4';", "const LOADER = 'tr-loader-t5';"],
["// t4: several organizers", "// t5: stations (skills per evaluator) and the finished flag carried in the event copy; evaluators cannot send\n//     scores, notes or check-ins once the organizer finishes (locks) the event.\n// t4: several organizers"],
["    checks: d.checks && typeof d.checks === 'object' && !Array.isArray(d.checks) ? d.checks : {} };",
 "    checks: d.checks && typeof d.checks === 'object' && !Array.isArray(d.checks) ? d.checks : {},\n    stations: d.stations && typeof d.stations === 'object' && !Array.isArray(d.stations) ? d.stations : {}, locked: !!d.locked };"],
["    let helper = who.role === 'org';\n    if (!helper && recs.some(r => r && r.k === 'c')) { const d = await db.prepare('SELECT data FROM sev WHERE eid = ?1').bind(eid).first(); try { helper = (JSON.parse(d.data).helpers || []).includes(who.vid); } catch (e) { helper = false; } }",
 "    let helper = who.role === 'org', closed = false;\n    if (who.role === 'eval' && recs.length) { const d = await db.prepare('SELECT data FROM sev WHERE eid = ?1').bind(eid).first(); try { const dd = JSON.parse(d.data); helper = (dd.helpers || []).includes(who.vid); closed = !!dd.locked; } catch (e) { helper = false; } }\n    if (closed) recs.length = 0;   // the organizer finished the event: evaluators can no longer send"]
];
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
if (process.argv[1] && process.argv[1].endsWith('patch_t5.mjs')) {
  const src = process.argv[2] || 'worker/worker.js';
  let s = readFileSync(src, 'utf8'); const miss = [];
  for (const [a, b] of PAIRS) { if (!s.includes(a)) miss.push(a.slice(0, 70)); else s = s.replace(a, () => b); }
  if (miss.length) { console.error('MISSING', miss); process.exit(1); }
  writeFileSync(src, s); console.log('patched', createHash('sha256').update(s).digest('hex'));
}
