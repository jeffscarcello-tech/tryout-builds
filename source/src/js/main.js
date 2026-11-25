/* =====================================================================
   RosterPulse: start-up, page switching, service worker and update check.
   ===================================================================== */
const APP = { name: '__NAME__', build: '__BUILD__', label: '__LABEL__' };
let SWREG = null;

/* t28: updates. The old Check for updates leaned on service-worker timing: the new worker takes over by itself within
   a second, so after 1.8 s the button often said "latest" (or nothing) while the screen stayed old. Now the app asks the
   server which build is live (/api/health, never cached) and, if it differs, clears the stored copies and reloads,
   which always loads the new version. The same check runs when the app is opened or comes back to the screen. */
async function serverBuild() {
  const r = await fetch('/api/health?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('health_' + r.status);
  const j = await r.json(); return j && j.build ? String(j.build) : null;
}
let updating = false, offered = '';
async function applyUpdate() {
  if (updating) return; updating = true;
  toast('Updating RosterPulse…');
  try { save(true); } catch (e) { /* ignore */ }
  try { const reg = SWREG || ('serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null); if (reg) await Promise.race([reg.update(), new Promise(r => setTimeout(r, 4000))]).catch(() => { }); } catch (e) { /* ignore */ }
  try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) { /* ignore */ }
  location.reload();
}
function offerUpdate(build) {
  if (updating || offered === build) return; offered = build;
  toastAction('A new version of RosterPulse is ready' + (build ? ' (' + build + ')' : '') + '.', 'Update now', applyUpdate, 120000);
}
async function quietCheck() {
  if (!navigator.onLine || updating) return;
  try { const b = await serverBuild(); if (b && b !== APP.build) offerUpdate(b); } catch (e) { /* offline or busy: try later */ }
}
function registerSW() {
  try {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js').then(reg => {
      SWREG = reg;
      const check = () => { try { reg.update().catch(() => { }); } catch (e) { /* ignore */ } };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { check(); quietCheck(); } });
      check();
    }).catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) quietCheck(); });   // the first install is not an update
  } catch (e) { /* ignore */ }
  setTimeout(quietCheck, 2500);
  window.addEventListener('online', () => setTimeout(quietCheck, 1500));
}
async function checkForUpdate() {
  if (!navigator.onLine) { toast('No signal. Check for updates needs a connection.'); return; }
  toast('Checking…');
  let b;
  try { b = await serverBuild(); } catch (e) { toast('Could not check right now. Try again in a moment.'); return; }
  if (!b || b === APP.build) { toast('You have the latest version (' + APP.build + ').'); return; }
  applyUpdate();
}

/* t29: Report a problem. Opens an email with the build and phone details filled in. The subject must start with
   "RosterPulse problem": the daily problem-report task searches Gmail for exactly that. */
const SUPPORT = 'support@shotpulse.app';
function reportInfo() {
  const ua = navigator.userAgent || '';
  let dev = 'Computer';
  const ios = ua.match(/(iPhone|iPad|iPod).*?OS (\d+[_\d]*)/), and = ua.match(/Android (\d+(\.\d+)*)/);
  if (ios) dev = ios[1] + ', iOS ' + ios[2].replace(/_/g, '.');
  else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) dev = 'iPad (desktop mode)';
  else if (and) dev = 'Android ' + and[1] + (/Mobile/.test(ua) ? ' phone' : ' tablet');
  else if (/Mac OS X/.test(ua)) dev = 'Mac'; else if (/Windows/.test(ua)) dev = 'Windows'; else if (/Linux/.test(ua)) dev = 'Linux';
  let home = false; try { home = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { /* ignore */ }
  const evs = (S.events || []).filter(e => !e.demo);
  const players = evs.reduce((n, e) => n + ((e.players || []).length), 0);
  return [
    'Build: ' + APP.build,
    'Device: ' + dev,
    'Opened as: ' + (home ? 'Home Screen app' : 'browser'),
    'Screen: ' + screen.width + 'x' + screen.height + ', window ' + window.innerWidth + 'x' + window.innerHeight,
    'Page: ' + (location.hash || '#/'),
    'Online: ' + (navigator.onLine ? 'yes' : 'no'),
    'Events: ' + evs.length + ' (' + evs.filter(e => e.share || e.join).length + ' shared), players: ' + players + ', templates: ' + (S.templates || []).length + (S.events.some(e => e.demo) ? ', demo open' : ''),
    'Time: ' + new Date().toString(),
    'Browser: ' + ua].join('\n');
}
/* t30: the questions are typed in the app (two boxes), then the email opens ready to send. The Gmail app on iPhone
   drops line breaks when it sends, so every line starts with a marker ("1)", "2)", "•") that still reads well when
   everything runs together. */
function reportUrl(what, expected) {
  const subject = 'RosterPulse problem (' + APP.build + ')';
  const one = t => String(t || '').trim().replace(/\s*\n\s*/g, ' / ').slice(0, 1000);
  const body = '1) What happened: ' + one(what) + '\n\n' +
    '2) What I expected: ' + one(expected) + '\n\n' +
    '— Details for the fix (please leave) —\n' + reportInfo().split('\n').map(l => '• ' + l).join('\n') + '\n';
  return 'mailto:' + SUPPORT + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body).replace(/%0A/g, '%0D%0A');
}
function reportProblem(what, expected) {
  location.href = reportUrl(what, expected);
  setTimeout(() => toast('If no email opened, write to ' + SUPPORT), 1200);
}
function reportSheet() {
  openSheet((s, api) => {
    const what = h('textarea', { class: 'inp', 'data-r': 'what', maxlength: '1000', style: 'min-height:96px', placeholder: 'For example: I tapped Save as PDF on a player card and nothing opened.' });
    const exp = h('textarea', { class: 'inp', 'data-r': 'exp', maxlength: '1000', style: 'min-height:72px', placeholder: 'For example: the PDF to open so I could share it.' });
    s.append(h('h2', null, 'Report a problem'),
      h('div', { class: 'stack' },
        field('What happened?', what),
        field('What did you expect?', exp),
        h('p', { class: 'note' }, 'Next, your email app opens with this filled in, plus your version and phone type. Just tap Send. Nothing about your players is included.'),
        h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'),
          h('button', { class: 'btn primary', 'data-r': 'send', onclick: () => { api.close(); reportProblem(what.value, exp.value); } }, icon('mail'), 'Open email'))));
    setTimeout(() => { try { what.focus(); } catch (e) { /* ignore */ } }, 80);
  });
}

let lastRoute = '';
function render() {
  parseRoute();
  if (R.name === 'demo') { const had = S.events.find(e => e.demo); location.replace('#/e/' + (had || makeDemo()).id + '/results'); return; }
  const app = document.getElementById('app'), key = location.hash, same = key === lastRoute, y = window.scrollY;
  let view;
  if (R.name === 'e') view = viewEvent(R.args[0], R.args[1]);
  else if (R.name === 's') view = R.args[3] ? viewScorePlayer(R.args[0], R.args[1], R.args[2], R.args[3]) : viewScoreList(R.args[0], R.args[1], R.args[2]);
  else if (R.name === 'r') view = viewPlayerCard(R.args[0], R.args[1]);
  else if (R.name === 'p') view = viewPrint(R.args[0], R.args[1], R.args[2]);
  else if (R.name === 'c') view = viewCompare(R.args[0], R.args[1]);
  else if (R.name === 'm') view = viewMissing(R.args[0]);
  else if (R.name === 'k') view = viewCheckin(R.args[0], R.args[1]);
  else if (R.name === 'x') view = viewDecisions(R.args[0]);
  else if (R.name === 'rg') view = viewGrid(R.args[0]);
  else if (R.name === 'cc') view = viewCoaches(R.args[0]);
  else if (R.name === 'help') view = viewHelp();
  else if (R.name === 'privacy') view = viewPrivacy();
  else if (R.name === 'templates') view = viewTemplates();
  else view = viewHome();
  app.dataset.view = R.name;
  /* browser tab and home-screen switcher show the event name with the app name */
  const evNow = ['e', 's', 'r', 'p', 'c', 'm', 'k', 'x', 'rg', 'cc'].includes(R.name) ? eventById(R.args[0]) : null;
  document.title = evNow ? evNow.name + ' · RosterPulse' : 'RosterPulse';
  /* every page but home ends with the RosterPulse mark */
  if (R.name !== 'p') { const v = [].concat(view).flat(Infinity).filter(Boolean); const m = v.find(x => x.tagName === 'MAIN'); if (m) m.append(brandFoot()); }
  app.replaceChildren(...[].concat(view).flat(Infinity).filter(Boolean));
  if (same) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastRoute = key;
}

(function boot() {
  window.addEventListener('hashchange', render);
  render();
  const conn = () => document.querySelectorAll('[data-conn]').forEach(el => el.replaceWith(connPill()));
  window.addEventListener('online', conn); window.addEventListener('offline', conn);
  registerSW();
  const jm = location.pathname.match(/^\/j\/([A-Za-z0-9]{6}|[A-Za-z0-9]{8})\/?$/);
  if (jm) { const n0 = (new URLSearchParams(location.search).get('n') || '').slice(0, 30); history.replaceState(null, '', '/' + location.hash); setTimeout(() => joinSheet(jm[1].toUpperCase(), n0), 150); }
  applyTheme();
  setTimeout(syncTick, 800);
  window.__rp = { APP, S, SPORTS, setScore, ensureDays, parseRoster, formFromSport, newEvent, render, syncEvent, SYNC, reportInfo, reportUrl, reportProblem, reportSheet };   // for tests
})();
