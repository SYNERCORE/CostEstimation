#!/usr/bin/env node
/*
 * The Scope Library must survive its own export.
 *
 * A service records which scope STEP each resource belongs to -- that is the
 * whole reason applying a service files its rows against the right task instead
 * of dumping them in "Unassigned". The Excel round trip destroyed exactly that:
 *
 *   - export wrote every resource on the FIRST row of the service, so the step
 *     was gone before the file was even saved
 *   - a resource stored as {name, qty, step} went through join(), which is why
 *     the exported file read "[object Object] | [object Object]"
 *   - import overwrote the whole list from whichever row carried one, as plain
 *     strings, so quantities went too
 *
 * Run: node tools/test-scopelib-roundtrip.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- the real export cell builder ---- */
const SUBSTEP_RE = new Function('return ' + app.match(/const SUBSTEP_RE = [^\n]*/)[0]
  .replace('const SUBSTEP_RE = ', '').replace(/;$/, ''))();
const expSrc = app.match(/const resName = it =>[\s\S]*?const rows = sowLib\.flatMap\(svc => \{[\s\S]*?\n        \}\);/)[0];
const EXP = new Function('sowLib', 'SUBSTEP_RE', expSrc + '; return rows;');

/* ---- the real import grouper ---- */
const impSrc = app.match(/const map = \{\};\n          const stepOf = \{\};[\s\S]*?\n          \}\);/)[0];
const IMP = new Function('rows', impSrc + '; return map;');

const svc = {
  id: 7,
  cat: 'Turbine Repair',
  title: 'Rotor Removal and Reinstallation',
  scope: [
    '1. Pre-mobilisation and site preparation',
    'a. Confirm isolation, permits and lifting plan',
    '2. Rotor removal',
    '3. Reinstallation and alignment'
  ],
  mp: [
    {name: 'SUPERVISOR', qty: 1, step: 0},
    {name: 'RIGGER', qty: 4, step: 2},
    {name: 'MILLWRIGHT', qty: 2, step: 3}
  ],
  tools: [
    {name: 'OVERHEAD CRANE 40T', qty: 1, step: 2},
    {name: 'CHAIN BLOCK 5T', qty: 2, step: 2},
    {name: 'LASER ALIGNMENT KIT', qty: 1, step: 3}
  ],
  mats: [{name: 'ANTI-SEIZE COMPOUND', qty: 1, step: 3}],
  ppe: [{name: 'SAFETY HARNESS', qty: 4, step: 0}],
  misc: [{name: 'CRANE MOBILISATION', qty: 1, step: 0}]
};

const rows = EXP([svc], SUBSTEP_RE);

console.log('the export keeps the shape of the service:');
ck('one row per scope step', rows.length === 4, String(rows.length));
ck('no "[object Object]" anywhere',
  !JSON.stringify(rows).includes('[object Object]'),
  'a resource stored as an object used to be written straight through join()');
ck('a lettered line is marked as a sub-step', rows[1].ScopeType === 'sub', rows[1].ScopeType);
ck('and a numbered one is not', rows[0].ScopeType === 'main' && rows[2].ScopeType === 'main');

console.log('\nand writes each resource on the step that needs it:');
ck('the supervisor is on step 1', rows[0].MP === 'SUPERVISOR');
ck('the riggers are on step 3, not step 1', rows[2].MP === 'RIGGER x4', rows[2].MP);
ck('quantities survive', rows[2].Tools === 'OVERHEAD CRANE 40T | CHAIN BLOCK 5T x2', rows[2].Tools);
ck('a quantity of 1 is not written out', rows[3].Tools === 'LASER ALIGNMENT KIT', rows[3].Tools);
ck('nothing lands on a step it does not belong to', rows[1].Tools === '' && rows[1].MP === '');

console.log('\nand the import puts it back exactly:');
const back = IMP(rows)[7];
ck('the service is recognised', !!back && back.title === svc.title);
ck('every scope step returns', back.scope.length === 4, JSON.stringify(back.scope.length));
ck('manpower returns with its steps',
  JSON.stringify(back.mp) === JSON.stringify(svc.mp), JSON.stringify(back.mp));
ck('tools too, quantities included',
  JSON.stringify(back.tools) === JSON.stringify(svc.tools), JSON.stringify(back.tools));
ck('materials too', JSON.stringify(back.mats) === JSON.stringify(svc.mats));
ck('PPE too', JSON.stringify(back.ppe) === JSON.stringify(svc.ppe));
/* Miscellaneous had no column at all, so every accommodation, permit and admin
   line a service carried was dropped by its own export -- and silently, since
   nothing said the column was missing. */
ck('and Miscellaneous, which had no column at all',
  JSON.stringify(back.misc) === JSON.stringify(svc.misc), JSON.stringify(back.misc));
ck('the export writes a Misc column', rows[0].Misc === 'CRANE MOBILISATION', rows[0].Misc);

console.log('\nwhat the old format did is still readable:');
const legacy = [
  {ID: 9, Category: 'Valve Repair', Title: 'Valve Overhaul', ScopeType: 'main',
   ScopeText: 'Strip, lap and test', MP: 'FITTER | HELPER', Tools: 'LAPPING MACHINE', Materials: '', PPE: ''}
];
const old = IMP(legacy)[9];
ck('a flat one-row service still imports', old && old.scope.length === 1 && old.mp.length === 2);
ck('and its resources land on the only step there is',
  old.mp.every(x => x.step === 0) && old.mp[0].qty === 1,
  JSON.stringify(old.mp));
ck('a tool genuinely named with a trailing letter-number keeps its name',
  IMP([{ID: 1, Title: 'T', ScopeText: 's', Tools: 'BORING BAR MX2'}])[1].tools[0].name === 'BORING BAR MX2',
  'only a trailing " xN" is read as a quantity');

/* A step could only ever be appended. Remembering one you left out of the
   middle of a method meant adding it at the end and clicking Move up until it
   arrived -- once per position, on both screens. */
const app2 = fs.readFileSync('src/App.js', 'utf8');
console.log('\na step can be put where it belongs:');
ck('the Scope of Work tab can insert a main item',
  app2.indexOf('title: "Insert a main item below this one"') > 0);
ck('and a sub-item', app2.indexOf('title: "Insert a sub-item below this one"') > 0);
ck('the Scope Library can insert a main step',
  app2.indexOf('title: "Insert a main step below this one"') > 0);
ck('and a sub-step', app2.indexOf('title: "Insert a sub-step below this one"') > 0);
ck('the library can reorder at all, which it could not before',
  (app2.match(/title: "Move up"/g) || []).length >= 2,
  'a method written in the wrong order had to be retyped');
ck('inserting keeps resources filed, because a resource names its step by id',
  app2.indexOf('step: (rows[r.step] || rows[0] || {}).id') > 0,
  'by position, inserting a step above would move every resource under it');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nscope library round trip OK');
process.exit(bad ? 1 : 0);
