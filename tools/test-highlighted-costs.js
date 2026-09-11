#!/usr/bin/env node
/*
 * Highlighted costs: pinpointing one line, and adding several up.
 *
 * A highlighted cost is a callout of money ALREADY inside the CE -- "DELIVERY
 * TO PAGBILAO", "THIRD PARTY COST" -- printed on its own line and never added
 * to the grand total. It could previously only point at a whole section, a
 * misc category or a misc line. So a client asking to see what one crane cost,
 * or what delivery came to across a truck, a driver and a permit, had to be
 * answered by typing a number in by hand -- which then stopped tracking the CE
 * the moment any of those rows was edited.
 *
 * Two things are tested here.
 *
 * 1. Every individual row of every section is offered, and priced by the SAME
 *    rowCost the section subtotal is summed from. If those two ever diverge,
 *    the CE prints a callout that contradicts the line printed above it --
 *    overtime, the shift multiplier, benefits, the tool tier and its power
 *    usage all have to be in the line figure, because they are in the total.
 *
 * 2. A row can carry a LIST of sources and show their sum. The single `src`
 *    every CE saved before this carries still resolves, as a list of one, so
 *    nothing has to be re-entered -- and a source deleted from the CE is
 *    reported rather than quietly dropped from the sum, which would leave a
 *    plausible-looking figure that is simply short by that line.
 *
 * Run: node tools/test-highlighted-costs.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('src/App.js', 'utf8');
const cfgSrc = fs.readFileSync('src/config.js', 'utf8');
const helpSrc = fs.readFileSync('src/helpers.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const near = (a, b) => Math.abs(a - b) < 0.005;

/* ---- lift the real definitions out of App.js ---- */
const grab = (start, end) => {
  const a = app.indexOf(start);
  if (a < 0) { console.error('not found in src/App.js: ' + start); process.exit(1); }
  const b = app.indexOf(end, a);
  if (b < 0) { console.error('no end marker after ' + start); process.exit(1); }
  return app.slice(a, b);
};
const rowCostSrc = grab('  const rowCost = (kind, r) => {', '\n  /* ── Highlighted costs');
const sourcesBody = grab('const hlSources = useMemo(() => {', '}, [unitP, grand')
  .replace('const hlSources = useMemo(() => {', '');
const resolvers = grab('  const hlKeys = r =>', '  const hlLabel = r =>');

const ctx = {console};
vm.createContext(ctx);
vm.runInContext(cfgSrc + '\n' + helpSrc, ctx);

/* ---- a CE that exercises every pricing path ---- */
const mp = [
  {id: 'p1', role: 'TECHNICIAN', pax: 2, rate: 1200, days: 5, shift: 'night', otHours: 6},
  {id: 'p2', role: 'HELPER', pax: 1, rate: 700, days: 5, shift: 'regular_day', otHours: 0},
  {id: 'p3', role: '', pax: 1, rate: 999, days: 5}          /* blank: costs nothing, offered nowhere */
];
const tools = [
  {id: 'e1', desc: 'CRANE 25T', qty: 1, uom: 'unit', cost: 18000, days: 3, tier: 2, kw: 0},
  {id: 'e2', desc: 'GRINDER', qty: 4, uom: 'unit', cost: 300, days: 5, tier: 2, kw: 2.2, runHrs: 12}
];
const mats = [{id: 'm1', desc: 'GASKET', qty: 10, uom: 'pc', cost: 250}];
const ppe = [{id: 'q1', desc: 'COVERALL', qty: 4, uom: 'pc', cost: 900}];
const mobVehicles = [{id: 'v1', desc: 'TRUCK 10W', qty: 1, days: 2, rate: 8000}];
const demobVehicles = [{id: 'v2', desc: 'TRUCK 10W RETURN', qty: 1, days: 2, rate: 8000}];
const misc = {transportation: [{id: 'x1', desc: 'FUEL', qty: 1, cost: 4000}]};

const rr = ctx.ceRates({rates: {kwhRate: 13.5}});
const kwhRate = 13.5;
const calcBen = () => ({total: 0});  /* benefits are calcBen's own business, tested elsewhere */

const mk = body => new vm.Script('(function(){' + rowCostSrc + '\n' + body + '})()');
const run = body => {
  const sandbox = Object.assign(vm.createContext({
    console, mp, tools, mats, ppe, mobVehicles, demobVehicles, misc, rr, kwhRate, calcBen,
    unitP: 0, grand: 0, mobSubT: 0, demobSubT: 0, mpTot: 0, toolsT: 0, matsT: 0, ppeT: 0, miscT: 0,
    ceType: 'shopworks', cfg: {mobDemob: true}, useMemo: (f) => f()
  }), {});
  vm.runInContext(cfgSrc + '\n' + helpSrc, sandbox);
  return vm.runInContext('(function(){' + rowCostSrc + '\n' + body + '})()', sandbox);
};

const sources = run(sourcesBody.replace(/\breturn o;\s*$/, 'return o;'));
const rowCost = run('return rowCost;');

console.log('every line of every section can be pinpointed:');
const has = k => sources.some(o => o.k === k);
[['mp', 'p1'], ['mp', 'p2'], ['tools', 'e1'], ['tools', 'e2'],
 ['mats', 'm1'], ['ppe', 'q1'], ['mob', 'v1'], ['demob', 'v2']].forEach(([t, id]) =>
  ck('  ' + t + ' row ' + id + ' is offered', has('row:' + t + ':' + id)));
ck('a misc line is still offered', has('miscRow:transportation:x1'));
ck('and a blank row is not', !has('row:mp:p3'),
  'a row with no role costs nothing and has no name to print');

console.log('\na line is priced exactly as its section prices it:');
const amt = k => (sources.find(o => o.k === k) || {}).v;
ck('  a night-shift row carries its multiplier and overtime',
  near(amt('row:mp:p1'), rowCost('mp', mp[0])),
  amt('row:mp:p1') + ' vs ' + rowCost('mp', mp[0]));
ck('  a tool row carries its tier', near(amt('row:tools:e1'), rowCost('tools', tools[0])));
ck('  and its power usage', near(amt('row:tools:e2'), rowCost('tools', tools[1])) &&
  ctx.toolPowerCost(tools[1], kwhRate) > 0,
  'the grinder draws 2.2 kW for 12 hrs; leaving that out understates the callout');
ck('  a vehicle row is qty x days x rate', near(amt('row:mob:v1'), 16000));

console.log('\nand the lines of a section add up to that section:');
const sumGroup = g => sources.filter(o => o.g === g).reduce((s, o) => s + o.v, 0);
[['Line Items · Manpower', mp.reduce((s, r) => s + rowCost('mp', r), 0)],
 ['Line Items · Tools & Equipment', tools.reduce((s, r) => s + rowCost('tools', r), 0)],
 ['Line Items · Materials & Consumables', mats.reduce((s, r) => s + rowCost('mats', r), 0)],
 ['Line Items · PPE', ppe.reduce((s, r) => s + rowCost('ppe', r), 0)]].forEach(([g, want]) =>
  ck('  ' + g, near(sumGroup(g), want), sumGroup(g) + ' vs ' + want));

/* ---- resolving a highlighted row ---- */
const res = vm.createContext({hlSources: sources, N: v => parseFloat(v) || 0});
vm.runInContext(resolvers + ';this.hlKeys=hlKeys;this.hlAmt=hlAmt;this.hlMissing=hlMissing;this.hlIsLinked=hlIsLinked;', res);
const {hlKeys, hlAmt, hlMissing, hlIsLinked} = res;

console.log('\nseveral lines can be shown as one figure:');
const sum = {label: 'DELIVERY', srcs: ['row:mob:v1', 'row:mp:p2', 'miscRow:transportation:x1']};
ck('the amount is their sum',
  near(hlAmt(sum), amt('row:mob:v1') + amt('row:mp:p2') + amt('miscRow:transportation:x1')),
  String(hlAmt(sum)));
ck('they can come from different sections', hlKeys(sum).length === 3);
ck('and it counts as linked, so the amount is not typed', hlIsLinked(sum));

console.log('\nthe single link every older CE carries still works:');
ck('src resolves as a list of one', hlKeys({src: 'sec:tools'}).length === 1);
ck('and gives that figure', near(hlAmt({src: 'row:tools:e1'}), amt('row:tools:e1')));
ck("src 'manual' is not a link", !hlIsLinked({src: 'manual', amount: 500}) && hlAmt({src: 'manual', amount: 500}) === 500);
ck('nor is a blank one', !hlIsLinked({src: '', amount: 250}) && hlAmt({src: '', amount: 250}) === 250);
ck('an empty list falls back to the typed amount',
  !hlIsLinked({srcs: [], amount: 700}) && hlAmt({srcs: [], amount: 700}) === 700,
  'clearing the picker must not blank the row');
ck('a list wins over a leftover src',
  near(hlAmt({src: 'sec:mp', srcs: ['row:ppe:q1']}), amt('row:ppe:q1')),
  'both live at once would mean two answers to what the row points at');

console.log('\na deleted cost is reported, not silently dropped:');
ck('a missing single link is named', hlMissing({src: 'row:tools:deleted'}).length === 1);
ck('so is one missing from inside a sum',
  hlMissing({srcs: ['row:mob:v1', 'row:tools:deleted']}).length === 1,
  'the figure would still look plausible, just short by that line');
ck('a sum with nothing missing reports nothing', hlMissing(sum).length === 0);
ck('and a typed amount is never missing', hlMissing({src: 'manual', amount: 5}).length === 0);

console.log('\nthe picker is wired to it:');
ck('a row opens its own picker', /const open = hlPick === r\.id;/.test(app));
ck('ticking a source toggles it in and out',
  /const next = cur\.indexOf\(k\) >= 0 \? cur\.filter\(v=>v!==k\) : \[\.\.\.cur, k\];/.test(app));
ck('picking clears the old single link', /srcs: next, src: ''/.test(app),
  'leaving src set would let the two disagree');
ck('the first pick names the row', /next\.length===1 && hit \? hit\.l : ''/.test(app));
ck('there is a way back to typing the amount', /Type manually instead/.test(app));
ck('and that keeps the figure it had', /srcs:\[\],src:'',amount:N\(hlAmt\(x\)\)/.test(app),
  'unlinking to a zero would look like the cost had vanished');
ck('a deleted source can be cleared from a sum', /remove it/.test(app));
ck('the picker is filterable', /setHlPickQ\(e\.target\.value\)/.test(app));
ck('neither picker field is saved with the CE',
  !/hlPick/.test(app.slice(app.indexOf('const mkEntry ='), app.indexOf('const mkEntry =') + 2000)),
  'it is editor state, not part of the estimate');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nhighlighted costs OK');
process.exit(bad ? 1 : 0);
