#!/usr/bin/env node
/*
 * Export CE Template (CE Summary sheet): the orange bars were 7 columns wide at the top and 3 wide for NOTE and SIGNATORIES, and
 * long notes and the client location ran past the bar. Every bar is now the header's width, long text wraps in a merged cell sized
 * to its length, and column A is wide enough for its labels. The writer takes a row height from a cell's ht.
 *
 * Run: node tools/test-template-xlsx-bars.js
 */
'use strict';
const fs = require('fs');
const out = fs.readFileSync('src/components/CeOutput.js', 'utf8');
const xl = fs.readFileSync('src/xlsx-styled.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = out.indexOf("sheet('CE Summary'"), b = out.indexOf('}, CS_COLS);', a);
ck('the CE Summary sheet is found', a > 0 && b > a);
const body = out.slice(a, b);
ck('the header, notes, signatories, highlighted costs and services bars all use the same width',
  /docHead\(a, 'COST ESTIMATE SUMMARY', CS_W\)/.test(body) && ['NOTE', 'SIGNATORIES', 'SERVICES'].every(t => body.includes("a.title('" + t + "', CS_W)")) && /HIGHLIGHTED COSTS \(already included above\)', CS_W\)/.test(body));
ck('no bar is left at 3 columns', !/a\.title\([^)]*, 3\)/.test(body));
ck('column A is wider than the old 7', /CS_COLS = \[(\d+),/.test(out) && +out.match(/CS_COLS = \[(\d+),/)[1] >= 18);
ck('notes, description, material and location wrap', (body.match(/wrapIn\(/g) || []).length >= 5);

const m = out.match(/const wrapIn = [^\n]*/);
const wrapIn = new Function(m[0] + '\nreturn wrapIn;')();
ck('a short note keeps the default height', wrapIn('short', 5, 105).ht === undefined);
ck('a long note is given a taller row', wrapIn('x'.repeat(250), 5, 105).ht === 43.2, String(wrapIn('x'.repeat(250), 5, 105).ht));
ck('the writer puts a cell\'s ht on its row', /rowHt/.test(xl) && /customHeight="1"/.test(xl));
ck('a merged bar or note widens the sheet to the column it reaches', /c\.span > 0 \? Math\.max\(e, i \+ c\.span \+ 1\)/.test(out));

const sw = out.slice(out.indexOf("sheet('Scope of Work'"), out.indexOf('if (noAmt) stripSheetAmounts(sheets);'));
ck('Scope of Work has a full-width bar and wraps each item inside it', /docHead\(a, 'SCOPE OF WORK', CS_W\)/.test(sw) && (sw.match(/wrapIn\(/g) || []).length === 2 && /\}, CS_COLS\);/.test(sw));
ck('the benefits bar is as wide as its table, with or without the incentive column', /a\.title\('BENEFITS AND OTHERS', incOn \? 12 : 11\)/.test(out));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntemplate workbook bars OK');
process.exit(bad ? 1 : 0);
