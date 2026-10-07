/* CE Monitoring: an RCE / CE filter, and an RCE No. column that works.
   Run: node tools/test-rce-ce-filter.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8'));
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('const rceOf = '), b = app.indexOf('const sortedHistory', a);
const f = new Function(app.slice(a, b) + 'return {rceOf, reqKind};')();
ck('a request is pending until accepted, then accepted; anything else is a CE', f.reqKind({ info: { request: true } }) === 'pending' && f.reqKind({ info: { request: true, acceptedCeNum: 'SHIC-CE-1' } }) === 'accepted' && f.reqKind({ info: {} }) === 'ce' && f.reqKind({}) === 'ce');
ck('the RCE No. is the monitoring one, else the number the request was filed under', f.rceOf({ info: { requestNum: 'R-1' } }, {}) === 'R-1' && f.rceOf({ info: { requestNum: 'R-1' } }, { rceNo: 'M-2' }) === 'M-2' && f.rceOf({ info: {} }, undefined) === '');
ck('the filter is applied, cleared and part of the memo', app.indexOf("if (monReqFilter !== 'all' && reqKind(e) !== monReqFilter) return false;") > 0 && app.indexOf("setMonReqFilter('all'); setMonDiscFilter('all');") > 0 && app.indexOf('monTypeFilter, monReqFilter, monDiscFilter') > 0);
ck('the three choices are offered', ["value:'pending'", "value:'accepted'", "value:'ce'"].every(k => app.indexOf(k + '}, "') > 0));
ck('the RCE No. column sorts and the search finds it', app.indexOf("['ceNum', 'rceNo', 'deadline', 'status', 'grand'].includes(col)") > 0 && app.indexOf('[e.info?.ceNum, rceOf(e, m),') > 0 && app.indexOf("case 'rceNo':        return rceOf(e, m);") > 0);
ck('the CE No. cell is a dash until a request is accepted', app.indexOf("style:{color:MT}}, '\\u2014') : ceNum),") > 0);
process.exit(bad ? 1 : 0);
