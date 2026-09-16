#!/usr/bin/env node
/*
 * The QTY and DAYS printed on a Benefits & Others line have to describe the
 * people and the time the money beside them was charged for.
 *
 * C.7 merges a role across every shift it works -- one line per hire, not one
 * per shift row. Two things were wrong with the merge:
 *
 *   QTY  summed the pax across every shift, so one electrical supervisor
 *        working a regular day, a Sunday and a holiday printed "3 pax".
 *   DAYS took the LONGEST shift, so 2 pax x 10 days plus 1 pax x 2 days
 *        printed "10 days" -- 30 man-days beside benefits covering 22.
 *
 * Together they read as three people on a single day. Nothing was mischarged
 * -- each shift row is still costed on its own by calcBen -- but the line did
 * not add up to itself, on a page somebody signs.
 *
 * The rule the estimators actually work to:
 *   - the same person works the regular DAYS, the Sunday days and the holiday
 *     days, so those do not add;
 *   - nobody works a day shift and that same night, so day crew and night crew
 *     DO add.
 * QTY is therefore the biggest day crew plus the biggest night crew, and DAYS
 * is the man-days divided back out by it.
 *
 * Each shift is also listed under the role, which subtotals them, so neither
 * column has to stand for several day types at once.
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

/* The real shift keys -- regular_day, regular_night, sunday_day,
   sunday_night, holiday_day, holiday_night. The _night suffix is what
   separates the two crews, so a made-up key would test nothing. */
const r = (role, pax, days, shift) => ({role, pax, days, rate: 2500, shift: shift || 'regular_day'});

console.log('one shift: nothing changes:');
let g = rows([r('BALANCING SUPERVISOR', 2, 10)])[0];
ck('pax is the headcount', g.pax === 2);
ck('days is the duration', g.days === 10, g.days);
ck('and they multiply to the man-days charged', near(g.pax * g.days, g.manDays), g.manDays);
ck('no roll-up marker, because there is one shift', g.daysVary === false);

console.log('\none supervisor across three DAY types is ONE supervisor:');
g = rows([r('ELECTRICAL SUPERVISOR', 1, 1, 'regular_day'), r('ELECTRICAL SUPERVISOR', 1, 1, 'sunday_day'),
          r('ELECTRICAL SUPERVISOR', 1, 1, 'holiday_day')])[0];
ck('one person, not three', g.pax === 1, g.pax + ' -- the same man works the regular, Sunday and holiday days');
ck('working three days, not one', g.days === 3, g.days);
ck('three man-days', near(g.manDays, 3));
ck('and the line is marked as a roll-up', g.daysVary === true);

console.log('\nbut day and night are different people:');
g = rows([r('ELECTRICAL SUPERVISOR', 1, 1, 'regular_day'), r('ELECTRICAL SUPERVISOR', 1, 1, 'regular_night')])[0];
ck('one on days plus one on nights is two supervisors', g.pax === 2,
  g.pax + ' -- nobody works a day shift and that same night');
ck('counted separately', g.paxDay === 1 && g.paxNight === 1);
ck('one day each', g.days === 1, g.days);
ck('two man-days', near(g.manDays, 2));

console.log('\nand a night crew is not doubled by its own day types either:');
g = rows([r('WELDER', 1, 5, 'regular_night'), r('WELDER', 1, 2, 'sunday_night')])[0];
ck('still one night welder', g.pax === 1, g.pax);
ck('seven man-days', near(g.manDays, 7), g.manDays);

console.log('\nthe two rules compose:');
g = rows([r('WELDER', 2, 10, 'regular_day'), r('WELDER', 2, 4, 'sunday_day'),
          r('WELDER', 1, 10, 'regular_night')])[0];
ck('two on days plus one on nights', g.pax === 3, g.pax);
ck('the day crew is not doubled by working Sundays too', g.paxDay === 2, g.paxDay);
ck('man-days are 2x10 + 2x4 + 1x10 = 38', near(g.manDays, 38), g.manDays);
ck('QTY x DAYS is those man-days',
  Math.abs(g.pax * g.days - 38) <= g.pax * 0.005, g.pax + ' x ' + g.days);

console.log('\nshifts of different lengths within one crew:');
g = rows([r('BALANCING SUPERVISOR', 2, 10, 'regular_day'), r('BALANCING SUPERVISOR', 1, 2, 'sunday_day')])[0];
ck('man-days are 2x10 + 1x2 = 22', near(g.manDays, 22), g.manDays);
ck('QTY is the most on any one day shift, not the sum', g.pax === 2, g.pax);
ck('DAYS is no longer the longest shift', g.days !== 10, g.days);
/* To within the rounding of the printed figure. manDays holds the exact one,
   and the tooltip prints it. */
ck('QTY x DAYS is the man-days charged',
  Math.abs(g.pax * g.days - 22) <= g.pax * 0.005, g.pax + ' x ' + g.days);
ck('the line is flagged', g.daysVary === true);
ck('naming each shift and its length', g.shiftDays.length === 2 &&
  g.shiftDays[0].days === 10 && g.shiftDays[1].days === 2);

console.log('\nthe money is untouched by any of this:');
const one = rows([r('X', 2, 10, 'regular_day'), r('X', 1, 2, 'regular_night')])[0];
const split = rows([r('X', 2, 10, 'regular_day')])[0].total + rows([r('X', 1, 2, 'regular_night')])[0].total;
ck('a merged line totals exactly what the separate rows did', near(one.total, split), one.total + ' vs ' + split);
ck('and the monthly rate is still a rate, not a cost', near(one.monthlyRate, 2500 * 26), one.monthlyRate);
ck('weighted by the pax it was accumulated with, not by the headcount',
  /monthlyRate: g\.paxSum \? g\.monthlyRate \/ g\.paxSum : 0/.test(app),
  'dividing a pax-weighted sum by the crew size would inflate the rate');

console.log('\neach shift is shown under the role that subtotals them:');
g = rows([r('ELECTRICAL SUPERVISOR', 1, 1, 'regular_day'), r('ELECTRICAL SUPERVISOR', 1, 1, 'sunday_day'),
          r('ELECTRICAL SUPERVISOR', 1, 1, 'holiday_day')])[0];
ck('one entry per shift row', g.shiftDays.length === 3);
ck('each carries its own benefits', g.shiftDays.every(x => x.total > 0 && x.sil > 0));
ck('and they add up to the role line', near(g.shiftDays.reduce((t, x) => t + x.total, 0), g.total),
  'a subtotal that does not total its own children is worse than no subtotal');
ck('each carries its own monthly rate, per person', g.shiftDays.every(x => near(x.monthlyRate, 2500 * 26)));
ck('the role line is drawn as a subtotal over them', /subtotal of " \+ kids\.length \+ " shift entries/.test(app));
ck('the children are indented under it', /paddingLeft: 22/.test(app));
ck('and only when there is more than one shift to break out',
  /\(g\.shiftDays \|\| \[\]\)\.length > 1 \? g\.shiftDays\.map/.test(app),
  'a role on one shift is already its own line; repeating it underneath says nothing');
ck('a split crew says which half is which on the line',
  /g\.paxDay \+ " day \+ " \+ g\.paxNight \+ " night"/.test(app));
ck('and the DAYS tooltip explains the count',
  /on days \+ '/.test(app) && /on nights/.test(app));

console.log('\nthe flat ECC is visible where it is charged:');
/* P30 per person is added to SIL on EVERY shift entry, so a role on three day
   types carries P90 for one man. Whether that is right is a costing decision,
   not this file's -- what this file insists on is that it is not invisible. */
ck('each shift entry carries its own P30',
  near(g.shiftDays[0].sil - 2500 * 5 / 12 / 26, 30), g.shiftDays[0].sil);
ck('so three day types carry P90 for one man',
  near(g.sil - (3 * 2500 * 5 / 12 / 26), 90), g.sil);
ck('and the line says so rather than burying it',
  /P30 per person, charged once on each shift entry/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nbenefit days OK');
process.exit(bad ? 1 : 0);
