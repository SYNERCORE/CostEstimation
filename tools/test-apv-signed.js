#!/usr/bin/env node
/* A CE this person has already signed must leave their "For my approval".
   Run: node tools/test-apv-signed.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const apvSrc = fs.readFileSync('src/approval.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(apvSrc + '\nthis.apvMirror = apvMirror; this.apvMonWaitsOn = apvMonWaitsOn;', ctx);
const { apvMirror, apvMonWaitsOn } = ctx;

const approvers = [
  { id: 'a1', user: 'ann', name: 'Ann', role: 'Checked by', step: 1 },
  { id: 'a2', user: 'bob', name: 'Bob', role: 'Approved by', step: 2 }
];
const apv = { state: 'pending', lines: { a1: { by: 'ann', at: '2026-09-23T00:00:00Z' } } };
const m = apvMirror(approvers, apv);

ck('the mirror records who signed', Array.isArray(m.signedBy) && m.signedBy.includes('ann'));
ck('and who it is still waiting on', (m.waiting || []).includes('bob'));
ck('a signatory is no longer waited on', apvMonWaitsOn({ apv: m }, 'ann') === false);
ck('the next one still is', apvMonWaitsOn({ apv: m }, 'bob') === true);
/* the reported fault: a summary left behind still naming the signatory */
ck('a stale summary naming a signatory is ignored',
  apvMonWaitsOn({ apv: { state: 'pending', waiting: ['ann', 'bob'], signedBy: ['ann'] } }, 'ann') === false);
ck('nothing is waited on when the approval is done or absent',
  apvMonWaitsOn({ apv: { state: 'approved', waiting: ['bob'] } }, 'bob') === false &&
  apvMonWaitsOn({}, 'bob') === false && apvMonWaitsOn(null, 'bob') === false);
ck('and no one is waited on without a username', apvMonWaitsOn({ apv: m }, '') === false);

/* every place that asks "is it my turn" asks it the same way */
ck('My Work uses the shared helper', app.includes('const sign = rows.filter(x => apvMonWaitsOn(x.m, me));'));
ck('the Monitoring filter too', app.includes('if (monApvMine && !apvMonWaitsOn(m, currentUser.username)) return false;'));
ck('the awaiting-my-signature count too', app.includes('.filter(m => apvMonWaitsOn(m, currentUser.username)).length'));
ck('the row badge too', app.includes('const turn = apvMonWaitsOn(m, currentUser.username);'));
ck('and the CE stays visible to a named signatory', app.includes('if (apvMonWaitsOn(m, currentUser?.username)) return true;'));
ck('no raw waiting-list test is left behind', !/\.waiting \|\| \[\]\)\.includes\(currentUser/.test(app));
ck('a summary that disagrees with the CE is put right once', app.includes('_apvSyncRef') &&
  app.includes('apvMirror(full.approvers, (full.info || {}).approval)') && app.includes("updateMon(x.e.id, 'apv'"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nSigned CEs leave For my approval OK'); process.exit(bad ? 1 : 0);
