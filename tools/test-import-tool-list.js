#!/usr/bin/env node
/* Import list on Tools & Equipment: a supplier's kit list read into rows,
   checked in a preview, then added.
   Run: node tools/test-import-tool-list.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const res = fs.readFileSync('src/components/ResTab.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const ctx = { console, window: {}, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/helpers.js', 'utf8') + '\n;this.parse = parseToolList;', ctx);
const parse = t => JSON.parse(JSON.stringify(ctx.parse(t)));

console.log('a PDF kit report (numbered lines):');
const kit = [
  'Universal Hand Tool Kit', 'Page 1', 'Kit Loc Tool Name SKU Cat Qty UOM W/DIM MSDS Haz Comments',
  '1 Pliers, Diagonal, Side Cutting, 6" 22506 D 1 Each 0.4 Pound',
  '2 Socket, 3/8" dr x 9mm, 6 point 78049829 D 2 Each 0.05 Pound',
  '3 Container 1 Box, Metal, Shipping Container,', 'Universal Hand Tool Kit, SPGH-', '100-428 Rev.1', '78048505 D 1 Each',
  '4 D-01 Broken Tool Inside Tag, Red 79010172 E 6 Each phone 516-349-', '7010- ext 119 on', 'credit card',
  'Universal Hand Tool Kit', 'Page 2', 'Kit Loc Tool Name SKU Cat Qty UOM W/DIM MSDS Haz Comments',
  '5 D-01 Loc-05 Mirror, Inspection, 2" Diameter,', 'Socket Joint 78008176 D 2 Each 0.1 Pound',
  '6 Socket, 3/8" dr x 9mm, 6 point 78049829 D 3 Each 0.05 Pound',
  'Universal Hand Tool Kit', 'Page 3', 'Kit Loc Tool Name SKU Cat Qty UOM W/DIM MSDS Haz Comments',
].join('\n');
const r = parse(kit);
const by = d => r.find(x => x.desc.startsWith(d));
ck('each numbered item is a row', r.length === 5);
ck('description, qty, unit and part number read', by('Pliers') && by('Pliers').qty === 1 && by('Pliers').uom === 'Each' && by('Pliers').code === '22506');
ck('a part number wrapped onto a later line is not a new item', by('Container') && by('Container').code === '78048505' && !r.some(x => /^D$/.test(x.desc)));
ck('a wrapped description is joined', by('Mirror') && by('Mirror').desc === 'Mirror, Inspection, 2" Diameter, Socket Joint');
ck('the location column is not part of the name', !r.some(x => /^(D-01|Loc-)/.test(x.desc)));
ck('comments after the quantity are left out', by('Broken') && by('Broken').desc === 'Broken Tool Inside Tag, Red');
ck('the same item listed twice is added up', by('Socket') && by('Socket').qty === 5);
ck('page headers are not rows', !r.some(x => /Page|Kit Loc/.test(x.desc)));

console.log('\nan Excel or CSV list (header row):');
const csv = parse('[Sheet1]\nNo.,Description,Qty,UOM,Remarks\n1,"Wrench, Torque 1/2""",2,Set,\n2,Grinder 4",1,Unit,\n3,Blank,,Pc,');
ck('columns found by their headings', csv.length === 2 && csv[0].desc === 'Wrench, Torque 1/2"' && csv[0].qty === 2 && csv[0].uom === 'Set');
ck('a row with no quantity is skipped', !csv.some(x => x.desc === 'Blank'));
ck('a plain numbered list with a unit', parse('1. Chain block 2 pcs\n2. Welding machine 1 unit').length === 2);

console.log('\nthe screen:');
ck('Tools & Equipment has an Import list button', res.includes('"⇪ Import list"') && app.includes('readFile: readDoc,'));
ck('rows are shown to check before they are added', res.includes("className: 'import-preview'") && res.includes('onClick: importAdd'));
ck('a Masterlist item comes in with its rate', res.includes('cost: m ? (m.cost !== undefined ? m.cost : (m.rate || 0)) : 0'));
ck('new rows start on the tier chosen for new rows', res.includes('...(showDays ? { tier } : {})'));
ck('and the toast says how many still need a rate', res.includes("' at P0 -- type their rate, or add them to the Masterlist.'"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nimport tool list OK'); process.exit(bad ? 1 : 0);
