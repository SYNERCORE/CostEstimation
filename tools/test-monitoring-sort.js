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
const ceNumKey = new Function('return ' + src.match(/function ceNumKey\(num\) \{[\s\S]*?\n\}/)[0])();

/* Build the real comparator with everything it closes over. */
const comparator = (col, dir, monOf) => {
  const sortVal = new Function('monSortCol', 'N', 'return ' + sortValSrc[0].replace(/^const sortVal = /, '').replace(/;$/, ''))(col, N);
  const body = cmpSrc.replace(/^return \[\.\.\.filtered\]\.sort\(/, '').replace(/\);$/, '');
  return new Function('sortVal', 'monOf', 'monSortDir', 'monSortCol', 'ceNumKey', 'return ' + body)(sortVal, monOf, dir, col, ceNumKey);
};
const run = (col, dir) =>
  [...rows].sort(comparator(col, dir, e => mon.get(e) || {}))
    .map(r => r.info.ceNum.replace('SY3-CE-2026-', ''));
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

/* CE numbers restart every year, and the company prefix sits IN FRONT of the
   year -- so a plain text sort files every SHIC CE ahead of every SY3 one
   whatever year either was raised in, and the sequence alone means nothing. */
console.log('\nCE numbers sort on year, then sequence:');
const keyOf = n => JSON.stringify(ceNumKey(n));
ck('the year is read out of the number', keyOf('SY3-CE-2025-0674') === '[2025,674]', keyOf('SY3-CE-2025-0674'));
ck('a letter inside the sequence does not break it', keyOf('SHIC-CE-2026-0912CR01') === '[2026,912,1]', keyOf('SHIC-CE-2026-0912CR01'));
ck('revisions become extra depth', keyOf('SY3-CE-2025-0555-R2-R3') === '[2025,555,2,3]', keyOf('SY3-CE-2025-0555-R2-R3'));
ck('something that is not a CE number gives no key', ceNumKey('draft copy') === null);

const order = (nums, dir) =>
  nums.map(n => ({info: {ceNum: n}, grand: 0, savedAt: ''}))
    .sort(comparator('ceNum', dir, () => ({}))).map(r => r.info.ceNum);

ck('a 2026 CE outranks a 2025 one from another company',
  order(['SY3-CE-2025-0674', 'SHIC-CE-2026-1094'], 'desc')[0] === 'SHIC-CE-2026-1094',
  order(['SY3-CE-2025-0674', 'SHIC-CE-2026-1094'], 'desc').join(' , '));
ck('the prefix no longer groups the list ahead of the year',
  order(['SHIC-CE-2025-0001', 'SY3-CE-2026-0001'], 'desc')[0] === 'SY3-CE-2026-0001',
  order(['SHIC-CE-2025-0001', 'SY3-CE-2026-0001'], 'desc').join(' , '));
ck('within a year it is the sequence, numerically',
  order(['SY3-CE-2026-0010', 'SY3-CE-2026-0009'], 'asc').join(',') === 'SY3-CE-2026-0009,SY3-CE-2026-0010',
  order(['SY3-CE-2026-0010', 'SY3-CE-2026-0009'], 'asc').join(','));
ck('a base CE leads its own revisions',
  order(['SY3-CE-2026-0091-R1', 'SY3-CE-2026-0091'], 'asc')[0] === 'SY3-CE-2026-0091',
  order(['SY3-CE-2026-0091-R1', 'SY3-CE-2026-0091'], 'asc').join(','));
ck('unparseable numbers keep to the end rather than interleaving',
  order(['zzz draft', 'SY3-CE-2026-0001'], 'desc')[1] === 'zzz draft',
  order(['zzz draft', 'SY3-CE-2026-0001'], 'desc').join(','));

console.log('\nand the list opens newest first:');
ck('default column is the CE number, not savedAt',
  /const \[monSortCol, setMonSortCol\] = useState\('ceNum'\)/.test(src),
  'savedAt is when the row was written HERE, so importing old CEs made them claim to be the newest work on the site');
ck('default direction is descending',
  /const \[monSortDir, setMonSortDir\] = useState\('desc'\)/.test(src));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nmonitoring sort OK');
process.exit(fails ? 1 : 0);
