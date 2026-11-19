/* =====================================================================
   Several phones (stage 2, step 2).
   Organizer: Share with evaluators -> the server gives a 6-letter join code and a secret organizer key (kept on this phone).
   Evaluator: Join with the code and a name -> a copy of the event (roster and form only) and their own token.
   Every score and note is a record with an id made on the phone. Records wait on the phone (q = 1) and are sent
   when there is signal; the server ignores ids it already has, so sending twice is harmless. On the phones the newest
   record per evaluator, player, skill and day wins. Evaluators only get their own records back; the organizer gets all.
   ev.share = { code, key, since, sent }    (organizer; sent = the roster and form last sent)
   ev.join  = { vid, tok, name, since, rev } (evaluator)
   ===================================================================== */
const SYNC = { busy: {}, fails: 0, state: {}, timer: null, soon: {} };
const isShared = ev => !!(ev && (ev.share || ev.join));
/* what evaluators get: no private notes about players */
const payloadOf = ev => ({ name: ev.name, sport: ev.sport, form: ev.form, groups: ev.groups, players: ev.players.map(p => ({ id: p.id, num: p.num, name: p.name, pos: p.pos, div: p.div, group: p.group, })), sessions: ev.sessions || [],
  assign: (ev.share && ev.share.assign) || {}, helpers: (ev.share && ev.share.helpers) || [], checks: checkMapOf(ev) });
const boxes = ev => [ev.scores || {}, ev.notes || {}, ev.checks || {}];
function waitingCount(ev) { let n = 0; for (const o of boxes(ev)) for (const k in o) if (o[k] && o[k].q) n++; return n; }

async function api(path, body, headers) {
  const r = await fetch(path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body || {}) });
  let j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) { const e = new Error(j.hint || j.error || ('Error ' + r.status)); e.status = r.status; e.code = j.error; throw e; }
  return j;
}
const authOf = ev => ev.share ? { 'X-Key': ev.share.key } : { 'X-Eval': ev.join.vid + '.' + ev.join.tok };

/* put records from the server into the event: newest per evaluator/player/skill/day wins, never overwriting one still waiting to go */
function mergeRecs(ev, recs) {
  let changed = 0;
  for (const r of recs || []) {
    const box = r.k === 'n' ? (ev.notes = ev.notes || {}) : r.k === 'c' ? (ev.checks = ev.checks || {}) : (ev.scores = ev.scores || {});
    const key = r.by + '|' + r.p + '|' + (r.s || '') + '|' + r.d, cur = box[key];
    if (cur && cur.id === r.id) { if (cur.q) { delete cur.q; } continue; }
    if (cur && (cur.t > r.t || (cur.t === r.t && cur.id > r.id))) continue;
    box[key] = { id: r.id, v: r.v, t: r.t }; changed++;
  }
  return changed;
}
function queued(ev, max) {
  const out = [];
  for (const [box, k] of [[ev.scores || {}, 's'], [ev.notes || {}, 'n'], [ev.checks || {}, 'c']]) for (const key in box) {
    const r = box[key]; if (!r || !r.q) continue;
    const [by, p, s, d] = key.split('|'); if (by !== myId(ev)) { delete r.q; continue; }
    out.push({ id: r.id, k, by, p, s: s || '', d, v: r.v, t: r.t }); if (out.length >= max) return out;
  }
  return out;
}

async function syncEvent(ev) {
  if (!isShared(ev) || SYNC.busy[ev.id] || (ev.share && ev.share.gone) || (ev.join && (ev.join.gone || ev.join.removed))) return false;
  if (!navigator.onLine) { SYNC.state[ev.id] = { off: true, at: Date.now() }; return false; }
  SYNC.busy[ev.id] = true; let got = 0;
  try {
    const box = ev.share || ev.join;
    const push = async () => {   // the organizer's roster, groups, form, check-in and evaluator settings, when they changed
      if (!ev.share) return;
      const data = payloadOf(ev), txt = JSON.stringify(data);
      if (txt !== ev.share.sent) { const j = await api('/api/ev/' + ev.id + '/put', { data, rev: Date.now() }, authOf(ev)); ev.share.sent = txt; ev.share.rev = j.rev; }
    };
    await push();
    for (let round = 0; round < 12; round++) {
      const recs = queued(ev, 400);
      const j = await api('/api/ev/' + ev.id + '/sync', { since: box.since || 0, rev: ev.join ? ev.join.rev : undefined, recs }, authOf(ev));
      const sent = new Set(recs.map(r => r.id));
      for (const o of boxes(ev)) for (const k in o) if (o[k] && o[k].q && sent.has(o[k].id)) delete o[k].q;
      got += mergeRecs(ev, j.recs);
      box.since = j.seq;
      if (j.data && ev.join) { Object.assign(ev, { name: j.data.name, sport: j.data.sport, form: j.data.form, groups: j.data.groups, players: j.data.players, sessions: j.data.sessions && j.data.sessions.length ? j.data.sessions : ev.sessions, assign: j.data.assign || {}, helpers: j.data.helpers || [], checkMap: j.data.checks || {} }); ev.join.rev = j.rev; got++; }
      if (j.evaluators) { ev.evaluators = ev.evaluators || {}; ev.liveEvals = j.evaluators; for (const x of j.evaluators) ev.evaluators[x.vid] = x.name; }
      if (!j.more && !queued(ev, 1).length) break;
    }
    await push();   // check-ins from evaluators change the list everyone sees
    save(); SYNC.fails = 0; SYNC.state[ev.id] = { ok: true, at: Date.now() };
    return got > 0;
  } catch (e) {
    if (e.status === 410) { (ev.share || ev.join).gone = true; save(); }
    else if (e.status === 403 && ev.join) { ev.join.removed = true; save(); }
    SYNC.fails++; SYNC.state[ev.id] = { err: e.message, at: Date.now() };
    return e.status === 410 || e.status === 403;   // redraw so the page says why
  } finally { SYNC.busy[ev.id] = false; }
}
/* after a score or a change: send a moment later (so quick taps go together) */
function syncSoon(ev) {
  if (!isShared(ev)) return;
  clearTimeout(SYNC.soon[ev.id]);
  SYNC.soon[ev.id] = setTimeout(async () => { const changed = await syncEvent(ev); refreshSyncUi(ev, changed); }, 1200);
}
/* the regular check: the event on screen (or any event with scores waiting), every 10 s, slower after failures */
async function syncTick() {
  clearTimeout(SYNC.timer);
  if (document.visibilityState === 'visible') {
    const cur = (['e', 's', 'r', 'c', 'm', 'k'].includes(R.name)) ? eventById(R.args[0]) : null;
    for (const ev of S.events) {
      if (!isShared(ev)) continue;
      if (ev === cur || waitingCount(ev) || (R.name === 'home' && ev.join)) { const changed = await syncEvent(ev); refreshSyncUi(ev, changed); }
    }
  }
  SYNC.timer = setTimeout(syncTick, Math.min(60000, 10000 * Math.pow(2, Math.min(SYNC.fails, 3))));
}
/* redraw when new scores arrive, but never while someone is typing */
function refreshSyncUi(ev, changed) {
  document.querySelectorAll('[data-sync="' + ev.id + '"]').forEach(el => el.replaceWith(syncPill(ev)));
  if (!changed) return;
  const onIt = (['e', 's', 'r', 'c', 'm', 'k'].includes(R.name)) && R.args[0] === ev.id;
  const a = document.activeElement, typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if ((onIt || R.name === 'home') && !typing && !document.querySelector('.sheet')) render();
}
window.addEventListener('online', () => { SYNC.fails = 0; syncTick(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { SYNC.fails = 0; syncTick(); } });

function syncPill(ev) {
  if (!isShared(ev)) return h('span', { style: 'display:none', 'data-sync': ev.id });
  const st = SYNC.state[ev.id] || {}, wait = waitingCount(ev), box = ev.share || ev.join;
  let cls = 'ok', text;
  if (box.gone) { cls = 'bad'; text = 'Sharing stopped'; }
  else if (ev.join && ev.join.removed) { cls = 'bad'; text = 'Removed by organizer'; }
  else if (!navigator.onLine || st.off) { cls = 'off'; text = wait ? wait + ' waiting · no signal' : 'No signal'; }
  else if (st.err) { cls = 'off'; text = wait ? wait + ' waiting · retrying' : 'Retrying'; }
  else text = wait ? wait + ' sending…' : (ev.share ? 'Live · code ' + ev.share.code : 'Live · all sent');
  return h('span', { class: 'spill ' + cls, 'data-sync': ev.id, onclick: () => { if (ev.share) shareSheet(ev); } }, h('span', { class: 'dot' }), text);
}

/* ---------------- organizer: share ---------------- */
const joinLink = code => location.origin + '/j/' + code;
function shareSheet(ev) {
  openSheet((s, api_) => {
    const paint = () => {
      s.replaceChildren();
      if (!ev.share) {
        s.append(h('h2', null, 'Share with evaluators'),
          h('p', { class: 'note' }, 'Evaluators score on their own phones. They open a link or scan a QR code, type their name, and start. No account. You see every score here as it comes in.'),
          h('p', { class: 'note', style: 'margin-top:8px' }, 'They get the ' + W.players + ' (number, name, ' + W.position + ', group) and the form. Scores and results stay with you.'),
          h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api_.close() }, 'Not now'), h('button', { class: 'btn primary', onclick: async e => {
            if (!navigator.onLine) { toast('Sharing needs a signal. Try again when online.'); return; }
            e.target.disabled = true; e.target.textContent = 'Starting…';
            try {
              const j = await api('/api/ev/share', { eid: ev.id, data: payloadOf(ev), rev: Date.now() });
              ev.share = { code: j.code, key: j.key, since: 0, sent: JSON.stringify(payloadOf(ev)), rev: j.rev };
              for (const o of boxes(ev)) for (const k in o) if (o[k] && k.split('|')[0] === myId(ev)) o[k].q = 1;   // your own scores and check-ins go up too
              save(true); paint(); syncSoon(ev);
            } catch (err) { e.target.disabled = false; e.target.textContent = 'Start sharing'; toast(err.code === 'already_shared' ? 'This event is already shared from another phone.' : err.message); }
          } }, 'Start sharing')));
        return;
      }
      const link = joinLink(ev.share.code), qr = h('div', { class: 'qrbox' }); qr.innerHTML = QR.svg(link, { margin: 2 });
      const evals = (ev.liveEvals || []);
      s.append(h('h2', null, 'Evaluators join with'),
        h('div', { class: 'jcode' }, ev.share.code.split('').map(c => h('b', null, c))),
        qr,
        h('p', { class: 'note center' }, 'Scan the code, or open ', h('b', null, location.host + '/j/' + ev.share.code), '. They can also tap Join as evaluator on the RosterPulse home screen and type the code.'),
        h('div', { class: 'toprow', style: 'margin-top:10px' },
          h('button', { class: 'btn', onclick: async () => { try { if (navigator.share) await navigator.share({ title: ev.name + ' · RosterPulse', text: 'Join ' + ev.name + ' as an evaluator (code ' + ev.share.code + ')', url: link }); else { await navigator.clipboard.writeText(link); toast('Link copied.'); } } catch (e) { /* cancelled */ } } }, icon('share'), 'Send link'),
          h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(ev.share.code); toast('Code copied.'); } catch (e) { toast('Code: ' + ev.share.code); } } }, icon('copy'), 'Copy code')),
        sect('Evaluators', h('span', { class: 'cnt' }, evals.length || '')),
        evals.length ? h('div', { class: 'list', style: 'gap:6px' }, evals.map(x => h('div', { class: 'erow' }, h('div', { class: 'krow' },
          h('div', { class: 'knm' }, h('div', { class: 'pnm' }, x.name), h('div', { class: 'pmeta' }, 'Joined ' + new Date(x.joined).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + ' · last seen ' + ago(x.seen))),
          h('button', { class: 'mini', 'aria-label': 'Remove ' + x.name, onclick: async () => {
            if (!(await confirmBox({ title: 'Remove ' + x.name + '?', message: 'Their phone can no longer send scores. Scores they already sent stay.', ok: 'Remove', danger: true }))) return;
            try { await api('/api/ev/' + ev.id + '/remove', { vid: x.vid }, authOf(ev)); ev.liveEvals = evals.filter(y => y !== x); save(); paint(); } catch (e) { toast(e.message); }
          } }, icon('x'))), evalSettings(ev, x)))) : h('p', { class: 'note' }, 'Nobody has joined yet.'),
        h('div', { class: 'acts' },
          h('button', { class: 'btn danger', onclick: async () => {
            if (!(await confirmBox({ title: 'Stop sharing?', message: 'Evaluators can no longer send scores, and the copy on the server is deleted. Scores already on this phone stay. You can share again later (with a new code).', ok: 'Stop sharing', danger: true }))) return;
            try { await api('/api/ev/' + ev.id + '/stop', {}, authOf(ev)); } catch (e) { if (e.status !== 410) { toast(e.message); return; } }
            delete ev.share; delete ev.liveEvals; for (const o of boxes(ev)) for (const k in o) if (o[k]) delete o[k].q; save(true); api_.close(); render();
          } }, 'Stop sharing'),
          h('button', { class: 'btn primary', onclick: () => api_.close() }, 'Done')));
    };
    paint();
    syncEvent(ev).then(() => { if (document.body.contains(s)) paint(); });
  });
}
/* per evaluator: which groups they score, and whether they can check players in */
function evalSettings(ev, x) {
  const sh = ev.share; sh.assign = sh.assign || {}; sh.helpers = sh.helpers || [];
  const box = h('div', { class: 'eset' });
  const changed = () => { save(); syncSoon(ev); paint(); };
  const paint = () => {
    const mine = sh.assign[x.vid] || [], helper = sh.helpers.includes(x.vid);
    box.replaceChildren(
      ev.groups.length ? h('div', { class: 'chips' }, h('button', { class: 'chip sm' + (mine.length ? '' : ' on'), onclick: () => { delete sh.assign[x.vid]; changed(); } }, 'All groups'),
        ev.groups.map(g => h('button', { class: 'chip sm' + (mine.includes(g.id) ? ' on' : ''), onclick: () => { const a = mine.includes(g.id) ? mine.filter(y => y !== g.id) : mine.concat(g.id); if (a.length) sh.assign[x.vid] = a; else delete sh.assign[x.vid]; changed(); } }, g.name))) : null,
      h('button', { class: 'chip sm' + (helper ? ' on' : ''), style: 'margin-top:6px', onclick: () => { sh.helpers = helper ? sh.helpers.filter(y => y !== x.vid) : sh.helpers.concat(x.vid); changed(); } }, helper ? icon('check', 14) : null, 'Can check in ' + W.players));
  };
  paint(); return box;
}
const ago = t => { const m = Math.round((Date.now() - (t || 0)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };

/* ---------------- evaluator: join ---------------- */
function joinSheet(code0) {
  const had = code0 && S.events.find(x => x.join && x.join.code === code0 && !x.join.gone && !x.join.removed);
  if (had) { go('e', had.id); return; }
  openSheet((s, api_) => {
    const code = h('input', { class: 'inp jinp', value: code0 || '', maxlength: '6', placeholder: 'ABC123', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
    const name = h('input', { class: 'inp', value: me().name || '', maxlength: '30', placeholder: 'For example: Coach Jeff' });
    const go1 = h('button', { class: 'btn primary', onclick: async () => {
      const c = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), n = clean(name.value, 30);
      if (c.length !== 6) { toast('The code has 6 letters and numbers.'); return; }
      if (!n) { toast('Type your name.'); return; }
      if (!navigator.onLine) { toast('Joining needs a signal. Scoring after that works without one.'); return; }
      go1.disabled = true; go1.textContent = 'Joining…';
      try {
        const j = await api('/api/ev/join', { code: c, name: n });
        const mine = eventById(j.eid);
        if (mine && !mine.join) { toast('You organize this event on this phone already.'); go1.disabled = false; go1.textContent = 'Join'; return; }
        if (mine) S.events = S.events.filter(x => x !== mine);
        const ev = Object.assign({ id: j.eid, created: Date.now(), updated: Date.now(), scores: {}, notes: {} }, j.data, { join: { vid: j.vid, tok: j.tok, name: n, since: 0, rev: j.rev, code: c } });
        if (!ev.sessions || !ev.sessions.length) ev.sessions = [{ id: 'd1', name: 'Day 1' }];
        S.events.unshift(ev); if (!me().name) me().name = n; save(true); api_.close(); go('e', ev.id);
        syncSoon(ev);
      } catch (e) { go1.disabled = false; go1.textContent = 'Join'; toast(e.code === 'bad_code' ? 'No event has that code. Check it with the organizer.' : e.message); }
    } }, 'Join');
    s.append(h('h2', null, 'Join as evaluator'), h('div', { class: 'stack' },
      field('Event code', code, 'From the organizer: 6 letters and numbers.'), field('Your name', name, 'The organizer sees this next to your scores.')),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api_.close() }, 'Cancel'), go1));
    setTimeout(() => { try { (code0 ? name : code).focus(); } catch (e) { /* ignore */ } }, 80);
  });
}

/* the evaluator's page for an event they joined: scoring only */
function viewEvalEvent(ev) {
  ensureDays(ev); W = wordsOf(ev);
  const sid = todayDay(ev), mine = groupPlayers(ev, 'all'), ci = checkinFor(ev, sid), here = mine.filter(ci.isHere);
  const done = here.filter(p => { const pr = progressOf(ev, p, sid); return pr.all && pr.done === pr.all; }).length;
  const gnames = myGroups(ev) ? myGroups(ev).map(id => (ev.groups.find(g => g.id === id) || {}).name).filter(Boolean).join(', ') : null;
  const blocked = ev.join.gone || ev.join.removed;
  return [topBar(ev.name, 'home', syncPill(ev)),
    h('main', { class: 'page' },
      h('div', { class: 'pmeta', style: 'margin:-4px 0 12px' }, sportById(ev.sport).name + ' · you are scoring as ' + ev.join.name),
      tip('evaluator', 'Tap Start scoring and type a jersey number. Scores save on this phone and go to the organizer when there is signal, so you can keep going in a gym with no reception.'),
      blocked ? h('div', { class: 'empty' }, ev.join.gone ? 'The organizer stopped sharing this event. Your scores were sent before that.' : 'The organizer removed you from this event.')
        : [h('button', { class: 'btn primary block big', onclick: () => startScoring(ev) }, icon('check'), 'Start scoring'),
          canCheckIn(ev) ? h('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => go('k', ev.id, sid) }, icon('clip'), 'Check in ' + W.players + (ci.used ? ' · ' + ci.count + ' here' : '')) : null],
      h('div', { class: 'stack', style: 'margin-top:14px' },
        h('div', { class: 'krow' }, h('div', { class: 'knm' }, h('div', { class: 'pnm' }, done + ' of ' + here.length + ' ' + W.players + ' fully scored'), h('div', { class: 'pmeta' }, [gnames ? 'Your groups: ' + gnames : null, ci.used ? here.length + ' checked in' : null, ev.sessions.length > 1 ? dayById(ev, sid).name : 'Your scores only'].filter(Boolean).join(' · ')))),
        h('p', { class: 'note' }, 'Scores save on this phone as you tap and go to the organizer when there is signal. Only the organizer sees results.')),
      sect('More'),
      h('button', { class: 'btn block ghost', onclick: async () => {
        const wait = waitingCount(ev);
        if (!(await confirmBox({ title: 'Leave this event?', message: (wait ? wait + ' scores have not been sent yet and will be lost. ' : 'Your scores stay with the organizer. ') + 'The event is removed from this phone.', ok: 'Leave', danger: true }))) return;
        try { if (!blocked) await api('/api/ev/' + ev.id + '/leave', {}, authOf(ev)); } catch (e) { /* leave anyway */ }
        S.events = S.events.filter(x => x !== ev); save(true); go('home');
      } }, 'Leave this event'))];
}
