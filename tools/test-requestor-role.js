#!/usr/bin/env node
/* The Requestor: an account that raises a request for estimation -- the CE
   number, the customer, what the job is, when it is wanted and who is to cost
   it -- and hands it over there. Everything that comes back is theirs to read
   in full. None of it is theirs to change.

   Hiding the costing tabs is how that looks. The save path is how it holds:
   every save goes through one refusal, so a control that slips through, a
   keyboard shortcut and the auto-save are all answered the same way.

   Run: node tools/test-requestor-role.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- the role itself ---- */
const ctx = { console, window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(ctx);
const roles = db.slice(db.indexOf("const ROLE_OWNER='owner'"), db.indexOf('const findOwner='));
vm.runInContext(roles + '\nthis.R = { hasAdminPowers, isOwnerRole, isRequestorRole, canCostCE, roleName, ASSIGNABLE_ROLES, ROLE_REQUESTOR };', ctx);
const R = ctx.R;

ck('a requestor is a role of its own', R.ROLE_REQUESTOR === 'requestor' && R.isRequestorRole('requestor') === true);
ck('and is not an admin by another name', R.hasAdminPowers('requestor') === false && R.isOwnerRole('requestor') === false);
ck('an estimator, an admin and the owner are not requestors',
  ['user', 'admin', 'owner', '', null].every(r => R.isRequestorRole(r) === false));
ck('costing is everyone else\'s', R.canCostCE('user') && R.canCostCE('admin') && R.canCostCE('owner') && !R.canCostCE('requestor'));
ck('the role reads as what it is, not as a keyword',
  R.roleName('user') === 'Estimator' && R.roleName('requestor') === 'Requestor' && R.roleName('owner') === 'Owner');
ck('an admin can hand out the three roles', R.ASSIGNABLE_ROLES.join() === 'user,requestor,admin');
ck('and the owner is not one of them, so a second cannot be minted', R.ASSIGNABLE_ROLES.indexOf('owner') < 0);
ck('an unknown role is treated as no powers at all',
  !R.hasAdminPowers('REQUESTOR '.toLowerCase().trim() + 'x') && R.canCostCE('nonsense'));
ck('and the role is read without regard to case', R.isRequestorRole('Requestor') && R.hasAdminPowers('ADMIN'));

/* ---- the tabs ---- */
const tabs = (app.match(/const REQUESTOR_TABS = \[([^\]]+)\]/) || [])[1] || '';
const list = tabs.split(',').map(s => s.trim().replace(/'/g, ''));
ck('a requestor is given the tabs the work needs',
  ['mywork', 'info', 'sow', 'history', 'dashboard'].every(t => list.includes(t)));
ck('and none of the costing tabs, where nothing would be theirs to change',
  ['manpower', 'tools', 'materials', 'ppe', 'misc', 'summary', 'masterlist', 'sowbreak'].every(t => !list.includes(t)));
ck('CE Monitoring is among them, which is where a request is raised', list.includes('history'));
ck('the tab list is filtered by the role, not by the label',
  app.includes("isRequestor ? CE_TABS.filter(t => REQUESTOR_TABS.indexOf(t.id) >= 0) : CE_TABS"));
ck('Users stays an admin tab', /isAdmin \? \[\{\s*id: 'admin'/.test(app));

/* ---- the refusal, run as the app runs it ---- */
const start = app.indexOf('  const requestorSaveRefusal = (e) => {');
const stop = app.indexOf('  const handleSave = async () => {');
ck('the refusal is in the app', start > 0 && stop > start);
const mk = (isRequestor, me) => new Function('isRequestor', 'currentUser',
  'return (' + app.slice(start, stop).replace('const requestorSaveRefusal = ', '').trim().replace(/;$/, '') + ')')(isRequestor, { username: me });

const asReq = mk(true, 'sales1');
ck('a requestor may save their own request',
  asReq({ info: { request: true }, savedBy: 'sales1' }) === null);
ck('and one that is not yet saved anywhere, which is theirs by definition',
  asReq({ info: { request: true }, savedBy: null }) === null);
ck('but not a request somebody else raised',
  /raised by/.test(asReq({ info: { request: true }, savedBy: 'sales2', savedByName: 'Ana' }) || ''));
ck('and the refusal says who to ask', /Ana/.test(asReq({ info: { request: true }, savedBy: 'sales2', savedByName: 'Ana' }) || ''));
ck('a CE that has been costed is no longer a request, and is out of their hands',
  /Costing is the estimator/.test(asReq({ info: { request: false }, savedBy: 'sales1' }) || ''));
ck('the refusal says what they can still do instead of only saying no',
  /raise a request from CE Monitoring/.test(asReq({ info: {}, savedBy: 'sales1' }) || '') &&
  /read this CE in full/.test(asReq({ info: {}, savedBy: 'sales1' }) || ''));

const asEst = mk(false, 'aljon');
ck('an estimator is refused nothing by any of this',
  [{ info: {} }, { info: { request: true }, savedBy: 'sales1' }, { info: { request: false } }].every(e => asEst(e) === null));

/* ---- and it is asked before anything is written ---- */
const save = app.slice(stop, app.indexOf('const handleSaveRevision', stop));
const refusalAt = save.indexOf('requestorSaveRefusal(');
ck('every save asks it', refusalAt > 0);
['dbSaveHistory(', 'dbSaveMonEntry(', 'retireDrafts('].forEach(w => {
  const at = save.indexOf(w);
  ck('it is asked before ' + w.replace('(', '') + ' is called', at < 0 || refusalAt < at);
});
ck('whose request it is, is taken from what was saved, not from what is on screen',
  save.includes("const _rec = (history || []).find(h => String(h.ceNum || '').trim().toUpperCase() === (info.ceNum || '').trim().toUpperCase());"));

/* ---- handing the role out ---- */
const panel = fs.readFileSync('src/components/AdminPanel.js', 'utf8');
ck('the roles an admin can hand out are the three, in turn',
  panel.includes('const at = ASSIGNABLE_ROLES.indexOf(cur);') &&
  panel.includes('ASSIGNABLE_ROLES[(at < 0 ? 0 : at + 1) % ASSIGNABLE_ROLES.length]'));
ck('and the confirm says what the person becomes, not just the word',
  panel.includes('raises requests for estimation and reads what comes back'));
ck('the role column reads as a role', panel.includes("isOwnerRole(u.role) ? '★ owner' : roleName(u.role)"));
ck('changing a role is still logged', panel.includes("auditLog('role_change'"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nrequestor role OK');
process.exit(bad ? 1 : 0);
