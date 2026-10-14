#!/usr/bin/env node
/*
 * Dashboard: Mechanical and Electrical are monitored apart, each on its own card (open CEs and value, past deadline, requests awaiting review,
 * overdue requests, status mix in the admin's order and colours, next five due). CEs of any other discipline are said out loud, not dropped.
 *
 * Run: node tools/test-dashboard-disciplines.js
 */
'use strict';
const fs = require('fs');
const d = fs.readFileSync('src/components/DashboardTab.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('a CE goes to the discipline on its record (the Monitoring Discipline first, the same order the Monitoring table shows, then the CE itself)', /discOf = x => .*x\.m\.designation \|\| x\.m\.discipline \|\| i\.discipline \|\| i\.projType/.test(d) && /electr/.test(d) && /mechan/.test(d));
ck('there is one card for each of Mechanical and Electrical, side by side', /discCard\('Mechanical'/.test(d) && /discCard\('Electrical'/.test(d));
ck('each card counts open CEs, their value, past-deadline, awaiting review and overdue requests', ['Open CEs', 'Open value', 'Past deadline', 'Awaiting review', 'Overdue requests'].every(l => d.includes("'" + l + "'")));
ck('the open test is the shared ceIsOpen one, so the status manager\'s Closed group applies', /openCEs = [\s\S]*?ceIsOpen\(x\.m\.status\)/.test(d) && /open = openCEs\.filter/.test(d));
ck('the status mix follows the admin\'s order and colours', /allStatuses\|\|\[\]\)\.indexOf\(a\[0\]\)/.test(d) && /getStatusColor\(st\)/.test(d));
ck('other disciplines are named below the cards, not silently dropped', /discNone > 0/.test(d) && /have no Mechanical or Electrical discipline set/.test(d));
const app = fs.readFileSync('src/App.js', 'utf8');
ck('a Show toggle (All / Mechanical / Electrical) sits above the figures', /dash-disc-toggle/.test(d) && /\['', 'All'\]/.test(d) && /setDashDisc\(k\)/.test(d));
ck('picking one narrows both the history and the monitoring rows, so every figure and list follows', /liveHist = allHist\.filter\(byDisc\), liveRows = liveOnly\(monRows\)\.filter\(byDisc\)/.test(d));
ck('the superseded-revision note still counts every discipline', /supersededN = history\.length - allHist\.length/.test(d));
ck('the side-by-side cards are hidden while one discipline is picked', /!_dd && .*discCard\('Mechanical'/.test(d));
ck('the choice lives in App, so it survives leaving the tab', /const \[dashDisc, setDashDisc\] = useState\(''\)/.test(app) && /DashboardTab\(\{ estName, allStatuses, dashAll, dashDisc, setDashDisc,/.test(app));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nDashboard disciplines OK');
process.exit(bad ? 1 : 0);
