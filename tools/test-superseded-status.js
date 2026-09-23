#!/usr/bin/env node
/* A revision replaced by a newer one is finished with: its status says
   Superseded, it counts as closed, and its approval is cancelled so it waits
   on nobody.
   Run: node tools/test-superseded-status.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
const cfgSrc = fs.readFileSync('src/config.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const ctx = { console, window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(ctx);
vm.runInContext(cfgSrc + '\nthis.C = { DEFAULT_STATUS_OPTIONS, CE_CLOSED_STATUSES, ceIsOpen, MON_TO_DOC };', ctx);
const { DEFAULT_STATUS_OPTIONS, ceIsOpen, MON_TO_DOC } = ctx.C;

ck('Superseded is a status anyone can set', DEFAULT_STATUS_OPTIONS.includes('Superseded'));
ck('and it closes the CE', ceIsOpen('Superseded') === false);
ck('the open ones are still open', ceIsOpen('Draft') && ceIsOpen('For Approval') && ceIsOpen('Ongoing') && ceIsOpen(''));
ck('and the other closed ones still close', !ceIsOpen('Approved') && !ceIsOpen('Awarded') && !ceIsOpen('Cancelled'));
ck('the printed document says where it stands', MON_TO_DOC['Superseded'] === 'REJECTED');
ck('it has a colour of its own on the row', app.includes("'Superseded': '#94A3B8'"));

/* The rule that sets it, run here as the app runs it. */
const m = app.match(/g\.revs\.forEach\(e => \{[\s\S]*?\n      \}\);/);
ck('the rule is where revisions are folded in', !!m);
const run = new Function('monData', 'ceIsOpen', 'updateMon', 'headNum', 'seen', `
  const g = { revs: Object.keys(monData).map(id => ({ id: id })) };
  const _supersededRef = { current: seen };
  ${m ? m[0] : ''}
  return true;`);

const calls = [];
const data = {
  a: { status: 'For Approval', apv: { state: 'pending', waiting: ['jhuniel'], signed: 0, total: 4 } },
  b: { status: 'Draft', apv: { state: 'pending', waiting: ['jhuniel'] } },
  c: { status: 'Approved', apv: { state: 'approved' } },
  d: { status: '', apv: null },
  e: { status: 'Superseded', apv: { state: 'superseded' } },
  f: { status: 'Awarded', apv: null }
};
run(data, ceIsOpen, (id, fields) => calls.push([id, fields]), 'SY3-CE-2026-1129-R6', new Set());
/* One write per revision, carrying whatever changed -- two writes raced each
   other on SharePoint and one field was lost. */
const of = id => { const c = calls.filter(x => x[0] === id); return c.length === 1 ? c[0][1] : null; };
ck('a revision waiting for signatures has its approval cancelled',
  of('a') && of('a').apv.state === 'superseded' && of('a').apv.waiting.length === 0 && of('a').apv.supersededBy === 'SY3-CE-2026-1129-R6');
ck('and its status set to Superseded, in the same write', of('a') && of('a').status === 'Superseded');
ck('a draft revision is closed the same way', of('b') && of('b').status === 'Superseded');
ck('one already approved keeps that on the record, untouched', !calls.some(c => c[0] === 'c'));
ck('and one already awarded keeps that too', !calls.some(c => c[0] === 'f'));
ck('a revision with no status at all is closed', of('d') && of('d').status === 'Superseded');
ck('nothing is written twice', !calls.some(c => c[0] === 'e'));

/* And it does not keep rewriting what it has already written. */
const calls2 = [];
const seen = new Set(['a']);
run(data, ceIsOpen, (id, fields) => calls2.push([id, fields]), 'X', seen);
ck('a revision handled once is left alone after that', !calls2.some(c => c[0] === 'a'));

/* A cancelled approval cannot wait on anyone -- the reported fault. */
const apvCtx = { console };
vm.createContext(apvCtx);
vm.runInContext(fs.readFileSync('src/approval.js', 'utf8') + '\nthis.w = apvMonWaitsOn;', apvCtx);
ck('so it leaves For my approval and the signature count',
  apvCtx.w({ apv: { state: 'superseded', waiting: ['jhuniel'] } }, 'jhuniel') === false);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nsuperseded status OK'); process.exit(bad ? 1 : 0);
