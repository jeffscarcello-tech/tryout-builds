/* =====================================================================
   Screens: home (events), one event (players, groups, form), my templates.
   ===================================================================== */
Object.assign(ICONS, {
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.4.2 4.2 1.9 4.8 4.6"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8.5 11h7M8.5 15h5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>'
});
let W = TEAM_WORDS;   // words for the event on screen

function brandBar(right) {
  return h('header', { class: 'top' },
    h('div', { class: 'brand grow' }, h('img', { src: '/icon.svg', alt: '', class: 'applogo' }), h('span', { class: 'wm' }, 'Roster', h('b', null, 'Pulse'))), right);
}
/* direct: Back always goes to the given page (scoring: from a player straight to the list, never player to player) */
function topBar(title, back, right, direct) {
  return h('header', { class: 'top' },
    h('button', { class: 'iconbtn', 'aria-label': 'Back', onclick: () => direct ? goReplace(...[].concat(back)) : goBack(back) }, icon('back')),
    h('button', { class: 'iconbtn homebtn', 'aria-label': 'Home', title: 'Home', onclick: () => go('home') }, icon('home')),
    h('div', { class: 'title ellip grow' }, title), right);
}
function connPill() { const on = navigator.onLine; return h('span', { class: 'conn' + (on ? '' : ' off'), 'data-conn': '' }, h('span', { class: 'dot' }), on ? 'Online' : 'Offline'); }
const sect = (label, right) => h('div', { class: 'sect' }, label, h('span', { class: 'grow' }), right || null);
const field = (label, input, hint) => h('div', { class: 'field' }, h('label', null, label), input, hint ? h('div', { class: 'note' }, hint) : null);
/* RosterPulse wordmark (logo + name), used in footers and print */
const wordmark = (cls) => h('span', { class: 'wm ' + (cls || '') }, 'Roster', h('b', null, 'Pulse'));
const brandFoot = () => h('div', { class: 'bfoot' }, h('img', { src: '/icon.svg', alt: '' }), wordmark(), h('a', { href: '/about', class: 'aboutlink' }, 'About RosterPulse'));
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* go to a page without adding a history step (so the phone's own back button does not walk through every player) */
const goReplace = (...p) => { location.replace('#/' + p.map(encodeURIComponent).join('/')); };

/* a one-line text question in a sheet */
function promptBox({ title, value = '', placeholder = '', ok = 'Save', max = 40, note }) {
  return new Promise(resolve => {
    let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
    openSheet((s, api) => {
      const inp = h('input', { class: 'inp', value, placeholder, maxlength: String(max), enterkeyhint: 'done' });
      const go1 = () => { fin(clean(inp.value, max)); api.close(); };   // '' = saved empty, null = cancelled
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go1(); });
      s.append(h('h2', null, title), inp, note ? h('p', { class: 'note', style: 'margin-top:8px' }, note) : null,
        h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => { fin(null); api.close(); } }, 'Cancel'), h('button', { class: 'btn primary', onclick: go1 }, ok)));
      setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 60);
    }, { mid: true, onClose: () => fin(null) });
  });
}

/* ---------------- home ---------------- */
function viewHome() {
  const evs = S.events;
  return [brandBar(connPill()),
    h('main', { class: 'page' },
      tip('home', 'New here? Tap Try the demo to look around a sample tryout with scores already in. When you are ready, tap New event.'),
      h('div', { class: 'hero' }, h('h1', { class: 'disp' }, 'Tryouts and camps'),
        h('p', { class: 'muted' }, 'Set up your event, load your roster, and score players by jersey number.')),
      h('button', { class: 'btn primary block big', style: 'margin-top:14px', onclick: newEventSheet }, icon('plus'), 'New event'),
      h('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => joinSheet() }, icon('link'), 'Join as evaluator'),
      sect('Your events', h('span', { class: 'cnt' }, evs.length || '')),
      evs.length ? h('div', { class: 'list' }, evs.map(ev => {
        const sp = sportById(ev.sport), w = wordsOf(ev);
        return h('button', { class: 'evcard', onclick: () => go('e', ev.id, 'players') },
          h('div', { class: 'nm ellip' }, ev.name, ev.join ? h('span', { class: 'ebadge' }, 'Evaluator') : ev.share ? h('span', { class: 'ebadge sh' }, 'Shared') : ev.demo ? h('span', { class: 'ebadge demo' }, 'Demo') : null),
          h('div', { class: 'sub' }, [sp.name, plural(ev.players.length, w.player, w.players), ev.groups.length ? plural(ev.groups.length, 'group', 'groups') : null, fmtDate(ev.created)].filter(Boolean).join(' · ')));
      })) : h('div', { class: 'empty' }, 'No events yet. Tap New event to set up your first tryout or camp, or try the demo.'),
      evs.some(e => e.demo) ? null : h('button', { class: 'btn block ghost', style: 'margin-top:10px', onclick: openDemo }, icon('play'), 'Try the demo'),
      sect('More'),
      h('div', { class: 'list' },
        h('button', { class: 'item', onclick: () => go('templates') }, icon('clip'), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'My templates'), h('div', { class: 'pmeta' }, plural(S.templates.length, 'saved form', 'saved forms'))), icon('chev')),
        h('button', { class: 'item', onclick: backupSheet }, icon('dl'), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'Back up or restore'), h('div', { class: 'pmeta' }, 'Everything is stored on this phone for now')), icon('chev')),
        h('button', { class: 'item', onclick: () => go('help') }, icon('help'), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'Help'), h('div', { class: 'pmeta' }, 'How it works, step by step')), icon('chev')),
        h('button', { class: 'item', onclick: () => go('privacy') }, icon('eye'), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'Privacy'), h('div', { class: 'pmeta' }, 'What is stored, where, and for how long')), icon('chev')),
        h('button', { class: 'item', onclick: () => { location.href = '/about'; } }, icon('target'), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'About RosterPulse'), h('div', { class: 'pmeta' }, 'The page to show other coaches')), icon('chev')),
        S.settings.tips && Object.keys(S.settings.tips).length ? h('button', { class: 'item', onclick: () => { S.settings.tips = {}; save(); toast('Tips will show again.'); render(); } }, icon('bell'), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'Show tips again')), icon('chev')) : null,
        h('button', { class: 'item', onclick: checkForUpdate }, icon('history'), h('div', { class: 'grow' }, h('div', { class: 'pnm' }, 'Check for updates'), h('div', { class: 'pmeta' }, 'Version ' + APP.build)), icon('chev'))),
      h('p', { class: 'faint tiny center', style: 'margin-top:24px' }, APP.label))];
}

function newEventSheet() {
  let sport = S.settings.lastSport || 'volleyball', tpl = null;
  openSheet((s, api) => {
    const name = h('input', { class: 'inp', placeholder: 'For example: U15 girls tryouts', maxlength: '60' });
    const sportChips = h('div', { class: 'chips' }), tplChips = h('div', { class: 'chips' });
    const paint = () => {
      sportChips.replaceChildren(SPORTS.map(sp => h('button', { class: 'chip' + (!tpl && sport === sp.id ? ' on' : ''), onclick: () => { sport = sp.id; tpl = null; paint(); } }, sp.name)));
      tplChips.replaceChildren(S.templates.map(t => h('button', { class: 'chip' + (tpl === t.id ? ' on' : ''), onclick: () => { tpl = t.id; sport = t.sport; paint(); } }, t.name)));
    };
    paint();
    const create = () => {
      const t = tpl ? S.templates.find(x => x.id === tpl) : null;
      const sp = sportById(sport), nm = clean(name.value, 60) || (sp.id === 'blank' ? 'New event' : sp.name + ' ' + (wordsOf({ sport }).tryout));
      const ev = newEvent(nm, sport, t ? t.form : null);
      S.settings.lastSport = sport; save(); api.close(); go('e', ev.id, 'players');
    };
    s.append(h('h2', null, 'New event'),
      h('div', { class: 'stack' },
        field('Event name', name),
        field('Sport', sportChips, 'Picks the starting skills, positions and tests. You can change all of it.'),
        S.templates.length ? field('Or start from your template', tplChips) : null),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: create }, 'Create event')));
  });
}

/* ---------------- one event ---------------- */
function viewEvent(id, tab) {
  const ev = eventById(id);
  if (!ev) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  if (ev.join) return viewEvalEvent(ev);
  W = wordsOf(ev); tab = ['players', 'groups', 'form', 'results'].includes(tab) ? tab : 'players';
  const sp = sportById(ev.sport);
  const tabs = [['players', cap(W.players)], ['groups', 'Groups'], ['form', 'Form'], ['results', 'Results']];
  return [topBar(ev.name, 'home', h('div', { class: 'toprow', style: 'gap:6px;flex-wrap:nowrap' }, ev.share ? syncPill(ev) : null, h('button', { class: 'iconbtn', 'aria-label': 'Event options', onclick: () => eventMenu(ev) }, icon('more')))),
    h('div', { class: 'subtabs' }, h('div', { class: 'seg' }, tabs.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => go('e', ev.id, k) }, l)))),
    h('main', { class: 'page' },
      h('div', { class: 'pmeta', style: 'margin:-4px 0 12px' }, sp.name + ' · created ' + fmtDate(ev.created)),
      tab === 'players' ? playersTab(ev) : tab === 'groups' ? groupsTab(ev) : tab === 'results' ? resultsTab(ev) : formTab(ev))];
}

function eventMenu(ev) {
  openSheet((s, api) => {
    const row = (ic, label, fn, danger) => h('button', { class: 'item' + (danger ? ' danger' : ''), style: danger ? 'color:var(--bad)' : null, onclick: () => { api.close(); fn(); } }, icon(ic), h('div', { class: 'pnm grow' }, label));
    s.append(h('h2', null, ev.name), h('div', { class: 'list' },
      row('qr', ev.share ? 'Evaluators and join code' : 'Share with evaluators', () => shareSheet(ev)),
      row('edit', 'Rename event', async () => { const v = await promptBox({ title: 'Event name', value: ev.name, max: 60 }); if (v) { ev.name = v; touch(ev); render(); } }),
      row('copy', 'Copy event (same form and groups, no ' + W.players + ')', () => {
        const c = newEvent(ev.name + ' (copy)', ev.sport, ev.form);
        c.groups = ev.groups.map(g => Object.assign({}, g, { id: uid('g') })); touch(c); toast('Copied.'); go('e', c.id, 'form');
      }),
      row('clip', 'Save form as my template', () => saveTemplate(ev)),
      row('trash', 'Delete event', async () => {
        if (!(await confirmBox({ title: 'Delete this event?', message: 'Its ' + W.players + ', groups and form are removed from this phone.' + (ev.share ? ' Sharing stops and evaluators can no longer send scores.' : '') + ' This cannot be undone.', ok: 'Delete', danger: true }))) return;
        if (ev.share) { try { await api('/api/ev/' + ev.id + '/stop', {}, authOf(ev)); } catch (e) { /* deleted here anyway; the server copy expires */ } }
        S.events = S.events.filter(x => x !== ev); save(true); go('home');
      }, true)));
  });
}

/* ---------------- players ---------------- */
let playerFilter = 'all';
function playersTab(ev) {
  const dup = duplicateNumbers(ev.players);
  const groupsById = Object.fromEntries(ev.groups.map(g => [g.id, g]));
  if (playerFilter !== 'all' && playerFilter !== 'none' && !groupsById[playerFilter]) playerFilter = 'all';
  const shown = sortPlayers(ev.players.filter(p => playerFilter === 'all' || (playerFilter === 'none' ? !groupsById[p.group] : p.group === playerFilter)));
  const unassigned = ev.players.filter(p => !groupsById[p.group]).length;
  const ci = checkinFor(ev, todayDay(ev));
  return [
    tip('players', 'Add ' + W.players + ' one at a time or paste a list. Start scoring to score on this phone. Share with evaluators lets other coaches score on their own phones.'),
    ev.players.length ? h('button', { class: 'btn primary block big', style: 'margin-bottom:12px', onclick: () => startScoring(ev) }, icon('check'), 'Start scoring') : null,
    ev.players.length ? h('div', { class: 'toprow', style: 'margin-bottom:12px' },
      h('button', { class: 'btn', onclick: () => shareSheet(ev) }, icon('qr'), ev.share ? 'Evaluators · ' + ev.share.code : 'Share with evaluators'),
      h('button', { class: 'btn', onclick: () => go('k', ev.id, todayDay(ev)) }, icon('check'), ci.used ? 'Check-in · ' + ci.count + '/' + ev.players.length : 'Check-in')) : null,
    h('div', { class: 'toprow' },
      h('button', { class: 'btn' + (ev.players.length ? '' : ' primary'), onclick: () => playerSheet(ev, null) }, icon('plus'), 'Add ' + W.player),
      h('button', { class: 'btn', onclick: () => importSheet(ev) }, icon('file'), 'Import list')),
    ev.groups.length ? h('div', { class: 'hscroll', style: 'margin-top:14px' },
      [['all', 'All · ' + ev.players.length]].concat(ev.groups.map(g => [g.id, g.name + ' · ' + ev.players.filter(p => p.group === g.id).length]), unassigned ? [['none', 'No group · ' + unassigned]] : [])
        .map(([k, l]) => h('button', { class: 'chip' + (playerFilter === k ? ' on' : ''), onclick: () => { playerFilter = k; render(); } }, l))) : null,
    sect(cap(W.players), h('span', { class: 'cnt' }, shown.length || '')),
    dup.size ? h('p', { class: 'warn', style: 'margin-bottom:10px' }, 'Some numbers are used twice' + (ev.groups.length ? ' in the same group' : '') + ' (shown in red). Evaluators score by number, so each needs its own.') : null,
    shown.length ? h('div', { class: 'list', style: 'gap:8px' }, shown.map(p => {
      const g = groupsById[p.group];
      return h('button', { class: 'prow2' + (ci.isHere(p) ? '' : ' out'), onclick: () => go('r', ev.id, p.id) },
        h('span', { class: 'jn' + (dup.has((p.group || '') + '|' + p.num) ? ' dup' : '') }, p.num || '–'),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'pnm ellip' }, p.name || 'No name'),
          h('div', { class: 'pmeta ellip' }, [p.pos, p.div, g ? g.name : null, p.notes ? 'Note' : null].filter(Boolean).join(' · ') || ' ')),
        progressBadge(ev, p), icon('chev'));
    })) : h('div', { class: 'empty' }, ev.players.length ? 'No ' + W.players + ' here.' : 'No ' + W.players + ' yet. Add them one at a time, or paste a list from a spreadsheet or email.')
  ];
}

function chipPick(options, value, onPick, allowNone = true) {
  const box = h('div', { class: 'chips' });
  const paint = () => box.replaceChildren((allowNone ? [['', 'None']] : []).concat(options).map(([k, l]) => h('button', { class: 'chip' + (value === k ? ' on' : ''), type: 'button', onclick: () => { value = k; onPick(k); paint(); } }, l)));
  paint(); return box;
}

function playerSheet(ev, p) {
  const isNew = !p, d = Object.assign({ num: '', name: '', pos: '', div: '', group: playerFilter !== 'all' && playerFilter !== 'none' ? playerFilter : '', notes: '' }, p || {});
  openSheet((s, api) => {
    const num = h('input', { class: 'inp', value: d.num, inputmode: 'numeric', maxlength: '4', placeholder: '12', style: 'max-width:120px' });
    const name = h('input', { class: 'inp', value: d.name, maxlength: '40', placeholder: 'First name and last initial is enough' });
    const notes = h('textarea', { class: 'inp', maxlength: '200', style: 'min-height:80px', placeholder: 'Optional' }); notes.value = d.notes || '';
    const store = () => {
      d.num = cleanNum(num.value); d.name = clean(name.value, 40); d.notes = clean(notes.value, 200);
      if (!d.num && !d.name) { toast('Add a number or a name.'); return false; }
      if (isNew) { d.id = uid('p'); ev.players.push(d); } else Object.assign(p, d);
      touch(ev); return true;
    };
    s.append(h('h2', null, isNew ? 'Add ' + W.player : (d.num ? '#' + d.num + ' ' : '') + (d.name || cap(W.player))),
      h('div', { class: 'stack' },
        h('div', { class: 'row', style: 'align-items:flex-start' }, field('Number', num), h('div', { class: 'grow' }, field('Name', name))),
        ev.form.positions.length ? field(cap(W.position), chipPick(ev.form.positions.map(x => [x, x]), d.pos, v => { d.pos = v; })) : null,
        ev.form.divisions.length ? field('Age division', chipPick(ev.form.divisions.map(x => [x, x]), d.div, v => { d.div = v; })) : null,
        ev.groups.length ? field('Group', chipPick(ev.groups.map(g => [g.id, g.name]), d.group, v => { d.group = v; })) : null,
        field('Notes', notes),
        h('p', { class: 'note' }, 'Keep it minimal: number, name, ' + W.position + ' and age division. No birthdays, emails or phone numbers needed.')),
      h('div', { class: 'acts' },
        isNew ? h('button', { class: 'btn', onclick: () => { if (store()) { api.close(); render(); playerSheet(ev, null); toast('Added. Add the next one.'); } } }, 'Save and add next')
          : h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox({ title: 'Remove this ' + W.player + '?', ok: 'Remove', danger: true })) { ev.players = ev.players.filter(x => x !== p); touch(ev); api.close(); if (R.name === 'r') goReplace('e', ev.id, 'players'); else render(); } } }, 'Remove'),
        h('button', { class: 'btn primary', onclick: () => { if (store()) { api.close(); render(); } } }, 'Save')));
    if (isNew) setTimeout(() => { try { num.focus(); } catch (e) { /* ignore */ } }, 80);
  });
}

function importSheet(ev) {
  let mode = 'add', parsed = null;
  openSheet((s, api) => {
    const ta = h('textarea', { class: 'inp', placeholder: 'One ' + W.player + ' per line, for example:\n12 Sam Lee\n7 Jordan Park, ' + (ev.form.positions[0] || cap(W.position)) + '\n\nOr paste rows from a spreadsheet (with a header row like Number, Name, Position, Division, Group).' });
    const file = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain', style: 'display:none' });
    const out = h('div');
    const preview = () => {
      parsed = parseRoster(ta.value, ev.form);
      if (!parsed.players.length) { out.replaceChildren(ta.value.trim() ? h('p', { class: 'warn' }, 'No ' + W.players + ' found in that text.') : null); return; }
      const dup = duplicateNumbers(mode === 'add' ? ev.players.concat(parsed.players.map(p => Object.assign({}, p, { group: '' }))) : parsed.players);
      out.replaceChildren(h('div', { class: 'sect', style: 'margin-top:14px' }, 'Preview', h('span', { class: 'grow' }), h('span', { class: 'cnt' }, plural(parsed.players.length, W.player, W.players))),
        h('div', { class: 'preview' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Name'), h('th', null, cap(W.position)), h('th', null, 'Div'), h('th', null, 'Group'))),
          h('tbody', null, parsed.players.slice(0, 200).map(p => h('tr', null, h('td', null, p.num || '–'), h('td', { style: 'text-align:left' }, p.name), h('td', null, p.pos), h('td', null, p.div), h('td', null, p.group)))))),
        parsed.skipped.length ? h('p', { class: 'note', style: 'margin-top:8px' }, plural(parsed.skipped.length, 'line', 'lines') + ' skipped (no number or name).') : null,
        dup.size ? h('p', { class: 'warn', style: 'margin-top:8px' }, 'Some numbers appear twice. You can fix them after importing.') : null);
    };
    ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(preview, 250); });
    file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; if (f.size > 2e6) { toast('That file is too big.'); return; } ta.value = await f.text(); preview(); });
    const modeSeg = h('div', { class: 'seg' }), paintMode = () => modeSeg.replaceChildren([['add', 'Add to list'], ['replace', 'Replace list']].map(([k, l]) => h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; paintMode(); preview(); } }, l)));
    paintMode();
    const doImport = async () => {
      preview(); if (!parsed || !parsed.players.length) { toast('Paste a list first.'); return; }
      if (mode === 'replace' && ev.players.length && !(await confirmBox({ title: 'Replace the list?', message: 'The ' + plural(ev.players.length, W.player, W.players) + ' already here are removed.', ok: 'Replace', danger: true }))) return;
      if (mode === 'replace') ev.players = [];
      let made = 0;
      for (const p of parsed.players) {
        let gid = '';
        if (p.group) { let g = ev.groups.find(x => x.name.toLowerCase() === p.group.toLowerCase()); if (!g) { g = { id: uid('g'), name: clean(p.group, 40), when: '', where: '' }; ev.groups.push(g); made++; } gid = g.id; }
        if (p.div && !ev.form.divisions.some(x => x.toLowerCase() === p.div.toLowerCase())) ev.form.divisions.push(p.div);
        ev.players.push({ id: uid('p'), num: p.num, name: p.name, pos: p.pos, div: p.div, group: gid, notes: p.notes });
      }
      touch(ev); api.close(); render(); toast(plural(parsed.players.length, W.player, W.players) + ' added' + (made ? ', ' + plural(made, 'group', 'groups') + ' created' : '') + '.');
    };
    s.append(h('h2', null, 'Import a list'), h('div', { class: 'stack' }, ta,
      h('button', { class: 'btn', onclick: () => file.click() }, icon('file'), 'Choose a CSV file'), file,
      ev.players.length ? modeSeg : null),
      out, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: doImport }, 'Import')));
  });
}

/* ---------------- groups ---------------- */
function groupsTab(ev) {
  const unassigned = ev.players.filter(p => !ev.groups.some(g => g.id === p.group));
  return [
    h('p', { class: 'note', style: 'margin-bottom:12px' }, 'Groups are the sessions or stations ' + W.players + ' are evaluated in, for example "Group A, Sat 9:00, Court 2". Evaluators pick a group and only see those ' + W.players + '.'),
    h('div', { class: 'toprow' }, h('button', { class: 'btn primary', onclick: () => groupSheet(ev, null) }, icon('plus'), 'Add group'),
      ev.groups.length && unassigned.length ? h('button', { class: 'btn', onclick: () => fillGroups(ev) }, icon('users'), 'Split ' + unassigned.length + ' evenly') : null),
    sect('Groups', h('span', { class: 'cnt' }, ev.groups.length || '')),
    ev.groups.length ? h('div', { class: 'list', style: 'gap:8px' }, ev.groups.map((g, i) => {
      const n = ev.players.filter(p => p.group === g.id).length;
      return h('div', { class: 'krow' },
        h('button', { class: 'knm', onclick: () => groupSheet(ev, g) }, h('div', { class: 'pnm' }, g.name), h('div', { class: 'pmeta' }, [g.when, g.where, plural(n, W.player, W.players)].filter(Boolean).join(' · '))),
        h('button', { class: 'mini', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { move(ev.groups, i, -1); touch(ev); render(); } }, icon('up')),
        h('button', { class: 'mini', 'aria-label': 'Move down', disabled: i === ev.groups.length - 1, onclick: () => { move(ev.groups, i, 1); touch(ev); render(); } }, icon('down')));
    })) : h('div', { class: 'empty' }, 'No groups. That is fine for a small camp: everyone is in one group.'),
    unassigned.length && ev.groups.length ? h('p', { class: 'note', style: 'margin-top:12px' }, plural(unassigned.length, W.player + ' is', W.players + ' are') + ' not in a group yet.') : null
  ];
}
function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
function fillGroups(ev) {
  const un = sortPlayers(ev.players.filter(p => !ev.groups.some(g => g.id === p.group)));
  const counts = ev.groups.map(g => ev.players.filter(p => p.group === g.id).length);
  for (const p of un) { let k = 0; counts.forEach((c, i) => { if (c < counts[k]) k = i; }); p.group = ev.groups[k].id; counts[k]++; }
  touch(ev); render(); toast('Split into ' + plural(ev.groups.length, 'group', 'groups') + '.');
}
function groupSheet(ev, g) {
  const isNew = !g, d = Object.assign({ name: 'Group ' + String.fromCharCode(65 + Math.min(25, ev.groups.length)), when: '', where: '' }, g || {});
  const members = new Set(ev.players.filter(p => g && p.group === g.id).map(p => p.id));
  openSheet((s, api) => {
    const name = h('input', { class: 'inp', value: d.name, maxlength: '40' }), when = h('input', { class: 'inp', value: d.when, maxlength: '40', placeholder: 'Sat 9:00' }), where = h('input', { class: 'inp', value: d.where, maxlength: '40', placeholder: 'Court 2' });
    const box = h('div', { class: 'chips' });
    const paint = () => box.replaceChildren(sortPlayers(ev.players).map(p => {
      const other = p.group && p.group !== (g && g.id) && ev.groups.some(x => x.id === p.group);
      return h('button', { class: 'chip' + (members.has(p.id) ? ' on' : ''), style: other && !members.has(p.id) ? 'opacity:.5' : null, onclick: () => { members.has(p.id) ? members.delete(p.id) : members.add(p.id); paint(); } }, (p.num ? '#' + p.num + ' ' : '') + (p.name || '').split(' ')[0]);
    }));
    paint();
    s.append(h('h2', null, isNew ? 'Add group' : d.name), h('div', { class: 'stack' },
      field('Name', name), h('div', { class: 'row' }, h('div', { class: 'grow' }, field('When', when)), h('div', { class: 'grow' }, field('Where', where))),
      ev.players.length ? field(cap(W.players) + ' in this group', box, 'Tap to add or remove. Faded ones are in another group (tapping moves them here).') : null),
      h('div', { class: 'acts' },
        isNew ? h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel')
          : h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox({ title: 'Delete this group?', message: 'Its ' + W.players + ' stay in the event, with no group.', ok: 'Delete', danger: true })) { ev.groups = ev.groups.filter(x => x !== g); ev.players.forEach(p => { if (p.group === g.id) p.group = ''; }); touch(ev); api.close(); render(); } } }, 'Delete'),
        h('button', { class: 'btn primary', onclick: () => {
          const nm = clean(name.value, 40); if (!nm) { toast('Give the group a name.'); return; }
          let gg = g; if (isNew) { gg = { id: uid('g') }; ev.groups.push(gg); }
          Object.assign(gg, { name: nm, when: clean(when.value, 40), where: clean(where.value, 40) });
          ev.players.forEach(p => { if (members.has(p.id)) p.group = gg.id; else if (p.group === gg.id) p.group = ''; });
          touch(ev); api.close(); render();
        } }, 'Save')));
  });
}

/* ---------------- the evaluation form ---------------- */
const WEIGHTS = [1, 2, 3, 0.5];
const wLabel = w => '×' + (w === 0.5 ? '½' : w);
function skillEditor(ev, list, label) {
  return [sect(label, h('span', { class: 'cnt' }, list.length || '')),
    list.length ? h('div', { class: 'list', style: 'gap:8px' }, list.map((k, i) => h('div', { class: 'krow' },
      h('button', { class: 'knm ellip', onclick: async () => { const v = await promptBox({ title: 'Rename skill', value: k.name }); if (v) { k.name = v; touch(ev); render(); } } }, k.name),
      h('button', { class: 'wt' + (k.w !== 1 ? ' on' : ''), 'aria-label': 'Weight', onclick: () => { k.w = WEIGHTS[(WEIGHTS.indexOf(k.w) + 1) % WEIGHTS.length]; touch(ev); render(); } }, wLabel(k.w)),
      h('button', { class: 'mini', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { move(list, i, -1); touch(ev); render(); } }, icon('up')),
      h('button', { class: 'mini', 'aria-label': 'Move down', disabled: i === list.length - 1, onclick: () => { move(list, i, 1); touch(ev); render(); } }, icon('down')),
      h('button', { class: 'mini', 'aria-label': 'Remove', onclick: () => { list.splice(i, 1); touch(ev); render(); toastAction('Removed ' + k.name + '.', 'Undo', () => { list.splice(i, 0, k); touch(ev); render(); }); } }, icon('x'))))) : h('div', { class: 'empty' }, 'No skills yet.'),
    h('button', { class: 'chip add', style: 'margin-top:10px', onclick: async () => { const v = await promptBox({ title: 'Add a skill', placeholder: 'For example: Serve receive', ok: 'Add' }); if (v) { list.push({ id: uid('k'), name: v, w: 1 }); touch(ev); render(); } } }, icon('plus'), 'Add skill')];
}
function chipList(ev, arr, addTitle, addHint) {
  return h('div', { class: 'chips' }, arr.map((x, i) => h('button', { class: 'chip', onclick: async () => {
    const v = await promptBox({ title: 'Rename or remove', value: x, ok: 'Save', note: 'Clear the box and save to remove it.' });
    if (v === null) return; if (v) arr[i] = v; else arr.splice(i, 1); touch(ev); render();
  } }, x)), h('button', { class: 'chip add', onclick: async () => { const v = await promptBox({ title: addTitle, placeholder: addHint, ok: 'Add', max: 30 }); if (v && !arr.includes(v)) { arr.push(v); touch(ev); render(); } } }, icon('plus'), 'Add'));
}
function formTab(ev) {
  const f = ev.form, sp = sportById(ev.sport);
  return [
    h('p', { class: 'note' }, 'This is what evaluators score. Changes here apply to this event only. Tap a skill to rename it, the ×1 button to weight it, and the arrows to reorder.'),
    sect('Scale'), h('div', { class: 'seg' }, SCALES.map(([k, l]) => h('button', { class: f.scale === k ? 'on' : '', onclick: () => changeScale(ev, k, 1) }, l)),
      h('button', { class: !['5', '10', 'pcm'].includes(f.scale) ? 'on' : '', onclick: () => customScaleSheet(ev) }, !['5', '10', 'pcm'].includes(f.scale) ? scaleLabel(f) : 'Custom')),
    useSlider(f) ? h('p', { class: 'note', style: 'margin-top:6px' }, 'Evaluators get a slider and a number box with − and + for this scale.') : null,
    skillEditor(ev, f.skills, f.alt ? 'Skills (everyone except ' + f.alt.pos.toLowerCase() + 's)' : 'Skills'),
    f.alt ? [skillEditor(ev, f.alt.skills, f.alt.pos + ' skills'),
      h('button', { class: 'btn sm ghost', style: 'margin-top:8px', onclick: async () => { if (await confirmBox({ title: 'Use one skill list for everyone?', message: 'The ' + f.alt.pos.toLowerCase() + ' list is removed.', ok: 'Use one list' })) { f.alt = null; touch(ev); render(); } } }, 'Use one list for everyone')] : null,
    sect(cap(W.positions)), chipList(ev, f.positions, 'Add a ' + W.position, ''),
    sect('Age divisions'), chipList(ev, f.divisions, 'Add an age division', 'U15'),
    !f.divisions.length ? h('div', { class: 'chips', style: 'margin-top:8px' }, ['U11', 'U13', 'U15', 'U17', 'U19'].map(x => h('button', { class: 'chip', style: 'opacity:.7', onclick: () => { f.divisions.push(x); touch(ev); render(); } }, '+ ' + x))) : null,
    sect('Measured tests', h('span', { class: 'cnt' }, f.tests.length || '')),
    f.tests.length ? h('div', { class: 'list', style: 'gap:8px' }, f.tests.map((t, i) => h('div', { class: 'krow' },
      h('button', { class: 'knm', onclick: () => testSheet(ev, t) }, h('div', { class: 'pnm' }, t.name), h('div', { class: 'pmeta' }, (t.unit ? t.unit + ' · ' : '') + (t.better === 'low' ? 'lower is better' : 'higher is better'))),
      h('button', { class: 'mini', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { move(f.tests, i, -1); touch(ev); render(); } }, icon('up')),
      h('button', { class: 'mini', 'aria-label': 'Move down', disabled: i === f.tests.length - 1, onclick: () => { move(f.tests, i, 1); touch(ev); render(); } }, icon('down')),
      h('button', { class: 'mini', 'aria-label': 'Remove', onclick: () => { f.tests.splice(i, 1); touch(ev); render(); toastAction('Removed ' + t.name + '.', 'Undo', () => { f.tests.splice(i, 0, t); touch(ev); render(); }); } }, icon('x'))))) : h('p', { class: 'note' }, 'None. Add a time, a count or a distance, like a 40 m sprint.'),
    h('button', { class: 'chip add', style: 'margin-top:10px', onclick: () => testSheet(ev, null) }, icon('plus'), 'Add test'),
    f.tests.some(t => unitKind(t.unit) === 'dist') ? [h('div', { class: 'lbl', style: 'margin:14px 0 8px' }, 'Measuring system'),
      h('div', { class: 'seg' }, [['metric', 'Metric (cm, m)'], ['imperial', 'Imperial (in, ft)']].map(([k, l]) => h('button', { class: systemOf(f) === k ? 'on' : '', onclick: () => { const n = setSystem(ev, k); render(); if (n) toast('Changed ' + plural(n, 'test', 'tests') + ' to ' + (k === 'metric' ? 'metric' : 'imperial') + '.'); } }, l))),
      h('p', { class: 'note', style: 'margin-top:6px' }, 'Switches distance tests and converts any values already entered. Times and counts do not change.')] : null,
    daysEditor(ev),
    sect('More'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn block', onclick: () => saveTemplate(ev) }, icon('clip'), 'Save as my template'),
      sp.id !== 'blank' ? h('button', { class: 'btn block ghost', onclick: async () => {
        if (!(await confirmBox({ title: 'Reset the form?', message: 'Skills, ' + W.positions + ' and tests go back to the ' + sp.name + ' starting list. ' + cap(W.players) + ' and groups are kept.' + (ev.scores && Object.keys(ev.scores).length ? ' Scores already entered for the current skills will no longer show.' : ''), ok: 'Reset', danger: true }))) return;
        const d = f.divisions; ev.form = formFromSport(ev.sport); ev.form.divisions = d; touch(ev); render();
      } }, 'Reset to the ' + sp.name + ' starting list') : null)
  ];
}
/* changing the scale after scoring: offer to convert the scores so each keeps its relative place */
async function changeScale(ev, to, toLo) {
  const f = ev.form, from = f.scale, fromLo = scaleLo(f);
  if (to !== 'pcm' && !['5', '10'].includes(to)) toLo = toLo === 0 ? 0 : 1; else toLo = 1;
  if (from === to && fromLo === toLo) return;
  if (hasSkillScores(ev)) {
    const name = (sc, lo) => sc === 'pcm' ? '+ / ✓ / −' : lo + ' to ' + scaleMax(sc);
    const ex = to === 'pcm' ? 'top scores become +, middle scores ✓, the lowest −' : from === 'pcm' ? '+ becomes ' + scaleMax(to) + ', − becomes ' + toLo : scaleMax(from) + ' becomes ' + scaleMax(to) + ' and the middle stays in the middle';
    const ok = await confirmBox({ title: 'Convert the scores already entered?', message: 'Changing from ' + name(from, fromLo) + ' to ' + name(to, toLo) + '. Scores keep about the same place on the new scale (' + ex + '). They are rounded, so changing back may not give the exact same numbers.', ok: 'Convert and change', cancel: 'Keep the old scale' });
    if (!ok) return;
    const n = convertScale(ev, from, to, fromLo, toLo); toast(plural(n, 'score', 'scores') + ' converted.');
  }
  f.scale = to; if (to === 'pcm' || to === '5' || to === '10') delete f.scaleMin; else f.scaleMin = toLo; touch(ev); render();
}
/* a custom scale: lowest 0 or 1, highest up to 1000 (more than 10 choices gets a slider) */
function customScaleSheet(ev) {
  const f = ev.form, isCustom = !['5', '10', 'pcm'].includes(f.scale);
  let lo = isCustom ? scaleLo(f) : 1;
  openSheet((s, api) => {
    const hi = h('input', { class: 'inp', inputmode: 'numeric', value: isCustom ? String(scaleHi(f)) : '100', maxlength: '4', style: 'max-width:140px' });
    const quick = h('div', { class: 'chips' }, ['7', '20', '50', '100'].map(x => h('button', { class: 'chip', type: 'button', onclick: () => { hi.value = x; } }, x)));
    s.append(h('h2', null, 'Custom scale'), h('div', { class: 'stack' },
      field('Lowest score', chipPick([['1', '1'], ['0', '0']], String(lo), v => { lo = +v; }, false)),
      field('Highest score', h('div', { class: 'stack', style: 'gap:8px' }, hi, quick), 'Up to 1000. More than 10 choices gives evaluators a slider and a number box with − and +.')),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
        const top = Math.round(+hi.value);
        if (!(top >= lo + 2 && top <= 1000)) { toast('Pick a highest score between ' + (lo + 2) + ' and 1000.'); return; }
        api.close(); await changeScale(ev, String(top), lo);
      } }, 'Use this scale')));
  });
}
function testSheet(ev, t) {
  const isNew = !t, d = Object.assign({ name: '', unit: 's', better: 'low' }, t || {});
  openSheet((s, api) => {
    const name = h('input', { class: 'inp', value: d.name, maxlength: '30', placeholder: '40 m sprint' });
    const other = h('input', { class: 'inp', value: UNITS.some(u => u[0] === d.unit) ? '' : d.unit, maxlength: '8', placeholder: 'Other unit', style: 'max-width:160px' });
    other.addEventListener('input', () => { if (other.value.trim()) { d.unit = clean(other.value, 8); paint(); } });
    const box = h('div', { class: 'stack', style: 'gap:8px' });
    const paint = () => box.replaceChildren([['time', 'Time'], ['dist', 'Distance'], ['count', 'Count']].map(([kind, label]) => h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' },
      h('span', { class: 'lbl', style: 'min-width:70px' }, label),
      UNITS.filter(u => u[1] === kind).map(([u, , full]) => h('button', { class: 'chip' + (d.unit === u ? ' on' : ''), type: 'button', title: full, onclick: () => { d.unit = u; other.value = ''; if (kind === 'time') d.better = 'low'; else d.better = 'high'; paint(); paintBetter(); } }, u)))), other);
    const betterBox = h('div'), paintBetter = () => betterBox.replaceChildren(chipPick([['low', 'Lower (times)'], ['high', 'Higher (distance, reps)']], d.better, v => { d.better = v; }, false));
    paint(); paintBetter();
    s.append(h('h2', null, isNew ? 'Add a measured test' : d.name), h('div', { class: 'stack' },
      field('Test name', name), field('Unit', box), field('Which is better?', betterBox)),
      h('div', { class: 'acts' },
        isNew ? h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel') : h('button', { class: 'btn danger', onclick: () => { ev.form.tests = ev.form.tests.filter(x => x !== t); touch(ev); api.close(); render(); } }, 'Remove'),
        h('button', { class: 'btn primary', onclick: () => {
          const nm = clean(name.value, 30); if (!nm) { toast('Give the test a name.'); return; }
          if (isNew) { ev.form.tests.push({ id: uid('t'), name: nm, unit: d.unit, better: d.better }); }
          else { if (t.unit !== d.unit) convertTest(ev, t, d.unit); Object.assign(t, { name: nm, better: d.better }); }
          touch(ev); api.close(); render();
        } }, 'Save')));
  });
}
async function saveTemplate(ev) {
  const v = await promptBox({ title: 'Save as my template', value: ev.name + ' form', max: 40, note: 'Saves the skills, weights, scale, ' + W.positions + ', divisions and tests (no ' + W.players + '). Use it when you create your next event.' });
  if (!v) return;
  S.templates.unshift({ id: uid('tp'), name: v, sport: ev.sport, form: copyForm(ev.form), created: Date.now() }); save(true); toast('Template saved.');
}

/* ---------------- my templates ---------------- */
function viewTemplates() {
  return [topBar('My templates', 'home'), h('main', { class: 'page' },
    h('p', { class: 'note', style: 'margin-bottom:12px' }, 'Save a template from any event (Form tab, then Save as my template). Pick it when you create a new event.'),
    S.templates.length ? h('div', { class: 'list', style: 'gap:8px' }, S.templates.map(t => h('div', { class: 'krow' },
      h('div', { class: 'knm' }, h('div', { class: 'pnm' }, t.name), h('div', { class: 'pmeta' }, sportById(t.sport).name + ' · ' + plural(t.form.skills.length, 'skill', 'skills') + (t.form.tests.length ? ' · ' + plural(t.form.tests.length, 'test', 'tests') : ''))),
      h('button', { class: 'mini', 'aria-label': 'Rename', onclick: async () => { const v = await promptBox({ title: 'Template name', value: t.name }); if (v) { t.name = v; save(); render(); } } }, icon('edit')),
      h('button', { class: 'mini', 'aria-label': 'Delete', onclick: async () => { if (await confirmBox({ title: 'Delete "' + t.name + '"?', message: 'Events made from it are not changed.', ok: 'Delete', danger: true })) { S.templates = S.templates.filter(x => x !== t); save(); render(); } } }, icon('trash'))))) : h('div', { class: 'empty' }, 'No templates yet.'))];
}

/* ---------------- backup ---------------- */
function backupSheet() {
  openSheet((s, api) => {
    const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try { const r = importData(await f.text()); api.close(); render(); toast('Restored: ' + r.added + ' new, ' + r.updated + ' updated.'); } catch (e) { toast(e.message); }
    });
    s.append(h('h2', null, 'Back up or restore'),
      h('p', { class: 'note' }, 'For now your events live on this phone only. Download a backup now and then, or to move events to another phone.'),
      h('div', { class: 'stack', style: 'margin-top:12px' },
        h('button', { class: 'btn primary block', onclick: () => saveFile('RosterPulse-backup-' + new Date().toISOString().slice(0, 10) + '.json', exportData(), 'application/json') }, icon('dl'), 'Download a backup'),
        h('button', { class: 'btn block', onclick: () => file.click() }, icon('file'), 'Restore from a backup'), file));
  });
}
/* save a file: the share sheet on phones that support it (iPhone), else a normal download */
async function saveFile(name, text, type) {
  try {
    const f = new File([text], name, { type });   // text: a string or bytes (PDF)
    if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
