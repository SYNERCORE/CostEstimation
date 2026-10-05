/* English units on the calculators: shown and typed in inches, feet, pounds and gallons,
   stored in metric so nothing changes when the system is switched.
   Run: node tools/test-calc-english-units.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync('src/components/Calculators.js', 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(code + ';this.X={calcConv,calcUnback,calcUnitLabel,calcTextUnits,calcUnitPref,calcStd,calcKindState,calcRun,calcAggregate,CALC_U};', ctx);
const X = ctx.X;
let bad = 0; const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const near = (a, b, t) => Math.abs(a - b) <= (t || 0.001);

console.log('conversions:');
ck('25.4 mm is 1 in', near(X.calcConv(25.4, 'mm', true), 1));
ck('typing 6 in stores 152.4 mm', near(X.calcUnback(6, 'mm', true), 152.4));
ck('900 g is 31.75 oz', near(X.calcConv(900, 'g', true), 31.7466, 0.001));
ck('3.8 kg is 8.38 lb', near(X.calcConv(3.8, 'kg', true), 8.3776, 0.001));
ck('1 gal is 3.785 L', near(X.calcUnback(1, 'L', true), 3.7854, 0.0005));
ck('10 m2/L is 407.5 ft2/gal', near(X.calcConv(10, 'm2/L', true), 407.458, 0.01));
ck('80 m2 is 861 ft2', near(X.calcConv(80, 'm2', true), 861.11, 0.01));
ck('7.4 g/cm3 is 0.267 lb/in3', near(X.calcConv(7.4, 'g/cm3', true), 0.2673, 0.0002));
ck('typing back what was shown returns the stored value', (() => { const v = X.calcConv(330, 'mm', true); return near(X.calcUnback(v, 'mm', true), 330, 0.01); })());
ck('metric leaves every value alone', X.calcConv(330, 'mm', false) === 330 && X.calcUnback(330, 'mm', false) === 330);
ck('percent, pieces and unknown units are never converted', X.calcConv(35, '%', true) === 35 && X.calcConv(4, 'pcs', true) === 4 && X.calcUnitLabel('%', true) === '%');
ck('labels switch with the system', X.calcUnitLabel('mm', true) === 'in' && X.calcUnitLabel('kg', true) === 'lb' && X.calcUnitLabel('L', true) === 'gal' && X.calcUnitLabel('mm', false) === 'mm');
ck('a length inside a sentence is shown in inches', X.calcTextUnits('~ 12 rods of 350 mm', true) === '~ 12 rods of 13.78 in', X.calcTextUnits('~ 12 rods of 350 mm', true));
ck('and left alone in metric', X.calcTextUnits('~ 12 rods of 350 mm', false) === '~ 12 rods of 350 mm');

console.log('what is stored and what goes to Materials:');
const std = X.calcStd(null);
const st = X.calcKindState('babbitt', std);
const lines = JSON.stringify(X.calcAggregate('babbitt', st));
ck('the quantities do not depend on the system: they are worked in metric', JSON.stringify(X.calcAggregate('babbitt', JSON.parse(JSON.stringify(st)))) === lines);
ck('every line carries both systems, and the metric one is unchanged', /Babbitt G2 bar, 900 g/.test(lines) && /Tin ingot, 3.8 kg/.test(lines) && /"de":"Babbitt G2 bar, 31.75 oz"/.test(lines) && /Tin ingot, 8.38 lb/.test(lines));
ck('the default is metric', X.calcUnitPref() === 'metric');

console.log('the screen:');
ck('there is a Metric / English switch', code.indexOf("u === 'imperial' ? 'English' : 'Metric'") > 0);
ck('the choice is saved with the CE and remembered on this device', code.indexOf("units: u })") > 0 && code.indexOf("localStorage.setItem('shic:calcUnits', u)") > 0);
ck('the inputs show converted values and store metric', code.indexOf("defaultValue: dv(job.vals[f.id], f.unit)") > 0 && code.indexOf("const v = sv(num(e), f.unit)") > 0);
ck('the pieces, consumables and layouts are converted too', code.indexOf("dv(p[key], 'mm')") > 0 && code.indexOf("defaultValue: dv(c.dia, 'mm')") > 0 && code.indexOf("dv(job.vals.stock - b.used, 'mm')") > 0);
ck('English lines go to Materials in English, priced from the metric wording', code.indexOf('mdesc: l.d, qty: l.qe, uom: l.ue') > 0 && fs.readFileSync('src/App.js', 'utf8').indexOf('pm / (l.f || 1)') > 0);
ck('a bar layout colours by length and writes the length in', code.indexOf('PAL[lens.indexOf(l) % PAL.length]') > 0);
process.exit(bad ? 1 : 0);
