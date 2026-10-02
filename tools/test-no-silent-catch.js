/* A failure that is not shown is still written down.
   =================================================
   An empty catch is how the storage-full, monitoring-save and cache faults hid
   for weeks. Best-effort code may stay best-effort, but it must leave a line in
   the console. Browser-storage and event plumbing (localStorage, dispatchEvent
   and the like) are the exception: they fail routinely in private windows.

   Run: node tools/test-no-silent-catch.js */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(root).filter(f => f.endsWith('.js')).map(f => path.join(root, f))
  .concat(fs.readdirSync(path.join(root, 'components')).map(f => path.join(root, 'components', f)));
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const SKIP = /\.key\(|logSwallowed|localStorage|sessionStorage|dispatchEvent|progressCb|removeItem|setItem|\.focus\(|\.click\(|scrollIntoView|navigator\.|clipboard/;
const re = /(\.catch\(\s*(?:\(\s*\)\s*=>|function\s*\(\s*\))\s*\{\s*\}\s*\))|(catch\s*(?:\(\s*[A-Za-z_$][\w$]*\s*\))?\s*\{\s*\})/g;
const loud = [];
files.forEach(f => {
  fs.readFileSync(f, 'utf8').split('\n').forEach((L, i) => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(L))) {
      const before = L.slice(Math.max(0, m.index - 170), m.index);
      const ti = before.lastIndexOf('try'); const body = ti >= 0 ? before.slice(ti) : before;
      if (!SKIP.test(body)) loud.push(path.relative(root, f) + ':' + (i + 1));
    }
  });
});
ck('no empty catch hides anything but browser storage / events', loud.length === 0, loud.slice(0, 8).join(', ') + (loud.length > 8 ? ' ...' : ''));

const h = fs.readFileSync(path.join(root, 'helpers.js'), 'utf8');
const a = h.indexOf('const _swallowSeen = {};'), b = h.indexOf('\n}\n', a) + 3;
const warns = [];
const log = new Function('console', h.slice(a, b) + 'return logSwallowed;')({ warn: m => warns.push(m) });
log('t:x', new Error('boom')); log('t:x', new Error('boom')); log('t:x', new Error('boom'));
ck('it writes a console line naming where it happened', warns.length === 2 && /^\[swallowed\] t:x: boom/.test(warns[0]), warns[0]);
ck('and stops after two of the same, so a poll cannot flood the console', warns.length === 2);
log('t:x', new Error('different'));
ck('a different message is still reported', warns.length === 3);
ck('a string or undefined error does not throw', (() => { try { log('t:y', 'oops'); log('t:z'); return true; } catch (e) { return false; } })());
process.exit(bad ? 1 : 0);
