#!/usr/bin/env node
/*
 * A component declared INSIDE render is a different function on every render.
 * React compares element types by identity, so it does not update that subtree
 * -- it unmounts the old one and mounts a new one. Every DOM node inside is
 * thrown away and rebuilt, which means the input the user is typing into loses
 * focus after each keystroke. That is the "one click per character" bug the
 * Mobilization and Demobilization expense tables had: ExpenseTable was declared
 * in the middle of the Manpower tab's render and passed to createElement.
 *
 * The fix is to CALL these helpers instead of rendering them as components, so
 * their elements belong to the parent's own tree and reconcile normally. A
 * helper that needs its own hooks cannot be called this way -- it has to move
 * out to module scope instead, like NumBox did.
 *
 * Run: node tools/test-inline-components.js src/App.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'src/App.js', 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* Every capitalised helper declared inside a function body -- i.e. indented,
   so not a module-scope component. Anything here that is ALSO passed to
   createElement is remounted on every keystroke. Two letters or fewer are
   local abbreviations (S, N), not components. */
const declared = new Set();
const re = /^[ \t]+const ([A-Z][A-Za-z0-9]{2,}) = \(/gm;
let m;
while ((m = re.exec(src))) declared.add(m[1]);

const rendered = n => new RegExp('createElement\\(' + n + '[,)]').test(src);

console.log('No render-declared helper is rendered as a component type:');
const offenders = [...declared].filter(rendered);
ck('none found', offenders.length === 0,
  offenders.join(', ') + ' -- call it (' + (offenders[0] || 'X') +
  '({...})) instead of createElement(' + (offenders[0] || 'X') + ', {...})');

console.log('\nand the ones this bug was found in stay called, not rendered:');
for (const n of ['ExpenseTable', 'ScopeBuilder', 'SpWizModal'])
  ck(n, declared.has(n) && !rendered(n), declared.has(n) ? 'rendered as a component' : 'declaration not found');

/*
 * The expense rows also stored the raw string from the input, so a rate typed
 * into a box showing 0 came out as "02222". NumBox parses and clamps on the
 * way in and only ever commits a number.
 */
console.log('\nThe expense line figures are typed through NumBox:');
const tbl = src.match(/const ExpenseTable = \(\{[\s\S]*?\n    \}\);/);
ck('ExpenseTable found', !!tbl);
if (tbl) {
  for (const f of ['qty', 'days', 'rate'])
    ck(f + ' commits a parsed number',
      new RegExp('value: r\\.' + f + ',\\s*\\n\\s*onCommit: v =>').test(tbl[0]),
      'a raw e.target.value leaves a leading zero on the row');
  ck('and none of them is a bare number input',
    !/type: "number",\s*\n\s*min: \d+,\s*\n\s*value: r\.(?:qty|days|rate)/.test(tbl[0]));
}

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall inline-component assertions passed');
process.exit(fails ? 1 : 0);
