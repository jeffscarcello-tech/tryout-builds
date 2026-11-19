/* =====================================================================
   Add to Home Screen: a short guide for iPhone, Android and computers, shown once on Home and on an
   evaluator's event page until it is installed or hidden. Home, More, Add to Home Screen opens it any time.
   ===================================================================== */
const INSTALL = { prompt: null };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL.prompt = e; });
window.addEventListener('appinstalled', () => { INSTALL.prompt = null; S.settings.installSeen = 1; save(); });
const isInstalled = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
function deviceKind() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'computer';
}
function installCard() {
  let off = false; try { off = localStorage.getItem('rp.notips') === '1'; } catch (e) { /* ignore */ }
  if (off || isInstalled() || S.settings.installSeen || deviceKind() === 'computer') return null;
  const el = h('div', { class: 'tip icard' }, h('span', { class: 'tipi' }, icon('phone', 18)),
    h('div', { class: 'grow' }, h('b', null, 'Add RosterPulse to your Home Screen. '), 'It opens like an app and keeps working with no signal in the gym.',
      h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn sm', onclick: () => installSheet() }, 'Show me how'))),
    h('button', { class: 'mini', 'aria-label': 'Hide', onclick: () => { S.settings.installSeen = 1; save(); el.remove(); } }, icon('x')));
  return el;
}
function installSheet() {
  const kind = deviceKind();
  const step = (n, t) => h('div', { class: 'istep' }, h('span', { class: 'n' }, String(n)), h('div', null, t));
  openSheet((s, api) => {
    s.append(h('h2', null, 'Add to Home Screen'));
    if (isInstalled()) s.append(h('p', { class: 'note' }, 'RosterPulse is already on your Home Screen. You are using it now.'));
    else if (kind === 'ios') s.append(
      step(1, ['Open this page in ', h('b', null, 'Safari'), ' (other iPhone browsers may not offer it).']),
      step(2, ['Tap the ', h('b', null, 'Share'), ' button (the square with an arrow), at the bottom of the screen, or at the top on iPad.']),
      step(3, ['Scroll down and tap ', h('b', null, 'Add to Home Screen'), ', then ', h('b', null, 'Add'), '.']),
      step(4, 'Open RosterPulse from the new icon from now on.'));
    else if (kind === 'android') s.append(...[INSTALL.prompt ? h('button', { class: 'btn primary block big', onclick: async () => { const p = INSTALL.prompt; INSTALL.prompt = null; p.prompt(); try { const r = await p.userChoice; if (r && r.outcome === 'accepted') { S.settings.installSeen = 1; save(); api.close(); } } catch (e) { /* ignore */ } } }, icon('dl'), 'Install RosterPulse') : null,
      step(1, ['In Chrome, tap the ', h('b', null, '⋮'), ' menu at the top right.']),
      step(2, ['Tap ', h('b', null, 'Add to Home screen'), ' or ', h('b', null, 'Install app'), ', then ', h('b', null, 'Install'), '.']),
      step(3, 'Open RosterPulse from the new icon from now on.')].filter(Boolean));
    else s.append(step(1, ['In Chrome or Edge, click the ', h('b', null, 'install'), ' icon at the right of the address bar (a screen with an arrow).']),
      step(2, ['Or open the browser menu and choose ', h('b', null, 'Install RosterPulse'), ' (Chrome: Cast, save and share).']),
      step(3, 'On a Mac with Safari: File, Add to Dock.'));
    s.append(h('p', { class: 'note', style: 'margin-top:12px' }, 'Do this before you set up events. ' + (kind === 'ios' ? 'On iPhone the Home Screen app keeps its own copy, so events made in Safari stay in Safari. ' : '') + 'To move events between the two, use Home, Back up or restore.'),
      h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => { S.settings.installSeen = 1; save(); api.close(); render(); } }, 'Got it')));
  });
}
