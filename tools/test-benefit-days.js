#!/usr/bin/env node
/*
 * The QTY and DAYS printed on a Benefits & Others line have to describe the
 * people and the time the money beside them was charged for.
 *
 * C.7 merges a role across every shift it works -- one line per hire, not one
 * per shift row. A shift row is a day TYPE, not a different person: one
 * electrical supervisor who works a regular day, a Sunday and a holiday is
 * three rows and one man. The merge got both columns wrong:
 *
 *   QTY  summed the pax across shifts, so that supervisor printed "3 pax".
 *   DAYS took the LONGEST shift, so 2 pax x 10 days plus 1 pax x 2 days
 *        printed "10 days" -- 30 man-days beside benefits covering 22.
 *
 * Together they read as three people on a single day. Nothing was mischarged
 * -- each shift row is still costed on its own by calcBen -- but the line did
 * not add up to itself, on a page somebody signs.
 *
 * QTY is now the most of that role on site at any ONE shift, and DAYS the
 * man-days divided back out by it, so QTY x DAYS is what the benefits were
 * computed over.
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
ck('no roll-up marker, because there is one shift', g.daysVary === false);

console.log('\none supervisor across four day types is ONE supervisor:');
g = rows([r('ELECTRICAL SUPERVISOR', 1, 1, 'regular_day'), r('ELECTRICAL SUPERVISOR', 1, 1, 'night'),
          r('ELECTRICAL SUPERVISOR', 1, 1, 'sunday'), r('ELECTRICAL SUPERVISOR', 1, 1, 'holiday')])[0];
ck('one person, not four', g.pax === 1, g.pax + ' -- a shift row is a day type, not a second hire');
ck('working four days, not one', g.days === 4, g.days);
ck('four man-days', near(g.manDays, 4));
ck('and the line is marked as a roll-up of four shifts', g.daysVary === true);

console.log('\nshifts of different lengths:');
g = rows([r('BALANCING SUPERVISOR', 2, 10, 'regular_day'), r('BALANCING SUPERVISOR', 1, 2, 'night')])[0];
ck('man-days are 2x10 + 1x2 = 22', near(g.manDays, 22), g.manDays);
ck('QTY is the most on site at once, not the sum', g.pax === 2, g.pax);
ck('DAYS is no longer the longest shift', g.days !== 10, g.days);
/* To within the rounding of the printed figure: 22/2 is exact here, but a
   role that does not divide evenly shows two decimals. manDays holds the
   exact figure, and the tooltip prints it. */
ck('QTY x DAYS is the man-days charged',
  Math.abs(g.pax * g.days - 22) <= g.pax * 0.005, g.pax + ' x ' + g.days);
ck('the line is flagged', g.daysVary === true);
ck('naming each shift and its length', g.shiftDays.length === 2 &&
  g.shiftDays[0].days === 10 && g.shiftDays[1].days === 2);

console.log('\nthe money is untouched by any of this:');
const one = rows([r('X', 2, 10, 'regular_day'), r('X', 1, 2, 'night')])[0];
const split = rows([r('X', 2, 10, 'regular_day')])[0].total + rows([r('X', 1, 2, 'night')])[0].total;
ck('a merged line totals exactly what the separate rows did', near(one.total, split), one.total + ' vs ' + split);
ck('and the monthly rate is still a rate, not a cost', near(one.monthlyRate, 2500 * 26), one.monthlyRate);
ck('weighted by the pax it was accumulated with, not by the headcount',
  /monthlyRate: g\.paxSum \? g\.monthlyRate \/ g\.paxSum : 0/.test(app),
  'dividing a pax-weighted sum by the peak headcount would inflate the rate');

console.log('\nand the column says so on screen:');
ck('a rolled-up line carries a marker', /g\.daysVary \? ' \*' : ''/.test(app));
ck('with the man-days and the shifts behind it',
  /man-days the benefits are charged on/.test(app) && /g\.shiftDays\.map/.test(app));
ck('and says what QTY means on such a line',
  /QTY is the most of this role on site at once/.test(app));
ck('rounded for the column, not for the arithmetic',
  /Math\.round\(g\.manDays \/ g\.pax \* 100\) \/ 100/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nbenefit days OK');
process.exit(bad ? 1 : 0);
