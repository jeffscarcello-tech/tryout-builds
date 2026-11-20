/* =====================================================================
   Several phones (stage 2, step 2).
   Organizer: Share with evaluators -> the server gives a 6-letter join code and a secret organizer key (kept on this phone).
   Evaluator: Join with the code and a name -> a copy of the event (roster and form only) and their own token.
   Every score and note is a record with an id made on the phone. Records wait on the phone (q = 1) and are sent
   when there is signal; the server ignores ids it already has, so sending twice is harmless. On the phones the newest
   record per evaluator, player, skill and day wins. Evaluators only get their own records back; the organizer gets all.
   ev.share = { code, key, since, sent }    (organizer; sent = the roster and form last sent)
   Several organizers (t14): the owner (who started sharing, holds key) invites more with one-time 8-character codes.
   Another organizer's phone has ev.share = { code, oid, tok, owner: false, ... }. Organizers also share an organizers' copy
   (orgPayloadOf: full roster with private notes, team line, evaluator settings, names) and team decisions (records kind 'x').
   ev.join  = { vid, tok, name, since, rev } (evaluator)
   ===================================================================== */
const SYNC = { busy: {}, fails: 0, state: {}, timer: null, soon: {} };
const isShared = ev => !!(ev && (ev.share || ev.join));
/* what evaluators get: no private notes about players */
const payloadOf = ev => ({ name: ev.name, sport: ev.sport, form: ev.form, groups: ev.groups, players: ev.players.map(p => ({ id: p.id, num: p.num, name: p.name, pos: p.pos, div: p.div, group: p.group, })), sessions: ev.sessions || [],
  assign: (ev.share && ev.share.assign) || {}, helpers: (ev.share && ev.share.helpers) || [], checks: checkMapOf(ev), stations: (ev.share && ev.share.stations) || {}, locked: !!ev.locked });
/* what other organizers get: the full setup, never scores (those are records) */
const orgPayloadOf = ev => ({ name: ev.name, sport: ev.sport, form: ev.form, groups: ev.groups, players: ev.players, sessions: ev.sessions || [], line: ev.line || 0,
  assign: (ev.share && ev.share.assign) || {}, helpers: (ev.share && ev.share.helpers) || [], names: ev.orgNames || {}, stations: (ev.share && ev.share.stations) || {}, locked: !!ev.locked });
function applyOrgCopy(ev, d) {
  Object.assign(ev, { name: d.name, sport: d.sport, form: d.form, groups: d.groups || [], players: d.players || [], sessions: d.sessions && d.sessions.length ? d.sessions : ev.sessions, line: d.line || 0 });
  ev.share.assign = d.assign || {}; ev.share.helpers = d.helpers || []; ev.share.stations = d.stations || {}; ev.locked = !!d.locked;
  ev.orgNames = Object.assign({}, ev.orgNames || {}, d.names || {});
  ev.evaluators = Object.assign({}, ev.evaluators || {}, ev.orgNames);
}
/* two organizers changed the setup at the same time: keep both where we can.
   base = what this phone last sent. Lists (players, groups, days) merge item by item; other parts: whoever changed it. */
function mergeOrgCopy(base, mine, theirs) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), out = {};
  for (const k of ['name', 'sport', 'form', 'line', 'assign', 'helpers', 'stations', 'locked']) out[k] = same(mine[k], base[k]) ? theirs[k] : mine[k];
  for (const k of ['players', 'groups', 'sessions']) {
    const b = new Map((base[k] || []).map(x => [x.id, x])), m = new Map((mine[k] || []).map(x => [x.id, x])), t = new Map((theirs[k] || []).map(x => [x.id, x]));
    const ids = [...new Set([...(theirs[k] || []).map(x => x.id), ...(mine[k] || []).map(x => x.id)])], list = [];
    for (const id of ids) {
      const inB = b.has(id), inM = m.has(id), inT = t.has(id);
      if (inM && inT) list.push(same(m.get(id), b.get(id)) ? t.get(id) : m.get(id));
      else if (inM) { if (!inB || !same(m.get(id), b.get(id))) list.push(m.get(id)); }   // they deleted it: keep only if we changed it
      else if (inT && !inB) list.push(t.get(id));                                       // new on their side
    }
    out[k] = list;
  }
  out.names = Object.assign({}, theirs.names || {}, mine.names || {});
  return out;
}
const isOwner = ev => !!(ev.share && ev.share.key);
const boxes = ev => [ev.scores || {}, ev.notes || {}, ev.checks || {}, ev.decs || {}];
function waitingCount(ev) { let n = 0; for (const o of boxes(ev)) for (const k in o) if (o[k] && o[k].q) n++; return n; }

async function api(path, body, headers) {
  const r = await fetch(path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body || {}) });
  let j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok) { const e = new Error(j.hint || j.error || ('Error ' + r.status)); e.status = r.status; e.code = j.error; throw e; }
  return j;
}
const authOf = ev => ev.share ? (ev.share.key ? { 'X-Key': ev.share.key } : { 'X-Org': ev.share.oid + '.' + ev.share.tok }) : { 'X-Eval': ev.join.vid + '.' + ev.join.tok };

/* put records from the server into the event: newest per evaluator/player/skill/day wins, never overwriting one still waiting to go */
function mergeRecs(ev, recs) {
  let changed = 0;
  for (const r of recs || []) {
    const box = r.k === 'n' ? (ev.notes = ev.notes || {}) : r.k === 'c' ? (ev.checks = ev.checks || {}) : r.k === 'x' ? (ev.decs = ev.decs || {}) : (ev.scores = ev.scores || {});
    const key = r.by + '|' + r.p + '|' + (r.s || '') + '|' + r.d, cur = box[key];
    if (cur && cur.id === r.id) { if (cur.q) { delete cur.q; } continue; }
    if (cur && (cur.t > r.t || (cur.t === r.t && cur.id > r.id))) continue;
    box[key] = { id: r.id, v: r.v, t: r.t }; changed++;
  }
  return changed;
}
function queued(ev, max) {
  const out = [];
  for (const [box, k] of [[ev.scores || {}, 's'], [ev.notes || {}, 'n'], [ev.checks || {}, 'c'], [ev.decs || {}, 'x']]) for (const key in box) {
    const r = box[key]; if (!r || !r.q) continue;
    const [by, p, s, d] = key.split('|'); if (by !== myId(ev)) { delete r.q; continue; }
    out.push({ id: r.id, k, by, p, s: s || '', d, v: r.v, t: r.t }); if (out.length >= max) return out;
  }
  return out;
}

async function syncEvent(ev) {
  if (!isShared(ev) || SYNC.busy[ev.id] || (ev.share && (ev.share.gone || ev.share.removed)) || (ev.join && (ev.join.gone || ev.join.removed))) return false;
  if (!navigator.onLine) { SYNC.state[ev.id] = { off: true, at: Date.now() }; return false; }
  SYNC.busy[ev.id] = true; let got = 0;
  try {
    const box = ev.share || ev.join;
    const push = async () => {   // the organizer's roster, groups, form, check-in and evaluator settings, when they changed
      if (!ev.share) return;
      const data = payloadOf(ev), txt = JSON.stringify(data), od = orgPayloadOf(ev), otxt = JSON.stringify(od);
      if (txt !== ev.share.sent || otxt !== ev.share.osent) {
        const j = await api('/api/ev/' + ev.id + '/put', otxt !== ev.share.osent ? { data, odata: od, rev: Date.now() } : { data, rev: Date.now() }, authOf(ev));
        ev.share.sent = txt; ev.share.rev = j.rev; if (otxt !== ev.share.osent) { ev.share.osent = otxt; ev.share.orev = j.orev; }
      }
    };
    await push();
    for (let round = 0; round < 12; round++) {
      const recs = queued(ev, 400);
      const j = await api('/api/ev/' + ev.id + '/sync', { since: box.since || 0, rev: box.rev, orev: ev.share ? ev.share.orev || 0 : undefined, recs }, authOf(ev));
      const sent = new Set(recs.map(r => r.id));
      for (const o of boxes(ev)) for (const k in o) if (o[k] && o[k].q && sent.has(o[k].id)) delete o[k].q;
      got += mergeRecs(ev, j.recs);
      box.since = j.seq;
      if (j.data && ev.join) { Object.assign(ev, { name: j.data.name, sport: j.data.sport, form: j.data.form, groups: j.data.groups, players: j.data.players, sessions: j.data.sessions && j.data.sessions.length ? j.data.sessions : ev.sessions, assign: j.data.assign || {}, helpers: j.data.helpers || [], checkMap: j.data.checks || {}, stations: j.data.stations || {}, locked: !!j.data.locked }); ev.join.rev = j.rev; got++; }
      if (j.odata && ev.share) {   // another organizer changed the setup
        const mine = orgPayloadOf(ev), unsent = ev.share.osent && JSON.stringify(mine) !== ev.share.osent;
        if (!unsent) { applyOrgCopy(ev, j.odata); ev.share.osent = JSON.stringify(orgPayloadOf(ev)); }
        else { applyOrgCopy(ev, mergeOrgCopy(JSON.parse(ev.share.osent), mine, j.odata)); ev.share.osent = JSON.stringify(j.odata); }   // ours (merged) goes up next
        ev.share.sent = ev.share.sent || ''; ev.share.orev = j.orev; got++;
      }
      if (j.evaluators) { ev.evaluators = ev.evaluators || {}; ev.liveEvals = j.evaluators; for (const x of j.evaluators) ev.evaluators[x.vid] = x.name; }
      if (j.organizers) ev.liveOrgs = j.organizers;
      if (!j.more && !queued(ev, 1).length) break;
    }
    await push();   // check-ins from evaluators change the list everyone sees
    save(); SYNC.fails = 0; SYNC.state[ev.id] = { ok: true, at: Date.now() };
    return got > 0;
  } catch (e) {
    if (e.status === 410) { (ev.share || ev.join).gone = true; save(); }
    else if (e.status === 403 && ev.join) { ev.join.removed = true; save(); }
    else if (e.status === 403 && ev.share && !ev.share.key) { ev.share.removed = true; save(); }
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
    const cur = (['e', 's', 'r', 'c', 'm', 'k', 'x', 'rg', 'cc'].includes(R.name)) ? eventById(R.args[0]) : null;
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
  const onIt = (['e', 's', 'r', 'c', 'm', 'k', 'x', 'rg', 'cc'].includes(R.name)) && R.args[0] === ev.id;
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
  else if (ev.share && ev.share.removed) { cls = 'bad'; text = 'Removed by the owner'; }
  else if (!navigator.onLine || st.off) { cls = 'off'; text = wait ? wait + ' waiting · no signal' : 'No signal'; }
  else if (st.err) { cls = 'off'; text = wait ? wait + ' waiting · retrying' : 'Retrying'; }
  else text = wait ? wait + ' sending…' : (ev.share ? 'Live · code ' + ev.share.code : 'Live · all sent');
  return h('span', { class: 'spill ' + cls, 'data-sync': ev.id, onclick: () => { if (ev.share) shareSheet(ev); } }, h('span', { class: 'dot' }), text);
}

/* ---------------- organizer: share ---------------- */
const joinLink = code => location.origin + '/j/' + code;
async function startShare(ev) {
  if (me().name) ev.orgNames = Object.assign({}, ev.orgNames, { [me().id]: me().name });
  const j = await api('/api/ev/share', { eid: ev.id, data: payloadOf(ev), odata: orgPayloadOf(ev), rev: Date.now() });
  ev.share = { code: j.code, key: j.key, since: 0, sent: JSON.stringify(payloadOf(ev)), rev: j.rev, osent: JSON.stringify(orgPayloadOf(ev)), orev: j.rev };
  for (const o of boxes(ev)) for (const k in o) if (o[k] && k.split('|')[0] === myId(ev)) o[k].q = 1;   // your own scores and check-ins go up too
  save(true); syncSoon(ev);
}
/* Open on another device (t23, renamed t24): the same event on your other phone, tablet or computer, kept in step. It is an organizer invite with plainer words. */
async function openOnDevice(ev) {
  if (ev.share && !isOwner(ev)) { toast('Only the phone or computer that started sharing can do this.'); return; }
  if (!navigator.onLine) { toast('This needs a signal. Try again when online.'); return; }
  if (!ev.share) {
    try { await startShare(ev); render(); }
    catch (err) { toast(err.code === 'already_shared' ? 'This event is already shared from another phone.' : err.message); return; }
  }
  orgInviteSheet(ev, true);
}
function shareSheet(ev) {
  openSheet((s, api_) => {
    const paint = () => {
      s.replaceChildren();
      if (!ev.share) {
        s.append(h('h2', null, 'Share with evaluators'),
          h('p', { class: 'note' }, 'Evaluators score on their own phones. They open a link or scan a QR code, type their name, and start. No account. You see every score here as it comes in.'),
          h('p', { class: 'note', style: 'margin-top:8px' }, 'They get the ' + W.players + ' (number, name, ' + W.position + ', group) and the form. Scores and results stay with you.'),
          h('p', { class: 'note', style: 'margin-top:8px' }, 'Once shared, you can also add other organizers: they see and run everything with you, on their own phone or computer.'),
          h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api_.close() }, 'Not now'), h('button', { class: 'btn primary', onclick: async e => {
            if (!navigator.onLine) { toast('Sharing needs a signal. Try again when online.'); return; }
            e.target.disabled = true; e.target.textContent = 'Starting…';
            try { await startShare(ev); paint(); }
            catch (err) { e.target.disabled = false; e.target.textContent = 'Start sharing'; toast(err.code === 'already_shared' ? 'This event is already shared from another phone.' : err.message); }
          } }, 'Start sharing')));
        return;
      }
      const link = joinLink(ev.share.code), qr = h('div', { class: 'qrbox' }); qr.innerHTML = QR.svg(link, { margin: 2 });
      const evals = (ev.liveEvals || []);
      s.append(h('h2', null, 'Evaluators join with'),
        h('div', { class: 'jcode' }, ev.share.code.split('').map(c => h('b', null, c))),
        qr,
        h('p', { class: 'note center' }, 'Scan the code, or open ', h('b', null, location.host + '/j/' + ev.share.code), '. They can also tap Join with a code on the RosterPulse home screen.'),
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
        h('div', null, organizersPart(ev, paint)),
        h('div', { class: 'acts' },
          isOwner(ev) ? h('button', { class: 'btn danger', onclick: async () => {
            if (!(await confirmBox({ title: 'Stop sharing?', message: 'Evaluators can no longer send scores, and the copy on the server is deleted. Scores already on this phone stay. You can share again later (with a new code).', ok: 'Stop sharing', danger: true }))) return;
            try { await api('/api/ev/' + ev.id + '/stop', {}, authOf(ev)); } catch (e) { if (e.status !== 410) { toast(e.message); return; } }
            delete ev.share; delete ev.liveEvals; for (const o of boxes(ev)) for (const k in o) if (o[k]) delete o[k].q; save(true); api_.close(); render();
          } }, 'Stop sharing') : null,
          h('button', { class: 'btn primary', onclick: () => api_.close() }, 'Done')));
    };
    paint();
    syncEvent(ev).then(() => { if (document.body.contains(s)) paint(); });
  });
}
/* ---------------- organizers ---------------- */
function organizersPart(ev, paint) {
  const orgs = ev.liveOrgs || [];
  const rows = [h('div', { class: 'krow' }, h('div', { class: 'knm' }, h('div', { class: 'pnm' }, isOwner(ev) ? (me().name ? me().name + ' (you)' : 'You') : 'The owner'), h('div', { class: 'pmeta' }, 'Started sharing · can stop it')))]
    .concat(orgs.map(o => h('div', { class: 'krow' },
      h('div', { class: 'knm' }, h('div', { class: 'pnm' }, o.name + (ev.share.oid === o.oid ? ' (you)' : '')), h('div', { class: 'pmeta' }, 'Joined ' + fmtDate(o.joined) + ' · last seen ' + ago(o.seen))),
      isOwner(ev) ? h('button', { class: 'mini', 'aria-label': 'Remove ' + o.name, onclick: async () => {
        if (!(await confirmBox({ title: 'Remove ' + o.name + ' as organizer?', message: 'Their phone stops getting scores and changes. What they already have stays on their phone.', ok: 'Remove', danger: true }))) return;
        try { await api('/api/ev/' + ev.id + '/orgremove', { oid: o.oid }, authOf(ev)); ev.liveOrgs = orgs.filter(y => y !== o); save(); paint(); } catch (e) { toast(e.message); }
      } }, icon('x')) : null)));
  return [sect('Organizers', h('span', { class: 'cnt' }, orgs.length + 1)),
    h('p', { class: 'note', style: 'margin:-2px 0 8px' }, 'Organizers see everything: all scores, results, private notes and team decisions, and can change the event.'),
    h('div', { class: 'list', style: 'gap:6px' }, rows),
    isOwner(ev) ? h('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => orgInviteSheet(ev) }, icon('plus'), 'Add an organizer') : null];
}
async function orgInviteSheet(ev, mine) {
  if (!navigator.onLine) { toast('Adding an organizer needs a signal.'); return; }
  let j; try { j = await api('/api/ev/' + ev.id + '/orginvite', {}, authOf(ev)); } catch (e) { toast(e.message); return; }
  if (mine) {   // Open on another device
    const link = joinLink(j.code) + (me().name ? '?n=' + encodeURIComponent(me().name) : ''), qr = h('div', { class: 'qrbox' }); qr.innerHTML = QR.svg(link, { margin: 2 });
    openSheet((s, api_) => s.append(h('h2', null, 'Open on another device'),
      h('p', { class: 'note center' }, 'On your other phone or tablet, point the camera at this code and tap the link.'), qr,
      h('p', { class: 'note center', style: 'margin-top:10px' }, 'On a computer, or using RosterPulse from your Home Screen? Open RosterPulse there, tap ', h('b', null, 'Join with a code'), ' and type:'),
      h('div', { class: 'jcode jcode8' }, j.code.split('').map(c => h('b', null, c))),
      h('p', { class: 'note center' }, 'The other device gets the whole event (' + W.players + ', groups, form and notes) and changes go both ways. The code works once, for 48 hours.'),
      h('div', { class: 'toprow', style: 'margin-top:10px' },
        h('button', { class: 'btn', onclick: async () => { try { if (navigator.share) await navigator.share({ title: ev.name + ' · RosterPulse', text: 'Open ' + ev.name + ' on another device (code ' + j.code + ')', url: link }); else { await navigator.clipboard.writeText(link); toast('Link copied.'); } } catch (e) { /* cancelled */ } } }, icon('share'), 'Send link'),
        h('button', { class: 'btn primary', onclick: () => api_.close() }, 'Done'))));
    return;
  }
  const link = joinLink(j.code), qr = h('div', { class: 'qrbox' }); qr.innerHTML = QR.svg(link, { margin: 2 });
  openSheet((s, api_) => s.append(h('h2', null, 'Organizer invite'),
    h('div', { class: 'jcode jcode8' }, j.code.split('').map(c => h('b', null, c))), qr,
    h('p', { class: 'note center' }, 'On their phone, scan this or open ', h('b', null, location.host + '/j/' + j.code), ', or tap Join with a code on the RosterPulse home screen. This code works once, for 48 hours. Make one for each organizer.'),
    h('div', { class: 'toprow', style: 'margin-top:10px' },
      h('button', { class: 'btn', onclick: async () => { try { if (navigator.share) await navigator.share({ title: ev.name + ' · RosterPulse', text: 'Join ' + ev.name + ' as an organizer (code ' + j.code + ')', url: link }); else { await navigator.clipboard.writeText(link); toast('Link copied.'); } } catch (e) { /* cancelled */ } } }, icon('share'), 'Send link'),
      h('button', { class: 'btn primary', onclick: () => api_.close() }, 'Done'))));
}

/* per evaluator: which groups they score, and whether they can check players in */
function evalSettings(ev, x) {
  const sh = ev.share; sh.assign = sh.assign || {}; sh.helpers = sh.helpers || [];
  const box = h('div', { class: 'eset' });
  const changed = () => { save(); syncSoon(ev); paint(); };
  const paint = () => {
    const mine = sh.assign[x.vid] || [], helper = sh.helpers.includes(x.vid);
    refill(box,
      ev.groups.length ? h('div', { class: 'chips' }, h('button', { class: 'chip sm' + (mine.length ? '' : ' on'), onclick: () => { delete sh.assign[x.vid]; changed(); } }, 'All groups'),
        ev.groups.map(g => h('button', { class: 'chip sm' + (mine.includes(g.id) ? ' on' : ''), onclick: () => { const a = mine.includes(g.id) ? mine.filter(y => y !== g.id) : mine.concat(g.id); if (a.length) sh.assign[x.vid] = a; else delete sh.assign[x.vid]; changed(); } }, g.name))) : null,
      h('button', { class: 'chip sm' + (helper ? ' on' : ''), style: 'margin-top:6px', onclick: () => { sh.helpers = helper ? sh.helpers.filter(y => y !== x.vid) : sh.helpers.concat(x.vid); changed(); } }, helper ? icon('check', 14) : null, 'Can check in ' + W.players),
      h('button', { class: 'chip sm' + (((sh.stations || {})[x.vid] || []).length ? ' on' : ''), style: 'margin-top:6px;margin-left:6px', onclick: () => stationSheet(ev, x) }, icon('target', 14), 'Station: ' + stationLabel(ev, x.vid)));
  };
  paint(); return box;
}
const ago = t => { const m = Math.round((Date.now() - (t || 0)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };

/* ---------------- evaluator: join ---------------- */
function joinSheet(code0, name0) {
  const had = code0 && S.events.find(x => x.join && x.join.code === code0 && !x.join.gone && !x.join.removed);
  if (had) { go('e', had.id); return; }
  openSheet((s, api_) => {
    const code = h('input', { class: 'inp jinp', value: code0 || '', maxlength: '8', placeholder: 'ABC123', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
    const name = h('input', { class: 'inp', value: me().name || name0 || '', maxlength: '30', placeholder: 'For example: Coach Jeff' });
    const go1 = h('button', { class: 'btn primary', onclick: async () => {
      const c = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), n = clean(name.value, 30);
      if (c.length !== 6 && c.length !== 8) { toast('The code has 6 letters and numbers (8 for an organizer invite).'); return; }
      if (!n) { toast('Type your name.'); return; }
      if (!navigator.onLine) { toast('Joining needs a signal. Scoring after that works without one.'); return; }
      go1.disabled = true; go1.textContent = 'Joining…';
      try {
        const j = await api('/api/ev/join', { code: c, name: n });
        const mine = eventById(j.eid);
        if (j.role === 'org') {   // joined as another organizer: the full event
          if (mine && mine.share && mine.share.key) { toast('You are the owner of this event on this phone already.'); go1.disabled = false; go1.textContent = 'Join'; return; }
          if (mine) S.events = S.events.filter(x => x !== mine);
          if (!me().name) me().name = n;
          const d = j.odata || j.data, ev = Object.assign({ id: j.eid, created: Date.now(), updated: Date.now(), scores: {}, notes: {}, checks: {}, decs: {}, evaluators: {} }, { sport: d.sport, name: d.name, form: d.form, groups: d.groups || [], players: d.players || [], sessions: d.sessions && d.sessions.length ? d.sessions : [{ id: 'd1', name: 'Day 1' }] },
            { share: { code: j.code, oid: j.oid, tok: j.tok, since: 0, rev: j.rev, orev: j.orev || 0, sent: '', osent: '' } });
          ev.share.assign = d.assign || {}; ev.share.helpers = d.helpers || []; ev.share.stations = d.stations || {}; ev.locked = !!d.locked; ev.line = d.line || 0; ev.orgNames = Object.assign({}, d.names || {}, { [me().id]: n }); ev.evaluators = Object.assign({}, ev.orgNames);
          ev.share.osent = JSON.stringify(orgPayloadOf(ev)); ev.share.sent = JSON.stringify(payloadOf(ev));
          S.events.unshift(ev); save(true); api_.close(); go('e', ev.id, 'results'); toast('You are an organizer of ' + ev.name + '. Scores are coming in.');
          syncSoon(ev); return;
        }
        if (mine && !mine.join) { toast('You organize this event on this phone already.'); go1.disabled = false; go1.textContent = 'Join'; return; }
        if (mine) S.events = S.events.filter(x => x !== mine);
        const ev = Object.assign({ id: j.eid, created: Date.now(), updated: Date.now(), scores: {}, notes: {} }, j.data, { join: { vid: j.vid, tok: j.tok, name: n, since: 0, rev: j.rev, code: c } });
        if (!ev.sessions || !ev.sessions.length) ev.sessions = [{ id: 'd1', name: 'Day 1' }];
        S.events.unshift(ev); if (!me().name) me().name = n; save(true); api_.close(); go('e', ev.id);
        syncSoon(ev);
      } catch (e) { go1.disabled = false; go1.textContent = 'Join'; toast(e.code === 'bad_code' ? 'No event has that code. Check it with the organizer.' : e.message); }
    } }, 'Join');
    s.append(h('h2', null, 'Join with a code'), h('div', { class: 'stack' },
      field('Code', code, '6 letters and numbers to score as an evaluator, or 8 if you were invited as an organizer.'), field('Your name', name, 'The organizer sees this next to your scores.')),
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
      installCard(),
      lockedBanner(ev),
      stationOf(ev, myId(ev)) ? h('p', { class: 'note', style: 'margin-bottom:10px' }, 'Your station: ' + allSkills(ev).concat(ev.form.tests).filter(k => stationOf(ev, myId(ev)).includes(k.id)).map(k => k.name).join(', ') + '.') : null,
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
