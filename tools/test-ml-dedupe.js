#!/usr/bin/env node
/*
 * Remove duplicates on the Masterlist tab: items that share a name are collapsed to the most complete copy; the rest go to the Trash like
 * any other delete. This runs planMLDedupe as written in MasterlistTab.js and checks the button is wired to the Trash and to a named delete.
 *
 * Run: node tools/test-ml-dedupe.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('src/components/MasterlistTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const m = src.match(/function planMLDedupe[\s\S]*?\n\}\n/);
ck('planMLDedupe is found', !!m);
if (!m) process.exit(1);
const dd = new Function(m[0] + '\nreturn planMLDedupe;')();
const it = (id, desc, cost, o) => ({ id, code: 'T-' + id, category: 'Heavy', desc, cost, uom: 'Hr', ...o });

{
  const l = [it(1, 'Crane', 0), it(2, 'CRANE ', 8000), it(3, 'Pump', 5), it(4, 'crane', 0)];
  const p = dd(l, 'desc', 'cost');
  ck('one copy of each name stays', p.kept.length === 2 && p.removed.length === 2);
  ck('the priced copy is the one kept', p.kept.find(x => /crane/i.test(x.desc)).id === 2);
  ck('the list keeps its order', p.kept.map(x => x.id).join() === '2,3');
  ck('groups say what was collapsed', p.groups.length === 1 && p.groups[0].extra === 2);
}
{
  const l = [it(1, 'Drill', 10, { code: 'SHIC-TO-901' }), it(2, 'Drill', 10, { code: 'D-100' })];
  ck('a real code beats a made-up one', dd(l, 'desc', 'cost').kept[0].id === 2);
  const t = [it(1, 'Saw', 10), it(2, 'Saw', 10)];
  ck('equals: the earliest stays', dd(t, 'desc', 'cost').kept[0].id === 1);
}
{
  const l = [it(1, 'A', 1), it(2, 'B', 1), { id: 3, desc: '', cost: 0 }, { id: 4, desc: '  ', cost: 0 }];
  ck('different names and nameless rows are never touched', dd(l, 'desc', 'cost').removed.length === 0);
  ck('manpower uses role and rate', dd([{ id: 1, role: 'Welder', rate: 0 }, { id: 2, role: 'WELDER', rate: 900 }], 'role', 'rate').kept[0].id === 2);
  ck('a list with nothing repeated comes back whole', dd(l, 'desc', 'cost').kept.length === 4);
}

console.log('\nwired in:');
ck('there is a Remove duplicates button', /onClick: removeMLDuplicates\s*\}, "Remove duplicates"/.test(src));
ck('it asks first, then Trashes the copies', /await uiConfirm\('Remove ' \+ p\.removed\.length[\s\S]{0,700}await mlToTrash\(mlTab, p\.removed\)/.test(src));
ck('and the delete is by name, so another browser cannot bring them back', /\{deleted: \{\[mlTab\]: p\.removed\.map\(r => r\.id\)/.test(src));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nml dedupe OK');
process.exit(bad ? 1 : 0);
