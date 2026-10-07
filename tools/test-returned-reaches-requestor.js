/* A returned request shows up for its requestor as returned, with the note and an Update button.
   Run: node tools/test-returned-reaches-requestor.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8'));
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('const _retReq = '), b = app.indexOf('const open = mine.filter', a);
const run = new Function('isRequestor', 'names', 'rows', 'returned', 'me', app.slice(a, b) + 'return {retReq, returnedAll};');
const mk = (id, info, rb) => ({ e: { id, info }, m: { receivedBy: rb } });
const rows = [mk(1, { request: true, reviewStatus: 'returned' }, 'Jess Tan'), mk(2, { request: true }, 'Jess Tan'), mk(3, { request: true, reviewStatus: 'returned' }, 'Someone Else'), mk(4, { request: true, reviewStatus: 'returned', acceptedCeNum: 'X' }, 'Jess Tan')];
let r = run(true, ['JESS TAN'], rows, [{ e: { id: 9 }, m: {} }], 'jess');
ck('the requestor gets their own returned request, with the approvals already returned to them', r.retReq.length === 1 && r.retReq[0].e.id === 1 && r.returnedAll.length === 2);
ck('a pending one, someone else\'s and an accepted one are not returned to them', !r.retReq.some(x => [2, 3, 4].includes(x.e.id)));
ck('the team does not see them as returned to themselves', run(false, ['JESS TAN'], rows, [], 'jess').retReq.length === 0);
ck('Returned to me counts, lists and shows the note', app.indexOf("returnedAll.length + ' returned to me'") > 0 && app.indexOf("section('↩ Returned to me', fReturned") > 0 && app.indexOf("'Returned: ' + x.e.info.reviewNote") > 0);
ck('the requestor gets Update, not a Load that refuses', app.indexOf("onClick:()=>openReview(x.e, 'update')}, \"Update\")") > 0);
ck('My requests says Returned to you instead of Pending', app.indexOf("'Returned to you'") > 0 && app.indexOf("'Sent back to Cost Estimation'") > 0);
ck('a request I filed counts as mine even when the Received By name differs', run(true, ['JESS'], [{ e: { id: 7, savedBy: 'jess', info: { request: true, reviewStatus: 'returned' } }, m: {} }], [], 'jess').retReq.length === 1);
process.exit(bad ? 1 : 0);
