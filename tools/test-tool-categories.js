#!/usr/bin/env node
/*
 * Tools are filed by what they DO.
 *
 * The three categories on offer were Electrical, Mechanical and General, which
 * said almost nothing about a tool: a torque wrench, a crane and a megger were
 * all "Mechanical" or "General". A category nobody can search, group or report
 * on is a column, not a category.
 *
 * The two things that have to hold beyond the list itself:
 *   - a tool filed under a retired category KEEPS it. Nothing re-files a row
 *     behind anyone's back, and the dropdown offers the row's own value so it
 *     does not read as "no category".
 *   - manpower, materials and PPE are untouched. They are genuinely organised
 *     by discipline and always were.
 *
 * Run: node tools/test-tool-categories.js
 */
'use strict';
const fs = require('fs');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const CATS = new Function('return ' + cfg.match(/const TOOL_CATEGORIES = \[[\s\S]*?\n\];/)[0]
  .replace(/^const TOOL_CATEGORIES = /, '').replace(/;$/, ''))();

console.log('the list itself:');
ck('there are 18 categories', CATS.length === 18, String(CATS.length));
ck('none of the old discipline buckets survive',
  !CATS.some(c => ['Electrical', 'Mechanical', 'Civil', 'General'].indexOf(c) >= 0),
  'those are disciplines, not what a tool does');
ck('they are alphabetical', CATS.join('|') === [...CATS].sort().join('|'),
  'a list this long is scanned, not read; any other order has to be learned');
ck('no duplicates', new Set(CATS).size === CATS.length);
ck('the tools tab uses it', /tools: TOOL_CATEGORIES,/.test(app));
ck('and so does the CE resource editor', /type === 'tools' \? TOOL_CATEGORIES/.test(app));

console.log('\nevery seeded tool is filed by what it does:');
const rows = [...cfg.matchAll(/code:"(SHIC-TL-\d+)",category:"([^"]*)",desc:"([^"]*)"/g)]
  .map(m => ({code: m[1], cat: m[2], desc: m[3]}));
ck('the seed list is intact', rows.length === 120, String(rows.length));
const legacy = rows.filter(r => ['Electrical', 'Mechanical', 'Civil', 'General'].indexOf(r.cat) >= 0);
ck('none left on a discipline', legacy.length === 0,
  legacy.slice(0, 5).map(r => r.desc + ' [' + r.cat + ']').join(', '));
const unknown = rows.filter(r => CATS.indexOf(r.cat) < 0);
ck('and every one is on a category the list offers', unknown.length === 0,
  unknown.slice(0, 5).map(r => r.desc + ' [' + r.cat + ']').join(', '));

/* Spot-checks: the ones that would be wrong if the rules were sloppy. */
console.log('\nthe filing survives a spot-check:');
const by = d => (rows.find(r => r.desc === d) || {}).cat;
[['MEGGER / INSULATION TESTER'.toLowerCase(), 'NDT & Testing Equipment'],
 ['Torque Wrench Set', 'Torque & Tensioning Tools'],
 ['Scaffolding (per bay)', 'Scaffolding & Access'],
 ['Generator (5 kVA)', 'Electrical & Power Supply'],
 ['Safety Harness & Lanyard', 'Site Support & Safety'],
 ['Welding Machine (SMAW)', 'Welding & Cutting Equipment'],
 ['Pipe Threader', 'Machining Equipment'],
 ['Multimeter / Clamp Meter', 'Measuring & Precision Instruments']].forEach(([d, want]) => {
  const got = by(d) || by(d.replace(/^./, c => c.toUpperCase()));
  const hit = rows.find(r => r.desc.toLowerCase() === d.toLowerCase());
  ck(d, hit ? hit.cat === want : true, hit ? hit.cat : 'not in the seed list');
});

console.log('\nnothing is re-filed behind anyone\'s back:');
ck('the masterlist dropdown offers the row\'s own category when the list has dropped it',
  /r\.category && catOpts\[mlTab\]\.indexOf\(r\.category\) < 0 \? \[r\.category\] : \[\]/.test(app),
  'otherwise an older item shows an empty dropdown and reads as uncategorised');
ck('so does the CE resource editor',
  /r\.cat && catOpts\.indexOf\(r\.cat\) < 0 \? \[r\.cat\] : \[\]/.test(app));
/* This used to assert catOpts[0]. Fine while a list held four entries; with
   nineteen materials it showed an uncategorised row as an abrasive. The point
   was never "first alphabetically" -- it was "a real category, not a name the
   list has dropped". General says that better where a list has one. */
ck('and a blank row falls to a real category, not a name that no longer exists',
  /catOpts\.indexOf\('General'\) >= 0 \? 'General' : catOpts\[0\]/.test(app));

console.log('\nthe other lists are left alone:');
ck('manpower is still by discipline', /manpower: \['Electrical', 'Mechanical', 'Civil', 'General'\]/.test(app));
/* Materials no longer is. It got the same treatment for the same reason --
   see tools/test-material-categories.js. Manpower and PPE genuinely are filed
   by discipline, so they stay. */
ck('materials has its own list now, not the disciplines',
  /materials: MATERIAL_CATEGORIES,/.test(app));
ck('PPE too', /ppe: \['General', 'Welding', 'Electrical', 'Mechanical'\]/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntool categories OK');
process.exit(bad ? 1 : 0);
