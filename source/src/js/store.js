/* =====================================================================
   Storage on this phone (stage 1). Events and saved templates live in localStorage.
   Stage 2 adds the server copy for sharing with evaluators.
   Kids' data stays minimal: number, name, age division, position, group, present, notes.
   ===================================================================== */
const STORE_KEY = 'rp.v1';
const S = (() => {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { d = null; }
  if (!d || typeof d !== 'object') d = {};
  return { v: 1, events: Array.isArray(d.events) ? d.events : [], templates: Array.isArray(d.templates) ? d.templates : [], settings: d.settings || {} };
})();
let saveT = null;
function save(now) {
  const run = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch (e) { toast('This phone is out of storage space. Remove old events or make a backup.'); }
  };
  clearTimeout(saveT);
  if (now) run(); else saveT = setTimeout(run, 150);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

const eventById = id => S.events.find(e => e.id === id) || null;
function newEvent(name, sport, form) {
  const ev = { id: uid('e'), name: name || 'New event', sport, created: Date.now(), updated: Date.now(),
    form: form ? copyForm(form) : formFromSport(sport),
    groups: [], players: [] };
  S.events.unshift(ev); save(); return ev;
}
const touch = ev => { ev.updated = Date.now(); save(); };

/* clean text the same way everywhere (no markup, sensible length) */
const clean = (t, n) => String(t == null ? '' : t).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 60);
const cleanNum = t => String(t == null ? '' : t).replace(/[^0-9A-Za-z]/g, '').slice(0, 4);

/* =====================================================================
   Roster import: pasted lines or a CSV / spreadsheet export.
   Understands a header row (number, name, first, last, position, division/age, group, notes)
   or plain lines like "12 Sam Lee", "Sam Lee 12", "12, Sam Lee, Setter, U15".
   ===================================================================== */
function splitLine(line, sep) {
  if (sep === '\t') return line.split('\t').map(s => s.trim());
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim()); return out;
}
const HEAD = {
  num: /^(#|no\.?|num(ber)?|jersey( ?(no|#|number))?|bib|cap)$/i,
  name: /^(name|player|athlete|swimmer|full ?name|player name)$/i,
  first: /^(first( ?name)?|given( ?name)?)$/i,
  last: /^(last( ?name)?|surname|family( ?name)?)$/i,
  pos: /^(pos(ition)?|role|event( ?group)?|stroke)$/i,
  div: /^(div(ision)?|age( ?group| ?division)?|category|level|birth ?year)$/i,
  group: /^(group|session|squad|team)$/i,
  notes: /^(notes?|comments?)$/i
};
function parseRoster(text, form) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { players: [], skipped: [] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : lines[0].includes(';') ? ';' : null;
  const posList = (form && form.positions || []).map(p => p.toLowerCase());
  const divList = (form && form.divisions || []).map(p => p.toLowerCase());
  const players = [], skipped = [];
  let cols = null, start = 0;
  if (sep) {
    const hd = splitLine(lines[0], sep), map = {};
    hd.forEach((c, i) => { for (const k in HEAD) if (map[k] == null && HEAD[k].test(c.trim())) map[k] = i; });
    if (map.num != null || map.name != null || map.first != null || map.last != null) { cols = map; start = 1; }
  }
  for (let li = start; li < lines.length; li++) {
    const line = lines[li];
    let num = '', name = '', pos = '', div = '', group = '', notes = '';
    if (cols) {
      const c = splitLine(line, sep), at = k => cols[k] != null ? (c[cols[k]] || '') : '';
      num = at('num'); name = at('name') || [at('first'), at('last')].filter(Boolean).join(' ');
      pos = at('pos'); div = at('div'); group = at('group'); notes = at('notes');
    } else {
      const parts = sep ? splitLine(line, sep) : null;
      if (parts && parts.length > 1) {
        const rest = [];
        for (const p of parts) {
          if (!num && /^#?\d{1,3}$/.test(p)) num = p.replace('#', '');
          else if (!pos && posList.includes(p.toLowerCase())) pos = p;
          else if (!div && (divList.includes(p.toLowerCase()) || /^u\d{1,2}$/i.test(p))) div = p;
          else if (p) rest.push(p);
        }
        name = rest.shift() || ''; notes = rest.join(' ');
      } else {
        const m = line.match(/^#?(\d{1,3})[\s.)\-:]+(.+)$/) || null, m2 = !m && line.match(/^(.+?)[\s,]+#?(\d{1,3})$/);
        if (m) { num = m[1]; name = m[2]; } else if (m2) { name = m2[1]; num = m2[2]; } else name = line;
      }
    }
    num = cleanNum(num); name = clean(name, 40);
    if (!num && !name) { skipped.push(line); continue; }
    if (/^(name|player|#|number)$/i.test(name) && !num) { skipped.push(line); continue; }
    if (pos) { const i = posList.indexOf(pos.toLowerCase()); pos = i > -1 ? form.positions[i] : clean(pos, 30); }
    players.push({ num, name, pos, div: clean(div, 20), group: clean(group, 40), notes: clean(notes, 200) });
  }
  return { players, skipped };
}
/* numbers used more than once (inside one group, or across the event when no groups) */
function duplicateNumbers(players) {
  const seen = new Map(), dup = new Set();
  for (const p of players) { if (!p.num) continue; const k = (p.group || '') + '|' + p.num; if (seen.has(k)) dup.add(k); else seen.set(k, true); }
  return dup;
}
const sortPlayers = list => list.slice().sort((a, b) => (parseInt(a.num, 10) || 9999) - (parseInt(b.num, 10) || 9999) || String(a.num).localeCompare(String(b.num)) || a.name.localeCompare(b.name));

/* backup of everything on this phone, and restore (merges by id, newer wins) */
function exportData() { return JSON.stringify({ app: 'rosterpulse', v: 1, at: Date.now(), events: S.events, templates: S.templates }); }
function importData(text) {
  let d; try { d = JSON.parse(text); } catch (e) { throw new Error('That file is not a RosterPulse backup.'); }
  if (!d || d.app !== 'rosterpulse' || !Array.isArray(d.events)) throw new Error('That file is not a RosterPulse backup.');
  let added = 0, updated = 0;
  for (const e of d.events) {
    if (!e || typeof e.id !== 'string' || !e.form || !Array.isArray(e.players)) continue;
    const i = S.events.findIndex(x => x.id === e.id);
    if (i < 0) { S.events.push(e); added++; } else if ((e.updated || 0) > (S.events[i].updated || 0)) { S.events[i] = e; updated++; }
  }
  for (const t of d.templates || []) if (t && t.id && t.form && !S.templates.some(x => x.id === t.id)) S.templates.push(t);
  S.events.sort((a, b) => (b.updated || 0) - (a.updated || 0)); save(true);
  return { added, updated };
}
