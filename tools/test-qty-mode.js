/* A quantity that divides, and a quantity that multiplies.
   =======================================================
   A CE has always been costed for the whole job, and the unit price was that
   total divided by the count. Costing a repeated item that way means working
   out the job figures before you know them. So a CE can now hold the cost of
   ONE of them and be multiplied by the count instead.

   Two things make this safe to ship.

   The FIRST is that divide mode must not move by a centavo. Every CE ever
   saved is in it, none of them names a mode, and an absent mode is divide --
   so the multipliers are all 1 and every expression reduces to the one it
   replaced. A change to a stored total is a change to a quoted price.

   The SECOND is that the sections have to add up. The printed CE lists each
   section's cost and the client reads down the column to the total, so the
   multiplied sections must sum to the multiplied total -- reached two
   different ways, which is exactly why it is worth asserting:
     section by section:  mob*x + mp*q + tools*q + ... + (misc-exempt)*q + exempt
     as a whole:          exempt + (tabs - exempt) * q

   Run: node tools/test-qty-mode.js */
'use strict';
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = require('./lib/appsrc').plus(R('src/App.js'));
const helpers = R('src/helpers.js');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const NL = String.fromCharCode(10);
const near = (a, b) => Math.abs(a - b) < 0.005;

/* The shipped expressions, lifted whole and run. Nothing is retyped here:
   a copy of the maths would only prove the copy right. */
const src = app.slice(app.indexOf('  const _mobTabs = cfg.mobDemob'), app.indexOf('  /* The unit the quantity is counted in'));
const MISC_DEF = { onsite: [['consumables', 'D.1 Consumables'], ['permits', 'D.2 Permits'], ['meals', 'D.3 Meals']] };

const run = o => new Function(
  'cfg', 'mobSubT', 'demobSubT', 'mpTot', 'toolsT', 'matsT', 'ppeT', 'miscT',
  'misc', 'info', 'ceType', 'MISC_DEF', 'miscRowCost', 'N',
  src + NL + 'return { tabsT, grand, unitP, perJobT, perJobLines, qF, qFx, mobT, mobSubTX, demobSubTX, mpTotX, toolsTX, matsTX, ppeTX, miscTX };'
)(
  { mobDemob: true }, o.mob, o.demob, o.mp, o.tools, o.mats, o.ppe,
  Object.keys(o.misc).reduce((t, k) => t + o.misc[k], 0),
  Object.keys(o.misc).reduce((m, k) => { m[k] = [{ cost: o.misc[k] }]; return m; }, {}),
  o.info, 'onsite', MISC_DEF, r => Number(r.cost) || 0,
  v => (v === '' || v == null || isNaN(parseFloat(v))) ? 0 : parseFloat(v)
);

/* One unit: 45,000 manpower + 8,200 tools + 12,500 materials + 3,000 PPE,
   1,500 of consumables, and a 25,000 mobilisation that is the same whether
   you do one of them or five. */
const CE = {
  mob: 15000, demob: 10000, mp: 45000, tools: 8200, mats: 12500, ppe: 3000,
  misc: { consumables: 1500, permits: 0, meals: 0 }
};
const TABS = 15000 + 10000 + 45000 + 8200 + 12500 + 3000 + 1500;   /* 95,700 */

console.log('divide mode, which is every CE that exists:');
let r = run({ ...CE, info: { qty: 3, perJob: ['mobdemob'] } });
ck('the total is the sum of the tabs, untouched', near(r.grand, TABS), r.grand);
ck('the exempt cost is recognised', near(r.perJobT, 25000), r.perJobT);
ck('and the unit price is the rest, divided',
  near(r.unitP, (TABS - 25000) / 3), r.unitP);
ck('every multiplier is one', r.qF === 1 && r.qFx('mobdemob') === 1 && r.qFx('permits') === 1);
/* The absent mode is the one that matters: no saved CE names it. */
r = run({ ...CE, info: { qty: 3 } });
ck('a CE that names no mode at all divides', near(r.grand, TABS), r.grand);
r = run({ ...CE, info: { qty: 3, qtyMode: 'divide' } });
ck('and so does one that says so', near(r.grand, TABS), r.grand);

console.log(NL + 'multiply mode:');
r = run({ ...CE, info: { qty: 3, qtyMode: 'multiply', perJob: ['mobdemob'] } });
/* 25,000 once + (95,700 - 25,000) x 3 */
ck('the job is the exempt cost once, plus the rest three times',
  near(r.grand, 25000 + (TABS - 25000) * 3), r.grand);
ck('the exempt cost is charged once, not three times',
  near(r.perJobT, 25000) && near(r.mobT, 25000), r.mobT);
ck('and the unit price comes back as the cost of one',
  near(r.unitP, TABS - 25000), r.unitP);

/* This is the assertion the printed CE depends on. */
console.log(NL + 'and the sections add up to it:');
const sum = x => x.mobSubTX + x.demobSubTX + x.mpTotX + x.toolsTX + x.matsTX + x.ppeTX + x.miscTX;
ck('section by section equals the total, multiplying', near(sum(r), r.grand), sum(r) + ' vs ' + r.grand);
const d = run({ ...CE, info: { qty: 3, perJob: ['mobdemob'] } });
ck('and dividing', near(sum(d), d.grand), sum(d) + ' vs ' + d.grand);
ck('manpower is charged per unit', near(r.mpTotX, 45000 * 3), r.mpTotX);
ck('so are tools, materials and PPE',
  near(r.toolsTX, 8200 * 3) && near(r.matsTX, 12500 * 3) && near(r.ppeTX, 3000 * 3));
ck('but the exempt mobilisation is not',
  near(r.mobSubTX, 15000) && near(r.demobSubTX, 10000), r.mobSubTX + '/' + r.demobSubTX);

console.log(NL + 'exemptions, category by category:');
/* The point of the feature: some costs multiply and some do not, in the same
   CE. Consumables scale with the units; the permit is one permit. */
let m = run({ ...CE, misc: { consumables: 1500, permits: 4000, meals: 0 },
  info: { qty: 4, qtyMode: 'multiply', perJob: ['mobdemob', 'permits'] } });
ck('an exempt misc category keeps its own figure',
  near(m.miscTX, 1500 * 4 + 4000), m.miscTX);
ck('and the total agrees with it',
  near(m.grand, 29000 + (TABS + 4000 - 29000) * 4), m.grand);
ck('the sections still add up', near(sum(m), m.grand), sum(m) + ' vs ' + m.grand);
m = run({ ...CE, misc: { consumables: 1500, permits: 4000, meals: 0 },
  info: { qty: 4, qtyMode: 'multiply', perJob: [] } });
ck('with nothing exempt, everything multiplies',
  near(m.grand, (TABS + 4000) * 4), m.grand);
ck('including mobilisation', near(m.mobT, 25000 * 4), m.mobT);

console.log(NL + 'the edges:');
ck('at quantity 1 the two modes agree',
  near(run({ ...CE, info: { qty: 1, qtyMode: 'multiply', perJob: ['mobdemob'] } }).grand,
       run({ ...CE, info: { qty: 1, perJob: ['mobdemob'] } }).grand));
ck('a blank quantity falls to 1 rather than to nothing',
  near(run({ ...CE, info: { qtyMode: 'multiply', perJob: ['mobdemob'] } }).grand, TABS));
ck('a zero quantity does not zero the CE',
  near(run({ ...CE, info: { qty: 0, qtyMode: 'multiply' } }).grand, TABS));
/* Everything exempt means nothing scales -- and, importantly, no divide by
   zero and no negative remainder. */
const all = run({ ...CE, misc: { consumables: 0, permits: 0, meals: 0 },
  info: { qty: 5, qtyMode: 'multiply', perJob: ['mobdemob'] } });
ck('a CE whose only cost is exempt is charged once',
  all.perJobT === 25000 && all.grand > 0 && isFinite(all.unitP), all.grand);

console.log(NL + 'what a recompute makes of it:');
/* Monitoring, the drift check and the orphan finder all compare a stored
   total against this. A mode it did not know about would make every per-unit
   CE look as though its figures had been altered behind the approval. */
const partsSrc = helpers.slice(helpers.indexOf('function computeCEParts(ce) {'), helpers.indexOf('function computeCEGrand(ce) {'));
const parts = new Function('N', 'CE_CFG', 'MISC_DEF', 'miscRowCost', 'ceRates', 'ceSplitOn', 'ceWorkMap',
  'ceSiteFrac', 'eccByRow', 'ceMpRowCost', 'cePowerOn', 'ceKwhRate', 'toolRowTotal', 'mobRowCost',
  partsSrc + NL + 'return computeCEParts;')(
  v => (v === '' || v == null || isNaN(parseFloat(v))) ? 0 : parseFloat(v),
  { onsite: { mobDemob: true } }, MISC_DEF, r => Number(r.cost) || 0,
  () => ({}), () => false, () => null, () => 1, () => ({}),
  r => Number(r.cost) || 0, () => false, () => 0,
  r => Number(r.cost) || 0, r => Number(r.cost) || 0);

const saved = mode => ({
  ceType: 'onsite',
  mp: [{ cost: 45000 }], tools: [{ cost: 8200 }], mats: [{ qty: 1, cost: 12500 }],
  ppe: [{ qty: 1, cost: 3000 }],
  misc: { consumables: [{ cost: 1500 }], permits: [{ cost: 4000 }] },
  mobVehicles: [{ cost: 15000 }], demobVehicles: [{ cost: 10000 }],
  info: { qty: 4, perJob: ['mobdemob', 'permits'], ...(mode ? { qtyMode: mode } : {}) }
});
ck('a CE with no mode recomputes to the plain sum',
  near(parts(saved(null)).total, TABS + 4000), parts(saved(null)).total);
ck('and a per-unit CE recomputes to what the editor showed',
  near(parts(saved('multiply')).total, 29000 + (TABS + 4000 - 29000) * 4),
  parts(saved('multiply')).total);
ck('which is the same answer the editor reaches, by a different route',
  near(parts(saved('multiply')).total,
       run({ ...CE, misc: { consumables: 1500, permits: 4000, meals: 0 },
             info: { qty: 4, qtyMode: 'multiply', perJob: ['mobdemob', 'permits'] } }).grand));

console.log(NL + 'and around the edges of the app:');
ck('the mode is chosen on the Summary tab, per CE',
  app.indexOf("name: 'shic-qtymode'") > 0);
ck('choosing divide stores nothing, so it stays the absent default',
  app.indexOf("qtyMode: v === 'multiply' ? 'multiply' : undefined") > 0);
/* taskCostRollup sums one-unit rows; comparing that against a job total would
   quietly overstate a service. */
ck('the services breakdown stands down rather than print a wrong figure',
  app.indexOf('on: !!info.showServices && lines.length > 0 && !qtyMulOn') > 0);
ck('and says why, instead of just vanishing',
  app.indexOf('servicesSummary.offByQtyMode') > 0);
ck('multiplying by one is called out as doing nothing',
  app.indexOf("qtyMulOn && qtyN === 1") > 0);
/* The tab shows what was typed on it; the summary shows what is charged. */
ck('the Mob/Demob tab still shows its own figures, not multiplied ones',
  app.indexOf('ph(_mobTabs)') > 0);

console.log(bad ? NL + bad + ' FAILURE(S)' : NL + 'quantity modes OK');
process.exit(bad ? 1 : 0);
