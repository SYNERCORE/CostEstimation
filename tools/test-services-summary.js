#!/usr/bin/env node
/*
 * Some clients want the CE total restated by service -- SAND BLASTING WORKS,
 * WELDING WORKS, MECHANICAL WORKS -- under the cost summary.
 *
 * A main scope item names its service group; its sub-items come with it.
 * "Other misc. to the project" is the remainder of the grand total, so the
 * services always add back to the cost total. The CE this was modelled on
 * (SHIC-CE-2026-1078) was built by hand in Excel and its services came to
 * exactly P2,800,000 less than its total -- the one mistake this block must
 * make impossible.
 *
 * Run: node tools/test-services-summary.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const near = (a, b) => Math.abs(a - b) < 0.005;

const m = app.match(/const servicesSummary = \(\(\) => \{[\s\S]*?\n  \}\)\(\);/);
if (!m) { console.error('servicesSummary not found in src/App.js'); process.exit(1); }
const run = (sowItems, costs, grand, show) => new Function('sowItems', 'taskCostRollup', 'grand', 'info',
  m[0] + '\nreturn servicesSummary;')(sowItems, it => costs[it.id] || 0, grand, {showServices: show});

const main = (id, group) => ({id, type: 'main', text: id, group});
const sub = id => ({id, type: 'sub', text: id});

console.log('lines follow the groups:');
let s = run([main('a', 'Sand Blasting Works'), sub('a1'), main('b', 'Welding Works'), main('c', 'sand blasting works'), main('d', '')],
  {a: 100, b: 50, c: 25, d: 10}, 300, true);
ck('one line per group', s.lines.length === 2, s.lines.map(l => l.label).join());
ck('in the order the scope lists them', s.lines[0].label === 'Sand Blasting Works');
ck('items sharing a group, however typed, add into one line', near(s.lines[0].v, 125) && s.lines[0].items.join() === 'a,c');
ck('sub-items are not lines of their own', !s.lines.some(l => l.items.includes('a1')));
ck('an ungrouped item and everything unlinked fall to Other', near(s.other, 125), s.other);
ck('so the services add back to the grand total',
  near(s.lines.reduce((t, l) => t + l.v, 0) + s.other, 300));
ck('and it is fine to print', s.ok && s.on);

console.log('\nswitched per CE:');
ck('off unless the CE asks for it', run([main('a', 'X')], {a: 1}, 1, false).on === false);
ck('and nothing to print with no groups named', run([main('a', '')], {a: 1}, 1, true).on === false);

console.log('\na cost counted twice is caught:');
s = run([main('a', 'A'), main('b', 'B')], {a: 80, b: 80}, 100, true);
ck('the remainder goes negative', s.other < 0);
ck('and the block is refused', s.ok === false);

console.log('\nit reaches every copy of the CE:');
ck('the printed CE', /servicesSummary\.on && servicesSummary\.ok \? `<tr><td colspan="3" class="c b"/.test(app));
ck('the styled workbook', /sum\.push\(\[S\('SERVICES', 'sec'\)\]\);/.test(app));
ck('the plain workbook', /a\.title\('SERVICES', 3\);/.test(app));
ck('each prints the services total', (app.match(/SERVICES TOTAL AMOUNT:/g) || []).length >= 3);
ck('the group is typed on the main scope item', /it\.type === 'main' && \/\*#__PURE__\*\/React\.createElement\("input", \{\s*list: 'svc-groups'/.test(app));
ck('the toggle is stored on the CE info', /setInfo\(p=>\(\{\.\.\.p, showServices:v\}\)\)/.test(app));
ck('and a double count is explained on screen', /counted under two services/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nservices summary OK');
process.exit(bad ? 1 : 0);
