#!/usr/bin/env node
/*
 * The logic guard has to measure the right piece of source.
 *
 * check-logic-unchanged fingerprints a constant by matching from `const NAME =`
 * to its closing bracket. That was written as one alternation --
 * `...\n];` OR `...\n};` -- and JS takes the LEFT branch whenever it can match
 * at all. SHIFTS is an object, so it should close at `\n};`, but the left
 * branch found the first `\n];` anywhere BELOW it, which is inside DEFAULT_ML.
 *
 * So SHIFTS's fingerprint silently covered CE_CFG and a chunk of the default
 * masterlist. Adding one field to CE_CFG reported SHIFTS as CHANGED -- and the
 * honest response to that, updating the lock, would have re-baselined the shift
 * multipliers at the same time. A guard that cries wolf is a guard that gets
 * waved through.
 *
 * Run: node tools/test-logic-guard.js
 */
'use strict';
const fs = require('fs');
const guard = fs.readFileSync('tools/check-logic-unchanged.js', 'utf8');
const cfg = fs.readFileSync('src/config.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* The guard's own grab(), lifted out and run. */
const grab = new Function('src', 'name', 'kind',
  guard.match(/function grab\(src, name, kind\) \{[\s\S]*?\n\}/)[0] + '\nreturn grab(src, name, kind);');

console.log('a constant is measured to its own closing bracket:');
const shifts = grab(cfg, 'SHIFTS', 'const');
ck('SHIFTS is found', !!shifts);
ck('it ends at its own brace', /\n\};?$/.test(shifts), JSON.stringify(shifts.slice(-20)));
ck('it does NOT reach CE_CFG', !/CE_CFG/.test(shifts),
  'CE_CFG inside the fingerprint means editing a CE type reports SHIFTS as changed');
ck('nor DEFAULT_ML', !/DEFAULT_ML/.test(shifts));
ck('and it holds all six shifts',
  ['regular_day', 'regular_night', 'sunday_day', 'sunday_night', 'holiday_day', 'holiday_night']
    .every(k => shifts.indexOf(k) >= 0),
  'measuring too little is the other way to get a guard that never fires');

console.log('\nand an array constant still ends at its bracket:');
for (const n of ['CE_CLOSED_STATUSES', 'DEFAULT_STATUS_OPTIONS']) {
  const b = grab(cfg, n, 'const');
  ck(n + ' is found', !!b);
  /* No newline before it: these two are written on one line. */
  ck(n + ' ends at ]', /\];?$/.test(b), JSON.stringify(String(b).slice(-20)));
  ck(n + ' covers only itself',
    (b.match(/\bconst [A-Z_]+ =/g) || []).length === 1,
    'a second const inside the extent means it swallowed the one after it');
}

console.log('\nthe fix is counting brackets, not matching a closing line:');
ck('the extent is found by balancing',
  /if \(c === '\(' \|\| c === '\[' \|\| c === '\{'\) d\+\+;/.test(guard),
  'a pattern for the closing bracket cannot end a one-line constant at all');
ck('and no closing-line alternation is left',
  !/\\\\n\\\\\];\?.*\|.*\\\\n\\\\\};\?/.test(guard));

console.log('\nthe lock still covers everything it did:');
const lock = JSON.parse(fs.readFileSync('tools/logic.lock.json', 'utf8'));
ck('24 definitions are watched', Object.keys(lock).length === 24, String(Object.keys(lock).length));
ck('SHIFTS among them', typeof lock['src/config.js:SHIFTS'] === 'string');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nlogic guard OK');
process.exit(bad ? 1 : 0);
