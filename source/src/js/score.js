/* =====================================================================
   Scoring (stage 2, step 1: one phone). Two taps per score: tap a jersey number, tap a score.
   Scores are records keyed evaluator|player|skill, newest wins. Each change gets a new id and time,
   so step 2 can send them to the server as append-only records (latest per evaluator, player, skill wins).
   ev.scores = { 'me|p..|k..': { id, v, t } }   v: number, or null when cleared
   ev.notes  = { 'me|p..':     { id, v, t } }   v: text
   ===================================================================== */
const PCM = [[3, '+'], [2, '✓'], [1, '−']];
function scaleValues(scale) { return scale === 'pcm' ? PCM : Array.from({ length: scale === '10' ? 10 : 5 }, (_, i) => [i + 1, String(i + 1)]); }
const me = () => { if (!S.settings.me) { S.settings.me = { id: uid('v'), name: '' }; save(); } return S.settings.me; };
const sKey = (by, pid, kid) => by + '|' + pid + '|' + kid;

function skillsFor(ev, p) { const f = ev.form; return f.alt && p && p.pos === f.alt.pos ? f.alt.skills : f.skills; }
function getScore(ev, pid, kid, by) { const r = ev.scores && ev.scores[sKey(by || me().id, pid, kid)]; return r && r.v != null ? r.v : null; }
function setScore(ev, pid, kid, v) {
  ev.scores = ev.scores || {};
  ev.scores[sKey(me().id, pid, kid)] = { id: uid('r'), v: v == null ? null : v, t: Date.now() };
  touch(ev);
}
function getNote(ev, pid) { const r = ev.notes && ev.notes[me().id + '|' + pid]; return r ? r.v : ''; }
function setNote(ev, pid, v) { ev.notes = ev.notes || {}; ev.notes[me().id + '|' + pid] = { id: uid('r'), v: clean(v, 300), t: Date.now() }; touch(ev); }
/* how many of this player's skills (and tests) this evaluator has filled in */
function progressOf(ev, p, by) {
  const ks = skillsFor(ev, p), all = ks.length + ev.form.tests.length;
  let done = 0; for (const k of ks) if (getScore(ev, p.id, k.id, by) != null) done++;
  for (const t of ev.form.tests) if (getScore(ev, p.id, t.id, by) != null) done++;
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
  if (!ev.players.length) { toast('Add ' + W.players + ' first.'); return; }
  if (!(await ensureEvaluatorName())) return;
  if (!ev.groups.length) { go('s', ev.id, 'all'); return; }
  openSheet((s, api) => {
    s.append(h('h2', null, 'Which group are you scoring?'), h('div', { class: 'list', style: 'gap:8px' },
      ev.groups.map(g => h('button', { class: 'item', onclick: () => { api.close(); go('s', ev.id, g.id); } }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, g.name), h('div', { class: 'pmeta' }, [g.when, g.where, plural(ev.players.filter(p => p.group === g.id).length, W.player, W.players)].filter(Boolean).join(' · '))), icon('chev'))),
      h('button', { class: 'item', onclick: () => { api.close(); go('s', ev.id, 'all'); } }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'Everyone'), h('div', { class: 'pmeta' }, plural(ev.players.length, W.player, W.players))), icon('chev'))));
  });
}

/* ---------------- the number screen ---------------- */
let typed = '';
function viewScoreList(evId, gid) {
  const ev = eventById(evId);
  if (!ev) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  W = wordsOf(ev);
  const g = ev.groups.find(x => x.id === gid), list = groupPlayers(ev, g ? g.id : 'all');
  const match = typed ? list.filter(p => p.num === typed) : [];
  const keypad = h('div', { class: 'keypad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => h('button', { class: 'key' + (/\d/.test(k) ? '' : ' fn'), onclick: () => {
      if (k === 'C') typed = ''; else if (k === '⌫') typed = typed.slice(0, -1); else if (typed.length < 3) typed += k;
      const exact = list.filter(p => p.num === typed), longer = list.some(p => p.num !== typed && p.num.startsWith(typed));
      if (exact.length === 1 && !longer) { const pid = exact[0].id; typed = ''; go('s', ev.id, gid, pid); return; }
      render();
    } }, k)));
  const done = list.filter(p => { const pr = progressOf(ev, p); return pr.all && pr.done === pr.all; }).length;
  return [topBar((g ? g.name : 'Everyone') + ' · scoring', ['e', ev.id, 'players']),
    h('main', { class: 'page' },
      h('div', { class: 'pmeta', style: 'margin:-4px 0 10px' }, ev.name + ' · scoring as ' + me().name),
      h('div', { class: 'numshow' + (typed && !match.length && !list.some(p => p.num.startsWith(typed)) ? ' bad' : '') },
        typed ? '#' + typed : 'Type a number',
        match.length ? h('button', { class: 'btn primary sm', onclick: () => { typed = ''; go('s', ev.id, gid, match[0].id); } }, 'Score ' + (match[0].name || '#' + match[0].num)) : null),
      keypad,
      sect('Or tap a ' + W.player, h('span', { class: 'cnt' }, done + ' of ' + list.length + ' done')),
      list.length ? h('div', { class: 'tiles2' }, list.map(p => {
        const pr = progressOf(ev, p), full = pr.all && pr.done === pr.all;
        return h('button', { class: 'ntile' + (full ? ' full' : pr.done ? ' part' : '') + (p.present === false ? ' out' : ''), onclick: () => { typed = ''; go('s', ev.id, gid, p.id); } },
          h('b', null, p.num || '–'), h('span', { class: 'ellip' }, (p.name || '').split(' ')[0]), full ? icon('check', 14) : pr.done ? h('i', null, pr.done + '/' + pr.all) : null);
      })) : h('div', { class: 'empty' }, 'No ' + W.players + ' in this group.'),
      h('p', { class: 'note', style: 'margin-top:14px' }, 'Scores save on this phone as you tap, with or without signal.'))];
}

/* ---------------- one player ---------------- */
function viewScorePlayer(evId, gid, pid) {
  const ev = eventById(evId); const p = ev && ev.players.find(x => x.id === pid);
  if (!ev || !p) return viewScoreList(evId, gid);
  W = wordsOf(ev);
  const ks = skillsFor(ev, p), vals = scaleValues(ev.form.scale), pr = progressOf(ev, p);
  const list = groupPlayers(ev, gid), i = list.findIndex(x => x.id === p.id);
  const nextUnscored = list.slice(i + 1).concat(list.slice(0, i)).find(x => { const q = progressOf(ev, x); return q.done < q.all; });
  const row = k => h('div', { class: 'srow' },
    h('div', { class: 'sname' }, k.name),
    h('div', { class: 'sbtns n' + vals.length }, vals.map(([v, l]) => h('button', { class: 'sb' + (getScore(ev, p.id, k.id) === v ? ' on' : ''), 'aria-label': k.name + ' ' + l, onclick: () => { setScore(ev, p.id, k.id, getScore(ev, p.id, k.id) === v ? null : v); render(); } }, l))));
  const testRow = t => {
    const cur = getScore(ev, p.id, t.id);
    const inp = h('input', { class: 'inp', inputmode: 'decimal', value: cur == null ? '' : String(cur), placeholder: t.unit || '', style: 'max-width:130px' });
    inp.addEventListener('change', () => { const v = parseFloat(String(inp.value).replace(',', '.')); setScore(ev, p.id, t.id, isFinite(v) ? Math.round(v * 1000) / 1000 : null); render(); });
    return h('div', { class: 'srow' }, h('div', { class: 'sname' }, t.name, h('span', { class: 'pmeta' }, ' ' + (t.unit || '') + (t.better === 'low' ? ' · lower is better' : ''))), inp);
  };
  const notes = h('textarea', { class: 'inp', style: 'min-height:70px', maxlength: '300', placeholder: 'Optional note about this ' + W.player });
  notes.value = getNote(ev, p.id); notes.addEventListener('change', () => setNote(ev, p.id, notes.value));
  return [topBar('#' + (p.num || '–') + ' ' + (p.name || ''), ['s', ev.id, gid], h('span', { class: 'cnt', style: 'margin:0' }, pr.done + '/' + pr.all)),
    h('main', { class: 'page' },
      h('div', { class: 'pmeta', style: 'margin:-4px 0 10px' }, [p.pos, p.div, p.present === false ? 'not checked in' : null].filter(Boolean).join(' · ') || ' '),
      ks.length ? h('div', { class: 'stack' }, ks.map(row)) : h('div', { class: 'empty' }, 'This form has no skills. Add some in the Form tab.'),
      ev.form.tests.length ? [sect('Measured tests'), h('div', { class: 'stack' }, ev.form.tests.map(testRow))] : null,
      sect('Note'), notes,
      h('div', { class: 'toprow', style: 'margin-top:18px' },
        h('button', { class: 'btn', onclick: () => go('s', ev.id, gid) }, 'All numbers'),
        nextUnscored ? h('button', { class: 'btn primary', onclick: () => go('s', ev.id, gid, nextUnscored.id) }, 'Next: #' + (nextUnscored.num || '–'), icon('chev')) : h('button', { class: 'btn primary', onclick: () => { go('s', ev.id, gid); toast('Everyone in this group is scored.'); } }, 'Done')))];
}

/* progress on the organizer's player list */
function progressBadge(ev, p) { const pr = progressOf(ev, p); if (!pr.done) return null; return h('span', { class: 'pbadge' + (pr.done === pr.all ? ' full' : '') }, pr.done === pr.all ? 'Scored' : pr.done + '/' + pr.all); }
