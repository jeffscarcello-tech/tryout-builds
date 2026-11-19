/* ---------- copied from ShotPulse ui-base.js (icons, sheets, confirm, toast, router) ---------- */

/* replaceChildren() would print the word "null" for empty slots — skip them */
(function () { const rc = Element.prototype.replaceChildren; Element.prototype.replaceChildren = function (...k) { rc.apply(this, k.flat(Infinity).filter(c => c != null && c !== false)); }; })();

const ICONS = {
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', eyeoff: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  bell: '<path d="M6 17h12l-1.6-2.4V10a4.4 4.4 0 0 0-8.8 0v4.6zM10 20a2 2 0 0 0 4 0"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 3h6"/>',
  game: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/>', teams: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.4a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1-1.3 2M12 17h.01"/>', stats: '<path d="M5 20V11M12 20V4M19 20v-6"/>', history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', check: '<path d="M5 12l5 5 9-10"/>',
  play: '<path d="M8 5v14l11-7z"/>', book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 13v7h14v-7"/>', dl: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>', chev: '<path d="M9 5l7 7-7 7"/>'
};
/* safety net: views often pass optional (null/false) children; the DOM would print them as the words "null"/"false" */
['append', 'prepend', 'replaceChildren'].forEach(m => { const o = Element.prototype[m]; Element.prototype[m] = function (...c) { return o.apply(this, c.filter(x => x != null && x !== false)); }; });
function icon(name, size) { const t = document.createElement('template'); t.innerHTML = `<svg class="i" viewBox="0 0 24 24"${size ? ` style="width:${size}px;height:${size}px"` : ''}>${ICONS[name] || ''}</svg>`; return t.content.firstChild; }

/* ---------- sheets / modals ---------- */
const sheetStack = [];
function openSheet(build, opts = {}) {
  const scrim = h('div', { class: 'scrim' + (opts.mid ? ' mid' : '') }), sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  scrim.append(sheet);
  const api = { el: sheet, close() { if (!scrim.isConnected) return; scrim.remove(); const i = sheetStack.indexOf(api); if (i > -1) sheetStack.splice(i, 1); if (opts.onClose) opts.onClose(); } };
  /* tap the dimmed area above the sheet to close (pointer events: more reliable than click on phones) */
  let downOnScrim = false;
  scrim.addEventListener('pointerdown', e => { downOnScrim = e.target === scrim; });
  scrim.addEventListener('pointerup', e => { if (downOnScrim && e.target === scrim) { downOnScrim = false; api.close(); } });
  scrim.addEventListener('click', e => { if (e.target === scrim) api.close(); });
  if (!opts.mid) {
    sheet.append(h('div', { class: 'grabzone', 'aria-hidden': 'true' }, h('div', { class: 'grab' })));
    /* pull the handle (or title) down to close */
    let drag = null;
    sheet.addEventListener('pointerdown', e => {
      if (!e.target.closest('.grabzone, h2')) return;
      drag = { y: e.clientY, t: Date.now(), dy: 0 }; sheet.style.animation = 'none'; sheet.style.transition = 'none';
      try { sheet.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    sheet.addEventListener('pointermove', e => {
      if (!drag) return; drag.dy = Math.max(0, e.clientY - drag.y);
      sheet.style.transform = `translateY(${drag.dy}px)`; scrim.style.background = `rgba(0,0,0,${(0.62 * (1 - Math.min(1, drag.dy / 420))).toFixed(3)})`;
    });
    const endDrag = () => {
      if (!drag) return; const d = drag; drag = null; const v = d.dy / Math.max(1, Date.now() - d.t);
      if (d.dy > 80 || (v > 0.5 && d.dy > 24)) { sheet.style.transition = 'transform .18s ease-in'; sheet.style.transform = 'translateY(110%)'; setTimeout(() => api.close(), 170); }
      else { sheet.style.transition = 'transform .18s ease-out'; sheet.style.transform = ''; scrim.style.background = ''; }
    };
    sheet.addEventListener('pointerup', endDrag); sheet.addEventListener('pointercancel', endDrag);
  }
  build(sheet, api); document.body.append(scrim); sheetStack.push(api); return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close(); });
function confirmBox({ title, message, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
    openSheet((s, api) => {
      s.append(h('h2', null, title), message ? h('p', { class: 'muted', style: 'line-height:1.45' }, message) : null,
        h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => { fin(false); api.close(); } }, cancel), h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { fin(true); api.close(); } }, ok)));
    }, { mid: true, onClose: () => fin(false) });
  });
}
let toastT = null;
function toast(msg) { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }
function toastAction(msg, a, b, ms = 7000) {
  const btns = Array.isArray(a) ? a : [[a, b]];
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div', { class: 'toast act', role: 'status' }, h('span', { class: 'tmsg' }, msg), btns.map(([label, fn]) => h('button', { class: 'tbtn', onclick: () => { t.remove(); fn(); } }, label)));
  document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), ms);
}
/* ---------- router ---------- */
const R = { name: 'home', args: [] };
function parseRoute() { const p = location.hash.replace(/^#\/?/, '').split('/').filter(x => x !== '').map(decodeURIComponent); R.name = p[0] || 'home'; R.args = p.slice(1); }
const go = (...p) => { location.hash = '#/' + p.map(encodeURIComponent).join('/'); };
let navCount = 0; window.addEventListener('hashchange', () => { navCount++; });
/* Back: use browser history when the app has navigated, but if that does nothing (some phones/PWAs ignore it), go to the page's parent route. */
const goBack = fallback => {
  const to = () => go(...[].concat(fallback)), h0 = location.hash;
  if (navCount > 0) { try { history.back(); } catch (e) { to(); return; } setTimeout(() => { if (location.hash === h0) to(); }, 300); } else to();
};

