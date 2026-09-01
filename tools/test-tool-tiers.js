#!/usr/bin/env node
/*
 * Tier pricing for tools and equipment, checked against the real sheet.
 *
 * Three ways to charge a tool, all derived from one annual figure so they
 * cannot drift apart:
 *
 *   annualCost = UnitPrice / ServiceLife + MaintenancePerYear
 *   Tier 1  annualCost / ProjectsPerYear   flat per project, duration ignored
 *   Tier 2  annualCost / 365   x days      the default, and what the app has
 *                                          always done
 *   Tier 3  annualCost / 8760  x hours
 *
 * The numbers below are lifted straight from the masterlist workbook, so this
 * fails if the formulas ever stop reproducing it.
 *
 * Run: node tools/test-tool-tiers.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('src/helpers.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const near = (a, b, tol) => a !== null && a !== undefined && Math.abs(a - b) <= (tol === undefined ? 0.01 : tol);

const N = v => Number(v) || 0;
const F = new Function('N',
  src.match(/function ceResDays[\s\S]*?\n\}/)[0] + '\n' +
  src.match(/const TIER_HOURS_PER_YEAR[\s\S]*$/)[0] +
  '; return {toolAnnualCost, toolTierRates, toolRowCost};')(N);

/* Straight from the workbook. */
const SHEET = [
  {desc: '1/8" RIGHT-ANGLE PENCIL DIE GRINDER', unitPrice: 16000, serviceLife: 1, projectsPerYear: 6, maintPerYear: 3200,
   t1: 3200, t2day: 52.60, t2at30: 1578},
  {desc: '20FT CONTAINER VAN (CLASS B)', unitPrice: 150000, serviceLife: 1, projectsPerYear: 6, maintPerYear: 30000,
   t1: 30000, t2day: 493.15, t2at30: 14795},
  {desc: 'ADHESION TESTER', unitPrice: 8000, serviceLife: 5, projectsPerYear: 6, maintPerYear: 1600,
   t1: 533.33, t2day: 8.77, t2at30: 263},
  {desc: '10 WAY TANK WRENCH', unitPrice: 500, serviceLife: 1, projectsPerYear: 6, maintPerYear: 30,
   t1: 88.33, t2day: 1.45, t2at30: 44},
  {desc: 'ADJUSTABLE WRENCH 36"', unitPrice: 18600, serviceLife: 1, projectsPerYear: 6, maintPerYear: 3720,
   t1: 3720, t2day: 61.15, t2at30: 1835}
];

console.log('the workbook reproduces exactly:');
for (const row of SHEET) {
  const r = F.toolTierRates(row);
  const ok = r && near(r.tier1, row.t1) && near(r.tier2, row.t2day) && near(r.tier2 * 30, row.t2at30, 1);
  ck(row.desc, ok, r ? ('T1 ' + r.tier1.toFixed(2) + ' T2/day ' + r.tier2.toFixed(2) + ' T2@30 ' + (r.tier2 * 30).toFixed(2)) : 'no rates');
}

console.log('\nTier 3 is the same money by the hour:');
const g = F.toolTierRates(SHEET[0]);
ck('a day of Tier 3 is a day of Tier 2', near(g.tier3 * 24, g.tier2),
  g.tier3.toFixed(4) + ' x 24 vs ' + g.tier2.toFixed(4));
ck('and it can express half a day', near(F.toolRowCost({qty: 1, tier: 3, hours: 12, cost: 52.60}, SHEET[0]), g.tier2 / 2),
  'the whole reason for an hourly tier');

console.log('\nTier 2 stays exactly what the app already did:');
const legacy = {qty: 2, days: 5, cost: 52.60};
ck('a row naming no tier costs qty x days x cost',
  near(F.toolRowCost(legacy, null), 2 * 5 * 52.60),
  'every saved CE and every masterlist entry is already priced this way');
ck('and naming Tier 2 explicitly changes nothing',
  near(F.toolRowCost({...legacy, tier: 2}, null), F.toolRowCost(legacy, null)));
ck('days default to 1 when blank', near(F.toolRowCost({qty: 1, cost: 100}, null), 100));

console.log('\nTier 1 ignores duration, which is the point of it:');
const t1row = {qty: 1, tier: 1, days: 60, cost: 52.60};
ck('60 days costs the same as 2', near(F.toolRowCost(t1row, SHEET[0]), F.toolRowCost({...t1row, days: 2}, SHEET[0])));
ck('and it is the per-project share', near(F.toolRowCost(t1row, SHEET[0]), 3200));

console.log('\nwhat cannot be derived is never guessed:');
ck('an entry with no source figures has no tiers', F.toolTierRates({desc: 'RENTED BARGE', cost: 40000}) === null,
  'a hand-typed cost is the ordinary case for a rented tool, not an error');
ck('and such a row still costs its stored rate',
  near(F.toolRowCost({qty: 1, days: 3, tier: 1, cost: 40000}, null), 120000),
  'charging nothing for a tool is never the safer wrong answer');
ck('no projects-per-year means no Tier 1 figure',
  F.toolTierRates({unitPrice: 16000, serviceLife: 1, maintPerYear: 3200}).tier1 === null,
  'there is no per-project share to take');
ck('a zero service life does not become Infinity',
  near(F.toolTierRates({unitPrice: 16000, serviceLife: 0, maintPerYear: 3200}).tier2, 3200 / 365),
  'Infinity reads on screen as a real price');
ck('maintenance alone is enough to price a tool',
  near(F.toolTierRates({maintPerYear: 365}).tier2, 1));
ck('an entry with nothing at all yields nothing', F.toolAnnualCost({}) === null);

console.log('\nand an empty hours field does not become a free tool by accident:');
ck('Tier 3 with no hours costs nothing at all',
  F.toolRowCost({qty: 1, tier: 3, cost: 52.60}, SHEET[0]) === 0,
  'zero is visible on the CE; silently charging a full day is not');

/* The calculator in the masterlist: enter what the tool cost to own, and the
   tiers follow. The four figures are stored on the entry, so Tier 1 and Tier 3
   can be derived later without asking for them again. */
const app = fs.readFileSync('src/App.js', 'utf8');
console.log('\nthe masterlist calculator:');
ck('it exists, on tools only', /mlTab === 'tools' &&/.test(app));
ck('its state is NOT declared inside MlEditor',
  app.indexOf('const [mlCalc, setMlCalc]') < app.indexOf('const MlEditor = () =>'),
  'state inside a nested component is thrown away on every render -- that is what ate keystrokes here before');
ck('it takes the four source figures',
  ['unitPrice', 'serviceLife', 'maintPerYear', 'projectsPerYear']
    .every(k => app.indexOf("field('" + k + "'") >= 0));
ck('and shows all three tiers',
  /Tier 1 - per project/.test(app) && /Tier 2 - per day/.test(app) && /Tier 3 - per hour/.test(app));
ck('applying stores the figures, not just the answer',
  /unitPrice: N\(mlCalc\.unitPrice\), serviceLife: N\(mlCalc\.serviceLife\)/.test(app),
  'Tier 1 and Tier 3 need them later');
ck('and writes Tier 2 into the Cost the CE already prices from',
  /cost: Math\.round\(rates\.tier2 \* 100\) \/ 100/.test(app));
ck('it persists through saveML, not setMasterlist alone', /saveML\(next\);/.test(app),
  'an edit that is never saved is the masterlist bug we already had once');
ck('Apply is held back until there is something to apply', /disabled: !rates/.test(app));

/* The CE side: one costing path, a schema that can carry a tier, and a default
   that leaves every existing CE priced exactly as it was quoted. */
const db = fs.readFileSync('src/db.js', 'utf8');
const restab = fs.readFileSync('src/components/ResTab.js', 'utf8');
const helpers = fs.readFileSync('src/helpers.js', 'utf8');
const reg = fs.readFileSync('src/components/RegisterPage.js', 'utf8');

console.log('\nthere is one costing path, not four:');
ck('the editor row total goes through it', /const rowTot = r => showDays \? toolRowCost\(r\)/.test(restab));
ck('so does the CE total', /const toolsT = useMemo\(\(\) => tools\.reduce\(\(s, r\) => s \+ toolRowCost\(r\), 0\)/.test(app));
ck('so does the per-task cost', /if \(kind === 'tools'\) return toolRowCost\(r\);/.test(app));
ck('and so does the recompute', /arr\(ce\.tools\)\.reduce\(\(s, r\) => s \+ toolRowCost\(r\), 0\)/.test(helpers),
  'Monitoring and the editor disagreeing on a total is the bug we already had');

console.log('\nthe tier survives a round trip:');
ck('it is provisioned', /\[9,'shicTier'\],\[9,'shicHours'\]/.test(reg));
ck('written', /shicTier:r\.tier\|\|0,shicHours:r\.hours\|\|0/.test(db));
ck('read back', /tier:r\.shicTier\|\|2,hours:r\.shicHours\|\|0/.test(db));
ck('and asked for in both read paths',
  (db.match(/shicShares,shicTier,shicHours/g) || []).length === 2,
  'dbLoadCE and the offline prefetch both have to select it');
ck('a site without the columns still opens its CEs',
  /'shicInfo','shicTier','shicHours'\]/.test(db),
  'the tolerant retry is what stops an unrepaired site breaking on load');

console.log('\na CE that never heard of tiers is untouched:');
ck('a stored row with no tier reads back as Tier 2', /tier:r\.shicTier\|\|2/.test(db),
  'Tier 2 is the pricing it was quoted at');
ck('and a new row inherits the CE default, which is Tier 2',
  /tier: N\(defaultTier\) \|\| 2/.test(restab));
ck('the default rides in info, needing no column of its own',
  /defaultTier: N\(info\.toolTier\) \|\| 2/.test(app));

console.log('\nthe fields only appear where they mean something:');
ck('Days is disabled off Tier 2', /disabled: tierOf\(r\) !== 2/.test(restab));
ck('Hours is disabled off Tier 3', /disabled: tierOf\(r\) !== 3/.test(restab));
ck('and a shared row is split by hours on Tier 3, not days',
  /N\(r\.tier\) === 3 \? N\(r\.hours\)/.test(app),
  'weighting an hourly row by days splits a shared cost in the wrong proportion');

console.log('\nand the source figures follow the rate:');
ck('Sync Rates carries them onto the CE',
  /\['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear'\]\.forEach/.test(app),
  'without them a Tier 1 or Tier 3 row has nothing to derive from');
ck('so does the tab-level Sync Rates', /\['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear'\]\.forEach/.test(restab));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntool tiers OK');
process.exit(bad ? 1 : 0);
