#!/usr/bin/env node
/* Surface area, abrasive, dew point and airless tip calculators.
   Run: node tools/test-paint-calculators.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('src/components/Calculators.js', 'utf8');
const X = {}; vm.createContext(X);
vm.runInContext(src.replace(/\bconst (CALC_\w+)/g, 'var $1') + ';this.calcKindState=calcKindState;this.calcRun=calcRun;this.calcStd=calcStd;this.calcAggregate=calcAggregate;', X);
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const near = (a, b, e) => Math.abs(a - b) < (e || 0.01);
const std = X.calcStd(null);
const run = (k, set) => { const st = X.calcKindState(k, std); Object.assign(st.jobs[0].vals, set || {}); return { st, r: X.calcRun(k, st.jobs[0], st) }; };

let o = run('area', { tD: 10, tH: 8, tR: 1, tF: 0, pOD: 0, plL: 0, sA: 0, sL: 0 });
ck('tank shell pi x 10 x 8 = 251.33 m2', near(o.r.rows[0].buy, 251.33));
ck('flat roof pi x 10 x 10 / 4 = 78.54 m2', near(o.r.rows[1].buy, 78.54));
ck('floor left out when 0', o.r.rows[2].buy === 0);
ck('total adds every part', near(o.r.rows[6].buy, 251.33 + 78.54));
o = run('area', { tD: 0, pOD: 100, pL: 10, pIn: 1, plL: 2, plW: 1, plN: 3, plB: 1, sA: 0.78, sL: 100 });
ck('pipe both sides doubles', near(o.r.rows[3].buy, Math.PI * 0.1 * 10 * 2));
ck('three 2 x 1 plates, both faces = 12 m2', near(o.r.rows[4].buy, 12));
ck('steel 0.78 m2/m x 100 m = 78 m2', near(o.r.rows[5].buy, 78));

o = run('abrasive');
ck('80 m2 x 40 kg = 3200 kg', near(o.r.rows[0].buy, 3200));
ck('3200 / 25 = 128 bags', o.r.rows[1].buy === 128 && o.r.lines[0].raw === 128);
ck('80 m2 at 8 m2/h = 10 h', near(o.r.rows[2].buy, 10));
ck('a zero bag weight does not divide by zero', isFinite(run('abrasive', { bag: 0 }).r.rows[1].buy));

o = run('dewpoint', { air: 30, rh: 80, steel: 28 });
ck('30 C at 80% RH has a dew point near 26.2 C', near(o.r.rows[0].buy, 26.17, 0.1));
ck('steel only 1.8 C above is not OK', /DO NOT COAT/.test(o.r.rows[1].extra));
o = run('dewpoint', { air: 30, rh: 50, steel: 28 });
ck('30 C at 50% RH has a dew point near 18.4 C', near(o.r.rows[0].buy, 18.4, 0.1));
ck('steel 9 C above is OK', o.r.rows[1].extra === 'OK to coat');
ck('0% humidity does not break it', isFinite(run('dewpoint', { rh: 0 }).r.rows[0].buy));

o = run('tip');
ck('100 m2/h at 125 um and 65% = 3.2 L/min', near(o.r.rows[0].buy, 100 * 0.125 / 60 / 0.65, 0.01));
ck('the chosen tip passes at least the flow needed', o.r.rows[3].buy >= o.r.rows[0].buy);
ck('so it can spray at least the area asked', o.r.rows[4].buy >= 100 - 0.01);
ck('zero pressure does not break it', isFinite(run('tip', { bar: 0 }).r.rows[1].buy));
process.exit(bad ? 1 : 0);
