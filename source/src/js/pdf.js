/* =====================================================================
   A small PDF writer for RosterPulse reports (no outside library).
   A report is { title, subtitle, landscape, blocks: [...] } where a block is
     { h: 'Heading' } | { p: 'Text that wraps' } | { kv: [[label, value], ...] }
     { table: { head: [...], rows: [[...], ...], line: n (draw the team line under row n), align: ['l','r',...] } }
   The same report is shown on screen as the print preview, so what you print is what you save.
   Fonts: Helvetica and Helvetica-Bold (built into every PDF reader), Windows-1252 text.
   ===================================================================== */
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const pdfText = s => String(s == null ? '' : s).replace(/✓/g, 'ok').replace(/[−–—]/g, '-').replace(/⚑/g, '(!)').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, 'x').replace(/[^\x20-\x7e\xa0-\xff·½]/g, '?');
function textW(s, size, bold) { let w = 0; for (const ch of pdfText(s)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126 ? HELV[c - 32] : 556) * (bold ? 1.05 : 1); } return w * size / 1000; }
function fitText(s, size, max, bold) { s = pdfText(s); if (textW(s, size, bold) <= max) return s; while (s.length > 1 && textW(s + '…', size, bold) > max) s = s.slice(0, -1); return s + '...'; }
function wrapText(s, size, max) {
  const out = []; for (const para of pdfText(s).split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (textW(t, size) > max && line) { out.push(line); line = w; } else line = t; } out.push(line); }
  return out;
}
const pdfEsc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function makePdf(rep) {
  const W = rep.landscape ? 792 : 612, H = rep.landscape ? 612 : 792, M = 36, pages = [];
  let ops = [], y = 0;
  const newPage = () => { if (ops.length) pages.push(ops.join('\n')); ops = []; y = H - M; };
  const txt = (x, yy, s, size, bold, rgb) => ops.push((rgb || '0 0 0') + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + x.toFixed(1) + ' ' + yy.toFixed(1) + ' Td (' + pdfEsc(pdfText(s)) + ') Tj ET');
  const rect = (x, yy, w, hh, gray) => ops.push(gray + ' g ' + x.toFixed(1) + ' ' + yy.toFixed(1) + ' ' + w.toFixed(1) + ' ' + hh.toFixed(1) + ' re f');
  const line = (x1, y1, x2, y2, wdt, rgb) => ops.push((rgb || '0 0 0') + ' RG ' + wdt + ' w ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' m ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' l S');
  const need = hh => { if (y - hh < M + 14) { newPage(); return true; } return false; };
  newPage();
  // the RosterPulse mark (clipboard, checks, pulse), drawn 15 pt tall in the 512 grid of the icon
  { const k = 15 / 512, x0 = M, y0 = y + 2;
    ops.push('q ' + k.toFixed(5) + ' 0 0 ' + (-k).toFixed(5) + ' ' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' cm 1 J 1 j',
      '0.133 0.133 0.169 rg 118 96 276 330 re f 0.227 0.227 0.275 rg 204 70 104 54 re f',
      '0.965 0.965 0.973 RG 20 w 168 168 m 186 186 l 218 150 l S 244 172 m 340 172 l S 168 230 m 186 248 l 218 212 l S 244 234 m 310 234 l S',
      '1 0.541 0.122 RG 30 w 92 362 m 186 362 l 208 326 l 240 410 l 276 280 l 300 352 l 416 352 l S Q'); }
  txt(M + 19, y - 10, 'RosterPulse', 10, true, '1 0.541 0.122'); y -= 26;
  txt(M, y - 14, rep.title || '', 17, true); y -= 22;
  if (rep.subtitle) { txt(M, y - 9, rep.subtitle, 9, false, '0.35 0.35 0.35'); y -= 18; }
  y -= 4;
  for (const b of rep.blocks || []) {
    if (b.h) { need(28); y -= 8; txt(M, y - 11, b.h, 11.5, true); y -= 18; continue; }
    if (b.p) { for (const ln of wrapText(b.p, 9.5, W - 2 * M)) { need(13); txt(M, y - 9.5, ln, 9.5); y -= 13; } y -= 4; continue; }
    if (b.kv) { for (const [k, v] of b.kv) { need(15); txt(M, y - 10, k, 9.5, false, '0.35 0.35 0.35'); txt(M + 150, y - 10, v, 10.5, true); y -= 15; } y -= 4; continue; }
    if (b.table) {
      const t = b.table, n = t.head.length, size = n > 12 ? 7 : n > 8 ? 7.5 : 8.5, pad = 4, rowH = size + 6;
      /* column width comes from the cells and the longest word of the heading (headings wrap onto 2 lines) */
      const word = hd => Math.max(...pdfText(hd).split(' ').map(w => textW(w, size, true)));
      const nat = t.head.map((hd, i) => Math.min(170, Math.max(word(hd), ...t.rows.map(r => textW(r[i], size))) + pad * 2 + 2));
      const total = nat.reduce((a, c) => a + c, 0), avail = Math.min(W - 2 * M, total);
      const wid = total <= avail ? nat : nat.map(w => w * avail / total);
      const hl = t.head.map((hd, i) => { const ls = wrapText(hd, size, wid[i] - pad * 2); return ls.length > 2 ? [ls[0], fitText(ls.slice(1).join(' '), size, wid[i] - pad * 2, true)] : ls; });
      const headH = Math.max(...hl.map(l => l.length)) * (size + 2) + 5;
      const head = () => { rect(M, y - headH, avail, headH, '0.9'); let x = M; hl.forEach((ls, i) => { ls.forEach((ln, j) => txt(x + pad, y - 3 - (j + 1) * (size + 1.5), fitText(ln, size, wid[i] - pad * 2, true), size, true)); x += wid[i]; }); y -= headH; };
      need(rowH + headH); head();
      t.rows.forEach((r, ri) => {
        if (need(rowH)) head();
        if (ri % 2) rect(M, y - rowH, avail, rowH, '0.965');
        let x = M; r.forEach((c, i) => { const s = fitText(c, size, wid[i] - pad * 2); const right = t.align && t.align[i] === 'r'; txt(right ? x + wid[i] - pad - textW(s, size) : x + pad, y - rowH + 4.5, s, size); x += wid[i]; });
        y -= rowH;
        if (t.line && ri === t.line - 1 && ri < t.rows.length - 1) line(M, y, M + avail, y, 1.6, '1 0.541 0.122');
      });
      y -= 10; continue;
    }
  }
  newPage();
  /* assemble: catalog, pages, fonts, one content stream per page; footer with page numbers */
  const objs = [], add = s => { objs.push(s); return objs.length; };
  const cat = add(''), pgs = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach((body, i) => {
    const foot = '0.45 0.45 0.45 rg BT /F1 7.5 Tf ' + M + ' 20 Td (' + pdfEsc(pdfText('Made with RosterPulse · results are private to the organizer · page ' + (i + 1) + ' of ' + pages.length)) + ') Tj ET';
    const content = body + '\n' + foot;
    const c = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    kids.push(add('<< /Type /Page /Parent ' + pgs + ' 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + c + ' 0 R >>'));
  });
  objs[cat - 1] = '<< /Type /Catalog /Pages ' + pgs + ' 0 R >>';
  objs[pgs - 1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + cat + ' 0 R /Info << /Producer (RosterPulse) /Title (' + pdfEsc(pdfText(rep.title || 'RosterPulse')) + ') >> >>\nstartxref\n' + xref + '\n%%EOF';
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
