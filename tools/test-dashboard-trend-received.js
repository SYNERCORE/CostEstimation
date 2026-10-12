#!/usr/bin/env node
/*
 * Dashboard "Monthly Trend" groups by Date Received (the record's own date, else the day it was saved), not by the save date.
 * Runs the real code. Run: node tools/test-dashboard-trend-received.js
 */
'use strict';
process.env.TZ = 'Asia/Manila';
const fs = require('fs');
const src = fs.readFileSync('src/components/DashboardTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const m = src.match(/const recvDate = [^\n]*\n  const monthTotals = [^\n]*\n/);
ck('the trend uses recvDate', !!m && /const d=recvDate\(h\)/.test(m[0]));
ck('the card says it is by Date Received', /Monthly Trend \(Last 6 Months, by Date Received\)/.test(src));
if (m) {
  const N = x => Number(x) || 0;
  const months = [{ label: 'Aug', month: 7, year: 2026 }, { label: 'Sep', month: 8, year: 2026 }];
  const hist = [
    { id: 1, grand: 100, savedAt: '2026-10-12T09:00:00+08:00' },            // saved Oct, received Aug -> Aug
    { id: 2, grand: 50, savedAt: '2026-09-30T09:00:00+08:00' },             // no received date -> day saved, Sep
    { id: 3, grand: 7, savedAt: '2026-10-01T09:00:00+08:00' }               // received Sep 1 (local day, not shifted) -> Sep
  ];
  const mon = { 1: { dateRecv: '2026-08-31' }, 2: {}, 3: { dateRecv: '2026-09-01' } };
  const r = new Function('months', 'liveHist', 'monOf', 'N', m[0] + '\nreturn monthTotals;')(months, hist, h => mon[h.id], N);
  ck('a CE saved in October but received in August counts in August', r[0].total === 100, JSON.stringify(r));
  ck('no received date falls back to the save day; first-of-month dates keep their month', r[1].total === 57, JSON.stringify(r));
}
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nDashboard trend by received OK');
process.exit(bad ? 1 : 0);
