#!/usr/bin/env node
/*
 * A tiered tool has to arrive on the CE knowing where its price comes from.
 *
 * toolRowCost prices a row from the ROW -- no masterlist is consulted, on
 * purpose, so a CE quoted last month cannot be repriced by an edit to the list
 * today. That only works if the row carries the four figures a tier price is
 * derived from: unit price, service life, maintenance per year and projects
 * per year.
 *
 * It did not. Every path that put a tool on a CE copied desc, uom, cost and
 * kW, and nothing else -- so Tier 1 had no annual cost to divide between
 * projects and Tier 3 had none to divide between hours, and both fell back to
 * the stored daily rate. On a P1,000 meter tape written off over 5 years with
 * P20 maintenance and 6 projects a year, the calculator says T1 = P36.67 and
 * T3 = P0.03/hr; the CE charged P0.60 and P0.025. Sync Rates DID copy them,
 * which is why re-syncing a row appeared to fix a bug of its own.
 *
 * Run: node tools/test-tier-source-travels.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const helpers = fs.readFileSync(path.join(root, 'src', 'helpers.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'App.js'), 'utf8');
const restab = fs.readFileSync(path.join(root, 'src', 'components', 'ResTab.js'), 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const near = (a, b) => Math.abs(a - b) < 0.005;

const grab = (re, what) => { const m = helpers.match(re); if (!m) { console.error('not found in src/helpers.js: ' + what); process.exit(1); } return m[0]; };
const H = new Function('N',
  grab(/const TIER_HOURS_PER_YEAR[\s\S]*?\nfunction toolTierRates\(src\) \{[\s\S]*?\n\}/, 'tier rates') + '\n' +
  grab(/function ceResDays\(r\) \{[\s\S]*?\n\}/, 'ceResDays') + '\n' +
  grab(/function toolRowCost\(row, src\) \{[\s\S]*?\n\}/, 'toolRowCost') + '\n' +
  'return {toolRowCost, toolTierRates};'
)(v => parseFloat(v) || 0);

/* The masterlist entry behind the screenshot. */
const ML = {desc: 'METER TAPE', cost: 0.6, uom: 'Day',
  unitPrice: 1000, serviceLife: 5, maintPerYear: 20, projectsPerYear: 6};

console.log('the calculator and the CE agree on what each tier costs:');
const rates = H.toolTierRates(ML);
ck('T1 is the annual cost shared between the year\'s projects', near(rates.tier1, 36.67), rates.tier1);
ck('T2 is the daily rate', near(rates.tier2, 0.60), rates.tier2);
ck('T3 is the hourly rate', near(rates.tier3, 0.0251), rates.tier3);

console.log('\na row that carries the figures is charged what the tier says:');
const full = t => ({...ML, qty: 1, days: 1, hours: 1, tier: t});
ck('T1 charges per project, not per day', near(H.toolRowCost(full(1)), 36.67), H.toolRowCost(full(1)));
ck('T2 charges per day', near(H.toolRowCost(full(2)), 0.60), H.toolRowCost(full(2)));
ck('T3 charges per hour', near(H.toolRowCost(full(3)), 0.0251), H.toolRowCost(full(3)));
ck('and T1 ignores the duration, as it claims to',
  near(H.toolRowCost({...full(1), days: 30}), 36.67));

console.log('\na row WITHOUT them is the bug this file exists for:');
const bare = t => ({desc: 'METER TAPE', cost: 0.6, qty: 1, days: 1, hours: 1, tier: t});
ck('T1 falls back to one day of hire', near(H.toolRowCost(bare(1)), 0.60),
  'P0.60 where the calculator says P36.67 -- off by a factor of 61');
ck('T3 falls back to a twenty-fourth of it', near(H.toolRowCost(bare(3)), 0.025));
ck('so the fallback is real and the row must carry the figures',
  H.toolRowCost(bare(1)) !== H.toolRowCost(full(1)));

console.log('\nEvery way a tool reaches a CE brings them:');
ck('one helper in ResTab, not three spellings of the same list',
  /const _srcFields = it => \{/.test(restab));
ck('the From Masterlist picker', /cost: item\.cost,[\s\S]{0,120}\.\.\._srcFields\(item\)/.test(restab));
ck('a description typed against the datalist',
  /uom: f\.uom,[\s\S]{0,160}\.\.\._srcFields\(f\)/.test(restab),
  'typing the name is the same act as picking it');
ck('Sync Rates, which always did', /const _src = _srcFields\(f\);/.test(restab));
ck('the SOW breakdown picker', /\.\.\.toolSrcFields\(item\)/.test(app));
ck('and a scope library entry', /\.\.\.toolSrcFields\(findTool\(desc\)\)/.test(app),
  'a Tier 1 row built from a saved scope had nothing to derive from');
ck('the CE-side helper exists too', /const toolSrcFields = item => \{/.test(app));
ck('all four figures travel, not just kW',
  /'unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'/.test(restab) &&
  /'unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'/.test(app));
ck('an unrated figure is left off rather than stored as 0',
  /it\[k\] !== undefined && it\[k\] !== '' && N\(it\[k\]\) > 0/.test(restab),
  'a stored 0 reads as "written off over no years", which is not the same as "nobody has said"');

console.log('\nand a row that still cannot derive its tier says so:');
ck('the row is flagged', /const tierUnderived = r => \{/.test(restab));
ck('only for the tiers that need deriving', /if \(!showDays \|\| \(t !== 1 && t !== 3\)\) return false;/.test(restab));
ck('T1 without a projects-per-year counts as underived', /t === 1 && rates\.tier1 === null/.test(restab),
  'the annual cost can be known while the share between projects is not');
ck('it is shown beside the tier, with what to do about it',
  /tierUnderived\(r\) && \/\*#__PURE__\*\/React\.createElement\("span"/.test(restab) &&
  /Tier Pricing Calculator\) and press Sync Rates/.test(restab));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntier source travels OK');
process.exit(bad ? 1 : 0);
