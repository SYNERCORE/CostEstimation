#!/usr/bin/env node
/*
 * Masterlist money is held to centavos.
 *
 * A tool's daily cost is annualCost / 365 and that divides evenly almost
 * never, so the list was showing 52.602739726027394 in a field somebody has
 * to read a price out of. Rounding only on the way to the screen would leave
 * the stored figure ragged, and then an export, a CE built from that row, and
 * the list itself disagree in the third decimal.
 *
 * The one thing this must not do is turn a blank into a zero. An empty cost
 * means "not priced yet" and 0 means "free", and quietly converting the first
 * into the second is how an unpriced item goes out looking deliberate.
 *
 * Run: node tools/test-ml-rounding.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = (app.match(/function mlRound\(ml\) \{[\s\S]*?\n\}/) || [''])[0];
if (!src) { console.error('mlRound not found in src/App.js'); process.exit(1); }
const ctx = { Array, Math, Number, String, parseFloat, isFinite, Object };
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._r=mlRound;', ctx);
const round = ctx._r;

const out = round({
  tools: [
    { desc: 'PENCIL DIE GRINDER', cost: 52.602739726027394 },
    { desc: 'BREAKER', cost: 65.75342465753425 },
    { desc: 'CHAIN WRENCH', cost: 1.4520547945205479 },
    { desc: 'EXACT', cost: 493.15 },
    { desc: 'HALF UP', cost: 2.005 },
    { desc: 'NOT PRICED', cost: '' },
    { desc: 'MISSING' },
    { desc: 'NULL COST', cost: null },
    { desc: 'ZERO', cost: 0 },
    { desc: 'TEXT', cost: 'n/a' }
  ],
  manpower: [{ role: 'WELDER', rate: 1100.3333333, perDiem: 250.666666 }],
  vehicles: [{ desc: 'TRUCK', rate: 8000.129 }]
});
const t = d => out.tools.find(r => r.desc === d);

console.log('a repeating division becomes a price:');
ck('52.602739726027394 -> 52.6', t('PENCIL DIE GRINDER').cost === 52.6, String(t('PENCIL DIE GRINDER').cost));
ck('65.75342465753425 -> 65.75', t('BREAKER').cost === 65.75, String(t('BREAKER').cost));
ck('1.4520547945205479 -> 1.45', t('CHAIN WRENCH').cost === 1.45, String(t('CHAIN WRENCH').cost));
ck('and it rounds rather than truncating', t('HALF UP').cost === 2.01, String(t('HALF UP').cost));

console.log('\nand a blank is still a blank:');
ck("'' does not become 0", t('NOT PRICED').cost === '', JSON.stringify(t('NOT PRICED').cost));
ck('a missing cost is not invented', t('MISSING').cost === undefined);
ck('null stays null', t('NULL COST').cost === null);
ck('a real 0 is left as 0', t('ZERO').cost === 0);
ck('text is left alone rather than becoming NaN', t('TEXT').cost === 'n/a');

console.log('\nevery money field, not just cost:');
ck('manpower rate', out.manpower[0].rate === 1100.33, String(out.manpower[0].rate));
ck('the incentive too', out.manpower[0].perDiem === 250.67, String(out.manpower[0].perDiem));
ck('and vehicles', out.vehicles[0].rate === 8000.13, String(out.vehicles[0].rate));

console.log('\nrows that need no change are not rebuilt:');
const same = { tools: [{ desc: 'A', cost: 10 }] };
ck('an already-round row keeps its identity', round(same).tools[0] === same.tools[0],
  'a new object every pass would make React redraw rows nothing happened to');
ck('a section that is not an array is left alone', round({ tools: 'nonsense' }).tools === 'nonsense');
ck('and a junk masterlist does not throw', round(null) === null && round(undefined) === undefined);

console.log('\nit runs on every path a price can arrive by:');
ck('loading a stored list', /return mlRound\(out\);/.test(app),
  'a list already stored ragged is tidied by opening it, not only by editing every row');
ck('import, calculator, fill and sync', /const ml = mlRound\(_ml\);/.test(app));
ck('and a hand-typed cell', /const rounded = mlRound\(next\);/.test(app));
ck('but not mid-keystroke', !/onChange: e => updML\(r\.id, costKey, mlRound/.test(app),
  'rounding what somebody is halfway through typing rewrites the field under the cursor');
ck('the debounced write persists what the screen shows',
  /const res = await dbSaveML\(rounded\);/.test(app) && /setMasterlist\(rounded\);/.test(app),
  'storing one figure and showing another is the bug this was meant to fix');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmasterlist rounding OK');
process.exit(bad ? 1 : 0);
