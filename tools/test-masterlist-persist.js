#!/usr/bin/env node
/*
 * Every masterlist edit must be persisted, not just put in React state.
 *
 * importMLExcel called setMasterlist and nothing else, so an uploaded list
 * lived in memory until the tab was closed. Every OTHER action on that screen
 * -- add, delete, clear, reset, bulk adjust, cell edit -- went through saveML
 * and persisted. So "Clear List, then Upload Excel" wrote an EMPTY list to
 * SharePoint and kept the upload nowhere, and the list came back empty. The
 * sync indicator was green throughout, because the clear really had saved.
 *
 * The rule: anything that changes the masterlist goes through saveML (which
 * mirrors to localStorage, writes to SharePoint, and reports a refusal) or
 * dbSaveML directly. A bare setMasterlist in the editor is the bug.
 *
 * Run: node tools/test-masterlist-persist.js
 */
'use strict';

const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* The editor component: from MlEditor to the masterlist tab render. */
const ed = (app.match(/const MlEditor = \(\) => \{[\s\S]*?\n  \};/) || [''])[0];
if (!ed) { console.error('MlEditor not found'); process.exit(1); }

console.log('every mutating action persists:');
ck('the Excel upload saves', /await saveML\(\{\.\.\.masterlist, \[tab\]: \[\.\.\.merged, \.\.\.toAdd\]\}\)/.test(ed),
  'setMasterlist alone leaves the upload in memory only');
ck('Clear List saves', /saveML\(\{\s*\.\.\.masterlist,\s*\[mlTab\]: \[\]/.test(ed));
ck('Reset Defaults saves', /saveML\(\{\s*\.\.\.masterlist,\s*\[mlTab\]: DEFAULT_ML\[mlTab\]/.test(ed));
ck('Add / delete / bulk adjust save', (ed.match(/saveML\(/g) || []).length >= 5,
  'found ' + (ed.match(/saveML\(/g) || []).length);
ck('the cell edit persists on its debounce', /await dbSaveML\(next\)/.test(ed));

console.log('\nand nothing changes it without persisting:');
/* setMasterlist inside the editor is only legitimate as part of the debounced
   cell edit, which calls dbSaveML itself. Any other bare call is the bug this
   file exists for. */
const bare = (ed.match(/setMasterlist\(/g) || []).length;
ck('no stray setMasterlist left in the editor', bare <= 1,
  bare + ' call(s); only the debounced cell edit may set state directly, because it calls dbSaveML itself');

console.log('\nthe toast is not fired from inside a state updater:');
ck('the import reports after saving, not during', !/showToast\([^)]*added[\s\S]{0,80}return \{/.test(ed),
  'React may invoke an updater twice, reporting the import twice');

/* mlShape decides whether a stored masterlist is usable at all. It named a
   section that does not exist, so materials was never backfilled and a list
   holding only materials or vehicles was thrown away for the built-in
   defaults -- hiding the real one. */
console.log('\nmlShape names the sections that actually exist:');
/* The section list itself, not the whole function -- the word 'mats' still
   appears in the comment explaining why it is gone. */
const secs = (app.match(/const secs = \[[^\]]*\]/) || [''])[0];
for (const k of ['manpower', 'tools', 'materials', 'ppe', 'vehicles'])
  ck(k, new RegExp("'" + k + "'").test(secs), secs);
ck("and no longer names 'mats'", !/'mats'/.test(secs),
  'DEFAULT_ML has no such key, so the backfill silently produced an empty one');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nmasterlist persistence OK');
process.exit(fails ? 1 : 0);
