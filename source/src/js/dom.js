
/* =====================================================================
   UI foundation: DOM helper, icons, sheets/modals, toast, router
   ===================================================================== */
/* replace an element's children, skipping null and flattening lists (native replaceChildren would print "null") */
const refill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(x => x != null && x !== false));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') { el[k] = !!v; if (v) el.setAttribute(k, ''); }
    else el.setAttribute(k, v === true ? '' : v);
  }
  addKids(el, kids); return el;
}
function addKids(el, kids) { for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); } return el; }

