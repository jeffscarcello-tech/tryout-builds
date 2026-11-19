/* =====================================================================
   Scoring (stage 2, step 1: one phone). Two taps per score: pick a player, tap a score.
   Days: an event has one or more days (sessions). How days combine is set in the Form tab:
     avg   = each day scored fresh; results average the days
     total = each day scored fresh; results add the days
     carry = one score per skill; a new day starts with the latest earlier score, and a new tap replaces it
   Records are keyed evaluator|player|skill|day, newest wins. Each change gets a new id and time,
   so step 2 can send them to the server as append-only records.
   ev.scores = { 'by|pid|kid|sid': { id, v, t } }   v: number, or null when cleared
   ev.notes  = { 'by|pid||sid': player note,  'by|pid|kid|sid': skill note }  { id, v, t }
   ===================================================================== */
const PCM = [[3, '+'], [2, '✓'], [1, '−']];
const COMBINE = [['avg', 'Average the days'], ['total', 'Add the days'], ['carry', 'Carry scores forward']];
/* scales: '5', '10', 'pcm' (+ / ✓ / − stored as 3 / 2 / 1) or a custom top number like '100'; form.scaleMin is 0 or 1 (custom only) */
const scaleLo = f => f.scale === 'pcm' ? 1 : (f.scaleMin === 0 ? 0 : 1);
const scaleHi = f => f.scale === 'pcm' ? 3 : (parseInt(f.scale, 10) || 5);
const scaleLabel = f => f.scale === 'pcm' ? '+ / ✓ / −' : scaleLo(f) + ' to ' + scaleHi(f);
function scaleValues(f) {
  if (typeof f === 'string') f = { scale: f };
  if (f.scale === 'pcm') return PCM;
  const lo = scaleLo(f), hi = scaleHi(f); return Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, String(lo + i)]);
}
const useSlider = f => f.scale !== 'pcm' && scaleHi(f) - scaleLo(f) + 1 > 10;
/* the control for one score: buttons for up to 10 choices; above that a number box with − and +, and a slider */
function scoreControl(ev, p, k, sid, label) {
  const f = ev.form, cur = shownScore(ev, p.id, k.id, sid), own = () => getScore(ev, p.id, k.id, sid);
  const commit = v => { setScore(ev, p.id, k.id, sid, v); render(); };
  if (!useSlider(f)) {
    const vals = scaleValues(f);
    return h('div', { class: 'sbtns', style: 'grid-template-columns:repeat(' + Math.min(vals.length, 5) + ',1fr)' }, vals.map(([v, l]) => h('button', { class: 'sb' + (cur.v === v ? (cur.carried ? ' carried' : ' on') : ''), 'aria-label': label + ' ' + l, onclick: () => commit(own() === v ? null : v) }, l)));
  }
  const lo = scaleLo(f), hi = scaleHi(f), mid = Math.round((lo + hi) / 2), clamp = v => Math.max(lo, Math.min(hi, Math.round(v)));
  const base = () => { const o = own(); return o != null ? o : cur.v != null ? cur.v : null; };
  const num = h('input', { class: 'inp snum' + (cur.carried ? ' carried' : ''), inputmode: 'numeric', value: cur.v == null ? '' : String(cur.v), placeholder: '–', 'aria-label': label + ' score' });
  const range = h('input', { type: 'range', class: 'srange' + (cur.v == null ? ' unset' : ''), min: String(lo), max: String(hi), step: '1', value: String(cur.v == null ? mid : cur.v), 'aria-label': label + ' slider' });
  range.addEventListener('input', () => { num.value = range.value; range.classList.remove('unset'); });
  range.addEventListener('change', () => commit(clamp(+range.value)));
  num.addEventListener('change', () => { const v = parseFloat(num.value); commit(isFinite(v) ? clamp(v) : null); });
  return h('div', { class: 'slide' },
    h('div', { class: 'srow2' },
      h('button', { class: 'sb pm', 'aria-label': label + ' minus one', onclick: () => { const b = base(); commit(clamp(b == null ? mid : b - 1)); } }, '−'),
      num,
      h('button', { class: 'sb pm', 'aria-label': label + ' plus one', onclick: () => { const b = base(); commit(clamp(b == null ? mid : b + 1)); } }, '+'),
      own() != null ? h('button', { class: 'mini', 'aria-label': label + ' clear', onclick: () => commit(null) }, icon('x')) : null),
    h('div', { class: 'srange-wrap' }, h('span', null, lo), range, h('span', null, hi)));
}
const me = () => { if (!S.settings.me) { S.settings.me = { id: uid('v'), name: '' }; save(); } return S.settings.me; };
/* who is scoring on this phone for this event: an evaluator who joined by code uses the id the server gave them */
const myId = ev => ev && ev.join ? ev.join.vid : me().id;
const myName = ev => ev && ev.join ? ev.join.name : me().name;
const sKey = (by, pid, kid, sid) => by + '|' + pid + '|' + (kid || '') + '|' + sid;

/* every event has at least one day; scores from before days existed (build t3) move to Day 1 */
function ensureDays(ev) {
  if (Array.isArray(ev.sessions) && ev.sessions.length) return;
  ev.sessions = [{ id: 'd1', name: 'Day 1' }];
  if (!ev.form.combine) ev.form.combine = 'avg';
  const move = o => { if (!o) return o; const n = {}; for (const k in o) { const parts = k.split('|'); n[parts.length === 3 ? k + '|d1' : parts.length === 2 ? k + '||d1' : k] = o[k]; } return n; };
  ev.scores = move(ev.scores); ev.notes = move(ev.notes); save();
}
const dayById = (ev, sid) => ev.sessions.find(d => d.id === sid) || ev.sessions[ev.sessions.length - 1];

function skillsFor(ev, p) { const f = ev.form; return f.alt && p && p.pos === f.alt.pos ? f.alt.skills : f.skills; }
function getScore(ev, pid, kid, sid, by) { const r = ev.scores && ev.scores[sKey(by || myId(ev), pid, kid, sid)]; return r && r.v != null ? r.v : null; }
/* the value to show for this day: this day's own score, or (carry forward) the latest earlier day's */
function shownScore(ev, pid, kid, sid, by) {
  const own = getScore(ev, pid, kid, sid, by); if (own != null) return { v: own, carried: null };
  if (ev.form.combine !== 'carry') return { v: null, carried: null };
  const i = ev.sessions.findIndex(d => d.id === sid);
  for (let j = i - 1; j >= 0; j--) { const v = getScore(ev, pid, kid, ev.sessions[j].id, by); if (v != null) return { v, carried: ev.sessions[j] }; }
  return { v: null, carried: null };
}
function setScore(ev, pid, kid, sid, v) {
  ev.scores = ev.scores || {};
  ev.evaluators = ev.evaluators || {}; if (myName(ev)) ev.evaluators[myId(ev)] = myName(ev);
  ev.scores[sKey(myId(ev), pid, kid, sid)] = { id: uid('r'), v: v == null ? null : v, t: Date.now(), q: 1 };   // q: waiting to be sent
  syncSoon(ev);
  touch(ev);
}
function getNote(ev, pid, kid, sid) { const r = ev.notes && ev.notes[sKey(myId(ev), pid, kid, sid)]; return r ? r.v : ''; }
function setNote(ev, pid, kid, sid, v) { ev.notes = ev.notes || {}; ev.notes[sKey(myId(ev), pid, kid, sid)] = { id: uid('r'), v: clean(v, 300), t: Date.now(), q: 1 }; touch(ev); syncSoon(ev); }
/* how many of this player's skills (and tests) this evaluator has filled in on this day (carried scores count) */
function progressOf(ev, p, sid, by) {
  const ks = skillsFor(ev, p), all = ks.length + ev.form.tests.length;
  let done = 0; for (const k of ks.concat(ev.form.tests)) if (shownScore(ev, p.id, k.id, sid, by).v != null) done++;
  return { done, all };
}
/* players in a group ('all' = everyone this phone scores: an evaluator given certain groups sees only those) */
const groupPlayers = (ev, gid) => { const mine = myGroups(ev); return sortPlayers(ev.players.filter(p => !gid || gid === 'all' ? (!mine || mine.includes(p.group)) : p.group === gid)); };

/* ask the evaluator's name once (shown to the organizer next to their scores) */
async function ensureEvaluatorName() {
  const m = me(); if (m.name) return true;
  const v = await promptBox({ title: 'Your name', placeholder: 'For example: Coach Jeff', ok: 'Start scoring', max: 30, note: 'Shown next to your scores so the organizer knows who scored what.' });
  if (!v) return false; m.name = v; save(true); return true;
}
async function startScoring(ev) {
  ensureDays(ev);
  if (!ev.players.length) { toast('Add ' + W.players + ' first.'); return; }
  if (!ev.join && !(await ensureEvaluatorName())) return;
  let sid = (S.settings.day || {})[ev.id]; if (!ev.sessions.some(d => d.id === sid)) sid = ev.sessions[ev.sessions.length - 1].id;
  const goTo = gid => { S.settings.day = Object.assign({}, S.settings.day, { [ev.id]: sid }); save(); go('s', ev.id, sid, gid); };
  const mine = myGroups(ev), groups = ev.groups.filter(g => !mine || mine.includes(g.id));
  if (ev.sessions.length === 1 && (!ev.groups.length || (mine && groups.length === 1))) { goTo(mine && groups.length === 1 ? groups[0].id : 'all'); return; }
  openSheet((s, api) => {
    const dayBox = h('div');
    const paintDays = () => dayBox.replaceChildren(ev.sessions.length > 1 ? field('Day', chipPick(ev.sessions.map(d => [d.id, d.name]), sid, v => { sid = v; }, false)) : null);
    paintDays();
    s.append(h('h2', null, 'Start scoring'), h('div', { class: 'stack' }, dayBox,
      h('div', { class: 'field' }, h('label', null, groups.length ? 'Which group?' : cap(W.players)), h('div', { class: 'list', style: 'gap:8px' },
        groups.map(g => h('button', { class: 'item', onclick: () => { api.close(); goTo(g.id); } }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, g.name), h('div', { class: 'pmeta' }, [g.when, g.where, plural(ev.players.filter(p => p.group === g.id).length, W.player, W.players)].filter(Boolean).join(' · '))), icon('chev'))),
        h('button', { class: 'item', onclick: () => { api.close(); goTo('all'); } }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, mine ? 'All my groups' : 'Everyone'), h('div', { class: 'pmeta' }, plural(groupPlayers(ev, 'all').length, W.player, W.players))), icon('chev'))))));
  });
}

/* ---------------- pick a player: by number (keypad) or by name (full list) ---------------- */
let typed = '';
function viewScoreList(evId, sid, gid) {
  const ev = eventById(evId);
  if (!ev) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  ensureDays(ev); W = wordsOf(ev);
  const day = dayById(ev, sid); sid = day.id;
  const g = ev.groups.find(x => x.id === gid), all = groupPlayers(ev, g ? g.id : 'all');
  const ci = checkinFor(ev, sid), list = all.filter(ci.isHere), away = all.filter(p => !ci.isHere(p));
  const by = ['name', 'skill'].includes(S.settings.pickBy) ? S.settings.pickBy : 'number';
  const open = p => { typed = ''; go('s', ev.id, sid, gid, p.id); };
  const done = list.filter(p => { const pr = progressOf(ev, p, sid); return pr.all && pr.done === pr.all; }).length;   // of those here
  const status = p => { const pr = progressOf(ev, p, sid); return pr.all && pr.done === pr.all ? h('span', { class: 'pbadge full' }, 'Done') : pr.done ? h('span', { class: 'pbadge' }, pr.done + '/' + pr.all) : null; };
  let body;
  if (by === 'skill') body = scoreBySkill(ev, sid, list, away);
  else if (by === 'number') {
    const matches = typed ? all.filter(p => p.num === typed) : [];
    const anyStart = !typed || all.some(p => p.num.startsWith(typed));
    body = [
      h('div', { class: 'numshow' + (typed && !anyStart ? ' bad' : '') }, typed ? '#' + typed : 'Type a number'),
      h('div', { class: 'matchbox' }, typed && !anyStart ? h('p', { class: 'note' }, 'No ' + W.player + ' has that number' + (g ? ' in ' + g.name : '') + '.') : null,
        matches.map(p => h('button', { class: 'prow2', onclick: () => open(p) }, h('span', { class: 'jn' }, p.num), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, p.name || 'No name'), h('div', { class: 'pmeta' }, [p.pos, p.div, ci.isHere(p) ? null : 'not checked in'].filter(Boolean).join(' · ') || ' ')), status(p), icon('chev')))),
      h('div', { class: 'keypad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => h('button', { class: 'key' + (/\d/.test(k) ? '' : ' fn'), onclick: () => {
        if (k === 'C') typed = ''; else if (k === '⌫') typed = typed.slice(0, -1); else if (typed.length < 3) typed += k;
        const exact = all.filter(p => p.num === typed), longer = all.some(p => p.num !== typed && p.num.startsWith(typed));
        if (exact.length === 1 && !longer) { open(exact[0]); return; }
        render();
      } }, k)))];
  } else {
    const az = l => l.slice().sort((a, b) => (a.name || '~').localeCompare(b.name || '~') || (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
    const rowOf = p => h('button', { class: 'prow2' + (ci.isHere(p) ? '' : ' out'), onclick: () => open(p) },
      h('span', { class: 'jn' }, p.num || '–'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, p.name || 'No name'), h('div', { class: 'pmeta ellip' }, [p.pos, p.div].filter(Boolean).join(' · ') || ' ')), status(p));
    body = all.length ? [h('div', { class: 'list', style: 'gap:6px' }, az(list).map(rowOf)),
      away.length ? [sect('Not checked in', h('span', { class: 'cnt' }, away.length)), h('div', { class: 'list', style: 'gap:6px' }, az(away).map(rowOf))] : null] : h('div', { class: 'empty' }, 'No ' + W.players + ' in this group.');
  }
  return [topBar((g ? g.name : 'Everyone') + (ev.sessions.length > 1 ? ' · ' + day.name : ''), ['e', ev.id, 'players']),
    h('div', { class: 'subtabs' }, h('div', { class: 'seg' }, [['number', 'By number'], ['name', 'By name'], ['skill', 'By skill']].map(([k, l]) => h('button', { class: by === k ? 'on' : '', onclick: () => { S.settings.pickBy = k; typed = ''; save(); render(); } }, l)))),
    h('main', { class: 'page' },
      tip('scorelist', by === 'number' ? 'Type a jersey number. The ' + W.player + ' opens as soon as the number is unique.' : by === 'name' ? 'Tap a name to score. Done and 4/9 show how far you are.' : 'One skill at a time for every ' + W.player + '. Use the menu or the arrows to change skill.'),
      h('div', { class: 'row', style: 'margin:-4px 0 12px' }, h('div', { class: 'pmeta grow' }, 'Scoring as ' + myName(ev)), by === 'skill' ? null : h('span', { class: 'cnt' }, done + ' of ' + list.length + ' done')),
      ci.used && away.length && by !== 'name' ? h('p', { class: 'note', style: 'margin:-6px 0 10px' }, away.length + ' not checked in' + (by === 'skill' ? ' (at the bottom)' : '') + '.') : null,
      body,
      h('p', { class: 'note', style: 'margin-top:14px' }, 'Scores save on this phone as you tap, with or without signal.'))];
}

/* the small + beside a skill: a note on that skill for this player and day */
function skillNoteBtn(ev, p, k, sid) {
  const n = getNote(ev, p.id, k.id, sid);
  return h('button', { class: 'nbtn' + (n ? ' on' : ''), 'aria-label': 'Note for ' + k.name, onclick: async () => {
    const v = await promptBox({ title: (p.num ? '#' + p.num + ' ' : '') + k.name + ' note', value: n, placeholder: 'For example: drops elbow on serve', max: 200, note: 'Leave empty and save to remove the note.' });
    if (v === null) return; setNote(ev, p.id, k.id, sid, v); render();
  } }, n ? icon('edit', 16) : icon('plus', 16));
}
/* does this skill (or test) apply to this player? goalie skills only for goalies, the main list for everyone else */
function skillApplies(ev, p, kid) {
  const f = ev.form; if (f.tests.some(t => t.id === kid)) return true;
  if (!f.alt) return true;
  const isAlt = f.alt.skills.some(k => k.id === kid);
  return isAlt ? p.pos === f.alt.pos : p.pos !== f.alt.pos;
}
function skillChoices(ev) {
  const f = ev.form;
  return f.skills.map(k => [k, k.name]).concat(f.alt ? f.alt.skills.map(k => [k, k.name + ' (' + f.alt.pos.toLowerCase() + 's)']) : [], f.tests.map(t => [Object.assign({ test: true }, t), t.name + (t.unit ? ' (' + t.unit + ')' : '')]));
}

/* ---------------- by skill: one skill, every player ---------------- */
function scoreBySkill(ev, sid, list, away) {
  const choices = skillChoices(ev);
  if (!choices.length) return h('div', { class: 'empty' }, 'This form has no skills. Add some in the Form tab.');
  const pick = S.settings.skillPick = S.settings.skillPick || {};
  let ci = choices.findIndex(([k]) => k.id === pick[ev.id]); if (ci < 0) ci = 0;
  const [k, label] = choices[ci];
  const setK = i => { pick[ev.id] = choices[i][0].id; save(); render(); window.scrollTo(0, 0); };
  const rows = list.filter(p => skillApplies(ev, p, k.id)), awayRows = (away || []).filter(p => skillApplies(ev, p, k.id));
  const done = rows.filter(p => shownScore(ev, p.id, k.id, sid).v != null).length;
  const row = p => {
    const cur = shownScore(ev, p.id, k.id, sid), n = getNote(ev, p.id, k.id, sid);
    let ctl;
    if (k.test) {
      ctl = h('input', { class: 'inp', inputmode: 'decimal', value: cur.v == null ? '' : String(cur.v), placeholder: k.unit || '', style: 'max-width:130px' + (cur.carried ? ';color:var(--muted)' : ''), 'aria-label': (p.num || '') + ' ' + k.name });
      ctl.addEventListener('change', () => { const v = parseFloat(String(ctl.value).replace(',', '.')); setScore(ev, p.id, k.id, sid, isFinite(v) ? Math.round(v * 1000) / 1000 : null); render(); });
    } else {
      ctl = scoreControl(ev, p, k, sid, (p.num ? '#' + p.num + ' ' : '') + k.name);
    }
    return h('div', { class: 'srow skrow' + (awayRows.includes(p) ? ' out' : '') },
      h('div', { class: 'shead' }, h('span', { class: 'jn' }, p.num || '–'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, p.name || 'No name'), p.pos ? h('div', { class: 'pmeta' }, p.pos) : null),
        cur.carried ? h('span', { class: 'carry' }, 'from ' + cur.carried.name) : null, skillNoteBtn(ev, p, k, sid)),
      n ? h('div', { class: 'snote' }, n) : null, ctl);
  };
  return [
    h('div', { class: 'skillbar' },
      h('button', { class: 'mini', 'aria-label': 'Previous skill', disabled: ci === 0, onclick: () => setK(ci - 1) }, icon('back')),
      (() => { const el = h('select', { class: 'inp grow', 'aria-label': 'Skill', onchange: e => setK(+e.target.value) }, choices.map(([c, l], i) => h('option', { value: String(i), selected: i === ci }, l))); el.value = String(ci); return el; })(),
      h('button', { class: 'mini', 'aria-label': 'Next skill', disabled: ci === choices.length - 1, onclick: () => setK(ci + 1) }, icon('chev'))),
    h('div', { class: 'row', style: 'margin:8px 0 10px' }, h('span', { class: 'pmeta grow' }, k.test ? (k.better === 'low' ? 'Lower is better' : 'Higher is better') : 'Every tap is a ' + k.name.toLowerCase() + ' score'), h('span', { class: 'cnt' }, done + ' of ' + rows.length)),
    rows.length ? h('div', { class: 'stack', style: 'gap:8px' }, rows.map(row)) : h('div', { class: 'empty' }, 'No ' + W.players + ' here use this skill.'),
    awayRows.length ? [sect('Not checked in', h('span', { class: 'cnt' }, awayRows.length)), h('div', { class: 'stack', style: 'gap:8px' }, awayRows.map(row))] : null,
    ci < choices.length - 1 ? h('button', { class: 'btn primary block', style: 'margin-top:14px', onclick: () => setK(ci + 1) }, 'Next skill: ' + choices[ci + 1][1], icon('chev')) : h('p', { class: 'note center', style: 'margin-top:14px' }, 'That is the last skill.')];
}

/* ---------------- one player ---------------- */
function viewScorePlayer(evId, sid, gid, pid) {
  const ev = eventById(evId); const p = ev && ev.players.find(x => x.id === pid);
  if (!ev || !p) return viewScoreList(evId, sid, gid);
  ensureDays(ev); W = wordsOf(ev);
  const day = dayById(ev, sid); sid = day.id;
  const ks = skillsFor(ev, p), pr = progressOf(ev, p, sid);
  const ci = checkinFor(ev, sid), list = groupPlayers(ev, gid), i = list.findIndex(x => x.id === p.id);
  const nextUnscored = list.slice(i + 1).concat(list.slice(0, i)).find(x => { const q = progressOf(ev, x, sid); return q.done < q.all && ci.isHere(x); });
  const noteBtn = k => skillNoteBtn(ev, p, k, sid);
  const row = k => {
    const cur = shownScore(ev, p.id, k.id, sid), n = getNote(ev, p.id, k.id, sid);
    return h('div', { class: 'srow' },
      h('div', { class: 'shead' }, h('div', { class: 'sname grow' }, k.name), cur.carried ? h('span', { class: 'carry' }, 'from ' + cur.carried.name) : null, noteBtn(k)),
      n ? h('div', { class: 'snote' }, n) : null,
      scoreControl(ev, p, k, sid, k.name));
  };
  const testRow = t => {
    const cur = shownScore(ev, p.id, t.id, sid), n = getNote(ev, p.id, t.id, sid);
    const inp = h('input', { class: 'inp', inputmode: 'decimal', value: cur.v == null ? '' : String(cur.v), placeholder: t.unit || '', style: 'max-width:130px' + (cur.carried ? ';color:var(--muted)' : '') });
    inp.addEventListener('change', () => { const v = parseFloat(String(inp.value).replace(',', '.')); setScore(ev, p.id, t.id, sid, isFinite(v) ? Math.round(v * 1000) / 1000 : null); render(); });
    return h('div', { class: 'srow' },
      h('div', { class: 'shead' }, h('div', { class: 'sname grow' }, t.name, h('span', { class: 'pmeta' }, ' ' + (t.unit || '') + (t.better === 'low' ? ' · lower is better' : ''))), cur.carried ? h('span', { class: 'carry' }, 'from ' + cur.carried.name) : null, noteBtn(t)),
      n ? h('div', { class: 'snote' }, n) : null, inp);
  };
  const notes = h('textarea', { class: 'inp', style: 'min-height:70px', maxlength: '300', placeholder: 'Optional note about this ' + W.player });
  notes.value = getNote(ev, p.id, '', sid); notes.addEventListener('change', () => setNote(ev, p.id, '', sid, notes.value));
  return [topBar('#' + (p.num || '–') + ' ' + (p.name || ''), ['s', ev.id, sid, gid], h('span', { class: 'cnt', style: 'margin:0' }, pr.done + '/' + pr.all)),
    h('main', { class: 'page' },
      h('div', { class: 'pmeta', style: 'margin:-4px 0 10px' }, [p.pos, p.div, ev.sessions.length > 1 ? day.name : null, ci.isHere(p) ? null : 'not checked in'].filter(Boolean).join(' · ') || ' '),
      tip('scoreplayer', 'Tap a score. Tap it again to clear it. The small + beside a skill adds a note. Next goes to the next ' + W.player + ' not fully scored.'),
      ev.form.combine === 'carry' && ev.sessions.length > 1 && ev.sessions[0].id !== sid ? h('p', { class: 'note', style: 'margin-bottom:10px' }, 'Faded scores are carried from an earlier day. Tap a score to change it for ' + day.name + '.') : null,
      ks.length ? h('div', { class: 'stack' }, ks.map(row)) : h('div', { class: 'empty' }, 'This form has no skills. Add some in the Form tab.'),
      ev.form.tests.length ? [sect('Measured tests'), h('div', { class: 'stack' }, ev.form.tests.map(testRow))] : null,
      sect('Overall note'), notes,
      h('div', { class: 'toprow', style: 'margin-top:18px' },
        h('button', { class: 'btn', onclick: () => go('s', ev.id, sid, gid) }, 'All ' + W.players),
        nextUnscored ? h('button', { class: 'btn primary', onclick: () => goReplace('s', ev.id, sid, gid, nextUnscored.id) }, 'Next: #' + (nextUnscored.num || '–'), icon('chev')) : h('button', { class: 'btn primary', onclick: () => { go('s', ev.id, sid, gid); toast('Everyone here is scored.'); } }, 'Done')))];
}

/* progress on the organizer's player list (latest day) */
function progressBadge(ev, p) { ensureDays(ev); const sid = ev.sessions[ev.sessions.length - 1].id; const pr = progressOf(ev, p, sid); if (!pr.done) return null; return h('span', { class: 'pbadge' + (pr.done === pr.all ? ' full' : '') }, pr.done === pr.all ? 'Scored' : pr.done + '/' + pr.all); }

/* ---------------- days, in the Form tab ---------------- */
function daysEditor(ev) {
  ensureDays(ev);
  const f = ev.form;
  return [sect('Days', h('span', { class: 'cnt' }, ev.sessions.length)),
    h('p', { class: 'note', style: 'margin-bottom:10px' }, 'For a ' + W.tryout + ' over more than one day. Evaluators pick the day when they start scoring.'),
    h('div', { class: 'chips' }, ev.sessions.map((d, i) => h('button', { class: 'chip', onclick: async () => {
      const v = await promptBox({ title: 'Rename or remove', value: d.name, note: ev.sessions.length > 1 ? 'Clear the box and save to remove this day (its scores are hidden).' : null });
      if (v === null) return; if (v) d.name = v; else if (ev.sessions.length > 1) ev.sessions.splice(i, 1); touch(ev); render();
    } }, d.name)), h('button', { class: 'chip add', onclick: () => { ev.sessions.push({ id: uid('d'), name: 'Day ' + (ev.sessions.length + 1) }); touch(ev); render(); } }, icon('plus'), 'Add day')),
    ev.sessions.length > 1 ? [h('div', { class: 'lbl', style: 'margin:14px 0 8px' }, 'How the days count'),
      h('div', { class: 'list', style: 'gap:8px' }, COMBINE.map(([k, l]) => h('button', { class: 'prow' + ((f.combine || 'avg') === k ? ' on' : ''), style: 'font-size:15px;min-height:56px', onclick: () => { f.combine = k; touch(ev); render(); } },
        h('div', { class: 'grow' }, l, h('div', { class: 'pmeta', style: 'font-weight:600' }, k === 'avg' ? 'Score each day fresh. Results use the average of the days.' : k === 'total' ? 'Score each day fresh. Results add the days together.' : 'One score per skill. Each day starts with the last score; tap to change it.')),
        (f.combine || 'avg') === k ? icon('check') : null)))] : null];
}
