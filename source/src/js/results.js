/* =====================================================================
   Results (stage 3): combine scores into one number per skill and an overall for each player,
   rank them, flag disagreement, and gather notes. Works the same for one phone or many evaluators.

   Per skill, per evaluator: combine that evaluator's days with the event's day rule
     avg = average of the days scored, total = sum of the days, carry = the latest day scored.
   Per skill: average across evaluators.
   Overall: weighted average of the skills (as a percent of the best possible), shown on the scale too.
   Tests: each evaluator's days combined the same way except total (uses best); across evaluators the best result.
   Disagreement: two or more evaluators whose numbers for a skill are 40% of the scale range or more apart.
   ===================================================================== */
const scaleMax = sc => sc === 'pcm' ? 3 : (parseInt(sc, 10) || 5);
const r1 = x => Math.round(x * 10) / 10;
function allSkills(ev) { const f = ev.form; return f.alt ? f.skills.concat(f.alt.skills) : f.skills.slice(); }
function evaluatorsOf(ev) { const set = new Set(); for (const k in ev.scores || {}) if (ev.scores[k] && ev.scores[k].v != null) set.add(k.split('|')[0]); return [...set]; }
const evalName = (ev, by) => (ev.evaluators && ev.evaluators[by]) || (S.settings.me && S.settings.me.id === by ? S.settings.me.name : '') || 'Evaluator';

/* values[by][dayIndex] for one player and one skill/test */
function valuesBy(ev, pid, kid, dayIds) {
  const out = {};
  for (const by of evaluatorsOf(ev)) {
    const arr = dayIds.map(sid => getScore(ev, pid, kid, sid, by));
    if (arr.some(v => v != null)) out[by] = arr;
  }
  return out;
}
function combineDays(arr, rule) {
  const got = arr.filter(v => v != null); if (!got.length) return null;
  if (rule === 'total') return got.reduce((a, b) => a + b, 0);
  if (rule === 'carry') { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; }
  return got.reduce((a, b) => a + b, 0) / got.length;
}
const better = (t, a, b) => a == null ? b : b == null ? a : (t.better === 'low' ? Math.min(a, b) : Math.max(a, b));

/* day: 'all' for the combined result, or one day id */
function computeResults(ev, day) {
  ensureDays(ev);
  const f = ev.form, mx = scaleHi(f), dayIds = day && day !== 'all' ? [day] : ev.sessions.map(d => d.id);
  const rule = dayIds.length > 1 ? (f.combine || 'avg') : 'avg';
  const skMax = rule === 'total' ? mx * dayIds.length : mx;
  const spreadFlag = f.scale === 'pcm' ? 2 : (mx - scaleLo(f)) * 0.4;   // 1 to 5: 2 apart; 1 to 10: 4 apart; + / ✓ / −: + against −
  const rows = ev.players.map(p => {
    const ks = skillsFor(ev, p), skills = {}, tests = {}, evs = new Set();
    let wsum = 0, wpct = 0, flagged = [];
    for (const k of ks) {
      const vb = valuesBy(ev, p.id, k.id, dayIds), per = [];
      for (const by in vb) { const c = combineDays(vb[by], rule); if (c != null) { per.push(c); evs.add(by); } }
      if (!per.length) { skills[k.id] = null; continue; }
      const v = per.reduce((a, b) => a + b, 0) / per.length;
      const spread = per.length > 1 ? (Math.max(...per) - Math.min(...per)) / (rule === 'total' ? dayIds.length : 1) : 0;
      skills[k.id] = { v, pct: v / skMax * 100, n: per.length, spread, days: dayIds.length > 1 ? dayIds.map((sid, i) => { const d = Object.values(vb).map(a => a[i]).filter(x => x != null); return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null; }) : null };
      if (per.length > 1 && spread >= spreadFlag) flagged.push(k.name);
      const w = k.w == null ? 1 : k.w; wsum += w; wpct += w * skills[k.id].pct;
    }
    for (const t of f.tests) {
      const vb = valuesBy(ev, p.id, t.id, dayIds); let best = null;
      for (const by in vb) { evs.add(by); const arr = vb[by]; let c; if (rule === 'carry') c = combineDays(arr, 'carry'); else if (rule === 'total') c = arr.reduce((a, b) => better(t, a, b), null); else c = combineDays(arr, 'avg'); best = better(t, best, c); }
      tests[t.id] = best == null ? null : Math.round(best * 1000) / 1000;
    }
    const pct = wsum ? wpct / wsum : null;
    return { p, skills, tests, pct, overall: pct == null ? null : pct / 100 * skMax, nEval: evs.size, flagged, scored: ks.filter(k => skills[k.id]).length, of: ks.length };
  });
  /* ranks: overall, and within position, group, division (only players with an overall) */
  const ranked = rows.filter(r => r.pct != null).sort((a, b) => b.pct - a.pct);
  const rankIn = (list, key) => { const groups = {}; for (const r of list) { const g = key(r); if (!g) continue; (groups[g] = groups[g] || []).push(r); } for (const g in groups) groups[g].forEach((r, i, a) => { r.rank = r.rank || {}; r.rank[key.name] = { at: tieRank(a, i), of: a.length, label: g }; }); };
  const tieRank = (a, i) => { let j = i; while (j > 0 && Math.abs(a[j - 1].pct - a[i].pct) < 1e-9) j--; return j + 1; };
  ranked.forEach((r, i, a) => { r.rank = { all: { at: tieRank(a, i), of: a.length } }; });
  const groupName = r => { const g = ev.groups.find(x => x.id === r.p.group); return g ? g.name : ''; };
  rankIn(ranked, function pos(r) { return r.p.pos; }); rankIn(ranked, function grp(r) { return groupName(r); }); rankIn(ranked, function div(r) { return r.p.div; });
  /* test ranks */
  for (const t of f.tests) { const have = rows.filter(r => r.tests[t.id] != null).sort((a, b) => t.better === 'low' ? a.tests[t.id] - b.tests[t.id] : b.tests[t.id] - a.tests[t.id]); have.forEach((r, i) => { r.testRank = r.testRank || {}; r.testRank[t.id] = { at: i + 1, of: have.length }; }); }
  return { rows, mx, skMax, rule, dayIds };
}

/* every note for a player: roster note, overall notes and skill notes, newest first */
/* the coaches' notes on one skill for one player (newest first) */
function skillNotes(ev, pid, kid, dayIds) {
  const out = [];
  for (const key in ev.notes || {}) {
    const [by, p2, k2, sid] = key.split('|'), r = ev.notes[key];
    if (p2 === pid && k2 === kid && r && r.v && (!dayIds || dayIds.includes(sid))) out.push({ by, sid, text: r.v, t: r.t || 0 });
  }
  return out.sort((a, b) => b.t - a.t);
}
/* tap a skill on the player card: every coach's score (by day) and their notes on it */
function skillDetailSheet(ev, p, k, dayIds) {
  const f = ev.form, fv = v => v == null ? '–' : f.scale === 'pcm' ? pcmLabel(v) : fmtV(v);
  const vb = valuesBy(ev, p.id, k.id, dayIds), notes = skillNotes(ev, p.id, k.id, dayIds);
  const rule = dayIds.length > 1 ? (f.combine || 'avg') : 'avg', days = ev.sessions.filter(d => dayIds.includes(d.id));
  const who = [...new Set(Object.keys(vb).concat(notes.map(n => n.by)))];
  const comb = by => vb[by] ? combineDays(vb[by], rule) : null;
  who.sort((a, b) => (comb(b) == null ? -1 : comb(b)) - (comb(a) == null ? -1 : comb(a)) || evalName(ev, a).localeCompare(evalName(ev, b)));
  const vals = who.map(comb).filter(v => v != null), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  openSheet((s, api) => s.append(
    h('h2', null, k.name), h('div', { class: 'pmeta', style: 'margin:-6px 0 12px' }, '#' + (p.num || '–') + ' ' + (p.name || '') + ' · ' + (avg == null ? 'not scored' : 'average ' + fv(avg) + (f.scale === 'pcm' ? '' : ' of ' + scaleHi(f)) + ' from ' + plural(vals.length, 'coach', 'coaches'))),
    who.length ? h('div', { class: 'list', style: 'gap:8px' }, who.map(by => {
      const arr = vb[by] || [], mine = notes.filter(n => n.by === by), c = comb(by), g = c != null && Number.isInteger(c) ? guideText(f, k, c) : '';
      return h('div', { class: 'cdrow' },
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, evalName(ev, by)),
            days.length > 1 ? h('div', { class: 'pmeta' }, days.map((d, i) => d.name + ': ' + fv(arr[i])).join(' · ')) : null,
            g ? h('div', { class: 'pmeta' }, g) : null),
          h('b', { class: 'cdv' }, fv(c))),
        mine.map(n => h('div', { class: 'cdnote' }, icon('note', 14), h('div', null, n.text, days.length > 1 ? h('span', { class: 'pmeta' }, ' · ' + ((ev.sessions.find(d => d.id === n.sid) || {}).name || '')) : null))));
    })) : h('p', { class: 'note' }, 'No coach has scored ' + k.name.toLowerCase() + ' for this ' + W.player + ' yet.'),
    h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => api.close() }, 'Done'))));
}
function notesFor(ev, pid) {
  const out = [], names = Object.fromEntries(allSkills(ev).concat(ev.form.tests).map(k => [k.id, k.name]));
  const p = ev.players.find(x => x.id === pid);
  if (p && p.notes) out.push({ who: 'Roster', text: p.notes, t: 0 });
  for (const key in ev.notes || {}) {
    const [by, p2, kid, sid] = key.split('|'), r = ev.notes[key];
    if (p2 !== pid || !r || !r.v) continue;
    const day = ev.sessions.length > 1 ? (ev.sessions.find(d => d.id === sid) || {}).name : null;
    out.push({ who: evalName(ev, by), day, skill: kid ? names[kid] || 'Removed skill' : null, text: r.v, t: r.t || 0 });
  }
  return out.sort((a, b) => b.t - a.t);
}

/* ---------- convert scores when the scale changes (keeps each score's relative place) ---------- */
function convertScale(ev, from, to, fromLo = 1, toLo = 1) {
  const a = scaleMax(from), b = scaleMax(to), ids = new Set(allSkills(ev).map(k => k.id)); let n = 0;
  if (from === 'pcm') fromLo = 1; if (to === 'pcm') toLo = 1;
  for (const key in ev.scores || {}) {
    const r = ev.scores[key]; if (!r || r.v == null || !ids.has(key.split('|')[2])) continue;
    const v = Math.min(Math.max(r.v, fromLo), a), nv = Math.round(toLo + (v - fromLo) * (b - toLo) / (a - fromLo));
    ev.scores[key] = { id: uid('r'), v: Math.min(Math.max(nv, toLo), b), t: Date.now() }; n++;
  }
  return n;
}
function hasSkillScores(ev) { const ids = new Set(allSkills(ev).map(k => k.id)); for (const key in ev.scores || {}) { const r = ev.scores[key]; if (r && r.v != null && ids.has(key.split('|')[2])) return true; } return false; }

/* =====================================================================
   Results tab: rankings list, sortable, with filters, a day view and the team line.
   ===================================================================== */
const RS = { sort: 'overall', day: 'all', group: '', pos: '', div: '' };
const NONE = '__none__';   // the 'No position' (or group, division) choice
let RS_EV = null;           // filters reset when a different event is opened
const fmtV = (v, d = 1) => v == null ? '–' : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString();
const pcmLabel = v => v == null ? '–' : v >= 2.5 ? '+' : v >= 1.5 ? '✓' : '−';
function resultRows(ev) {
  if (RS_EV !== ev.id) { RS_EV = ev.id; RS.group = RS.pos = RS.div = ''; RS.day = 'all'; RS.sort = 'overall'; }
  if (RS.day !== 'all' && !ev.sessions.some(d => d.id === RS.day)) RS.day = 'all';
  const res = computeResults(ev, RS.day), f = ev.form;
  const gname = id => (ev.groups.find(g => g.id === id) || {}).name || '';
  const hasG = id => ev.groups.some(g => g.id === id);
  const okG = r => !RS.group || (RS.group === NONE ? !hasG(r.p.group) : r.p.group === RS.group);
  const okP = r => !RS.pos || (RS.pos === NONE ? !r.p.pos : r.p.pos === RS.pos);
  const okD = r => !RS.div || (RS.div === NONE ? !r.p.div : r.p.div === RS.div);
  if (RS.group && RS.group !== NONE && !hasG(RS.group)) RS.group = '';
  if (RS.pos && RS.pos !== NONE && !f.positions.includes(RS.pos)) RS.pos = '';
  if (RS.div && RS.div !== NONE && !f.divisions.includes(RS.div)) RS.div = '';
  let rows = res.rows.filter(r => okG(r) && okP(r) && okD(r));
  const test = f.tests.find(t => t.id === RS.sort), sk = allSkills(ev).find(k => k.id === RS.sort);
  if (!test && !sk) RS.sort = 'overall';
  const val = r => RS.sort === 'overall' ? r.pct : test ? r.tests[test.id] : (r.skills[sk.id] ? r.skills[sk.id].v : null);
  rows.sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return (parseInt(a.p.num, 10) || 999) - (parseInt(b.p.num, 10) || 999); if (x == null) return 1; if (y == null) return -1; return test && test.better === 'low' ? x - y : y - x; });
  return { res, rows, val, test, sk, gname };
}
function resultsTab(ev) {
  ensureDays(ev);
  const f = ev.form, { res, rows, val, test, sk, gname } = resultRows(ev);
  const scored = rows.filter(r => val(r) != null), line = Math.max(0, Math.min(ev.line || 0, scored.length)), dec = decisionsOf(ev);
  const sel = (label, value, opts, set, noBlank) => {
    const el = h('select', { class: 'inp' + (value && !noBlank ? ' on' : ''), 'aria-label': label, onchange: e => { set(e.target.value); render(); } }, (noBlank ? [] : [['', label]]).concat(opts).map(([k, l]) => h('option', { value: k, selected: value === k }, l)));
    el.value = value || (noBlank ? opts[0][0] : ''); return el;   // always show the filter that is really on
  };
  const sortOpts = [['overall', 'Overall']].concat(allSkills(ev).map(k => [k.id, k.name]), f.tests.map(t => [t.id, t.name + (t.unit ? ' (' + t.unit + ')' : '')]));
  const showVal = r => {
    const v = val(r);
    if (RS.sort === 'overall') return v == null ? null : [h('b', null, fmtV(r.overall)), h('span', null, Math.round(r.pct) + '%')];
    if (test) return v == null ? null : [h('b', null, fmtV(v, 2)), h('span', null, test.unit || '')];
    return v == null ? null : [h('b', null, f.scale === 'pcm' ? pcmLabel(v) : fmtV(v)), h('span', null, f.scale === 'pcm' ? '' : 'of ' + res.skMax)];
  };
  const list = [];
  rows.forEach((r, i) => {
    const v = val(r);
    list.push(h('button', { class: 'rrow' + (v == null ? ' none' : ''), onclick: () => go('r', ev.id, r.p.id) },
      h('span', { class: 'rk' }, v == null ? '' : i + 1),
      h('span', { class: 'jn' }, r.p.num || '–'),
      h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, r.p.name || 'No name', r.flagged.length ? h('span', { class: 'flag', title: 'Evaluators disagree' }, ' ⚑') : null),
        h('div', { class: 'pmeta ellip' }, [r.p.pos, gname(r.p.group), r.p.div, r.nEval > 1 ? r.nEval + ' evaluators' : null].filter(Boolean).join(' · ') || ' '), decisionBadge(ev, r.p.id, dec)),
      h('div', { class: 'rv' }, showVal(r) || h('span', null, 'not scored'))));
    if (line && i === line - 1 && scored.length > line) list.push(h('div', { class: 'tline' }, h('span', null, 'Team line · ' + line + ' spots')));
  });
  return [
    lockedBanner(ev),
    tip('results', 'Sort by overall or any skill, filter by ' + W.position + ' or group, and move the team line with − and +. Tap a ' + W.player + ' for their full card. Save as PDF makes a file you can print or email.'),
    h('div', { class: 'rfilters' },
      h('div', { class: 'row' }, h('span', { class: 'lbl', style: 'min-width:54px' }, 'Sort'), h('div', { class: 'grow' }, sel('Sort by', RS.sort, sortOpts, v => { RS.sort = v || 'overall'; }, true))),
      ev.sessions.length > 1 ? h('div', { class: 'seg' }, [['all', 'All days']].concat(ev.sessions.map(d => [d.id, d.name])).map(([k, l]) => h('button', { class: RS.day === k ? 'on' : '', onclick: () => { RS.day = k; render(); } }, l))) : null,
      h('div', { class: 'row', style: 'gap:8px' },
        ev.groups.length ? h('div', { class: 'grow' }, sel('All groups', RS.group, ev.groups.map(g => [g.id, g.name]).concat(ev.players.some(p => !ev.groups.some(g => g.id === p.group)) ? [[NONE, 'No group']] : []), v => { RS.group = v; })) : null,
        f.positions.length ? h('div', { class: 'grow' }, sel('All ' + W.positions, RS.pos, f.positions.map(x => [x, x]).concat(ev.players.some(p => !p.pos) ? [[NONE, 'No ' + W.position]] : []), v => { RS.pos = v; })) : null,
        f.divisions.length ? h('div', { class: 'grow' }, sel('All divisions', RS.div, f.divisions.map(x => [x, x]).concat(ev.players.some(p => !p.div) ? [[NONE, 'No division']] : []), v => { RS.div = v; })) : null),
      RS.group || RS.pos || RS.div ? h('button', { class: 'btn sm ghost', onclick: () => { RS.group = RS.pos = RS.div = ''; render(); } }, 'Show everyone') : null),
    h('div', { class: 'row', style: 'margin:12px 0 4px' },
      h('span', { class: 'lbl' }, 'Team line'),
      h('button', { class: 'mini', 'aria-label': 'Fewer spots', onclick: () => { ev.line = Math.max(0, (ev.line || 0) - 1); touch(ev); render(); } }, '−'),
      h('b', { class: 'num', style: 'min-width:28px;text-align:center' }, ev.line ? ev.line : 'off'),
      h('button', { class: 'mini', 'aria-label': 'More spots', onclick: () => { ev.line = (ev.line || 0) + 1; touch(ev); render(); } }, icon('plus')),
      h('span', { class: 'grow' }), h('span', { class: 'cnt' }, scored.length + ' of ' + rows.length + ' scored')),
    h('button', { class: 'btn block', style: 'margin:8px 0 2px', onclick: () => go('x', ev.id) }, icon('crown'), 'Team decisions', dec.size ? h('span', { class: 'cnt', style: 'margin-left:6px' }, dec.size + ' decided') : null),
    res.rule !== 'avg' && RS.day === 'all' ? h('p', { class: 'note' }, res.rule === 'total' ? 'Days are added together (Form tab).' : 'Each skill uses its latest score (carry forward).') : null,
    h('div', { class: 'list', style: 'gap:6px;margin-top:8px' }, list.length ? list : h('div', { class: 'empty' }, 'No ' + W.players + ' match.')),
    h('p', { class: 'note', style: 'margin-top:10px' }, '⚑ = evaluators disagree a lot on a skill. Tap a ' + W.player + ' for the full card.'),
    sect('More'),
    h('div', { class: 'toprow' },
      h('button', { class: 'btn', onclick: () => compareSheet(ev) }, icon('users'), 'Compare'),
      h('button', { class: 'btn', onclick: () => go('m', ev.id) }, icon('history'), 'Missing scores')),
    h('div', { class: 'toprow', style: 'margin-top:8px' },
      h('button', { class: 'btn', onclick: () => go('rg', ev.id) }, icon('stats'), 'Results grid'),
      h('button', { class: 'btn', onclick: () => go('cc', ev.id) }, icon('users'), 'Coach comparison')),
    sect('Share'),
    h('div', { class: 'toprow' },
      h('button', { class: 'btn', onclick: () => saveFile('RosterPulse-' + fileSafe(ev.name) + '-results.csv', resultsCsv(ev), 'text/csv') }, icon('dl'), 'Spreadsheet'),
      h('button', { class: 'btn', onclick: () => go('p', ev.id, 'results') }, icon('file'), 'Save as PDF')),
    h('p', { class: 'note', style: 'margin-top:8px' }, 'Results are for you only. Ratings are never shown to ' + W.players + ' or parents unless you share them.')
  ];
}
const fileSafe = s => String(s || 'event').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'event';

/* ---------------- the player card (report card) ---------------- */
function viewPlayerCard(evId, pid) {
  const ev = eventById(evId); if (!ev) return viewHome();
  ensureDays(ev); W = wordsOf(ev);
  const { res, rows } = resultRows(ev), r = res.rows.find(x => x.p.id === pid);
  if (!r) return viewEvent(evId, 'players');
  const f = ev.form, p = r.p, ks = skillsFor(ev, p), mx = res.skMax;
  const scoredKs = ks.filter(k => r.skills[k.id]).sort((a, b) => r.skills[b.id].pct - r.skills[a.id].pct);
  const strong = scoredKs.length >= 3 ? scoredKs.slice(0, 2).map(k => k.id) : [], weak = scoredKs.length >= 3 ? scoredKs.slice(-2).map(k => k.id) : [];
  const i = rows.findIndex(x => x.p.id === pid), prev = rows[i - 1], next = rows[i + 1];
  const chip = (label, rk) => rk ? h('div', { class: 'rchip' }, h('b', null, '#' + rk.at), h('span', null, 'of ' + rk.of + ' ' + label)) : null;
  const gname = (ev.groups.find(g => g.id === p.group) || {}).name;
  const notes = notesFor(ev, pid);
  const summary = scoringSummary(ev, p);
  return [topBar('#' + (p.num || '–') + ' ' + (p.name || ''), ['e', ev.id, 'players'], h('button', { class: 'iconbtn', 'aria-label': 'Edit details', onclick: () => playerSheet(ev, p) }, icon('edit'))),
    h('main', { class: 'page card-page' },
      h('div', { class: 'pinfo' },
        h('div', { class: 'row', style: 'gap:12px' }, h('span', { class: 'jn big' }, p.num || '–'),
          h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm', style: 'font-size:20px' }, p.name || 'No name'),
            h('div', { class: 'pmeta' }, [p.pos || 'No ' + W.position, gname || 'No group', p.div || null, (() => { const ci = checkinFor(ev, todayDay(ev)); return ci.used ? (ci.isHere(p) ? 'Checked in' : 'Not checked in') : null; })()].filter(Boolean).join(' · '))),
          h('button', { class: 'btn sm', onclick: () => playerSheet(ev, p) }, icon('edit'), 'Edit')),
        p.notes ? h('div', { class: 'snote', style: 'margin-top:8px' }, 'Roster note: ' + p.notes) : null),
      h('button', { class: 'btn primary block', style: 'margin:12px 0 4px', onclick: async () => { if (!(await ensureEvaluatorName())) return; const sid = ((S.settings.day || {})[ev.id] && ev.sessions.some(d => d.id === S.settings.day[ev.id])) ? S.settings.day[ev.id] : ev.sessions[ev.sessions.length - 1].id; go('s', ev.id, sid, 'all', p.id); } }, icon('check'), r.nEval ? 'Score this ' + W.player + ' again' : 'Score this ' + W.player),
      sect('Results'),
      h('div', { class: 'rcard' },
        h('div', { class: 'ovr' }, r.pct == null ? h('div', { class: 'big' }, '–') : [h('div', { class: 'big' }, f.scale === 'pcm' ? Math.round(r.pct) + '%' : fmtV(r.overall)), h('div', { class: 'of' }, f.scale === 'pcm' ? 'overall' : 'out of ' + mx + ' · ' + Math.round(r.pct) + '%')]),
        h('div', { class: 'rchips' },
          r.rank ? [chip('overall', r.rank.all), r.rank.pos ? chip(p.pos + 's', r.rank.pos) : null, r.rank.grp ? chip('in ' + r.rank.grp.label, r.rank.grp) : null, r.rank.div ? chip('in ' + p.div, r.rank.div) : null] : h('div', { class: 'note' }, 'Not scored yet.'))),
      h('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap;gap:8px' },
        h('span', { class: 'pbadge full' }, 'Scored by ' + plural(r.nEval, 'evaluator', 'evaluators')),
        r.scored < r.of ? h('span', { class: 'pbadge' }, r.scored + ' of ' + r.of + ' skills scored') : null,
        r.flagged.length ? h('span', { class: 'pbadge bad' }, '⚑ Evaluators disagree: ' + r.flagged.join(', ')) : null,
        RS.day !== 'all' ? h('span', { class: 'pbadge' }, (ev.sessions.find(d => d.id === RS.day) || {}).name + ' only') : null),
      ev.join ? null : [sect('Decision'), decisionChips(ev, p.id)],
      sect('How they were scored', h('span', { class: 'cnt' }, summary.length || '')),
      summary.length ? h('div', { class: 'list', style: 'gap:6px' }, summary.map(x => h('div', { class: 'krow' },
        h('div', { class: 'knm' }, h('div', { class: 'pnm' }, x.who + (x.day ? ' · ' + x.day : '')), h('div', { class: 'pmeta' }, x.done + ' of ' + x.all + ' scored' + (x.notes ? ' · ' + plural(x.notes, 'note', 'notes') : '') + (x.when ? ' · ' + x.when : ''))),
        h('b', { class: 'num', style: 'font-size:18px' }, x.avg == null ? '–' : (f.scale === 'pcm' ? pcmLabel(x.avg) : fmtV(x.avg)) + (f.scale === 'pcm' ? '' : ' avg'))))) : h('p', { class: 'note' }, 'Nobody has scored this ' + W.player + ' yet.'),
      sect('Skills'),
      h('p', { class: 'note', style: 'margin:-4px 0 8px' }, 'Tap a skill to see each coach\'s score and notes.'),
      h('div', { class: 'stack', style: 'gap:8px' }, ks.map(k => {
        const s = r.skills[k.id], nn = skillNotes(ev, p.id, k.id, res.dayIds).length;
        return h('button', { class: 'bar-row tapable' + (strong.includes(k.id) ? ' strong' : weak.includes(k.id) ? ' weak' : ''), 'aria-label': k.name + ': each coach\'s score' + (nn ? ' and ' + plural(nn, 'note', 'notes') : ''), onclick: () => skillDetailSheet(ev, p, k, res.dayIds) },
          h('div', { class: 'row' }, h('div', { class: 'grow sname' }, k.name, k.w !== 1 ? h('span', { class: 'pmeta' }, ' ' + wLabel(k.w)) : null, strong.includes(k.id) ? h('span', { class: 'tag' }, 'Strength') : weak.includes(k.id) ? h('span', { class: 'tag' }, 'Work on') : null,
              nn ? h('span', { class: 'nmark', title: plural(nn, 'coach note', 'coach notes') }, icon('note', 13), nn > 1 ? String(nn) : null) : null),
            h('b', { class: 'num' }, s ? (f.scale === 'pcm' ? pcmLabel(s.v) : fmtV(s.v)) : '–'), icon('chev', 16)),
          h('div', { class: 'bar' }, h('i', { style: 'width:' + (s ? Math.max(3, Math.min(100, s.pct)) : 0) + '%' })),
          s && s.days ? h('div', { class: 'pmeta' }, ev.sessions.filter(d => res.dayIds.includes(d.id)).map((d, j) => d.name + ': ' + (s.days[j] == null ? '–' : f.scale === 'pcm' ? pcmLabel(s.days[j]) : fmtV(s.days[j]))).join(' · ')) : null,
          s && s.n > 1 ? h('div', { class: 'pmeta' }, plural(s.n, 'evaluator', 'evaluators') + (s.spread ? ' · spread ' + fmtV(s.spread) : '')) : null);
      })),
      f.tests.length ? [sect('Measured tests'), h('div', { class: 'list', style: 'gap:6px' }, f.tests.map(t => h('div', { class: 'krow' },
        h('div', { class: 'knm' }, h('div', { class: 'pnm' }, t.name), h('div', { class: 'pmeta' }, r.testRank && r.testRank[t.id] ? '#' + r.testRank[t.id].at + ' of ' + r.testRank[t.id].of + (t.better === 'low' ? ' · lower is better' : '') : 'not measured')),
        h('b', { class: 'num', style: 'font-size:18px' }, r.tests[t.id] == null ? '–' : fmtV(r.tests[t.id], 2) + ' ' + (t.unit || '')))))] : null,
      sect('Notes', h('span', { class: 'cnt' }, notes.length || '')),
      notes.length ? h('div', { class: 'stack', style: 'gap:6px' }, notes.map(n => h('div', { class: 'nitem' }, h('div', { class: 'pmeta' }, [n.who, n.day, n.skill].filter(Boolean).join(' · ')), h('div', null, n.text)))) : h('p', { class: 'note' }, 'No notes.'),
      /* previous and next player side by side, Save as PDF full width below */
      h('div', { class: 'pnav' },
        prev ? h('button', { class: 'btn', 'aria-label': 'Previous player', onclick: () => goReplace('r', ev.id, prev.p.id) }, icon('back'), h('span', { class: 'ellip' }, '#' + (prev.p.num || '–') + ' ' + (prev.p.name || ''))) : h('span'),
        next ? h('button', { class: 'btn', 'aria-label': 'Next player', onclick: () => goReplace('r', ev.id, next.p.id) }, h('span', { class: 'ellip' }, '#' + (next.p.num || '–') + ' ' + (next.p.name || '')), icon('chev')) : h('span')),
      h('button', { class: 'btn block', style: 'margin-top:10px', onclick: () => go('p', ev.id, 'card', pid) }, icon('file'), 'Save as PDF'))];
}

/* one line per evaluator and day: how much of the form they filled in, their average, notes, last change */
function scoringSummary(ev, p) {
  const ks = skillsFor(ev, p), kids = new Set(ks.map(k => k.id)), tids = new Set(ev.form.tests.map(t => t.id)), out = {};
  const add = (by, sid) => { const key = by + '|' + sid; if (!out[key]) { const d = ev.sessions.find(x => x.id === sid); out[key] = { by, sid, who: evalName(ev, by), day: ev.sessions.length > 1 && d ? d.name : null, order: ev.sessions.indexOf(d), done: 0, all: ks.length + tids.size, sum: 0, n: 0, notes: 0, t: 0 }; } return out[key]; };
  for (const key in ev.scores || {}) {
    const [by, pid, kid, sid] = key.split('|'), r = ev.scores[key]; if (pid !== p.id || !r || r.v == null || (!kids.has(kid) && !tids.has(kid))) continue;
    const o = add(by, sid); o.done++; o.t = Math.max(o.t, r.t || 0); if (kids.has(kid)) { o.sum += r.v; o.n++; }
  }
  for (const key in ev.notes || {}) { const [by, pid, , sid] = key.split('|'), r = ev.notes[key]; if (pid === p.id && r && r.v) { const o = add(by, sid); o.notes++; o.t = Math.max(o.t, r.t || 0); } }
  return Object.values(out).map(o => Object.assign(o, { avg: o.n ? o.sum / o.n : null, when: o.t ? new Date(o.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + new Date(o.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '' })).sort((a, b) => a.order - b.order || a.who.localeCompare(b.who));
}

/* ---------------- spreadsheet export (same order and filters as on screen) ---------------- */
function resultsCsv(ev) {
  const { res, rows, val } = resultRows(ev), f = ev.form, ks = allSkills(ev), gname = id => (ev.groups.find(g => g.id === id) || {}).name || '';
  const q = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
  const dec = decisionsOf(ev), dname = pid => (outcomesOf(ev).find(o => o.id === dec.get(pid)) || {}).name || '';
  const head = ['Rank', 'Number', 'Name', cap(W.position), 'Group', 'Division', 'Decision', 'Overall', 'Overall %', 'Evaluators', 'Disagree on'].concat(ks.map(k => k.name), f.tests.map(t => t.name + (t.unit ? ' (' + t.unit + ')' : '')), ['Notes']);
  const lines = [head.map(q).join(',')];
  rows.forEach((r, i) => {
    const notes = notesFor(ev, r.p.id).map(n => (n.skill ? n.skill + ': ' : '') + n.text).join(' | ');
    lines.push([val(r) == null ? '' : i + 1, r.p.num, r.p.name, r.p.pos, gname(r.p.group), r.p.div, dname(r.p.id), r.overall == null ? '' : fmtV(r.overall, 2), r.pct == null ? '' : Math.round(r.pct), r.nEval, r.flagged.join('; ')]
      .concat(ks.map(k => r.skills[k.id] ? fmtV(r.skills[k.id].v, 2) : ''), f.tests.map(t => r.tests[t.id] == null ? '' : r.tests[t.id]), [notes]).map(q).join(','));
  });
  return '﻿' + lines.join('\r\n');
}

/* ---------------- reports (print preview and PDF share the same layout) ---------------- */
const shortScore = (f, v) => v == null ? '' : f.scale === 'pcm' ? pcmLabel(v) : fmtV(v);
function resultsReport(ev) {
  const { res, rows, val, test, sk } = resultRows(ev), f = ev.form, ks = allSkills(ev), gname = id => (ev.groups.find(g => g.id === id) || {}).name || '';
  const filt = [RS.group ? (RS.group === NONE ? 'no group' : gname(RS.group)) : null, RS.pos ? (RS.pos === NONE ? 'no ' + W.position : RS.pos) : null, RS.div ? (RS.div === NONE ? 'no division' : RS.div) : null].filter(Boolean);
  const head = ['#', 'No.', 'Name', cap(W.position), 'Group', 'Overall', '%'].concat(ks.map(k => k.name), f.tests.map(t => t.name + (t.unit ? ' (' + t.unit + ')' : '')));
  return { title: ev.name + ' · results', landscape: head.length > 8,
    subtitle: [sportById(ev.sport).name, RS.day === 'all' ? (ev.sessions.length > 1 ? 'all days' : null) : (ev.sessions.find(d => d.id === RS.day) || {}).name, filt.length ? 'showing ' + filt.join(', ') : null, 'sorted by ' + (RS.sort === 'overall' ? 'overall' : (test || sk).name), 'printed ' + new Date().toLocaleDateString()].filter(Boolean).join(' · '),
    blocks: [{ table: { head, align: ['r', 'r', 'l', 'l', 'l', 'r', 'r'].concat(ks.map(() => 'r'), f.tests.map(() => 'r')), line: ev.line || 0,
      rows: rows.map((r, i) => [val(r) == null ? '' : String(i + 1), r.p.num, (r.p.name || '') + (r.flagged.length ? ' ⚑' : ''), r.p.pos, gname(r.p.group), r.pct == null ? '' : (f.scale === 'pcm' ? '' : fmtV(r.overall)), r.pct == null ? '' : Math.round(r.pct) + '%']
        .concat(ks.map(k => r.skills[k.id] ? shortScore(f, r.skills[k.id].v) : ''), f.tests.map(t => r.tests[t.id] == null ? '' : fmtV(r.tests[t.id], 2)))) } },
      { p: (ev.line ? 'Orange line: team line after ' + ev.line + ' spots. ' : '') + '⚑ = evaluators disagree a lot on a skill. Scale: ' + scaleLabel(f) + (ev.sessions.length > 1 ? '. Days: ' + (COMBINE.find(c => c[0] === (f.combine || 'avg')) || [])[1] : '') + '.' }] };
}
function cardReport(ev, pid) {
  const { res } = resultRows(ev), r = res.rows.find(x => x.p.id === pid); if (!r) return null;
  const f = ev.form, p = r.p, ks = skillsFor(ev, p), gname = (ev.groups.find(g => g.id === p.group) || {}).name, multi = res.dayIds.length > 1;
  const rk = (lbl, x) => x ? ['#' + x.at + ' of ' + x.of + ' ' + lbl] : [];
  const blocks = [{ kv: [['Overall', r.pct == null ? 'not scored' : (f.scale === 'pcm' ? Math.round(r.pct) + '%' : fmtV(r.overall) + ' out of ' + res.skMax + ' (' + Math.round(r.pct) + '%)')]].concat(
    r.rank ? [['Rank', [].concat(rk('overall', r.rank.all), rk(p.pos ? 'in ' + p.pos : '', r.rank.pos), rk('in ' + (gname || ''), r.rank.grp), rk('in ' + (p.div || ''), r.rank.div)).join(', ')]] : [],
    [['Scored by', plural(r.nEval, 'evaluator', 'evaluators')]], decisionsOf(ev).has(p.id) ? [['Decision', outcomesOf(ev).find(o => o.id === decisionsOf(ev).get(p.id)).name]] : [], r.flagged.length ? [['Evaluators disagree on', r.flagged.join(', ')]] : []) },
    { h: 'Skills' }, { table: { head: ['Skill', 'Score'].concat(multi ? ev.sessions.filter(d => res.dayIds.includes(d.id)).map(d => d.name) : [], ['Evaluators']), align: ['l', 'r'].concat(multi ? res.dayIds.map(() => 'r') : [], ['r']),
      rows: ks.map(k => { const x = r.skills[k.id]; return [k.name + (k.w !== 1 ? ' (' + wLabel(k.w) + ')' : ''), x ? shortScore(f, x.v) : '–'].concat(multi ? res.dayIds.map((_, j) => x && x.days && x.days[j] != null ? shortScore(f, x.days[j]) : '–') : [], [x ? String(x.n) : '']); }) } }];
  if (f.tests.length) blocks.push({ h: 'Measured tests' }, { table: { head: ['Test', 'Result', 'Rank'], align: ['l', 'r', 'r'], rows: f.tests.map(t => [t.name, r.tests[t.id] == null ? '–' : fmtV(r.tests[t.id], 2) + ' ' + (t.unit || ''), r.testRank && r.testRank[t.id] ? '#' + r.testRank[t.id].at + ' of ' + r.testRank[t.id].of : '']) } });
  const notes = notesFor(ev, pid);
  if (notes.length) blocks.push({ h: 'Notes' }, { table: { head: ['Who', 'About', 'Note'], rows: notes.map(n => [[n.who, n.day].filter(Boolean).join(' · '), n.skill || 'Overall', n.text]) } });
  return { title: '#' + (p.num || '–') + ' ' + (p.name || ''), subtitle: [ev.name, p.pos, gname, p.div, 'printed ' + new Date().toLocaleDateString()].filter(Boolean).join(' · '), blocks };
}
/* the report on screen (white paper) */
function reportHtml(rep) {
  return h('div', { class: 'paper' + (rep.landscape ? ' wide' : '') },
    h('div', { class: 'pbrand' }, h('img', { src: ICON_URL, alt: '' }), h('b', null, 'RosterPulse')), h('h1', null, rep.title), rep.subtitle ? h('p', { class: 'psub' }, rep.subtitle) : null,
    rep.blocks.map(b => b.h ? h('h2', null, b.h) : b.p ? h('p', null, b.p) : b.kv ? h('table', { class: 'pkv' }, b.kv.map(([k, v]) => h('tr', null, h('td', null, k), h('th', null, v))))
      : h('div', { class: 'ptwrap' }, h('table', { class: 'ptbl' }, h('thead', null, h('tr', null, b.table.head.map(x => h('th', null, x)))),
        h('tbody', null, b.table.rows.map((r, i) => h('tr', { class: b.table.line && i === b.table.line - 1 ? 'lineafter' : null }, r.map((c, j) => h('td', { class: b.table.align && b.table.align[j] === 'r' ? 'r' : null }, c)))))))),
    h('p', { class: 'pfoot' }, 'Made with RosterPulse · results are private to the organizer'));
}
function viewPrint(evId, kind, pid) {
  const ev = eventById(evId); if (!ev) return viewHome();
  ensureDays(ev); W = wordsOf(ev);
  const rep = kind === 'card' ? cardReport(ev, pid) : kind === 'decisions' ? decisionsReport(ev) : kind === 'grid' ? gridReport(ev) : resultsReport(ev);
  if (!rep) return viewEvent(evId, 'results');
  const fname = 'RosterPulse-' + fileSafe(ev.name) + (kind === 'card' ? '-' + fileSafe(rep.title) : kind === 'decisions' ? '-decisions' : kind === 'grid' ? '-grid' : '-results') + '.pdf';
  return [topBar('Print or save', kind === 'card' ? ['r', ev.id, pid] : kind === 'decisions' ? ['x', ev.id] : kind === 'grid' ? ['rg', ev.id] : ['e', ev.id, 'results']),
    h('main', { class: 'page' },
      h('button', { class: 'btn primary block big ptool', onclick: () => saveFile(fname, makePdf(rep), 'application/pdf') }, icon('dl'), 'Save as PDF'),
      h('p', { class: 'note ptool', style: 'margin:8px 0 6px' }, 'Then pick Print, Save to Files, Mail or Messages from your phone\'s share menu.'),
      h('button', { class: 'btn ghost ptool', style: 'margin-bottom:12px', onclick: () => { try { window.print(); } catch (e) { toast('This phone cannot print from here. Use Save as PDF.'); } } }, icon('file'), 'Print directly (computers)'),
      reportHtml(rep))];
}

/* ---------------- compare 2 or 3 players side by side ---------------- */
function compareSheet(ev) {
  const { rows } = resultRows(ev), pick = [];
  openSheet((s, api) => {
    const box = h('div', { class: 'list', style: 'gap:6px' }), go1 = h('button', { class: 'btn primary', onclick: () => { if (pick.length < 2) { toast('Pick 2 or 3 ' + W.players + '.'); return; } api.close(); go('c', ev.id, pick.join(',')); } }, 'Compare');
    const paint = () => { go1.textContent = 'Compare' + (pick.length ? ' (' + pick.length + ')' : ''); box.replaceChildren(rows.map(r => h('button', { class: 'prow2' + (pick.includes(r.p.id) ? ' picked' : ''), onclick: () => { const i = pick.indexOf(r.p.id); if (i > -1) pick.splice(i, 1); else if (pick.length < 3) pick.push(r.p.id); else toast('Up to 3.'); paint(); } },
      h('span', { class: 'jn' }, r.p.num || '–'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, r.p.name || 'No name'), h('div', { class: 'pmeta' }, [r.p.pos, r.pct == null ? 'not scored' : Math.round(r.pct) + '%'].filter(Boolean).join(' · '))),
      pick.includes(r.p.id) ? h('span', { class: 'pbadge full' }, String(pick.indexOf(r.p.id) + 1)) : null))); };
    paint();
    s.append(h('h2', null, 'Compare ' + W.players), h('p', { class: 'note', style: 'margin-bottom:10px' }, 'Pick 2 or 3. The list follows the Results filters.'), box, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'), go1));
  });
}
function viewCompare(evId, ids) {
  const ev = eventById(evId); if (!ev) return viewHome();
  ensureDays(ev); W = wordsOf(ev);
  const { res } = resultRows(ev), f = ev.form, list = String(ids || '').split(',').map(id => res.rows.find(r => r.p.id === id)).filter(Boolean);
  if (list.length < 2) return viewEvent(evId, 'results');
  const best = (vals, low) => { const got = vals.filter(v => v != null); if (got.length < 2 || got.every(v => v === got[0])) return null; return low ? Math.min(...got) : Math.max(...got); };   // no highlight when tied
  const row = (label, vals, show, low, sub) => { const b = best(vals, low); return h('div', { class: 'crow' }, h('div', { class: 'clab' }, label, sub ? h('span', { class: 'pmeta' }, ' ' + sub) : null), vals.map(v => h('div', { class: 'cval' + (b != null && v === b ? ' best' : '') }, v == null ? '–' : show(v)))); };
  const skills = allSkills(ev).filter(k => list.some(r => r.skills[k.id] !== undefined));
  return [topBar('Compare', ['e', ev.id, 'results']),
    h('main', { class: 'page' },
      h('div', { class: 'ctable', style: '--n:' + list.length },
        h('div', { class: 'crow chead' }, h('div', { class: 'clab' }), list.map(r => h('button', { class: 'cval cname', onclick: () => go('r', ev.id, r.p.id) }, h('b', null, '#' + (r.p.num || '–')), h('span', { class: 'ellip' }, r.p.name || ''), h('span', { class: 'pmeta ellip' }, r.p.pos || ' ')))),
        row('Overall', list.map(r => r.pct), v => Math.round(v) + '%'),
        row('Rank', list.map(r => r.rank ? r.rank.all.at : null), v => '#' + v, true),
        row('Evaluators', list.map(r => r.nEval || null), v => String(v)),
        h('div', { class: 'csect' }, 'Skills'),
        skills.map(k => row(k.name, list.map(r => r.skills[k.id] ? r.skills[k.id].v : null), v => shortScore(f, v), false, k.w !== 1 ? wLabel(k.w) : null)),
        f.tests.length ? [h('div', { class: 'csect' }, 'Measured tests'), f.tests.map(t => row(t.name, list.map(r => r.tests[t.id]), v => fmtV(v, 2), t.better === 'low', t.unit))] : null,
        list.some(r => r.flagged.length) ? row('Disagree on', list.map(r => r.flagged.length ? r.flagged.join(', ') : null), v => v) : null),
      h('p', { class: 'note', style: 'margin-top:10px' }, 'Orange = best of the group. Tap a name for the full card.'))];
}

/* ---------------- missing scores: who still needs to score whom ---------------- */
function viewMissing(evId) {
  const ev = eventById(evId); if (!ev) return viewHome();
  ensureDays(ev); W = wordsOf(ev);
  if (RS.day !== 'all' && !ev.sessions.some(d => d.id === RS.day)) RS.day = 'all';
  const sid = RS.day === 'all' ? ev.sessions[ev.sessions.length - 1].id : RS.day, day = ev.sessions.find(d => d.id === sid);
  const evs = evaluatorsOf(ev); for (const v of Object.keys(ev.evaluators || {})) if (!evs.includes(v)) evs.push(v); if (S.settings.me && S.settings.me.name && !evs.includes(S.settings.me.id)) evs.push(S.settings.me.id);
  const groups = ev.groups.length ? ev.groups.map(g => [g.id, g.name]).concat(ev.players.some(p => !ev.groups.some(g => g.id === p.group)) ? [['', 'No group']] : []) : [['', null]];
  const ci = checkinFor(ev, sid);
  const inG = gid => sortPlayers(ev.players.filter(p => ci.isHere(p) && (gid ? p.group === gid : !ev.groups.some(g => g.id === p.group))));
  const nobody = sortPlayers(ev.players.filter(p => ci.isHere(p) && !evs.some(by => progressOf(ev, p, sid, by).done)));
  const assigned = by => { const a = ev.share && ev.share.assign && ev.share.assign[by]; return a && a.length ? a : null; };
  return [topBar('Missing scores', ['e', ev.id, 'results']),
    h('main', { class: 'page' },
      ev.sessions.length > 1 ? h('div', { class: 'seg', style: 'margin-bottom:12px' }, ev.sessions.map(d => h('button', { class: sid === d.id ? 'on' : '', onclick: () => { RS.day = d.id; render(); } }, d.name))) : null,
      h('p', { class: 'note' }, 'For each evaluator: the ' + W.players + ' they have not fully scored' + (ev.sessions.length > 1 ? ' on ' + day.name : '') + '. Evaluators who joined on their own phones show here as soon as they join.' + (ci.used ? ' Only ' + W.players + ' checked in are counted.' : '')),
      sect('Not scored by anyone', h('span', { class: 'cnt' }, nobody.length || '')),
      nobody.length ? h('div', { class: 'chips' }, nobody.map(p => h('button', { class: 'chip', onclick: () => go('r', ev.id, p.id) }, '#' + (p.num || '–') + ' ' + (p.name || '').split(' ')[0]))) : h('p', { class: 'note' }, 'Everyone has at least one score.'),
      evs.length ? evs.map(by => {
        const parts = groups.filter(([gid]) => !assigned(by) || assigned(by).includes(gid)).map(([gid, gname]) => { const miss = inG(gid).map(p => [p, progressOf(ev, p, sid, by)]).filter(([, pr]) => pr.done < pr.all); return [gname, miss]; }).filter(([, m]) => m.length);
        const total = parts.reduce((a, [, m]) => a + m.length, 0);
        return [sect(evalName(ev, by), h('span', { class: 'cnt' }, total ? total + ' to go' : 'all done')),
          total ? parts.map(([gname, miss]) => [gname ? h('div', { class: 'lbl', style: 'margin:6px 0' }, gname) : null, h('div', { class: 'list', style: 'gap:6px' }, miss.map(([p, pr]) => h('button', { class: 'prow2', onclick: () => go('r', ev.id, p.id) }, h('span', { class: 'jn' }, p.num || '–'), h('div', { class: 'grow pnm ellip' }, p.name || 'No name'), h('span', { class: 'pbadge' + (pr.done ? '' : ' miss') }, pr.done ? pr.done + '/' + pr.all : 'none'))))]) : h('p', { class: 'note' }, 'Every ' + W.player + ' fully scored.')];
      }) : h('div', { class: 'empty' }, 'No scores yet.'))];
}
