#!/usr/bin/env node
/*
 * The QTY and DAYS printed on a Benefits & Others line have to describe the
 * money beside them.
 *
 * C.7 merges a role across every shift it works -- one line per hire, not one
 * per shift. QTY summed the pax, which is right, but DAYS took the LONGEST
 * shift. So a supervisor worked 2 pax x 10 days on days and 1 pax x 2 days on
 * nights printed "3 pax, 10 days" -- 30 man-days -- next to benefits covering
 * 22. Nothing was mischarged; the line simply did not add up to itself, which
 * on a document somebody signs is its own kind of wrong.
 *
 * DAYS is now the man-days divided back out by pax, so QTY x DAYS is exactly
 * what the benefits were computed over. Where every shift runs the same length
 * -- most CEs -- the figure is unchanged.
 *
 * Run: node tools/test-benefit-days.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const near = (a, b) => Math.abs(a - b) < 0.005;

const grab = (re, what) => { const m = app.match(re); if (!m) { console.error('not found in src/App.js: ' + what); process.exit(1); } return m[0]; };

/* The real calcBen and the real merge, lifted out of the component. */
const body = grab(/const benefitRows = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[mp\]\);/, 'benefitRows')
  .replace(/^\s*const benefitRows = useMemo\(\(\) => \{/, '')
  .replace(/\n\s*\}, \[mp\]\);$/, '');
const make = new Function('N', 'mp',
  grab(/const calcBen = r => \{[\s\S]*?\n  \};/, 'calcBen') + '\n' + body
);
const N = v => parseFloat(v) || 0;
const rows = mp => make(N, mp);

const r = (role, pax, days, shift) => ({role, pax, days, rate: 2500, shift: shift || 'regular_day'});

console.log('one shift: nothing changes:');
let g = rows([r('BALANCING SUPERVISOR', 2, 10)])[0];
ck('pax is the headcount', g.pax === 2);
ck('days is the duration', g.days === 10, g.days);
ck('and they multiply to the man-days charged', near(g.pax * g.days, g.manDays), g.manDays);

console.log('\nthe same role on four shifts, one day each -- the screenshot:');
g = rows([r('BALANCING SUPERVISOR', 1, 1, 'regular_day'), r('BALANCING SUPERVISOR', 1, 1, 'night'),
          r('BALANCING SUPERVISOR', 1, 1, 'sunday'), r('BALANCING SUPERVISOR', 1, 1, 'holiday')])[0];
ck('four people', g.pax === 4);
ck('one day each', g.days === 1, g.days);
ck('four man-days', near(g.manDays, 4));
ck('and nothing is flagged, because the shifts agree', g.daysVary === false);

console.log('\nshifts of different lengths -- the bug:');
g = rows([r('BALANCING SUPERVISOR', 2, 10, 'regular_day'), r('BALANCING SUPERVISOR', 1, 2, 'night')])[0];
ck('man-days are 2x10 + 1x2 = 22', near(g.manDays, 22), g.manDays);
ck('DAYS is no longer the longest shift', g.days !== 10, g.days);
/* To within the rounding of the printed figure: 22/3 is 7.33 recurring, so
   3 x 7.33 reads 21.99. The exact man-days are on the row as manDays and in
   the tooltip; what matters is that the two columns no longer describe 30. */
ck('QTY x DAYS is the man-days charged',
  Math.abs(g.pax * g.days - 22) <= g.pax * 0.005, g.pax + ' x ' + g.days);
ck('and the line says it is an average', g.daysVary === true);
ck('naming each shift and its length', g.shiftDays.length === 2 &&
  g.shiftDays[0].days === 10 && g.shiftDays[1].days === 2);

console.log('\nthe money is untouched by any of this:');
const one = rows([r('X', 2, 10, 'regular_day'), r('X', 1, 2, 'night')])[0];
const split = rows([r('X', 2, 10, 'regular_day')])[0].total + rows([r('X', 1, 2, 'night')])[0].total;
ck('a merged line totals exactly what the separate rows did', near(one.total, split), one.total + ' vs ' + split);
ck('and the monthly rate is still a rate, not a cost', near(one.monthlyRate, 2500 * 26), one.monthlyRate);

console.log('\nand the column says so on screen:');
ck('the average carries a marker', /g\.daysVary \? ' \*' : ''/.test(app));
ck('with the man-days and the shifts behind it',
  /man-days the benefits are charged on/.test(app) && /g\.shiftDays\.map/.test(app));
ck('rounded for the column, not for the arithmetic',
  /Math\.round\(g\.manDays \/ g\.pax \* 100\) \/ 100/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nbenefit days OK');
process.exit(bad ? 1 : 0);
