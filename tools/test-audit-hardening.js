#!/usr/bin/env node
/* Four faults found by auditing the app rather than by anyone hitting them:

   - a figure that is not a finite number (a pasted 1e999, an imported cell)
     turned a CE's total into NaN, which reaches SharePoint as null;
   - the save guard only looked at price, so a negative QUANTITY quietly
     subtracted from the CE;
   - one person on two signatory lines left "Awaiting my signature" after
     signing the first, while the CE still waited on them;
   - the automatic draft clear-out could delete somebody else's unsaved work.

   Run: node tools/test-audit-hardening.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- every figure is a finite number ---- */
const ctx = { console, window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/config.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('src/helpers.js', 'utf8') + '\nthis.H = { N, computeCEParts, computeCEGrand };', ctx);
const { N, computeCEParts, computeCEGrand } = ctx.H;

ck('the ordinary readings are unchanged',
  N('  42 ') === 42 && N('-5') === -5 && N('') === 0 && N(null) === 0 && N('abc') === 0 && N(7) === 7 && N('3.5') === 3.5);
ck('a figure pasted with its separators is the figure, not the digits before the comma',
  N('1,234.50') === 1234.5 && N('P1,000') === 1000 && N('₱2,500.75') === 2500.75 && N('-1,200') === -1200);
ck('and a figure too big to be a figure reads as zero',
  N('1e999') === 0 && N(Infinity) === 0 && N(-Infinity) === 0 && N(NaN) === 0);

const wild = {
  ceType: 'onsite', margin: 10, info: { qty: 1 },
  mp: [{ role: 'Mechanic', rate: '1e999', days: 2, pax: 1 }, { role: 'Welder', rate: 900, days: Infinity, pax: 1 }],
  tools: [{ desc: 'Grinder', qty: NaN, cost: 500, days: 1 }], mats: [], ppe: []
};
const parts = computeCEParts(wild);
ck('so no part of a CE can come out as NaN', Object.values(parts).every(Number.isFinite));
ck('nor its grand total', Number.isFinite(computeCEGrand(wild)));
ck('an empty or missing CE is still zero', computeCEGrand(null) === 0 && computeCEGrand({}) === 0);

/* ---- the save guard ---- */
const start = app.indexOf('    const _figs = r =>');
const stop = app.indexOf('    if (badCost) {', start);
ck('the guard is where the CE is saved', start > 0 && stop > start);
const guard = new Function('mp', 'tools', 'mats', 'ppe',
  app.slice(start, stop) + '\n    return badCost || null;');
const row = extra => ({ role: 'Mechanic', rate: 900, days: 1, pax: 1, ...extra });
ck('an ordinary row passes', !guard([row()], [], [], []));
ck('a blank figure is not an error, it is a row being typed', !guard([row({ days: '' }), row({ pax: null })], [], [], []));
ck('a negative price is still caught', !!guard([row({ rate: -1 })], [], [], []));
ck('and now so is a negative quantity', !!guard([], [{ desc: 'Rod', qty: -2, cost: 100 }], [], []));
ck('a negative number of days or people too',
  !!guard([row({ days: -1 })], [], [], []) && !!guard([row({ pax: -3 })], [], [], []));
ck('as is a figure that is not a number at all',
  !!guard([row({ rate: '1e999' })], [], [], []) && !!guard([row({ days: NaN })], [], [], []));
ck('and the message names the row', app.includes("((badCost.role || badCost.desc || 'the row with no description').slice(0, 40))"));

/* ---- one person, two signatory lines ---- */
const apvCtx = { console, N: v => Number(v) || 0, computeCEParts: () => ({ total: 1, mob: 0, demob: 0, mpT: 1, toolsT: 0, matsT: 0, ppeT: 0, miscT: 0 }) };
vm.createContext(apvCtx);
vm.runInContext(fs.readFileSync('src/approval.js', 'utf8') + '\nthis.A = { apvMirror, apvMonWaitsOn, apvStatus };', apvCtx);
const A = apvCtx.A;
const twice = [{ id: 'a', user: 'boss', role: 'Reviewed', step: 1 }, { id: 'b', user: 'boss', role: 'Approved', step: 2 }];
const mir = apv => ({ apv: A.apvMirror(twice, apv) });
ck('having signed one of two lines, the CE is still on their list',
  A.apvMonWaitsOn(mir({ state: 'pending', lines: { a: { by: 'boss' } } }), 'boss') === true);
ck('and leaves it once both are signed',
  A.apvMonWaitsOn(mir({ state: 'pending', lines: { a: { by: 'boss' }, b: { by: 'boss' } } }), 'boss') === false);
ck('a line skipped counts as nothing left to sign',
  A.apvMonWaitsOn(mir({ state: 'pending', lines: { a: { by: 'boss' } }, skipped: { b: {} } }), 'boss') === false);

const one = [{ id: 'a', user: 'u1', step: 1 }, { id: 'b', user: 'u2', step: 2 }];
const m1 = { apv: A.apvMirror(one, { state: 'pending', lines: { a: { by: 'u1' } } }) };
ck('the ordinary route is unchanged: whoever signed is done',
  A.apvMonWaitsOn(m1, 'u1') === false && A.apvMonWaitsOn(m1, 'u2') === true);
ck('and a stale summary still cannot keep asking someone who has signed',
  A.apvMonWaitsOn({ apv: { state: 'pending', waiting: ['u1', 'u2'], signedBy: ['u1'] } }, 'u1') === false);

/* ---- the automatic draft clear-out ---- */
const s2 = app.indexOf('  const _draftPrunedRef = React.useRef(new Set());');
const e2 = app.indexOf('    if (!done.length) return;', s2);
const prune = new Function('sharedDrafts', 'history', 'React',
  app.slice(s2, e2).replace('const _draftPrunedRef = React.useRef(new Set());', 'const _draftPrunedRef = { current: new Set() };')
    .replace('useEffect(() => {', 'const _eff = () => {')
    .replace('if (!sharedDrafts.length || !history.length) return;', 'if (!sharedDrafts.length || !history.length) return [];') +
  '\n    return done; };\n  return _eff();');
const hist = [{ ceNum: 'CE-1', savedAt: '2026-09-23T05:00:00Z', savedBy: 'aljon' }];
const drafts = [
  { draftId: 'own', savedBy: 'aljon', savedAt: '2026-09-23T04:00:00Z', info: { ceNum: 'CE-1' } },
  { draftId: 'other', savedBy: 'kenneth', savedAt: '2026-09-23T04:00:00Z', info: { ceNum: 'CE-1' } }
];
const gone = prune(drafts, hist).map(d => d.draftId);
ck('the draft of the person who then saved the CE is cleared', gone.includes('own'));
ck("but somebody else's draft of it is never deleted on a guess", !gone.includes('other'));
ck('it says why, where anyone changing it will read it',
  app.includes('Only the draft of the person who then saved that CE'));
ck('and that draft is still offered under "CE saved", where a person decides',
  app.includes("() => tidyDrafts('saved'), g.savedCE.length)"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\naudit hardening OK');
process.exit(bad ? 1 : 0);
