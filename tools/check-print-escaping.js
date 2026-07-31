#!/usr/bin/env node
/*
 * The printed CE is built as an HTML string and written into a new window with
 * document.write. Any user-entered value interpolated raw is stored XSS: a CE
 * description containing markup runs in whoever opens that CE, and on shared
 * SharePoint that is someone else's browser. A plain "&" or "<" also corrupts
 * the printout.
 *
 * This asserts every user-controlled field in that region goes through esc().
 *
 * Run: node tools/check-print-escaping.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
const lines = src.split('\n');

const start = lines.findIndex(l => l.includes('const handleGenerateCE = '));
const end = lines.findIndex((l, i) => i > start && l.includes('w.document.close();'));
if (start < 0 || end < 0) { console.error('could not locate the printed-CE builder in src/App.js'); process.exit(1); }

/* Accessors that carry text a user can type (or that an Excel import writes). */
const USER_DATA = [
  /\binfo\.(client|description|location|ceNum|attention|endUser|material|date|days|qty)\b/,
  /\bit\.text\b/, /\bn\.text\b/,
  /\br\.(desc|role|uom|qty|pax|days|otHours)\b/,
  /\ba\.(name|role|title)\b/,
  /\bco\.(name|doc|sub|revNo|revDate|color|logo)\b/,
  /\bhlLabel\s*\(/,
];

const offenders = [];
for (let i = start; i <= end; i++) {
  const line = lines[i];
  /* Each ${...} interpolation on the line, non-greedy so nested ones split. */
  const re = /\$\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(line))) {
    const expr = m[1];
    if (!USER_DATA.some(rx => rx.test(expr))) continue;
    if (/\besc\s*\(/.test(expr)) continue;          // escaped
    if (/^\s*fmt\s*\(|^\s*N\s*\(|^\s*ph\s*\(/.test(expr)) continue;  // numeric formatters
    offenders.push('  src/App.js:' + (i + 1) + '  ${' + expr.trim().slice(0, 90) + '}');
  }
}

if (offenders.length) {
  console.error('\nUnescaped user data in the printed CE (' + offenders.length + '):\n');
  console.error([...new Set(offenders)].join('\n'));
  console.error('\nWrap each in esc(...) — see the helper in src/helpers.js.\n');
  process.exit(1);
}
console.log('print escaping OK (region lines ' + (start + 1) + '-' + (end + 1) + ')');
