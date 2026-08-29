#!/usr/bin/env node
/*
 * Every sortable column in CE Monitoring must actually sort by what it shows.
 *
 * The comparator handled four columns -- ceNum, grand, deadline, status. The
 * other ten clickable headers fell through to an `else` that sorted by
 * savedAt, so clicking Customer, Job Title, Estimator, Co., Discipline, Days
 * Left, Date Submitted, Received By or Remarks reordered the table by
 * something invisible. That reads as sorting being broken, because it is.
 *
 * Also checked here: blanks sort last whichever way the arrow points (a column
 * of dashes at the top is never what anyone wanted), and comparison is
 * numeric-aware and case-insensitive, so SY3-CE-2026-9 precedes
 * SY3-CE-2026-10 and "aestillore" sits with "Aestillore".
 *
 * Run: node tools/test-monitoring-sort.js
 */
'use strict';

const fs = require('fs');
const src = fs.readFileSync('src/App.js', 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* The clickable headers, straight from the table definition. */
const hdr = src.match(/\[\['ceeName', 'Estimator'[\s\S]*?\]\]\.map\(\(\[col, label, w\]\)/);
if (!hdr) { console.error('monitoring header row not found'); process.exit(1); }
const cols = [...hdr[0].matchAll(/\['([a-zA-Z]+)',/g)].map(m => m[1]);

const sortValSrc = src.match(/const sortVal = \(e, m\) => \{[\s\S]*?\n    \};/);
if (!sortValSrc) { console.error('sortVal not found'); process.exit(1); }

console.log('every clickable header is handled (' + cols.length + ' columns):');
for (const c of cols) {
  const handled = new RegExp("case '" + c + "':").test(sortValSrc[0]) || c === 'dateRecv';
  ck(c, handled, 'falls through to the default, sorting by something the column does not show');
}

/* Run the real comparator. */
const N = v => Number(v) || 0;
/* The rows are the CE entries themselves -- the comparator calls
   sortVal(e, monOf(e)), so a wrapper object passed as `e` would leave every
   value blank and the list untouched, which looks like a passing test for all
   the wrong reasons. The monitoring record is looked up on the side. */
const rows = [
  {info: {ceNum: 'SY3-CE-2026-10'}, grand: 100, savedAt: '2026-01-02'},
  {info: {ceNum: 'SY3-CE-2026-9'}, grand: 20, savedAt: '2026-01-03'},
  {info: {ceNum: 'SY3-CE-2026-2'}, grand: 300, savedAt: '2026-01-01'}
];
const mon = new Map([
  [rows[0], {customer: 'beta', status: 'Ongoing'}],
  [rows[1], {customer: 'Alpha', status: 'Approved'}],
  [rows[2], {customer: '', status: ''}]
]);
const cmpSrc = src.match(/return \[\.\.\.filtered\]\.sort\(\(a, b\) => \{[\s\S]*?\n    \}\);/)[0];
const run = (col, dir) => {
  const sortVal = new Function('monSortCol', 'N', 'return ' + sortValSrc[0].replace(/^const sortVal = /, '').replace(/;$/, ''))(col, N);
  const body = cmpSrc.replace(/^return \[\.\.\.filtered\]\.sort\(/, '').replace(/\);$/, '');
  const cmp = new Function('sortVal', 'monOf', 'monSortDir', 'return ' + body)(sortVal, e => mon.get(e) || {}, dir);
  return [...rows].sort(cmp).map(r => r.info.ceNum.replace('SY3-CE-2026-', ''));
};
/* Guard the harness itself: if the values never reached the comparator the
   list would come back in input order for every column, and every assertion
   below would be meaningless. */
if (run('ceNum', 'asc').join(',') === rows.map(r => r.info.ceNum.replace('SY3-CE-2026-', '')).join(',')) {
  console.error('harness is not exercising the comparator -- input order returned unchanged');
  process.exit(1);
}

console.log('\nit sorts the way a person reads it:');
ck('CE numbers are numeric-aware, not "10 before 9"',
  run('ceNum', 'asc').join(',') === '2,9,10', run('ceNum', 'asc').join(','));
ck('and reverse',
  run('ceNum', 'desc').join(',') === '10,9,2', run('ceNum', 'desc').join(','));
ck('totals sort as numbers', run('grand', 'asc').join(',') === '9,10,2', run('grand', 'asc').join(','));
ck('case does not split the list', run('customer', 'asc')[0] === '9',
  '"Alpha" must come before "beta"; got ' + run('customer', 'asc').join(','));

console.log('\nblanks sort last, both ways:');
ck('ascending', run('customer', 'asc')[2] === '2', run('customer', 'asc').join(','));
ck('descending', run('customer', 'desc')[2] === '2', run('customer', 'desc').join(','));
ck('same for status', run('status', 'desc')[2] === '2', run('status', 'desc').join(','));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nmonitoring sort OK');
process.exit(fails ? 1 : 0);
