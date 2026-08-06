/*
 * Exercises rowCost / sowTaskGroup lifted straight out of src/App.js.
 * rowCost drives the per-task subtotals shown in the SOW Breakdown, so it must
 * agree with the formulas that produce the section totals, and it must actually
 * use `days` (the original defect was that days was not editable/counted).
 */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

const grab = (re, what) => { const m = src.match(re); if (!m) { console.error('not found in source: ' + what); process.exit(1); } return m[0]; };

const resDaysSrc = grab(/const resDays = r => [^\n]*;/, 'resDays');
const calcBenSrc = grab(/const calcBen = r => \{[\s\S]*?\n  \};/, 'calcBen');
const rowCostSrc = grab(/const rowCost = \(kind, r\) => \{[\s\S]*?\n  \};/, 'rowCost');
const groupSrc   = grab(/const sowTaskGroup = item => \{[\s\S]*?\n  \};/, 'sowTaskGroup');

const N = v => parseFloat(v) || 0;
const SHIFTS = { regular_day: { mult: 1 }, night: { mult: 1.25 }, sunday: { mult: 1.3 } };

const make = body => new Function('N', 'SHIFTS', 'sowItems', body);

const api = make(`
  ${resDaysSrc}
  ${calcBenSrc}
  ${rowCostSrc}
  ${groupSrc}
  return { rowCost, sowTaskGroup, calcBen, resDays };
`)(N, SHIFTS, []);

let fails = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

console.log('rowCost (non-manpower = qty x unit cost):');
check('tools 4 x 850 = 3400 (no days set)', api.rowCost('tools', { qty: 4, cost: 850 }) === 3400, api.rowCost('tools', { qty: 4, cost: 850 }));
check('consumables 0.5 x 420 = 210', api.rowCost('mats', { qty: 0.5, cost: 420 }) === 210, api.rowCost('mats', { qty: 0.5, cost: 420 }));
check('ppe 5 x 85 = 425', api.rowCost('ppe', { qty: 5, cost: 85 }) === 425, api.rowCost('ppe', { qty: 5, cost: 85 }));
check('misc 1 x 18000 = 18000', api.rowCost('misc', { qty: 1, cost: 18000 }) === 18000, api.rowCost('misc', { qty: 1, cost: 18000 }));
check('blank row costs 0', api.rowCost('tools', { qty: 0, cost: 0 }) === 0);
check('missing fields do not produce NaN', Number.isFinite(api.rowCost('tools', {})), api.rowCost('tools', {}));

console.log('\ntools charged per day (qty x days x cost), days optional:');
/* Equipment like a crane is rented per day. `days` is optional and must default
   to 1 so every CE saved before this existed keeps its exact total. */
check('days undefined behaves as 1', api.resDays({}) === 1, api.resDays({}));
check('days null behaves as 1', api.resDays({ days: null }) === 1, api.resDays({ days: null }));
check('cleared field ("") behaves as 1, not 0', api.resDays({ days: '' }) === 1, api.resDays({ days: '' }));
check('days "10" (string from an input) reads as 10', api.resDays({ days: '10' }) === 10, api.resDays({ days: '10' }));
check('explicit days 0 is respected', api.resDays({ days: 0 }) === 0, api.resDays({ days: 0 }));
check('crane 1 x 10 days x 8000 = 80000', api.rowCost('tools', { qty: 1, days: 10, cost: 8000 }) === 80000, api.rowCost('tools', { qty: 1, days: 10, cost: 8000 }));
check('chain block 4 x 1 day x 850 = 3400', api.rowCost('tools', { qty: 4, days: 1, cost: 850 }) === 3400, api.rowCost('tools', { qty: 4, days: 1, cost: 850 }));
check('legacy tools row (no days) is unchanged at qty x cost',
  api.rowCost('tools', { qty: 4, cost: 850 }) === api.rowCost('tools', { qty: 4, days: 1, cost: 850 }));
check('days does NOT affect consumables', api.rowCost('mats', { qty: 2, days: 10, cost: 100 }) === 200, api.rowCost('mats', { qty: 2, days: 10, cost: 100 }));
check('days does NOT affect PPE', api.rowCost('ppe', { qty: 2, days: 10, cost: 100 }) === 200, api.rowCost('ppe', { qty: 2, days: 10, cost: 100 }));

console.log('\nrowCost (manpower):');
/* A role is required: a row with no role is an unfilled blank and costs 0. */
const base = { role: 'BALANCING SUPERVISOR', pax: 2, days: 3, rate: 1000, shift: 'regular_day', otHours: 0, perDiem: 0 };
const c1 = api.rowCost('mp', base);
const cMoreDays = api.rowCost('mp', { ...base, days: 6 });
const cMoreRate = api.rowCost('mp', { ...base, rate: 2000 });
const cMorePax = api.rowCost('mp', { ...base, pax: 4 });
const cOt = api.rowCost('mp', { ...base, otHours: 8 });
const cNight = api.rowCost('mp', { ...base, shift: 'night' });
check('includes base regular pay (>= pax*days*rate)', c1 >= 6000, c1);
check('DAYS affects cost (the original defect)', cMoreDays > c1, c1 + ' -> ' + cMoreDays);
check('doubling days roughly doubles cost', Math.abs(cMoreDays - 2 * c1) / c1 < 0.15, c1 + ' -> ' + cMoreDays);
check('RATE affects cost', cMoreRate > c1, c1 + ' -> ' + cMoreRate);
check('PAX affects cost', cMorePax > c1, c1 + ' -> ' + cMorePax);
check('overtime hours add cost', cOt > c1, c1 + ' -> ' + cOt);
check('night shift multiplier applies', cNight > c1, c1 + ' -> ' + cNight);
check('zero pax costs nothing', api.rowCost('mp', { ...base, pax: 0 }) === 0, api.rowCost('mp', { ...base, pax: 0 }));
check('no NaN on empty manpower row', Number.isFinite(api.rowCost('mp', {})), api.rowCost('mp', {}));

/* OT hours are entered PER DAY, matching the OT HRS column on the company's own
   manpower sheet. They used to be treated as a total for the whole engagement,
   so "3" on a ten-day job charged three hours, not thirty, and every CE with
   overtime was undercharged by a factor of the day count. */
console.log('\novertime is per day, not per engagement:');
const ot3 = { ...base, pax: 1, days: 1, rate: 800, otHours: 3 };
const otCost = d => api.rowCost('mp', { ...ot3, days: d }) - api.rowCost('mp', { ...ot3, days: d, otHours: 0 });
const ot1d = otCost(1), ot10d = otCost(10);
/* 1 pax x 3 hrs x (800/8) x 1.25 = 375 for one day. */
check('one day of 3 OT hours costs 375', Math.abs(ot1d - 375) < 0.01, ot1d);
check('ten days of the same 3 hrs costs ten times that', Math.abs(ot10d - 3750) < 0.01, ot10d);
check('OT scales with the day count', Math.abs(ot10d - 10 * ot1d) < 0.01, ot1d + ' -> ' + ot10d);
check('OT still scales with pax', Math.abs(otCost(1) * 2 - (api.rowCost('mp', { ...ot3, pax: 2 }) - api.rowCost('mp', { ...ot3, pax: 2, otHours: 0 }))) < 0.01);
check('no OT hours costs no OT', otCost(5) > 0 && api.rowCost('mp', { ...ot3, days: 5, otHours: 0 }) > 0);
/* The shift multiplier applies to overtime as well as regular pay. */
const otNight = api.rowCost('mp', { ...ot3, shift: 'night' }) - api.rowCost('mp', { ...ot3, shift: 'night', otHours: 0 });
check('the shift multiplier still applies to OT', Math.abs(otNight - 375 * 1.25) < 0.01, otNight);

/* Overtime is costed in seven places -- the editor, the SOW breakdown, the
   grand total, the CE comparison, the printed CE, the Excel export and the row
   badge. Any one of them left on the old meaning would disagree with the other
   six, and the disagreement would only show up as a number nobody could
   reconcile. Every OT expression must carry a day factor. */
console.log('\nevery OT formula in the codebase agrees:');
const path2 = require('path');
const otSites = [];
/* `src` is the file this suite was handed on the command line -- reading
   src/App.js by name here would test the repo instead of the argument, and a
   mutation test would silently pass. */
const sources = [['(source under test)', src],
                 ['src/helpers.js', require('fs').readFileSync(path2.join(__dirname, '..', 'src/helpers.js'), 'utf8')]];
for (const [f, text] of sources) {
  for (const line of text.split('\n')) {
    if (!/otHours/.test(line) || !/1\.25/.test(line)) continue;
    /* Split a line that costs several rows into its individual OT terms. */
    for (const term of line.match(/[^;{}]*otHours[^;{}]*?1\.25[^;{}]*/g) || [])
      otSites.push({ f, term: term.trim() });
  }
}
check('found every OT cost site', otSites.length >= 7, otSites.length);
for (const s of otSites)
  check(s.f + ': ' + s.term.slice(-58), /days/.test(s.term),
    'this one still treats OT as a total for the whole engagement');

console.log('\nblank starter row must be free (calcBen SIL adds pax*30):');
/* mkMP() defaults pax:1, days:1, rate:0 -- with no role this is an empty row the
   user has not filled in. It previously cost P30, so every new CE opened showing
   "Manpower P30.00" and a P30 Grand Total. */
const blank = { role: '', pax: 1, days: 1, rate: 0, shift: 'regular_day', otHours: 0, perDiem: 0 };
check('blank manpower row costs 0, not 30', api.rowCost('mp', blank) === 0, api.rowCost('mp', blank));
check('raw calcBen on that row really does charge 30 (so the guard is required)',
  api.calcBen(blank).total === 30, api.calcBen(blank).total);
check('a named row still gets its benefits on top of pay',
  api.rowCost('mp', { ...blank, role: 'ELECTRICIAN', rate: 850 }) > 850,
  api.rowCost('mp', { ...blank, role: 'ELECTRICIAN', rate: 850 }));
check('named row with no rate still carries the 30 SIL floor',
  api.rowCost('mp', { ...blank, role: 'ELECTRICIAN' }) === 30,
  api.rowCost('mp', { ...blank, role: 'ELECTRICIAN' }));

console.log('\nsowTaskGroup (deleting a main task takes its sub-tasks):');
const list = [
  { id: 'a', type: 'main' }, { id: 'a1', type: 'sub' }, { id: 'a2', type: 'sub' },
  { id: 'b', type: 'main' }, { id: 'b1', type: 'sub' },
  { id: 'c', type: 'main' },
];
const g = make(`${groupSrc} return sowTaskGroup;`)(N, SHIFTS, list);
check('main "a" takes a1 + a2', JSON.stringify(g({ id: 'a', type: 'main' })) === '["a","a1","a2"]', JSON.stringify(g({ id: 'a', type: 'main' })));
check('stops at the next main', !g({ id: 'a', type: 'main' }).includes('b'));
check('main "b" takes only b1', JSON.stringify(g({ id: 'b', type: 'main' })) === '["b","b1"]', JSON.stringify(g({ id: 'b', type: 'main' })));
check('main with no subs returns itself', JSON.stringify(g({ id: 'c', type: 'main' })) === '["c"]', JSON.stringify(g({ id: 'c', type: 'main' })));
check('deleting a sub does not touch siblings', JSON.stringify(g({ id: 'a1', type: 'sub' })) === '["a1"]', JSON.stringify(g({ id: 'a1', type: 'sub' })));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall cost/grouping assertions passed');
process.exit(fails ? 1 : 0);
