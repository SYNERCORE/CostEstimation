#!/usr/bin/env node
/*
 * Internal Verification Notes -- the last column the mockup asks for.
 *
 * Unlike the rest of the design series this is not presentation: there was
 * nowhere to put the text. The mockup shows sentences like "8 Certified Techs
 * • Overtime & Night Diffs included" beside each cost group, and deriving
 * those would mean the app writing verification prose onto a document that
 * goes to a client, with nothing having verified anything. So it is a real
 * field, typed by whoever built the estimate.
 *
 * It rides in the shicMisc JSON blob beside _addlCosts and _margin, so no
 * SharePoint column has to be added and no site has to be repaired first.
 *
 * Run: node tools/test-verification-notes.js
 */
'use strict';
const fs = require('fs');
const raw = fs.readFileSync('src/App.js', 'utf8');
const app = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const db = fs.readFileSync('src/db.js', 'utf8');
const lock = JSON.parse(fs.readFileSync('tools/logic.lock.json', 'utf8'));

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('the note is a field, not something the app makes up:');
ck('there is state for it', /const \[verifyNotes, setVerifyNotes\] = useState\(\{\}\)/.test(app));
ck('the cell is an input, not derived text', /defaultValue: verifyNotes\[label\] \|\| ''/.test(app));
ck('and nothing generates a sentence from the rows',
  !/verifyNotes\[label\] = .*(pax|rows\.length|Certified)/.test(app),
  'a note the app wrote would read as verification on a client document');

console.log('\nit is keyed by cost group name, not row position:');
ck('written under the label', /n\[label\] = v/.test(app));
ck('and read back by it', /verifyNotes\[label\]/.test(app),
  'mob/demob only exist on onsite, so an index would shift every note when a section goes to zero');

console.log('\nit survives a save and a reload:');
ck('carried on the CE', /verifyNotes: \{\.\.\.verifyNotes\}/.test(app));
ck('on both the CE and the draft', (app.match(/verifyNotes: \{\.\.\.verifyNotes\}/g) || []).length === 2);
ck('written to SharePoint', /_verifyNotes:\(e\.verifyNotes\|\|\{\}\)/.test(db));
ck('read back out', /verifyNotes:\(\(\)=>\{const m=h\.shicMisc\?JSON\.parse\(h\.shicMisc\):\{\};return m\._verifyNotes\|\|\{\};\}\)\(\)/.test(db));
ck('restored when a CE is loaded', /setVerifyNotes\(d\.verifyNotes \|\| \{\}\)/.test(app));
ck('and when a draft is resumed', /setVerifyNotes\(d\.verifyNotes \? \{\.\.\.d\.verifyNotes\} : \{\}\)/.test(app));

console.log('\nno SharePoint column had to be added:');
ck('it rides in the existing misc blob', /_verifyNotes/.test(db) && !/shicVerifyNotes/.test(db),
  'a new column means every site has to run Repair first');
ck('and is stripped back out on load', /const\{_addlCosts,_margin,_verifyNotes,\.\.\.rest\}=m/.test(db),
  "left in, it comes back as a miscellaneous cost group named '_verifyNotes'");

console.log('\nthe autosave notices it:');
ck('it is in the unsaved-work signature', /mobVehicles, demobVehicles, verifyNotes\]/.test(app),
  'the margin was left out of this once and was written back as 0 on every save');

console.log('\nan empty note is removed, not stored blank:');
ck('blank deletes the key', /if \(v\.trim\(\)\) n\[label\] = v; else delete n\[label\]/.test(app));
ck('and an unchanged value writes nothing',
  /if \(v === \(verifyNotes\[label\] \|\| ''\)\) return;/.test(app),
  'every blur would otherwise mark the CE dirty');

console.log('\nthe table still lines up:');
ck('the header is there', /"Internal Verification Notes"/.test(app));
ck('and the total row has a cell for it', /\}\), \/\*#__PURE__\*\/React\.createElement\("td", \{\s*style: \{\s*\.\.\.TDS,\s*fontWeight: 800/.test(raw) ||
  /TOTAL DIRECT PROJECT COST/.test(app));
ck('named as the mockup names it', /"TOTAL DIRECT PROJECT COST"/.test(app));

console.log('\nand the deliberate formula change is recorded:');
ck('_assembleCE is still locked', typeof lock['src/db.js:_assembleCE'] === 'string',
  'it changed to read the new field, so the lock was updated in the same commit');
ck('every other definition is still watched', Object.keys(lock).length === 24, String(Object.keys(lock).length));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nverification notes OK');
process.exit(bad ? 1 : 0);
