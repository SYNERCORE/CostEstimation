#!/usr/bin/env node
/*
 * The Masterlist picker used to build every row at once, so a Masterlist of a few thousand rows took about a second to open and put 19,000
 * nodes on the page. It now shows a page of rows at a time. This pins that: the rows go through the paged component, a search starts it
 * over from the first page, and Select All still covers every matching row, not only the ones on screen.
 *
 * Run: node tools/test-picker-pages.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PickerDialog.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

ck('the rows are drawn by PickerRows, not mapped inline', /createElement\(PickerRows, \{/.test(src) && !/items\.map\(item =>/.test(src));
ck('PickerRows keeps its own page count', /function PickerRows[\s\S]*?React\.useState\(PICKER_PAGE\)/.test(src));
ck('only a page is sliced into the list', /items\.slice\(0, shown\)\.map\(renderRow\)/.test(src));
ck('a Show more button adds another page', /setShown\(n => n \+ PICKER_PAGE\)/.test(src));
ck('a search (or another list) starts it over from page one', /key: picker\.type \+ '\|' \+ q/.test(src));
ck('the page is a sensible size', (() => { const m = src.match(/const PICKER_PAGE = (\d+)/); return m && +m[1] >= 50 && +m[1] <= 250; })());
ck('Select All still works on every matching row', /items\.forEach\(i => \{\s*n\[i\.id\] = i;/.test(src) && /items\.every\(i => sel\[i\.id\]\)/.test(src),
  'it must use items, the whole filtered list, not the visible slice');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\npicker pages OK');
process.exit(bad ? 1 : 0);
