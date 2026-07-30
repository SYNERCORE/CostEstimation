/*
 * Exercises rowCost / sowTaskGroup lifted straight out of src/App.js.
 * rowCost drives the per-task subtotals shown in the SOW Breakdown, so it must
 * agree with the formulas that produce the section totals, and it must actually
 * use `days` (the original defect was that days was not editable/counted).
 */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

const grab = (re, what) => { const m = src.match(re); if (!m) { console.error('not found in source: ' + what); process.exit(1); } return m[0]; };

const calcBenSrc = grab(/const calcBen = r => \{[\s\S]*?\n  \};/, 'calcBen');
const rowCostSrc = grab(/const rowCost = \(kind, r\) => \{[\s\S]*?\n  \};/, 'rowCost');
const groupSrc   = grab(/const sowTaskGroup = item => \{[\s\S]*?\n  \};/, 'sowTaskGroup');

const N = v => parseFloat(v) || 0;
const SHIFTS = { regular_day: { mult: 1 }, night: { mult: 1.25 }, sunday: { mult: 1.3 } };

const make = body => new Function('N', 'SHIFTS', 'sowItems', body);

const api = make(`
  ${calcBenSrc}
  ${rowCostSrc}
  ${groupSrc}
  return { rowCost, sowTaskGroup, calcBen };
`)(N, SHIFTS, []);

let fails = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

console.log('rowCost (non-manpower = qty x unit cost):');
check('tools 4 x 850 = 3400', api.rowCost('tools', { qty: 4, cost: 850 }) === 3400, api.rowCost('tools', { qty: 4, cost: 850 }));
check('consumables 0.5 x 420 = 210', api.rowCost('mats', { qty: 0.5, cost: 420 }) === 210, api.rowCost('mats', { qty: 0.5, cost: 420 }));
check('ppe 5 x 85 = 425', api.rowCost('ppe', { qty: 5, cost: 85 }) === 425, api.rowCost('ppe', { qty: 5, cost: 85 }));
check('misc 1 x 18000 = 18000', api.rowCost('misc', { qty: 1, cost: 18000 }) === 18000, api.rowCost('misc', { qty: 1, cost: 18000 }));
check('blank row costs 0', api.rowCost('tools', { qty: 0, cost: 0 }) === 0);
check('missing fields do not produce NaN', Number.isFinite(api.rowCost('tools', {})), api.rowCost('tools', {}));

console.log('\nrowCost (manpower):');
const base = { pax: 2, days: 3, rate: 1000, shift: 'regular_day', otHours: 0, perDiem: 0 };
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
