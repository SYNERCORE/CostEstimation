/* Tiers 1 to 3 all charge a SHARE of what owning a tool costs for the year --
   they assume it comes back and is used again. Heavy work does not give it
   back: a grinder off a scaling job is scrap, and charging that job one
   project's share of a year it will never see means the replacement comes out
   of somebody else's margin.

   Tier 4 charges the project the price of the tool. It is the unit price
   alone -- not price plus a year's maintenance -- because the project is
   buying the tool, not owning it for a year, and a figure an approver can
   check against a quotation is worth more than a cleverer one he cannot.

   The invariant: nothing a CE does not opt into may move. A row on Tiers 1,
   2 and 3 costs to the centavo what it costed before this existed. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond, got) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + what + (got !== undefined ? '  [' + got + ']' : ''));
  if (!cond) bad++;
};
const near = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 0.005 : tol);
const N = v => parseFloat(v) || 0;

const help = R('src/helpers.js');
const app = require('./lib/appsrc').plus(R('src/App.js'));
const restab = R('src/components/ResTab.js');
const db = R('src/db.js');

/* Run the shipped pricing, not a copy of it. */
const F = new Function('N',
  help.slice(help.indexOf('function toolPowerCost'), help.indexOf('/* DAYS LEFT, and when it stops.')) +
  '\nreturn { toolRowCost, toolTierRates, toolUnitRate, toolAnnualCost, toolRowTotal };')(N);

console.log('Tier 4 - charging a tool out whole');

/* A real entry: a P4,000 grinder, 2-year life, P800/yr maintenance, 6
   projects a year. Annual cost to own = 2,000 + 800 = 2,800. */
const G = { unitPrice: 4000, serviceLife: 2, maintPerYear: 800, projectsPerYear: 6 };
const rates = F.toolTierRates(G);

ck('the whole price is a tier of its own', rates.tier4 === 4000, rates.tier4);
ck('and it is the price, not the price plus a year of maintenance',
  rates.tier4 === G.unitPrice && !near(rates.tier4, rates.annual), rates.annual);
ck('the other three are untouched by it',
  near(rates.tier1, 2800 / 6) && near(rates.tier2, 2800 / 365) && near(rates.tier3, 2800 / 8760));

/* ---- what a row costs ---- */
const row = extra => ({ qty: 1, cost: 7.67, days: 30, hours: 8, ...G, ...extra });
ck('a Tier 4 row costs the price of the tool, once',
  near(F.toolRowCost(row({ tier: 4 })), 4000), F.toolRowCost(row({ tier: 4 })));
/* This is the whole point of the tier: the job that destroys the tool pays for
   it, and a longer job does not pay more than the tool is worth. */
ck('and 30 days or 300, it is still the price of the tool',
  F.toolRowCost(row({ tier: 4, days: 300 })) === F.toolRowCost(row({ tier: 4, days: 30 })));
ck('two of them cost two prices',
  near(F.toolRowCost(row({ tier: 4, qty: 2 })), 8000));
ck('hours do not enter into it',
  F.toolRowCost(row({ tier: 4, hours: 0 })) === F.toolRowCost(row({ tier: 4, hours: 500 })));

/* ---- the price alone is enough ---- */
/* A tool with a price but no service life derives NO annual cost, so Tiers 1
   to 3 have nothing at all -- and its price is still its price. */
const bare = { qty: 1, cost: 250, days: 5, tier: 4, unitPrice: 4000 };
ck('a price with no service life still charges the price',
  near(F.toolRowCost(bare), 4000), F.toolRowCost(bare));
ck('because there is no annual cost to be had from it',
  F.toolAnnualCost({ unitPrice: 4000 }) === null);
/* Charging nothing for a tool is never the safer wrong answer -- the same rule
   Tiers 1 and 3 already follow. */
ck('and with no price at all it falls back to the daily rate, not to zero',
  near(F.toolRowCost({ qty: 2, cost: 250, days: 5, tier: 4 }), 2500));

/* ---- nothing else moved ---- */
const costAt = t => F.toolRowCost(row({ tier: t }));
ck('Tier 1 costs what it always did', near(costAt(1), 2800 / 6), costAt(1));
ck('Tier 2 costs what it always did', near(costAt(2), 7.67 * 30), costAt(2));
ck('Tier 3 costs what it always did', near(costAt(3), 2800 / 8760 * 8), costAt(3));
ck('and a row naming no tier is still Tier 2',
  F.toolRowCost(row({})) === costAt(2));

/* ---- the rate printed beside the total ---- */
/* Every document printed the stored daily rate in UNIT PRICE whatever the
   tier, against a TOTAL worked out on a different figure. On Tier 2 they are
   the same number; on a Tier 4 row it would read as a contradiction. */
ck('Tier 2 prints the stored daily rate, exactly as before',
  F.toolUnitRate(row({ tier: 2 })) === 7.67);
ck('Tier 4 prints the price it is charging', F.toolUnitRate(row({ tier: 4 })) === 4000);
ck('Tier 1 prints the per-project share', near(F.toolUnitRate(row({ tier: 1 })), 2800 / 6));
ck('Tier 3 prints the hourly rate', near(F.toolUnitRate(row({ tier: 3 })), 2800 / 8760, 1e-6));
/* Rate x quantity x basis = total, on every tier, or the sheet does not add up. */
[[1, 1], [2, 30], [3, 8], [4, 1]].forEach(([t, basis]) => {
  const r = row({ tier: t });
  ck('T' + t + ': the printed rate times the printed basis is the printed total',
    near(F.toolUnitRate(r) * N(r.qty) * basis, F.toolRowCost(r)));
});

/* ---- all three documents, and the editor ---- */
ck('the printed CE prints the basis rate', app.indexOf('${fmt(toolUnitRate(r))}') > 0);
ck('the workbook prints it', /S\(toolUnitRate\(r\), 'tdn'\)/.test(app));
ck('the text summary prints it', /a\.money\(withDays \? toolUnitRate\(r\) : N\(r\.cost\)\)/.test(app));
ck('and a row charged whole says so rather than showing a duration',
  /if \(t === 4\) return 'full price';/.test(app));

ck('the tier can be picked on a row', /\[4, 'T4'\]/.test(restab));
ck('and set for new rows', /\[4, 'Tier 4 - full price'\]/.test(restab));
/* Days and hours belong to Tiers 2 and 3. Leaving them live on a Tier 4 row
   would invite an edit that changes nothing and reads as a bug. */
ck('DAYS stays dead on it', /disabled: tierOf\(r\) !== 2/.test(restab));
ck('HOURS stays dead on it', /disabled: tierOf\(r\) !== 3/.test(restab));
ck('a Tier 4 row with no unit price warns instead of quietly costing the day rate',
  /if \(t === 4\) return showDays && N\(r\.unitPrice\) <= 0;/.test(restab));

/* ---- it survives being saved ---- */
ck('the tier is written as itself, so 4 comes back as 4', /shicTier:r\.tier\|\|0/.test(db));
ck('and the unit price it needs rides the source column',
  /'unitPrice','serviceLife','projectsPerYear','maintPerYear'/.test(db));
ck('which is carried onto the row when the item is picked',
  /'unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'/.test(restab));

/* ---- a shared row ---- */
/* A tool serving two scope tasks is costed once and split between them. Tier 4
   has no duration to split by, so it is weighted like Tier 1 -- by quantity
   alone. Weighted by days, a Tier 4 row shared between a 2-day and a 20-day
   task would load nearly the whole price onto the long one. */
ck('a shared Tier 4 row is split by quantity, not by days',
  /\(N\(r\.tier\) === 1 \|\| N\(r\.tier\) === 4\) \? 1/.test(app));

/* ---- the calculator ---- */
ck('the Tier Pricing Calculator shows the fourth figure', /Tier 4 - full price/.test(app));
ck('and shows it from a price alone, when there is no annual cost to derive',
  /\(rates \|\| N\(mlCalc\.unitPrice\) > 0\) \?/.test(app));
ck('saving a price-only tool leaves the daily rate alone rather than zeroing it',
  /\.\.\.\(rates \? \{cost: Math\.round\(rates\.tier2 \* 100\) \/ 100\} : \{\}\)/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nTier 4 OK');
process.exit(bad ? 1 : 0);
