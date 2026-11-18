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
function scaleValues(scale) { return scale === 'pcm' ? PCM : Array.from({ length: scale === '10' ? 10 : 5 }, (_, i) => [i + 1, String(i + 1)]); }
const me = () => { if (!S.settings.me) { S.settings.me = { id: uid('v'), name: '' }; save(); } return S.settings.me; };
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
function getScore(ev, pid, kid, sid, by) { const r = ev.scores && ev.scores[sKey(by || me().id, pid, kid, sid)]; return r && r.v != null ? r.v : null; }
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
  ev.scores[sKey(me().id, pid, kid, sid)] = { id: uid('r'), v: v == null ? null : v, t: Date.now() };
  touch(ev);
}
function getNote(ev, pid, kid, sid) { const r = ev.notes && ev.notes[sKey(me().id, pid, kid, sid)]; return r ? r.v : ''; }
function setNote(ev, pid, kid, sid, v) { ev.notes = ev.notes || {}; ev.notes[sKey(me().id, pid, kid, sid)] = { id: uid('r'), v: clean(v, 300), t: Date.now() }; touch(ev); }
/* how many of this player's skills (and tests) this evaluator has filled in on this day (carried scores count) */
function progressOf(ev, p, sid, by) {
  const ks = skillsFor(ev, p), all = ks.length + ev.form.tests.length;
  let done = 0; for (const k of ks.concat(ev.form.tests)) if (shownScore(ev, p.id, k.id, sid, by).v != null) done++;
  return { done, all };
}
const groupPlayers = (ev, gid) => sortPlayers(ev.players.filter(p => !gid || gid === 'all' || p.group === gid));

/* ask the evaluator's name once (shown to the organizer next to their scores) */
async function ensureEvaluatorName() {
  const m = me(); if (m.name) return true;
  const v = await promptBox({ title: 'Your name', placeholder: 'For example: Coach Jeff', ok: 'Start scoring', max: 30, note: 'Shown next to your scores so the organizer knows who scored what.' });
  if (!v) return false; m.name = v; save(true); return true;
}
async function startScoring(ev) {
  ensureDays(ev);
  if (!ev.players.length) { toast('Add ' + W.players + ' first.'); return; }
  if (!(await ensureEvaluatorName())) return;
  let sid = (S.settings.day || {})[ev.id]; if (!ev.sessions.some(d => d.id === sid)) sid = ev.sessions[ev.sessions.length - 1].id;
  const goTo = gid => { S.settings.day = Object.assign({}, S.settings.day, { [ev.id]: sid }); save(); go('s', ev.id, sid, gid); };
  if (!ev.groups.length && ev.sessions.length === 1) { goTo('all'); return; }
  openSheet((s, api) => {
    const dayBox = h('div');
    const paintDays = () => dayBox.replaceChildren(ev.sessions.length > 1 ? field('Day', chipPick(ev.sessions.map(d => [d.id, d.name]), sid, v => { sid = v; }, false)) : null);
    paintDays();
    s.append(h('h2', null, 'Start scoring'), h('div', { class: 'stack' }, dayBox,
      h('div', { class: 'field' }, h('label', null, ev.groups.length ? 'Which group?' : cap(W.players)), h('div', { class: 'list', style: 'gap:8px' },
        ev.groups.map(g => h('button', { class: 'item', onclick: () => { api.close(); goTo(g.id); } }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, g.name), h('div', { class: 'pmeta' }, [g.when, g.where, plural(ev.players.filter(p => p.group === g.id).length, W.player, W.players)].filter(Boolean).join(' · '))), icon('chev'))),
        h('button', { class: 'item', onclick: () => { api.close(); goTo('all'); } }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'Everyone'), h('div', { class: 'pmeta' }, plural(ev.players.length, W.player, W.players))), icon('chev'))))));
  });
}

/* ---------------- pick a player: by number (keypad) or by name (full list) ---------------- */
let typed = '';
function viewScoreList(evId, sid, gid) {
  const ev = eventById(evId);
  if (!ev) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  ensureDays(ev); W = wordsOf(ev);
  const day = dayById(ev, sid); sid = day.id;
  const g = ev.groups.find(x => x.id === gid), list = groupPlayers(ev, g ? g.id : 'all');
  const by = S.settings.pickBy === 'name' ? 'name' : 'number';
  const open = p => { typed = ''; go('s', ev.id, sid, gid, p.id); };
  const done = list.filter(p => { const pr = progressOf(ev, p, sid); return pr.all && pr.done === pr.all; }).length;
  const status = p => { const pr = progressOf(ev, p, sid); return pr.all && pr.done === pr.all ? h('span', { class: 'pbadge full' }, 'Done') : pr.done ? h('span', { class: 'pbadge' }, pr.done + '/' + pr.all) : null; };
  let body;
  if (by === 'number') {
    const matches = typed ? list.filter(p => p.num === typed) : [];
    const anyStart = !typed || list.some(p => p.num.startsWith(typed));
    body = [
      h('div', { class: 'numshow' + (typed && !anyStart ? ' bad' : '') }, typed ? '#' + typed : 'Type a number'),
      h('div', { class: 'matchbox' }, typed && !anyStart ? h('p', { class: 'note' }, 'No ' + W.player + ' has that number' + (g ? ' in ' + g.name : '') + '.') : null,
        matches.map(p => h('button', { class: 'prow2', onclick: () => open(p) }, h('span', { class: 'jn' }, p.num), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, p.name || 'No name'), h('div', { class: 'pmeta' }, [p.pos, p.div].filter(Boolean).join(' · ') || ' ')), status(p), icon('chev')))),
      h('div', { class: 'keypad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => h('button', { class: 'key' + (/\d/.test(k) ? '' : ' fn'), onclick: () => {
        if (k === 'C') typed = ''; else if (k === '⌫') typed = typed.slice(0, -1); else if (typed.length < 3) typed += k;
        const exact = list.filter(p => p.num === typed), longer = list.some(p => p.num !== typed && p.num.startsWith(typed));
        if (exact.length === 1 && !longer) { open(exact[0]); return; }
        render();
      } }, k)))];
  } else {
    const byName = list.slice().sort((a, b) => (a.name || '~').localeCompare(b.name || '~') || (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
    body = byName.length ? h('div', { class: 'list', style: 'gap:6px' }, byName.map(p => h('button', { class: 'prow2' + (p.present === false ? ' out' : ''), onclick: () => open(p) },
      h('span', { class: 'jn' }, p.num || '–'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, p.name || 'No name'), h('div', { class: 'pmeta ellip' }, [p.pos, p.div].filter(Boolean).join(' · ') || ' ')), status(p)))) : h('div', { class: 'empty' }, 'No ' + W.players + ' in this group.');
  }
  return [topBar((g ? g.name : 'Everyone') + (ev.sessions.length > 1 ? ' · ' + day.name : ''), ['e', ev.id, 'players']),
    h('div', { class: 'subtabs' }, h('div', { class: 'seg' }, [['number', 'By number'], ['name', 'By name']].map(([k, l]) => h('button', { class: by === k ? 'on' : '', onclick: () => { S.settings.pickBy = k; typed = ''; save(); render(); } }, l)))),
    h('main', { class: 'page' },
      h('div', { class: 'row', style: 'margin:-4px 0 12px' }, h('div', { class: 'pmeta grow' }, 'Scoring as ' + me().name), h('span', { class: 'cnt' }, done + ' of ' + list.length + ' done')),
      body,
      h('p', { class: 'note', style: 'margin-top:14px' }, 'Scores save on this phone as you tap, with or without signal.'))];
}

/* ---------------- one player ---------------- */
function viewScorePlayer(evId, sid, gid, pid) {
  const ev = eventById(evId); const p = ev && ev.players.find(x => x.id === pid);
  if (!ev || !p) return viewScoreList(evId, sid, gid);
  ensureDays(ev); W = wordsOf(ev);
  const day = dayById(ev, sid); sid = day.id;
  const ks = skillsFor(ev, p), vals = scaleValues(ev.form.scale), pr = progressOf(ev, p, sid);
  const list = groupPlayers(ev, gid), i = list.findIndex(x => x.id === p.id);
  const nextUnscored = list.slice(i + 1).concat(list.slice(0, i)).find(x => { const q = progressOf(ev, x, sid); return q.done < q.all; });
  const noteBtn = k => {
    const n = getNote(ev, p.id, k.id, sid);
    return h('button', { class: 'nbtn' + (n ? ' on' : ''), 'aria-label': 'Note for ' + k.name, onclick: async () => {
      const v = await promptBox({ title: k.name + ' note', value: n, placeholder: 'For example: drops elbow on serve', max: 200, note: 'Leave empty and save to remove the note.' });
      if (v === null) return; setNote(ev, p.id, k.id, sid, v); render();
    } }, n ? icon('edit', 16) : icon('plus', 16));
  };
  const row = k => {
    const cur = shownScore(ev, p.id, k.id, sid), n = getNote(ev, p.id, k.id, sid);
    return h('div', { class: 'srow' },
      h('div', { class: 'shead' }, h('div', { class: 'sname grow' }, k.name), cur.carried ? h('span', { class: 'carry' }, 'from ' + cur.carried.name) : null, noteBtn(k)),
      n ? h('div', { class: 'snote' }, n) : null,
      h('div', { class: 'sbtns n' + vals.length }, vals.map(([v, l]) => h('button', { class: 'sb' + (cur.v === v ? (cur.carried ? ' carried' : ' on') : ''), 'aria-label': k.name + ' ' + l, onclick: () => {
        const own = getScore(ev, p.id, k.id, sid);
        setScore(ev, p.id, k.id, sid, own === v ? null : v); render();
      } }, l))));
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
      h('div', { class: 'pmeta', style: 'margin:-4px 0 10px' }, [p.pos, p.div, ev.sessions.length > 1 ? day.name : null, p.present === false ? 'not checked in' : null].filter(Boolean).join(' · ') || ' '),
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
