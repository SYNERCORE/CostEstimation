#!/usr/bin/env node
/*
 * Importing a workbook into the Masterlist.
 *
 * An import now says what it will do before it does it (new / updated / repeated rows / kept prices) and asks. The rules behind that
 * are in planMLImport, run here as it is written in MasterlistTab.js:
 *   - rows repeated inside the file count once, the last one wins (they were each added)
 *   - an update never writes the importer's own fill-ins over a real value: a blank code, category or unit, or a price of 0
 *   - a made-up code is never one the list already uses
 *   - a row identical to its item is not an update
 *
 * Run: node tools/test-ml-import-plan.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('src/components/MasterlistTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const m = src.match(/const ML_IMPORT_MAX_ROWS = \d+;\nfunction planMLImport[\s\S]*?\n\}\n/);
ck('planMLImport is found', !!m);
if (!m) process.exit(1);
const plan = new Function(m[0] + '\nreturn planMLImport;')();

const row = (desc, cost, o) => ({ id: 'n' + Math.random(), code: '', category: 'General', desc, cost, uom: 'Day', _blank: ['code', 'category', 'uom'], ...o });
const item = (id, desc, cost, o) => ({ id, code: 'T-' + id, category: 'Heavy', desc, cost, uom: 'Hr', ...o });

console.log('\nrepeated rows in the file:');
{
  const r = plan([], [row('CRANE', 100), row('crane ', 150), row('PUMP', 5)], 'desc', 'cost', 'tools');
  ck('count once', r.toAdd.length === 2 && r.dupInFile === 1, JSON.stringify(r.toAdd.map(x => x.desc)));
  ck('the last one wins', r.toAdd.find(x => /crane/i.test(x.desc)).cost === 150);
}

console.log('\nan update does not overwrite real values with fill-ins:');
{
  const cur = [item('1', 'CRANE', 8000)];
  const r = plan(cur, [row('CRANE', 0)], 'desc', 'cost', 'tools');
  ck('a price of 0 keeps the price', r.merged[0].cost === 8000 && r.keptPrice === 1 && r.updated === 0, JSON.stringify(r));
  const r2 = plan(cur, [row('CRANE', 9000)], 'desc', 'cost', 'tools');
  ck('a real new price is applied', r2.merged[0].cost === 9000 && r2.updated === 1);
  ck('the code, category and unit stay', r2.merged[0].code === 'T-1' && r2.merged[0].category === 'Heavy' && r2.merged[0].uom === 'Hr', JSON.stringify(r2.merged[0]));
  ck('and so does the id', r2.merged[0].id === '1');
  const r3 = plan(cur, [row('CRANE', 8000, { code: 'NEW-1', _blank: ['category', 'uom'] })], 'desc', 'cost', 'tools');
  ck('a code the sheet does give is applied', r3.merged[0].code === 'NEW-1');
}

console.log('\nan identical row is not an update:');
{
  const cur = [item('1', 'CRANE', 8000)];
  const r = plan(cur, [{ ...cur[0], id: 'zzz', _blank: [] }], 'desc', 'cost', 'tools');
  ck('counted as identical', r.unchanged === 1 && r.updated === 0 && r.toAdd.length === 0);
  ck('and the list comes back the same', JSON.stringify(r.merged) === JSON.stringify(cur));
}

console.log('\nmade-up codes:');
{
  const cur = [item('1', 'A', 1, { code: 'SHIC-TO-900' }), item('2', 'B', 1, { code: 'SHIC-TO-901' })];
  const r = plan(cur, [row('C', 1), row('D', 1)], 'desc', 'cost', 'tools');
  ck('skip the ones in use', r.toAdd.map(x => x.code).join() === 'SHIC-TO-902,SHIC-TO-903', r.toAdd.map(x => x.code).join());
  ck('the bookkeeping field never reaches the list', r.merged.every(x => !('_blank' in x)));
}

console.log('\nthe list as a whole:');
{
  const cur = [item('1', 'A', 1), item('2', 'A', 1), item('3', 'B', 2)];
  const r = plan(cur, [row('B', 3), row('E', 4)], 'desc', 'cost', 'tools');
  ck('names already repeated in the list are reported', r.existingDupes === 1);
  ck('new items go on the end, existing keep their place', r.merged.map(x => x.desc).join() === 'A,A,B,E');
  const again = plan(r.merged, [row('B', 3, { code: r.merged[2].code, category: r.merged[2].category, uom: r.merged[2].uom, _blank: [] }), row('E', 4, { _blank: [] })], 'desc', 'cost', 'tools');
  ck('the same file imported twice adds nothing', again.toAdd.length === 0);
}

console.log('\nwired in:');
ck('the import asks before writing', /await uiConfirm\('Import ' \+ file\.name[\s\S]{0,60}\) return;\s*await saveML\(\{\.\.\.masterlist, \[tab\]: plan\.merged\}\)/.test(src));
ck('a file over the row limit is refused', /rows\.length > ML_IMPORT_MAX_ROWS/.test(src));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nml import plan OK');
process.exit(bad ? 1 : 0);
