/* The Dashboard's open-CE table shows job title, discipline and estimator.
   Run: node tools/test-dashboard-open-details.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('headers', app.indexOf("['CE No.','RCE No.','Client','Job Title','Discipline','Estimator','Received By','Date Recv.','Status','Deadline','Days Left','Total']") > 0);
ck('job title from monitoring, else the CE description', app.indexOf("x.m.jobTitle || x.h.info?.description") > 0);
ck('discipline', app.indexOf("x.h.info?.projType || x.m.designation") > 0);
ck('estimator, Unassigned shown as blank', app.indexOf("String(x.m.ceeName || '').replace(/^Unassigned$/, '')") > 0);
ck('RCE No., Received By and Date Recv. cells', app.indexOf('x.m.rceNo || x.h.info?.requestNum') > 0 && app.indexOf('x.m.receivedBy || ') > 0 && app.indexOf('x.m.dateRecv ? new Date(x.m.dateRecv') > 0);
process.exit(bad ? 1 : 0);
