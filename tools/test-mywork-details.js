/* My Work lines show customer, job title, discipline and estimator; the requestor's table has a Discipline column.
   Run: node tools/test-mywork-details.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('const line = (x, extra, actions)'), b = app.indexOf('const viewBtn', a);
const line = app.slice(a, b);
ck('job title from monitoring, else description', line.indexOf('x.m.jobTitle || (x.e.info && x.e.info.description)') > 0);
ck('discipline shown', line.indexOf('x.e.info.projType) || x.m.designation') > 0);
ck('estimator shown, Unassigned blank', line.indexOf("String(x.m.ceeName || '').replace(/^Unassigned$/, '')") > 0);
ck('full text on hover', line.indexOf('title: [') > 0);
ck('requestor table has a Discipline column', app.indexOf("'JOB', 'DISCIPLINE', 'ASSIGNED TO'") > 0);
process.exit(bad ? 1 : 0);
