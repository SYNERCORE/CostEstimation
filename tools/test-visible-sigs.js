#!/usr/bin/env node
/* A CE shows a routed signatory's signature only while that line is signed in
   the approval it carries now -- a leftover from the revision before must not
   draw on a CE that is still waiting for that signature.
   Run: node tools/test-visible-sigs.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/approval.js', 'utf8') + '\nthis.apvVisibleSigs = apvVisibleSigs;', ctx);
const { apvVisibleSigs } = ctx;

const approvers = [
  { id: 'a1', user: 'ann', name: 'Ann', role: 'Prepared by', step: 1 },
  { id: 'a2', user: 'bob', name: 'Bob', role: 'Approved by', step: 2 },
  { id: 'a3', name: 'Carl', role: 'Noted by' }            /* signs by hand */
];
const sigs = { a1: 'data:ann', a2: 'data:bob', a3: 'data:carl' };
const keys = o => Object.keys(o).sort().join(',');

ck('a fresh routing shows no routed signature, whatever is left over',
  keys(apvVisibleSigs(approvers, { state: 'pending', lines: {} }, sigs)) === 'a3');
ck('a signed line shows its signature, the one still waiting does not',
  keys(apvVisibleSigs(approvers, { state: 'pending', lines: { a1: { by: 'ann' } } }, sigs)) === 'a1,a3');
ck('a fully approved CE shows them all',
  keys(apvVisibleSigs(approvers, { state: 'approved', lines: { a1: {}, a2: {} } }, sigs)) === 'a1,a2,a3');
ck('a CE with no routing is left exactly as it is',
  keys(apvVisibleSigs(approvers, null, sigs)) === 'a1,a2,a3' &&
  keys(apvVisibleSigs(approvers, { state: 'returned', lines: {} }, sigs)) === 'a1,a2,a3');
ck('and it never hands back the caller’s own object',
  apvVisibleSigs(approvers, null, sigs) !== sigs);

ck('the printed CE draws only those', app.includes('const sigShow = apvVisibleSigs(approvers, info.approval, signatures);') &&
  app.includes('const sigImg = sigShow[a.id || i]') && !app.includes('const sigImg = signatures[a.id || i]'));
ck('and so do the signatory cards', app.includes('const visSigs = useMemo(() => apvVisibleSigs(approvers, info.approval, signatures)') &&
  app.includes("}, visSigs[a.id||i]?'✅ Re-sign':'✍ Sign'),") && !app.includes('signatures[a.id||i] &&'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nvisible signatures OK'); process.exit(bad ? 1 : 0);
