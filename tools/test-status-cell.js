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

/* The inline dropdown put a form control on every one of ~900 rows and still
   had nowhere to show the history. It is an action button now, opening a panel
   that both sets the status and shows the trail. */
console.log('status is its own action, not a control in every row:');
const ck2 = ck;
ck2('the Status action opens a panel', /setStatusPanel\(statusPanel === e\.id \? null : e\.id\)/.test(src));
ck2('it is held back on a draft row', /if \(!e\._draft\) setStatusPanel/.test(src),
  'a draft has no numeric id, so dbSaveMonEntry would post shicCEId NaN');
ck2('the panel offers every status', /allStatuses\.map\(st =>/.test(src));
ck2('the current one is not offered again', /disabled: st === _m\.status/.test(src));
ck2('and the row shows the status as a chip, not a dropdown',
  !/key: e\.id \+ 'status'/.test(src),
  'a select per row is ~900 form controls and still shows no history');
ck2('the panel shows the trail', /HISTORY/.test(src) && /_shown\.map\(\(h, i\)/.test(src));
ck2('with what it moved from, when, and who', /"from " \+ h\.from/.test(src) && /h\.by \|\| /.test(src));
ck2('a CE tracked before the log existed still shows its last change',
  /_legacy: true/.test(src),
  'claiming nothing ever happened would be worse than showing one entry');

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
