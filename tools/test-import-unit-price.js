#!/usr/bin/env node
/* A list the Masterlist has never seen still arrives priced.
   ===========================================================
   A 216-line consumables list imported with every rate at P0, because the
   only place a rate was looked for was the Masterlist -- and none of the 216
   was on it. The file itself carried a unit price in a column nobody read, so
   every one of those rates had to be typed back in by hand out of the same
   file it had just been read from.

   The Masterlist still wins wherever the item is on it: that is a rate we
   have agreed, and a supplier's sheet is not. The file's price is the
   fallback, and where neither knows, the row is still P0 and says so.

   Run: node tools/test-import-unit-price.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const tab = fs.readFileSync('src/components/ResTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const ctx = { console, window: {}, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/helpers.js', 'utf8') + '\n;this.parse = parseToolList;', ctx);
const parse = t => JSON.parse(JSON.stringify(ctx.parse(t)));
const by = (rows, d) => rows.find(r => r.desc.toUpperCase().indexOf(d.toUpperCase()) === 0);

console.log('a price column is read:');
let r = parse([
  'DESCRIPTION,QTY,UOM,UNIT PRICE',
  'Brush Paint Pure Bristle 1in,6,Pcs,145.00',
  'Emery Cloth Roll 240 Grit,1,Pcs,1250.50'
].join('\n'));
ck('the rate rides in with the row', by(r, 'Brush').price === 145, JSON.stringify(r[0]));
ck('and a decimal is not rounded off', by(r, 'Emery').price === 1250.5);

/* Sheets export money as money. A rate that arrived as NaN would be silently
   dropped and the row would import at P0 with nothing said. */
console.log('\nmoney written as money is still a number:');
r = parse(['Description,Qty,Unit Cost', 'Wheel Cut-Off 3in,20,"P1,250.00"'].join('\n'));
ck('the currency mark and the separators come off', by(r, 'Wheel').price === 1250, JSON.stringify(r[0]));

/* The header the live file actually uses. */
console.log('\nthe column can be called what people call it:');
['Unit Price', 'UNIT COST', 'Price', 'Rate', 'Cost', 'SRP', 'Unit Rate'].forEach(h => {
  const rows = parse(['Material,Qty,' + h, 'Widget,2,300'].join('\n'));
  ck('  ' + h, rows.length === 1 && rows[0].price === 300, JSON.stringify(rows[0]));
});

/* "Unit" on its own is the UOM column -- reading it as a price would make
   every rate NaN and every row unpriced. */
console.log('\nbut "Unit" on its own is still the UOM:');
r = parse(['Description,Qty,Unit', 'Widget,2,Pcs'].join('\n'));
ck('the UOM is read as the UOM', r[0].uom === 'Pcs', JSON.stringify(r[0]));
ck('and no price is invented', r[0].price === undefined, r[0].price);

/* A line total is qty x rate. Adopting it as the unit rate would multiply
   every imported row by its own quantity -- a 20-off item costed 20x. */
console.log('\na line total is not a unit price:');
r = parse(['Description,Qty,Amount', 'Widget,20,6000'].join('\n'));
ck('an Amount column is left alone', r[0].price === undefined, r[0].price);
r = parse(['Description,Qty,Total Cost', 'Widget,20,6000'].join('\n'));
ck('and so is a Total', r[0].price === undefined, r[0].price);

/* An empty cell is not a price of zero. */
console.log('\na blank cell is no price, not a price of zero:');
r = parse(['Description,Qty,Unit Price', 'Widget,2,', 'Gadget,1,50'].join('\n'));
ck('the blank carries no price at all', by(r, 'Widget').price === undefined, by(r, 'Widget').price);
ck('and the one beside it is unaffected', by(r, 'Gadget').price === 50);

/* Same item twice: the quantities are one item's worth, the rate is not. */
console.log('\nrepeated lines add their quantity, not their rate:');
r = parse(['Description,Qty,Unit Price', 'Widget,2,50', 'Widget,3,50'].join('\n'));
ck('one row', r.length === 1);
ck('five of them', r[0].qty === 5, r[0].qty);
ck('at fifty, not a hundred', r[0].price === 50, r[0].price);
r = parse(['Description,Qty,Unit Price', 'Widget,2,', 'Widget,3,50'].join('\n'));
ck('and a price on the later line is still found', r[0].price === 50, r[0].price);

/* A list with no price column at all is the case that already worked. */
console.log('\na list without prices reads exactly as before:');
r = parse(['Description,Qty,UOM', 'Widget,2,Pcs'].join('\n'));
ck('rows still come through', r.length === 1 && r[0].qty === 2);
ck('carrying no price', r[0].price === undefined);

console.log('\nwhat the tab does with it:');
ck('the Masterlist wins where the item is on it',
  /cost: m \? \(m\.cost !== undefined \? m\.cost : \(m\.rate \|\| 0\)\) : \(N\(r\.price\) > 0 \? N\(r\.price\) : 0\)/.test(tab));
/* Where a rate came from decides how much it should be trusted, so the
   preview says, rather than showing two different things identically. */
ck('the preview says which rates came from the file', tab.indexOf("}, 'file')]") > 0);
ck('and an item nobody has a rate for says so', tab.indexOf("'no rate'") > 0);
ck('the count of each is reported when the rows are added',
  /const fromFile = pick\.filter\(r => !mlFind\(r\.desc\) && N\(r\.price\) > 0\)\.length;/.test(tab));
/* The warning tone belongs to rows that are still P0 -- if it fired whenever
   anything was priced by the file, the normal case would look like a fault. */
ck('only rows still at P0 make it a warning', /showToast\([\s\S]{0,400}none > 0\);/.test(tab));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nimport unit price OK');
process.exit(bad ? 1 : 0);
