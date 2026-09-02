#!/usr/bin/env node
/* Normalise CRLF -> LF across the sources.
 *
 * Windows tooling and `git checkout` both reintroduce CRLF, and several CI
 * checks read the source as text and match on exact line shapes -- so a file
 * that came back from git with CRLF fails tests that have nothing to do with
 * the change being made. This runs before a CI pass.
 */
'use strict';
const fs = require('fs'), path = require('path');
const roots = ['src', 'tools', 'scratchpad'];
let n = 0;
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { walk(f); continue; }
    if (!/\.(js|json|md|html|yml)$/.test(e.name)) continue;
    const s = fs.readFileSync(f, 'utf8');
    if (s.includes('\r\n')) { fs.writeFileSync(f, s.replace(/\r\n/g, '\n')); n++; console.log('  LF ' + f); }
  }
};
for (const r of roots) if (fs.existsSync(r)) walk(r);
for (const f of ['index.html', 'sw.js']) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes('\r\n')) { fs.writeFileSync(f, s.replace(/\r\n/g, '\n')); n++; console.log('  LF ' + f); }
}
console.log(n ? n + ' file(s) normalised' : 'already LF');
