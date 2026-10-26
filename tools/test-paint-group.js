#!/usr/bin/env node
/* The six painting calculators sit under one Painting tab with a row of their own. Run: node tools/test-paint-group.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('src/components/Calculators.js', 'utf8');
const X = {}; vm.createContext(X); vm.runInContext(src.replace(/\bconst (CALC_\w+)/g, 'var $1') + ';this.K=CALC_KINDS;', X);
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const g = X.K.filter(k => k.grp === 'Painting').map(k => k.id).join();
ck('the six painting calculators are grouped', g === 'painting,coating,area,abrasive,dewpoint,tip');
ck('the others are not', X.K.filter(k => !k.grp).map(k => k.id).join() === 'babbitt,welding,cut1d,cut2d');
ck('the top row shows one Painting tab and a second row lists its members', src.includes("calc-tabs calc-sub") && src.includes('k.grp || k.label'));
process.exit(bad ? 1 : 0);
