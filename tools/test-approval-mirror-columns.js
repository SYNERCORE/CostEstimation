/* Approvers are notified by a Power Automate flow off the Monitoring list,
   not by this app. A static page served from SharePoint cannot hold an API
   token -- anything it held would be readable by anyone who opened the
   console -- so the app's whole part is to state, in plain columns, where the
   approval stands. The flow does the sending.

   Everything the flow needs was already computed by apvMirror and written on
   every routing change. It was just inside the shicMonData JSON blob, where a
   flow would have to parse it on every save and then work out unaided whether
   anything had actually changed.

   The load-bearing one is shicApvKey: it changes when the routing moves and
   not when an estimator fixes a typo. That is what stops four approvers being
   paged again every time a CE is saved. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond, got) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + what + (got !== undefined ? '  [' + got + ']' : ''));
  if (!cond) bad++;
};

const apv = R('src/approval.js');
const db = R('src/db.js');
const reg = R('src/components/RegisterPage.js');

console.log('The approval mirror, as columns');

/* Run the shipped routing and the shipped key. */
const A = new Function(
  apv.slice(apv.indexOf('function apvRoute('), apv.indexOf('/* Whether the CE on this Monitoring row')) +
  '\nreturn { apvStatus, apvMirror, apvMirrorKey };')();

const approvers = [
  { id: 'a1', user: 'rvera', role: 'Reviewed By', step: 1 },
  { id: 'a2', user: 'mcruz', role: 'Reviewed By', step: 1 },
  { id: 'a3', user: 'jubana', role: 'Approved By', step: 2 }
];
const key = a => A.apvMirrorKey(A.apvMirror(approvers, a));

const submitted = { state: 'pending', lines: {} };
const oneSigned = { state: 'pending', lines: { a1: { by: 'rvera' } } };
const stepOne = { state: 'pending', lines: { a1: { by: 'rvera' }, a2: { by: 'mcruz' } } };
const done = { state: 'approved', lines: { a1: { by: 'rvera' }, a2: { by: 'mcruz' }, a3: { by: 'jubana' } } };

/* ---- the key says when there is something new to say ---- */
ck('a submitted CE waits on step one, both of them',
  key(submitted) === 'pending|0/3|mcruz,rvera', key(submitted));
/* The whole point. Saving a CE again without touching the routing rewrites
   the row; if the key changed with it, every save would be a notification. */
ck('saving again without signing anything does not change the key',
  key(submitted) === key(JSON.parse(JSON.stringify(submitted))));
ck('one of two signing does change it', key(oneSigned) !== key(submitted), key(oneSigned));
/* Still step one until BOTH have signed -- nobody new to tell yet. */
ck('and it still names the one it is waiting on', key(oneSigned).indexOf('mcruz') > 0);
ck('the step closing moves it on to the next approver',
  key(stepOne) === 'pending|2/3|jubana', key(stepOne));
ck('and approval is a state of its own, waiting on nobody',
  key(done) === 'approved|3/3|', key(done));
/* Two people on one step in either order is the same set of people. */
ck('the same two people in a different order is the same key',
  A.apvMirrorKey({ state: 'pending', signed: 0, total: 3, waiting: ['rvera', 'mcruz'] }) ===
  A.apvMirrorKey({ state: 'pending', signed: 0, total: 3, waiting: ['mcruz', 'rvera'] }));
ck('a returned CE is not left reading as pending', key({ state: 'returned', lines: {} }).indexOf('returned|') === 0);
ck('and nothing at all is an empty key', A.apvMirrorKey(null) === '');

/* ---- what lands in the columns ---- */
const cols = new Function('apvMirrorKey',
  db.slice(db.indexOf('function _apvCols('), db.indexOf('let _apvColsMissing')) +
  '\nreturn _apvCols;')(A.apvMirrorKey);
const got = cols({ apv: A.apvMirror(approvers, submitted) }, 'SY3-CE-2026-0148');
ck('the state is a plain word, not JSON', got.shicApvState === 'pending', got.shicApvState);
/* In signing order, the order the roster is written in -- only the KEY sorts,
   because there the order must not matter. Here it should: someone reading
   the column is reading the signatory list. */
ck('who it waits on is readable in the column itself',
  got.shicApvWaiting === 'rvera, mcruz', got.shicApvWaiting);
ck('the key is there for the flow to compare against', got.shicApvKey === key(submitted));
/* Without it the flow must join back to the CEs list just to name the CE in
   the message it sends. */
ck('and the CE number, so a message can be written without a second lookup',
  got.shicCENum === 'SY3-CE-2026-0148');
/* A CE with no approval routing has nothing to notify anyone about. Writing
   'none' into the state would have the flow reasoning about rows that will
   never move. */
const none = cols({}, 'SY3-CE-2026-0148');
ck('a CE that was never submitted writes no approval state',
  none.shicApvState === undefined && none.shicApvKey === undefined &&
  none.shicApvWaiting === undefined);
/* But the CE number goes on every row regardless: it is what an orphaned
   Monitoring row is reunited with its twin by, and the rows likeliest to
   split are exactly the ones written before a CE is ever submitted. */
ck('though it is still stamped with the CE number',
  none.shicCENum === 'SY3-CE-2026-0148', none.shicCENum);
/* SharePoint single-line-of-text caps at 255. A CE with a long roster would
   otherwise fail the whole write. */
ck('every column is cut to what a text column holds',
  ['shicApvWaiting', 'shicApvKey', 'shicCENum'].every(k => db.indexOf(k + '=') > 0 || db.indexOf(k + ':') > 0) &&
  (db.match(/\.slice\(0,255\)/g) || []).length >= 3);

/* ---- the record survives a site that has not been repaired ---- */
/* SharePoint rejects the WHOLE write for one column it does not know, so
   without this the approval trail itself would be lost on an unrepaired site
   -- a far worse failure than a notification not being sent. */
ck('a rejected write goes again carrying only the JSON', /_stripApvCols\(payload\)/.test(db));
/* Stated as a rule rather than a fixed list, so a column added later fails
   here for being unstripped rather than for not being one of four. */
const _strip = db.slice(db.indexOf('function _stripApvCols('), db.indexOf('function _stripApvCols(') + 400);
ck('and every promoted column is stripped, not just some',
  (db.match(/out\.(shic\w+)=/g) || []).concat(["out.shicCENum="])
    .map(x => x.slice(4, -1)).every(c => _strip.indexOf("'" + c + "'") > 0));
ck('after one rejection it stops trying, rather than failing every write twice',
  /if\(_apvColsMissing\)return await send\(_stripApvCols\(payload\)\)/.test(db));
ck('and it says which button fixes it',
  db.slice(db.indexOf('async function _monWrite'), db.indexOf('function _stripApvCols')).indexOf('Repair lists & columns') > 0);
ck('every path that writes a Monitoring row goes through it (patch, duplicates, both creates)',
  (db.match(/_monWrite\(/g) || []).length === 5, (db.match(/_monWrite\(/g) || []).length);

/* ---- provisioning ---- */
['shicApvState', 'shicApvWaiting', 'shicApvKey', 'shicCENum'].forEach(c =>
  ck(c + ' is created by "Repair lists & columns"', new RegExp("\\[2,'" + c + "'\\]").test(reg)));
/* The flow writes shicApvNotified to remember what it has already acted on.
   If this app ever wrote it, a save would make the flow forget -- or worse,
   think it had already notified when it had not. */
/* Named in a comment is fine and useful; written is not. So this looks for it
   being SET -- as a property in a payload -- rather than merely mentioned. */
ck('nothing in the app writes shicApvNotified -- it belongs to the flow',
  !/shicApvNotified\s*[:=]/.test(db + R('src/App.js') + reg));
/* The JSON stays the source of truth. If anything read these columns back,
   an unrepaired site would start reporting a state it never wrote. */
ck('the columns are written and never read back',
  db.indexOf('h.shicApvState') < 0 && db.indexOf('shicApvKey||') < 0);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nApproval mirror columns OK');
process.exit(bad ? 1 : 0);
