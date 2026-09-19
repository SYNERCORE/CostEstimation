#!/usr/bin/env node
/* Leftover rows from a save whose deletes failed must not be counted when the
   CE opens -- one CE saved at P745,593 opened at P2,075,492.
   Run: node tools/test-row-orphans.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const db = fs.readFileSync('src/db.js', 'utf8');
const grab = re => (db.match(re) || [''])[0];
const ctx = {}; vm.createContext(ctx);
vm.runInContext(grab(/const _rowSig=.*/) + '\nlet _rowOrphans=0,_rowDrop=true;\n' + grab(/function _rowOrder[\s\S]*?\n\}/) + ';this.O=_rowOrder;this.S=_rowSig;this.N=()=>_rowOrphans;', ctx);
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const row = d => ({ shicTab: 'tools', shicDesc: d, shicQty: 1, shicUOM: 'Lot', shicCost: 100, shicDays: 1, shicTaskId: '' });
const a = row('A'), b = row('B'), a2 = row('A'), c = row('C');
const keys = [['1', ctx.S(a)], ['2', ctx.S(b)]];
ck('orphans are dropped when every saved row is present', ctx.O([a, b, a2, c], keys).length === 2 && ctx.N() === 2);
ck('nothing is dropped when a saved row is missing', ctx.O([a, c], keys).length === 2);
ck('a CE saved before row keys keeps every row', ctx.O([a, b, c], []).length === 3);
ck('the save re-reads old rows instead of a snapshot', /_spInvalidateBigList\(\);const\[om,or\]/.test(db));
ck('rows are only dropped when that matches the saved total', /if\(_near\(_gSlim\)&&!_near\(_gAll\)\)\{_ce=_slim;/.test(db));
ck('by default nothing is dropped', /let _rowOrphans=0,_rowDrop=false;/.test(db));
ck('failed deletes are reported, not swallowed', /_delFail\+' old line/.test(db));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nrow orphans OK'); process.exit(bad ? 1 : 0);
