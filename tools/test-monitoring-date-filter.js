#!/usr/bin/env node
/*
 * CE Monitoring date filter: a preset (today, this week, this month, last 30 days, this year) or a custom from/to, applied to the date
 * received, the deadline or the date submitted. A CE with no such date is left out while a range is on; Clear Filters resets it.
 * Run: node tools/test-monitoring-date-filter.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const h = fs.readFileSync('src/helpers.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
const panel = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = h.indexOf('function monDateRange'), b = h.indexOf('/* A typed CE number that is far above');
const ctx = vm.createContext({ Date, String, isNaN });
vm.runInContext(h.slice(a, b) + '\nthis.r=monDateRange;this.k=monDateKey;', ctx);
const r = (p, f, t, now) => JSON.stringify(ctx.r(p, f, t, now));
const wed = new Date(2026, 9, 14, 10, 0, 0); /* Wednesday 14 Oct 2026 */
ck('any date is open on both sides', r('any', '', '', wed) === '["",""]');
ck('today is that one day', r('today', '', '', wed) === '["2026-10-14","2026-10-14"]', r('today', '', '', wed));
ck('this week runs Monday to Sunday', r('week', '', '', wed) === '["2026-10-12","2026-10-18"]', r('week', '', '', wed));
ck('a Sunday still belongs to the week that began the Monday before', r('week', '', '', new Date(2026, 9, 18, 9)) === '["2026-10-12","2026-10-18"]');
ck('this month is the 1st to the last day', r('month', '', '', wed) === '["2026-10-01","2026-10-31"]');
ck('a short month ends on its own last day', r('month', '', '', new Date(2026, 1, 10)) === '["2026-02-01","2026-02-28"]');
ck('the last 30 days include today and reach back 29', r('last30', '', '', wed) === '["2026-09-15","2026-10-14"]', r('last30', '', '', wed));
ck('this year is January to December', r('year', '', '', wed) === '["2026-01-01","2026-12-31"]');
ck('a custom range is used as typed', r('custom', '2026-03-01', '2026-03-31') === '["2026-03-01","2026-03-31"]');
ck('a custom range typed backwards is put the right way round', r('custom', '2026-03-31', '2026-03-01') === '["2026-03-01","2026-03-31"]');
ck('a custom range with only a start is open-ended', r('custom', '2026-03-01', '') === '["2026-03-01",""]');
ck('a stored date reads as its day, with or without a time', ctx.k('2026-10-14') === '2026-10-14' && ctx.k('2026-10-14T08:30:00Z') === '2026-10-14');
ck('nothing or nonsense is no date', ctx.k('') === '' && ctx.k(null) === '' && ctx.k('soon') === '');

ck('the table filter uses the date received (what the column shows), the deadline or the date submitted', app.includes("monDateField === 'deadline' ? m.deadline : monDateField === 'sub' ? m.dateSubmitted : effRecv(e, m)"));
ck('a CE with no date is left out while a range is on, and an inclusive compare is used', app.includes("if (!k || (_dRange[0] && k < _dRange[0]) || (_dRange[1] && k > _dRange[1])) return false;"));
ck('the filter re-runs when any of its four settings change', app.includes('monDateField, monDatePreset, monDateFrom, monDateTo, monMine'));
ck('the panel has the range box, the which-date box and the custom dates', panel.includes("'aria-label': 'Date range'") && panel.includes("'aria-label': 'Which date'") && panel.includes("'aria-label': 'From date'") && panel.includes("'aria-label': 'To date'"));
ck('Clear Filters shows for it and resets it', panel.includes("monCustFilter !== 'all' || monDatePreset !== 'any'") && panel.includes("setMonDatePreset('any'); setMonDateFrom(''); setMonDateTo('');"));
ck('picking a range returns to page 1', /setMonDatePreset\(e\.target\.value\); setMonPage\(0\)/.test(panel));
process.exit(bad ? 1 : 0);
