#!/usr/bin/env node
/* A new phone or tablet is set up from a link, and the QR code that carries
   it is a real QR code: this reads every code back the way a scanner does --
   unmask, un-interleave, check the error correction is consistent, parse the
   bytes -- and must get the text out again.
   The encoder was also checked square for square against an independent
   library (python "qrcode") and decoded with OpenCV while it was written.
   Run: node tools/test-device-setup.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/qr.js', 'utf8') +
  '\nthis.Q = { qrMatrix, qrSkeleton, qrMaskAt, qrFormatBits, QR_L };', ctx);
const { qrMatrix, qrSkeleton, qrMaskAt, qrFormatBits, QR_L } = ctx.Q;

/* A reader, written from the standard rather than from the encoder: it walks
   the matrix on its own, reads the format squares to learn the mask, and
   parses the byte-mode stream. */
function qrRead(m) {
  const n = m.length, ver = (n - 17) / 4;
  /* The mask is in the format squares, most significant bit first. */
  let f = 0;
  for (let i = 0; i <= 5; i++) f |= (m[8][i] ? 1 : 0) << (14 - i);
  f |= (m[8][7] ? 1 : 0) << 8; f |= (m[8][8] ? 1 : 0) << 7; f |= (m[7][8] ? 1 : 0) << 6;
  for (let i = 0; i <= 5; i++) f |= (m[i][8] ? 1 : 0) << i;
  const mask = ((f ^ 0x5412) >> 10) & 0x07;
  if (qrFormatBits(mask) !== f) throw new Error('format squares do not say level L with a known mask');
  const { used } = qrSkeleton(ver);
  const bits = [];
  let up = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (let c = right; c > right - 2; c--) {
        if (used[r][c]) continue;
        bits.push((m[r][c] !== qrMaskAt(mask, r, c)) ? 1 : 0);
      }
    }
    up = !up;
  }
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  /* Un-interleave back into its blocks. */
  const [eccN, groups] = QR_L[ver];
  const lens = [];
  groups.forEach(([count, len]) => { for (let i = 0; i < count; i++) lens.push(len); });
  const blocks = lens.map(() => []);
  let at = 0;
  for (let i = 0; i < Math.max(...lens); i++) lens.forEach((len, b) => { if (i < len) blocks[b].push(cw[at++]); });
  const eccs = lens.map(() => []);
  for (let i = 0; i < eccN; i++) lens.forEach((_l, b) => eccs[b].push(cw[at++]));
  return { ver, mask, blocks, eccs, eccN, data: blocks.flat() };
}
/* Every syndrome of a correct codeword is zero -- the check a scanner makes
   before it trusts what it read. */
function qrSyndromesZero(block, ecc) {
  const EXP = new Array(512), LOG = new Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  const all = block.concat(ecc);
  for (let s = 0; s < ecc.length; s++) {
    let v = 0;
    for (let i = 0; i < all.length; i++) v = mul(v, EXP[s]) ^ all[i];
    if (v !== 0) return false;
  }
  return true;
}
/* The bytes back out of the stream. */
function qrText(data, ver) {
  const bits = [];
  data.forEach(b => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); });
  const take = (at, len) => parseInt(bits.slice(at, at + len).join(''), 2);
  if (take(0, 4) !== 4) throw new Error('not byte mode');
  const lenBits = ver < 10 ? 8 : 16;
  const count = take(4, lenBits);
  const out = [];
  for (let i = 0; i < count; i++) out.push(take(4 + lenBits + i * 8, 8));
  return Buffer.from(out).toString('utf8');
}

const cases = ['HI', 'SHIC', 'https://synercore.github.io/CostEstimation/',
  'https://synercore.github.io/CostEstimation/?setup=' + 'A1b2-_'.repeat(30),
  'Ångström ñ 日本語', 'x'.repeat(300), 'y'.repeat(425)];
let allBack = true, allEcc = true;
cases.forEach(t => {
  const r = qrMatrix(t);
  const got = qrRead(r.modules);
  const ecc = got.blocks.every((b, i) => qrSyndromesZero(b, got.eccs[i]));
  const back = qrText(got.data, got.ver);
  if (back !== t) { allBack = false; console.log('    ' + t.slice(0, 30) + ' came back as ' + back.slice(0, 30)); }
  if (!ecc) { allEcc = false; console.log('    error correction does not check out at v' + r.version); }
});
ck('every code reads back as the text it was made from', allBack);
ck('and its error correction checks out, as a scanner checks it', allEcc);
ck('the code grows with the text, no bigger than it must be',
  qrMatrix('HI').version === 1 && qrMatrix('x'.repeat(300)).version === 11 && qrMatrix('y'.repeat(425)).version === 13);
let threw = false; try { qrMatrix('z'.repeat(426)); } catch (_e) { threw = true; }
ck('and text too long for one says so rather than drawing nonsense', threw);

/* ---- the setup link ---- */
const sp = fs.readFileSync('src/sp.js', 'utf8');
const win = { location: { search: '?setup=' + Buffer.from(JSON.stringify(
  { s: 'https://contoso.sharepoint.com/sites/TSG', c: 'abc-123', p: 'SHICCE2' })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  origin: 'https://synercore.github.io', pathname: '/CostEstimation/', hash: '', href: 'https://synercore.github.io/CostEstimation/' },
  history: { replaceState: () => {} } };
const store = {};
const c2 = {
  console, window: win, location: win.location, URLSearchParams, atob: s2 => Buffer.from(s2, 'base64').toString('binary'),
  btoa: s2 => Buffer.from(s2, 'binary').toString('base64'), escape, unescape, decodeURIComponent, encodeURIComponent,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } }
};
vm.createContext(c2);
/* Only the settings part of sp.js: the rest talks to SharePoint and MSAL. */
const head = sp.slice(0, sp.indexOf('let _spMsalApp'));
vm.runInContext(head + '\nthis.R = { spAdoptSetupLink, spSetupLink, getSPConfig, getSiteURL };', c2);
const cfg = c2.R.getSPConfig();
ck('a device opening the link stores the site it names', cfg.siteUrl === 'https://contoso.sharepoint.com/sites/TSG');
ck('with the client id and list prefix', cfg.clientId === 'abc-123' && cfg.listPrefix === 'SHICCE2');
ck('so the app knows where it is talking to', c2.R.getSiteURL() === 'https://contoso.sharepoint.com/sites/TSG');
ck('and the admin builds that same link from what is saved',
  c2.R.spSetupLink() === 'https://synercore.github.io/CostEstimation/?setup=' + win.location.search.slice(7));
/* Junk in the address must not wipe a working device's settings. */
const store2 = { shic_sp_config: JSON.stringify({ siteUrl: 'https://good.sharepoint.com/sites/A', clientId: 'keep' }) };
const c3 = { ...c2, window: { ...win, location: { ...win.location, search: '?setup=not-base64' } },
  localStorage: { getItem: k => (k in store2 ? store2[k] : null), setItem: (k, v) => { store2[k] = v; }, removeItem: () => {} } };
c3.location = c3.window.location;
vm.createContext(c3);
vm.runInContext(head + '\nthis.R = { getSPConfig };', c3);
ck('a broken setup link leaves a working device alone',
  c3.R.getSPConfig().siteUrl === 'https://good.sharepoint.com/sites/A' && c3.R.getSPConfig().clientId === 'keep');

/* ---- where it is offered ---- */
const panel = fs.readFileSync('src/components/FbSetupPanel.js', 'utf8');
ck('the admin panel shows the code and the link',
  panel.includes("onClick:()=>setDevLink(l=>l?'':spSetupLink())") && panel.includes('qrMatrix(devLink)') &&
  panel.includes("navigator.clipboard.writeText(devLink)"));
ck('the drawing is plain SVG squares, nothing fetched', panel.includes("shapeRendering:'crispEdges'") && !panel.includes('chart.googleapis'));
ck('and the encoder is loaded and cached with the app',
  fs.readFileSync('index.html', 'utf8').includes('src/qr.js') && fs.readFileSync('sw.js', 'utf8').includes('./src/qr.js'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ndevice setup OK'); process.exit(bad ? 1 : 0);
