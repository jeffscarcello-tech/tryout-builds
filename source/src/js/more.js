/* =====================================================================
   t21: copy an event, stations (skills per evaluator), results grid, coach comparison,
   finish (lock) an event, glare mode, spreadsheet (.xlsx) roster files.
   ===================================================================== */

/* ---------------- stations: which skills an evaluator scores (null = all) ----------------
   Organizer: ev.share.stations = { vid: [skill or test ids] }; evaluators get theirs as ev.stations. */
function stationOf(ev, by) {
  const m = ev.join ? ev.stations : (ev.share && ev.share.stations);
  const st = m && by ? m[by] : null;
  if (!st || !st.length) return null;
  const ids = new Set(allSkills(ev).concat(ev.form.tests).map(k => k.id)), ok = st.filter(id => ids.has(id));
  return ok.length ? ok : null;
}
function stationSheet(ev, x) {
  const sh = ev.share; sh.stations = sh.stations || {};
  openSheet((s, api) => {
    const paint = () => {
      const cur = sh.stations[x.vid] || [], items = allSkills(ev).concat(ev.form.tests);
      const toggle = id => { const a = cur.includes(id) ? cur.filter(y => y !== id) : cur.concat(id); if (a.length) sh.stations[x.vid] = a; else delete sh.stations[x.vid]; save(); syncSoon(ev); paint(); };
      refill(s, h('h2', null, x.name + "'s station"),
        h('p', { class: 'note' }, 'Pick the skills this coach scores. Their scoring screen shows only these, and Missing scores only expects these from them. Pick none for every skill.'),
        h('div', { class: 'chips', style: 'margin-top:10px' }, h('button', { class: 'chip' + (cur.length ? '' : ' on'), onclick: () => { delete sh.stations[x.vid]; save(); syncSoon(ev); paint(); } }, 'All skills'),
          items.map(k => h('button', { class: 'chip' + (cur.includes(k.id) ? ' on' : ''), onclick: () => toggle(k.id) }, cur.includes(k.id) ? icon('check', 14) : null, k.name))),
        h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => { api.close(); render(); } }, 'Done')));
    };
    paint();
  });
}
const stationLabel = (ev, vid) => { const st = ((ev.share && ev.share.stations) || {})[vid]; if (!st || !st.length) return 'All skills'; const names = allSkills(ev).concat(ev.form.tests).filter(k => st.includes(k.id)).map(k => k.name); return names.length > 2 ? names.slice(0, 2).join(', ') + ' +' + (names.length - 2) : names.join(', ') || 'All skills'; };

/* ---------------- copy an event (next season, another age group) ---------------- */
function copyEventSheet(ev) {
  let withPlayers = true, withGroups = true, withDays = true;
  openSheet((s, api) => {
    const name = h('input', { class: 'inp', value: ev.name.replace(/ \(copy\)$/, '') + ' (copy)', maxlength: '60' });
    const paint = () => refill(s, h('h2', null, 'Copy this event'),
      h('p', { class: 'note' }, 'A new event with the same form (skills, scale, weights, tests, score guides, decision choices). No scores, notes, check-ins or decisions are copied.'),
      h('div', { class: 'stack', style: 'margin-top:10px' }, field('Name', name),
        h('div', { class: 'chips' },
          h('button', { class: 'chip' + (withPlayers ? ' on' : ''), onclick: () => { withPlayers = !withPlayers; paint(); } }, withPlayers ? icon('check', 14) : null, cap(W.players) + ' (' + ev.players.length + ')'),
          ev.groups.length ? h('button', { class: 'chip' + (withGroups ? ' on' : ''), onclick: () => { withGroups = !withGroups; paint(); } }, withGroups ? icon('check', 14) : null, 'Groups (' + ev.groups.length + ')') : null,
          (ev.sessions || []).length > 1 ? h('button', { class: 'chip' + (withDays ? ' on' : ''), onclick: () => { withDays = !withDays; paint(); } }, withDays ? icon('check', 14) : null, 'Days (' + ev.sessions.length + ')') : null)),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => {
        const n = clean(name.value, 60) || ev.name + ' (copy)';
        const ne = newEvent(n, ev.sport, ev.form);
        delete ne.form.stations;
        if (withGroups) ne.groups = ev.groups.map(g => Object.assign({}, g));
        if (withPlayers) ne.players = ev.players.map(p => ({ id: uid('p'), num: p.num, name: p.name, pos: p.pos, div: p.div, group: withGroups ? p.group : '', notes: p.notes || '' }));
        if (withDays && ev.sessions && ev.sessions.length > 1) ne.sessions = ev.sessions.map(d => ({ id: d.id, name: d.name }));
        ne.line = ev.line || 0; touch(ne); api.close(); go('e', ne.id, 'players'); toast('Copied. This is the new event.');
      } }, 'Copy')));
    paint();
  });
}

/* ---------------- finish (lock) an event ---------------- */
async function finishEvent(ev, lock) {
  if (lock && !(await confirmBox({ title: 'Finish this event?', message: 'Scoring and notes are locked on every phone, so nothing changes by accident. Results, decisions and exports still work. You can unlock it any time.', ok: 'Finish event' }))) return;
  ev.locked = lock; touch(ev); syncSoon(ev); render(); toast(lock ? 'Event finished. Scoring is locked.' : 'Unlocked. Scoring is open again.');
}
const lockedBanner = ev => ev.locked ? h('div', { class: 'lockbar' }, icon('check', 16), h('div', { class: 'grow' }, ev.join ? 'The organizer finished this event. Scoring is closed.' : 'This event is finished. Scoring is locked.'), ev.join ? null : h('button', { class: 'btn sm', onclick: () => finishEvent(ev, false) }, 'Unlock')) : null;

/* ---------------- results grid: every player by every skill ---------------- */
function viewGrid(evId) {
  const ev = eventById(evId);
  if (!ev || ev.join) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  ensureDays(ev); W = wordsOf(ev);
  const f = ev.form, { res, rows } = resultRows(ev), ks = allSkills(ev), lo = scaleLo(f), mx = res.skMax;
  const fv = v => v == null ? '' : f.scale === 'pcm' ? pcmLabel(v) : fmtV(v);
  const heat = v => { if (v == null) return ''; const t = Math.max(0, Math.min(1, (v - lo) / Math.max(1e-9, mx - lo))); return 'background:hsla(' + Math.round(4 + t * 128) + ',62%,' + Math.round(34 + t * 6) + '%,' + (0.28 + t * 0.5).toFixed(2) + ')'; };
  const short = n => n.length > 9 ? n.slice(0, 8) + '…' : n;
  return [topBar('Results grid', ['e', ev.id, 'results'], h('button', { class: 'iconbtn', 'aria-label': 'Save as PDF', onclick: () => go('p', ev.id, 'grid') }, icon('file'))),
    h('main', { class: 'page wide' },
      h('p', { class: 'note', style: 'margin:-4px 0 10px' }, 'Sorted and filtered like the Results tab. Darker green is higher, red is lower. Tap a name for the card.'),
      h('div', { class: 'gridwrap' }, h('table', { class: 'rpgrid' },
        h('thead', null, h('tr', null, h('th', { class: 'stick' }, cap(W.player)), h('th', null, 'Overall'), ks.map(k => h('th', { title: k.name }, short(k.name))), f.tests.map(t => h('th', { title: t.name }, short(t.name))))),
        h('tbody', null, rows.map(r => h('tr', null,
          h('th', { class: 'stick', onclick: () => go('r', ev.id, r.p.id) }, h('span', { class: 'jn sm' }, r.p.num || '–'), ' ', r.p.name || ''),
          h('td', { class: 'ov', style: heat(r.overall) }, r.pct == null ? '' : Math.round(r.pct) + '%'),
          ks.map(k => { const s = r.skills[k.id]; return h('td', { style: heat(s ? s.v : null) }, s ? fv(s.v) : (skillsFor(ev, r.p).some(x => x.id === k.id) ? '' : '·')); }),
          f.tests.map(t => h('td', null, r.tests[t.id] == null ? '' : fmtV(r.tests[t.id], 2)))))))))];
}
function gridReport(ev) {
  const f = ev.form, { res, rows } = resultRows(ev), ks = allSkills(ev), w = wordsOf(ev);
  const fv = v => v == null ? '' : f.scale === 'pcm' ? pcmLabel(v) : fmtV(v);
  const head = ['No.', 'Name', '%'].concat(ks.map(k => k.name), f.tests.map(t => t.name));
  return { title: ev.name + ' · results grid', subtitle: [sportById(ev.sport).name, rows.length + ' ' + (rows.length === 1 ? w.player : w.players), 'printed ' + new Date().toLocaleDateString()].join(' · '), landscape: true,
    blocks: [{ table: { head, align: ['r', 'l'].concat(head.slice(2).map(() => 'r')), rows: rows.map(r => [r.p.num || '', r.p.name || '', r.pct == null ? '' : String(Math.round(r.pct))].concat(ks.map(k => r.skills[k.id] ? fv(r.skills[k.id].v) : ''), f.tests.map(t => r.tests[t.id] == null ? '' : fmtV(r.tests[t.id], 2)))) } }] };
}

/* ---------------- coach comparison (view only: nothing is adjusted) ----------------
   For each coach: how their scores compare with the other coaches' scores on the same players and skills. */
function coachStats(ev) {
  ensureDays(ev);
  const f = ev.form, skillIds = new Set(allSkills(ev).map(k => k.id)), cells = new Map();   // 'pid|kid|sid' -> [{by, v}]
  for (const key in ev.scores || {}) {
    const [by, pid, kid, sid] = key.split('|'), r = ev.scores[key];
    if (!r || r.v == null || !skillIds.has(kid)) continue;
    const c = key.slice(by.length + 1); if (!cells.has(c)) cells.set(c, []); cells.get(c).push({ by, v: r.v });
  }
  const out = {};
  for (const [c, list] of cells) {
    for (const x of list) {
      const o = out[x.by] = out[x.by] || { by: x.by, n: 0, sum: 0, shared: 0, diff: 0, players: new Set(), perSkill: {} };
      o.n++; o.sum += x.v; o.players.add(c.split('|')[0]);
      const others = list.filter(y => y.by !== x.by);
      if (others.length) {
        const d = x.v - others.reduce((a, y) => a + y.v, 0) / others.length; o.shared++; o.diff += d;
        const kid = c.split('|')[1], ps = o.perSkill[kid] = o.perSkill[kid] || { n: 0, d: 0 }; ps.n++; ps.d += d;
      }
    }
  }
  return Object.values(out).map(o => ({ by: o.by, name: evalName(ev, o.by), n: o.n, players: o.players.size, avg: o.sum / o.n, shared: o.shared, diff: o.shared ? o.diff / o.shared : null,
    perSkill: Object.entries(o.perSkill).map(([kid, x]) => ({ kid, n: x.n, d: x.d / x.n })) })).sort((a, b) => (b.diff == null ? -99 : b.diff) - (a.diff == null ? -99 : a.diff));
}
function viewCoaches(evId) {
  const ev = eventById(evId);
  if (!ev || ev.join) return [topBar('Not found', 'home'), h('main', { class: 'page' }, h('div', { class: 'empty' }, 'That event is not on this phone.'))];
  W = wordsOf(ev);
  const f = ev.form, stats = coachStats(ev), range = Math.max(1e-9, scaleHi(f) - scaleLo(f)), names = Object.fromEntries(allSkills(ev).map(k => [k.id, k.name]));
  const fv = v => f.scale === 'pcm' ? fmtV(v) : fmtV(v);
  const word = d => d == null ? 'no shared ' + W.players + ' yet' : Math.abs(d) < range * 0.05 ? 'about the same as the others' : (d > 0 ? fmtV(d) + ' higher' : fmtV(-d) + ' lower') + ' than the others';
  return [topBar('Coach comparison', ['e', ev.id, 'results']),
    h('main', { class: 'page' },
      h('p', { class: 'note', style: 'margin:-4px 0 12px' }, 'How each coach scores compared with the other coaches on the same ' + W.players + ' and skills. This is only a view: results are not adjusted.'),
      stats.length ? h('div', { class: 'list', style: 'gap:10px' }, stats.map(c => {
        const pos = c.diff == null ? 50 : 50 + Math.max(-50, Math.min(50, c.diff / range * 100 * 2.5));
        return h('details', { class: 'coach' },
          h('summary', null,
            h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'pnm' }, c.name), h('div', { class: 'pmeta' }, plural(c.players, W.player, W.players) + ' · ' + c.n + ' scores · average ' + fv(c.avg))),
              h('b', { class: 'cdiff' + (c.diff == null ? '' : c.diff > range * 0.05 ? ' hi' : c.diff < -range * 0.05 ? ' lo' : '') }, c.diff == null ? '–' : (c.diff > 0 ? '+' : '') + fmtV(c.diff))),
            h('div', { class: 'cbar' }, h('span', { class: 'mid' }), h('i', { style: 'left:' + pos + '%' })),
            h('div', { class: 'pmeta' }, cap(word(c.diff)) + (c.shared ? ' (' + c.shared + ' shared scores)' : ''))),
          c.perSkill.length ? h('div', { class: 'cskills' }, c.perSkill.sort((a, b) => b.d - a.d).map(x => h('div', { class: 'row' }, h('span', { class: 'grow' }, names[x.kid] || 'Skill'), h('span', { class: 'pmeta' }, x.n + ' shared'), h('b', { style: 'min-width:56px;text-align:right' }, (x.d > 0 ? '+' : '') + fmtV(x.d))))) : null);
      })) : h('div', { class: 'empty' }, 'No scores yet.'),
      h('p', { class: 'note', style: 'margin-top:12px' }, '+ means this coach scores higher than the others on average, − lower. Tap a coach for each skill.'))];
}

/* ---------------- glare mode (bright rinks, fields and outdoor camps) ---------------- */
function applyTheme() { try { document.documentElement.dataset.theme = S.settings.glare ? 'glare' : ''; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = S.settings.glare ? '#ffffff' : '#0b0b0e'; } catch (e) { /* ignore */ } }
function toggleGlare() { S.settings.glare = !S.settings.glare; save(); applyTheme(); render(); }

/* ---------------- spreadsheet files (.xlsx): the first sheet becomes tab-separated text ---------------- */
async function xlsxToText(file) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open spreadsheet files. Save it as CSV and choose that instead.');
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('That file is not a spreadsheet.');
  const files = {}, count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    files[new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen))] = { method, csize, off }; p += 46 + nlen + xlen + clen;
  }
  const read = async name => {
    const e = files[name]; if (!e) return null;
    const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true), data = buf.subarray(start, start + e.csize);
    if (e.method === 0) return new TextDecoder().decode(data);
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(ds).text();
  };
  const doc = t => new DOMParser().parseFromString(t, 'application/xml');
  const ss = await read('xl/sharedStrings.xml'), strings = ss ? [...doc(ss).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sheetName = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))[0];
  if (!sheetName) throw new Error('No sheet found in that file.');
  const sheet = doc(await read(sheetName)), lines = [];
  const col = ref => { const m = (ref || '').match(/^[A-Z]+/); if (!m) return -1; let n = 0; for (const ch of m[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  for (const row of sheet.getElementsByTagName('row')) {
    const cells = [];
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
      let val = t === 's' ? strings[parseInt(v && v.textContent, 10)] || '' : t === 'inlineStr' ? (is ? is.textContent : '') : (v ? v.textContent : '');
      if (/^\d+\.0+$/.test(val)) val = val.replace(/\.0+$/, '');
      const i = col(c.getAttribute('r')); cells[i < 0 ? cells.length : i] = String(val).replace(/[\t\r\n]+/g, ' ');
    }
    const line = Array.from(cells, x => x || '').join('\t'); if (line.trim()) lines.push(line);
  }
  return lines.join('\n');
}
