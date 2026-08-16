#!/usr/bin/env node
/*
 * "Export Detailed" must produce the CE, not a data dump.
 *
 * It used to write a flat sheet per resource type under generic headers
 * (Description / Qty / UOM / Cost), which was fine for re-importing figures and
 * useless to anyone who opened it expecting the estimate. It now mirrors the
 * printed CE: one worksheet per printed page, in the same order, with the same
 * section headings and the same columns.
 *
 * The figures have to agree with the print, or the two documents describe
 * different jobs. The manpower block is the one that can drift -- AOT is the
 * ACCUMULATED overtime (per-day hours x days) and RATE OT carries the shift
 * multiplier, both of which are easy to get wrong in a second implementation.
 *
 * Run: node tools/test-xlsx-export.js src/App.js
 */
'use strict';

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'src/App.js', 'utf8');
const grab = (re, what) => { const m = src.match(re); if (!m) { console.error('not found in source: ' + what); process.exit(1); } return m[0]; };

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

const exp = grab(/const handleExportXLSX = \(\) => \{[\s\S]*?showToast\('Exported to Excel[^\n]*\n  \};/, 'handleExportXLSX');

console.log('One worksheet per page of the printed CE:');
for (const [sheet, why] of [
  ["'CE Summary'", 'the cost summary page'],
  ["'Manpower'", 'the bill of manpower loading'],
  ["'Tools & Equipment'", 'the bill of tools'],
  ["'Materials'", 'the bill of materials'],
  ["'PPE'", 'the PPE page'],
  ["'Miscellaneous'", 'the miscellaneous page'],
  ["'Scope of Work'", 'the scope page']])
  ck(sheet.replace(/'/g, '') + ' — ' + why, exp.includes(sheet));

console.log('\nUsing the same headings the printed form uses:');
for (const h of ['BILL OF TOOLS AND EQUIPMENT', 'BILL OF MATERIALS AND CONSUMABLES',
                 'PERSONAL PROTECTIVE EQUIPMENTS', 'SCOPE OF WORK', 'BENEFITS AND OTHERS'])
  ck('"' + h + '"', exp.includes(h), 'the workbook should read like the CE');
ck('and the same manpower columns', /'ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'DAYS', 'RATE\/DAY', 'SUBTOTAL', 'AOT', 'RATE OT', 'TOTAL'/.test(exp));
ck('and the same resource columns', /'ITEM', 'DESCRIPTION', 'QTY', 'UOM'[\s\S]{0,60}'UNIT PRICE', 'TOTAL'/.test(exp));

console.log('\nThe figures agree with the printed CE:');
ck('AOT is the accumulated overtime, not the per-day figure', /N\(r\.otHours\) \* N\(r\.days\)/.test(exp),
  'the printed form multiplies AOT by RATE OT, so a per-day figure would understate the row');
ck('RATE OT carries the shift multiplier', /N\(r\.rate\) \/ 8 \* 1\.25 \* mult/.test(exp));
ck('the regular subtotal does too', /N\(r\.pax\) \* N\(r\.days\) \* N\(r\.rate\) \* mult/.test(exp));
ck('overtime is per day, as everywhere else', /\(N\(r\.otHours\) \/ 8\)/.test(exp),
  'this is the seventh place that formula appears and it must match the other six');
ck('tools are charged qty x days x cost', /N\(r\.qty\) \* d \* N\(r\.cost\)/.test(exp));
ck('and only tools get a DAYS column', /withDays \? \['DAYS'\] : \[\]/.test(exp),
  'a consumable is not billed by the day');
ck('the summary reuses the same rows the app shows', /summaryRows\.forEach/.test(exp),
  'a second copy of the section list would drift from the screen');
ck('selling price only when there is a margin', /margin !== 0\) a\.row/.test(exp));
ck('highlighted costs are carried over', /hlRows\.forEach/.test(exp));
ck('the unit price divides by the CE quantity', /UNIT PRICE \(qty '/.test(exp));

console.log('\nNumbers are numbers, so the recipient can total a column:');
ck('a peso format is applied', /const PESO = '#,##0\.00'/.test(exp));
ck('money cells are typed numeric', /ws\[ref\]\.t = 'n'; ws\[ref\]\.z = PESO;/.test(exp));
ck('and rounded to centavos rather than carrying float noise', /Math\.round\(N\(v\) \* 100\) \/ 100/.test(exp));

console.log('\nLayout the community build can actually write:');
ck('column widths', /ws\['!cols'\]/.test(exp));
ck('merged section titles', /ws\['!merges'\] = merges/.test(exp));
ck('the styling limit is stated, not pretended away', /ignores\s+cell styling on write/.test(src),
  'promising bold headers the library cannot produce would be worse than saying so');

console.log('\nIt describes the same document as the print:');
ck('the company header is resolved the same way', /_cos\.find\(c => String\(c\.id\) === String\(info\.companyId\)\)/.test(exp),
  'a different fallback would put a different company on the two documents');
ck('breakdown notes are included, labelled by scope', /'Scope ' \+ \(sowLabels\[x\.id\] \|\| ''\)/.test(exp));
ck('empty sections are skipped, as the print skips empty pages', /if \(!rows\.length\) return;/.test(exp));

/*
 * The OTHER export -- the top-bar "Export CE" button -- had the signatories and
 * the notes written into the source. Five real people's names and three
 * boilerplate sentences went out with every workbook, no matter who prepared
 * the estimate or who the Summary tab named. The workbook and the printed CE
 * disagreed about who had approved the figures, which is the one thing on a
 * cost estimate that must never be guessed at.
 */
console.log('\nThe top-bar export names nobody the CE does not name:');
const exp1 = grab(/const handleExport = \(\) => \{[\s\S]*?showToast\('Excel exported[^\n]*\n  \};/, 'handleExport');
/* The same names appear in the DEFAULT approvers state, which is correct --
   that is the roster the estimator starts from and can edit. What must not
   happen is the export reaching past that list to a copy of its own. */
for (const name of ['Jhuniel Ubana', 'Fernando Bautista', 'Warren Maralit', 'Kenneth Mendoza', 'RADIM ASAULA'])
  ck('no "' + name + '" written into the export itself', !exp1.includes(name),
    'a real person signing a CE they never saw');
ck('and no job titles hardcoded either', !/'(?:Cost Estimator|TSG - Head|Operations Director|Dir\. Sales & Technical|Cost Supervisor|FS MANAGER)'/.test(exp1),
  'a title bound to a column is the same bug wearing a hat');
ck('signatories come from the approvers list', /approvers \|\| \[\]\)\.filter/.test(exp1),
  'the same list the printed CE and Export Detailed both read');
ck('the role, name and title all come from the row', /a\.role \|\| ''\) \+ ':'[\s\S]{0,120}a\.name \|\| ''[\s\S]{0,80}a\.title \|\| a\.role/.test(exp1));
ck('no boilerplate notes', !/Additional scope not in original SOW is excluded|Lead time assumes no interruptions/.test(src),
  'sentences nobody wrote, on a document people sign');
ck('notes come from the CE', /notes\.map\(n => String\(n\.text \|\| ''\)\)/.test(exp1));
ck('breakdown notes ride along, labelled by scope', /'Scope ' \+ \(sowLabels\[x\.id\] \|\| ''\)/.test(exp1),
  'the same line Export Detailed and the print produce');
ck('an empty NOTE heading is not printed', /lines\.length \? \[\[\], \['NOTE:'\]/.test(exp1),
  'a heading over nothing reads like something went missing');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall XLSX export assertions passed');
process.exit(fails ? 1 : 0);
