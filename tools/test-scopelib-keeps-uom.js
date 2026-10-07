/* A Scope Library service keeps the unit, cost, code and category of each resource row through save and reopen. Run: node tools/test-scopelib-keeps-uom.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
const a = app.indexOf('const dfltUom = '), b = app.indexOf('/* Scope rows carry a stable id');
ck('the editor helpers are found', a > 0 && b > a);
const mk = ml => new Function('masterlist', 'uid', app.slice(a, b) + '; return {normalise, serialise};')(ml, () => 'x');
const { normalise, serialise } = mk({ manpower: [], tools: [], materials: [], ppe: [] });

const rows = [{ name: 'Welder', qty: 2, uom: 'Day', cost: 1500, code: 'MP-1', cat: 'Skilled', step: 0 },
  { name: 'Grinder', qty: 1, uom: 'Unit', cost: 800, code: 'TL-9', cat: 'Power tools', step: 1 },
  { name: 'Gloves', qty: 4, uom: 'Pair', cost: 0, step: 0 }];
const saved = serialise(rows);
ck('uom survives serialise', saved.map(r => r.uom).join() === 'Day,Unit,Pair');
ck('cost, code and category survive', saved[0].cost === 1500 && saved[1].code === 'TL-9' && saved[1].cat === 'Power tools');
ck('a zero cost is not written', !('cost' in saved[2]));
const back = normalise(saved, 'tools');
ck('reopening gives the same units back', back.map(r => r.uom).join() === 'Day,Unit,Pair' && back[0].cost === 1500);
ck('an old row with no unit: manpower is Day, PPE Pcs, others Lot',
  normalise([{ name: 'Rigger' }], 'mp')[0].uom === 'Day' && normalise([{ name: 'Mask' }], 'ppe')[0].uom === 'Pcs' && normalise([{ name: 'Rod' }], 'mats')[0].uom === 'Lot');
ck('miscellaneous rows still carry their category', serialise([{ name: 'Fare', miscCat: 'transportation', uom: 'Trip' }], true)[0].miscCat === 'transportation');
process.exit(bad ? 1 : 0);
