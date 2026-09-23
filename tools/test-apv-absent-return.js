#!/usr/bin/env node
/* Three things the approval audit found, in the order they hurt:
   5 — a save that clears signatures asks first, instead of reporting it 1.5
       seconds after the fact;
   6 — a signatory who is away can be handed over or taken out of the routing,
       so the CE is not stuck behind them;
   9 — a Return keeps the signatures already collected, instead of making
       everyone sign again for a change none of them asked about.
   Run: node tools/test-apv-absent-return.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const ctx = { console, computeCEParts: () => ({ total: 100, mob: 0, demob: 0, mpT: 100, toolsT: 0, matsT: 0, ppeT: 0, miscT: 0 }), N: v => Number(v) || 0 };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/approval.js', 'utf8') +
  '\nthis.A = { apvStatus, apvCanSign, apvKeepOnReturn, apvResume, apvMirror, apvContentSig, apvFigSig };', ctx);
const A = ctx.A;
const approvers = [
  { id: 'a', user: 'aljon', name: 'Aljon', role: 'Prepared', step: 1 },
  { id: 'b', user: 'boss', name: 'Boss', role: 'Reviewed', step: 2 },
  { id: 'c', user: 'gm', name: 'GM', role: 'Approved', step: 3 }
];

/* ---- 5. asked before, not reported after ---- */
ck('the save works out whether it would clear signatures before it saves',
  app.includes('const _wipes = !!(_apv && (_apv.state === ') && app.indexOf('const _wipes') < app.indexOf('if (_wipes) {'));
ck('it names who signed', app.includes("Object.values(_apv.lines || {}).map(l => (l && l.byName) || (l && l.by) || '')"));
ck('counts the ones signed by hand too', app.includes('const _hand = Object.keys(_entry.signatures || {}).length - _who.length;'));
ck('says what happens to the routing', app.includes("'Routing starts again from the first step, and all '"));
ck('offers the way to keep them', app.includes('Revise to save your changes as a new revision instead.'));
ck('and Cancel really does not save',
  app.includes('if (!confirm(_msg)) { showToast(') && app.includes("are untouched.'); return; }"));
ck('submitting asks the same question rather than clearing quietly',
  app.includes("'Go on and clear them?'))"));
ck('and when it does clear them, the signed lines go with the images',
  app.includes('apv = {...apv, lines: {}};') && app.includes('e.info = {...e.info, approval: apv};'));

/* ---- 6. a signatory who is away ---- */
let apv = { state: 'pending', lines: {}, skipped: {} };
let s = A.apvStatus(approvers, apv);
ck('with nobody skipped it routes as it always did', s.step === 1 && s.waiting[0].user === 'aljon' && s.total === 3);
apv = { state: 'pending', lines: {}, skipped: { a: { by: 'admin' } } };
s = A.apvStatus(approvers, apv);
ck('a skipped line stops holding the CE up', s.waiting.length === 1 && s.waiting[0].user === 'boss');
ck('it is not counted as signed', s.signedN === 0 && s.skippedN === 1 && s.total === 3);
ck('and the person skipped can no longer sign', !A.apvCanSign(approvers, apv, 'aljon'));
apv = { state: 'pending', lines: { b: { by: 'boss' } }, skipped: { a: {}, c: {} } };
ck('a CE whose last waiting line is skipped is finished', A.apvStatus(approvers, apv).done === true);
ck('and the summary Monitoring reads says so', A.apvMirror(approvers, { ...apv, state: 'approved' }).waiting.length === 0);

ck('only an admin is offered it, and only while someone is waiting',
  app.includes("apvState === 'pending' && isAdmin && s.waiting.length > 0 && b('"));
ck('a line already signed cannot be moved',
  app.includes('if ((a0.lines || {})[lineId]) { showToast((ln.name || ln.user)'));
ck('handing over changes who it waits on, and nothing else',
  app.includes('ln.user = u.username; ln.name = u.name || u.username;') && app.includes('delete apvN.skipped[lineId];'));
ck('skipping needs a reason, which goes on the record',
  app.includes('A reason is required to skip a signatory.') &&
  app.includes("apvN.log.push({...me, action: 'skipped', role: ln.role,"));
ck('both are written to the CE trail and the audit log',
  app.includes("action: 'reassigned'") && app.includes("auditLog('apv_' + action,"));
ck('and a CE that becomes complete this way closes properly',
  app.includes("if (apvStatus(appr, apvN).done) apvN.state = 'approved';") &&
  app.includes("...(apvN.state === 'approved' ? {status: 'Approved'} : {})"));
ck('a half-loaded CE is refused here too', app.includes("if (full._partial) { showToast('This CE did not arrive complete - refresh"));

/* ---- 9. a Return keeps what was signed ---- */
const sigs = { a: 'img-a', b: 'img-b' };
const signed = { a: { by: 'aljon' }, b: { by: 'boss' } };
const kept = A.apvKeepOnReturn(approvers, { lines: signed }, sigs);
ck('a Return keeps the signatures already given', Object.keys(kept).sort().join('') === 'ab');
ck('a signed line with no image left is not kept',
  Object.keys(A.apvKeepOnReturn(approvers, { lines: signed }, { a: 'img-a' })).join('') === 'a');
ck('and a line that is no longer routed is dropped',
  Object.keys(A.apvKeepOnReturn([approvers[0]], { lines: signed }, sigs)).join('') === 'a');

const ce = { info: { qty: 1 }, mp: [{ role: 'Mechanic', rate: 900, days: 2, pax: 1 }], tools: [], mats: [], ppe: [], margin: 10, scope: 'x', notes: [] };
const returned = { state: 'returned', lines: kept, figSig: A.apvFigSig(ce), contentSig: A.apvContentSig(ce) };
ck('submitting again with the CE exactly as signed keeps them',
  Object.keys(A.apvResume(ce, returned)).sort().join('') === 'ab');
ck('a changed CE starts over', Object.keys(A.apvResume({ ...ce, scope: 'changed' }, returned)).length === 0);
ck('so does one whose figures moved',
  Object.keys(A.apvResume(ce, { ...returned, figSig: 'something else' })).length === 0);
ck('and a withdrawn or fresh approval carries nothing over',
  Object.keys(A.apvResume(ce, { ...returned, state: 'withdrawn' })).length === 0 && Object.keys(A.apvResume(ce, null)).length === 0);

ck('the app returns without stripping the signatures',
  app.includes('apv.lines = apvKeepOnReturn(full.approvers, apv, sigs);') &&
  !app.includes('sigs = apvStripSigs(full.approvers, sigs);'));
ck('and submitting again asks the CE, not the person, whether they still count',
  app.includes('const _kept = apvResume(_e0, info.approval);') &&
  app.includes('const ok = await apvPersist(apv, _keptN ? {...signatures} : apvStripSigs(approvers, signatures));'));
ck('the person is told how many stood', app.includes("' signature(s) from before the return still stand.'"));
ck('and a skipped line survives being submitted again',
  app.includes('skipped: (info.approval && info.approval.skipped) || {},'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nabsent signatories and returns OK');
process.exit(bad ? 1 : 0);
