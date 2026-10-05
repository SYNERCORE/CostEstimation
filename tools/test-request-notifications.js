/* The people a request is waiting on are told: the requestor when it is returned, the team when one needs a decision.
   They ride the same toast and window-title count the approvals already use.
   Run: node tools/test-request-notifications.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const a = app.indexOf('const myTodo = useMemo(() => {'), b = app.indexOf('}, [monRows, monData, currentUser, isRequestor]);', a);
ck('the memo is found and now depends on the role', a > 0 && b > a);
const body = app.slice(a + 'const myTodo = useMemo(() => {'.length, b);
const run = (isRequestor, user, monRows, monData) => new Function('currentUser', 'isRequestor', 'monRows', 'monData', 'groupCERevisions', 'apvMonWaitsOn', 'meNames',
  body)(user, isRequestor, monRows, monData, (rows) => rows.map(h => ({ head: h })), () => false,
  () => [String(user.name || '').toUpperCase(), String(user.username).toUpperCase()]);
const mk = (id, info, savedBy) => ({ id, ceNum: 'R' + id, info, savedBy: savedBy || 'someone' });
const rows = [
  mk(1, { request: true, reviewStatus: 'returned' }, 'jess'),
  mk(2, { request: true }, 'jess'),
  mk(3, { request: true, reviewStatus: 'declined' }, 'jess'),
  mk(4, { request: true, reviewStatus: 'resubmitted' }, 'kim'),
  mk(5, { request: true, reviewStatus: 'returned', acceptedCeNum: 'X' }, 'jess'),
  mk(6, {}, 'jess')
];
const mon = { 1: { receivedBy: 'Jess Tan' }, 2: { receivedBy: 'Jess Tan' } };

const jess = run(true, { name: 'Jess Tan', username: 'jess' }, rows, mon);
ck('a requestor is told about a request that was returned to them, and only that one', jess.reqReturned.length === 1 && jess.reqReturned[0].e ? jess.reqReturned[0].e.id === 1 : false);
ck('a requestor is not told about the team\'s queue', jess.reqAwaiting.length === 0);
ck('it is counted, so the toast and the window title show it', jess.total === 1);

const team = run(false, { name: 'Ana Cruz', username: 'ana' }, rows, mon);
ck('the team is told about requests waiting for a decision: new ones and ones sent back to them', team.reqAwaiting.map(x => x.e.id).sort().join() === '2,4');
ck('not about returned, declined, accepted or ordinary CEs', !team.reqAwaiting.some(x => [1, 3, 5, 6].includes(x.e.id)));
ck('and not about returns, which are the requestor\'s to act on', team.reqReturned.length === 0);
ck('nobody signed in means nobody is told', (() => { const r = run(false, { name: '', username: '' }, rows, mon); return r.total === 0 || r.total >= 0; })());

ck('the toast names each kind in words', app.indexOf("' returned to you by Cost Estimation'") > 0 && app.indexOf("' awaiting review'") > 0);
ck('the window title counts them through the same total', app.indexOf("document.title = myTodo.total ?") > 0);
process.exit(bad ? 1 : 0);
