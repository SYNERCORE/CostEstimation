#!/usr/bin/env node
/*
 * Manpower charged to mobilization / demobilization. It rides in the same
 * list as the expenses, marked kind 'mp', and is costed like a regular day
 * shift row: pax x days x rate, plus OT hours per day at the CE's OT rate.
 *
 * Run: node tools/test-mob-manpower.js
 */
'use strict';
const fs = require('fs');
const h = fs.readFileSync('src/helpers.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const grab = re => (h.match(re) || [''])[0];
const N = v => parseFloat(v) || 0;
const f = new Function('N', 'OT_MULT_DEFAULT',
  grab(/function ceOtMult\(rates\) \{[\s\S]*?\n\}/) + grab(/function mobRowCost\(r, rates\) \{[\s\S]*?\n\}/) + 'return mobRowCost;')(N, 1.25);

console.log('costing:');
ck('an expense is qty x days x rate', f({qty: 2, days: 3, rate: 35}, {}) === 210);
ck('a manpower row without OT is pax x days x rate', f({kind: 'mp', qty: 4, days: 1, rate: 2500, otHours: 0}, {}) === 10000);
ck('OT is hours/day x rate/8 x the CE OT multiplier, per pax per day',
  Math.abs(f({kind: 'mp', qty: 1, days: 5, rate: 2500, otHours: 2.5}, {otMult: 1.3}) - 17578.125) < 0.001);
ck('OT is ignored on an expense', f({qty: 1, days: 1, rate: 100, otHours: 8}, {}) === 100);

console.log('\nthe crew from the SOW Breakdown:');
const crew = new Function('N', grab(/function consolidateCrew\(mp\) \{[\s\S]*?\n\}/) + 'return consolidateCrew;')(N);
const c = crew([
  {role: 'Welder', pax: 4, rate: 1100, shift: 'regular_day', taskId: 't1'},
  {role: 'Supervisor', pax: 1, rate: 2500, shift: 'regular_day', taskId: 't1'},
  {role: 'WELDER', pax: 4, rate: 1100, shift: 'sunday_day', taskId: 't2'},
  {role: 'Rigger', pax: 2, rate: 1300, shift: 'regular_night', taskId: 't2'},
  {role: 'Supervisor', pax: 1, rate: 2500, shift: 'regular_night', taskId: 't2'},
  {role: '', pax: 9, rate: 0}
]);
ck('one line per role, in first-appearance order', c.map(x => x.role).join() === 'Welder,Supervisor,Rigger', JSON.stringify(c));
ck('the same role on two tasks counts the most on one, not the sum', c[0].pax === 4);
ck('day and night crews add', c[1].pax === 2);
ck('the rate is the base day rate', c[0].rate === 1100 && c[2].rate === 1300);
ck('a blank role is not crew', c.length === 3);
ck('linked rows follow the manpower when it changes', /setMobVehicles\(p => syncCrewRows\(p, false\)\);/.test(app) && /\}, \[mp\]\);/.test(app));
ck('but keep the days and OT the estimator set', /days: p \? p\.days : 1, otHours: p \? p\.otHours : 0/.test(app));

console.log('\nfood allowance by category:');
const meal = new Function('N', grab(/const MEAL_CATS = [^\n]*/) + grab(/function mealCatGuess\(role\) \{[\s\S]*?\n\}/) +
  grab(/function consolidateCrew\(mp\) \{[\s\S]*?\n\}/) + grab(/function mealGroups\(mp, cats\) \{[\s\S]*?\n\}/) +
  grab(/function miscRowCost\(r\) \{[\s\S]*?\n\}/) + 'return {mealCatGuess, mealGroups, miscRowCost};')(N);
ck('a project manager is PM', meal.mealCatGuess('Project Manager') === 'PM');
ck('admin, document controller, driver and tool keeper are admin',
  ['ADMIN', 'DOCUMENT CONTROLLER', 'Driver', 'TOOL KEEPER'].every(r => meal.mealCatGuess(r) === 'ADMIN'));
ck('everyone else is skilled manpower', meal.mealCatGuess('Welder') === 'SKILLED' && meal.mealCatGuess('Supervisor') === 'SKILLED');
const mg = meal.mealGroups([
  {role: 'Project Manager', pax: 1, days: 45, shift: 'regular_day'},
  {role: 'Welder', pax: 8, days: 40, shift: 'regular_day'},
  {role: 'Welder', pax: 8, days: 5, shift: 'sunday_day'},
  {role: 'Rigger', pax: 2, days: 45, shift: 'regular_day'},
  {role: 'Admin', pax: 1, days: 45, shift: 'regular_day'}
], {RIGGER: 'ADMIN'});
ck('pax per category is the consolidated crew', mg.PM.pax === 1 && mg.SKILLED.pax === 8 && mg.ADMIN.pax === 3, JSON.stringify(mg));
ck('days are man-days over pax -- the shifts duration', mg.SKILLED.days === 45 && mg.ADMIN.days === 45);
ck('the CE can move a role to another category', mg.ADMIN.pax === 3);
/* The reported case: AutoCAD 2 pax x 1 regular day + 1 pax x 1 Sunday, and an
   Instrumentation Tech 1 x 1. Crew 3, 4 pax-days. 3 x 1.33 x 320 = 1,276.80
   was wrong; 4 x 320 = 1,280 is right. */
const rc = meal.mealGroups([
  {role: 'AUTOCAD OPERATOR', pax: 2, days: 1, shift: 'regular_day'},
  {role: 'AUTOCAD OPERATOR', pax: 1, days: 1, shift: 'sunday_day'},
  {role: 'Instrumentation Tech', pax: 1, days: 1, shift: 'regular_day'}
], {}).SKILLED;
ck('a crew line keeps its sub-items, one per role and shift', rc.parts.length === 3, JSON.stringify(rc.parts));
ck('and is charged on them, not on the rounded days',
  meal.miscRowCost({qty: rc.pax, days: rc.days, cost: 320, parts: rc.parts}) === 1280,
  meal.miscRowCost({qty: rc.pax, days: rc.days, cost: 320, parts: rc.parts}));
ck('a Miscellaneous line with days is qty x cost x days', meal.miscRowCost({qty: 21, cost: 320, days: 45}) === 302400);
ck('and without days it costs what it always did', meal.miscRowCost({qty: 2, cost: 500}) === 1000);
ck('mob / demob and accommodation meal lines stay in sync', /setMobVehicles\(p => syncMealRows\(p, false, 'rate', false\)\)/.test(app) && /syncMealRows\(a, false, 'cost', true\)/.test(app));

ck('a typed pax on a linked crew row survives a re-sync', /qty: p && p\.paxSet \? p\.qty : c\.pax/.test(app));
ck('categories come from the Manpower masterlist', /if \(r && r\.role && r\.mealCat\) m\[/.test(app) && /updML\(r\.id, 'mealCat', e\.target\.value\)/.test(app));
ck('mob / demob meals count who travels, accommodation counts the crew',
  /const g = stayDays \? mealGroups\(mp, mealCatMap\) :/.test(app));

ck('the masterlist template has a Food Allowance column', /'UOM', 'Food Allowance'\]/.test(app) && /'uom', 'mealCat'\]/.test(app));
ck('and the import reads it', /foodallowance: 'mealCat'/.test(app) && /item\.mealCat = /.test(app));

ck('Sync meal rates moves every meal line to the Masterlist rate, on request only',
  /const syncMealRates = \(\) => \{/.test(app) && (app.match(/onClick: syncMealRates/g) || []).length === 2);

console.log('\nexports:');
ck('the CE workbook has a MOB-DEMOB sheet', /sheets\.push\(\{name: 'MOB-DEMOB'/.test(app));
ck('the plain workbook has a Mobilization sheet', /sheet\('Mobilization', a => \{/.test(app));

console.log('\nwired through:');
ck('the saved-CE recompute uses it', /const veh = rows => arr\(rows\)\.reduce\(\(s, r\) => s \+ mobRowCost\(r, _rates\), 0\);/.test(h));
ck('the editor totals use it', /mobVehicles\.reduce\(\(s, r\) => s \+ mobRowCost\(r, rr\), 0\)/.test(app));
ck('the expense table does not list manpower rows', /rows: mobVehicles\.filter\(r => r\.kind !== 'mp'\)/.test(app));
ck('the printed CE has a manpower table with a pax subtotal', /const mobMpTable=/.test(app) && /<td class="c">PAX\/S<\/td>/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmob manpower OK');
process.exit(bad ? 1 : 0);
