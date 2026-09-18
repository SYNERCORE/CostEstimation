#!/usr/bin/env node
/*
 * A CE saved and opened again -- from CE Monitoring, on any machine -- must be
 * the CE that was saved. This drives the real save and load code through a
 * simulated SharePoint: rows are written as dbSaveHistory writes them, handed
 * back in a scrambled Id order (they are inserted five at a time in
 * parallel), assembled by _assembleCE and remapped the way handleLoad does.
 *
 * Run: node tools/test-ce-roundtrip.js
 */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
const h = fs.readFileSync('src/helpers.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const grab = (src, re) => { const m = src.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };

let _u = 0;
const uid = () => 'u' + (++_u);
const lib = new Function('uid',
  grab(db, /const _rowSig=[^\n]*/) + '\n' +
  grab(db, /function _rowKeysOf\(e\)\{[\s\S]*?\n\}/) + '\n' +
  grab(db, /function _rowOrder\(rows,keys\)\{[\s\S]*?\n\}/) + '\n' +
  grab(db, /const _shDump=[^\n]*/) + '\n' + grab(db, /const _shParse=[^\n]*/) + '\n' +
  grab(db, /function _srcDump\(r\)\{[\s\S]*?\n\}/) + '\n' + grab(db, /function _srcParse\(v\)\{[\s\S]*?\n\}/) + '\n' +
  grab(db, /function _assembleCE\(h,mR,rR\)\{[^\n]*/) + '\n' +
  grab(h, /function ceIdRemapper\(sowItems\) \{[\s\S]*?\n\}/) + '\n' +
  'return {_rowKeysOf, _assembleCE, _shDump, _srcDump, ceIdRemapper};')(uid);

/* The CE as the editor holds it. */
const e = {
  ceType: 'onsite',
  info: { ceNum: 'SHIC-CE-2026-0001', client: 'ACME', description: 'Test', toolTier: 2, qty: '3' },
  sowItems: [{ id: 't1', type: 'main', text: 'Task 1' }, { id: 't2', type: 'main', text: 'Task 2' }],
  mp: [
    { id: 'm1', role: 'Welder', rate: 1100, shift: 'regular_day', days: 10, pax: 4, otHours: 2, perDiem: 150, taskId: 't1', shares: [{ taskId: 't2', pax: 2 }] },
    { id: 'm2', role: 'Rigger', rate: 1300, shift: 'regular_night', days: 5, pax: 2, otHours: 0, perDiem: 0, taskId: 't2' },
    { id: 'm3', role: 'Helper', rate: 700, shift: 'regular_day', days: 10, pax: 3, otHours: 0, perDiem: 0, taskId: '' },
    { id: 'm4', role: 'Supervisor', rate: 2500, shift: 'sunday_day', days: 2, pax: 1, otHours: 1, perDiem: 200, taskId: 't1' },
    { id: 'm5', role: 'Welder', rate: 1100, shift: 'regular_day', days: 3, pax: 1, otHours: 0, perDiem: 0, taskId: 't2' },
    { id: 'm6', role: 'Driver', rate: 800, shift: 'regular_day', days: 10, pax: 1, otHours: 0, perDiem: 0, taskId: '' }
  ],
  tools: [
    { id: 'x1', desc: 'Welding machine', qty: 2, uom: 'Unit', cost: 500, days: 10, tier: 1, unitPrice: 50000, serviceLife: 5, taskId: 't1' },
    { id: 'x2', desc: 'Grinder', qty: 3, uom: 'Unit', cost: 120, days: 10, taskId: '' }
  ],
  mats: [{ id: 'y1', desc: 'Rod', qty: 20, uom: 'Kg', cost: 180, taskId: 't1' }],
  ppe: [{ id: 'z1', desc: 'Gloves', qty: 10, uom: 'Pair', cost: 60 }],
  misc: { accommodation: [{ id: 'c1', desc: 'MEAL ALLOWANCE (SKILLED MANPOWER)', qty: 3, cost: 320, days: 1.33, kind: 'meal', parts: [{ label: 'A', qty: 2, days: 1 }] }] },
  addlCosts: [{ id: 'a1', label: 'Welding', srcs: ['row:mp:m1', 'row:tools:x1', 'miscRow:accommodation:c1'] }, { id: 'a2', label: 'Grand', src: 'grand' }],
  verifyNotes: { k: 'n' }, rates: { shiftMults: { regular_night: 1.3 }, otMult: 1.3 }, margin: 12, scope: 'Do it',
  notes: [{ id: 'n1', seq: 1, text: 'Note' }], approvers: [{ role: 'Prepared By', name: 'X' }],
  mobVehicles: [{ id: 'v1', desc: 'TRUCK (MOB)', qty: 1, days: 1, rate: 120000 }, { id: 'v2', kind: 'mp', auto: true, desc: 'Welder', qty: 4, days: 1, rate: 1100, paxSet: true }],
  demobVehicles: [{ id: 'v3', desc: 'TRUCK (DEMOB)', qty: 1, days: 1, rate: 120000 }]
};

/* dbSaveHistory's header and payloads, reproduced from its source. */
ck('the save writes the row keys into the header', /_rowKeys:_rowKeysOf\(e\)/.test(db));
const hdr = {
  Id: 7, Title: e.info.ceNum, shicType: e.ceType, shicClient: e.info.client, shicDesc: e.info.description, shicScope: e.scope,
  shicNotes: JSON.stringify(e.notes), shicApprovers: JSON.stringify(e.approvers), shicMob: JSON.stringify(e.mobVehicles), shicDemob: JSON.stringify(e.demobVehicles),
  shicMisc: JSON.stringify({ ...e.misc, _addlCosts: e.addlCosts, _margin: e.margin, _verifyNotes: e.verifyNotes, _rates: e.rates, _docRef: null, _rowKeys: lib._rowKeysOf(e) }),
  shicSOW: JSON.stringify(e.sowItems), shicInfo: JSON.stringify(e.info)
};
let id = 100;
const mpR = e.mp.map(r => ({ Id: ++id, shicRole: r.role, shicRate: r.rate, shicShift: r.shift, shicDays: r.days, shicPax: r.pax, shicOTHours: r.otHours, shicPerDiem: r.perDiem, shicTaskId: r.taskId || '', shicShares: lib._shDump(r.shares) || null }));
const resR = [
  ...e.tools.map(r => ({ Id: ++id, shicTab: 'tools', shicDesc: r.desc, shicQty: r.qty, shicUOM: r.uom, shicCost: r.cost, shicDays: r.days, shicTaskId: r.taskId || '', shicShares: null, shicTier: r.tier || 0, shicHours: 0, shicKW: 0, shicRunHrs: 0, shicSrc: lib._srcDump(r) })),
  ...e.mats.map(r => ({ Id: ++id, shicTab: 'mats', shicDesc: r.desc, shicQty: r.qty, shicUOM: r.uom, shicCost: r.cost, shicDays: null, shicTaskId: r.taskId || '' })),
  ...e.ppe.map(r => ({ Id: ++id, shicTab: 'ppe', shicDesc: r.desc, shicQty: r.qty, shicUOM: r.uom, shicCost: r.cost, shicDays: null, shicTaskId: '' }))
];
/* Parallel inserts: Ids out of order. */
const scramble = a => [a[2], a[0], a[5], a[1], a[4], a[3]].filter(Boolean).concat(a.slice(6));
const d = lib._assembleCE(hdr, scramble(mpR), resR.slice().reverse());

console.log('saved and read back:');
ck('manpower comes back in the order it was saved', d.mp.map(r => r.id).join() === 'm1,m2,m3,m4,m5,m6', d.mp.map(r => r.id).join());
ck('every manpower field survives', JSON.stringify(d.mp.map(({ id, ...r }) => r)) === JSON.stringify(e.mp.map(({ id, ...r }) => ({ role: r.role, rate: r.rate, shift: r.shift, days: r.days, pax: r.pax, otHours: r.otHours, perDiem: r.perDiem, taskId: r.taskId, shares: r.shares || [] }))));
ck('tools, materials and PPE come back in order with their ids', [...d.tools, ...d.mats, ...d.ppe].map(r => r.id).join() === 'x1,x2,y1,z1');
ck('a tool keeps its tier and its Tier 1 source figures', d.tools[0].tier === 1 && d.tools[0].unitPrice === 50000 && d.tools[0].serviceLife === 5);
ck('misc rows keep days, kind and sub-items', JSON.stringify(d.misc) === JSON.stringify(e.misc));
ck('the row keys do not come back as a misc category', !('_rowKeys' in d.misc));
ck('mob / demob, rates, margin, notes, scope, info', JSON.stringify([d.mobVehicles, d.demobVehicles, d.rates, d.margin, d.notes, d.scope, d.info.qty, d.info.toolTier]) ===
  JSON.stringify([e.mobVehicles, e.demobVehicles, e.rates, e.margin, e.notes, e.scope, e.info.qty, e.info.toolTier]));

/* An old CE with no row keys still opens, in SharePoint order. */
const old = lib._assembleCE({ ...hdr, shicMisc: JSON.stringify(e.misc) }, mpR, resR);
ck('a CE saved before row keys still opens, with sp ids', old.mp.length === 6 && old.mp[0].id === 'sp101');

console.log('\nopened in the editor:');
const R = lib.ceIdRemapper(d.sowItems);
const mp = d.mp.map(R.rt('mp')), tools = d.tools.map(R.rt('tools'));
const acc = d.misc.accommodation.map(R.rt('misc'));
const add = R.fixAddl(d.addlCosts);
ck('a row split across tasks keeps its tasks', mp[0].shares.length === 1 && mp[0].shares[0].taskId === R.sow[1].id && mp[0].taskId === R.sow[0].id);
ck('a callout linked to line items still finds them',
  JSON.stringify(add[0].srcs) === JSON.stringify(['row:mp:' + mp[0].id, 'row:tools:' + tools[0].id, 'miscRow:accommodation:' + acc[0].id]), JSON.stringify(add[0].srcs));
ck('a callout on a total is left alone', add[1].src === 'grand');
ck('both loaders use the remapper', (app.match(/const _R = ceIdRemapper\(d\.sowItems\);/g) || []).length === 2 &&
  (app.match(/setAddlCosts\(_R\.fixAddl\(d\.addlCosts\)\);/g) || []).length === 2);
ck('signatures do not carry over to another CE', (app.match(/setSignatures\(\{\}\);/g) || []).length === 3);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE round trip OK');
process.exit(bad ? 1 : 0);
