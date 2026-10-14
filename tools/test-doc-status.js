#!/usr/bin/env node
/*
 * The Status on the CE (Project Info box and the printout) follows Monitoring and is not edited from the editor once the CE is saved.
 *   B: Ongoing prints DRAFT (it used to print REVISED), Superseded prints SUPERSEDED (not REJECTED), and a status with no document equivalent
 *      (On Hold, anything added in the Status manager) prints its own name instead of a stale value.
 *   C: the editor's Status box is read-only for a saved CE, and choosing a value there no longer writes to Monitoring.
 * Runs the real function. Run: node tools/test-doc-status.js
 */
'use strict';
const fs = require('fs');
const cfg = fs.readFileSync('src/config.js', 'utf8'), app = fs.readFileSync('src/App.js', 'utf8'), info = fs.readFileSync('src/components/InfoTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const g = {};
new Function('g', 'with(g){' + cfg + '\ng.ceDocStatus=ceDocStatus;g.MON_TO_DOC=MON_TO_DOC;g.DOC_TO_MON=DOC_TO_MON;}')(g);
const f = g.ceDocStatus;
ck('Ongoing prints DRAFT, not REVISED', f('Ongoing', 'DRAFT') === 'DRAFT');
ck('Revised still prints REVISED', f('Revised') === 'REVISED');
ck('Superseded prints SUPERSEDED, not REJECTED', f('Superseded') === 'SUPERSEDED');
ck('Cancelled and No Quote still print REJECTED', f('Cancelled') === 'REJECTED' && f('No Quote') === 'REJECTED');
ck('Submitted and Awarded still print APPROVED', f('Submitted') === 'APPROVED' && f('Awarded') === 'APPROVED');
ck('On Hold prints its own name, not a stale value', f('On Hold', 'APPROVED') === 'ON HOLD');
ck('a status added in the Status manager prints its own name', f('Awaiting Client PO', 'DRAFT') === 'AWAITING CLIENT PO');
ck('a CE not tracked yet uses what was picked in the editor', f('', 'FOR REVIEW') === 'FOR REVIEW' && f('', '') === 'DRAFT');
ck('the pipeline mapping used to decide "same meaning" is unchanged for Superseded', g.MON_TO_DOC.Superseded === 'REJECTED');
ck('App.js uses ceDocStatus for the status the CE shows and prints', /const docStatus = ceDocStatus\(openMonStatus, info\.status\);/.test(app));
const sd = app.slice(app.indexOf('const setDocStatus = v =>'), app.indexOf("const mkEntry = (revSuffix = '')"));
ck('picking a status in the editor no longer writes to Monitoring', sd.length > 20 && !/updateMon/.test(sd) && /openCeId == null/.test(sd), sd);
ck('the editor Status box is read-only for a saved CE and says where to change it', /disabled: openCeId != null/.test(info) && /Change it in CE Monitoring/.test(info));
ck('a status outside the five (SUPERSEDED, ON HOLD) still shows in the box', /CE_DOC_STATUSES\.indexOf\(docStatus\) < 0 \? \[docStatus\]/.test(info));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nDocument status OK');
process.exit(bad ? 1 : 0);
