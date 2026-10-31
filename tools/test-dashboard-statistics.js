/* The Dashboard's Statistics card: this year by default, any earlier year or month on request.
   Run: node tools/test-dashboard-statistics.js */
'use strict';
const fs = require('fs'), path = require('path');
const d = fs.readFileSync(path.join(__dirname, '..', 'src/components/DashboardTab.js'), 'utf8').replace(/\r\n/g, '\n');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = d.indexOf('  const _sy = dashYear'), b = d.indexOf('  const stCard =');
const CLOSED = ['Approved', 'Submitted', 'Awarded', 'No Quote', 'Cancelled', 'Superseded'];
const mon = {};
const h = (id, recv, status, grand, info) => { mon[id] = { dateRecv: recv, status }; return { id, grand, savedAt: recv + 'T00:00:00', info: info || {} }; };
const rows = [
  h(1, '2026-01-10', 'Submitted', 1000), h(2, '2026-01-20', 'Awarded', 3000), h(3, '2026-03-05', 'Ongoing', 500), h(4, '2026-03-06', 'No Quote', 200),
  h(5, '2025-01-12', 'Awarded', 2000), h(6, '2025-03-01', 'Submitted', 4000), h(7, '2025-03-02', 'Cancelled', 100),
  h(8, '2026-02-02', 'Pending', 9999, { request: true })];
const run = (dashYear, dashMonth) => new Function('valHist', 'monOf', 'N', 'ceIsOpen', 'isUnacceptedReq', 'recvDate', 'thisYear', 'thisMonth', 'dashYear', 'dashMonth', 'setDashYear', 'setDashMonth',
  d.slice(a, b) + '\nreturn {stNow, stPrev, stBreak, stYears, stLabel, vsTxt};')(
  rows, x => mon[x.id] || {}, Number, s => CLOSED.indexOf(String(s || 'Draft')) < 0, x => !!(x.info.request && !x.info.acceptedCeNum),
  x => new Date(mon[x.id].dateRecv + 'T00:00:00'), 2026, 2, dashYear, dashMonth, () => {}, () => {});
const y = run('2026', '');
ck('this year counts its CEs and leaves a request nobody has accepted out', y.stNow.n === 4 && y.stNow.value === 4700);
ck('submitted, awarded, lost and still open are counted apart', y.stNow.sub.length === 1 && y.stNow.awd.length === 1 && y.stNow.lost.length === 1 && y.stNow.open.length === 1);
ck('the average is the value over the CEs', y.stNow.avg === 4700 / 4);
ck('last year is worked out for the comparison', y.stPrev.n === 3 && y.stPrev.value === 6100);
ck('the comparison says how far up or down it is', y.vsTxt(y.stNow.n, y.stPrev.n) === '▲ 33% vs 2025' && y.vsTxt(y.stNow.value, y.stPrev.value) === '▼ 23% vs 2025');
ck('the whole year is broken down into twelve months, the later ones marked as future', y.stBreak.length === 12 && y.stBreak[0].s.n === 2 && y.stBreak[2].s.n === 2 && y.stBreak[5].future === true && y.stBreak[1].future === false);
const m = run('2026', '2');
ck('one month narrows to that month and compares with the same month last year', m.stNow.n === 2 && m.stPrev.n === 2 && /March 2026/.test(m.stLabel) && m.stBreak.length === 0);
ck('its comparison names the month', m.vsTxt(m.stNow.n, m.stPrev.n) === '' || /Mar 2025/.test(m.vsTxt(m.stNow.n, 1)));
const p = run('2025', '');
ck('last year can be picked and is shown as a year', p.stNow.n === 3 && p.stLabel === '2025' && p.stBreak[0].s.n === 1);
const all = run('all', '');
ck('every year shows a line per year, oldest first, and no comparison', all.stNow.n === 7 && all.stPrev === null && all.stBreak.map(r => r.label).join() === '2025,2026');
ck('the years offered come from the CEs, newest first, and always include this year', run('2026', '').stYears.join() === '2026,2025');
ck('a click on a month line opens that month; a year line opens that year', d.includes('pick: () => setDashMonth') && d.includes('pick: () => setDashYear'));
ck('the card opens on the current year, whole year', app.includes("useState(String(new Date().getFullYear()))") && app.includes("const [dashMonth, setDashMonth] = useState('')"));
ck('the card follows the company and discipline filters (it reads valHist)', d.includes('const stRows = valHist.filter'));
process.exit(bad ? 1 : 0);
