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
  window.__rp = { APP, S, SPORTS, parseRoster, formFromSport, newEvent, render, syncEvent, SYNC };   // for tests
})();
