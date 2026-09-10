#!/usr/bin/env node
/*
 * The shift and overtime multipliers are data the CE carries.
 *
 * They were constants, so the day DOLE or the company changes one, every CE
 * ever written silently reprices -- including the ones already sent to a
 * client. This project settled that question once for rates: a CE keeps what
 * it was quoted at. The same answer applies here.
 *
 * The property everything else depends on: a CE with no `rates` -- which is
 * every CE saved before this -- resolves to the statutory figures and costs
 * exactly what it always did. That is asserted numerically below, not assumed.
 *
 * Run: node tools/test-editable-multipliers.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const raw = fs.readFileSync('src/App.js', 'utf8');
const app = raw.replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const SHIFTS = {
  regular_day: {mult: 1}, regular_night: {mult: 1.25},
  sunday_day: {mult: 1.3}, sunday_night: {mult: 1.625},
  holiday_day: {mult: 2}, holiday_night: {mult: 2.5}
};
const src =
  (help.match(/const OT_MULT_DEFAULT[\s\S]*?\nfunction ceOtMult\(rates\) \{[\s\S]*?\n\}/) || [''])[0] + '\n' +
  (help.match(/function ceMpRowCost\(r, rates\) \{[\s\S]*?\n\}/) || [''])[0];
if (!/function ceRates/.test(src) || !/ceMpRowCost/.test(src)) { console.error('resolvers not found'); process.exit(1); }
const ctx = {SHIFTS, N: v => parseFloat(v) || 0, Object, parseFloat, isFinite};
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._r=ceRates;globalThis._s=ceShiftMult;globalThis._o=ceOtMult;globalThis._c=ceMpRowCost;globalThis._D=OT_MULT_DEFAULT;',
  ctx);
const R = ctx._r, S = ctx._s, O = ctx._o, C = ctx._c, DEF = ctx._D;

console.log('a CE that carries nothing prices at the statutory figures:');
for (const k of Object.keys(SHIFTS))
  ck(k + ' = ' + SHIFTS[k].mult, S(R(null), k) === SHIFTS[k].mult);
ck('and OT at ' + DEF, O(R(null)) === DEF);
ck('the default is 1.25', DEF === 1.25);

console.log('\nwhich is the whole point — nothing already saved reprices:');
const row = {role: 'WELDER', pax: 2, days: 10, rate: 1100, otHours: 3, perDiem: 0, shift: 'regular_night'};
/* What the old constants produced, written out longhand. */
const N = v => parseFloat(v) || 0;
const legacy = (r) => {
  const mult = SHIFTS[r.shift].mult, pax = N(r.pax), days = N(r.days), rate = N(r.rate);
  return pax * days * rate * mult
    + pax * days * (N(r.otHours) / 8) * rate * 1.25 * mult
    + rate / 12 * days * pax
    + rate * 0.25 * 0.75 * days * pax / 26
    + rate * 0.16 * days * pax / 26 * 2
    + (rate * days * pax * 5 / 12 / 26 + pax * 30)
    + N(r.perDiem) * days * pax;
};
for (const k of Object.keys(SHIFTS)) {
  const r = {...row, shift: k};
  ck(k + ' costs the same as before', Math.abs(C(r, R(null)) - legacy(r)) < 1e-9,
    C(r, R(null)) + ' vs ' + legacy(r));
}
ck('and so does a CE with an empty rates object', C(row, R({rates: {}})) === C(row, R(null)));

console.log('\nan edited multiplier changes the cost, and only that CE:');
const priced = R({rates: {shiftMults: {regular_night: 1.5}, otMult: 1.3}});
ck('the shift multiplier is honoured', S(priced, 'regular_night') === 1.5);
ck('the OT multiplier is honoured', O(priced) === 1.3);
ck('an untouched shift keeps its default', S(priced, 'holiday_day') === 2);
ck('the row costs more', C(row, priced) > C(row, R(null)));
ck('and the CE beside it is unaffected', C(row, R(null)) === C(row, R({rates: {}})),
  'the rates live on the CE, so one estimate cannot reprice another');

console.log('\nnonsense falls back rather than pricing work at nothing:');
for (const v of [0, -1, '', null, undefined, 'abc', NaN])
  ck('shift ' + JSON.stringify(v) + ' -> default',
    S(R({rates: {shiftMults: {holiday_day: v}}}), 'holiday_day') === 2);
for (const v of [0, -1, '', null, 'abc'])
  ck('OT ' + JSON.stringify(v) + ' -> default', O(R({rates: {otMult: v}})) === DEF);
ck('an unknown shift key is 1, not undefined', S(R(null), 'nonsense') === 1);

console.log('\nboth compound on an overtime hour:');
const both = R({rates: {shiftMults: {regular_night: 2}, otMult: 2}});
const base = {role: 'W', pax: 1, days: 1, rate: 800, otHours: 8, perDiem: 0, shift: 'regular_night'};
/* 8 OT hours = one full hourly-rate day at 100/8; x2 shift x2 OT = 4x. */
ck('the OT portion is shift x OT', Math.abs(
  (C(base, both) - C({...base, otHours: 0}, both)) - (1 * 1 * (8 / 8) * 800 * 2 * 2)) < 1e-9);

console.log('\nthe editor writes only what differs:');
ck('setting a value back to its default removes it',
  /if \(!isFinite\(v\) \|\| v <= 0 \|\| v === shiftInfo\.mult\) delete m\[shiftKey\]/.test(app),
  'storing a copy of the default would freeze this CE against a future change to it');
ck('and the same for OT', /if \(!isFinite\(v\) \|\| v <= 0 \|\| v === OT_MULT_DEFAULT\) delete n\.otMult/.test(app));
ck('a changed multiplier is marked', /shiftMult !== shiftInfo\.mult &&/.test(app),
  'a rate nobody can see has been changed is how a CE goes out mispriced');

console.log('\nit is carried, restored and noticed:');
ck('saved on the CE', (app.match(/rates: \{\.\.\.rates\}/g) || []).length === 2);
ck('restored on load', /setRates\(d\.rates \|\| \{\}\)/.test(app));
ck('and on a resumed draft', /setRates\(d\.rates \? \{\.\.\.d\.rates\} : \{\}\)/.test(app));
ck('in the unsaved-work signature', /verifyNotes, rates\]/.test(app),
  'left out, an edited multiplier would never trigger an autosave');
ck('resolved once per render', /const rr = useMemo\(\(\) => ceRates\(\{rates\}\), \[rates\]\)/.test(app));

console.log('\nnothing still reads the constants directly:');
ck('no SHIFTS[...].mult in a cost expression', !/SHIFTS\[[^\]]*\]\??\.?mult/.test(app),
  'one site left behind is one screen that disagrees with the total');
ck('no bare 1.25 left', !/\* 1\.25|\*1\.25/.test(app));
ck('the comparison view prices each CE at its own rates', /const _r = ceRates\(ce\);/.test(app),
  "comparing two estimates must not price one at the other's multipliers");

console.log('\nand the captions read the live values:');
ck('the sidebar', /"Night ." \+ ceShiftMult\(rr, 'regular_night'\)/.test(raw));
ck('the OT tooltip', /charged at " \+ ceOtMult\(rr\)/.test(raw),
  'a fixed caption goes on claiming 1.25x the moment somebody edits it');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\neditable multipliers OK');
process.exit(bad ? 1 : 0);
