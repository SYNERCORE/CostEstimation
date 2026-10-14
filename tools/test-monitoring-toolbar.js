#!/usr/bin/env node
/*
 * CE Monitoring toolbar: the data chores (list template, export, the two imports) sit in one "Import / Export" menu; New Request, Refresh and
 * Save stay out where they are used every day. The file inputs live outside the menu so closing it never drops a chosen file, and a running
 * import still shows its progress on the menu button. Run: node tools/test-monitoring-toolbar.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const bar = src.slice(src.indexOf('id: "mon-import-xlsx"'), src.indexOf('"+ Save Current CE"'));
ck('the toolbar section was found', bar.length > 500);
ck('one Import / Export menu', /className: 'mon-data-menu'/.test(bar) && /Import \/ Export/.test(bar));
for (const l of ['Export this list (xlsx)', 'Update CEs from a list (xlsx)', 'Import CE workbooks (xlsx)', 'Blank list template (xlsx)'])
  ck('menu item: ' + l, bar.includes(l));
ck('the file inputs are outside the menu, so a chosen file survives it closing', src.indexOf('id: "mon-import-xlsx"') < src.indexOf("className: 'mon-data-menu'") && src.indexOf('id: "mon-import-cefiles"') < src.indexOf("className: 'mon-data-menu'"));
ck('the menu items open those inputs', /getElementById\('mon-import-xlsx'\)\.click\(\)/.test(bar) && /getElementById\('mon-import-cefiles'\)\.click\(\)/.test(bar));
ck('a running import shows on the menu button and disables its item', bar.includes('Importing') && bar.includes('importProgress.done') && bar.includes('!!importProgress]') && bar.includes('!!ceImportProgress]'));
ck('the old loose buttons are gone', !/"\u2193 Template"/.test(src) && !/"\u2B06 Import xlsx"/.test(src) && !/"\u2b07 Export xlsx"/.test(src));
ck('New Request, Refresh and Save are still direct buttons', /"\+ New Request"/.test(src) && /Refresh"\)/.test(src) && /"\+ Save Current CE"/.test(src));
ck('the menu closes on an outside click', /_monMenuClose/.test(src) && /removeAttribute\('open'\)/.test(src));
ck('the template download is kept', /const monTemplateXlsx = \(\) => \{/.test(src) && /SHIC_CE_Import_Template\.xlsx/.test(src));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nMonitoring toolbar OK');
process.exit(bad ? 1 : 0);
