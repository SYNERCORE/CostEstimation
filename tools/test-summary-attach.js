#!/usr/bin/env node
/*
 * Summary tab: an "Attach files" button that opens the same attachments panel as the paperclip in CE Monitoring, for the CE on screen.
 * Attachments hang off the saved CE's monitoring record, so it refuses an unsaved CE and a site that is not connected, and creates the
 * record (ensure mode, which cannot overwrite what the site holds) when a saved CE has none.
 *
 * Run: node tools/test-summary-attach.js
 */
'use strict';
const fs = require('fs');
const sum = fs.readFileSync('src/components/SummaryTab.js', 'utf8');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

ck('the tab gets attachFromSummary from App', /SummaryTab\(\{ _defaultsUntouched[^\n]*visSigs, attachFromSummary \}\)/.test(app) && /approvers,\n\s+attachFromSummary,/.test(sum));
ck('the Summary action bar has an Attach files button wired to it', /className: 'sum-attach'/.test(sum) && /onClick: attachFromSummary/.test(sum) && /Attach files"/.test(sum));
ck('it finds the saved CE by its number', /\(history \|\| \[\]\)\.find\(h => h && h\.info && h\.info\.ceNum === info\.ceNum\)/.test(app));
ck('an unsaved CE is told to save first', /Save the CE first -- attachments are filed against the saved CE/.test(app));
ck('a site that is not connected is said so', /Attachments are kept on SharePoint, which is not connected here/.test(app));
ck('a saved CE with no record gets one in ensure mode, and the id set is refreshed', /dbSaveMonEntry\(rec\.id, info\.ceNum, monData\[rec\.id\] \|\| \{\}, 'ensure'\)/.test(app) && /setMonSpIds\(new Set\(Object\.keys\(_monSpIdCache\)\)\);\n\s+\}\n\s+openAttachPanel\(rec\.id\)/.test(app));
ck('it opens the existing panel, not a second one', /openAttachPanel\(rec\.id\);\n\s+\};/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nSummary attach OK');
process.exit(bad ? 1 : 0);
