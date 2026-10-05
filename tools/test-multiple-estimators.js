/* A request can be assigned to several estimators; each of them finds it as theirs.
   Run: node tools/test-multiple-estimators.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = R('src/App.js'), m = R('src/components/RceReviewModal.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = m.indexOf('function ceeNames'), b = m.indexOf('function NamePicker');
const f = new Function(m.slice(a, b) + 'return {ceeNames, ceeMatches};')();
ck('names split on commas and semicolons, blanks dropped', JSON.stringify(f.ceeNames(' Ana Cruz, Ben Reyes;;  ')) === JSON.stringify(['Ana Cruz', 'Ben Reyes']) && f.ceeNames('').length === 0 && f.ceeNames(undefined).length === 0);
ck('any one of the estimators finds it as theirs, in any case', f.ceeMatches(['BEN REYES', 'BREYES'], 'Ana Cruz, Ben Reyes') && f.ceeMatches(['ANA CRUZ'], 'Ana Cruz') && !f.ceeMatches(['CARLO'], 'Ana Cruz, Ben Reyes') && !f.ceeMatches(['ANA'], 'Ana Cruz'));
ck('the request form, the review dialog and the Assign panel use the picker', (app.match(/React\.createElement\(NamePicker/g) || []).length >= 2 && m.indexOf('React.createElement(NamePicker, { value: est') > 0);
ck('Assigned to me, My Work and the mine test read every name', app.indexOf('ceeMatches(me, m.ceeName)') > 0 && app.indexOf("ceeMatches(meNames(), m.ceeName || m.preparedBy || e.savedBy || '')") > 0 && app.indexOf("ceeMatches(names, x.m.ceeName || x.m.preparedBy || x.e.savedBy || '')") > 0);
ck('it is stored as one string, so every other place still reads an Estimator', app.indexOf("ceeName: String(f.assignee || '').trim() || 'Unassigned'") > 0);
process.exit(bad ? 1 : 0);
