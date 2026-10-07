/* The estimators' review of a request, and the requestor's update of one that came back.
   Run: node tools/test-request-review.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = require('./lib/appsrc').plus(R('src/App.js')), mod = R('src/components/RceReviewModal.js');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const NL = String.fromCharCode(10);

console.log('the form:');
ck('a requestor still sees and may prefill items 1-14', app.indexOf('...(isRequestor ? [] : [') < 0 && app.indexOf('sect("COMPLETE?"') > 0 && app.indexOf('sect("14. RECOMMENDATION")') > 0);
ck('none of it is required to log a request', app.slice(app.indexOf('const submitRequest = async'), app.indexOf('setReqBusy(true);', app.indexOf('const submitRequest = async'))).indexOf('rceUnanswered') < 0);

console.log(NL + 'the modal is registered:');
ck('in index.html', R('index.html').indexOf('RceReviewModal.js') > 0);
ck('in the service worker precache', R('sw.js').indexOf('RceReviewModal.js') > 0);
ck('it offers the three decisions of item 14', mod.indexOf('RCE_RECOMMENDATIONS.map') > 0);
ck('a decline needs its reason', mod.indexOf("rec === 'decline' && !String(reason).trim()") > 0);
ck('a return says what to supply', mod.indexOf("rec === 'secure' && !noCount && !String(note).trim()") > 0);
ck('the requestor sees the estimators\' note', mod.indexOf('Cost Estimation says: ') > 0);

console.log(NL + 'saving:');
const a = app.indexOf('const saveReview = async p => {'), b = app.indexOf('  const submitRequest = async', a);
const src = app.slice(a, b);
const run = async (mode, p, o) => {
  o = o || {};
  const c = { toasts: [], patched: null, accepted: null, audit: [], hist: null };
  const e = { id: 7, ceNum: 'RCE-45', info: { request: true, requestNum: 'RCE-45', rce: { inquiryNo: 'Q1', items: {} } } };
  const fn = new Function('rceReview', 'isRequestor', 'showToast', 'reqOwns', 'monData', 'currentUser', 'updateMon', 'setReqBusy', 'acceptRequest', 'dbPatchCEInfo',
    'setHistory', 'LS', 'logSwallowed', 'auditLog', 'setRceReview', 'mkReq', src + NL + 'return saveReview;')(
    { e, mode }, !!o.requestor, (m, er) => c.toasts.push({ m, er: !!er }), () => o.owns !== false, {}, { name: 'Est One', username: 'est1' }, (id, f, v) => { if (f && typeof f === 'object') c.req = f.req; else c.mon = [id, f, v]; }, () => {},
    async (ee, extra) => { c.accepted = extra; return o.acceptOk !== false; },
    async (id, info) => { c.patched = info; return o.patchOk !== false; },
    f => { c.hist = f([{ id: 7, info: {} }, { id: 8, info: {} }]); }, { get: () => [], set: () => {} }, () => {}, (x, d) => c.audit.push(d), v => { c.closed = v === null; }, (state, to, note) => ({ state, to, note }));
  await fn(p);
  return c;
};
(async () => {
  const items = { 1: { v: 'yes' }, 2: { v: 'no', r: 'missing' } };
  let c = await run('review', { items, otherRemarks: '', recommendation: 'proceed', declineReason: '', note: '' });
  ck('Proceed accepts it, carrying the reviewed checklist', c.accepted && c.accepted.reviewStatus === 'accepted' && c.accepted.rce.items[2].v === 'no' && c.accepted.rce.inquiryNo === 'Q1');
  ck('and closes the review', c.closed === true);
  c = await run('review', { items, recommendation: 'proceed' }, { acceptOk: false });
  ck('a cancelled acceptance leaves the review open', c.closed !== true);
  c = await run('review', { items, recommendation: 'secure', note: 'send the TOR' });
  ck('Secure returns it, with the note for the requestor', c.patched && c.patched.reviewStatus === 'returned' && c.patched.reviewNote === 'send the TOR' && c.patched.reviewedBy === 'Est One');
  ck('it is still a request and has no CE number', c.patched.request === true && !c.patched.acceptedCeNum);
  ck('only that row changes in the list', c.hist[0].info.reviewStatus === 'returned' && c.hist[1].info.reviewStatus === undefined);
  c = await run('review', { items, recommendation: 'decline', declineReason: 'out of scope' });
  ck('a declined request is set to No Quote', c.mon && c.mon[0] === 7 && c.mon[1] === 'status' && c.mon[2] === 'No Quote');
  ck('Decline records the reason', c.patched.reviewStatus === 'declined' && c.patched.reviewNote === 'out of scope');
  c = await run('review', { items, recommendation: 'secure', note: 'n' });
  ck('a return does not touch the Monitoring status', !c.mon);
  c = await run('update', { items, recommendation: '', note: 'TOR attached' });
  ck('the requestor\'s update marks it resubmitted and clears the estimators\' note', c.patched.reviewStatus === 'resubmitted' && c.patched.reviewNote === '' && c.patched.resubmitNote === 'TOR attached');
  c = await run('review', { items, recommendation: 'decline', declineReason: 'x' }, { requestor: true });
  ck('a requestor cannot review', !c.patched && c.toasts[0].er);
  c = await run('update', { items }, { owns: false, requestor: true });
  ck('a requestor cannot update someone else\'s request', !c.patched && c.toasts[0].er);
  c = await run('review', { items, recommendation: 'secure', note: 'n' }, { patchOk: false });
  ck('a refusal from SharePoint is reported, the list is not changed', c.toasts.some(t => t.er) && c.hist === null);

  c = await run('review', { items, recommendation: 'secure', note: 'n', assignee: 'Bob' });
  ck('the reviewer assigns the estimator in the Estimator column', c.mon && c.mon[0] === 7 && c.mon[1] === 'ceeName' && c.mon[2] === 'Bob');
  ck('Proceed asks for an estimator when none is assigned', mod.indexOf("rec === 'proceed' && !String(est).trim()") > 0);
  ck('a request may be logged unassigned', app.indexOf("|| 'Unassigned'") > 0);

  console.log(NL + 'the screens:');
  ck('estimators get a Review button instead of a bare Accept', app.indexOf("onClick: () => openReview(e, 'review')") > 0);
  ck('the owner of a request gets Update, never on a declined or accepted one', app.indexOf("e.info.reviewStatus !== 'declined' && reqOwns(e.id)") > 0);
  ck('the requestor\'s My Work table shows the outcome and the note', app.indexOf("String(x.e.info.reviewStatus).toUpperCase() + (x.e.info.reviewNote") > 0);
  process.exit(bad ? 1 : 0);
})();

