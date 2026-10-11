#!/usr/bin/env node
/*
 * Status manager (admin): the status list is one shared list an admin edits -- order, colour, group, names, additions -- and the filters,
 * the Active / Closed / On hold buttons, ceIsOpen and the dashboards all follow it.
 *
 * Run: node tools/test-status-manager.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
const dash = fs.readFileSync('src/components/DashboardTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const ctx = vm.createContext({});
vm.runInContext(cfg + '\nthis.C = { setStatusConfig, statusNames, statusGroupMembers, ceIsOpen, ceStatusName, statusFactoryList, STATUS_LOCKED, CE_CLOSED_STATUSES, DEFAULT_STATUS_OPTIONS };', ctx);
const C = ctx.C;

const fac = C.statusFactoryList();
ck('before an admin saves anything the factory list shows, in its usual order', C.statusNames().join('|') === C.DEFAULT_STATUS_OPTIONS.join('|'));
ck('and ceIsOpen behaves as before', !C.ceIsOpen('Approved') && C.ceIsOpen('On Hold') && C.ceIsOpen('Sourcing'));

/* an admin reorders, adds "Lost" to Closed, moves Sourcing to On hold, renames Ongoing */
const list = fac.map(s => ({ ...s }));
list.reverse();
list.push({ name: 'Lost', group: 'closed', color: '#EF4444' });
list.find(s => s.name === 'Sourcing').group = 'hold';
list.find(s => s.name === 'Ongoing').name = 'In progress';
C.setStatusConfig({ list, renames: { Ongoing: 'In progress' } });
const names = C.statusNames();
ck('the saved order is the order shown', names[0] === 'Superseded' && names[names.length - 1] === 'Lost');
ck('a status added to Closed ends a CE (ceIsOpen follows the Closed group)', !C.ceIsOpen('Lost'));
ck('the six that always closed still do', ['Approved', 'Submitted', 'Awarded', 'No Quote', 'Cancelled', 'Superseded'].every(s => !C.ceIsOpen(s)));
ck('a status moved to On hold is open and is in that group', C.ceIsOpen('Sourcing') && C.statusGroupMembers('hold', names).includes('Sourcing'));
ck('the groups follow the saved list', C.statusGroupMembers('closed', names).includes('Lost') && !C.statusGroupMembers('active', names).includes('Sourcing') && C.statusGroupMembers('active', names).includes('In progress') && C.statusGroupMembers('active', names).includes(''));
ck('a rename reads old rows under the new name', C.ceStatusName('Ongoing') === 'In progress' && C.ceStatusName('Draft') === 'Draft');

/* locked ones cannot be moved out of their group, dropped or renamed away */
const bad1 = [{ name: 'Approved', group: 'active' }, { name: 'Pending', group: 'closed' }, { name: 'X', group: 'nonsense' }];
C.setStatusConfig({ list: bad1 });
ck('a locked status keeps its group', C.statusGroupMembers('closed', C.statusNames()).includes('Approved') && C.statusGroupMembers('active', C.statusNames()).includes('Pending'));
ck('every locked status is always on the list, even if a saved list left it out', C.STATUS_LOCKED.every(s => C.statusNames().includes(s)));
ck('an unknown group falls back to Active', C.statusGroupMembers('active', C.statusNames()).includes('X'));
ck('the closed list never loses a status the code relies on', ['Approved', 'Submitted', 'Awarded', 'No Quote', 'Cancelled', 'Superseded'].every(s => C.CE_CLOSED_STATUSES.includes(s)));
C.setStatusConfig({ list: fac });
ck('putting the factory list back restores the original open/closed split', C.ceIsOpen('Sourcing') && !C.ceIsOpen('Awarded') && C.CE_CLOSED_STATUSES.length === 6);

ck('App loads the shared list and applies it', /dbGetCompanyKey\('ce_statuses'\)/.test(app) && /setStatusConfig\(v\); setStatusCfg\(v\)/.test(app));
ck('only an admin can change it', /const statusEdit = change => \{\n\s+if \(!isAdmin\)/.test(app));
ck('every change is saved to the shared list and audited', /dbSaveCompanyKey\('ce_statuses', next\)/.test(app) && /auditLog\('status_list'/.test(app));
ck('a status that CEs still use cannot be deleted', /Move them to another status first/.test(app) && /const statusUse = /.test(app));
ck('locked statuses cannot be renamed or deleted', /STATUS_LOCKED\.includes\(from\)\) return/.test(app) && /if \(STATUS_LOCKED\.includes\(nm\)\) return;/.test(app));
ck('the old per-device list is only used until a shared one exists', /statusCfg \? \[\] : customStatuses/.test(app));
ck('a picked colour wins over the built-in one', /if \(s\.color\) STATUS_COLOR_MAP\[s\.name\] = s\.color/.test(app));
ck('the panel and its button are admin-only', /isAdmin && showStatusMgr && statusMgrPanel\(\)/.test(mon) && /isAdmin && \/\*#__PURE__\*\/React\.createElement\("button", \{\n\s+style: btn\('def', true\),\n\s+onClick: \(\) => setShowStatusMgr/.test(mon));
ck('the panel can reorder, recolour, rename, regroup, add and delete', ['statusMove', 'statusSet', 'statusRename', 'statusRemove', 'addStatus'].every(f => new RegExp(f + '\\(').test(mon)));
ck('the dashboard lists statuses in the admin\'s order, in their colours', /allStatuses/.test(dash) && /getStatusColor\(s\)\+'33'/.test(dash) && /DashboardTab\(\{ allStatuses,/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nStatus manager OK');
process.exit(bad ? 1 : 0);
