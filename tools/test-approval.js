#!/usr/bin/env node
/*
 * Approval routing: who can sign when, and a signature never outlives the
 * figures it approved.
 *
 * Run: node tools/test-approval.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
const ctx = { N: v => Number(v) || 0, computeCEParts: ce => ({ total: ce.t || 0, mob: 0, demob: 0, mpT: 0, toolsT: 0, matsT: 0, ppeT: 0, miscT: 0 }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/approval.js', 'utf8') + ';this.A={apvFigSig,apvRoute,apvStatus,apvCanSign,apvMirror,apvStripSigs};', ctx);
const A = ctx.A;

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const ap = [
  { id: 'a', user: 'prep', step: 1, role: 'Prepared' },
  { id: 'b', user: 'rev1', step: 2 }, { id: 'c', user: 'rev2', step: 2 },
  { id: 'd', user: 'boss', step: 3 }, { id: 'e', name: 'Client' }
];
const pend = lines => ({ state: 'pending', lines });

console.log('routing:');
ck('a line with no user is not routed', A.apvRoute(ap).length === 4);
ck('step 1 opens first', A.apvCanSign(ap, pend({}), 'prep') && !A.apvCanSign(ap, pend({}), 'rev1'));
ck('the same step signs in parallel', A.apvCanSign(ap, pend({ a: {} }), 'rev1') && A.apvCanSign(ap, pend({ a: {} }), 'rev2'));
ck('the next step waits for all of it', !A.apvCanSign(ap, pend({ a: {}, b: {} }), 'boss'));
ck('and opens when it is done', !!A.apvCanSign(ap, pend({ a: {}, b: {}, c: {} }), 'boss'));
ck('a signed line cannot sign again', !A.apvCanSign(ap, pend({ a: {} }), 'prep'));
ck('done once every routed line signed', A.apvStatus(ap, pend({ a: {}, b: {}, c: {}, d: {} })).done);
ck('nobody signs a returned CE', !A.apvCanSign(ap, { state: 'returned', lines: {} }, 'prep'));
ck('the monitoring mirror lists who it waits on', A.apvMirror(ap, pend({ a: {} })).waiting.join() === 'rev1,rev2');
ck('but only while pending', A.apvMirror(ap, { state: 'approved', lines: {} }).waiting.length === 0);

console.log('\nsignatures follow the figures:');
ck('the fingerprint changes with the total', A.apvFigSig({ t: 100 }) !== A.apvFigSig({ t: 101 }));
const kept = A.apvStripSigs(ap, { a: 'x', b: 'y', e: 'z' });
ck('clearing drops routed signatures only', !kept.a && !kept.b && kept.e === 'z');
ck('a save with changed figures resets to step 1', /apvFigSig\(_entry\) !== _apv\.figSig\)[\s\S]{0,300}lines: \{\}/.test(app));
ck('a revision starts unapproved', /revSuffix \? \{ info: \(\(\{approval, \.\.\.r\}\)/.test(app));
ck('clone and revise start unapproved', (app.match(/approval: undefined/g) || []).length >= 2);
ck('signing checks the saved figures first', /apvFigSig\(full\) !== a0\.figSig/.test(app));
ck('a return needs a comment', /A comment is required to return a CE/.test(app));
ck('the signature is stamped with who and when', /apvStamp\(opt\.sig, me\.byName, apvWhen\(me\.at\)/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\napproval OK');
process.exit(bad ? 1 : 0);
