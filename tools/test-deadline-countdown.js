#!/usr/bin/env node
/*
 * The Days Left clock stops when the CE is submitted.
 *
 * It measured the deadline against `new Date()` every render and never looked
 * at whether the CE had gone out. A CE submitted ON its deadline in July went
 * on accruing overdue days through August, and by September was reporting
 * "49d OD" in red beside its own on-time submission date. The work was done;
 * only the clock had not been told.
 *
 * The second bug in the same line: both dates are plain YYYY-MM-DD, and
 * `new Date('2026-07-18')` parses as UTC midnight while `new Date()` is local.
 * In Manila that is eight hours of skew, enough to report a deadline a day out
 * either side of midnight.
 *
 * Run: node tools/test-deadline-countdown.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = ['_ceMidnight', '_ceToday', 'ceDeadline']
  .map(f => (help.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}')) || [''])[0]).join('\n');
if (!/function ceDeadline/.test(src)) { console.error('ceDeadline not found in src/helpers.js'); process.exit(1); }

/* A fixed "today" so this reads the same in September as in January. */
const TODAY = new Date(2026, 8, 5);           // 5 Sep 2026, local
const ctx = { Date: class extends Date {
  constructor(...a) { if (!a.length) super(TODAY.getTime()); else super(...a); }
}, Math, String, isNaN, RegExp };
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._f=ceDeadline;', ctx);
const D = ctx._f;

console.log('while nothing has been submitted, it counts:');
ck('days remaining', D('2026-09-15', '').days === 10, JSON.stringify(D('2026-09-15', '')));
ck('and reads as a countdown', D('2026-09-15', '').label === '10d');
ck('overdue keeps growing', D('2026-07-18', null).days === -49, String(D('2026-07-18', null).days));
ck('and says so', D('2026-07-18', null).label === '49d OD');
ck('due today is 0d, not blank', D('2026-09-05', '').label === '0d');

console.log('\nonce submitted the clock stops — this is the reported bug:');
const onTime = D('2026-07-18', '2026-07-18');
ck('submitted on the deadline is not 49 days overdue', onTime.days === 0, String(onTime.days));
ck('it reads as finished, not as due today', onTime.label === 'on time',
  '"0d" reads as "due today" on a CE that went out seven weeks ago');
ck('and it is marked done', onTime.done === true && onTime.late === false);

console.log('\nand it reports how it went, not how long is left:');
ck('early', D('2026-07-18', '2026-07-15').label === '3d early');
ck('late', D('2026-07-18', '2026-07-21').label === '3d late');
ck('late is flagged late', D('2026-07-18', '2026-07-21').late === true);
ck('early is not', D('2026-07-18', '2026-07-15').late === false);
ck('the answer never moves again',
  D('2026-07-18', '2026-07-15').days === D('2026-07-18', '2026-07-15').days &&
  D('2026-07-18', '2026-07-15').days === 3,
  'it is measured deadline-to-submission, so today does not enter into it');

console.log('\ndates are compared at local midnight, not across a timezone:');
ck('a whole number of days comes back', Number.isInteger(D('2026-09-15', '').days));
ck('the deadline is parsed as local', /T00:00:00/.test(help),
  "new Date('2026-07-18') is UTC midnight; in Manila that is 08:00 the same day");
ck('and today is flattened to midnight too', /getFullYear\(\), n\.getMonth\(\), n\.getDate\(\)/.test(help),
  'comparing a date at midnight against a time of day leaves a fraction to round');

console.log('\nnothing to measure says nothing:');
for (const v of [null, undefined, '', 'not a date', '2026-13-99'])
  ck('no usable deadline -> null (' + JSON.stringify(v) + ')', D(v, '').days === null);
ck('and shows a dash', D(null, '').label === '—');
ck('a bad submitted date falls back to counting down', D('2026-07-18', 'rubbish').done === false,
  'better a live countdown than a made-up result');

console.log('\nthe monitoring table uses it:');
ck('the cell', /const dl = ceDeadline\(m\.deadline, m\.dateSubmitted\);/.test(app));
ck('and renders its label rather than rebuilding one', /\}, dl\.label\)/.test(app));
ck('a finished CE is not left amber forever',
  /dl\.done \? \(dl\.late \? ERR : OK\)/.test(app),
  'amber means "due soon", which a CE submitted in July is not');
ck('and the cell says what it is comparing', /Submitted ' \+ m\.dateSubmitted \+ ' against a '/.test(app));
ck('sorting follows the number on screen', /const _d = ceDeadline\(m\.deadline, m\.dateSubmitted\)\.days;/.test(app));
ck('a row with no deadline still sorts last either way', /_d === null \? '' : _d/.test(app),
  'a number would beat the blanks-last rule and pin those rows to one end');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ndeadline countdown OK');
process.exit(bad ? 1 : 0);
