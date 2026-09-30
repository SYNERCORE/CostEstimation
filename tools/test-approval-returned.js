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

   A fully approved CE has the same shape of problem: it waits on nobody
   either, and the estimator who has been waiting on it is exactly who wants
   to hear. The note carries who put the last signature on it, so the message
   says more than that something happened.

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

/* ---- approved, which is the same problem wearing a happier face ---- */
console.log('\nan approved CE reaches the estimator too:');
const approved = {
  state: 'approved', submittedBy: 'mfsantos', submittedByName: 'M F Santos',
  lines: { a1: { by: 'rvera' }, a2: { by: 'mcruz' }, a3: { by: 'jubana' } },
  log: [
    { by: 'mfsantos', byName: 'M F Santos', action: 'submitted' },
    { by: 'rvera', byName: 'R Vera', action: 'approved', role: 'Reviewed By' },
    { by: 'mcruz', byName: 'M Cruz', action: 'approved', role: 'Reviewed By' },
    { by: 'jubana', byName: 'J Ubana', action: 'approved', role: 'Approved By' }
  ]
};
m = A.apvMirror(approvers, approved);
ck('it waits on nobody', m.waiting.length === 0);
ck('and still names the estimator who has been waiting for it',
  m.by === 'mfsantos', m.by);
/* The LAST signature, not the first: the first reviewer signed days ago and
   naming them would read as though the CE were still going round. */
ck('the note names who put the last signature on it',
  m.note === 'J Ubana', m.note);
/* A per-line approval carries no comment, so the note must not trail a
   dangling separator. */
ck('with no dangling separator behind it', m.note.indexOf(':') < 0, m.note);
got = cols({ apv: m }, 'SY3-CE-2026-0148');
ck('the flow can read the state as approved', got.shicApvState === 'approved');
ck('the owner column is the estimator', got.shicApvOwner === 'mfsantos');
ck('and the note column names the signer', got.shicApvNote === 'J Ubana');

/* A return is not an approval and an approval is not a return: each must read
   its OWN last log entry. A CE returned once, fixed, and then approved holds
   both kinds, and reading the wrong one would tell the estimator their
   approved CE had come back. */
const bothWays = { ...approved, log: [
  { by: 'rvera', byName: 'R Vera', action: 'returned', comment: 'Manpower rate is stale' },
  { by: 'jubana', byName: 'J Ubana', action: 'approved', role: 'Approved By' }
] };
ck('a CE that was returned and then approved reports the approval',
  A.apvMirror(approvers, bothWays).note === 'J Ubana',
  A.apvMirror(approvers, bothWays).note);
const backAgain = { ...returned, log: [
  { by: 'jubana', byName: 'J Ubana', action: 'approved', role: 'Approved By' },
  { by: 'rvera', byName: 'R Vera', action: 'returned', comment: 'Margin too low' }
] };
ck('and one approved in part and then returned reports the return',
  A.apvMirror(approvers, backAgain).note === 'R Vera: Margin too low',
  A.apvMirror(approvers, backAgain).note);

/* Nothing else grows a note. A withdrawn CE is the estimator's own doing and
   needs no telling. */
['withdrawn', 'none', 'pending'].forEach(st => {
  ck('a ' + st + ' CE carries no note',
    A.apvMirror(approvers, { ...approved, state: st }).note === '',
    A.apvMirror(approvers, { ...approved, state: st }).note);
});

/* An approval is an event worth exactly one message. The key has to move when
   the CE becomes approved -- or the flow, comparing with what it last
   notified, would stay silent -- and not move again afterwards. */
ck('becoming approved moves the key', k(approved) !== k(pending));
ck('but who signed it does not move the key again',
  k(approved) === k({ ...approved, log: approved.log.concat([
    { by: 'zzz', byName: 'Z Z', action: 'approved' }]) }));

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
