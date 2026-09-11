#!/usr/bin/env node
/*
 * Every editable field survives a save and a reload.
 *
 * A CE is written to SharePoint as three things -- a header row, a set of CE_MP
 * rows and a set of CE_Resources rows -- and read back by _assembleCE. Anything
 * the editor holds that none of those three carry is silently gone the moment
 * the page is refreshed. Two were:
 *
 *   docRef      the source-document reference on the header. Typed in, shown on
 *               the printed CE, and dropped on reload.
 *
 *   unitPrice / serviceLife / projectsPerYear / maintPerYear
 *               the figures a tool's tier prices are DERIVED from. Tier 1 and
 *               Tier 3 fall back to them when the tier rate itself is blank, so
 *               losing them does not merely lose a note -- it REPRICES the CE.
 *               A Tier 1 row measured at 36,500 in the editor came back 6,000.
 *
 * Drafts never showed either bug: dbSaveDraft stores the whole object as one
 * JSON blob, so it round-trips everything. Only a real save to the lists lost
 * anything, which is why this needed a test rather than a click.
 *
 * Both now travel in a JSON side-channel on a column that already existed in
 * spirit -- shicSrc on the resource row, _docRef inside the shicMisc blob --
 * so no reader of an older item breaks and no CE has to be re-entered.
 *
 * Run: node tools/test-persistence-audit.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const dbSrc = fs.readFileSync('src/db.js', 'utf8');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const reg = fs.readFileSync('src/components/RegisterPage.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- lift the real payload builders and the real reader out of db.js ---- */
const cut = (from, to) => {
  const a = dbSrc.indexOf(from);
  if (a < 0) throw new Error('not found in db.js: ' + from);
  const b = dbSrc.indexOf(to, a);
  if (b < 0) throw new Error('no end marker after ' + from);
  return dbSrc.slice(a, b);
};

const ctx = {console};
vm.createContext(ctx);
vm.runInContext(cfg + '\n' + help, ctx);

const prelude = 'const ceId=1;'
  + 'const _shDump=v=>JSON.stringify(v||[]);'
  + 'const _shParse=v=>{try{return JSON.parse(v)||[];}catch(_){return [];}};'
  + cut('function _srcDump', 'async function dbSaveDraft');

vm.runInContext(prelude
  + 'globalThis._build=function(e){'
  + cut('const mpPayloads', 'const resPayloads')
  + cut('const resPayloads', 'const insFns')
  + 'return {mpPayloads,resPayloads};};'
  + cut('function _assembleCE', '\nasync function dbLoadCE')
  + 'globalThis._asm=_assembleCE;'
  + 'globalThis._srcDump=_srcDump;', ctx);

/* ---- a CE with every editable field filled in ---- */
const tool = {
  id: 't1', desc: 'HYDRAULIC TORQUE WRENCH', qty: 2, uom: 'unit',
  cost: 0, days: 5, tier: 1, hours: 0, kw: 3.5, runHrs: 20,
  /* the basis the tier price is derived from -- these were the loss */
  unitPrice: 730000, serviceLife: 5, projectsPerYear: 4, maintPerYear: 20000
};
const ce = {
  ceType: 'shopworks',
  info: {ceNum: 'CE-2026-001', customer: 'ACME', title: 'Pump overhaul', company: 'SY3'},
  mp: [{id: 'm1', desc: 'TECHNICIAN', qty: 2, rate: 1200, days: 5, shift: 'reg', otHrs: 6, taskId: 'a'}],
  tools: [tool],
  mats: [{id: 'x1', desc: 'GASKET', qty: 10, uom: 'pc', cost: 250, days: 0}],
  ppe: [{id: 'p1', desc: 'COVERALL', qty: 4, uom: 'pc', cost: 900, days: 0}],
  misc: {freight: 5000},
  addlCosts: [{label: 'Permit', amount: 3000}],
  margin: 18,
  verifyNotes: {tools: 'rates checked against Masterlist 2026-09'},
  rates: {kwhRate: 13.5, otMult: 1.3, shiftMults: {night: 1.15}},
  scope: 'Overhaul of two pumps',
  notes: ['bring spare seals'],
  sowItems: [{id: 's1', text: 'Dismantle', qty: 1}],
  approvers: [{name: 'JU', role: 'TSG Head'}],
  mobVehicles: [{id: 'v1', desc: 'TRUCK', qty: 1, cost: 8000}],
  demobVehicles: [],
  docRef: {name: 'TOR-ACME-11.pdf', spUrl: '/sites/TSG/Lists/SHICCE_Monitoring/Attachments/9/TOR.pdf'},
  grand: 0
};

const {mpPayloads, resPayloads} = ctx._build(ce);
const hdr = {
  Id: 1, Title: ce.info.ceNum, shicType: ce.ceType, shicTotal: ce.grand,
  shicMisc: JSON.stringify({...ce.misc, _addlCosts: ce.addlCosts, _margin: ce.margin,
    _verifyNotes: ce.verifyNotes, _rates: ce.rates, _docRef: ce.docRef}),
  shicNotes: JSON.stringify(ce.notes), shicApprovers: JSON.stringify(ce.approvers),
  shicMob: JSON.stringify(ce.mobVehicles), shicDemob: '[]',
  shicSOW: JSON.stringify(ce.sowItems), shicInfo: JSON.stringify(ce.info),
  shicScope: ce.scope
};
const withId = (a, base) => a.map((p, i) => ({Id: base + i, ...p}));
const back = ctx._asm(hdr, withId(mpPayloads, 100), withId(resPayloads, 200));

console.log('nothing on the CE is dropped by a save and a reload:');
const lostTop = Object.keys(ce).filter(k => k !== 'unitP' && back[k] === undefined);
ck('every top-level field comes back', lostTop.length === 0, lostTop.join(', '));
ck('the source-document reference survives',
  back.docRef && back.docRef.name === ce.docRef.name && back.docRef.spUrl === ce.docRef.spUrl,
  'it lives in the shicMisc blob, so no column had to be added');
const lostRow = Object.keys(tool).filter(k => k !== 'id' && back.tools[0][k] === undefined);
ck('every field on a tool row comes back', lostRow.length === 0, lostRow.join(', '));
['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear'].forEach(k =>
  ck('  ' + k + ' is preserved', back.tools[0][k] === tool[k],
    'the tier price is derived from it; losing it reprices the CE'));

console.log('\nand the total is the same number afterwards:');
const G = ctx.computeCEGrand;
const tot = c => Math.round(G(c) * 100) / 100;
ck('the CE costs the same reloaded as it did in the editor', tot(ce) === tot(back),
  'editor ' + tot(ce) + ' vs reloaded ' + tot(back));
[1, 2, 3].forEach(t => {
  const a = {...ce, tools: [{...tool, tier: t}]};
  const b = ctx._asm(hdr, [], withId(ctx._build(a).resPayloads, 300));
  ck('  tier ' + t + ' does not drift', tot(a) === tot(b),
    'editor ' + tot(a) + ' vs reloaded ' + tot(b));
});

console.log('\nthe side-channel stays out of the way:');
ck('a row with no basis figures writes nothing',
  ctx._srcDump({desc: 'HAND TOOLS', qty: 1, cost: 50}) === '',
  'an empty string leaves the column as an older item already has it');
const bareBack = ctx._asm(hdr, [], withId(ctx._build(
  {...ce, tools: [{id: 'z', desc: 'HAND TOOLS', qty: 1, uom: 'Lot', cost: 50, days: 1, tier: 2}]}
).resPayloads, 400)).tools[0];
ck('and reads back without inventing any', bareBack.unitPrice === undefined && bareBack.serviceLife === undefined);
ck('a corrupt value does not break the load',
  JSON.stringify(ctx._asm(hdr, [], [{Id: 1, shicTab: 'tools', shicDesc: 'X', shicSrc: '{oops'}]).tools[0].desc) === '"X"',
  'a bad blob must lose that one row\'s basis, not the whole CE');
ck('the reserved misc keys are stripped before the tab is shown',
  !('_docRef' in back.misc) && !('_rates' in back.misc) && !('_addlCosts' in back.misc),
  'an unstripped key shows up as a cost line on the Misc tab');

console.log('\nboth halves of the wiring are in place:');
ck('shicSrc is written on every resource row', /shicSrc:_srcDump\(r\)/.test(dbSrc));
ck('and read back onto it', /\.\.\._srcParse\(r\.shicSrc\)/.test(dbSrc));
ck('it is selected from SharePoint', (dbSrc.match(/shicSrc/g) || []).length >= 4);
ck('it is tolerated on an unrepaired site', /'shicSrc'/.test(
  (dbSrc.match(/_SP_OPTIONAL_COLS\s*=\s*\[[^\]]*\]/) || [''])[0]),
  'without this, a site that has not been repaired stops opening CEs');
ck('Repair creates it as a multi-line column', /\[3,'shicSrc'\]/.test(reg),
  'type 2 is capped at 255 characters');
ck('_docRef travels in the shicMisc blob', /_docRef:\(e\.docRef\|\|null\)/.test(dbSrc));
ck('and is destructured out on load', /_rates,_docRef,\.\.\.rest\}=m/.test(dbSrc));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\npersistence OK');
process.exit(bad ? 1 : 0);
