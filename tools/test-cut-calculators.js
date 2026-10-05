/* The cut-list calculators: how many stock lengths or sheets to buy for a list of pieces.
   Run: node tools/test-cut-calculators.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/components/Calculators.js', 'utf8') +
  ';this.X={calcStd,calcKindState,calcRun,calcAggregate,calcCut1D,calcCut2D,CALC_KINDS};', ctx);
const X = ctx.X;
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const near = (a, b, t) => Math.abs(a - b) <= (t || 0.001);

console.log('bars and pipes:');
let r = X.calcCut1D(6000, 3, [{ len: 1500, qty: 4 }, { len: 900, qty: 6 }]);
ck('the worked example needs 3 stock lengths', r.count === 3 && r.unfit.length === 0);
ck('and 11400 mm of pieces were placed', r.placed === 11400);
ck('waste is 1 - 11400 / 18000', near(r.waste, 1 - 11400 / 18000));
r = X.calcCut1D(1000, 0, [{ len: 500, qty: 4 }]);
ck('four 500s with no kerf fill two 1000s exactly', r.count === 2 && near(r.waste, 0));
ck('495 + 495 fits a 1000 with a 10 kerf', X.calcCut1D(1000, 10, [{ len: 495, qty: 2 }]).count === 1);
ck('496 + 496 does not', X.calcCut1D(1000, 10, [{ len: 496, qty: 2 }]).count === 2);
r = X.calcCut1D(1000, 0, [{ len: 1200, qty: 1 }, { len: 400, qty: 1 }]);
ck('a piece longer than the stock is left out, not forced in', r.unfit.length === 1 && r.count === 1);
ck('an empty list buys nothing', X.calcCut1D(6000, 3, []).count === 0 && X.calcCut1D(6000, 3, [{ len: 0, qty: 5 }]).count === 0);

console.log('sheets and plates:');
r = X.calcCut2D(1000, 1000, 0, [{ w: 500, h: 500, qty: 4 }], true);
ck('four 500 x 500 fill one 1000 x 1000', r.count === 1 && near(r.waste, 0));
ck('a fifth needs a second sheet', X.calcCut2D(1000, 1000, 0, [{ w: 500, h: 500, qty: 5 }], true).count === 2);
ck('a 2000 x 1000 piece does not fit a 1220 wide sheet as given', X.calcCut2D(1220, 2440, 3, [{ w: 2000, h: 1000, qty: 1 }], false).unfit.length === 1);
ck('turned 90 degrees it does', X.calcCut2D(1220, 2440, 3, [{ w: 2000, h: 1000, qty: 1 }], true).count === 1);
r = X.calcCut2D(1000, 1000, 10, [{ w: 495, h: 495, qty: 4 }], true);
ck('four 495 squares fit with a 10 kerf (495 + 10 + 495 = 1000)', r.count === 1);
r = X.calcCut2D(1000, 1000, 10, [{ w: 496, h: 496, qty: 4 }], true);
ck('496 squares do not: each needs its own sheet (496 + 10 + 496 is 1002)', r.count === 4);
ck('no piece overlaps another, and none leaves the sheet', (() => {
  const c = X.calcCut2D(1220, 2440, 3, [{ w: 600, h: 400, qty: 8 }, { w: 300, h: 300, qty: 10 }, { w: 1100, h: 700, qty: 2 }], true);
  return c.sheets.every(s => s.placed.every((a, i) => a.x >= 0 && a.y >= 0 && a.x + a.w <= 1220 + 1e-9 && a.y + a.h <= 2440 + 1e-9 &&
    s.placed.every((b, j) => i === j || a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h)));
})());

console.log('through the calculators:');
const std = X.calcStd(null);
let st = X.calcKindState('cut1d', std), out = X.calcRun('cut1d', st.jobs[0], st);
ck('the default job asks for 3 lengths and says it', out.rows[1].buy === 3 && out.lines.length === 1 && out.lines[0].raw === 3);
st.jobs[0].mat = 'Pipe 6 in SCH40';
let ag = X.calcAggregate('cut1d', st);
ck('the Materials line carries the material and the stock length', ag.length === 1 && ag[0].d === 'Pipe 6 in SCH40, 6000 mm' && ag[0].q === 3 && ag[0].u === 'pc');
st = X.calcKindState('cut2d', std); out = X.calcRun('cut2d', st.jobs[0], st);
ag = X.calcAggregate('cut2d', st);
ck('sheets give a line with the sheet size', ag.length === 1 && ag[0].d === 'Sheet, 1220 x 2440 mm' && ag[0].q >= 1);
ck('both are offered as tabs', X.CALC_KINDS.map(k => k.id).join() === 'babbitt,painting,welding,cut1d,cut2d');
process.exit(bad ? 1 : 0);
