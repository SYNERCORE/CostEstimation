/* The Dashboard's open-CE table shows job title, discipline and estimator.
   Run: node tools/test-dashboard-open-details.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('headers', app.indexOf("['CE No.','Client','Job Title','Discipline','Estimator','Status','Deadline','Days Left','Total']") > 0);
ck('job title from monitoring, else the CE description', app.indexOf("x.m.jobTitle || x.h.info?.description") > 0);
ck('discipline', app.indexOf("x.h.info?.projType || x.m.designation") > 0);
ck('estimator, Unassigned shown as blank', app.indexOf("String(x.m.ceeName || '').replace(/^Unassigned$/, '')") > 0);
process.exit(bad ? 1 : 0);
