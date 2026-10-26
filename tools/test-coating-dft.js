#!/usr/bin/env node
/* Coating (DFT) calculator: spread from volume solids and dry film, then the same loss allowance as Painting.
   Run: node tools/test-coating-dft.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('src/components/Calculators.js', 'utf8');
const X = {}; vm.createContext(X); vm.runInContext(src.replace(/\bconst (CALC_\w+)/g, 'var $1') + ';this.calcKindState=calcKindState;this.calcRun=calcRun;this.calcStd=calcStd;this.calcUsed=calcUsed;this.CALC_KINDS=CALC_KINDS;', X);
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const near = (a, b) => Math.abs(a - b) < 0.01;
const std = X.calcStd(null);
ck('the calculator is listed', X.CALC_KINDS.some(k => k.id === 'coating'));
let st = X.calcKindState('coating', std), r = X.calcRun('coating', st.jobs[0], st);
ck('primer spread 60% solids at 75 um = 8 m2/L', near(r.rows[0].buy, 8));
ck('primer wet film 125 um', near(r.rows[1].buy, 125));
ck('primer 80 m2 at 8 m2/L = 10 L net, 13.33 L bought with 25% spray loss', near(r.rows[2].net, 10) && near(r.rows[2].buy, 13.33));
ck('thinner is 25% of the paint to buy', near(r.rows[9].buy, (r.lines[0].raw + r.lines[1].raw + r.lines[2].raw) * 0.25));
st.incl = true; r = X.calcRun('coating', st.jobs[0], st);
ck('no extra loss when asked', near(r.rows[2].buy, 10));
st.jobs[0].vals.d1 = 0; r = X.calcRun('coating', st.jobs[0], st);
ck('a zero film thickness gives no litres, not infinity', r.rows[2].buy === 0 && isFinite(r.lines[0].raw));
ck('only the method in use is recorded', Object.keys(X.calcUsed('coating', X.calcKindState('coating', std))).join() === 'spray');
process.exit(bad ? 1 : 0);
