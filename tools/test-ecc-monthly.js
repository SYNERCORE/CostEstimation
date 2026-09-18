#!/usr/bin/env node
/*
 * The P30 ECC: once per person per month on new CEs; per shift row on every
 * CE quoted before, which keeps what it was quoted at.
 *
 * Run: node tools/test-ecc-monthly.js
 */
'use strict';
const fs = require('fs');
const h = fs.readFileSync('src/helpers.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const grab = re => { const m = h.match(re); if (!m) throw new Error('not found ' + re); return m[0]; };
const N = v => parseFloat(v) || 0;
const ecc = new Function('N', grab(/const ECC_MONTHLY = 30;/) + grab(/const ECC_MONTH_DAYS = 26;/) +
  grab(/function eccByRow\(mp, rates\) \{[\s\S]*?\n\}/) + 'return eccByRow;')(N);
const sum = (mp, rule) => { const m = ecc(mp, { eccRule: rule }); return Math.round(mp.reduce((s, r) => s + (m.get(r) || 0), 0) * 100) / 100; };

const sup = [
  { role: 'Supervisor', pax: 1, days: 1, shift: 'regular_day' },
  { role: 'Supervisor', pax: 1, days: 1, shift: 'sunday_day' },
  { role: 'Supervisor', pax: 1, days: 1, shift: 'holiday_day' }
];
console.log('the reported case -- one supervisor on three day types:');
ck('old rule: P30 on every row, P90', sum(sup, 'row') === 90);
ck('new rule: one man, one month, P30', sum(sup, 'month') === 30, sum(sup, 'month'));

console.log('\nper person per month:');
ck('2 welders x 20 days is one month each: P60', sum([{ role: 'Welder', pax: 2, days: 20, shift: 'regular_day' }], 'month') === 60);
ck('2 welders x 40 days is two months each: P120', sum([{ role: 'Welder', pax: 2, days: 40, shift: 'regular_day' }], 'month') === 120);
ck('26 working days is exactly one month', sum([{ role: 'Welder', pax: 1, days: 26, shift: 'regular_day' }], 'month') === 30);
ck('27 is two', sum([{ role: 'Welder', pax: 1, days: 27, shift: 'regular_day' }], 'month') === 60);
ck('day and night crews are different people', sum([
  { role: 'Rigger', pax: 2, days: 10, shift: 'regular_day' },
  { role: 'Rigger', pax: 1, days: 10, shift: 'regular_night' }], 'month') === 90);
ck('the same crew on two tasks is not counted twice', sum([
  { role: 'Welder', pax: 4, days: 5, shift: 'regular_day', taskId: 'a' },
  { role: 'Welder', pax: 4, days: 5, shift: 'regular_day', taskId: 'b' }], 'month') === 120);
const m = ecc(sup, { eccRule: 'month' });
ck('each row carries its share, adding back to the role total', Math.abs(sup.reduce((s, r) => s + m.get(r), 0) - 30) < 1e-9 && Math.abs(m.get(sup[0]) - 10) < 1e-9);
ck('a row with no role carries none', ecc([{ role: '', pax: 3, days: 1 }], { eccRule: 'month' }).size === 0);

console.log('\nwho gets which rule:');
ck('a CE with no rule stays on the old one', /eccRule: raw\.eccRule === 'month' \? 'month' : 'row'/.test(h));
ck('a new CE is stamped with the monthly rule', /otMult: s\.otMult, eccRule: 'month' \}/.test(h));
ck('the saved-CE recompute uses the CE\'s rule', /const _mpRates = \{ \.\.\._rates, _ecc: eccByRow\(arr\(ce\.mp\), _rates\) \};/.test(h) && /ceMpRowCost\(r, _mpRates, ce\.ceType\)/.test(h));
ck('and so does the editor', /const eccMap = useMemo\(\(\) => eccByRow\(mp, rr\), \[mp, rr\]\);/.test(app) && /const sil = rate \* days \* pax \* 5 \/ 12 \/ 26 \+ ecc;/.test(app));

ck('a request built out, or a clone, is a new quote on the new rule',
  /d\.info && d\.info\.request \? \{\.\.\.stampRates\(\), \.\.\.\(d\.rates \|\| \{\}\), eccRule: 'month'\}/.test(app) &&
  /e && e\._newQuote \? \{\.\.\.\(d\.rates \|\| \{\}\), eccRule: 'month'\}/.test(app) && /handleLoad\(\{\.\.\.d, _newQuote: true,/.test(app));

console.log(bad ?'\n' + bad + ' FAILURE(S)' : '\nECC OK');
process.exit(bad ? 1 : 0);
