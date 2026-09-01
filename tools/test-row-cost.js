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

/* rowCost prices a tool through toolRowCost, which lives in helpers.js. The
   harness has to supply it, or it is testing an expression the app stopped
   using. ceResDays comes along because toolRowCost calls it. */
const helpersSrc = require('fs').readFileSync('src/helpers.js', 'utf8');
const NLC = String.fromCharCode(10);
const TIERS =
  helpersSrc.match(/function ceResDays\(r\) \{[\s\S]*?\n\}/)[0] + NLC +
  helpersSrc.match(/const TIER_HOURS_PER_YEAR[\s\S]*?\nfunction toolRowCost\(row, src\) \{[\s\S]*?\n\}/)[0];

const make = body => new Function('N', 'SHIFTS', 'sowItems', TIERS + NLC + body);

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

/* ── Consolidation ──────────────────────────────────────────────────────────
   One crew works across several scope tasks. If task 1 needs 1 electrician and
   task 2 needs 3, you mobilise 3 for the whole job and pay them for the whole
   duration: MAX of the pax, SUM of the days. That deliberately costs MORE than
   adding the per-task rows up, because the crew is on site and paid whether or
   not every task needs all of them. Consumables are the opposite -- they are
   used up, so quantities add and there are no days. */
console.log('\nthe crew rule: max pax, summed days:');
const conso = grab(/const key = r => \[String\(r\.role[\s\S]*?showToast\('Consolidated/, 'consolidate action');
check('pax takes the largest any task needs', /Math\.max\(\.\.\.g\.map\(r => N\(r\.pax\)\)\)/.test(conso),
  'summing the pax would invent people who were never mobilised');
check('days add up across the tasks', /g\.reduce\(\(a, r\) => a \+ N\(r\.days\), 0\)/.test(conso),
  'the crew is on site for both durations');
check('OT hrs/day and incentive carry the peak too', /otHours: Math\.max/.test(conso) && /perDiem: Math\.max/.test(conso),
  'they are per-day rates, so they follow the pax rule');
check('it says the cost will rise', /COSTS MORE than the rows added up/.test(src),
  'a consolidation that silently raises the CE would be a nasty surprise');
check('and shows the arithmetic before doing it', /pax x ' \+ N\(r\.days\) \+ 'd'/.test(conso));
check('the confirm is honoured', /\)\) return;/.test(conso));

console.log('\nconsumables add up instead:');
const res = require('fs').readFileSync(path2.join(__dirname, '..', 'src/components/ResTab.js'), 'utf8');
check('quantities are summed when there are no days',
  /showDays \? Math\.max\(\.\.\.g\.map\(r => N\(r\.qty\)\)\) : g\.reduce\(\(a, r\) => a \+ N\(r\.qty\), 0\)/.test(res),
  '5 L on one task and 8 on another means you buy 13');
check('equipment still uses max qty and summed days',
  /days: showDays \? g\.reduce\(\(a, r\) => a \+ rowDays\(r\), 0\) : undefined/.test(res));
check('and only equipment claims the cost rises', /the equipment is now charged for the whole duration/.test(res));
check('consumables say the total is unchanged', /Quantities are added together\. The total is unchanged\./.test(res));

/* A consolidated row is costed ONCE and split between the tasks that need it,
   in proportion to what each originally asked for. Without that split the
   breakdown would either lose the resource or double-count it. */
console.log('\na shared row is split, and the pieces add back up:');
const shareSrc = grab(/const _weight = \(key, r\)[\s\S]*?\n  \};\n/, 'share attribution');
const shareApi = new Function('N', 'rowCost', shareSrc + ' return { rowServesTask, rowCostForTask, _weight };')(N, () => 17000);
const shared = { id: 'x', role: 'ELECTRICIAN', shares: [{ taskId: 't1', weight: 2 }, { taskId: 't2', weight: 15 }] };
const s1 = shareApi.rowCostForTask('mp', shared, 't1'), s2 = shareApi.rowCostForTask('mp', shared, 't2');
check('task 1 carries the slice it asked for', Math.abs(s1 - 17000 * 2 / 17) < 0.01, s1);
check('task 2 carries the rest', Math.abs(s2 - 17000 * 15 / 17) < 0.01, s2);
check('the slices add back to the whole row', Math.abs(s1 + s2 - 17000) < 0.01, s1 + s2);
check('a task it does not serve gets nothing', shareApi.rowCostForTask('mp', shared, 't9') === 0);
check('the row is listed under every task it serves',
  shareApi.rowServesTask(shared, 't1') && shareApi.rowServesTask(shared, 't2') && !shareApi.rowServesTask(shared, 't9'));
check('an unshared row is unaffected',
  shareApi.rowCostForTask('mp', { taskId: 't1' }, 't1') === 17000 && shareApi.rowCostForTask('mp', { taskId: 't1' }, 't2') === 0);
/* Zero-weight shares must not divide by zero and silently drop the cost. */
const zero = { shares: [{ taskId: 'a', weight: 0 }, { taskId: 'b', weight: 0 }] };
check('zero weights split evenly rather than vanishing',
  Math.abs(shareApi.rowCostForTask('mp', zero, 'a') + shareApi.rowCostForTask('mp', zero, 'b') - 17000) < 0.01,
  shareApi.rowCostForTask('mp', zero, 'a'));

console.log('\nthe breakdown shows the share, not the whole row:');
check('the row cost cell uses the task slice', /ph\(rowCostForTask\(t\.key, r, taskId\)\)/.test(src),
  'showing the full row beside a subtotal of its slice reads as a contradiction');
check('the section subtotal does too', /rows\.reduce\(\(a, r\) => a \+ rowCostForTask\(t\.key, r, taskId\), 0\)/.test(src));
check('and a shared row says so', /shared crew across/.test(src));

/*
 * Statutory benefits ride on the BASIC wage.
 *
 * calcBen used to compute 13th-month pay, SSS, HDMF/PHIC and SIL/ECC from
 * `N(r.rate) * mult` -- the shift-adjusted rate. A night shift (x1.25) or a
 * holiday (x2) therefore inflated every contribution by the same premium, and
 * the inflated figure went into mpTot and out on the CE. Contributions scale
 * with the days worked, not with what those days pay.
 *
 * The premium still applies to the wage: mpSub and ceMpRowCost's `reg`/`ot`
 * keep their multiplier. Only the benefits base drops it.
 */
console.log('\nbenefits ride on the basic rate, not the shift premium:');
const ben = grab(/const calcBen = r => \{[\s\S]*?\n  \};/, 'calcBen');
check('the benefits base is the plain day rate', /rate = N\(r\.rate\);/.test(ben),
  'a night differential does not raise anyone’s SSS contribution');
check('and carries no shift multiplier at all', !/mult/.test(ben),
  'the premium belongs on the wage, which mpSub applies separately');
check('the wage still carries it', /N\(r\.pax\) \* N\(r\.days\) \* N\(r\.rate\) \* mult/.test(src),
  'dropping it there would underpay the shift itself');

const helpers = require('fs').readFileSync('src/helpers.js', 'utf8');
const rowCost = (helpers.match(/function ceMpRowCost\(r\) \{[\s\S]*?\n\}/) || [''])[0];
check('the recompute path agrees with the editor', /rate = N\(r\.rate\);/.test(rowCost),
  'a CE reopened later would total differently from the one that was saved');
check('and still pays the premium on the wage', /\* mult;/.test(rowCost) && /1\.25 \* mult;/.test(rowCost));

/* MONTHLY RATE is what ONE person earns in a 26-day month. It was being left
   multiplied by pax, so a P650/day helper at 2 pax read as P33,800 -- a cost,
   sitting in a column of rates. The pax weighting exists only so that a role
   hired at two different rates averages correctly while merging. */
check('the monthly rate is per person, not per crew', /monthlyRate: g\.pax \? g\.monthlyRate \/ g\.pax : 0/.test(src),
  'P650/day is P16,900 a month whether one person works it or five');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall cost/grouping assertions passed');
process.exit(fails ? 1 : 0);
