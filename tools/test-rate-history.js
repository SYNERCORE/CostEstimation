#!/usr/bin/env node
/*
 * What we charged for this before, on the row where the rate is typed.
 *
 * The lookup existed for manpower only -- SHIC_ML.suggestRates reads ce.mp and
 * nothing else -- and only inside the ML Insights panel, so you had to know to
 * go and ask. Tools, consumables, PPE and the mobilisation tables had no
 * history at all, which is why a warehouse item with no price had nowhere to
 * get one from even though the company had bought it a dozen times.
 *
 * Two things this must not do: read a rate out of an analysed spreadsheet and
 * present it as one this company issued, and claim history for a resource type
 * whose line items are not actually stored under that name.
 *
 * Run: node tools/test-rate-history.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const w = fs.readFileSync('src/widgets.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
const res = fs.readFileSync('src/components/ResTab.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- run the real shicRateUses ------------------------------------------- */
const src = (w.match(/function shicRateUses\(kind, name, limit\) \{[\s\S]*?\n\}/) || [''])[0];
if (!src) { console.error('shicRateUses not found in src/widgets.js'); process.exit(1); }
const ctx = { window: {}, Number, String, Date, isFinite };
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._f=shicRateUses;', ctx);
const uses = (kind, name, hist, limit) => { ctx.window.shicHistory = hist; return ctx._f(kind, name, limit); };

const ce = (num, when, rows, client) => Object.assign(
  { savedAt: when, info: { ceNum: num, client: client || '' } }, rows);

const HIST = [
  ce('SY3-CE-2026-0100', '2026-01-10T00:00:00Z', { mats: [{ desc: 'FLAP DISC 4"', qty: 10, cost: 40 }] }, 'PETRON'),
  ce('SY3-CE-2026-0300', '2026-06-02T00:00:00Z', { mats: [{ desc: 'flap disc 4 "', qty: 5, cost: 55 }] }, 'HEDCOR'),
  ce('SY3-CE-2026-0200', '2026-03-01T00:00:00Z', { mats: [{ desc: 'FLAP DISC 4"', qty: 2, cost: 0 }] }),
  ce('SY3-CE-2026-0400', '2026-07-01T00:00:00Z', { tools: [{ desc: 'UT MACHINE', qty: 1, cost: 2500 }] }),
  ce('SY3-CE-2026-0400', '2026-07-01T00:00:00Z', { mp: [{ role: 'WELDER', rate: 1100 }] }),
  ce('SY3-CE-2026-0500', '2026-08-01T00:00:00Z', { mobVehicles: [{ desc: 'TRUCK 6-WHEELER', rate: 8000 }] }),
  ce('SY3-CE-2026-0600', '2026-08-09T00:00:00Z', { demobVehicles: [{ desc: 'TRUCK 6-WHEELER', rate: 8500 }] }),
  /* No savedAt and no CE number: the file analyser lifted this out of a
     spreadsheet. It is a number somebody typed once, not a rate we issued. */
  { info: {}, mats: [{ desc: 'FLAP DISC 4"', cost: 999 }] }
];

console.log('every resource type has history now, not just manpower:');
ck('consumables', uses('mats', 'FLAP DISC 4"', HIST).length > 0);
ck('tools', uses('tools', 'UT MACHINE', HIST).length === 1);
ck('manpower reads the rate, not the cost', uses('mp', 'WELDER', HIST)[0].rate === 1100);
ck('mobilisation and demobilisation are one lookup',
  uses('vehicles', 'TRUCK 6-WHEELER', HIST).length === 2,
  'they are the same editor, so a rate used on one is worth seeing on the other');

console.log('\nthe name is matched the way a person would read it:');
const fd = uses('mats', 'flap  disc  4"', HIST);
ck('case, spacing and punctuation do not matter', fd.length === 3, JSON.stringify(fd.length));
ck('an unknown item returns nothing, not everything', uses('mats', 'NOTHING LIKE THIS', HIST).length === 0);
ck('a blank name returns nothing', uses('mats', '', HIST).length === 0);

console.log('\na zero is not a rate:');
ck('the CE that costed it at 0 is left out',
  !uses('mats', 'FLAP DISC 4"', HIST).some(u => u.rate === 0),
  'showing 0 as "what we charged" would invite adopting it');

console.log('\nnewest first, because that is the one being asked about:');
const o = uses('mats', 'FLAP DISC 4"', HIST).map(u => u.ceNum);
ck('most recent CE leads', o[0] === 'SY3-CE-2026-0300', JSON.stringify(o));
ck('and the limit is honoured', uses('mats', 'FLAP DISC 4"', HIST, 1).length === 1);

console.log('\nan analysed spreadsheet is never passed off as an issued CE:');
const imported = uses('mats', 'FLAP DISC 4"', HIST).filter(u => !u.issued);
ck('it is still shown -- it is evidence', imported.length === 1);
ck('but flagged as not issued', imported[0].issued === false);
ck('and the popover says so in words', /not a CE this company issued/.test(w));
ck('every saved CE is marked issued',
  uses('mats', 'FLAP DISC 4"', HIST).filter(u => u.issued).every(u => u.ceNum));

console.log('\nand an imported figure never sets the headline range:');
ck('the range is drawn from issued CEs where there are any',
  /var issued = uses\.filter\(function \(u\) \{ return u\.issued; \}\);/.test(w) &&
  /var basis = issued\.length \? issued : uses;/.test(w),
  'flagging 999 amber in the list and then printing "P40.00 to P999.00" above it puts the doubt straight back');
ck('the count matches the range it describes', /basis\.length \+ \(uses\.length === 10/.test(w));
ck('and where every row is imported it says so', /\(imported, none issued\)/.test(w),
  'showing the range with no caveat would pass an unverified figure off as settled');

console.log('\nit refuses a type whose line items are not stored under that name:');
ck('misc is not offered', uses('misc', 'ANYTHING', HIST).length === 0,
  "a saved CE's misc is an object of totals, so this would always be empty and look like 'never used'");
ck('nor is an invented one', uses('nonsense', 'ANYTHING', HIST).length === 0);

console.log('\nit is on the row, in every editor:');
ck('tools, consumables and PPE', /React\.createElement\(RateHistory, \{\s*kind: mlType === 'materials' \? 'mats' : mlType,/.test(res));
ck('manpower', /kind: 'mp',\s*name: r\.role,/.test(app));
ck('mobilisation and demobilisation', /kind: 'vehicles',\s*name: r\.desc,/.test(app));
ck('clicking a past rate adopts it', /onPick/.test(res) && /onPick: v =>/.test(app));
ck('the manpower average is kept alongside it', /Avg: ₱/.test(app),
  '"is this normal" and "what exactly did we charge" are different questions');

console.log('\nand the absence of history is visible too:');
ck('the clock dims when nothing was found', /opacity: has \? 1 : 0\.28/.test(w));
ck('and says so when opened', /Never costed before/.test(w),
  'an item nobody has bought is worth a second look before it goes out priced');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nrate history OK');
process.exit(bad ? 1 : 0);
