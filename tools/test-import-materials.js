/* Import list reads a supplier's or a client's list -- description, quantity,
   unit -- into rows and prices them off the Masterlist. Nothing in it was ever
   specific to tools; only its wording was, and only the Tools tab was handed
   the reader. A BOM and a PPE issue list arrive as exactly the same kind of
   list and were being typed in by hand.

   One thing genuinely was tool-shaped: the header reader knew TOOL, EQUIPMENT
   and PARTICULARS as names for the description column, and read a bare
   MATERIAL as a part-number column instead -- so a BOM headed MATERIAL / QTY
   produced no rows at all and looked like an unreadable file. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + what); if (!cond) bad++; };

const app = R('src/App.js');
const tab = R('src/components/ResTab.js');
const help = R('src/helpers.js');

console.log('Import list on Materials and PPE');

/* ---- all three tabs get the reader ---- */
ck('every resource tab is handed the document reader',
  (app.match(/readFile: readDoc,/g) || []).length === 3);
['materials', 'ppe'].forEach(t => {
  const at = app.indexOf('mlType: "' + t + '"');
  ck('the ' + t + ' tab has it', at > 0 && app.slice(at, at + 400).indexOf('readFile: readDoc') > 0);
});
ck('and the button appears wherever the reader does',
  /readFile && \/\*#__PURE__\*\/React\.createElement\("button"/.test(tab));

/* ---- it says what it is importing ---- */
ck('the wording follows the tab', /const _noun = \{ tools: 'tool', materials: 'material', ppe: 'PPE' \}\[mlType\]/.test(tab));
['Import " + _noun + " list', "'No ' + _noun + ' rows found in '", "pick.length + ' ' + _noun + ' row(s) added"]
  .forEach(frag => ck('  ...in "' + frag.slice(0, 34) + '"', tab.indexOf(frag) > 0));
ck('nothing still says "tool" regardless of the tab',
  tab.indexOf('"Import tool list"') < 0 && tab.indexOf("' tool row(s) added") < 0);

/* ---- a tier is a tool's idea, and stays one ---- */
ck('imported rows only take a tier where days are charged',
  /\.\.\.\(showDays \? \{ tier \} : \{\}\)/.test(tab));
ck('and they are priced from the Masterlist for THIS tab',
  /const m = mlFind\(r\.desc\);/.test(tab) && /\(masterlist\[mlType\] \|\| \[\]\)/.test(tab));

/* ---- run the shipped parser on the lists these tabs get ---- */
const src = help.slice(help.indexOf('const TOOL_UOMS ='), help.indexOf('\nfunction ceFileName'));
const parse = new Function(src + '\nreturn parseToolList;')();

/* Descriptions carry commas -- "BOLT, HEX, M12" -- so a real list quotes
   them. parseCsvLine reads the quotes; the fixture has to use them too. */
const rows = h => parse([h, '"BOLT, HEX, M12 X 60, A325",4,Pcs', '"GASKET, SPIRAL WOUND",2,Pcs'].join(String.fromCharCode(10)));
[['MATERIAL,QTY,UOM', 'a BOM headed MATERIAL'],
 ['MATERIALS,QTY,UOM', 'one headed MATERIALS'],
 ['MATERIAL DESCRIPTION,QTY,UOM', 'one headed MATERIAL DESCRIPTION'],
 ['CONSUMABLES,QTY,UOM', 'one headed CONSUMABLES'],
 ['PPE,QTY,UOM', 'a PPE issue list'],
 ['DESCRIPTION,QTY,UOM', 'and the plain DESCRIPTION it always read'],
 ['TOOL,QTY,UOM', 'and a tool list, unchanged']].forEach(([h, what]) => {
  const got = rows(h);
  ck(what + ' reads (' + got.length + ' rows)', got.length === 2 &&
    got[0].desc === 'BOLT, HEX, M12 X 60, A325' && got[0].qty === 4 && got[0].uom === 'Pcs');
});

/* A part number is still a part number: MATERIAL NO must not become the
   description column, or every row would be named after its code. */
const coded = parse(['MATERIAL NO,MATERIAL,QTY,UOM', '100045321,BOLT HEX M12,4,Pcs'].join('\n'));
ck('MATERIAL NO is read as the code, and MATERIAL as the description',
  coded.length === 1 && coded[0].desc === 'BOLT HEX M12' && coded[0].code === '100045321');
['SKU', 'PART NO', 'ITEM CODE', 'MATERIAL CODE'].forEach(h => {
  const r = parse([h + ',DESCRIPTION,QTY,UOM', 'X-1,BOLT HEX M12,4,Pcs'].join('\n'));
  ck(h + ' is still a code column', r.length === 1 && r[0].desc === 'BOLT HEX M12' && r[0].code === 'X-1');
});

/* Repeats still add up -- a consumable used on two tasks is bought once. */
const dupes = parse(['MATERIAL,QTY,UOM', 'WELDING ROD 3.2MM,20,Pcs', 'WELDING ROD 3.2MM,30,Pcs'].join('\n'));
ck('the same item twice is added up, not listed twice',
  dupes.length === 1 && dupes[0].qty === 50);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nImport on Materials and PPE OK');
process.exit(bad ? 1 : 0);
