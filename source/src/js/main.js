/* =====================================================================
   RosterPulse: start-up, page switching, service worker and update check.
   ===================================================================== */
const APP = { name: '__NAME__', build: '__BUILD__', label: '__LABEL__' };
let SWREG = null;

function registerSW() {
  try {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js').then(reg => {
      SWREG = reg;
      const check = () => { try { reg.update().catch(() => { }); } catch (e) { /* ignore */ } };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      check();
    }).catch(() => { });
    let shown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || shown) return; shown = true;   // the first install is not an update
      toastAction('A new version of RosterPulse is ready.', 'Update now', () => { save(true); location.reload(); }, 60000);
    });
  } catch (e) { /* ignore */ }
}
async function checkForUpdate() {
  try {
    if (!SWREG && 'serviceWorker' in navigator) SWREG = await navigator.serviceWorker.getRegistration().catch(() => null) || null;
    if (!SWREG) { toast('Updates are checked when the app is opened from its web address.'); return; }
    toast('Checking…');
    await SWREG.update();
    await new Promise(r => setTimeout(r, 1800));
    if (SWREG.waiting || SWREG.installing) { toastAction('A new version is ready.', 'Update now', () => { save(true); location.reload(); }, 60000); return; }
    toast('You have the latest version (' + APP.build + ').');
  } catch (e) { toast('Could not check right now. Are you online?'); }
}

let lastRoute = '';
function render() {
  parseRoute();
  const app = document.getElementById('app'), key = location.hash, same = key === lastRoute, y = window.scrollY;
  let view;
  if (R.name === 'e') view = viewEvent(R.args[0], R.args[1]);
  else if (R.name === 'templates') view = viewTemplates();
  else view = viewHome();
  app.dataset.view = R.name;
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
  window.__rp = { S, SPORTS, parseRoster, formFromSport, newEvent, render };   // for tests
})();
