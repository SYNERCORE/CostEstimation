#!/usr/bin/env node
/*
 * CE Monitoring's Date Recv. column shows every date the same way (Mar 9, 2026): one that was typed or imported as 2026-03-09 used to
 * show raw next to ones taken from the save date.
 *
 * Run: node tools/test-date-recv-format.js
 */
'use strict';
process.env.TZ = 'Asia/Manila';
const fs = require('fs');
/* the admin's date picker sits in front of the formatted date in the same cell; it has its own test */
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8').replace(/ {4}\/\* An admin can correct[\s\S]*?\}\) : /, '');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const m = mon.match(/\}, \/\* A received date[^\n]*\n\s*(\/\^[\s\S]*?\)\)), \/\*#__PURE__\*\/React\.createElement\("td"/);
ck('the cell formats a yyyy-mm-dd received date', !!m);
if (m) {
  const f = new Function('m', 'dateRecv', 'return ' + m[1].replace(/\)$/, ''));
  ck('2026-03-09 shows as Mar 9, 2026', f({ dateRecv: '2026-03-09' }, 'x') === 'Mar 9, 2026');
  ck('the year-end edge keeps its day (2026-12-31)', f({ dateRecv: '2026-12-31' }, 'x') === 'Dec 31, 2026');
  ck('no received date falls back to the save date text', f({}, 'Oct 7, 2026') === 'Oct 7, 2026');
  ck('free text already in the field is shown as it is', f({ dateRecv: 'Oct 7, 2026' }, 'x') === 'Oct 7, 2026');
}
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nDate Recv format OK');
process.exit(bad ? 1 : 0);
