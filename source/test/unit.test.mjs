// Unit tests: sport templates and roster import, run in Node with small stand-ins for the browser.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert';  // loose deepEqual: arrays made inside the vm have a different prototype

const src = ['sports.js', 'store.js'].map(f => readFileSync(new URL('../src/js/' + f, import.meta.url), 'utf8')).join('\n');
const mem = {};
const ctx = { console, JSON, Date, Math, Map, Set, String, Object, Array, parseInt, setTimeout, clearTimeout,
  localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } },
  window: { addEventListener() { } }, document: { addEventListener() { }, hidden: false }, toast() { } };
vm.createContext(ctx);
vm.runInContext(src + '\n;globalThis.__t = { SPORTS, sportById, wordsOf, formFromSport, copyForm, parseRoster, duplicateNumbers, sortPlayers, newEvent, S, exportData, importData, save };', ctx);
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
console.log('ALL', n, 'UNIT TESTS PASSED');
