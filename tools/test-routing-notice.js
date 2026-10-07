/* Submitting a CE for approval says, before anything is sent, who will be notified, who later, who is "Sign by hand" (never
   notified) and who has no email. Run: node tools/test-routing-notice.js */
'use strict';
const fs = require('fs'), path = require('path');
const apv = fs.readFileSync(path.join(__dirname, '..', 'src/approval.js'), 'utf8').replace(/\r\n/g, '\n');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = apv.indexOf('function apvRoute('), b = apv.indexOf('/* Where the routing stands');
const notice = new Function(apv.slice(a, b) + '; return apvRoutingNotice;')();
const U = [{ username: 'ana', name: 'Ana Cruz', email: 'ana@x.com' }, { username: 'ben', name: 'Ben Reyes', email: '' }, { username: 'cy', name: 'Cy Lim', email: 'cy@x.com' }];
const A = [{ id: 'a', user: 'ana', role: 'Reviewed by', step: 1 }, { id: 'b', user: 'ben', title: 'Manager', step: 2 }, { id: 'c', user: '', name: 'Dan Ong', role: 'Approved by', step: 3 }, { id: 'd', user: 'cy', step: 2 }];
const n = notice(A, {}, {}, U);
ck('the open step is notified at once', n.now.join() === 'Ana Cruz (Reviewed by)');
ck('later steps are notified as the step before signs, in step order', n.later.length === 2 && n.later[0].indexOf('Step 2') === 0);
ck('a "Sign by hand" signatory is listed as never notified', n.byHand.join() === 'Dan Ong (Approved by)');
ck('a routed user with no email is flagged', n.noEmail.join() === 'Ben Reyes');
const all = notice([{ id: 'x', user: '', name: 'A' }, { id: 'y', user: '', name: 'B' }], {}, {}, U);
ck('all by hand: nobody routed, both listed', all.routed === 0 && all.byHand.length === 2 && all.now.length === 0);
const again = notice(A, { a: { at: 1 } }, {}, U);
ck('after a Return, a signature that still stands is not asked again, so step 2 is notified now', again.now.length === 2 && again.later.length === 0);
ck('an admin-skipped line is left out', notice(A, {}, { a: true }, U).now.length === 2);
ck('submitting asks first and stops on Cancel', app.indexOf('apvRoutingNotice(approvers, _kept,') > 0 && app.indexOf("if (!await uiConfirm(msg, {ok: 'Submit for approval'") > 0);
ck('the confirmation comes before anything is saved', app.indexOf("if (!await uiConfirm(msg, {ok: 'Submit for approval'") < app.indexOf('const ok = await apvPersist(apv, _keptN'));
ck('all by hand gets a warning, not only a toast', app.indexOf("uiAlert('Nobody would be notified.") > 0);
ck('the message says nobody is notified until you submit', app.indexOf('Nobody is notified until you submit.') > 0);
/* auto-link: a named signatory is linked to the one account with that name */
const al = new Function(apv.slice(apv.indexOf('function apvAutoLink('), apv.indexOf('/* What submitting will do')) + '; return apvAutoLink;')();
const U2 = [{ username: 'km', name: 'Kenneth Mendoza' }, { username: 'ju', name: 'Jhuniel Ubana' }, { username: 'd1', name: 'Dan Ong' }, { username: 'd2', name: 'Dan Ong' }, { username: 'est', name: 'Eddie Estimator' }];
const P = [{ role: 'Prepared By', name: 'Eddie Estimator' }, { role: 'Checked By', name: 'Kenneth  MENDOZA' }, { role: 'Noted By', name: 'Mr. Jhuniel Ubana' },
  { role: 'Noted By', name: 'Dan Ong' }, { role: 'Approved By', name: 'Nobody Known' }, { role: 'Noted By', name: 'Kenneth Mendoza', byHand: true }, { role: 'Noted By', name: 'Kenneth Mendoza', user: 'other' }];
const r = al(P, U2);
ck('a name matches its account, ignoring case, spacing and Mr./Ms.', r.approvers[1].user === 'km' && r.approvers[2].user === 'ju' && r.linked.length === 2);
ck('the Prepared By line is left for the estimator to sign by hand', !r.approvers[0].user);
ck('two accounts with one name, or none, are left alone', !r.approvers[3].user && !r.approvers[4].user);
ck('a line put on "Sign by hand" on purpose, or already linked, is not touched', !r.approvers[5].user && r.approvers[6].user === 'other');
ck('a linked line gets an id so it can be routed', !!r.approvers[1].id);
ck('nothing to link returns the same list', al([{ role: 'Prepared By', name: 'X' }], U2).approvers.length === 1 && al([], U2).linked.length === 0);
ck('Prepared By with no name is not warned about as "by hand"', notice([{ id: 'x', user: 'ana', step: 1 }, { role: 'Prepared By', name: '', title: 'Cost Estimator' }], {}, {}, U).byHand.length === 0);
const st = notice([{ id: 'a', user: 'ana', step: 2 }, { id: 'b', user: 'cy', step: 3 }, { id: 'c', user: 'ben', step: 5 }], {}, {}, U);
ck('steps are said in order (Step 2, Step 3), not by card position (3, 5)', st.later.join('|').indexOf('Step 2: Cy Lim') === 0 && st.later[1].indexOf('Step 3: Ben Reyes') === 0);
ck('the page links names to accounts once the accounts are known, and never while out for approval', app.indexOf('const r = apvAutoLink(approvers, apvUsers);') > 0 && app.indexOf('if (apvLocked || !apvUsers.length) return;') > 0);
ck('choosing "Sign by hand" on purpose sticks', app.indexOf('user: u, byHand: !u,') > 0);
process.exit(bad ? 1 : 0);
