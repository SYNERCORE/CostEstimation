/* The quantity calculators' maths, without React: the figures in the design were worked
   out by hand first, and these hold the code to them. Run: node tools/test-calculators.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/components/Calculators.js', 'utf8') +
  ';this.X={calcStd,calcKindState,calcRun,calcAggregate,calcStatus,calcTypical,calcUsed,calcYield,calcRodG,calcBuy,calcNewJob,CALC_DEFAULTS};', ctx);
const X = ctx.X;
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const near = (a, b, t) => Math.abs(a - b) <= (t || 0.006);

const std = X.calcStd(null);
ck('the standards start from the defaults', std.allow.spray.pct === 25 && std.units.tin.v === 3.8);
const edited = X.calcStd({ allow: { spray: 30, junk: 5, brush: 'x' }, units: { tin: 4.5 } });
ck('an admin change replaces one value', edited.allow.spray.pct === 30 && edited.units.tin.v === 4.5);
ck('a bad value falls back to the default', edited.allow.brush.pct === 15 && edited.allow.waste.pct === 10);

/* babbitt: the sheet's own figures, with the loss applied after */
let st = X.calcKindState('babbitt', std), r = X.calcRun('babbitt', st.jobs[0], st);
ck('babbitt weight before loss is 13.12 kg', near(r.rows[0].buy, 13.12));
ck('bars before loss is 14.58', near(r.rows[1].net, 14.58));
ck('bars with the 20% loss is 18.23', near(r.rows[1].buy, 18.23));
ck('tin ingots before loss is 0.69', near(r.rows[2].net, 0.69));
let ag = X.calcAggregate('babbitt', st);
ck('the lines round up: 19 bars, 1 ingot', ag[0].q === 19 && ag[1].q === 1);
st.units.tin = 4.5; ag = X.calcAggregate('babbitt', st);
ck('the line description follows the ingot weight', ag[1].d === 'Tin ingot, 4.5 kg');

/* two bearings round up once, not twice */
st = X.calcKindState('babbitt', std); st.jobs.push(JSON.parse(JSON.stringify(st.jobs[0])));
ag = X.calcAggregate('babbitt', st);
ck('two identical bearings: 37 bars, not 2 x 19', ag[0].q === 37);

/* painting */
st = X.calcKindState('painting', std); r = X.calcRun('painting', st.jobs[0], st);
ck('spray: primer 10.67 L', near(r.rows[0].buy, 10.67));
ck('spray: intermediate 17.20 L', near(r.rows[1].buy, 17.20));
ck('thinner is 25% of all paint to buy', near(r.rows[3].buy, (r.rows[0].buy + r.rows[1].buy + r.rows[2].buy) * 0.25));
st.method = 'brush'; r = X.calcRun('painting', st.jobs[0], st);
ck('brush: primer 9.41 L', near(r.rows[0].buy, 9.41));
st.incl = true; r = X.calcRun('painting', st.jobs[0], st);
ck('rates that already include loss: no extra loss (8 L)', near(r.rows[0].buy, 8));
ck('only the method in use is recorded for the history', Object.keys(X.calcUsed('painting', X.calcKindState('painting', std))).join() === 'spray');

/* welding */
st = X.calcKindState('welding', std); r = X.calcRun('welding', st.jobs[0], st);
ck('buildup weight is 22.46 kg at 7.85', near(r.rows[0].buy, 22.46));
ck('weld metal to deposit adds 10%: 24.71 kg', near(r.rows[1].buy, 24.71));
ck('stick yield is 65%', near(X.calcYield({ proc: 'SMAW', len: 350 }, st.loss), 0.65, 1e-9));
ck('stick electrode to buy is 38.01 kg', near(r.rows[2].buy, 38.01));
ck('TIG yield is (1 - 100/1000) x 0.99 = 89.1%', near(X.calcYield({ proc: 'GTAW', len: 1000 }, st.loss), 0.891, 1e-9));
ck('a shorter TIG rod wastes more', X.calcYield({ proc: 'GTAW', len: 500 }, st.loss) < X.calcYield({ proc: 'GTAW', len: 1000 }, st.loss));
ck('rod weight: 2.4 mm x 1 m is 35.5 g', near(X.calcRodG(2.4, 1000), 35.5, 0.05));
st.jobs[0].cons = [{ proc: 'SMAW', dia: 4, len: 350, share: 70 }, { proc: 'GTAW', dia: 2.4, len: 1000, share: 30 }];
r = X.calcRun('welding', st.jobs[0], st);
ck('shares are reported', r.shareSum === 100 && r.lines.length === 2);
{ const j0 = JSON.parse(JSON.stringify(st)); j0.jobs[0].cons[1].share = 0; j0.jobs[0].cons[0].share = 100;
  ck('a consumable with no share is not a line to buy', X.calcAggregate('welding', j0).length === 1); }
ck('TIG rod size is in the line description', /GTAW 2\.4 mm/.test(r.lines[1].d));
const kgBySize = [1.6, 3.2].map(d => { const j = JSON.parse(JSON.stringify(st.jobs[0])); j.cons = [{ proc: 'GTAW', dia: d, len: 1000, share: 100 }]; return X.calcRun('welding', j, st).lines[0].raw; });
ck('TIG kilograms do not change with rod size (the stub is a length)', near(kgBySize[0], kgBySize[1], 1e-9));
const rodsBySize = [1.6, 3.2].map(d => 24.71 / 0.891 * 1000 / X.calcRodG(d, 1000));
ck('but the number of rods does', rodsBySize[0] > rodsBySize[1] * 3.9);

/* status and history */
const def = std.allow.spray;
ck('standard value reads as standard', X.calcStatus(def, 25)[0] === 'standard');
ck('inside the range reads as edited', X.calcStatus(def, 22)[0] === 'edited, in range');
ck('outside the range is flagged', X.calcStatus(def, 40)[0] === 'outside range');
ck('an estimate says so', X.calcStatus(std.allow.babbitt, 20)[0] === 'estimate');
const hist = [{ ce: 'A', k: 'spray', v: 20 }, { ce: 'B', k: 'spray', v: 30 }, { ce: 'A', k: 'spray', v: 25 }, { ce: 'C', k: 'smaw', v: 50 }];
const t = X.calcTypical(hist, 'spray');
ck('history keeps one value per CE, the latest', t.n === 2 && t.med === 27.5);
ck('no history is reported as none', X.calcTypical([], 'spray').med === null);
console.log(bad ? bad + ' FAILURE(S)' : '\ncalculators OK');
process.exit(bad ? 1 : 0);
