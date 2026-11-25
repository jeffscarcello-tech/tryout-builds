/* =====================================================================
   First-time tips, the demo event, Help and Privacy.
   ===================================================================== */

/* a small tip shown the first time a screen opens; Hide remembers it (Home, More, Show tips again brings them back) */
function tip(key, text) {
  let off = false; try { off = localStorage.getItem('rp.notips') === '1'; } catch (e) { /* ignore */ }
  if (off || (S.settings.tips || {})[key]) return null;
  const el = h('div', { class: 'tip' }, h('span', { class: 'tipi' }, icon('help', 18)), h('div', { class: 'grow' }, text),
    h('button', { class: 'mini', 'aria-label': 'Hide tip', onclick: () => { S.settings.tips = Object.assign({}, S.settings.tips, { [key]: 1 }); save(); el.remove(); } }, icon('x')));
  return el;
}

/* ---------------- demo event: a volleyball tryout with 3 coaches' scores already in ---------------- */
function makeDemo() {
  let seed = 20261119; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ev = newEvent('Demo: U15 girls tryouts', 'volleyball');
  ev.demo = true; ev.form.divisions = ['U15'];
  ev.groups = [{ id: uid('g'), name: 'Group A', when: 'Sat 9:00', where: 'Court 1' }, { id: uid('g'), name: 'Group B', when: 'Sat 11:00', where: 'Court 2' }];
  const roster = [[4, 'Ava M', 'Setter'], [7, 'Brooke L', 'Outside'], [9, 'Chloe R', 'Middle'], [11, 'Dana K', 'Libero'], [12, 'Emma S', 'Outside'], [14, 'Faith T', 'Opposite'], [15, 'Grace P', 'Middle'], [17, 'Hailey W', 'Setter'],
    [2, 'Isla B', 'Outside'], [3, 'Jade N', 'Libero'], [5, 'Kayla D', 'Middle'], [8, 'Leah F', 'Opposite'], [10, 'Maya G', 'Outside'], [13, 'Nora H', 'Setter'], [16, 'Olivia J', 'Middle'], [18, 'Piper C', 'Outside']];
  ev.players = roster.map(([num, name, pos], i) => ({ id: uid('p'), num: String(num), name, pos, div: 'U15', group: ev.groups[i < 8 ? 0 : 1].id, notes: '' }));
  ev.players[3].notes = 'Played up last season';
  ensureDays(ev); ev.checks = {}; ev.scores = {}; ev.notes = {};
  const sid = ev.sessions[0].id, t0 = Date.now() - 3 * 3600000;
  const coaches = [['demoana', 'Coach Ana'], ['demoben', 'Coach Ben'], ['democam', 'Coach Cam']];
  ev.evaluators = Object.fromEntries(coaches);
  const away = ev.players[15];   // #18 did not show up
  ev.players.forEach((p, i) => { ev.checks['demoana|' + p.id + '||' + sid] = { id: uid('c'), v: p === away ? 0 : 1, t: t0 + i * 1000 }; });
  const level = new Map(ev.players.map(p => [p.id, 2.2 + rnd() * 2.6]));
  const lo = scaleLo(ev.form), hi = scaleHi(ev.form);
  let t = t0 + 60000;
  for (const [by, , ] of coaches) for (const p of ev.players) {
    if (p === away) continue;
    if (by === 'democam' && p.group !== ev.groups[0].id) continue;        // Coach Cam only scored Group A
    const skip = by === 'democam' && ['Grace P', 'Hailey W'].includes(p.name);   // and not all of it yet
    for (const k of skillsFor(ev, p)) {
      if (skip) continue;
      const v = Math.max(lo, Math.min(hi, Math.round(level.get(p.id) + (rnd() - 0.5) * 1.6 + (k.name === 'Serving' ? 0.3 : 0))));
      ev.scores[sKey(by, p.id, k.id, sid)] = { id: uid('r'), v, t: t += 1000 };
    }
    if (by === 'demoana') ev.form.tests.forEach((ts, j) => { ev.scores[sKey(by, p.id, ts.id, sid)] = { id: uid('r'), v: Math.round((j ? 52 : 40) + level.get(p.id) * 4 + rnd() * 6), t: t += 1000 }; });
  }
  const k = name => (ev.form.skills.find(x => x.name === name) || {}).id;
  const note = (by, i, kid, text) => { ev.notes[sKey(by, ev.players[i].id, kid || '', sid)] = { id: uid('r'), v: text, t: t += 1000 }; };
  note('demoana', 0, k('Setting'), 'Quick hands, consistent location');
  note('demoben', 1, k('Attacking'), 'Big arm, works on line shot');
  note('demoana', 3, '', 'Great reads on serve receive');
  note('demoben', 8, '', 'Very coachable, strong effort all session');
  note('democam', 4, k('Serving'), 'Jump float, misses long');
  ev.line = 10; S.settings.day = Object.assign({}, S.settings.day, { [ev.id]: sid });
  touch(ev); return ev;
}
function openDemo() {
  const had = S.events.find(e => e.demo);
  if (had) { go('e', had.id, 'results'); return; }
  const ev = makeDemo(); go('e', ev.id, 'results');
  toast('Demo loaded: scores from 3 coaches. Delete it any time from the ••• menu.');
}

/* ---------------- Help ---------------- */
const HELP = [
  ['Set up an event', [
    'Tap New event, give it a name and pick your sport. The sport fills in its skills, ' + 'positions and tests. You can change all of it in the Form tab.',
    'Add players one at a time, or tap Import list and paste from a spreadsheet or email. A header row like Number, Name, Position, Division, Group is understood.',
    'Groups (Groups tab) split a big tryout into sessions, for example "Group A, Sat 9:00, Court 1".',
    'Form tab: rename, add, remove and reorder skills, set weights (×1, ×2), pick a scale (1 to 5, 1 to 10, + ✓ −, or your own like 1 to 100), add measured tests and days. Save it as your template to reuse next season.']],
  ['Score on your phone', [
    'Tap Start scoring, pick the day and group, then choose By number (type a jersey number), By name (the full list) or By skill (one skill for every player).',
    'Tap a score; tap it again to clear it. The small + beside a skill adds a note. Next goes to the next player not fully scored.',
    'Scores save on the phone as you tap, with or without signal.']],
  ['Several coaches scoring', [
    'Players tab, Share with evaluators. Other coaches scan the QR code or open the link, type their name and score on their own phones. No accounts.',
    'In the same sheet you can give a coach only certain groups, and let a coach check players in.',
    'Coaches see only their own scores. You see everyone\'s in Results as they come in. Missing scores shows who still needs scoring by whom.',
    'No signal in the gym is fine: scores wait on each phone and send when it reconnects. The pill at the top shows how many are waiting.',
    'Stop sharing any time. You keep every score.']],
  ['Open an event on another device', [
    'Set up the event where it is easiest (typing or pasting a list is easier on a computer), then tap ••• and Open on another device.',
    'On the other phone or tablet, point the camera at the code and tap the link. On a computer, or if you use RosterPulse from your Home Screen, open RosterPulse there, tap Join with a code and type the 8 letters.',
    'The other device gets the whole event and stays in step: changes on either one show on the other. It needs a signal once; after that it works offline like any event.']],
  ['Other organizers', [
    'After you share an event, Share sheet, Add an organizer makes a one-time 8-character code (with a QR code). The other organizer taps Join with a code on their phone or computer.',
    'Organizers see and change everything: scores, results, private notes, check-in and team decisions. Add as many as you need, one code each.',
    'Every organizer can do the same things: add or remove other organizers, open the event on another device, and stop sharing for everyone. To leave, an organizer deletes the event on their phone.',
    'If two organizers change the setup at the same moment, both changes are kept where possible.']],
  ['Team decisions', [
    'Results tab, Team decisions. Tap Made team, Waitlist or Not selected beside each player, or Fill from ranking to do it in one go (it starts from the team line).',
    'Choices: switch to camp tracks (Advanced, Intermediate, Beginner), team levels, or your own list.',
    'Save as PDF lists each outcome with numbers and names only, no scores, ready to post or send to families. Evaluators never see decisions.']],
  ['Score guides', [
    'Form tab, Score guides: a short line for what each score means, for every skill or one skill at a time. New events start with sample guides you can change.',
    'Evaluators see the line under the score they tap, and the guide button beside a skill shows the whole guide.']],
  ['Check-in', [
    'Players tab, Check-in. Tap each player as they arrive. Players not checked in move to the bottom of the scoring lists, Next skips them and Missing scores leaves them out.',
    'Each day has its own check-in. Until someone is checked in that day, everyone counts as here.']],
  ['Several days', [
    'Form tab, Days. With more than one day, choose Average the days, Add the days, or Carry scores forward (each day starts from the last score).']],
  ['Results', [
    'Results tab: sort by overall or any skill, filter by position, group or division, and move the team line with − and +.',
    'Tap a player for their card: ranks, skill bars, strengths and work-ons, tests and every note.',
    'More: Compare 2 or 3 players side by side, and Missing scores.',
    '⚑ means coaches disagree a lot on a skill.']],
  ['Save, print and share', [
    'Save as PDF makes a clean report (results list or one player\'s card). Your phone\'s share menu then offers Print, Save to Files, Mail and Messages.',
    'Spreadsheet saves a CSV file that opens in Excel, Numbers or Google Sheets.',
    'Results are for you only. Nothing is shown to players or parents unless you share it.']],
  ['Your data', [
    'Events live on this phone. Home, Back up or restore saves a file you can keep or move to a new phone.',
    'Shared events are also kept on the RosterPulse server until you stop sharing. See Privacy for details.']],
  ['Stations, finishing and copying', [
    'Stations: in the Share sheet, under a coach, tap Station and pick the skills they score (for example serving and passing at court 1). Their scoring screen shows only those.',
    'Finish event (••• menu) locks scoring and notes on every phone when the tryout is over. Results, decisions and exports still work. Unlock any time.',
    'Copy this event (••• menu) starts a new one with the same form, and the roster, groups and days if you want, with no scores. Good for next season or another age group.']],
  ['Results grid and coach comparison', [
    'Results tab, More: Results grid shows every player by every skill, coloured from red (lower) to green (higher). It saves as a PDF too.',
    'Coach comparison shows whether each coach scores higher or lower than the other coaches on the same players. It is only a view: results are not changed.']],
  ['Bright light mode', [
    'Home, More: Bright light mode switches to white screens that are easier to read in sun or bright rinks.']],
  ['Install on your phone', [
    'Home, More, Add to Home Screen shows the steps for iPhone, Android and computers. Installed, it opens like an app and works with no signal.',
    'On iPhone, install before setting up events: the Home Screen app keeps its own copy, separate from Safari.']],
  ['After tryouts', [
    'For hockey, ringette, basketball, soccer and lacrosse, ShotPulse (shotpulse.app, from the maker of RosterPulse) tracks the team\'s game stats all season, with a live link for parents. The two apps are separate: nothing moves between them unless you type it in.']],
  ['Updates', [
    'The app checks for a new version when you open it and shows Update now. Home, More, Check for updates shows your version and updates straight away if a newer one is out. Something not working? Home, More, Report a problem opens an email with your version and phone type filled in.']]];
function viewHelp() {
  return [topBar('Help', 'home'), h('main', { class: 'page doc' },
    h('p', { class: 'muted', style: 'margin-bottom:12px' }, 'Quick answers. Tap a topic.'),
    h('button', { class: 'btn block', style: 'margin-bottom:14px', onclick: openDemo }, icon('play'), 'Open the demo event'),
    h('div', { class: 'list', style: 'gap:8px' }, HELP.map(([title, items], i) => h('details', { class: 'faq', open: i === 0 ? true : null }, h('summary', null, title), h('ul', null, items.map(t => h('li', null, t)))))),
    h('p', { class: 'note', style: 'margin-top:14px' }, 'Something not working? Tell the person who gave you the app.'))];
}

/* ---------------- Privacy (same text as the /privacy page) ---------------- */
const PRIVACY_DOC = __PRIVACY_DOC__;
function viewPrivacy() {
  const box = h('div', { class: 'privdoc' }); box.innerHTML = PRIVACY_DOC;   // written by us at build time, no user content
  return [topBar('Privacy', 'home'), h('main', { class: 'page doc' }, box)];
}
