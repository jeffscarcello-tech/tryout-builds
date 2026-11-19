/* =====================================================================
   Check-in (per day) and evaluator groups.
   A check-in is a record like a score: ev.checks['by|pid||sid'] = { id, v: 1 here | 0 not here, t, q }.
   The newest record for a player and day wins, whoever made it (the organizer, or an evaluator allowed to check in).
   A day "uses check-in" once anyone is marked here that day; until then everyone counts as here.
   Evaluators get the organizer's combined list in the event copy (ev.checkMap = { sid: { pid: [v, t] } }),
   which groups they score (ev.assign = { vid: [gid] }) and who may check in (ev.helpers = [vid]).
   ===================================================================== */
function ensureChecks(ev) {
  if (ev.checks) return;
  ev.checks = {};
  if (ev.players.some(p => p.present === false)) {   // the old single "checked in" switch becomes the latest day's check-in
    const sid = ev.sessions[ev.sessions.length - 1].id, t = Date.now();
    for (const p of ev.players) ev.checks[myId(ev) + '|' + p.id + '||' + sid] = { id: uid('c'), v: p.present === false ? 0 : 1, t };
  }
  for (const p of ev.players) delete p.present;
}
/* who is here on a day: { used, here: Map(pid -> true/false) } */
function checkinFor(ev, sid) {
  ensureChecks(ev);
  const best = new Map();
  const put = (pid, v, t, id) => { const b = best.get(pid); if (!b || t > b.t || (t === b.t && id > b.id)) best.set(pid, { v, t, id }); };
  const m = ev.checkMap && ev.checkMap[sid];
  if (m) for (const pid in m) put(pid, m[pid][0], m[pid][1], '');
  for (const k in ev.checks) { const parts = k.split('|'); if (parts[3] === sid) { const r = ev.checks[k]; put(parts[1], r.v, r.t, r.id); } }
  const here = new Map(); let used = false;
  for (const [pid, b] of best) { here.set(pid, b.v === 1); if (b.v === 1) used = true; }
  return { used, here, best, isHere: p => !used || here.get(p.id) === true, count: [...here.values()].filter(Boolean).length };
}
function setHere(ev, pid, sid, v) {
  ensureChecks(ev);
  ev.checks[myId(ev) + '|' + pid + '||' + sid] = { id: uid('c'), v: v ? 1 : 0, t: Date.now(), q: 1 };
  touch(ev); syncSoon(ev);
}
/* the combined list the organizer sends to evaluators */
function checkMapOf(ev) {
  const out = {};
  for (const d of ev.sessions || []) { const ci = checkinFor(ev, d.id); if (ci.best.size) { out[d.id] = {}; for (const [pid, b] of ci.best) out[d.id][pid] = [b.v, b.t]; } }
  return out;
}
/* groups this phone scores: null = all */
function myGroups(ev) {
  const a = ev.join ? ev.assign : (ev.share && ev.share.assign);
  const g = ev.join && a ? a[myId(ev)] : null;
  return g && g.length ? g.filter(id => ev.groups.some(x => x.id === id)) : null;
}
const canCheckIn = ev => !ev.join || (ev.helpers || []).includes(myId(ev));
const latestDay = ev => { ensureDays(ev); return ev.sessions[ev.sessions.length - 1].id; };
const todayDay = ev => { ensureDays(ev); const s = (S.settings.day || {})[ev.id]; return ev.sessions.some(d => d.id === s) ? s : latestDay(ev); };

/* ---------------- the check-in screen ---------------- */
let ckGroup = 'all', ckTyped = '';
function viewCheckin(evId, sid) {
  const ev = eventById(evId);
  if (!ev) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  ensureDays(ev); W = wordsOf(ev);
  const day = dayById(ev, sid); sid = day.id;
  const mine = myGroups(ev), groups = ev.groups.filter(g => !mine || mine.includes(g.id));
  if (ckGroup !== 'all' && ckGroup !== 'none' && !groups.some(g => g.id === ckGroup)) ckGroup = 'all';
  const base = groupPlayers(ev, 'all');
  const list = base.filter(p => ckGroup === 'all' || (ckGroup === 'none' ? !ev.groups.some(g => g.id === p.group) : p.group === ckGroup)).filter(p => !ckTyped || (p.num || '').startsWith(ckTyped) || (p.name || '').toLowerCase().includes(ckTyped.toLowerCase()));
  const ci = checkinFor(ev, sid);
  const isIn = p => ci.here.get(p.id) === true;
  const search = h('input', { class: 'inp', value: ckTyped, placeholder: 'Find by number or name', inputmode: 'search', autocomplete: 'off', 'aria-label': 'Find' });
  search.addEventListener('input', () => { ckTyped = search.value.trim(); render(); setTimeout(() => { const s = document.querySelector('.ckfind input'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 0); });
  const back = ev.join ? ['e', ev.id] : ['e', ev.id, 'players'];
  return [topBar('Check-in' + (ev.sessions.length > 1 ? ' · ' + day.name : ''), back, h('span', { class: 'cnt', style: 'margin:0' }, ci.count + ' of ' + base.length + ' here')),
    h('main', { class: 'page' },
      tip('checkin', 'Tap a ' + W.player + ' when they arrive. Tap again if you made a mistake. ' + cap(W.players) + ' not checked in move to the bottom of the scoring lists and are skipped by Next.'),
      ev.sessions.length > 1 ? h('div', { class: 'seg', style: 'margin-bottom:10px' }, ev.sessions.map(d => h('button', { class: d.id === sid ? 'on' : '', onclick: () => goReplace('k', ev.id, d.id) }, d.name))) : null,
      h('div', { class: 'ckfind' }, search),
      groups.length ? h('div', { class: 'hscroll', style: 'margin-top:10px' }, [['all', mine ? 'My groups' : 'Everyone']].concat(groups.map(g => [g.id, g.name])).map(([k, l]) => h('button', { class: 'chip' + (ckGroup === k ? ' on' : ''), onclick: () => { ckGroup = k; render(); } }, l))) : null,
      sect(list.length + ' ' + (list.length === 1 ? W.player : W.players), h('span', { class: 'cnt' }, list.filter(isIn).length + ' here')),
      list.length ? h('div', { class: 'list', style: 'gap:6px' }, list.map(p => h('button', { class: 'ckrow' + (isIn(p) ? ' on' : ''), 'aria-pressed': isIn(p) ? 'true' : 'false', onclick: () => { setHere(ev, p.id, sid, !isIn(p)); render(); } },
        h('span', { class: 'jn' }, p.num || '–'), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, p.name || 'No name'), h('div', { class: 'pmeta ellip' }, [p.pos, (ev.groups.find(g => g.id === p.group) || {}).name].filter(Boolean).join(' · ') || ' ')),
        h('span', { class: 'ckbox' }, isIn(p) ? icon('check') : null)))) : h('div', { class: 'empty' }, ckTyped ? 'Nobody matches.' : 'No ' + W.players + ' here.'),
      list.length && !ckTyped ? h('div', { class: 'toprow', style: 'margin-top:14px' },
        h('button', { class: 'btn', onclick: async () => { if (!(await confirmBox({ title: 'Mark all ' + list.length + ' here?', ok: 'Mark here' }))) return; list.forEach(p => { if (!isIn(p)) setHere(ev, p.id, sid, true); }); render(); } }, 'Mark all here'),
        ci.count ? h('button', { class: 'btn ghost', onclick: async () => { if (!(await confirmBox({ title: 'Clear check-in for these ' + list.length + '?', message: 'Use this to start a day over.', ok: 'Clear', danger: true }))) return; list.forEach(p => { if (ci.here.has(p.id)) setHere(ev, p.id, sid, false); }); render(); } }, 'Clear') : null) : null,
      ev.join ? null : h('p', { class: 'note', style: 'margin-top:12px' }, 'Evaluators you allow (Share with evaluators) can check in from their phones too. Everyone sees the same list.'))];
}
