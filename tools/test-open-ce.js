#!/usr/bin/env node
/*
 * One definition of an open CE.
 *
 * Approved counted as open. It is the opposite: the estimate has been signed
 * off and the estimator owes nothing further on it, so it inflated the Open
 * CEs figure and sat in the deadline queue above work that had not been
 * started.
 *
 * And the dashboard's idea of open had nothing to do with the countdown's. A
 * CE could be off the open list and still counting down overdue days in the
 * monitoring table -- the same CE described two ways on two screens.
 *
 * Run: node tools/test-open-ce.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src =
  (cfg.match(/const DEFAULT_STATUS_OPTIONS = \[[^\]]*\];/) || [''])[0] + '\n' +
  (cfg.match(/const CE_CLOSED_STATUSES = \[[^\]]*\];/) || [''])[0] + '\n' +
  (cfg.match(/function ceIsOpen\(status\) \{[\s\S]*?\n\}/) || [''])[0] + '\n' +
  ['_ceMidnight', '_ceToday', 'ceDeadline']
    .map(f => (help.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}')) || [''])[0]).join('\n');
if (!/function ceIsOpen/.test(src) || !/function ceDeadline/.test(src)) {
  console.error('ceIsOpen / ceDeadline not found'); process.exit(1);
}

const TODAY = new Date(2026, 8, 5);   // 5 Sep 2026, so this reads the same in January
const ctx = { Date: class extends Date {
  constructor(...a) { if (!a.length) super(TODAY.getTime()); else super(...a); }
}, Math, String, isNaN, RegExp };
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._o=ceIsOpen;globalThis._d=ceDeadline;globalThis._all=DEFAULT_STATUS_OPTIONS;globalThis._closed=CE_CLOSED_STATUSES;',
  ctx);
const open = ctx._o, D = ctx._d, ALL = ctx._all, CLOSED = ctx._closed;

console.log('Approved is finished, not open — this is the reported bug:');
ck('Approved is closed', open('Approved') === false);
ck('and it is in the list by name', CLOSED.indexOf('Approved') >= 0);

console.log('\nthe other end states are still closed:');
for (const s of ['Submitted', 'No Quote', 'Cancelled'])
  ck(s, open(s) === false);

console.log('\nwork still owed is still open:');
for (const s of ['Draft', 'Pending', 'Ongoing', 'For site insp.', 'For Approval', 'Waiting in...'])
  ck(s, open(s) === true);
ck('On Hold stays open', open('On Hold') === true,
  'paused work comes back, and dropping it out of view is how it gets forgotten');
ck('a blank status is a Draft, not a closed CE', open('') === true && open(null) === true && open(undefined) === true);
ck('and so is a status nobody recognises', open('Some Custom Status') === true,
  'a custom status must not silently close a CE nobody has finished');
ck('whitespace does not change the answer', open('  Approved  ') === false);

console.log('\nevery closed status is a real one:');
for (const s of CLOSED) ck(s + ' is in the status list', ALL.indexOf(s) >= 0);
ck('and the open ones account for the rest',
  ALL.filter(s => open(s)).length + CLOSED.length === ALL.length,
  JSON.stringify(ALL.filter(s => open(s))));

console.log('\nthe countdown agrees with the dashboard:');
ck('an Approved CE stops counting', D('2026-07-18', '', 'Approved').done === true,
  'off the open list on one screen and counting overdue days on the other is the same CE described two ways');
ck('and says so rather than inventing a number',
  D('2026-07-18', '', 'Approved').label === 'closed' && D('2026-07-18', '', 'Approved').days === null,
  'nobody recorded when it went out, so there is no honest number of days');
ck('an Approved CE that DOES have a submitted date reports the outcome',
  D('2026-07-18', '2026-07-18', 'Approved').label === 'on time',
  'the date is better evidence than the status');
ck('an open CE still counts down', D('2026-09-15', '', 'Ongoing').label === '10d');
ck('and an open one past its deadline is still overdue', D('2026-07-18', '', 'Draft').label === '49d OD');
ck('On Hold keeps counting', D('2026-07-18', '', 'On Hold').done === false);

console.log('\nand nothing regresses when no status is passed at all:');
ck('it behaves exactly as before', D('2026-07-18', '').label === '49d OD' && D('2026-07-18', '2026-07-18').label === 'on time',
  'helpers.js loads before config.js, so ceIsOpen may not exist yet at load time');

console.log('\none definition, used everywhere:');
ck('the dashboard uses the shared test', /\.filter\(x => ceIsOpen\(x\.m\.status\)\)/.test(app));
ck('and no longer keeps its own list', !/const CLOSED_STATUSES = \[/.test(app),
  'two definitions of open would eventually disagree');
ck('it lives with the status options it draws from', /const CE_CLOSED_STATUSES/.test(cfg));
ck('the monitoring cell passes the status', /ceDeadline\(m\.deadline, m\.dateSubmitted, m\.status\)/.test(app));
ck('so does the sort', (app.match(/ceDeadline\(m\.deadline, m\.dateSubmitted, m\.status\)/g) || []).length >= 2);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nopen CE definition OK');
process.exit(bad ? 1 : 0);
