// Unit tests: sport templates and roster import, run in Node with small stand-ins for the browser.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert';  // loose deepEqual: arrays made inside the vm have a different prototype

const src = ['sports.js', 'store.js', 'score.js', 'results.js', 'pdf.js', 'sync.js', 'checkin.js', 'decide.js', 'guides.js', 'install.js', 'extras.js'].map(f => readFileSync(new URL('../src/js/' + f, import.meta.url), 'utf8')).join('\n').replace('__PRIVACY_DOC__', '""');
const mem = {};
const ctx = { console, JSON, Date, Math, Map, Set, String, Object, Array, parseInt, setTimeout, clearTimeout,
  localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } },
  window: { addEventListener() { } }, document: { addEventListener() { }, querySelectorAll: () => [], hidden: false }, navigator: { onLine: false }, toast() { } };
vm.createContext(ctx);
vm.runInContext(src + '\n;globalThis.__t = { SPORTS, sportById, wordsOf, formFromSport, copyForm, parseRoster, duplicateNumbers, sortPlayers, newEvent, S, exportData, importData, save, setScore, getScore, shownScore, progressOf, skillsFor, scaleValues, me, setNote, getNote, groupPlayers, ensureDays, convertTest, setSystem, systemOf, unitKind, computeResults, notesFor, convertScale, hasSkillScores, scaleMax, skillApplies, skillChoices, scaleLo, scaleHi, useSlider, scaleLabel, makePdf, pdfText, wrapText, mergeRecs, queued, waitingCount, payloadOf, myId, isShared, checkinFor, setHere, checkMapOf, myGroups, groupPlayers, canCheckIn, makeDemo, computeResults, ensureChecks, mergeOrgCopy, orgPayloadOf, authOf, decisionsOf, setDecision, outcomesOf, decisionsCsv, decisionsReport, guideText, sampleGuides, gkey, hasGuide, applyOrgCopy };', ctx);
const T = ctx.__t;
let n = 0; const ok = m => { n++; console.log('ok', n, m); };

// sports
const ids = T.SPORTS.map(s => s.id);
assert.deepEqual(ids, ['volleyball', 'basketball', 'hockey', 'soccer', 'lacrosse', 'ringette', 'baseball', 'softball', 'football', 'flagfootball', 'rugby', 'track', 'swimming', 'blank']); ok('13 sports plus Blank, in order');
assert.ok(T.sportById('volleyball').skills.includes('Gameplay')); ok('volleyball has Gameplay');
assert.equal(new Set(ids).size, ids.length); ok('sport ids unique');
for (const s of T.SPORTS) { const f = T.formFromSport(s.id); assert.equal(f.skills.length, s.skills.length); assert.equal(new Set(f.skills.map(k => k.id)).size, f.skills.length); for (const t of f.tests) assert.ok(['low', 'high'].includes(t.better)); }
ok('every sport makes a form with unique skill ids and valid tests');
assert.ok(T.formFromSport('hockey').alt && T.formFromSport('hockey').alt.pos === 'Goalie'); assert.ok(T.formFromSport('ringette').alt); assert.equal(T.formFromSport('volleyball').alt, null); ok('goalie lists for hockey and ringette only');
assert.equal(T.wordsOf({ sport: 'swimming' }).player, 'swimmer'); assert.equal(T.wordsOf({ sport: 'track' }).team, 'squad'); assert.equal(T.wordsOf({ sport: 'hockey' }).player, 'player'); ok('sport words (squad, swimmer, athlete)');
const f1 = T.formFromSport('volleyball'), f2 = T.copyForm(f1); assert.notEqual(f1.skills[0].id, f2.skills[0].id); f2.skills[0].name = 'X'; assert.notEqual(f1.skills[0].name, 'X'); ok('template copy is independent with fresh ids');
assert.equal(T.formFromSport('nope').skills.length, 0); ok('unknown sport falls back to Blank');

// roster import
const vb = T.formFromSport('volleyball'); vb.divisions = ['U15', 'U17'];
let r = T.parseRoster('12 Sam Lee\n7. Jordan Park\nAva Chen 3\n#22 - Mia Ross\n\n', vb);
assert.deepEqual(r.players.map(p => [p.num, p.name]), [['12', 'Sam Lee'], ['7', 'Jordan Park'], ['3', 'Ava Chen'], ['22', 'Mia Ross']]); ok('plain lines: number first or last');
r = T.parseRoster('Number,First Name,Last Name,Position,Age Group,Group,Notes\n4,Sam,Lee,setter,U15,Group A,"tall, lefty"\n9,Kai,Wu,Libero,U17,Group B,', vb);
assert.equal(r.players.length, 2); assert.deepEqual(r.players[0], { num: '4', name: 'Sam Lee', pos: 'Setter', div: 'U15', group: 'Group A', notes: 'tall, lefty' }); ok('CSV with header, quotes, first+last, position matched to list');
r = T.parseRoster('#\tName\tPos\n10\tAlex B\tOutside\n11\tJo C\tMiddle', vb); assert.deepEqual(r.players.map(p => p.pos), ['Outside', 'Middle']); ok('tab-separated paste from a spreadsheet');
r = T.parseRoster('12, Sam Lee, Setter, U15\n7, Jordan Park', vb); assert.deepEqual([r.players[0].num, r.players[0].name, r.players[0].pos, r.players[0].div], ['12', 'Sam Lee', 'Setter', 'U15']); assert.equal(r.players[1].name, 'Jordan Park'); ok('comma lines without header');
r = T.parseRoster('Name\nSam Lee\n<b>Bad</b> Name', vb); assert.equal(r.players.length, 2); assert.ok(!/[<>]/.test(r.players[1].name)); ok('header-only name column; markup removed');
r = T.parseRoster('', vb); assert.equal(r.players.length, 0); ok('empty paste');
const dup = T.duplicateNumbers([{ num: '4', group: '' }, { num: '4', group: '' }, { num: '5', group: 'a' }, { num: '5', group: 'b' }]); assert.ok(dup.has('|4')); assert.ok(!dup.has('a|5')); ok('duplicate numbers found only within a group');
assert.deepEqual(T.sortPlayers([{ num: '10', name: 'b' }, { num: '2', name: 'a' }, { num: '', name: 'c' }]).map(p => p.num), ['2', '10', '']); ok('players sorted by number, no number last');

// events, storage, backup
const ev = T.newEvent('U15 tryouts', 'hockey'); assert.equal(T.S.events[0], ev); assert.equal(ev.form.skills.length, 7); T.save(true);
assert.ok(JSON.parse(mem['rp.v1']).events[0].id === ev.id); ok('new event saved on the phone');
const tpl = T.formFromSport('soccer'); const ev2 = T.newEvent('From template', 'soccer', tpl); assert.notEqual(ev2.form.skills[0].id, tpl.skills[0].id); ok('event from template gets its own copy');
const back = T.exportData(); T.S.events.length = 0; let res = T.importData(back); assert.equal(res.added, 2); assert.equal(T.S.events.length, 2); ok('backup and restore');
res = T.importData(back); assert.equal(res.added, 0); ok('restoring twice adds nothing');
assert.throws(() => T.importData('{"app":"shotpulse"}')); assert.throws(() => T.importData('nope')); ok('wrong file refused');
// scoring
const hk = T.newEvent('Hockey camp', 'hockey'); T.ensureDays(hk); const D1 = hk.sessions[0].id;
hk.players.push({ id: 'p1', num: '9', name: 'A', pos: 'Forward', group: 'g1' }, { id: 'p2', num: '30', name: 'B', pos: 'Goalie', group: 'g1' }, { id: 'p3', num: '4', name: 'C', pos: '', group: 'g2' });
assert.equal(T.skillsFor(hk, hk.players[1]), hk.form.alt.skills); assert.equal(T.skillsFor(hk, hk.players[0]), hk.form.skills); ok('goalie gets the goalie skill list');
assert.deepEqual(T.scaleValues('5').map(x => x[0]), [1, 2, 3, 4, 5]); assert.equal(T.scaleValues('10').length, 10); assert.deepEqual(T.scaleValues('pcm').map(x => x[1]), ['+', '✓', '−']); ok('scales');
const k0 = hk.form.skills[0].id; T.setScore(hk, 'p1', k0, D1, 4); assert.equal(T.getScore(hk, 'p1', k0, D1), 4);
const id1 = hk.scores[T.me().id + '|p1|' + k0 + '|' + D1].id; T.setScore(hk, 'p1', k0, D1, 5); assert.equal(T.getScore(hk, 'p1', k0, D1), 5); assert.notEqual(hk.scores[T.me().id + '|p1|' + k0 + '|' + D1].id, id1); ok('changing a score makes a new record id (for sync later)');
T.setScore(hk, 'p1', k0, D1, null); assert.equal(T.getScore(hk, 'p1', k0, D1), null); ok('clearing a score');
hk.form.skills.forEach(k => T.setScore(hk, 'p1', k.id, D1, 3)); let pr = T.progressOf(hk, hk.players[0], D1); assert.equal(pr.done, 7); assert.equal(pr.all, 8); ok('progress counts skills and tests (7 of 8)');
T.setScore(hk, 'p1', hk.form.tests[0].id, D1, 41.25); pr = T.progressOf(hk, hk.players[0], D1); assert.equal(pr.done, pr.all); ok('test value fills the last one');
assert.equal(T.getScore(hk, 'p1', k0, D1, 'someone-else'), null); ok('scores belong to one evaluator');
T.setNote(hk, 'p1', '', D1, 'Strong <b>skater</b>'); assert.equal(T.getNote(hk, 'p1', '', D1), 'Strong bskater/b'); T.setNote(hk, 'p1', k0, D1, 'edges weak'); assert.equal(T.getNote(hk, 'p1', k0, D1), 'edges weak'); assert.equal(T.getNote(hk, 'p1', hk.form.skills[1].id, D1), ''); ok('overall note and per-skill note kept apart');
assert.deepEqual(T.groupPlayers(hk, 'g1').map(p => p.num), ['9', '30']); assert.equal(T.groupPlayers(hk, 'all').length, 3); ok('group filter for scoring');
// days
hk.sessions.push({ id: 'd2', name: 'Day 2' });
hk.form.combine = 'avg'; assert.equal(T.shownScore(hk, 'p1', k0, 'd2').v, null); assert.equal(T.progressOf(hk, hk.players[0], 'd2').done, 0); ok('average/total: day 2 starts empty');
hk.form.combine = 'carry'; let sh = T.shownScore(hk, 'p1', k0, 'd2'); assert.equal(sh.v, 3); assert.equal(sh.carried.name, 'Day 1'); assert.equal(T.progressOf(hk, hk.players[0], 'd2').done, 8); ok('carry forward: day 2 starts with day 1 scores');
T.setScore(hk, 'p1', k0, 'd2', 5); sh = T.shownScore(hk, 'p1', k0, 'd2'); assert.equal(sh.v, 5); assert.equal(sh.carried, null); assert.equal(T.getScore(hk, 'p1', k0, D1), 3); ok('carry forward: a new tap replaces it for day 2, day 1 kept');
// old (t3) scores move to Day 1
const old = { id: 'eold', name: 'Old', sport: 'volleyball', form: T.formFromSport('volleyball'), groups: [], players: [], scores: { 'v1|p1|k1': { id: 'r1', v: 4, t: 1 } }, notes: { 'v1|p1': { id: 'r2', v: 'hi', t: 1 } } };
delete old.form.combine; T.ensureDays(old); assert.equal(old.sessions.length, 1); assert.equal(old.scores['v1|p1|k1|d1'].v, 4); assert.equal(old.notes['v1|p1||d1'].v, 'hi'); assert.equal(old.form.combine, 'avg'); ok('scores from build t3 move to Day 1');
T.save(true); assert.ok(JSON.parse(mem['rp.v1']).events.find(e => e.id === hk.id).scores); ok('scores stored on the phone');
// units
const vbe = T.newEvent('VB', 'volleyball'); T.ensureDays(vbe); const vj = vbe.form.tests[0]; assert.equal(vj.unit, 'cm');
vbe.scores = { ['me|p1|' + vj.id + '|d1']: { id: 'x', v: 50, t: 1 } };
assert.equal(T.systemOf(vbe.form), 'metric'); let nchg = T.setSystem(vbe, 'imperial'); assert.equal(nchg, 2); assert.equal(vj.unit, 'in'); assert.equal(vbe.scores['me|p1|' + vj.id + '|d1'].v, 19.685); assert.equal(T.systemOf(vbe.form), 'imperial'); ok('metric to imperial converts units and entered values');
T.setSystem(vbe, 'metric'); assert.equal(vj.unit, 'cm'); assert.equal(vbe.scores['me|p1|' + vj.id + '|d1'].v, 50); ok('and back to exactly 50');
const fb = T.newEvent('FB', 'football'); assert.equal(T.systemOf(fb.form), 'metric'); const bj = fb.form.tests.find(t => t.name === 'Broad jump'); T.convertTest(fb, bj, 'ft'); assert.equal(bj.unit, 'ft'); const dash = fb.form.tests[0]; T.convertTest(fb, dash, 'reps'); assert.equal(dash.unit, 'reps'); ok('single test unit change, time to count leaves values alone');
assert.equal(T.unitKind('s'), 'time'); assert.equal(T.unitKind('yd'), 'dist'); assert.equal(T.unitKind('zz'), 'other'); ok('unit kinds');
// results
const R0 = T.newEvent('Results', 'volleyball'); T.ensureDays(R0); R0.form.tests = [{ id: 'tv', name: 'Vertical', unit: 'cm', better: 'high' }, { id: 'ts', name: 'Sprint', unit: 's', better: 'low' }];
R0.form.skills = [{ id: 'a', name: 'Serve', w: 1 }, { id: 'b', name: 'Pass', w: 2 }]; R0.form.alt = null;
R0.players = [{ id: 'x', num: '1', name: 'X', pos: 'Setter', group: 'g1', div: 'U15' }, { id: 'y', num: '2', name: 'Y', pos: 'Setter', group: 'g2', div: 'U15' }, { id: 'z', num: '3', name: 'Z', pos: 'Libero', group: 'g1', div: 'U17' }, { id: 'w', num: '4', name: 'W', pos: '', group: '', div: '' }];
R0.groups = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }];
const put = (by, pid, kid, sid, v) => { R0.scores[by + '|' + pid + '|' + kid + '|' + sid] = { id: Math.random() + '', v, t: 1 }; };
R0.scores = {};
put('e1', 'x', 'a', 'd1', 5); put('e1', 'x', 'b', 'd1', 4); put('e2', 'x', 'a', 'd1', 3); put('e2', 'x', 'b', 'd1', 4);
put('e1', 'y', 'a', 'd1', 2); put('e1', 'y', 'b', 'd1', 5);
put('e1', 'z', 'a', 'd1', 1); put('e2', 'z', 'a', 'd1', 5); put('e1', 'z', 'b', 'd1', 3);
put('e1', 'x', 'tv', 'd1', 50); put('e2', 'x', 'tv', 'd1', 55); put('e1', 'y', 'ts', 'd1', 6.1); put('e1', 'z', 'ts', 'd1', 5.9);
let RR = T.computeResults(R0, 'all'); const byId = id => RR.rows.find(r => r.p.id === id);
assert.equal(byId('x').skills.a.v, 4); assert.equal(byId('x').nEval, 2); ok('skill = average across evaluators');
// X: a=4 (80%), b=4 (80%) -> 80%. Y: a=2 (40), b=5 (100) weighted (40+200)/3 = 80. Z: a=3 (60), b=3 (60) -> 60
assert.equal(Math.round(byId('x').pct), 80); assert.equal(Math.round(byId('y').pct), 80); assert.equal(Math.round(byId('z').pct), 60); assert.equal(byId('w').pct, null); ok('overall uses skill weights');
assert.equal(byId('x').rank.all.at, 1); assert.equal(byId('y').rank.all.at, 1); assert.equal(byId('z').rank.all.at, 3); assert.equal(byId('w').rank, undefined); ok('ties share a rank; unscored not ranked');
assert.equal(byId('x').rank.pos.of, 2); assert.equal(byId('z').rank.pos.at, 1); assert.equal(byId('z').rank.grp.label, 'A'); assert.equal(byId('z').rank.grp.at, 2); assert.equal(byId('z').rank.div.of, 1); ok('ranks within position, group and division');
assert.deepEqual(byId('z').flagged, ['Serve']); assert.deepEqual(byId('x').flagged, ['Serve']); assert.deepEqual(byId('y').flagged, []); ok('disagreement flag: 2 or more apart on 1 to 5; one evaluator never flagged');
assert.equal(byId('x').tests.tv, 55); assert.equal(byId('z').testRank.ts.at, 1); assert.equal(byId('y').testRank.ts.at, 2); ok('tests: best result, ranked the right way');
// days
R0.sessions.push({ id: 'd2', name: 'Day 2' }); put('e1', 'y', 'a', 'd2', 4); put('e1', 'y', 'b', 'd2', 5);
R0.form.combine = 'avg'; RR = T.computeResults(R0, 'all'); assert.equal(byId('y').skills.a.v, 3); assert.deepEqual(byId('y').skills.a.days, [2, 4]); ok('average the days');
R0.form.combine = 'total'; RR = T.computeResults(R0, 'all'); assert.equal(byId('y').skills.a.v, 6); assert.equal(RR.skMax, 10); assert.equal(Math.round(byId('y').skills.a.pct), 60); assert.equal(Math.round(byId('x').skills.a.pct), 40); ok('add the days (out of 10 over 2 days)');
R0.form.combine = 'carry'; RR = T.computeResults(R0, 'all'); assert.equal(byId('y').skills.a.v, 4); assert.equal(byId('x').skills.a.v, 4); ok('carry forward uses the latest day scored');
RR = T.computeResults(R0, 'd2'); assert.equal(byId('x').pct, null); assert.equal(byId('y').skills.a.v, 4); ok('one day on its own');
// notes
R0.evaluators = { e1: 'Coach A' }; R0.notes = { ['e1|x|a|d1']: { id: 'n1', v: 'Good toss', t: 5 }, ['e1|x||d1']: { id: 'n2', v: 'Leader', t: 6 } }; R0.players[0].notes = 'Lefty';
const nn = T.notesFor(R0, 'x'); assert.equal(nn.length, 3); assert.equal(nn[0].text, 'Leader'); assert.equal(nn.find(n => n.text === 'Good toss').skill, 'Serve'); assert.equal(nn.find(n => n.text === 'Good toss').who, 'Coach A'); ok('notes feed: roster, overall and skill notes with evaluator and skill');
// scale conversion
const C0 = T.newEvent('Scale', 'volleyball'); T.ensureDays(C0); const ka = C0.form.skills[0].id; C0.scores = { ['e|p|' + ka + '|d1']: { id: '1', v: 4, t: 1 }, ['e|q|' + ka + '|d1']: { id: '2', v: 1, t: 1 }, ['e|r|' + ka + '|d1']: { id: '3', v: 5, t: 1 }, ['e|p|' + C0.form.tests[0].id + '|d1']: { id: '4', v: 60, t: 1 } };
assert.ok(T.hasSkillScores(C0)); let nconv = T.convertScale(C0, '5', '10'); assert.equal(nconv, 3);
assert.deepEqual([C0.scores['e|p|' + ka + '|d1'].v, C0.scores['e|q|' + ka + '|d1'].v, C0.scores['e|r|' + ka + '|d1'].v], [8, 1, 10]); assert.equal(C0.scores['e|p|' + C0.form.tests[0].id + '|d1'].v, 60); ok('1 to 5 into 1 to 10 keeps relative place (4 -> 8, 1 -> 1, 5 -> 10); tests untouched');
T.convertScale(C0, '10', 'pcm'); assert.deepEqual([C0.scores['e|p|' + ka + '|d1'].v, C0.scores['e|q|' + ka + '|d1'].v, C0.scores['e|r|' + ka + '|d1'].v], [3, 1, 3]); ok('1 to 10 into + / check / minus (8 of 10 rounds to +)');
T.convertScale(C0, 'pcm', '5'); assert.deepEqual([C0.scores['e|p|' + ka + '|d1'].v, C0.scores['e|q|' + ka + '|d1'].v, C0.scores['e|r|' + ka + '|d1'].v], [5, 1, 5]); ok('+ / check / minus into 1 to 5');
// score by skill
const hk2 = T.newEvent('Hk', 'hockey'); const ch = T.skillChoices(hk2);
assert.equal(ch.length, hk2.form.skills.length + hk2.form.alt.skills.length + hk2.form.tests.length); assert.ok(ch.some(([k, l]) => /\(goalies\)$/.test(l))); assert.ok(ch[ch.length - 1][0].test); ok('skill menu: skills, goalie skills, then tests');
const fwd = { pos: 'Forward' }, gk = { pos: 'Goalie' };
assert.ok(T.skillApplies(hk2, fwd, hk2.form.skills[0].id)); assert.ok(!T.skillApplies(hk2, gk, hk2.form.skills[0].id)); assert.ok(T.skillApplies(hk2, gk, hk2.form.alt.skills[0].id)); assert.ok(!T.skillApplies(hk2, fwd, hk2.form.alt.skills[0].id)); assert.ok(T.skillApplies(hk2, gk, hk2.form.tests[0].id)); ok('goalie skills only list goalies; tests list everyone');
// custom scales
assert.equal(T.scaleValues({ scale: '7' }).length, 7); assert.ok(!T.useSlider({ scale: '10' })); assert.ok(T.useSlider({ scale: '100' })); assert.ok(!T.useSlider({ scale: 'pcm' })); ok('up to 10 choices are buttons; more gets the slider');
assert.equal(T.scaleLo({ scale: '100', scaleMin: 0 }), 0); assert.equal(T.scaleHi({ scale: '100', scaleMin: 0 }), 100); assert.equal(T.scaleLabel({ scale: '50' }), '1 to 50'); assert.equal(T.scaleLabel({ scale: '100', scaleMin: 0 }), '0 to 100'); ok('custom scale range and label');
const C1 = T.newEvent('Custom', 'volleyball'); T.ensureDays(C1); const kb = C1.form.skills[0].id; C1.scores = { ['e|p|' + kb + '|d1']: { id: '1', v: 4, t: 1 }, ['e|q|' + kb + '|d1']: { id: '2', v: 1, t: 1 } };
T.convertScale(C1, '5', '100', 1, 0); assert.deepEqual([C1.scores['e|p|' + kb + '|d1'].v, C1.scores['e|q|' + kb + '|d1'].v], [75, 0]); ok('1 to 5 into 0 to 100 (4 -> 75, 1 -> 0)');
T.convertScale(C1, '100', '5', 0, 1); assert.deepEqual([C1.scores['e|p|' + kb + '|d1'].v, C1.scores['e|q|' + kb + '|d1'].v], [4, 1]); ok('and back to 1 to 5');
C1.form.scale = '100'; C1.form.scaleMin = 0; C1.players = [{ id: 'p', num: '1', name: 'P' }]; C1.scores = { ['e|p|' + kb + '|d1']: { id: '1', v: 73, t: 1 } };
let CR = T.computeResults(C1, 'all'); assert.equal(Math.round(CR.rows[0].pct), 73); assert.equal(CR.skMax, 100); ok('results on a 0 to 100 scale');
// PDF
const rep = { title: 'U15 tryouts · results', subtitle: 'Volleyball', landscape: true, blocks: [{ kv: [['Overall', '4.2 out of 5']] }, { h: 'Skills' }, { table: { head: ['#', 'Name', 'Score'], align: ['r', 'l', 'r'], line: 2, rows: Array.from({ length: 90 }, (_, i) => [String(i + 1), 'Player (' + i + ') ✓ − ⚑ ½ é', '4.5']) } }, { p: 'A long note '.repeat(40) }] };
const pdf = T.makePdf(rep); const txt = Array.from(pdf, b => String.fromCharCode(b)).join('');
assert.ok(txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF')); ok('PDF has a header and end marker');
const xr = +txt.match(/startxref\n(\d+)/)[1]; assert.equal(txt.slice(xr, xr + 4), 'xref');
const offs = txt.slice(xr).split('\n').slice(3).filter(l => / 00000 n $/.test(l)).map(l => +l.slice(0, 10)); offs.forEach((o, i) => assert.ok(txt.slice(o).startsWith((i + 1) + ' 0 obj'), 'obj ' + (i + 1))); ok('PDF cross-reference table points at every object');
assert.ok(/\/Count [3-9]/.test(txt)); ok('90 rows spill onto more pages');
assert.equal(T.pdfText('ok ✓ − ⚑'), 'ok ok - (!)'); assert.ok(!/[^\x00-\xff]/.test(txt)); ok('text made safe for the PDF font');
assert.ok(T.wrapText('word '.repeat(60), 10, 200).length > 3); ok('long text wraps');
// several phones: queue and merge
{
  const E = { id: 'esync1', form: T.formFromSport('volleyball'), players: [{ id: 'p1', num: '1', name: 'A', notes: 'private' }], groups: [], sessions: [{ id: 'd1', name: 'Day 1' }], scores: {}, notes: {}, join: { vid: 'vme', tok: 't', name: 'Me', since: 0 } };
  const k = E.form.skills[0].id;
  assert.equal(T.myId(E), 'vme'); T.setScore(E, 'p1', k, 'd1', 4); T.setNote(E, 'p1', '', 'd1', 'good');
  const q = T.queued(E, 400); assert.equal(q.length, 2); assert.equal(T.waitingCount(E), 2);
  assert.deepEqual(q.map(r => [r.k, r.by, r.p, r.d]).sort(), [['n', 'vme', 'p1', 'd1'], ['s', 'vme', 'p1', 'd1']]); assert.equal(q.find(r => r.k === 'n').s, ''); ok('scores and notes wait in the queue with the evaluator id');
  E.scores['other|p1|' + k + '|d1'] = { id: 'zz11', v: 2, t: 1, q: 1 }; assert.equal(T.queued(E, 400).length, 2); ok('only this phone\'s own records are sent');
  const mine = E.scores['vme|p1|' + k + '|d1'];
  T.mergeRecs(E, [{ id: 'old1', k: 's', by: 'vme', p: 'p1', s: k, d: 'd1', v: 1, t: mine.t - 5000 }]); assert.equal(E.scores['vme|p1|' + k + '|d1'].v, 4); ok('an older record does not overwrite a newer one');
  T.mergeRecs(E, [{ id: mine.id, k: 's', by: 'vme', p: 'p1', s: k, d: 'd1', v: 4, t: mine.t }]); assert.ok(!E.scores['vme|p1|' + k + '|d1'].q); ok('the server echo clears the waiting mark');
  const n = T.mergeRecs(E, [{ id: 'new1', k: 's', by: 'v2', p: 'p1', s: k, d: 'd1', v: 5, t: Date.now() + 1000 }, { id: 'nn1', k: 'n', by: 'v2', p: 'p1', s: '', d: 'd1', v: 'quick', t: 5 }]);
  assert.equal(n, 2); assert.equal(E.scores['v2|p1|' + k + '|d1'].v, 5); assert.equal(E.notes['v2|p1||d1'].v, 'quick'); ok('other evaluators\' scores and overall notes merge in');
  T.mergeRecs(E, [{ id: 'aaa1', k: 's', by: 'v3', p: 'p1', s: k, d: 'd1', v: 2, t: 9 }, { id: 'bbb1', k: 's', by: 'v3', p: 'p1', s: k, d: 'd1', v: 3, t: 9 }]); assert.equal(E.scores['v3|p1|' + k + '|d1'].v, 3); ok('same time: the higher id wins on every phone');
  const P = T.payloadOf(E); assert.equal(P.players[0].notes, undefined); assert.equal(P.players[0].name, 'A'); ok('evaluators never get private player notes');
  assert.ok(T.isShared(E)); assert.ok(!T.isShared({})); ok('shared or not');
}
// check-in, evaluator groups, demo
{
  const E = { id: 'eck1', form: T.formFromSport('volleyball'), groups: [{ id: 'ga', name: 'A' }, { id: 'gb', name: 'B' }], sessions: [{ id: 'd1', name: 'Day 1' }, { id: 'd2', name: 'Day 2' }],
    players: [{ id: 'p1', num: '1', group: 'ga' }, { id: 'p2', num: '2', group: 'ga', present: false }, { id: 'p3', num: '3', group: 'gb' }], scores: {}, notes: {} };
  let ci = T.checkinFor(E, 'd2'); assert.ok(ci.used && !ci.isHere(E.players[1]) && ci.isHere(E.players[0])); assert.equal(E.players[1].present, undefined); ok('old "not here" switch becomes the latest day\'s check-in');
  ci = T.checkinFor(E, 'd1'); assert.ok(!ci.used && ci.isHere(E.players[1])); ok('a day with no check-ins counts everyone as here');
  T.setHere(E, 'p3', 'd1', true); ci = T.checkinFor(E, 'd1'); assert.ok(ci.used && ci.isHere(E.players[2]) && !ci.isHere(E.players[0])); assert.equal(ci.count, 1); ok('first check-in of a day turns check-in on for that day');
  const k = Object.keys(E.checks).find(x => x.includes('|p3||d1')); assert.equal(E.checks[k].q, 1); ok('check-ins wait to be sent like scores');
  T.mergeRecs(E, [{ id: 'cc99', k: 'c', by: 'vhelp', p: 'p1', s: '', d: 'd1', v: 1, t: Date.now() + 5000 }]); assert.ok(T.checkinFor(E, 'd1').isHere(E.players[0])); ok('a helper\'s check-in merges in');
  T.mergeRecs(E, [{ id: 'cc98', k: 'c', by: 'vhelp2', p: 'p1', s: '', d: 'd1', v: 0, t: Date.now() + 9000 }]); assert.ok(!T.checkinFor(E, 'd1').isHere(E.players[0])); ok('newest check-in wins, whoever made it');
  const M = T.checkMapOf(E); assert.deepEqual(Object.keys(M).sort(), ['d1', 'd2']); assert.equal(M.d1.p1[0], 0); assert.equal(M.d1.p3[0], 1); ok('combined check-in list for evaluators');
  const EV = { id: 'eck2', form: E.form, groups: E.groups, sessions: E.sessions, players: E.players.map(p => ({ id: p.id, num: p.num, group: p.group })), scores: {}, notes: {}, checks: {}, join: { vid: 'vme' }, assign: { vme: ['gb'] }, helpers: [], checkMap: M };
  assert.deepEqual(T.groupPlayers(EV, 'all').map(p => p.id), ['p3']); assert.deepEqual(T.myGroups(EV), ['gb']); ok('an evaluator given Group B sees only Group B');
  EV.assign = {}; assert.equal(T.groupPlayers(EV, 'all').length, 3); ok('no groups given: everyone');
  assert.ok(!T.checkinFor(EV, 'd1').isHere(EV.players[0]) && T.checkinFor(EV, 'd1').isHere(EV.players[2])); ok('evaluators see the organizer\'s check-in list');
  assert.ok(!T.canCheckIn(EV)); EV.helpers = ['vme']; assert.ok(T.canCheckIn(EV)); ok('only allowed evaluators can check in');
  E.share = { assign: { v1: ['ga'] }, helpers: ['v1'] }; const P = T.payloadOf(E); assert.deepEqual(P.helpers, ['v1']); assert.deepEqual(P.assign, { v1: ['ga'] }); assert.ok(P.checks.d1); ok('event copy carries groups per evaluator, helpers and check-in');
  const before = T.S.events.length, D = T.makeDemo(); assert.equal(T.S.events.length, before + 1); assert.ok(D.demo);
  const R = T.computeResults(D, 'all'); assert.equal(R.rows.filter(r => r.pct != null).length, 15); assert.ok(R.rows.some(r => r.nEval === 3)); assert.ok(Object.keys(D.evaluators).length === 3);
  assert.ok(!T.checkinFor(D, D.sessions[0].id).isHere(D.players[15])); ok('demo event: 16 players, 15 scored by up to 3 coaches, one not checked in');
  T.S.events = T.S.events.filter(x => x !== D);
}
// several organizers, decisions, guides
{
  const base = { name: 'A', form: { x: 1 }, line: 3, assign: {}, helpers: [], players: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }, { id: 'p3', name: 'Three' }], groups: [{ id: 'g1', name: 'G' }], sessions: [{ id: 'd1' }], names: { o1: 'Owner' } };
  const mine = JSON.parse(JSON.stringify(base)); mine.players[0].name = 'One (mine)'; mine.players.push({ id: 'p4', name: 'Four' }); mine.players = mine.players.filter(p => p.id !== 'p3'); mine.line = 5;
  const theirs = JSON.parse(JSON.stringify(base)); theirs.players[1].name = 'Two (theirs)'; theirs.players.push({ id: 'p5', name: 'Five' }); theirs.name = 'B'; theirs.names = { o2: 'Coach Two' };
  const m = T.mergeOrgCopy(base, mine, theirs);
  assert.deepEqual(m.players.map(p => p.name).sort(), ['Five', 'Four', 'One (mine)', 'Two (theirs)']); ok('two organizers edit players at once: both changes kept, a delete sticks');
  assert.equal(m.name, 'B'); assert.equal(m.line, 5); assert.deepEqual(m.names, { o1: 'Owner', o2: 'Coach Two' }); ok('other parts: whoever changed it wins; names are joined');
  const E = T.newEvent('Dec', 'volleyball'); E.players = [{ id: 'a1', num: '1' }, { id: 'a2', num: '2' }];
  assert.equal(T.outcomesOf(E).length, 3); T.setDecision(E, 'a1', 'made'); assert.equal(T.decisionsOf(E).get('a1'), 'made');
  E.decs['other|a1||all'] = { id: 'zz', v: 'cut', t: Date.now() + 1000 }; assert.equal(T.decisionsOf(E).get('a1'), 'cut'); ok('newest decision wins, whichever organizer made it');
  T.setDecision(E, 'a1', null); assert.equal(T.decisionsOf(E).get('a1'), 'cut'); E.decs['other|a1||all'].t = 1; assert.ok(!T.decisionsOf(E).has('a1')); ok('clearing a decision');
  T.setDecision(E, 'a2', 'wait'); E.form.outcomes = [{ id: 'made', name: 'Made team' }, { id: 'cut', name: 'Not selected' }]; assert.ok(!T.decisionsOf(E).has('a2')); ok('a removed choice no longer counts');
  T.setDecision(E, 'a1', 'made'); const R = T.decisionsReport(E); assert.equal(R.blocks[0].h, 'Made team (1)'); assert.ok(!JSON.stringify(R).includes('%')); ok('decision PDF: names per outcome, no scores');
  assert.ok(T.decisionsCsv(E).includes('Made team')); ok('decision spreadsheet');
  const k = E.form.skills.find(x => x.name === 'Serving'), kb = E.form.skills.find(x => x.name === 'Blocking');
  assert.equal(T.guideText(E.form, k, 1), 'Misses most serves'); assert.equal(T.guideText(E.form, kb, 5), 'Standout: among the best here'); ok('new volleyball event has sample guides: skill and general');
  E.form.scale = '10'; assert.equal(T.guideText(E.form, k, 1), ''); ok('a guide never shows on a scale it was not written for');
  E.form.scale = '100'; assert.ok(!T.hasGuide(E.form, k)); E.form.scale = '5'; E.form.showGuides = false; assert.equal(T.guideText(E.form, k, 1), ''); ok('no guides on slider scales or when switched off');
  const H = T.newEvent('Hockey', 'hockey'); assert.ok(T.guideText(H.form, H.form.skills[0], 3)); ok('other sports start with sample guides too');
  const O = { share: { oid: 'oabc', tok: 'ff' } }; assert.deepEqual(T.authOf(O), { 'X-Org': 'oabc.ff' }); assert.deepEqual(T.authOf({ share: { key: 'k' } }), { 'X-Key': 'k' }); ok('owner and other organizers sign in differently');
  E.share = { assign: {}, helpers: [] }; E.orgNames = { me1: 'Jeff' }; E.players[0].notes = 'private'; const OP = T.orgPayloadOf(E); assert.equal(OP.players[0].notes, 'private'); assert.deepEqual(OP.names, { me1: 'Jeff' }); assert.equal(T.payloadOf(E).players[0].notes, undefined); ok('organizers get private notes, evaluators never');
  T.S.events = T.S.events.filter(x => x !== E && x !== H);
}
require_fs: { const fs = await import('node:fs'); fs.writeFileSync('/tmp/rp-test.pdf', pdf); }
console.log('ALL', n, 'UNIT TESTS PASSED');
