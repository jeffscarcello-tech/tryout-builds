/* =====================================================================
   Tryout app: stage 0 shell. Shows the version, online state and update check.
   Real screens (events, roster, scoring) arrive in stage 1 and 2.
   ===================================================================== */
const APP = { name: '__NAME__', build: '__BUILD__', label: '__LABEL__' };
let SWREG = null;

function toast(msg, ms) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'tst' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms || 3000);
}
function toastAction(msg, label, fn) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'tst' }); document.body.append(t); }
  t.replaceChildren(h('span', { class: 'grow' }, msg), h('button', { class: 'tstbtn', onclick: fn }, label));
  t.classList.add('on'); clearTimeout(t._h);
}

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
      toastAction('A new version is ready.', 'Update now', () => location.reload());
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
    if (SWREG.waiting || SWREG.installing) { toastAction('A new version is ready.', 'Update now', () => location.reload()); return; }
    toast('You have the latest version (' + APP.build + ').');
  } catch (e) { toast('Could not check right now. Are you online?'); }
}

function statusPill() {
  const on = navigator.onLine;
  return h('span', { class: 'pill' + (on ? ' ok' : ' off'), 'data-conn': '' }, h('span', { class: 'dot' }), on ? 'Online' : 'Offline');
}
function render() {
  const app = document.getElementById('app');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  app.replaceChildren(
    h('header', { class: 'top' },
      h('div', { class: 'brand grow' }, h('img', { src: '/icon.svg', alt: '', class: 'logo' }), APP.name),
      statusPill()),
    h('main', { class: 'page' },
      h('div', { class: 'hero' },
        h('h1', { class: 'disp' }, 'Tryouts and camps'),
        h('p', { class: 'muted' }, 'Score players by jersey number from any phone. Rankings build live.')),
      h('div', { class: 'card' },
        h('div', { class: 'sect' }, 'Test build'),
        h('p', null, 'This is the empty starter app. Event setup, rosters and scoring come next.'),
        h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Version'), h('b', { id: 'ver', class: 'num' }, APP.build)),
        h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Installed on this phone'), h('b', null, standalone ? 'Yes' : 'Not yet')),
        h('button', { class: 'btn', onclick: checkForUpdate }, 'Check for updates')),
      standalone ? null : h('div', { class: 'card' },
        h('div', { class: 'sect' }, 'Add to your home screen'),
        h('p', { class: 'muted small' }, 'iPhone: tap Share, then Add to Home Screen. Android: tap the menu, then Install app.')),
      h('p', { class: 'faint tiny center foot' }, APP.label)));
}

(function boot() {
  render();
  const conn = () => document.querySelectorAll('[data-conn]').forEach(el => el.replaceWith(statusPill()));
  window.addEventListener('online', conn); window.addEventListener('offline', conn);
  registerSW();
})();
