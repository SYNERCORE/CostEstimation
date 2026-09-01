#!/usr/bin/env node
/*
 * The tools masterlist template has to carry the tier figures.
 *
 * Tier 1 and Tier 3 are derived from unit price, service life, projects per
 * year and maintenance per year. The template offered none of them, so the
 * only way to get them into the app was the calculator, one item at a time --
 * for a list of several hundred tools that is not a way at all.
 *
 * The import is run against the REAL headers of the maintained workbook, not
 * the template's own, because that is the file that actually gets uploaded.
 *
 * Run: node tools/test-tools-template.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('the downloaded template offers them:');
ck('the four columns are in the tools header row',
  /'Unit Price', 'Service Life \(Years\)', 'Projects per Year', 'Maintenance per Year'/.test(app));
ck('and the keys behind them line up',
  /'unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear'\]/.test(app));
ck('Cost stays where it was, so an older template still imports',
  /tools: \['Item Code', 'Category', 'Description', 'Cost \(P\)', 'UOM',/.test(app));

/* --- run the real header mapping over the real workbook --- */
const norm = new Function('return ' + app.match(/const norm = h => String\(h\)[^\n]*?;/)[0].replace(/^const norm = /, '').replace(/;$/, ''))();
const HEADER_KEY = new Function('return ' + app.match(/const HEADER_KEY = \{[\s\S]*?\n        \};/)[0]
  .replace(/^const HEADER_KEY = /, '').replace(/;$/, ''))();
const rekey = row => {
  const o = {};
  Object.keys(row).forEach(h => {
    const k = HEADER_KEY[norm(h)];
    if (k && o[k] === undefined) o[k] = row[h];
  });
  return o;
};

/* Headers exactly as they appear in the maintained workbook. */
const SHEET_ROW = {
  'ITEM': '1/8" RIGHT-ANGLE PENCIL DIE GRINDER',
  'Unit Price': 16000,
  'Service Life Span (Year)': 1,
  'EST. Project Per year': 6,
  'Depreciation per Project': 2666.67,
  'Maintenance per Year': 3200,
  'Maintenance per project': 533.33,
  'Tier 1 - Base Cost per project': 3200,
  'Tier 2 - Base Cost per project * No of Days': 1578,
  'Tier 3 - Based cost in 24 hrs': 52.60
};
const got = rekey(SHEET_ROW);

console.log('\nthe maintained workbook maps straight in:');
ck('the ITEM column is read as the description', got.desc === SHEET_ROW.ITEM,
  'every row was being dropped for want of a name; got ' + JSON.stringify(got.desc));
ck('Unit Price', got.unitPrice === 16000);
ck('"Service Life Span (Year)" is understood', got.serviceLife === 1, JSON.stringify(got.serviceLife));
ck('"EST. Project Per year" is understood', got.projectsPerYear === 6, JSON.stringify(got.projectsPerYear));
ck('Maintenance per Year', got.maintPerYear === 3200);

console.log('\nand the derived columns are ignored, not misread:');
ck('Maintenance per PROJECT is not taken for the yearly figure', got.maintPerYear !== 533.33);
ck('Depreciation per Project is not read at all',
  Object.values(got).indexOf(2666.67) < 0);
ck('the three tier columns are not read back in',
  Object.values(got).indexOf(1578) < 0 && Object.values(got).indexOf(52.60) < 0,
  'they are outputs; reading them would let a stale figure override the inputs');

console.log('\na sheet without the columns leaves the item alone:');
ck('only what the sheet carried is written', /if \(rk\[k\] !== undefined && rk\[k\] !== ''\)/.test(app));
ck('and a non-numeric cell is skipped', /if \(isFinite\(v\)\) item\[k\] = v;/.test(app),
  'a zero would turn "no basis to derive from" into a tool that costs nothing to own');
ck('the tier fields are tools-only', /if \(tab === 'tools'\) \{/.test(app));

console.log('\nthe manpower sheet is unaffected:');
const mp = rekey({'Item Code': 'SHIC-MP-001', 'Category': 'Mechanical', 'Role / Position': 'Welder', 'Day Rate (P)': 950, 'Incentive (P/Day)': 50, 'UOM': 'Day'});
ck('Item Code is still a code, not a description', mp.code === 'SHIC-MP-001' && mp.desc === undefined);
ck('and the role still reads', mp.role === 'Welder' && mp.rate === 950 && mp.perDiem === 50);

/* The workbook has no Cost column at all -- it holds the four figures and the
   tier columns worked out from them. Every imported tool would otherwise land
   priced at zero, which is not a visible failure: it is a CE that silently
   charges nothing for its equipment. */
console.log('\na sheet with no Cost column still prices its tools:');
ck('the rate is derived when the sheet gives none', /if \(!N\(item\.cost\)\) \{/.test(app));
ck('from the Tier 2 daily rate, which is what the CE prices from',
  /item\.cost = Math\.round\(_r\.tier2 \* 100\) \/ 100;/.test(app));
ck('and a sheet that DOES give a cost keeps it',
  app.indexOf('if (!N(item.cost))') > 0,
  'a typed rate is an override and wins over the derived one');

const helpersSrc = fs.readFileSync('src/helpers.js', 'utf8');
const N = v => Number(v) || 0;
const T = new Function('N',
  helpersSrc.match(/function ceResDays[\s\S]*?\n\}/)[0] + String.fromCharCode(10) +
  helpersSrc.match(/const TIER_HOURS_PER_YEAR[\s\S]*?\nfunction toolRowCost\(row, src\) \{[\s\S]*?\n\}/)[0] +
  '; return {toolTierRates};')(N);
const derived = T.toolTierRates(got);
ck('and the die grinder comes in at its workbook rate',
  derived && Math.abs(derived.tier2 - 52.60) < 0.01,
  derived ? derived.tier2.toFixed(2) : 'no rates');

/* The four figures had column headings and no cells, so anything entered in
   the calculator was stored and then appeared nowhere -- which reads as the
   calculator having failed, and sends people to enter it again. */
console.log('\nthe masterlist SHOWS the figures it stores:');
ck('there is a cell for each of the four',
  /\[\'unitPrice\', \'serviceLife\', \'projectsPerYear\', \'maintPerYear\'\]\.map\(k =>/.test(app));
ck('they are editable, not just displayed',
  /onChange: e => updML\(r\.id, k, e\.target\.value === \'\'/.test(app));
ck('an empty cell stays empty rather than becoming 0',
  /value: r\[k\] === undefined/.test(app) && /\? \'\' : r\[k\]/.test(app),
  'a zero reads as a real figure; blank means there is no basis to derive a tier from');
ck('and only on the tools tab', /mlTab === \'tools\'\n?[\s]*\\? \[\'unitPrice\'/.test(app)
  || app.indexOf("(mlTab === 'tools'") > 0);

/* Headings and cells must stay the same length, or every column after the
   first extra one sits under the wrong heading -- which is what put the delete
   button under "Unit Price". */
const toolsHdr = app.match(/tools: \[\'Item Code\'[^\]]*\]/)[0];
ck('the tools heading row declares nine columns',
  (toolsHdr.match(/\'/g) || []).length / 2 === 9,
  toolsHdr);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntools template OK');
process.exit(bad ? 1 : 0);
