#!/usr/bin/env node
/*
 * "xlsx (Planning)" on CE Monitoring: the allocation workbook the Planning app imports, one row per resource, in the Planning app's own
 * column layout. This runs buildPlanningRows as written in CeOutput.js on a sample CE and checks the button and the print-URL plumbing.
 *
 * Run: node tools/test-planning-export.js
 */
'use strict';
const fs = require('fs');
const out = fs.readFileSync('src/components/CeOutput.js', 'utf8');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = out.indexOf('const PLANNING_HEADERS'), b = out.indexOf('function makeHandleExportPlanning');
ck('the builder is found', a > 0 && b > a);
const N = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const { PLANNING_HEADERS, buildPlanningRows } = new Function('N', out.slice(a, b) + '\nreturn {PLANNING_HEADERS, buildPlanningRows};')(N);

ck('the header is the Planning export\'s, in order', PLANNING_HEADERS.join() ===
  'ID,ProjectID,ResourceID,ResourceName,ResourceType,Unit,Role,AllocatedQty,PlannedCost,ActualCost,Status,StartDate,EndDate,Notes,Issued,Returned,NetUsed,Remaining');

const wage = r => { const t = N(r.pax) * N(r.days) * N(r.rate); return { reg: t, ot: 0, total: t }; };
const ctx = {
  mp: [
    { role: 'Safety Officer 3', pax: 2, days: 10, rate: 1000, shift: 'regular_day' },
    { role: 'Safety Officer 3', pax: 1, days: 2, rate: 1000, shift: 'sunday' },
    { role: 'FOREMAN/LEADMAN', pax: 1, days: 5, rate: 800 },
    { role: '', pax: 1, days: 1, rate: 0 }
  ],
  benefitRows: [{ role: 'Safety Officer 3', pax: 2, total: 3000 }, { role: 'FOREMAN/LEADMAN', pax: 1, total: 500 }],
  mats: [{ desc: 'WD - 40 382ML', qty: 50, cost: 295, uom: 'CAN/S' }, { desc: '', qty: 1, cost: 5 }, { desc: 'CAUTION TAPE', qty: 2, cost: 750, uom: 'ROLL/S', code: 'WHSE-WSI-0045' }],
  ppe: [{ desc: 'GLOVES', qty: 10, cost: 25.555, uom: 'PR' }],
  mpWageParts: wage
};
const rows = buildPlanningRows(ctx, 'JO-039-F-CEDC-26-0076');
ck('one row per role, one per material or PPE line', rows.length === 5, String(rows.length));
ck('every row has all 18 columns', rows.every(r => r.length === 18));
ck('IDs run RA-0001...', rows.map(r => r[0]).join() === 'RA-0001,RA-0002,RA-0003,RA-0004,RA-0005');
ck('every row carries the project id', rows.every(r => r[1] === 'JO-039-F-CEDC-26-0076'));
const so = rows[0];
ck('manpower: TRADE- id, name, type and pax unit', so[2] === 'TRADE-SAFETY-OFFICER-3' && so[3] === 'Safety Officer 3' && so[4] === 'Manpower' && so[5] === 'pax');
ck('a role on two shifts is one row, with the headcount from the benefits row', so[7] === 2 && rows.filter(r => /SAFETY/i.test(r[3])).length === 1);
ck('its planned cost is every shift\'s wages plus the benefits', so[8] === 20000 + 2000 + 3000, String(so[8]));
ck('a role with a slash keeps it', rows[1][2] === 'TRADE-FOREMAN/LEADMAN' && rows[1][8] === 4000 + 500);
ck('a blank starter row is not exported', !rows.some(r => r[3] === ''));
const wd = rows[2];
ck('a material: Consumable, its own unit, qty and qty x cost', wd[4] === 'Consumable' && wd[5] === 'CAN/S' && wd[7] === 50 && wd[8] === 14750);
ck('an item with no warehouse code has no ResourceID', wd[2] === '');
ck('a warehouse code is passed through', rows[3][2] === 'WHSE-WSI-0045' && rows[3][8] === 1500);
ck('PPE goes out as Consumable, cost rounded to centavos', rows[4][4] === 'Consumable' && rows[4][8] === 255.55 || rows[4][8] === 255.56, String(rows[4][8]));
ck('status active, remaining = qty, actuals and dates blank', rows.every(r => r[10] === 'active' && r[17] === r[7] && [9, 11, 12, 13, 14, 15, 16].every(i => r[i] === '')));
ck('an empty CE gives no rows', buildPlanningRows({ mp: [], mats: [], ppe: [], mpWageParts: wage, benefitRows: [] }, 'X').length === 0);

console.log('\nwired in:');
ck('the print URL accepts as=planning and carries the project id', /'template-noamt', 'planning', 'view', 'noamt'\]\.includes\(_q\.get\('as'\)\)/.test(app) && /_q\.get\('pid'\)/.test(app) && /pid: _projId/.test(app));
ck('the hidden frame is asked for it, with the id', /\(projectId \? '&pid=' \+ encodeURIComponent\(projectId\) : ''\)/.test(app));
ck('the opened CE runs the export with that id', /if \(as === 'planning'\) handleExportPlanning\(\{ projectId: autoPrint\.pid \}\)/.test(app));
ck('the handler reads what is on screen', /makeHandleExportPlanning\(\(\) => \(\{ benefitRows, info, mats, mp, mpWageParts, ppe, showToast \}\)\)/.test(app));
ck('CE Monitoring has the button, only for a saved CE', /typeof e\.id==='number'&&[^;]{0,60}createElement\("button",\{style:\{gridRow: 5[\s\S]{0,900}"\\u2B07 xlsx \(Planning\)"/.test(mon));
ck('it asks for the Planning project id first, remembering the last one', /uiPrompt\('Project ID in the Planning app/.test(mon) && /LS\.get\('planning_pid:'\+e\.id\)/.test(mon) && /openForPrint\(e\.id,'planning',_p\)/.test(mon));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nplanning export OK');
process.exit(bad ? 1 : 0);
