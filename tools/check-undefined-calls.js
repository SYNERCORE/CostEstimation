#!/usr/bin/env node
/*
 * Catches calls to project functions that do not exist.
 *
 * The app is plain <script> files with no bundler and no module system, so a
 * call to a function nobody defines is perfectly valid JavaScript until the line
 * actually runs. The Admin panel's "Setup SharePoint" button called dbSetup(),
 * which was never defined anywhere -- clicking it threw a ReferenceError and
 * nothing else ever noticed.
 *
 * Scope: identifiers matching the project's own naming conventions (db*, sp*,
 * compute*, auto*, ensure*, calc*, handle*, mk*). Browser and library globals
 * are out of scope, which keeps this free of false positives without needing a
 * full scope analysis.
 *
 * Run: node tools/check-undefined-calls.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BS = String.fromCharCode(92);

/* Load scripts in the same order index.html does. */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [];
const re = /<script src="\.\/([^"?]+)(?:\?[^"]*)?"><\/script>/g;
let m;
while ((m = re.exec(html))) files.push(m[1]);

if (!files.length) { console.error('no local <script src> tags found in index.html'); process.exit(1); }

/* Blank out strings and comments so we do not match identifiers inside them.
   Newlines are preserved so reported line numbers stay accurate. */
function stripped(src) {
  let out = '', i = 0, inS = null, inC = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n' && !(inS && inS !== '`')) { out += '\n'; if (inC === 'line') inC = null; i++; continue; }
    if (inC === 'line') { i++; continue; }
    if (inC === 'block') { if (c === '*' && n === '/') { inC = null; i += 2; continue; } i++; continue; }
    if (inS) { if (c === BS) { i += 2; continue; } if (c === inS) inS = null; i++; continue; }
    if (c === '/' && n === '/') { inC = 'line'; i += 2; continue; }
    if (c === '/' && n === '*') { inC = 'block'; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; i++; continue; }
    out += c; i++;
  }
  return out;
}

const PREFIX = /^(db|sp|compute|auto|ensure|calc|mk|handle)[A-Z]/;

const defined = new Set();
const sources = [];
for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.error('missing script referenced by index.html: ' + f); process.exit(1); }
  const code = stripped(fs.readFileSync(p, 'utf8'));
  sources.push({ file: f, code });
  let d;
  const declRe = /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/g;
  while ((d = declRe.exec(code))) defined.add(d[1] || d[2]);
}

const problems = [];
for (const { file, code } of sources) {
  const callRe = /(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
  let c;
  while ((c = callRe.exec(code))) {
    const name = c[2];
    /* Skip member calls (obj.handleRedirectPromise()) -- those are library
       methods, not project-level functions, and the regex prefix guarantees the
       character before the name is not a dot. */
    if (!PREFIX.test(name) || defined.has(name)) continue;
    const line = code.slice(0, c.index).split('\n').length;
    problems.push(file + ':' + line + '  ' + name + '()');
  }
}

if (problems.length) {
  console.error('\nCalls to functions that are never defined (' + problems.length + '):\n');
  [...new Set(problems)].forEach(p => console.error('  ' + p));
  console.error('\nEach of these throws a ReferenceError the moment it runs.\n');
  process.exit(1);
}
console.log('undefined-call check OK (' + files.length + ' scripts, ' + defined.size + ' declarations)');
