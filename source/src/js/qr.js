/* copied from ShotPulse qr.js (read only original) */

/* ---------- Tiny QR code generator (byte mode, ECC level M, versions 1-10) ---------- */
const QR = (() => {
  // [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] for ECC level M
  const TABLE = {
    1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0],
    5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39],
    9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44]
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

  // GF(256) arithmetic
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  function rsGenerator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
      g = next;
    }
    return g; // highest degree first
  }
  function rsRemainder(data, n) {
    const g = rsGenerator(n), rem = new Array(n).fill(0);
    for (const b of data) {
      const f = b ^ rem.shift(); rem.push(0);
      if (f !== 0) for (let i = 0; i < n; i++) rem[i] ^= gmul(g[i + 1], f);
    }
    return rem;
  }

  function dataCapacity(v) { const t = TABLE[v]; return t[1] * t[2] + t[3] * t[4]; }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let v = 0;
    for (let k = 1; k <= 10; k++) { const ccBits = k < 10 ? 8 : 16; if (4 + ccBits + bytes.length * 8 <= dataCapacity(k) * 8) { v = k; break; } }
    if (!v) throw new Error('QR: text too long');
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach(b => push(b, 8));
    const cap = dataCapacity(v) * 8;
    push(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    for (let pad = 0xEC; data.length < dataCapacity(v); pad ^= 0xEC ^ 0x11) data.push(pad);

    // split into blocks, compute ECC, interleave
    const [ec, b1, d1, b2, d2] = TABLE[v];
    const blocks = []; let pos = 0;
    for (let i = 0; i < b1 + b2; i++) { const len = i < b1 ? d1 : d2; blocks.push(data.slice(pos, pos + len)); pos += len; }
    const eccs = blocks.map(b => rsRemainder(b, ec));
    const out = [];
    const maxD = Math.max(d1, d2 || 0);
    for (let i = 0; i < maxD; i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ec; i++) eccs.forEach(e => out.push(e[i]));
    return { v, codewords: out };
  }

  function build(text) {
    const { v, codewords } = encode(text);
    const size = 17 + 4 * v;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (x, y, val) => { if (x >= 0 && y >= 0 && x < size && y < size) { mod[y][x] = !!val; fn[y][x] = true; } };

    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); setFn(cx + dx, cy + dy, d !== 2 && d !== 4); }
    });
    const ap = ALIGN[v];
    for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (mask) => {
      const data = (0 << 3) | mask; let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const bit = i => ((bits >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
      setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
      setFn(8, size - 8, true);
    };
    drawFormat(0); // reserve areas
    if (v >= 7) {
      let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const b = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); setFn(a, c, b); setFn(c, a, b); }
    }
    // place data
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && k < codewords.length * 8) { mod[y][x] = ((codewords[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
      }
    }
    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => (((x + y) % 2) + (x * y) % 3) % 2 === 0
    ];
    const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0;
      const lines = [];
      for (let y = 0; y < size; y++) lines.push(mod[y].map(b => b ? 1 : 0));
      for (let x = 0; x < size; x++) lines.push(mod.map(r => r[x] ? 1 : 0));
      for (const ln of lines) {
        let run = 1;
        for (let i = 1; i <= size; i++) {
          if (i < size && ln[i] === ln[i - 1]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1; }
        }
        const s = ln.join('');
        for (const pat of ['000010111010', '010111010000'])
          for (let i = s.indexOf(pat); i !== -1; i = s.indexOf(pat, i + 1)) p += 40;
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      let dark = 0; mod.forEach(r => r.forEach(b => { if (b) dark++; }));
      p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
    applyMask(best); drawFormat(best);
    return { size, modules: mod };
  }

  function svg(text, { margin = 4, dark = '#000', light = '#fff' } = {}) {
    const { size, modules } = build(text);
    const n = size + margin * 2;
    let d = '';
    for (let y = 0; y < size; y++) {
      let x = 0;
      while (x < size) {
        if (modules[y][x]) { let w = 1; while (x + w < size && modules[y][x + w]) w++; d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`; x += w; } else x++;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }
  return { build, svg };
})();

