/* A requestor reads every CE, and changes only the ones they raised.
   =================================================================
   The owner chose this: in CE Monitoring and the Dashboard a requestor sees
   all CEs, the same as an admin. That exposes everyone's costing, so the
   other half has to hold -- nothing on somebody else's row can be changed.

   Run: node tools/test-requestor-sees-all.js */
'use strict';
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const NL = String.fromCharCode(10);
const cut = (from, to) => { const a = app.indexOf(from), b = app.indexOf(to, a); if (a < 0 || b < 0) { console.error('anchor missing: ' + from); process.exit(1); } return app.slice(a, b); };

console.log('seeing everything:');
ck('canSeeAll is admin or requestor', app.indexOf('const canSeeAll = isAdmin || isRequestor;') > 0);
ck('history is fetched unfiltered for it', app.indexOf('dbGetHistory(currentUser.username, canSeeAll, canSeeAll ? null : mineToSee)') > 0);
ck('no cache filter is still keyed on isAdmin alone',
  app.indexOf('setHistory(isAdmin ? cached') < 0 && app.indexOf('effective = isAdmin ?') < 0);

console.log(NL + 'changing only their own:');
const src = cut('const reqOwns = (id, mon) => {', 'const mineToSee = id => {');
const mk = (user, hist, mon) => new Function('currentUser', 'history', '_monRef', src + 'return reqOwns;')(user, hist, { current: mon });
const me = { name: 'Rhea Santos', username: 'rhea' };
const MON = { 1: { receivedBy: 'Rhea Santos' }, 2: { receivedBy: 'Other Person' }, 3: {} };
const HIST = [{ id: 3, savedBy: 'rhea' }, { id: 2, savedBy: 'other' }];
const own = mk(me, HIST, MON);
ck('a request they raised is theirs', own(1) === true);
ck('someone else\'s is not', own(2) === false);
ck('one whose monitoring row has not arrived is theirs by savedBy', own(3) === true);
ck('an unknown CE is not', own(99) === false);
ck('the guard runs before updateMon changes anything',
  app.indexOf("const updateMon = (ceId, field, val) => setMonData(prev => {" + NL + "    if (isRequestor && !reqOwns(ceId, prev))") > 0);
ck('Status, Remarks, Assign and Edit are disabled on rows that are not theirs',
  app.split('disabled: !!e._draft || (isRequestor && !reqOwns(e.id)),').length - 1 === 4);
ck('delete stays admin-only', /isAdmin \|\| \(e\._draft && e\.savedBy === currentUser\.username\)\) && /.test(app));

console.log(NL + 'My Work table:');
ck('requestors get a table of their requests', app.indexOf("'📤 My requests'") > 0);
ck('with the six columns', ["'RCE / CE NO.', 'CUSTOMER', 'JOB', 'DISCIPLINE', 'ASSIGNED TO', 'STATUS'"].every(c => app.indexOf(c) > 0));
ck('REQUEST badge while still a request, View after',
  app.indexOf("still ? /*#__PURE__*/React.createElement(\"span\"") > 0 && app.indexOf(": viewBtn(x)))") > 0);
ck('the card is no longer shown to requestors', app.indexOf("!isRequestor && fSent.length > 0 && section('📤 Requests I sent'") > 0);

ck('the My Work button is New Request for a requestor, the CE editor for everyone else',
  app.indexOf('onClick:openRequest,title:"Log a request for estimation') > 0 && app.indexOf('isRequestor ? "➕ New Request" : "➕ Go to the CE editor"') > 0);

ck('the For review card is not shown to a requestor', app.indexOf("!isRequestor && fForReview.length > 0 && section('🔎 For review") > 0);

ck('a message raised while a form is open is drawn above it',
  app.slice(app.indexOf("padding: '9px 18px',"), app.indexOf("padding: '9px 18px',") + 800).indexOf('zIndex: 10000,') > 0 && app.indexOf('zIndex: 999,') < 0);
ck('a blocked change is logged, not toasted over every screen', app.indexOf('[blocked] a requestor tried to change CE') > 0);

console.log(bad ? NL + bad + ' FAILURE(S)' : NL + 'requestor visibility OK');
process.exit(bad ? 1 : 0);
