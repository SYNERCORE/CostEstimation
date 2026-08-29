#!/usr/bin/env node
/*
 * Status must be changeable straight from the Monitoring table.
 *
 * It used to sit behind the row's Edit button, so recording that a CE had been
 * submitted took three clicks on the one field the whole tab exists to track.
 * The rest of the row stays gated -- it is reference data that should not move
 * by a stray click -- but the status dropdown is live.
 *
 * Two things have to hold for that to be safe:
 *   - a DRAFT row is excluded. It has no monitoring record and no numeric id,
 *     so a write would post shicCEId NaN to SharePoint.
 *   - the select is CONTROLLED. With defaultValue it would show a stale status
 *     after monData reloads or another user's change arrives.
 *
 * And every status change is stamped. The stamp used to fire only for a
 * hand-picked list that named two statuses this app has never offered and
 * missed the two that most need a trail.
 *
 * Run: node tools/test-status-cell.js
 */
const fs=require('fs');
const src=fs.readFileSync('src/App.js','utf8');

const cell = src.match(/\}, \/\*#__PURE__\*\/React\.createElement\(React\.Fragment, null, \/\*#__PURE__\*\/React\.createElement\("select", \{[\s\S]*?statusChangedAt', ev\.target\.value/);
let bad=0;
const ck=(n,c,x)=>{ if(c) console.log('  PASS  '+n); else { console.log('  FAIL  '+n+(x?'  -> '+x:'')); bad++; } };

console.log('the status cell:');
ck('is not gated behind Edit mode', !!cell && !/^\}, editingRow === e\.id \?/.test(cell[0]));
ck('is a controlled value, so it reflects changes made elsewhere', /value: m\.status \|\| ''/.test(cell[0]),
  'defaultValue would go stale when monData reloads');
ck('is disabled on a draft row', /disabled: !!e\._draft/.test(cell[0]),
  'a draft has no numeric id, so dbSaveMonEntry would post shicCEId NaN');
ck('and guards the handler too, not just the attribute', /if \(!e\._draft\) updateMon\(e\.id, 'status'/.test(cell[0]));
ck('the correction date stays behind Edit', /editingRow === e\.id \? \/\*#__PURE__\*\/React\.createElement\("input", \{/.test(cell[0]));

const upd = src.match(/const updateMon = \(ceId, field, val\) => setMonData\(prev => \{[\s\S]*?return n;/)[0];
console.log('\nthe stamp:');
ck('fires on every status change, not a hand-picked list', /if \(field === 'status' && val\) \{/.test(upd),
  'Ongoing and For site insp. recorded nothing');
ck('records when', /extra\.statusChangedAt = new Date\(\)\.toISOString\(\)/.test(upd));
ck('records who', /extra\.statusChangedBy = currentUser/.test(upd));
ck('but not for clearing the status back to blank', !/if \(field === 'status'\) \{/.test(upd));
ck('and persists through the same one-entry save', /dbSaveMonEntry\(ceId, ceNum, n\[ceId\]\)/.test(upd));

console.log(bad?'\n'+bad+' FAILURE(S)':'\nstatus cell OK');
process.exit(bad?1:0);
