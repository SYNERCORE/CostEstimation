/* A QR code, drawn here rather than fetched.

   Setting up a new phone or tablet means carrying a long link to it, and
   typing one on a tablet keyboard is how people give up. A QR code is the
   short way, and the app is offline-first, so it cannot depend on a code
   generator on the web: this is the whole encoder, in byte mode at error
   correction level L, versions 1 to 13 (up to 425 characters).

   The output is a square of true/false -- qrMatrix(text).modules[row][col] --
   which the caller draws however it likes. */

/* Data codewords a version holds at level L, and how its error correction
   blocks are cut up: [ecc per block, [[blocks, data codewords], ...]]. */
const QR_L = {
  1:  [7,  [[1, 19]]],
  2:  [10, [[1, 34]]],
  3:  [15, [[1, 55]]],
  4:  [20, [[1, 80]]],
  5:  [26, [[1, 108]]],
  6:  [18, [[2, 68]]],
  7:  [20, [[2, 78]]],
  8:  [24, [[2, 97]]],
  9:  [30, [[2, 116]]],
  10: [18, [[2, 68], [2, 69]]],
  11: [20, [[4, 81]]],
  12: [24, [[2, 92], [2, 93]]],
  13: [26, [[4, 107]]]
};
/* Where the alignment patterns sit, by version. */
const QR_ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62]
};

/* Arithmetic in GF(256), the field the error correction is built on. */
const QR_EXP = new Array(512), QR_LOG = new Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) { QR_EXP[i] = x; QR_LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255];
})();
function qrMul(a, b) { return (a === 0 || b === 0) ? 0 : QR_EXP[QR_LOG[a] + QR_LOG[b]]; }

/* The generator polynomial for n error correction codewords. */
function qrGenPoly(n) {
  let p = [1];
  for (let i = 0; i < n; i++) {
    const q = [1, QR_EXP[i]], r = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) for (let k = 0; k < 2; k++) r[j + k] ^= qrMul(p[j], q[k]);
    p = r;
  }
  return p;
}
/* The error correction codewords for one block. */
function qrEcc(data, n) {
  const gen = qrGenPoly(n), res = data.concat(new Array(n).fill(0));
  for (let i = 0; i < data.length; i++) {
    const c = res[i];
    if (!c) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= qrMul(gen[j], c);
  }
  return res.slice(data.length);
}

/* The 15 bits that say which error correction level and mask were used. */
function qrFormatBits(mask) {
  let d = (0x01 << 3) | mask, v = d << 10;                 /* 0b01 = level L */
  for (let i = 4; i >= 0; i--) if (v & (1 << (i + 10))) v ^= 0x537 << i;
  return ((d << 10) | v) ^ 0x5412;
}
/* The 18 bits that say which version this is, on version 7 and up. */
function qrVersionBits(ver) {
  let v = ver << 12;
  for (let i = 5; i >= 0; i--) if (v & (1 << (i + 12))) v ^= 0x1F25 << i;
  return (ver << 12) | v;
}

function qrMaskAt(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

/* The fixed patterns every QR code carries, and a map of the squares they
   own, which the data must then flow around. */
function qrSkeleton(ver) {
  const n = ver * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const used = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, v) => { m[r][c] = v; used[r][c] = true; };
  const finder = (R, C) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = R + r, cc = C + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                 (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      set(rr, cc, on);
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = QR_ALIGN[ver] || [];
  al.forEach(r => al.forEach(c => {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) return;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }));
  set(n - 8, 8, true);                                     /* the dark module */
  /* The format squares are claimed now and written once the mask is chosen. */
  for (let i = 0; i < 9; i++) { if (!used[8][i]) used[8][i] = true; if (!used[i][8]) used[i][8] = true; }
  for (let i = 0; i < 8; i++) { used[8][n - 1 - i] = true; used[n - 1 - i][8] = true; }
  if (ver >= 7) for (let i = 0; i < 18; i++) {
    const r = Math.floor(i / 3), c = i % 3;
    used[n - 11 + c][r] = true; used[r][n - 11 + c] = true;
  }
  return { n, m, used };
}

/* text -> { size, modules }. Throws when the text is longer than version 13
   holds, which no setup link of ours comes close to. */
function qrMatrix(text) {
  const bytes = [];
  for (const ch of unescape(encodeURIComponent(String(text)))) bytes.push(ch.charCodeAt(0) & 0xFF);
  let ver = 0, total = 0, eccN = 0, groups = null;
  for (let v = 1; v <= 13; v++) {
    const [e, g] = QR_L[v];
    const cap = g.reduce((t, [b, d]) => t + b * d, 0);
    const lenBits = v < 10 ? 8 : 16;
    if (bytes.length + 2 + Math.ceil(lenBits / 8) <= cap + 1 && (4 + lenBits + bytes.length * 8) <= cap * 8) {
      ver = v; eccN = e; groups = g; total = cap; break;
    }
  }
  if (!ver) throw new Error('Too much text for a QR code of this size');

  /* The bit stream: mode, length, the bytes, a terminator, then padding. */
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4);
  push(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach(b => push(b, 8));
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const pad = [0xEC, 0x11];
  for (let i = 0; data.length < total; i++) data.push(pad[i % 2]);

  /* Cut into blocks, work out each block's error correction, then interleave
     them the way the standard lays them out. */
  const blocks = [], eccs = [];
  let at = 0;
  groups.forEach(([count, len]) => {
    for (let i = 0; i < count; i++) { const b = data.slice(at, at + len); at += len; blocks.push(b); eccs.push(qrEcc(b, eccN)); }
  });
  const out = [];
  const maxData = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxData; i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < eccN; i++) eccs.forEach(e => out.push(e[i]));
  const dataBits = [];
  out.forEach(b => { for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1); });

  const { n, m, used } = qrSkeleton(ver);
  /* Up the right-hand side, down the next, two columns at a time, skipping
     the timing column. */
  let bi = 0, up = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (let c = right; c > right - 2; c--) {
        if (used[r][c]) continue;
        m[r][c] = bi < dataBits.length ? dataBits[bi++] === 1 : false;
      }
    }
    up = !up;
  }

  /* Try every mask, keep the one the standard's penalty rules like best. */
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const t = m.map(row => row.slice());
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!used[r][c] && qrMaskAt(mask, r, c)) t[r][c] = !t[r][c];
    qrWriteFormat(t, n, ver, mask);
    const p = qrPenalty(t, n);
    if (!best || p < best.p) best = { p, t };
  }
  return { size: n, modules: best.t, version: ver };
}

function qrWriteFormat(t, n, ver, mask) {
  const f = qrFormatBits(mask);
  const bit = i => ((f >> i) & 1) === 1;      /* i counts from the lowest bit */
  /* Top left, most significant first along the row, then up the column. */
  for (let i = 0; i <= 5; i++) t[8][i] = bit(14 - i);
  t[8][7] = bit(8); t[8][8] = bit(7); t[7][8] = bit(6);
  for (let i = 0; i <= 5; i++) t[i][8] = bit(i);
  /* And the second copy: up the bottom-left column, then along the top-right. */
  for (let i = 0; i <= 6; i++) t[n - 1 - i][8] = bit(14 - i);
  for (let i = 0; i <= 7; i++) t[8][n - 1 - i] = bit(i);
  t[n - 8][8] = true;
  if (ver >= 7) {
    const v = qrVersionBits(ver);
    for (let i = 0; i < 18; i++) {
      const on = ((v >> i) & 1) === 1, r = Math.floor(i / 3), c = i % 3;
      t[n - 11 + c][r] = on; t[r][n - 11 + c] = on;
    }
  }
}

/* How awkward a masked code looks to a scanner: runs of one colour, blocks of
   one colour, finder-like patterns, and an unbalanced light/dark mix. */
function qrPenalty(t, n) {
  let p = 0;
  const line = get => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
  };
  line((r, c) => t[r][c]); line((c, r) => t[r][c]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++)
    if (t[r][c] === t[r][c + 1] && t[r][c] === t[r + 1][c] && t[r][c] === t[r + 1][c + 1]) p += 3;
  const pat = [true, false, true, true, true, false, true, false, false, false, false];
  const rev = pat.slice().reverse();
  const hit = (get, a, b) => {
    const eq = q => q.every((v, i) => get(a, b + i) === v);
    return eq(pat) || eq(rev);
  };
  for (let r = 0; r < n; r++) for (let c = 0; c + 11 <= n; c++) {
    if (hit((x, y) => t[x][y], r, c)) p += 40;
    if (hit((x, y) => t[y][x], r, c)) p += 40;
  }
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (t[r][c]) dark++;
  p += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
  return p;
}
