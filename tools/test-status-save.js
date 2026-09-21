#!/usr/bin/env node
/* The Status panel stages a change and writes it on Save. Writing on every
   click put each status tried on the way into the history.
   Run: node tools/test-status-save.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const panel = (app.match(/statusPanel && \(\(\) => \{[\s\S]*?"HISTORY"/) || [''])[0];
ck('the panel was found', panel.length > 500);
ck('picking a status only stages it', panel.includes('onClick: () => _setD({status: st') && !/onClick: \(\) => \{\s*if \(st === _m\.status\) return;\s*updateMon/.test(panel));
ck('changing the date only stages it', panel.includes('onChange: ev => _setD({date: ev.target.value})'));
ck('Save writes it', panel.includes('onClick:_saveStatus') && panel.includes("updateMon(statusPanel, 'status', _d.status)"));
ck('status first, then the date that corrects its stamp', panel.indexOf("updateMon(statusPanel, 'status', _d.status)") < panel.indexOf("updateMon(statusPanel, 'statusChangedAt'"));
ck('closing with an unsaved choice asks first', (panel.match(/Discard the status change you have not saved\?/g) || []).length >= 2);
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nstatus save OK'); process.exit(bad ? 1 : 0);
