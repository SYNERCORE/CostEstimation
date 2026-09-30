/* Out to Excel, edited, and back again.
   =====================================
   A 672-row list is quicker to edit in Excel than in a browser table, and
   sales already work there. The tab can now write itself out, and the file it
   writes is the file Import XLS reads.

   Two things make it a round trip rather than a one-way door. The columns
   have to survive: a tool carries a TIER and a number of DAYS, and a file
   without them reimports every tool on the default tier for one day -- the
   costs would change without a single rate being touched. And re-importing
   has to be able to REPLACE, because appending an edited copy of the list to
   the list silently doubles it.

   The rates survive because Import XLS takes the file's Unit Cost and does
   not consult the Masterlist. That is deliberately the opposite of Import
   list, which reads somebody else's list and should be priced from ours.

   Run: node tools/test-resource-roundtrip.js */
'use strict';
const fs = require('fs');
const tab = fs.readFileSync('src/components/ResTab.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const grab = (re, what) => { const m = tab.match(re); if (!m) { console.error('not found in ResTab.js: ' + what); process.exit(1); } return m[0]; };

/* The real writer and the real reader, lifted from the shipped source. */
const N = v => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? 0 : parseFloat(v);
const rowDays = r => (r.days === undefined || r.days === '' || r.days === null) ? 1 : (N(r.days) || 0);

const mkExport = (rows, showDays) => {
  let out = null;
  new Function('rows', 'showDays', 'mlType', 'N', 'rowDays', 'showToast', 'SHICXlsx',
    grab(/const _rtCols = \(\) =>[\s\S]*?\n  \};/, 'exportXls') + '\nexportXls();'
  )(rows, showDays, 'tools', N, rowDays, () => {},
    { download: (name, sheets) => { out = sheets[0].rows; } });
  return out;
};
/* A sheet as sheet_to_json hands it back: one object per row, keyed by the
   header cells. That is exactly what the importer is given. */
const asSheet = cells => {
  const head = cells[0].map(c => (c && c.v !== undefined) ? c.v : c);
  return cells.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
};
/* TOOL_GROUPS is the config constant the importer reads to recognise a
   Group cell. The real one, so renaming a bucket breaks the test rather
   than the sheet. */
const TOOL_GROUPS = (() => {
  const c = fs.readFileSync('src/config.js', 'utf8');
  return new Function(c.slice(c.indexOf('const TOOL_GROUPS = ['), c.indexOf('const TOOL_GROUP_DEFAULT')) +
    String.fromCharCode(10) + 'return TOOL_GROUPS;')();
})();
const mkImport = (sheetRows, showDays, defaultTier) => {
  let n = 0;
  return new Function('sheetRows', 'showDays', 'defaultTier', 'N', 'mkRes', 'uid', 'TOOL_GROUPS',
    grab(/const _pick = \(r, \.\.\.names\)[\s\S]*?\}\)\.filter\(r => r\.desc\);/, 'the importer') +
    '\nreturn imported;'
  )(sheetRows, showDays, defaultTier, N, () => ({ qty: 1, cost: 0 }), () => 'id' + (++n), TOOL_GROUPS);
};

const tools = [
  { desc: 'Cord, Extension, M-F Plug, 12/3', qty: 6, uom: 'Pcs', cost: 3.56, tier: 2, days: 30, group: 'equipment', src: { code: 'SIE-11' } },
  { desc: 'Crane, Mobile, 25T', qty: 1, uom: 'Unit', cost: 18000, tier: 1, days: 3 },
  { desc: 'Torque Wrench, Hydraulic', qty: 2, uom: 'Set', cost: 42.75, tier: 3, days: 7 }
];

console.log('what goes out:');
let cells = mkExport(tools, true);
let head = cells[0].map(c => c.v);
ck('the header names the columns the importer reads',
  head.join() === 'Description,Qty,UOM,Unit Cost,Tier,Days,Group,Code', head.join());
ck('one row per row', cells.length === 4, cells.length);
ck('the rate goes out as a number, not as text',
  typeof cells[1][3] === 'number' && cells[1][3] === 3.56, typeof cells[1][3]);
ck('and the code it was imported under goes with it', cells[1][7] === 'SIE-11', cells[1][7]);
/* Without this, exporting and reimporting would quietly flatten every row
   back to a common tool and the Electrical sheet would lose D.1/D.2/D.3. */
ck('the summary bucket goes out with the row', cells[1][6] === 'equipment', cells[1][6]);
/* Materials and PPE have no tier and no days; writing the columns would
   invite someone to fill them in on a tab that cannot use them. */
head = mkExport([{ desc: 'Bolt', qty: 4, uom: 'Pcs', cost: 12 }], false)[0].map(c => c.v);
ck('a tab without days writes no Tier or Days column',
  head.join() === 'Description,Qty,UOM,Unit Cost,Code', head.join());

console.log('\nand what comes back:');
let back = mkImport(asSheet(mkExport(tools, true)), true, 2);
ck('every row returns', back.length === 3, back.length);
ck('the description is unchanged', back[0].desc === tools[0].desc, back[0].desc);
ck('the quantity is unchanged', back[0].qty === 6);
ck('the unit is unchanged', back[0].uom === 'Pcs');
/* The whole point: an edited rate is the reason for the round trip. */
ck('the rate is the file rate, not a Masterlist one', back[0].cost === 3.56, back[0].cost);
/* Without these two a round trip would re-cost the CE without anyone
   touching a rate: every tool back on tier 2 for one day. */
ck('the tier survives', back.map(r => r.tier).join() === '2,1,3', back.map(r => r.tier).join());
ck('and so do the days', back.map(r => rowDays(r)).join() === '30,3,7', back.map(r => rowDays(r)).join());
ck('and so does the summary bucket', back[0].group === 'equipment', back[0].group);
/* A row that named no bucket must come back naming none, not naming the
   default -- the two print the same today and differ the moment the
   default moves. */
ck('a row with no bucket comes back with none', back[1].group === undefined, back[1].group);

console.log('\nan edit made in Excel is what comes back:');
cells = mkExport(tools, true);
cells[1][3] = 9.99; cells[1][1] = 12; cells[2][5] = 5;
back = mkImport(asSheet(cells), true, 2);
ck('the edited rate', back[0].cost === 9.99, back[0].cost);
ck('the edited quantity', back[0].qty === 12, back[0].qty);
ck('the edited days', rowDays(back[1]) === 5, rowDays(back[1]));

console.log('\na supplier sheet, which has none of our columns:');
back = mkImport([{ Description: 'Welding Rod E7018', Qty: 50, UOM: 'Kg', 'Unit Cost': 210 }], true, 3);
/* A row given tier 0 or 0 days costs nothing at all, so an absent column
   must fall to the tab's defaults rather than to zero. */
ck('an absent Tier falls to the tab default, not to zero', back[0].tier === 3, back[0].tier);
ck('and an absent Days leaves the row on its own default',
  rowDays(back[0]) === 1, rowDays(back[0]));
ck('a blank Tier cell is the same as no column',
  mkImport([{ Description: 'X', Qty: 1, Tier: '' }], true, 2)[0].tier === 2);
ck('a row with no description is dropped',
  mkImport([{ Description: '', Qty: 1 }, { Description: 'Y', Qty: 1 }], true, 2).length === 1);

console.log('\nreplacing versus adding:');
/* Appending an edited copy of the list to the list doubles it, and 672 rows
   is not something anyone unpicks by hand. */
ck('the tab asks before it replaces', /window\.confirm\(/.test(tab));
ck('and the question counts the tab rows, not the file rows',
  /const replace = rows\.length > 0 && window\.confirm\(/.test(tab) &&
  tab.indexOf('const sheetRows = XLSX.utils.sheet_to_json') > 0,
  'shadowing `rows` here reported the file count as the tab count');
ck('OK replaces and Cancel adds',
  /set\(p => replace \? imported : \[\.\.\.p, \.\.\.imported\]\);/.test(tab));
ck('and it says afterwards which it did',
  /replace \? 'replaced this tab' : 'added'/.test(tab));
ck('there is a button to get the file out in the first place',
  tab.indexOf('Export XLS"') > 0);
ck('an empty tab says so rather than writing an empty file',
  tab.indexOf('There is nothing on this tab to export.') > 0);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nresource round trip OK');
process.exit(bad ? 1 : 0);
