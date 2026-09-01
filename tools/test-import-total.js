#!/usr/bin/env node
/*
 * An imported CE must be filed under the total its own line items cost.
 *
 * The xlsx import worked its total out by hand as wage only --
 * pax x days x rate x shift -- with no benefits, no OT and no miscellaneous.
 * The editor costs the same rows with all of that included. So an imported CE
 * was stored under one number and recomputed to a bigger one the moment it was
 * opened: Monitoring said P5,227,438.00, the CE said P5,326,256.11, and it
 * looked as though loading had changed the values. Nothing changed -- the two
 * were never the same number.
 *
 * Run: node tools/test-import-total.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
const helpers = fs.readFileSync('src/helpers.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('the import uses the one costing function:');
ck('the stored total comes from computeCEGrand', /entry\.grand = computeCEGrand\(entry\)/.test(app));
ck('and the hand-rolled wage-only sum is gone',
  !/const provisionalGrand =/.test(app) && !/const mpGrand = mpRows\.reduce/.test(app),
  'two formulas for one number is how they drifted apart');
ck('it is computed after misc is on the entry',
  app.indexOf('mp:mpRows, tools, mats, ppe, misc,') < app.indexOf('entry.grand = computeCEGrand(entry)'),
  'miscellaneous would otherwise be left out of the total');

/* Show the gap the old formula left, using the real cost function. */
const N = v => Number(v) || 0;
const SHIFTS = {regular_day: {mult: 1}, regular_night: {mult: 1.25}};
const CE_CFG = {shopworks: {mobDemob: false}};
const fns = new Function('N', 'SHIFTS', 'CE_CFG',
  helpers.match(/function ceResDays[\s\S]*?\n\}\nfunction computeCEGrand[\s\S]*?\n\}/)[0] +
  '; return {ceMpRowCost, computeCEGrand};')(N, SHIFTS, CE_CFG);

const ce = {
  ceType: 'shopworks',
  mp: [{role: 'WELDER', pax: 4, days: 10, rate: 1100, shift: 'regular_day', otHours: 2}],
  tools: [], mats: [], ppe: [],
  misc: {other: [{qty: 1, cost: 5000}]}
};
const wageOnly = 4 * 10 * 1100 * 1;
const real = fns.computeCEGrand(ce);

console.log('\nwhat the old formula left out:');
ck('benefits, OT and misc are all real cost', real > wageOnly,
  'wage-only ' + wageOnly.toFixed(2) + ' vs ' + real.toFixed(2));
ck('and the gap is large enough to notice on a CE',
  (real - wageOnly) / wageOnly > 0.1,
  'gap ' + (real - wageOnly).toFixed(2) + ' on ' + wageOnly.toFixed(2));
ck('miscellaneous alone is counted',
  Math.abs(fns.computeCEGrand(ce) - fns.computeCEGrand({...ce, misc: {}}) - 5000) < 0.005);
ck('a row with no role still costs nothing',
  fns.computeCEGrand({...ce, mp: [{role: '', pax: 1, days: 1, rate: 0}], misc: {}}) === 0,
  'the blank starter row must not add the P30 from SIL');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nimport total OK');
process.exit(bad ? 1 : 0);
