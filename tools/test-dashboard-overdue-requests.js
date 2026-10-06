/* The Dashboard counts requests that are waiting on the team and past their deadline.
   Run: node tools/test-dashboard-overdue-requests.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('const reqOverdueRows = liveRows.map('), b = app.indexOf('const reqOverdueN = reqOverdueRows.length;', a) + 'const reqOverdueN = reqOverdueRows.length;'.length;
ck('the count is found', a > 0 && b > a);
const body = app.slice(app.lastIndexOf('const _today', a), b);
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const count = (rows, mon) => new Function('liveRows', 'isUnacceptedReq', 'monOf', 'reqDeadline', body + '; return reqOverdueN;')(rows,
  h => !!((h.info || {}).request && !(h.info || {}).acceptedCeNum), h => mon[h.id] || {},
  (dl, inq, rec) => { if (dl) return dl; const b0 = inq || rec; if (!b0) return ''; const d = new Date(b0 + 'T00:00:00'); d.setDate(d.getDate() + 3); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
const mk = (id, info, extra) => ({ id, info: { request: true, ...info }, ...(extra || {}) });
const rows = [
  mk(1, {}), mk(2, {}), mk(3, {}), mk(4, { reviewStatus: 'returned' }), mk(5, { reviewStatus: 'declined' }),
  mk(6, { acceptedCeNum: 'X' }), mk(7, {}, { _draft: true }), mk(8, { reviewStatus: 'resubmitted' }), mk(9, { rce: { inquiryDate: day(-10) } }), mk(10, { rce: { inquiryDate: day(-1) } }),
  { id: 11, info: {} }
];
const mon = { 1: { deadline: day(-2) }, 2: { deadline: day(5) }, 3: { deadline: day(0) }, 4: { deadline: day(-9) }, 5: { deadline: day(-9) }, 6: { deadline: day(-9) }, 7: { deadline: day(-9) }, 8: { deadline: day(-1) }, 11: { deadline: day(-9) } };
ck('counts exactly: past deadline, waiting on the team (new 1, resubmitted 8, and 9 whose default deadline passed)', count(rows, mon) === 3);
ck('a deadline today is not overdue', count([mk(3, {})], { 3: { deadline: day(0) } }) === 0);
ck('returned, declined, accepted, drafts and ordinary CEs are not counted', count([rows[3], rows[4], rows[5], rows[6], rows[10]], mon) === 0);
ck('the card is on the Dashboard, red when there are any', app.indexOf("kpiCard('Overdue Requests', reqOverdueN, reqOverdueN ? ERR : MT)") > 0);
ck('the list is on the Dashboard, only when there are any, most late first', app.indexOf('reqOverdueN > 0 && /*#__PURE__*/React.createElement("div",{style:{...CS,marginBottom:16}}') > 0 && app.indexOf('.sort((a, b) => b.late - a.late)') > 0);
ck('with RCE No., customer, job title, discipline, estimator, received by, date received, deadline and days late', app.indexOf("['RCE No.','Customer','Job Title','Discipline','Estimator','Received By','Date Recv.','Deadline','Days Late']") > 0);
process.exit(bad ? 1 : 0);
