#!/usr/bin/env node
/*
 * SOW Breakdown: Split view (a task list beside one task, one resource type at a time) with a List view toggle that is the old stacked
 * screen. Both draw the SAME task card and the same resource tables, so nothing was dropped; this pins the wiring: the view is
 * remembered, the card is shared, every old control is still in it, Unassigned is one entry in the list, and the narrow-window menu
 * and the stylesheet that swaps them are there.
 *
 * Run: node tools/test-sow-breakdown-split.js
 */
'use strict';
const fs = require('fs');
const sb = fs.readFileSync('src/components/SowBreakdownTab.js', 'utf8');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
const html = fs.readFileSync('index.html', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

ck('the view is remembered on the device and defaults to Split', /LS\.get\('sb_view'\) === 'list' \? 'list' : 'split'/.test(app) && /LS\.set\('sb_view', v\)/.test(app));
ck('the pick, the type and the view reach the tab', /SowBreakdownTab\(\{ RES_TABS, sbPick, sbType, sbView, setSbPick, setSbType, setSbView,/.test(app));
ck('Split is anything but "list"', /const split = sbView !== 'list';/.test(sb));
ck('List view still draws one card per task, collapsible, with Collapse/Expand all', /!split && \(sowItems \|\| \[\]\)\.map\(it => card\(it, false\)\)/.test(sb) && /!split && \(sowItems \|\| \[\]\)\.length > 1/.test(sb) && /const open = inSplit \? true : _sbOpen\(it\.id\);/.test(sb));
ck('Split view draws the same card for the selected task', /card\(it, true\)/.test(sb) && /const card = \(it, inSplit\) =>/.test(sb));

/* Every control of the old card is still in the shared card or the tables it draws. */
const keep = [
  ['service group', /list: 'svc-groups'/], ['Shop/Site toggle', /shopsite-toggle/], ['note flag', /title: String\(it\.note\)\.trim\(\)/], ['rolled-up and own cost', /\(own ₱/],
  ['resource count', /resource" \+ \(rollN === 1/], ['copy from', /Copy all resources from another task/], ['breakdown note', /Breakdown note/],
  ['+ Masterlist', /"\+ Masterlist"/], ['+ Blank', /"\+ Blank"/], ['Masterlist autofill', /sb_ml_/], ['unassign row', /Unassign from this task/], ['delete row', /Delete this row entirely/],
  ['shift tag', /sb-shift-tag/], ['shared crew line', /shared crew across/], ['show more / all', /_moreRow/], ['misc category picker', /\+ add to category/],
  ['bulk assign', /bulkAssign/], ['assign a whole shift', /assign whole shift to/], ['unassigned filter', /Filter by description/], ['assigned counter', /resources assigned/]
];
keep.forEach(([n, re]) => ck('kept: ' + n, re.test(sb)));

console.log('\nsplit view:');
ck('the task list has an Unassigned entry, shown only when something is unassigned', /sowUnassignedCount > 0 && [\s\S]{0,200}setSbPick\('__un'\)/.test(sb));
ck('Unassigned shows the same bulk-assign panel (unPanel), also under the cards in List view', /pick === '__un' \? unPanel/.test(sb) && /split \? null : unPanel/.test(sb));
ck('one resource type at a time, with a count and subtotal on each button', /className: 'sb-type'/.test(sb) && /x\.n \? x\.n \+ ' · ₱' \+ ph\(x\.cost\)/.test(sb));
ck('a type with nothing on the task offers + Masterlist and + Blank in place (or the misc category)', /const emptyType = \(cur, taskId\)/.test(sb) && /No " \+ cur\.label \+ " on this task yet/.test(sb));
ck('a stale or missing pick falls back to the first task', /if \(pick !== '__un' && !_items\.some\(x => x\.id === pick\)\) pick = _items\[0\]/.test(sb));
ck('tables sit flush in Split and keep their indent in List', /const IND = split \? 6 : 128;/.test(sb) && !/paddingLeft: 128/.test(sb));
ck('on a narrow window the list becomes a menu', /className: 'sb-pick'/.test(sb) && /@media\(max-width:900px\)\{\.sb-split\{[^}]*\}\.sb-rail\{display:none\}\.sb-pick\{display:block\}/.test(html) && /\.sb-pick\{display:none\}/.test(html));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nSOW Breakdown split view OK');
process.exit(bad ? 1 : 0);
