/* The Monitoring Job Title column is wide enough to read a title.
   Run: node tools/test-monitoring-jobtitle-width.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('header is 320 wide', app.indexOf("['jobTitle', 'Job Title', 320]") > 0);
ck('cell is 320 wide', app.indexOf("minWidth: 320,\n        maxWidth: 320\n      }\n    }, editingRow === e.id") > 0);
ck('text may fill it', app.indexOf("display:'block',maxWidth:310}}, m.jobTitle") > 0);
process.exit(bad ? 1 : 0);
