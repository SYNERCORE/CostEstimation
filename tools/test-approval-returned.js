/* A CE that comes back has to reach the person who has to act on it.
   =================================================================
   The notification flow reads the plain columns beside the JSON, and a
   returned CE waits on nobody: apvMirror empties `waiting` the moment the
   state leaves 'pending'. So the columns described a CE that had come back
   and named no one to tell, and the flow's condition -- rightly -- did
   nothing with it. The estimator learnt their CE was returned by going and
   looking.

   Two things make it actionable: who submitted it, which the approval has
   held since submission, and what the approver said when sending it back.
   "Your CE came back" without a reason is a wasted message.

   Neither may enter apvMirrorKey. The key exists to change when the routing
   moves and at no other time; a key that moved with an edited comment would
   page people over a typo. */
'use strict';
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };

const apv = R('src/approval.js');
const db = R('src/db.js');
const reg = R('src/components/RegisterPage.js');

const A = new Function(
  apv.slice(apv.indexOf('function apvRoute('), apv.indexOf('/* Whether the CE on this Monitoring row')) +
  '\nreturn { apvStatus, apvMirror, apvMirrorKey };')();

const approvers = [
  { id: 'a1', user: 'rvera', role: 'Reviewed By', step: 1 },
  { id: 'a2', user: 'mcruz', role: 'Reviewed By', step: 1 },
  { id: 'a3', user: 'jubana', role: 'Approved By', step: 2 }
];
const returned = {
  state: 'returned', submittedBy: 'mfsantos', submittedByName: 'M F Santos',
  lines: { a1: { by: 'rvera' } },
  log: [
    { by: 'mfsantos', byName: 'M F Santos', action: 'submitted' },
    { by: 'rvera', byName: 'R Vera', action: 'returned', comment: 'Manpower rate is stale' }
  ]
};
const pending = { state: 'pending', submittedBy: 'mfsantos', lines: {}, log: [] };

console.log('a returned CE says who has to act, and why');

let m = A.apvMirror(approvers, returned);
ck('it waits on nobody, as before', m.waiting.length === 0);
ck('but it names the estimator who submitted it', m.by === 'mfsantos', m.by);
ck('and carries the reason it came back',
  m.note === 'R Vera: Manpower rate is stale', m.note);

/* The LAST return, not the first: a CE can go round more than once and the
   stale reason would be the one sent. */
const twice = { ...returned, log: returned.log.concat([
  { by: 'jubana', byName: 'J Ubana', action: 'returned', comment: 'Margin too low' }]) };
ck('a CE returned twice carries the latest reason',
  A.apvMirror(approvers, twice).note === 'J Ubana: Margin too low',
  A.apvMirror(approvers, twice).note);

/* A return with no comment typed is still a return. */
ck('a return with no comment still names who returned it',
  A.apvMirror(approvers, { ...returned, log: [{ by: 'rvera', byName: 'R Vera', action: 'returned' }] }).note === 'R Vera');

/* A pending CE has not come back, so there is no reason to carry. */
m = A.apvMirror(approvers, pending);
ck('a pending CE carries no return reason', m.note === '', m.note);
ck('though it still knows whose CE it is', m.by === 'mfsantos');
/* An old approval saved before submittedBy existed must not crash the mirror. */
ck('an approval with no submitter is empty, not broken',
  A.apvMirror(approvers, { state: 'pending', lines: {} }).by === '');

/* ---- the key is untouched by either ---- */
console.log('\nand neither of them moves the key:');
const k = a => A.apvMirrorKey(A.apvMirror(approvers, a));
ck('the same CE with a different reason has the same key',
  k(returned) === k({ ...returned, log: [{ by: 'rvera', byName: 'R Vera', action: 'returned', comment: 'something else' }] }),
  k(returned));
ck('and a different estimator does not make it a new event',
  k(returned) === k({ ...returned, submittedBy: 'someoneelse' }));
/* What must still move it. */
ck('but coming back at all does', k(returned) !== k(pending));

/* ---- the columns ---- */
console.log('\nwhat the flow can read:');
const cols = new Function('apvMirrorKey',
  db.slice(db.indexOf('function _apvCols('), db.indexOf('let _apvColsMissing')) +
  '\nreturn _apvCols;')(A.apvMirrorKey);
let got = cols({ apv: A.apvMirror(approvers, returned) }, 'SY3-CE-2026-0148');
ck('the estimator is a plain username, ready to look up',
  got.shicApvOwner === 'mfsantos', got.shicApvOwner);
ck('the reason is readable in the column itself',
  got.shicApvNote === 'R Vera: Manpower rate is stale', got.shicApvNote);
ck('the state still says it came back', got.shicApvState === 'returned');
got = cols({ apv: A.apvMirror(approvers, pending) }, 'SY3-CE-2026-0148');
ck('a pending CE writes an empty note rather than a stale one',
  got.shicApvNote === '', got.shicApvNote);
/* A CE never submitted has no approval at all -- no columns, as before. */
ck('and a CE never submitted writes none of them',
  cols({}, 'X').shicApvOwner === undefined && cols({}, 'X').shicApvNote === undefined);

/* SharePoint single-line-of-text caps at 255, and a long return comment is
   exactly the value likely to reach it. Over the cap the WHOLE write fails,
   taking the approval trail with it. */
ck('both are cut to what a text column holds',
  /shicApvOwner=String\(a\.by\|\|''\)\.slice\(0,255\)/.test(db) &&
  /shicApvNote=String\(a\.note\|\|''\)\.slice\(0,255\)/.test(db));

console.log('\nprovisioning and safety:');
const strip = db.slice(db.indexOf('function _stripApvCols('), db.indexOf('function _stripApvCols(') + 400);
['shicApvOwner', 'shicApvNote'].forEach(c => {
  ck(c + ' is created by "Repair lists & columns"', reg.indexOf("[2,'" + c + "']") > 0);
  /* A site that has not been repaired lacks the column, and SharePoint
     rejects the WHOLE write for one it does not know -- so a column added
     here and not to the strip list would cost the approval trail itself. */
  ck(c + ' is stripped on a site that lacks it', strip.indexOf("'" + c + "'") > 0);
});
/* Still the flow's to write, not ours. */
ck('nothing in the app writes shicApvNotified',
  !/shicApvNotified\s*[:=]/.test(db + R('src/App.js') + reg));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nreturned-CE columns OK');
process.exit(bad ? 1 : 0);
