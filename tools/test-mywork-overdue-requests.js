/* My Work counts overdue requests: the team's queue past deadline, or a requestor's own.
   Run: node tools/test-mywork-overdue-requests.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('const _todayMw'), b = app.indexOf('const forReview', a);
ck('the block is found', a > 0 && b > a);
const body = app.slice(a, b);
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const run = (isRequestor, rows, awaitingReq) => new Function('isRequestor', 'rows', 'awaitingReq', 'names', 'me', 'reqDeadline', body + '; return overdueReq;')(
  isRequestor, rows, awaitingReq, ['JESS'], 'jess', (dl, inq, rec) => { if (dl) return dl; const b0 = inq || rec; if (!b0) return ''; const d = new Date(b0 + 'T00:00:00'); d.setDate(d.getDate() + 3); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
const mk = (id, info, m, savedBy) => ({ e: { id, info: { request: true, ...info }, savedBy: savedBy || 'jess' }, m: m || {} });
const late = mk(1, {}, { deadline: day(-2), receivedBy: 'Jess' }), fine = mk(2, {}, { deadline: day(3), receivedBy: 'Jess' }),
  ret = mk(3, { reviewStatus: 'returned' }, { deadline: day(-5), receivedBy: 'Jess' }), done = mk(4, { acceptedCeNum: 'X' }, { deadline: day(-5), receivedBy: 'Jess' }),
  other = mk(5, {}, { deadline: day(-5), receivedBy: 'Kim' }, 'kim');
const all = [late, fine, ret, done, other];
ck('the team: counts the awaiting queue that is past deadline', run(false, all, [late, fine, other]).length === 2);
ck('a requestor: only their own, past deadline, not returned or accepted', run(true, all, []).length === 1);
ck('the card is on My Work, red when any', app.indexOf("kpi('Overdue requests', overdueReq.length") > 0 && app.indexOf("overdueReq.length ? ERR : null") > 0);
process.exit(bad ? 1 : 0);
