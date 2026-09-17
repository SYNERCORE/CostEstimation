#!/usr/bin/env node
/*
 * SHIC and SY3 share one CE number sequence. SHIC-CE-2026-1131 and
 * SY3-CE-2026-1131 were both saved because every check compared the whole
 * number, prefix included.
 *
 * Run: node tools/test-ce-seq-shared.js
 */
'use strict';
const fs = require('fs');
const h = fs.readFileSync('src/helpers.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const grab = (src, name) => { const i = src.indexOf('function ' + name + '('); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); };
const f = new Function(grab(h, 'ceSeqOf') + grab(h, 'nextCeNum') + 'return {ceSeqOf, nextCeNum};')();
const yr = new Date().getFullYear();

console.log('the sequence:');
ck('prefix and revision are stripped', JSON.stringify(f.ceSeqOf('SY3-CE-2026-1131-R1')) === JSON.stringify({prefix: 'SY3', seq: '2026-1131'}));
ck('SHIC and SY3 of one number share a sequence', f.ceSeqOf('SHIC-CE-2026-1131').seq === f.ceSeqOf('SY3-CE-2026-1131').seq);
ck('a non-CE string is not a number', f.ceSeqOf('hello') === null);
ck('next number counts other companies',
  f.nextCeNum([{info: {ceNum: 'SY3-CE-' + yr + '-0020'}}], 'SHIC', ['SHIC-CE-' + yr + '-0007']) === 'SHIC-CE-' + yr + '-0021');
ck('and keeps the requested prefix', f.nextCeNum([], 'SY3', ['SHIC-CE-' + yr + '-0005']) === 'SY3-CE-' + yr + '-0006');

console.log('\nsaving:');
ck('a clash lookup exists', /async function dbFindCESeqClash\(ceNum,known\)/.test(db));
ck('it only counts a different prefix as a clash', /s\.seq===me\.seq&&s\.prefix!==me\.prefix/.test(db));
ck('handleSave refuses a clash', /const _clash = await dbFindCESeqClash\(ceNum, ceNums\)/.test(app));
ck('logging a request refuses one too', /\|\| \(await dbFindCESeqClash\(ceNum, ceNums\)/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nshared CE sequence OK');
process.exit(bad ? 1 : 0);
