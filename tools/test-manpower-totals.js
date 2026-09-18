#!/usr/bin/env node
/*
 * The manpower figures on screen all have to be the same figures.
 *
 * One AUTOCAD OPERATOR, 1 pax, 1 day, 4.5 OT hrs/day, P650/day, regular day
 * shift, put four different answers on one screen:
 *
 *   ROW TOTAL                        P1,107.03   wage + overtime
 *   Subtotal (1x Multiplier applied)   P650.00   wage only -- overtime dropped
 *   C.7 row TOTAL                      P307.27   benefits, incentive P200
 *   Benefits & Others Sub-Total        P107.27   benefits, incentive P0
 *
 * Two separate faults.
 *
 * The per-shift subtotal computed pax x days x rate x multiplier and left the
 * overtime out, so it disagreed with the row totals printed directly above it.
 * There is now ONE wage definition, mpWage, and the row total, the per-shift
 * subtotal and the C.1-C.4 subtotal are all summed from it.
 *
 * And the C.7 table recomputed all five benefits itself, taking the incentive
 * from the MASTERLIST entry for the role instead of from the row. The row is
 * the source of truth for cost everywhere else in this app -- a masterlist
 * edited today must never silently reprice a CE quoted last month -- so the
 * table was showing P200 that nothing was billing. It now renders benefitRows,
 * the same rows the printed CE and both exports use, and the incentive is
 * editable on the row.
 *
 * Note what did NOT change: the CE's grand total. Every cost path already used
 * calcBen, which reads the row. The P307.27 was only ever on the screen.
 *
 * Run: node tools/test-manpower-totals.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('src/App.js', 'utf8');
const helpers = fs.readFileSync('src/helpers.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const peso = v => Math.round(v * 100) / 100;

const grab = (re, what) => {
  const m = app.match(re);
  if (!m) { console.error('not found in src/App.js: ' + what); process.exit(1); }
  return m[0];
};
const mpWageSrc = grab(/const mpWageParts = r => \{[\s\S]*?\n  const mpWage = r => mpWageParts\(r\)\.total;/, 'mpWage');
const calcBenSrc = grab(/const calcBen = r => \{[\s\S]*?\n  \};/, 'calcBen').replace(/^/, 'const eccMap = new Map();');
const benRowsSrc = grab(/const benefitRows = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[mp, incOn\]\);/, 'benefitRows');
const shiftSubSrc = grab(/const shiftSub = rows\.reduce\([^\n]*\);/, 'shiftSub');

const sandbox = vm.createContext({console, useMemo: f => f()});
vm.runInContext(fs.readFileSync('src/config.js', 'utf8') + '\n' + helpers, sandbox);

/* The row from the screenshot, and the masterlist that disagreed with it. */
const mp = [{id: 'a', role: 'AUTOCAD OPERATOR', pax: 1, days: 1, rate: 650,
             otHours: 4.5, shift: 'regular_day', perDiem: 0}];
const masterlist = {manpower: [{role: 'AUTOCAD OPERATOR', rate: 650, perDiem: 200}]};

const build = extra => {
  const s = Object.assign(vm.createContext({console, useMemo: f => f(), mp: extra || mp, masterlist, incOn: true,
    rr: sandbox.ceRates({rates: {}})}), {});
  vm.runInContext(fs.readFileSync('src/config.js', 'utf8') + '\n' + helpers, s);
  vm.runInContext(mpWageSrc + '\n' + calcBenSrc + '\n' + benRowsSrc +
    ';this.mpWage=mpWage;this.mpWageParts=mpWageParts;this.calcBen=calcBen;this.benefitRows=benefitRows;' +
    ';this.shiftSubOf=function(rows){' + shiftSubSrc + ';return shiftSub;};', s);
  return s;
};
const A = build();

console.log('the wage on the row is the wage in the subtotal:');
const wage = A.mpWage(mp[0]);
ck('the row is worth 1,107.03', peso(wage) === 1107.03, String(peso(wage)));
ck('  of which 457.03 is overtime',
  peso(wage - 650) === 457.03, String(peso(wage - 650)),
  '1 pax x 1 day x (4.5/8) x 650 x 1.25');
const sub = A.shiftSubOf(mp);
ck('the shift subtotal is the same number', peso(sub) === peso(wage),
  'subtotal ' + peso(sub) + ' vs row ' + peso(wage));
ck('and it is NOT the old wage-only figure', peso(sub) !== 650.00,
  'P650 under a row reading P1,107.03 is the bug this exists for');

console.log('\nthe subtotal is the sum of its rows, whatever they are:');
const two = [mp[0], {id: 'b', role: 'HELPER', pax: 2, days: 3, rate: 700, otHours: 2, shift: 'regular_day'}];
const B = build(two);
ck('two rows add up', peso(B.shiftSubOf(two)) === peso(B.mpWage(two[0]) + B.mpWage(two[1])));
ck('a blank starter row costs nothing',
  B.mpWage({role: '', pax: 1, days: 1, rate: 650}) === 0,
  'an unnamed role is not a hire');

console.log('\nthe night premium reaches the wage and not the benefits:');
const night = [{id: 'n', role: 'TECH', pax: 1, days: 1, rate: 1000, otHours: 0, shift: 'regular_night'}];
const C = build(night);
ck('a night row is paid the multiplier', peso(C.mpWage(night[0])) === 1250,
  String(peso(C.mpWage(night[0]))));
ck('but its 13th month is on the basic rate',
  peso(C.calcBen(night[0]).thirteenth) === peso(1000 / 12),
  'statutory contributions do not rise with a shift premium');

console.log('\nthe benefits table shows what the CE actually charges:');
const rows = A.benefitRows;
ck('there is one line for the role', rows.length === 1, String(rows.length));
const g = rows[0];
ck('  13th pay 54.17', peso(g.thirteenth) === 54.17, String(peso(g.thirteenth)));
ck('  SSS 4.69', peso(g.sss) === 4.69, String(peso(g.sss)));
ck('  HDMF & PHIC 8.00', peso(g.hdmf) === 8.00, String(peso(g.hdmf)));
ck('  SIL & ECC 40.42', peso(g.sil) === 40.42, String(peso(g.sil)));
ck('the incentive is the ROW\'s, which is 0', peso(g.perdiem) === 0, String(peso(g.perdiem)),
  'the masterlist says 200; the row was never given one, and the CE never charged one');
ck('so the line totals 107.27, not 307.27', peso(g.total) === 107.27, String(peso(g.total)));
ck('and it equals what the CE is costed on',
  peso(g.total) === peso(A.calcBen(mp[0]).total),
  'the table and the cost path have to be the same function');

console.log('\nset the incentive on the row and it is charged:');
const withInc = [{...mp[0], perDiem: 200}];
const D = build(withInc);
ck('the line shows 200', peso(D.benefitRows[0].perdiem) === 200);
ck('and now totals 307.27', peso(D.benefitRows[0].total) === 307.27, String(peso(D.benefitRows[0].total)));
ck('which the CE charges too', peso(D.calcBen(withInc[0]).total) === 307.27,
  'screen and charge move together, because they are one function');

console.log('\nthe incentive comes from the Masterlist, onto the row:');
/* Three paths add a manpower row. The ML button and Sync Rates always copied
   the incentive with the rate; typing the role into the box copied the rate
   and nothing else -- which is why a row read P0 against a Masterlist that
   says P200, and why the CE charged the P0. */
const roleEdit = app.match(/list: 'rl' \+ r\.id,[\s\S]*?placeholder: "Role name\.\.\."/);
ck('typing a role finds its Masterlist entry', !!roleEdit && /masterlist\.manpower\.find/.test(roleEdit[0]));
ck('and takes the incentive with the rate',
  !!roleEdit && /rate: f\.rate, perDiem: f\.perDiem !== undefined \? f\.perDiem : x\.perDiem/.test(roleEdit[0]),
  'the rate alone was the whole bug');
ck('matched case-insensitively, the way Sync Rates matches',
  !!roleEdit && /m\.role\.toUpperCase\(\) === ro\.toUpperCase\(\)/.test(roleEdit[0]),
  'an exact match missed a role typed in lower case');
ck('the ML button still copies it', /perDiem: item\.perDiem \|\| 0/.test(app));
ck('and so does Sync Rates',
  /rate: f\.rate, perDiem: f\.perDiem !== undefined \? f\.perDiem : r\.perDiem/.test(app));
ck('the figure is copied onto the row, not read from the list when costing',
  /const perdiem = incOn \? N\(r\.perDiem \|\| 0\) \* days \* pax : 0;/.test(app),
  'reading the list at cost time would let a Masterlist edit reprice a CE already sent out');
ck('a row that disagrees with the Masterlist says so on the line',
  /mlIncentive !== null && mlIncentive !== rowIncentive/.test(app),
  'a CE already on file keeps its own figure, so the difference has to be visible');
ck('and the Masterlist figure is one click away', /onClick: \(\) => setIncentive\(mlIncentive\)/.test(app));
ck('a role absent from the Masterlist is not flagged as a disagreement',
  /return m \? N\(m\.perDiem \|\| 0\) : null;/.test(app),
  'no entry is not the same as an entry priced at zero');

console.log('\nthe manpower total is the wage plus the benefits:');
const mpSub = mp.reduce((s, r) => s + A.mpWage(r), 0);
const ben = mp.reduce((s, r) => s + (r.role ? A.calcBen(r).total : 0), 0);
ck('1,107.03 + 107.27 = 1,214.30', peso(mpSub + ben) === 1214.30, String(peso(mpSub + ben)));
ck('and the table footer sums the rows it prints',
  peso(A.benefitRows.reduce((t, r) => t + r.total, 0)) === peso(ben),
  'benefitsT and ben must not be able to differ');

console.log('\nthe screen is built on those, not on copies:');
ck('one wage definition', (app.match(/const mpWageParts = r => \{/g) || []).length === 1);
ck('and one way to read its total', (app.match(/const mpWage = r => mpWageParts\(r\)\.total;/g) || []).length === 1);
ck('the printed CE takes its row totals from it', /S\(mpWage\(r\), 'tdnb'\)/.test(app));
ck('and its per-shift subtotal', /const sub = rows\.reduce\(\(s, r\) => s \+ mpWage\(r\), 0\);/.test(app));
ck('the detailed export takes both halves from it', /const \{reg: base, ot\} = mpWageParts\(r\);/.test(app));
ck('so does the editor row', /const \{reg: regAmt, ot: otAmt, total: tot\} = mpWageParts\(r\);/.test(app));
ck('and the printed CE no longer prints a row the total does not carry',
  /mp\.filter\(r => r\.role && \(N\(r\.rate\) > 0 \|\| N\(r\.pax\) > 0\)\)/.test(app),
  'a role-less row costs nothing, so printing it put a line on the client copy that nothing added up to');
ck('the per-shift subtotal uses it', /const shiftSub = rows\.reduce\(\(s, r\) => s \+ mpWage\(r\), 0\);/.test(app));
ck('the C.1-C.4 subtotal uses it', /mp\.reduce\(\(s, r\) => s \+ mpWage\(r\), 0\)/.test(app));
ck('the row total uses it', /return mpWage\(r\) \+ calcBen\(r\)\.total;/.test(app));
ck('no wage arithmetic is left anywhere else',
  (app.match(/N\(r\.pax\) \* N\(r\.days\) \* N\(r\.rate\) \* mult/g) || []).length === 1,
  'a second copy is a second answer waiting to happen');
ck('the benefits table renders benefitRows', /return benefitRows\.map\(\(g, rowIdx\) => \{/.test(app));
ck('and no longer reads the masterlist for an incentive',
  !/perDiemRate = mlItem \? N\(mlItem\.perDiem/.test(app),
  'the masterlist is where a rate comes from, not what a saved CE is charged');
ck('the footer sums the printed rows', /ph\(benefitsT\)\)/.test(app));
ck('the incentive is editable on the line', /onCommit: setIncentive/.test(app));
ck('a role split across shifts with different incentives says so',
  /This role carries different incentives on different shifts/.test(app),
  'one box cannot show two numbers, and silently picking one would be a lie');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmanpower totals OK');
process.exit(bad ? 1 : 0);
