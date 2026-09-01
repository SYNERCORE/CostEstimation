/*
 * computeCEGrand() in src/helpers.js recomputes a saved CE's total for the Admin
 * recompute tool. It duplicates the editor's formulas, so the real risk is
 * drift: the tool "correcting" totals to something the editor would never
 * produce. This loads BOTH the helper and the editor's own rowCost out of source
 * and asserts they agree on the same CE.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const helpersSrc = fs.readFileSync(path.join(root, 'src', 'helpers.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(root, 'src', 'App.js'), 'utf8');

const grab = (src, re, what) => { const m = src.match(re); if (!m) { console.error('not found: ' + what); process.exit(1); } return m[0]; };

const N = v => parseFloat(v) || 0;
const SHIFTS = { regular_day: { mult: 1 }, night: { mult: 1.25 }, sunday: { mult: 1.3 } };
const CE_CFG = { onsite: { mobDemob: true }, shopworks: { mobDemob: false }, supply: { mobDemob: false } };

/* --- the helper under test --- */
/* Tool tiers live in helpers.js too, and both the editor's rowCost and
   computeCEGrand now go through toolRowCost -- so both harnesses below have to
   be given it, or they are testing something the app does not run. */
const TIERS = grab(helpersSrc, /const TIER_HOURS_PER_YEAR[\s\S]*?\nfunction toolRowCost\(row, src\) \{[\s\S]*?\n\}/, 'tool tiers');
const helper = new Function('N', 'SHIFTS', 'CE_CFG',
  grab(helpersSrc, /function ceResDays\(r\) \{[\s\S]*?\n\}/, 'ceResDays') + '\n' + TIERS + '\n' +
  grab(helpersSrc, /function ceMpRowCost\(r\) \{[\s\S]*?\n\}/, 'ceMpRowCost') + '\n' +
  grab(helpersSrc, /function computeCEGrand\(ce\) \{[\s\S]*?\n\}/, 'computeCEGrand') + '\n' +
  'return { computeCEGrand, ceResDays, ceMpRowCost };'
)(N, SHIFTS, CE_CFG);

/* --- the editor's own per-row cost, for cross-checking --- */
const editor = new Function('N', 'SHIFTS',
  grab(helpersSrc, /function ceResDays\(r\) \{[\s\S]*?\n\}/, 'ceResDays') + '\n' + TIERS + '\n' +
  grab(appSrc, /const resDays = r => [^\n]*;/, 'resDays') + '\n' +
  grab(appSrc, /const calcBen = r => \{[\s\S]*?\n  \};/, 'calcBen') + '\n' +
  grab(appSrc, /const rowCost = \(kind, r\) => \{[\s\S]*?\n  \};/, 'rowCost') + '\n' +
  'return { rowCost, resDays };'
)(N, SHIFTS);

let fails = 0;
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};
const near = (a, b) => Math.abs(a - b) < 0.000001;

/* A representative onsite CE. */
const ce = {
  ceType: 'onsite',
  mp: [
    { role: 'BALANCING SUPERVISOR', pax: 1, days: 10, rate: 1200, shift: 'regular_day', otHours: 4, perDiem: 500 },
    { role: 'TRADE ASSISTANT', pax: 2, days: 10, rate: 650, shift: 'night', otHours: 0, perDiem: 300 },
    { role: '', pax: 1, days: 1, rate: 0, shift: 'regular_day' },            // blank starter row
  ],
  tools: [
    { desc: 'OVERHEAD CRANE 40T', qty: 1, days: 10, cost: 8000 },
    { desc: 'CHAIN BLOCK 1T', qty: 4, cost: 850 },                           // legacy, no days
  ],
  mats: [{ desc: 'BLUESHEET', qty: 0.5, cost: 420 }],
  ppe: [{ desc: 'COTTON HAND GLOVES', qty: 5, cost: 85 }],
  misc: {
    transportation: [{ desc: 'TRUCK 10-WHEELER', qty: 1, cost: 18000 }],
    _addlCosts: [{ label: 'DELIVERY', amount: 70000 }],                      // must be ignored
    _margin: 15,
  },
  mobVehicles: [{ desc: 'SERVICE VAN', qty: 1, days: 2, rate: 3500 }],
  demobVehicles: [{ desc: 'SERVICE VAN', qty: 1, days: 2, rate: 3500 }],
};

/* Independent expectation built from the editor's own rowCost. */
const expected =
  ce.mp.reduce((s, r) => s + editor.rowCost('mp', r), 0) +
  ce.tools.reduce((s, r) => s + editor.rowCost('tools', r), 0) +
  ce.mats.reduce((s, r) => s + editor.rowCost('mats', r), 0) +
  ce.ppe.reduce((s, r) => s + editor.rowCost('ppe', r), 0) +
  ce.misc.transportation.reduce((s, r) => s + editor.rowCost('misc', r), 0) +
  (1 * 2 * 3500) + (1 * 2 * 3500);

const got = helper.computeCEGrand(ce);

console.log('computeCEGrand agrees with the editor:');
check('total matches the editor row-by-row', near(got, expected), got + ' vs ' + expected);
check('total is a finite number', Number.isFinite(got), got);
check('_addlCosts / _margin are excluded from misc',
  !near(got, expected + 70000) && !near(got, expected + 15), got);

console.log('\nedge cases:');
check('empty CE totals 0', helper.computeCEGrand({ ceType: 'onsite' }) === 0);
check('null CE totals 0', helper.computeCEGrand(null) === 0);
check('a CE of only blank manpower rows totals 0 (not P30 each)',
  helper.computeCEGrand({ ceType: 'onsite', mp: [{ role: '', pax: 1, days: 1, rate: 0 }, { role: '', pax: 1, days: 1, rate: 0 }] }) === 0);
check('shopworks ignores mob/demob vehicles',
  helper.computeCEGrand({ ceType: 'shopworks', mobVehicles: [{ qty: 1, days: 5, rate: 1000 }] }) === 0);
check('onsite counts mob/demob vehicles',
  helper.computeCEGrand({ ceType: 'onsite', mobVehicles: [{ qty: 1, days: 5, rate: 1000 }] }) === 5000);
check('unknown ceType does not count mob/demob',
  helper.computeCEGrand({ ceType: 'nonsense', mobVehicles: [{ qty: 1, days: 5, rate: 1000 }] }) === 0);
check('missing arrays do not throw',
  Number.isFinite(helper.computeCEGrand({ ceType: 'onsite', mp: null, tools: undefined, misc: null })));

console.log('\nthe P30 inflation this tool exists to remove:');
const inflated = { ceType: 'onsite', mp: [{ role: 'ELECTRICIAN', pax: 1, days: 1, rate: 850 }, { role: '', pax: 1, days: 1, rate: 0 }] };
const clean = { ceType: 'onsite', mp: [{ role: 'ELECTRICIAN', pax: 1, days: 1, rate: 850 }] };
check('a blank row adds nothing to the recomputed total',
  near(helper.computeCEGrand(inflated), helper.computeCEGrand(clean)),
  helper.computeCEGrand(inflated) + ' vs ' + helper.computeCEGrand(clean));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall recompute assertions passed');
process.exit(fails ? 1 : 0);
