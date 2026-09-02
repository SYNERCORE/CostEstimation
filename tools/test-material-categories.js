#!/usr/bin/env node
/*
 * Materials need categories that describe a material.
 *
 * The tab offered Electrical / Mechanical / Civil / General -- the discipline
 * list, borrowed. It says nothing about a material, so every abrasive, gas,
 * chemical and fastener in a 1,224-line warehouse landed in one of four
 * buckets, and the Materials tab could not be filtered, searched by category,
 * or reported on.
 *
 * These come from the warehouse export's own Category column, with the
 * "(INV)-WHD" suffix dropped and the pairs the warehouse splits but a CE never
 * does merged into one.
 *
 * Run: node tools/test-material-categories.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = (cfg.match(/const MATERIAL_CATEGORIES = \[[\s\S]*?\n\];/) || [''])[0];
if (!src) { console.error('MATERIAL_CATEGORIES not found in src/config.js'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._m=MATERIAL_CATEGORIES;', ctx);
const MC = ctx._m;

console.log('the list is usable:');
ck('it is longer than the four disciplines it replaced', MC.length > 4, MC.length);
ck('and short enough to scan', MC.length <= 30, MC.length);
ck('every entry is a non-empty string', MC.every(c => typeof c === 'string' && c.trim()));
ck('nothing is listed twice', new Set(MC).size === MC.length);
ck('it is alphabetical', MC.join('|') === [...MC].sort().join('|'),
  'any other order has to be learned');

console.log('\nit describes a material, not a discipline:');
for (const d of ['Mechanical', 'Civil'])
  ck('"' + d + '" is not a material category', MC.indexOf(d) < 0);
ck('General is still there for the uncategorised', MC.indexOf('General') >= 0);

console.log('\nthe warehouse categories are covered:');
for (const w of ['Abrasives', 'Welding', 'Electrical', 'Hardware', 'Sandblasting',
                 'Machining', 'Painting', 'NDT', 'Industrial Gases', 'Fuel',
                 'Cleaning', 'Cutting', 'Plumbing', 'Preservation'])
  ck(w, MC.some(c => c.indexOf(w) >= 0));

console.log('\nbut PPE is not duplicated here:');
ck('no PPE category', !MC.some(c => /\bPPE\b|Protective|Uniform/i.test(c)),
  'PPE has its own tab; a second home for it invites the same item costed twice');

console.log('\nand both editors offer the list:');
ck('the masterlist Materials tab', /materials: MATERIAL_CATEGORIES,/.test(app));
ck('the CE row editor', /type === 'mats' \? MATERIAL_CATEGORIES :/.test(app));
ck('a material filed under an older category keeps it',
  /r\.cat && catOpts\.indexOf\(r\.cat\) < 0 \? \[r\.cat\] : \[\]/.test(app),
  'nothing here re-files anything');
ck('an uncategorised row does not read as the first entry alphabetically',
  /catOpts\.indexOf\('General'\) >= 0 \? 'General' : catOpts\[0\]/.test(app),
  "with nineteen categories, catOpts[0] shows an uncategorised material as an abrasive");

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmaterial categories OK (' + MC.length + ')');
process.exit(bad ? 1 : 0);
