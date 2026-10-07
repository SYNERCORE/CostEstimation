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
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('the Monitoring row opens its own tab:');
ck('there is a printable-CE action', /onClick:\(\)=>openForPrint\(e\.id,'ce'\)/.test(app));
ck('and an Export Detailed action', /onClick:\(\)=>openForPrint\(e\.id,'detailed'\)/.test(app));
ck('both only on a row with a real CE id', /typeof e\.id==='number'&&[\s\S]{0,160}openForPrint/.test(app),
  'a draft row has no numeric id and nothing saved to fetch');

const opener = app.match(/const openForPrint = \(id, as\) => \{[\s\S]*?\n  \};/);
if (!opener) { console.error('openForPrint not found'); process.exit(1); }
console.log('\nand it leaves this tab alone:');
ck('it does not load the CE here', !/handleLoad/.test(opener[0]),
  'that is the whole point -- the open estimate must not move');
ck('it changes no CE state', !/set(Mp|Tools|Mats|Ppe|Info|Misc)\(/.test(opener[0]));
ck('the hidden frame is asked for that CE and that document',
  /'\?print=' \+ id \+ '&as=' \+ as \+ \(isFile \? '' : '&relay=1'\)/.test(opener[0]));
ck('a blocked pop-up is reported', /Allow pop-ups for this site/.test(opener[0]),
  'otherwise nothing happens and there is no way to know why');
ck('the printed CE is shown in a blank tab, not a copy of the app',
  /const w = window\.open\('', '_blank'\)/.test(opener[0]) && !/window\.open\(window\.location\.pathname/.test(opener[0]),
  'a new tab opened a second copy of the app that stayed open behind the document');
ck('that tab is opened on the click, before the frame loads', opener[0].indexOf("window.open('', '_blank')") < opener[0].indexOf('document.body.appendChild(f);\n    showToast'));
ck('the document is only taken from the frame this window made', /ev\.origin !== window\.location\.origin \|\| ev\.source !== f\.contentWindow/.test(opener[0]));
ck('a CE that never arrives is reported and the blank tab closed', /did not load in time/.test(opener[0]) && /w\.close\(\)/.test(opener[0]));

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
  /if \(\/\^\(detailed\|template\)\/\.test\(as\)\) \{[\s\S]{0,200}handleExportXLSX\(_no\); else handleExport\(_no\);[\s\S]{0,600}\} else if \(autoPrint\.relay && window !== window\.top\) \{[\s\S]{0,700}\} else if \(as === 'view'\) handleGenerateCE\(\{ embed: true \}\); else if \(as === 'noamt'\) handleGenerateCE\(\{ noAmounts: true \}\); else handleGenerateCE\(\)/.test(eff[0]));
ck('a frame hands the finished CE to the window that asked, then stops',
  /handleGenerateCE\(\{ htmlOnly: true, noAmounts: as === 'noamt' \}\);\s*window\.parent\.postMessage\(\{ shicCeHtml: _html \|\| '' \}, window\.location\.origin\);/.test(eff[0]));

console.log('\n⬇ xlsx leaves no window behind:');
ck('a workbook is built in a hidden frame, not a new tab or window',
  /const isFile = \/\^\(detailed\|template\)\/\.test\(as\);\s*const f = document\.createElement\('iframe'\);\s*f\.style\.display = 'none';/.test(opener[0]));
ck('and the frame stops itself once the file is out',
  /if \(window !== window\.top\) setTimeout\(\(\) => \{ document\.open\(\);/.test(eff[0]));

console.log('\nView in CE Monitoring:');
ck('the button opens the view, not the editor', /onClick:\(\)=>setViewCE\(\{id:e\.id,/.test(app));
ck('the frame asks for the view', /'\?print=' \+ viewCE\.id \+ '&as=view'/.test(app));
ck('the framed app replaces itself with the CE, so nothing keeps running',
  /if \(opt && opt\.embed && window !== window\.top\) \{\s*document\.open\(\); document\.write\(fullHtml\); document\.close\(\);\s*return;/.test(app));

console.log('\nView on a draft:');
ck('a draft row has its own View', /e\._draft&&typeof e\.id!=='number'&&/.test(app));
ck('the draft is handed over once and removed', /localStorage\.getItem\(_vk\) \|\| 'null'\); localStorage\.removeItem\(_vk\);/.test(app));
ck('a framed copy never autosaves a draft', /if\(window!==window\.top\)return;\s*const live=_live\.current;/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint without loading OK');
process.exit(bad ? 1 : 0);
