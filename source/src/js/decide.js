/* =====================================================================
   Team decisions: the end of a tryout. Each player gets an outcome (Made team, Waitlist, Not selected,
   or camp tracks, or the organizer's own list). A decision is a record like a check-in:
   ev.decs['by|pid||all'] = { id, v: outcome id or null, t, q }; the newest wins, whichever organizer made it.
   Evaluators never see decisions (the server only takes and gives them to organizers).
   ===================================================================== */
const OUTCOME_SETS = [
  ['tryout', 'Tryout', [['made', 'Made team'], ['wait', 'Waitlist'], ['cut', 'Not selected']]],
  ['camp', 'Camp tracks', [['adv', 'Advanced'], ['mid', 'Intermediate'], ['beg', 'Beginner']]],
  ['levels', 'Team levels', [['t1', 'Team 1'], ['t2', 'Team 2'], ['t3', 'Team 3']]]];
/* the sibling app for the season after tryouts (only for the sports it covers) */
const SHOTPULSE_URL = 'https://shotpulse.app', SHOTPULSE_SPORTS = ['hockey', 'ringette', 'basketball', 'soccer', 'lacrosse', 'handball'];
function shotPulseCard(ev, dec) {
  if (!dec.size || S.settings.spHide || !SHOTPULSE_SPORTS.includes(ev.sport)) return null;
  const el = h('div', { class: 'spcard' },
    h('div', { class: 'grow' }, h('div', { class: 'sph' }, 'Team picked? Track their season on ', h('b', null, 'Shot', h('span', null, 'Pulse'))),
      h('div', { class: 'pmeta' }, 'Shots, goals and game stats all season, with a live link for parents. From the maker of RosterPulse.'),
      h('a', { class: 'btn sm', href: SHOTPULSE_URL, target: '_blank', rel: 'noopener', style: 'margin-top:8px' }, 'Open ShotPulse')),
    h('button', { class: 'mini', 'aria-label': 'Hide', onclick: () => { S.settings.spHide = 1; save(); el.remove(); } }, icon('x')));
  return el;
}
const OUT_COLORS = ['#3ccf7a', '#f5b94a', '#8d8d99', '#7aa7ff', '#e07bd8', '#4fd1d9'];
function outcomesOf(ev) {
  const o = ev.form.outcomes;
  return Array.isArray(o) && o.length ? o : OUTCOME_SETS[0][2].map(([id, name]) => ({ id, name }));
}
const outColor = (ev, id) => { const i = outcomesOf(ev).findIndex(o => o.id === id); return i < 0 ? 'var(--muted)' : OUT_COLORS[i % OUT_COLORS.length]; };
/* the current decision per player: Map pid -> outcome id */
function decisionsOf(ev) {
  const best = new Map();
  for (const k in ev.decs || {}) { const pid = k.split('|')[1], r = ev.decs[k], b = best.get(pid); if (!b || r.t > b.t || (r.t === b.t && r.id > b.id)) best.set(pid, r); }
  const valid = new Set(outcomesOf(ev).map(o => o.id)), out = new Map();
  for (const [pid, r] of best) if (r.v != null && valid.has(r.v)) out.set(pid, r.v);
  return out;
}
function setDecision(ev, pid, v, quiet) {
  ev.decs = ev.decs || {};
  ev.decs[myId(ev) + '|' + pid + '||all'] = { id: uid('x'), v: v || null, t: Date.now(), q: 1 };
  if (!quiet) { touch(ev); syncSoon(ev); }
}
function decisionBadge(ev, pid, dec) {
  const v = (dec || decisionsOf(ev)).get(pid); if (!v) return null;
  const o = outcomesOf(ev).find(x => x.id === v);
  return h('span', { class: 'dbadge', style: '--dc:' + outColor(ev, v) }, o.name);
}
/* outcome buttons for one player */
function decisionChips(ev, pid, dec) {
  const cur = (dec || decisionsOf(ev)).get(pid);
  return h('div', { class: 'dchips' }, outcomesOf(ev).map(o => h('button', { class: 'dchip' + (cur === o.id ? ' on' : ''), style: '--dc:' + outColor(ev, o.id), 'aria-pressed': cur === o.id ? 'true' : 'false',
    onclick: () => { setDecision(ev, pid, cur === o.id ? null : o.id); render(); } }, o.name)));
}

/* ---------------- the decisions screen ---------------- */
let decFilter = 'all';
function viewDecisions(evId) {
  const ev = eventById(evId);
  if (!ev || ev.join) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  ensureDays(ev); W = wordsOf(ev);
  const res = computeResults(ev, 'all'), dec = decisionsOf(ev), outs = outcomesOf(ev);
  const ranked = res.rows.slice().sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct));
  const count = id => ranked.filter(r => id === 'none' ? !dec.has(r.p.id) : dec.get(r.p.id) === id).length;
  if (decFilter !== 'all' && decFilter !== 'none' && !outs.some(o => o.id === decFilter)) decFilter = 'all';
  const shown = ranked.filter(r => decFilter === 'all' || (decFilter === 'none' ? !dec.has(r.p.id) : dec.get(r.p.id) === decFilter));
  const rankOf = r => r.rank && r.rank.all ? r.rank.all.at : null;
  return [topBar('Team decisions', ['e', ev.id, 'results']),
    h('main', { class: 'page' },
      tip('decisions', 'Decide who makes it. Tap an outcome beside each ' + W.player + ', or Fill from ranking to do it in one go from the results. Other organizers see the same decisions. Evaluators never do.'),
      h('div', { class: 'hscroll' }, [['all', 'Everyone', ranked.length]].concat(outs.map(o => [o.id, o.name, count(o.id)]), [['none', 'Undecided', count('none')]]).map(([k, l, n]) =>
        h('button', { class: 'chip' + (decFilter === k ? ' on' : ''), style: k !== 'all' && k !== 'none' ? '--dc:' + outColor(ev, k) : null, onclick: () => { decFilter = k; render(); } }, k !== 'all' && k !== 'none' ? h('span', { class: 'ddot' }) : null, l + ' ', h('b', null, String(n))))),
      h('div', { class: 'toprow', style: 'margin:12px 0 4px' },
        h('button', { class: 'btn primary', onclick: () => fillSheet(ev, ranked) }, icon('sort'), 'Fill from ranking'),
        h('button', { class: 'btn', onclick: () => outcomesSheet(ev) }, icon('edit'), 'Choices')),
      shown.length ? h('div', { class: 'list', style: 'gap:8px;margin-top:8px' }, shown.map(r => h('div', { class: 'drow' },
        h('button', { class: 'drow-top', onclick: () => go('r', ev.id, r.p.id) },
          h('span', { class: 'rk' }, rankOf(r) ? String(rankOf(r)) : '–'), h('span', { class: 'jn' }, r.p.num || '–'),
          h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, r.p.name || 'No name'), h('div', { class: 'pmeta ellip' }, [r.p.pos, (ev.groups.find(g => g.id === r.p.group) || {}).name].filter(Boolean).join(' · ') || ' ')),
          h('span', { class: 'rv' }, r.pct == null ? h('span', null, 'not scored') : Math.round(r.pct) + '%')),
        decisionChips(ev, r.p.id, dec)))) : h('div', { class: 'empty' }, 'Nobody here.'),
      shotPulseCard(ev, dec),
      sect('Share'),
      h('div', { class: 'toprow' },
        h('button', { class: 'btn', onclick: () => saveFile('RosterPulse-' + fileSafe(ev.name) + '-decisions.csv', decisionsCsv(ev), 'text/csv') }, icon('dl'), 'Spreadsheet'),
        h('button', { class: 'btn', onclick: () => go('p', ev.id, 'decisions') }, icon('file'), 'Save as PDF')),
      h('p', { class: 'note', style: 'margin-top:8px' }, 'The PDF lists each outcome with ' + W.players + ' by number and name only, no scores, so it can be posted or sent to families.'))];
}
/* fill outcomes in ranking order: how many go to each outcome; the last one gets the rest */
function fillSheet(ev, ranked) {
  const outs = outcomesOf(ev), scored = ranked.filter(r => r.pct != null), n = scored.length;
  if (!n) { toast('Nobody is scored yet.'); return; }
  const counts = outs.map(() => 0); let left = n;
  if (ev.line) { counts[0] = Math.min(ev.line, n); left -= counts[0]; for (let i = 1; i < outs.length - 1; i++) { counts[i] = Math.min(left, outs[i].id === 'wait' ? 2 : Math.ceil(left / (outs.length - i))); left -= counts[i]; } }
  else for (let i = 0; i < outs.length - 1; i++) { counts[i] = Math.ceil(left / (outs.length - i)); left -= counts[i]; }
  let keep = true;
  openSheet((s, api) => {
    const paint = () => {
      const rest = n - counts.slice(0, -1).reduce((a, b) => a + b, 0);
      refill(s, h('h2', null, 'Fill from ranking'),
        h('p', { class: 'note' }, n + ' ' + W.players + ' are scored. Starting from the top of the overall ranking:'),
        h('div', { class: 'list', style: 'gap:8px;margin-top:10px' }, outs.map((o, i) => h('div', { class: 'krow' },
          h('span', { class: 'ddot', style: '--dc:' + outColor(ev, o.id) }), h('div', { class: 'knm grow' }, h('div', { class: 'pnm' }, o.name)),
          i < outs.length - 1 ? [h('button', { class: 'mini', 'aria-label': o.name + ' fewer', onclick: () => { counts[i] = Math.max(0, counts[i] - 1); paint(); } }, '−'),
            h('b', { class: 'num', style: 'min-width:32px;text-align:center' }, String(counts[i])),
            h('button', { class: 'mini', 'aria-label': o.name + ' more', onclick: () => { if (rest > 0) counts[i]++; paint(); } }, icon('plus'))]
            : h('b', { class: 'num', style: 'min-width:32px;text-align:center' }, String(Math.max(0, rest)) + ' (the rest)')))),
        h('button', { class: 'chip' + (keep ? ' on' : ''), style: 'margin-top:12px', onclick: () => { keep = !keep; paint(); } }, keep ? icon('check', 14) : null, 'Keep decisions already made'),
        h('p', { class: 'note', style: 'margin-top:6px' }, keep ? 'Only undecided ' + W.players + ' are filled; places taken by decisions you made are counted.' : 'Every scored ' + W.player + ' is decided again.'),
        h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => {
          const dec = decisionsOf(ev), want = counts.slice(); want[want.length - 1] = Infinity;
          if (keep) for (const r of scored) { const v = dec.get(r.p.id); const i = outs.findIndex(o => o.id === v); if (i >= 0 && want[i] !== Infinity) want[i] = Math.max(0, want[i] - 1); }
          let i = 0, changed = 0;
          for (const r of scored) {
            if (keep && dec.has(r.p.id)) continue;
            while (i < outs.length - 1 && want[i] <= 0) i++;
            if (dec.get(r.p.id) !== outs[i].id) { setDecision(ev, r.p.id, outs[i].id, true); changed++; }
            want[i]--;
          }
          touch(ev); syncSoon(ev); api.close(); render(); toast(changed ? plural(changed, W.player, W.players) + ' decided.' : 'Nothing to change.');
        } }, 'Fill')));
    };
    paint();
  });
}
/* edit the list of outcomes */
function outcomesSheet(ev) {
  openSheet((s, api) => {
    const paint = () => {
      const outs = outcomesOf(ev);
      const set = list => { ev.form.outcomes = list; touch(ev); paint(); render(); };
      refill(s, h('h2', null, 'Outcome choices'),
        h('div', { class: 'lbl', style: 'margin:4px 0 8px' }, 'Start from'),
        h('div', { class: 'chips' }, OUTCOME_SETS.map(([k, l, list]) => h('button', { class: 'chip', onclick: async () => {
          if (decisionsOf(ev).size && !(await confirmBox({ title: 'Use ' + l + '?', message: 'Decisions already made for choices that go away are cleared.', ok: 'Use ' + l }))) return;
          set(list.map(([id, name]) => ({ id, name })));
        } }, l))),
        h('div', { class: 'lbl', style: 'margin:14px 0 8px' }, 'Choices, best first (Fill from ranking goes in this order)'),
        h('div', { class: 'list', style: 'gap:6px' }, outs.map((o, i) => h('div', { class: 'krow' },
          h('span', { class: 'ddot', style: '--dc:' + outColor(ev, o.id) }),
          h('button', { class: 'knm grow', onclick: async () => { const v = await promptBox({ title: 'Rename', value: o.name, max: 30 }); if (v) set(outs.map(x => x === o ? { id: x.id, name: v } : x)); } }, h('div', { class: 'pnm' }, o.name)),
          h('button', { class: 'mini', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { const l = outs.slice(); move(l, i, -1); set(l); } }, icon('up')),
          h('button', { class: 'mini', 'aria-label': 'Remove ' + o.name, disabled: outs.length <= 2, onclick: () => set(outs.filter(x => x !== o)) }, icon('x'))))),
        outs.length < 6 ? h('button', { class: 'chip add', style: 'margin-top:10px', onclick: async () => { const v = await promptBox({ title: 'New choice', placeholder: 'For example: Development team', max: 30 }); if (v) set(outs.concat({ id: uid('o'), name: v })); } }, icon('plus'), 'Add a choice') : null,
        h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => api.close() }, 'Done')));
    };
    paint();
  });
}
/* ---------------- exports ---------------- */
function decisionsCsv(ev) {
  const w = wordsOf(ev), res = computeResults(ev, 'all'), dec = decisionsOf(ev), outs = outcomesOf(ev), gname = id => (ev.groups.find(g => g.id === id) || {}).name || '';
  const q = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
  const order = id => { const i = outs.findIndex(o => o.id === id); return i < 0 ? 99 : i; };
  const rows = res.rows.slice().sort((a, b) => order(dec.get(a.p.id)) - order(dec.get(b.p.id)) || (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct));
  const lines = [['Outcome', 'Rank', 'Number', 'Name', cap(w.position), 'Group', 'Division', 'Overall %'].map(q).join(',')];
  for (const r of rows) lines.push([(outs.find(o => o.id === dec.get(r.p.id)) || {}).name || 'Undecided', r.rank && r.rank.all ? r.rank.all.at : '', r.p.num, r.p.name, r.p.pos, gname(r.p.group), r.p.div, r.pct == null ? '' : Math.round(r.pct)].map(q).join(','));
  return '﻿' + lines.join('\r\n');
}
/* the PDF to post or send: names and numbers per outcome, no scores */
function decisionsReport(ev) {
  const w = wordsOf(ev), dec = decisionsOf(ev), outs = outcomesOf(ev), blocks = [];
  for (const o of outs) {
    const ps = sortPlayers(ev.players.filter(p => dec.get(p.id) === o.id));
    blocks.push({ h: o.name + ' (' + ps.length + ')' });
    blocks.push(ps.length ? { table: { head: ['No.', 'Name', cap(w.position)], align: ['r', 'l', 'l'], rows: ps.map(p => [p.num || '', p.name || '', p.pos || '']) } } : { p: 'Nobody yet.' });
  }
  const und = ev.players.filter(p => !dec.has(p.id)).length;
  if (und) blocks.push({ p: und + ' ' + (und === 1 ? w.player : w.players) + ' not decided yet (not listed).' });
  return { title: ev.name + ' · decisions', subtitle: [sportById(ev.sport).name, 'printed ' + new Date().toLocaleDateString()].join(' · '), blocks };
}
