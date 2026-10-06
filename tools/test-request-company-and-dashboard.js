/* The RCE names the issuing company, and the Dashboard counts the requests awaiting review.
   Run: node tools/test-request-company-and-dashboard.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

console.log('the company on the request:');
const a = app.indexOf('const submitRequest = async () => {'), b = app.indexOf('setReqBusy(true);', a);
const head = app.slice(a, b);
ck('the form starts with no company chosen', app.indexOf("rceNo: '', companyId: '',") > 0);
ck('a blank company is refused with the other missing fields', head.indexOf("_errs.companyId = 1; _todo.push('Issuing company')") > 0);
const run = f => new Function('f', 'ceNum', head.slice(head.indexOf('const _errs'), head.indexOf('if (_todo.length)')) + '; return _todo;')(f, 'T-1');
ck('no company: refused', run({ client: 'A', assignee: 'x', companyId: '' }).indexOf('Issuing company') >= 0);
ck('a company: accepted', run({ client: 'A', assignee: 'x', companyId: '2' }).length === 0);
ck('company id 0 is a real choice, not blank', run({ client: 'A', assignee: 'x', companyId: 0 }).length === 0);
ck('it is kept on the request (as a number when it is one)', app.indexOf("companyId: isNaN(f.companyId) ? f.companyId : Number(f.companyId),") > 0);
ck('the form has a starred, red-when-missing company select', app.indexOf('L("Issuing company *"') > 0 && app.indexOf("reqForm._errs.companyId") > 0);
ck('the reviewer sees the company with its prefix', app.indexOf("['Issuing company'") > 0);

console.log('\naccepting:');
const acc = app.slice(app.indexOf('const acceptRequest = async'), app.indexOf('const openReview = '));
ck('the CE number follows the request\'s company prefix', acc.indexOf('nextCeNumForCompany(history, co, ceNums)') > 0);
ck('the prompt names the company', acc.indexOf("'Issuing company: ' + co.name") > 0);
ck('an older request with no company still gets the old prompt', acc.indexOf("This request names no company.") > 0 && acc.indexOf('nextCeNum(history, null, ceNums)') > 0);

console.log('\nthe Dashboard:');
const d = app.slice(app.indexOf("tab === 'dashboard' && (() => {"), app.indexOf("const kpiCard"));
ck('requests awaiting review are counted: not accepted, not returned, not declined', d.indexOf("reviewStatus !== 'returned'") > 0 && d.indexOf("reviewStatus !== 'declined'") > 0 && d.indexOf('isUnacceptedReq(h)') > 0);
ck('a request is not also counted as an open CE', d.indexOf('liveRows.filter(h => !isUnacceptedReq(h)).map(h => ({h, m: monOf(h)}))') > 0);
ck('the card is on the KPI row and names how many are with their requestors', app.indexOf("kpiCard('Requests Awaiting Review'") > 0 && app.indexOf("' returned)'") > 0);

/* the counting itself */
const body = d.slice(d.indexOf('const isUnacceptedReq'), d.indexOf('const openCEs'));
const count = rows => new Function('liveRows', 'monOf', 'reqDeadline', body + '; return {w: reqAwaitingN, r: reqReturnedN};')(rows, () => ({}), () => '');
const mk = (id, info, extra) => ({ id, info, ...(extra || {}) });
const c = count([
  mk(1, { request: true }),                                   // new
  mk(2, { request: true, reviewStatus: 'resubmitted' }),      // sent back to the team
  mk(3, { request: true, reviewStatus: 'returned' }),         // with the requestor
  mk(4, { request: true, reviewStatus: 'declined' }),         // closed
  mk(5, { request: true, acceptedCeNum: 'SHIC-CE-2026-1' }),  // accepted: a CE now
  mk(6, {}),                                                  // an ordinary CE
  mk(7, { request: true }, { _draft: true }),                 // a draft is not a request
  mk('x', { request: true })                                  // not on the site yet
]);
ck('counts exactly the new and resubmitted ones', c.w === 2);
ck('counts the returned one on its own', c.r === 1);
process.exit(bad ? 1 : 0);
