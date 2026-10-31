/* The My Work groups pick their lists by position (n[] and each group's idx), so the lists must stay in that order with the empty slot at 5.
   Run: node tools/test-mywork-list-positions.js */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/MyWorkTab.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const from = src.indexOf('    mwPanel(['), to = src.indexOf('(isRequestor || sent.length > 0) &&');
const body = src.slice(from, to);
const order = ['For my approval', 'Returned to me', 'My open CEs', 'My drafts', 'My CEs in approval', '\n      null,\n', 'Requests awaiting review', 'For review (status'].map(k => body.indexOf(k));
ck('every list is present', order.every(i => i > 0));
ck('in the order the groups expect, with the empty slot at 5', order.every((v, i) => !i || v > order[i - 1]));
const n = src.match(/const n = \[([^\]]*)\];/);
ck('n[] has eight entries and a zero at 5', !!n && n[1].split(/,(?![^(]*\))/).length === 8 && /fInApproval\.length, 0, /.test(n[1]));
ck('Needs my action reads 0, 1 and 6; Requests for review reads 7', src.includes("idx: [0, 1, 6], urgent: true") && src.includes('idx: [7], info: true'));
process.exit(bad ? 1 : 0);
