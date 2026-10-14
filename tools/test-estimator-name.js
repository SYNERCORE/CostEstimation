#!/usr/bin/env node
/*
 * One name per estimator. A CE saved by its estimator carried the username (savedBy), one that was assigned carried the full name the
 * picker offered, so the same person showed up as "jbaguidudol" and "Mark Aries Encarnado" in the Estimator column. The column, its
 * sort and search, My Work and the Dashboard now show the full name of the user the value belongs to; anything that is nobody's
 * username (an imported initial, a typed name) stays as written.
 * Run: node tools/test-estimator-name.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const i = app.indexOf('const estName = v =>');
const body = app.slice(i, app.indexOf('\n  };', i) + 5);
const monUsers = [{ username: 'MsuraLta', name: 'Michael Suralta' }, { username: 'kenneth2026', name: 'Kenneth Mendoza' }, { username: 'plain', name: '' }];
const estName = new Function('monUsers', body + '\nreturn estName;')(monUsers);
ck('a username shows as the full name, whatever its case', estName('msuralta') === 'Michael Suralta' && estName('KENNETH2026') === 'Kenneth Mendoza');
ck('a full name stays as it is', estName('Kenneth Mendoza') === 'Kenneth Mendoza');
ck('a name that is nobody\'s username is left as written', estName('MFS') === 'MFS' && estName('Unassigned') === 'Unassigned');
ck('a user with no full name keeps the username', estName('plain') === 'plain');
ck('several estimators are each resolved', estName('msuralta, Ana Cruz') === 'Michael Suralta, Ana Cruz');
ck('empty stays empty', estName('') === '' && estName(null) === '');
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8'), my = fs.readFileSync('src/components/MyWorkTab.js', 'utf8'), da = fs.readFileSync('src/components/DashboardTab.js', 'utf8');
ck('the Estimator cell and its edit box use it', mon.includes("estName(m.ceeName||m.preparedBy||e.savedBy||'')") && mon.includes("defaultValue: estName("));
ck('sorting and searching use it', app.includes("case 'ceeName':      return estName(") && app.includes('estName(m.ceeName || m.preparedBy || e.savedBy), m.preparedBy'));
ck('My Work and the Dashboard use it', my.includes('estName(x.m.ceeName)') && da.includes('estName(String(x.m.ceeName'));
console.log(bad ? bad + ' FAILURE(S)' : 'Estimator name OK');
process.exit(bad ? 1 : 0);
