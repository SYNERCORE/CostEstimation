#!/usr/bin/env node
/*
 * Printing a previous CE must not disturb the one being worked on.
 *
 * Both documents are built from what is on screen -- section totals, benefits,
 * highlighted costs and the signatory block are all derived from the CE the
 * editor is holding -- so producing another CE's paperwork means that CE has
 * to be on screen somewhere. Loading it over the open estimate is the one
 * place it must NOT be. Monitoring opens it in its own tab instead.
 *
 * What has to hold:
 *   - the row actions open a tab; they never call handleLoad in this one
 *   - the tab is asked for a specific CE id and a specific document
 *   - the document is produced only after that CE is actually on screen. The
 *     export functions read live state, so firing on arrival would print
 *     whatever the tab had open before
 *   - a blocked pop-up is reported, not silently swallowed
 *   - a CE that cannot be fetched says so instead of printing an empty form
 *
 * Run: node tools/test-print-without-loading.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('the Monitoring row opens its own tab:');
ck('there is a printable-CE action', /onClick:\(\)=>openForPrint\(e\.id,'ce'\)/.test(app));
ck('and an Export Detailed action', /onClick:\(\)=>openForPrint\(e\.id,'detailed'\)/.test(app));
ck('both only on a row with a real CE id', /typeof e\.id==='number'&&[\s\S]{0,120}openForPrint/.test(app),
  'a draft row has no numeric id and nothing saved to fetch');

const opener = app.match(/const openForPrint = \(id, as\) => \{[\s\S]*?\n  \};/);
if (!opener) { console.error('openForPrint not found'); process.exit(1); }
console.log('\nand it leaves this tab alone:');
ck('it does not load the CE here', !/handleLoad/.test(opener[0]),
  'that is the whole point -- the open estimate must not move');
ck('it changes no CE state', !/set(Mp|Tools|Mats|Ppe|Info|Misc)\(/.test(opener[0]));
ck('the new tab is asked for that CE and that document',
  /'\?print=' \+ id \+ '&as=' \+ as/.test(opener[0]));
ck('a blocked pop-up is reported', /Allow pop-ups for this site/.test(opener[0]),
  'otherwise nothing happens and there is no way to know why');

console.log('\nthe opened tab prints the CE it was asked for:');
ck('it fetches that id', /const full = await dbLoadCE\(_pid\)/.test(app));
ck('a CE it cannot fetch is reported, not printed empty',
  /Could not open that CE/.test(app),
  'an empty form under a real CE number is worse than an error');
ck('the URL is cleared so a refresh does not print again',
  /window\.history\.replaceState\(\{\}, '', window\.location\.pathname\);\s*\n\s*setTimeout\(async/.test(app));

const eff = app.match(/useEffect\(\(\) => \{\n    if \(!autoPrint\) return;[\s\S]*?\}, \[autoPrint[^\]]*\]\);/);
if (!eff) { console.error('autoPrint effect not found'); process.exit(1); }
console.log('\nand only once that CE is on screen:');
ck('it waits for the CE number to match', /\(info\.ceNum \|\| ''\) !== autoPrint\.ceNum/.test(eff[0]),
  'the export reads live state, so firing early prints the previous CE');
ck('it re-checks as the rows land', /\[autoPrint, info\.ceNum, mp, tools, mats, ppe\]/.test(eff[0]));
ck('it fires once, not on every render', /setAutoPrint\(null\);/.test(eff[0]));
ck('printable CE and Export Detailed are both reachable',
  /if \(as === 'detailed'\) handleExportXLSX\(\); else handleGenerateCE\(\)/.test(eff[0]));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint without loading OK');
process.exit(bad ? 1 : 0);
