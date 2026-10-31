/* The Dashboard's Statistics card has a Print button that opens a plain page of the figures shown.
   Run: node tools/test-dashboard-statistics-print.js */
'use strict';
const fs = require('fs'), path = require('path');
const d = fs.readFileSync(path.join(__dirname, '..', 'src/components/DashboardTab.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = d.indexOf('  const printStats = () => {'), b = d.indexOf('  const stSel =');
ck('the print function sits between the stat cards and the card itself', a > 0 && b > a);
const body = d.slice(a, b);
ck('it prints the period, the cards and the month / year lines', body.includes('stLabel') && body.includes('stNow.n') && body.includes('stBreak'));
ck('months still to come are left off the printout', body.includes('stBreak.filter(r => !r.future)'));
ck('it names the company and discipline when one is picked', body.includes('[_dc, _dd].filter(Boolean)'));
ck('text is escaped before it goes into the page', body.includes("replace(/&/g, '&amp;')") && body.includes("replace(/</g, '&lt;')"));
ck('it opens its own window and prints it', body.includes("window.open('', '_blank')") && body.includes('w.print()'));
ck('a blocked pop-up does nothing instead of throwing', body.includes('if (!w) return;'));
ck('the Print button is in the card header and calls it', d.includes("title:'Print these statistics',onClick:printStats") && d.indexOf('onClick:printStats') > d.indexOf('const statsCard'));
/* Run it with stand-ins and look at the page it writes. */
let written = '', printed = false;
const w = { document: { write: s => { written += s; }, close() {} }, focus() {}, print: () => { printed = true; } };
const mk = (sy) => new Function('window', 'setTimeout', 'ph', 'stNow', 'stPrev', 'stBreak', 'vsTxt', 'awardBase', 'sumG', '_dc', '_dd', '_sy', 'stLabel',
  body + '\nreturn printStats;')({ open: () => w }, f => f(), v => String(v), { n: 4, value: 4700, avg: 1175, sub: [1, 2], subV: 4000, awd: [1], awdV: 3000, lost: [1], open: [1] }, null,
  [{ label: 'Jan', s: { n: 2, value: 4000, sub: [1], awd: [1], lost: [], open: [] } }, { label: 'Dec', future: true, s: { n: 0, value: 0, sub: [], awd: [], lost: [], open: [] } }],
  () => '', 1, rs => rs.length * 500, 'SHIC', '', sy, 'March 2026');
mk('2026')();
ck('the page it writes carries the label, the scope and the figures', written.includes('CE Statistics · March 2026') && written.includes('SHIC') && written.includes('₱4700') && written.includes('<td>Jan</td>'));
ck('a future month is not in the table, and printing was asked for', !written.includes('<td>Dec</td>') && printed);
process.exit(bad ? 1 : 0);
