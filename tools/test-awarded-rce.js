#!/usr/bin/env node
/* Awarded is its own status -- Approved is internal sign-off, Awarded is the
   client giving us the job, and only Awarded counts as Won. RCE No. (Sales'
   Request for Cost Estimate number) is carried in CE Monitoring.
   Run: node tools/test-awarded-rce.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8'), cfg = fs.readFileSync('src/config.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
console.log('Awarded:');
ck('is a status', cfg.includes("'Submitted', 'Awarded'];"));
ck('is closed (nothing more is owed on the estimate)', cfg.includes("['Approved', 'Submitted', 'Awarded', 'No Quote', 'Cancelled']"));
ck('prints as APPROVED on the document', cfg.includes("'Awarded': 'APPROVED',"));
ck('Won counts Awarded, not Approved', app.includes("x.m.status === 'Awarded').length") && !app.includes("x.m.status === 'Approved').length"));
ck('has a colour', app.includes("'Awarded': '#16a34a'"));
ck('an imported sheet saying Awarded or Won maps to it', app.includes("'awarded':'Awarded', 'won':'Awarded',"));
console.log('\nRCE No.:');
ck('is a Monitoring column', app.includes("['rceNo', 'RCE No.', 100]") && app.includes("className: 'mon-rce'"));
ck('is edited in the row like the other fields', app.includes("updateMon(e.id, 'rceNo', v)"));
ck('sorts and searches', app.includes("case 'rceNo':") && app.includes("(m.rceNo || '').toLowerCase().includes(q)"));
ck('is asked for on New Request', app.includes('L("RCE No.", inp(\'rceNo\'') && app.includes("rceNo: String(f.rceNo || '').trim() }"));
ck('is read from an imported sheet', app.includes("rceNo: String(r[iRce]).trim()"));
ck('without "RCE No." being taken for "CE No."', app.includes("_hn(h)==='ceno'"));
ck('is in the import template', app.includes("'Recieved By','Remarks','RCE No.'"));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nawarded + RCE OK'); process.exit(bad ? 1 : 0);
