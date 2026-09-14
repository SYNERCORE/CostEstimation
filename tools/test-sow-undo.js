#!/usr/bin/env node
/*
 * A scope step is typed by hand, and the X that deletes it sits in the same
 * little column as Move up, Move down and the two insert buttons. Deleting one
 * by accident is easy; it used to be unrecoverable. Only a MAIN step carrying
 * sub-steps or costed resources asked for confirmation and offered an undo --
 * an empty main step, any sub-step, and Clear All went on a single click with
 * nothing to put them back.
 *
 * Every scope deletion now takes a snapshot and offers the undo bar, and the
 * snapshot covers the resource tabs as well, because deleting a task can take
 * its rows with it.
 *
 * Run: node tools/test-sow-undo.js src/App.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'src/App.js', 'utf8');
const grab = (re, what) => { const m = src.match(re); if (!m) { console.error('not found in source: ' + what); process.exit(1); } return m[0]; };

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

const del = grab(/const deleteSowTask = item => \{[\s\S]*?\n  \};/, 'deleteSowTask');
const clr = grab(/const clearAllSow = \(\) => \{[\s\S]*?\n  \};/, 'clearAllSow');
const snap = grab(/const sowSnapshot = \(\) => \(\{[\s\S]*?\n  \}\);/, 'sowSnapshot');
const rest = grab(/const sowRestore = snap => \{[\s\S]*?\n  \};/, 'sowRestore');
const offer = grab(/const sowOfferUndo = \(msg, snap\) => \{[\s\S]*?\n  \};/, 'sowOfferUndo');

console.log('Every scope deletion is undoable, not just the ones with something attached:');
ck('deleting a step offers undo unconditionally',
  /sowOfferUndo\(/.test(del) && !/if \((?:n > 0 \|\| subs > 0)\) \{\s*\n?\s*const tid/.test(del),
  'an empty main step and a sub-step are the two that were deleted by accident');
ck('the snapshot is taken before anything is removed',
  del.indexOf('const snap = sowSnapshot();') < del.indexOf('setSowItems(p => p.filter'),
  'a snapshot taken after the delete restores the delete');
ck('Clear All offers undo too', /sowOfferUndo\(/.test(clr));
ck('and Clear All still asks first', /!confirm\('Clear all scope items\?/.test(clr));
ck('the Clear All button goes through it', /onClick: clearAllSow/.test(src),
  'a second copy of the clear logic in the button would drift from this one');

console.log('\nThe snapshot covers everything a scope deletion can take with it:');
for (const k of ['sow', 'mp', 'tools', 'mats', 'ppe', 'misc'])
  ck(k, new RegExp('\\b' + k + ':').test(snap));
ck('misc is deep-copied, not aliased', /JSON\.parse\(JSON\.stringify\(misc\)\)/.test(snap),
  'a shallow copy of misc shares its arrays with the live state, so undo restores nothing');
console.log('\nand the restore puts all six back:');
for (const s of ['setSowItems', 'setMp', 'setTools', 'setMats', 'setPpe', 'setMisc'])
  ck(s, rest.includes(s));

console.log('\nThe undo bar behaves when deletions come one after another:');
ck('a pending countdown is cleared before a new one starts',
  /if \(sowUndoTimer\.current\) clearTimeout\(sowUndoTimer\.current\);\s*\n\s*sowUndoTimer\.current = setTimeout/.test(offer),
  "the first delete's timer would otherwise close the second delete's bar early");
ck('undoing also cancels the countdown', /clearTimeout\(sowUndoTimer\.current\)[\s\S]*sowRestore\(snap\)/.test(offer));
ck('the window is one named figure, used by the prompts too',
  /const SOW_UNDO_MS = \d+;/.test(src) &&
  /You can undo this for ' \+ \(SOW_UNDO_MS \/ 1000\) \+ ' seconds\./.test(del) &&
  /You can undo this for ' \+ \(SOW_UNDO_MS \/ 1000\) \+ ' seconds\./.test(clr),
  'a prompt promising 10 seconds over a bar that lasts 20 is a lie either way round');

console.log('\nThe bar is on screen and says what went:');
ck('rendered with an Undo button', /undoToast\.msg[\s\S]{0,300}onClick: undoToast\.onUndo/.test(src));
ck('a sub-item is named as a sub-item', /item\.type === 'sub' \? 'Sub-item' : 'Scope task'/.test(del),
  '"Scope task deleted" over a deleted sub-step reads like the wrong thing went');
ck('Clear All says how many went', /' scope item' \+ \(count === 1 \? '' : 's'\) \+ ' cleared\.'/.test(clr));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall scope undo assertions passed');
process.exit(fails ? 1 : 0);
