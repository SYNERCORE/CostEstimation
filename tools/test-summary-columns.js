/* The CE SUMMARY lists A..G and totals them. Miscellaneous is also broken
   down into its categories, and that breakdown used to be written into the
   TOTAL COST column in the same style as the items above it -- so selecting
   the column in Excel added Miscellaneous twice:

     A..G                      175,178.34   <- TOTAL AMOUNT, and correct
     A..G + G.1 + G.2          194,585.01   <- what Excel's status bar showed

   Nothing was wrong with the CE. The layout invited the wrong reading, and
   an approver comparing the two numbers could not tell which was real.

   So: the breakdown gets its own column. This test runs the real row-building
   loop out of src/App.js and adds up the TOTAL COST column, which must equal
   the total and nothing else. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + what); if (!cond) bad++; };

const app = R('src/App.js');
const xl = R('src/xlsx-styled.js');

console.log('CE SUMMARY columns');

/* ---- run the shipped loop ---- */
const TOTAL_COL = 6;
const START = 'ceSections.filter(x => x.v > 0).forEach(x => {';
const at = app.indexOf(START);
ck('the summary loop is where it was', at > 0);

/* Take the loop verbatim, up to the line that writes TOTAL AMOUNT. */
const endAt = app.indexOf("sum.push([S('', 'totlbl'), S('TOTAL AMOUNT:'", at);
const loop = app.slice(at, app.lastIndexOf('});', endAt) + 3);

const sections = [
  { letter: 'A.', printLabel: 'MOBILIZATION', v: 10040.00 },
  { letter: 'B.', printLabel: 'DEMOBILIZATION', v: 10040.00 },
  { letter: 'C.', printLabel: 'MANPOWER COST', v: 103668.17 },
  { letter: 'D.', printLabel: 'TOOLS AND EQUIPMENTS', v: 11658.00 },
  { letter: 'E.', printLabel: 'MATERIALS AND CONSUMABLES', v: 18500.00 },
  { letter: 'F.', printLabel: 'PERSONAL PROTECTIVE EQUIPMENT', v: 1865.50 },
  { letter: 'G.', printLabel: 'MISCELLANEOUS', v: 19406.67 }
];
const miscCosted = [
  { letter: 'G.1', label: 'Accommodation', v: 19200.00 },
  { letter: 'G.2', label: 'Requirements', v: 206.67 }
];
const GRAND = 175178.34;

const sum = [];
/* The itemisation reaches every renderer through ceBreakdown now, and which
   way round it is set depends on the layout. This file is about the Mechanical
   one; tools/test-summary-layouts.js covers both. */
new Function('ceSections', 'sum', 'ceBreakdown', 'ceLayout', 'S', 'N', loop)(
  sections, sum, { MISCELLANEOUS: miscCosted }, { parentCarries: true, breaks: ['misc'] },
  (v, s, span) => ({ v: v, s: s, span: span }),
  v => (typeof v === 'number' && isFinite(v) ? v : 0));

ck('a row per item, plus one per breakdown line', sum.length === sections.length + miscCosted.length);

const colTotal = sum.reduce((t, row) => {
  const c = row[TOTAL_COL];
  return t + (c && typeof c.v === 'number' ? c.v : 0);
}, 0);
ck('SELECTING THE TOTAL COST COLUMN GIVES THE TOTAL AND NOTHING ELSE (' +
  colTotal.toFixed(2) + ' vs ' + GRAND.toFixed(2) + ')', Math.abs(colTotal - GRAND) < 0.005);
ck('and NOT the double-counted figure users were seeing (194,585.01)',
  Math.abs(colTotal - 194585.01) > 0.005);

const subRows = sum.filter(r => r[TOTAL_COL] && r[TOTAL_COL].v === '');
ck('each breakdown line leaves TOTAL COST blank', subRows.length === miscCosted.length);
ck('but still draws its border, so the table does not break up',
  subRows.every(r => r[TOTAL_COL].s === 'tdn'));

const subAmounts = sum.map(r => r[5]).filter(c => c && typeof c.v === 'number');
ck('the breakdown amounts are in a column of their own', subAmounts.length === miscCosted.length);
ck('and they still add up to Miscellaneous itself',
  Math.abs(subAmounts.reduce((t, c) => t + c.v, 0) - 19406.67) < 0.005);
ck('in a style that reads as subordinate, not as another item',
  subAmounts.every(c => c.s === 'tdsubn'));

const labels = sum.map(r => r[1]).filter(c => c && String(c.v).indexOf('of which') >= 0);
ck('each one says "of which", so it is plainly part of the line above',
  labels.length === miscCosted.length);
ck('the breakdown letter moved out of the ITEM column',
  sum.every(r => !/^G\.\d/.test(String((r[0] || {}).v || ''))));
ck('but is still quoted, so it can be found on the MISC. sheet',
  labels.every(c => /G\.\d/.test(String(c.v))));

/* ---- the printed CE ---- */
const print = app.slice(app.indexOf('const costTable = `<table'), app.indexOf('TOTAL AMOUNT:</td>'));
ck('the printed CE also leaves its TOTAL COST cell empty on a breakdown line',
  print.indexOf('<td class="r"></td>') > 0);
ck('and carries the amount inside the description instead',
  /of which.*\$\{fmt\(s\.v\)\}/s.test(print));
ck('printed as a subordinate line, not as an item', /font-style:italic/.test(print));

/* ---- highlighted costs ----
   Same failure, one table down: figures that are ALREADY inside the total,
   printed bold in the total column immediately under it. The workbook has
   always headed them; the printed CE and the text summary never did. */
const HL = 'HIGHLIGHTED COSTS (already included above)';
ck('the workbook heads the highlighted costs', app.indexOf("S('" + HL + "', 'sec')") > 0);
ck('the printed CE heads them too', app.indexOf('>' + HL + '</td>') > 0);
ck('and so does the text summary', app.indexOf("a.title('" + HL + "', 3)") > 0);

/* ---- the workbook must still open ---- */
const dec = n => Number((xl.match(new RegExp('<' + n + ' count="(\\d+)"')) || [])[1]);
ck('tdsub and tdsubn are real styles', xl.indexOf("'tdsub', 'tdsubn'") > 0);
/* A declared count that does not match what follows makes Excel call the
   file corrupt and refuse it outright, which is worse than any confusion. */
ck('the declared font count matches the fonts (' + dec('fonts') + ')',
  dec('fonts') === (xl.match(/'<font>/g) || []).length);
ck('the declared cellXfs count matches the formats (' + dec('cellXfs') + ')',
  dec('cellXfs') === (xl.match(/'<xf xfId/g) || []).length);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE SUMMARY columns OK');
process.exit(bad ? 1 : 0);
