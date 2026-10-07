/* Submitting a CE for approval says, before anything is sent, who will be notified, who later, who is "Sign by hand" (never
   notified) and who has no email. Run: node tools/test-routing-notice.js */
'use strict';
const fs = require('fs'), path = require('path');
const apv = fs.readFileSync(path.join(__dirname, '..', 'src/approval.js'), 'utf8').replace(/\r\n/g, '\n');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
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
ck('submitting asks first and stops on Cancel', app.indexOf('apvRoutingNotice(approvers, _kept,') > 0 && app.indexOf('if (!confirm(msg)) return; }') > 0);
ck('the confirmation comes before anything is saved', app.indexOf('if (!confirm(msg)) return; }') < app.indexOf('const ok = await apvPersist(apv, _keptN'));
ck('all by hand gets a warning, not only a toast', app.indexOf("alert('Nobody would be notified.") > 0);
ck('the message says nobody is notified until OK', app.indexOf('Nobody is notified until you press OK.') > 0);
process.exit(bad ? 1 : 0);
