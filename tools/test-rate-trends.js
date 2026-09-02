#!/usr/bin/env node
/*
 * Which rates has the masterlist stopped keeping up with?
 *
 * The clock answers "what did we charge for this" one row at a time. That is
 * not the question a person maintaining the list has. A masterlist goes stale
 * quietly: nobody notices a rate that has not moved in two years, because
 * nothing compares it to what the CEs are actually charging -- and by the time
 * somebody does, every quote built on it has already gone out.
 *
 * Run: node tools/test-rate-trends.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- run the real drift calculation -------------------------------------- */
const body = (app.match(/  const drift = React\.useMemo\(\(\) => \{[\s\S]*?!!mlTrend\]\);/) || [''])[0];
if (!body) { console.error('drift memo not found in src/App.js'); process.exit(1); }

const ce = (num, when, rows) => Object.assign({ savedAt: when, info: { ceNum: num } }, rows);
const HIST = [
  ce('CE-01', '2026-01-05T00:00:00Z', { mats: [{ desc: 'FLAP DISC 4"', cost: 40 }] }),
  ce('CE-02', '2026-06-05T00:00:00Z', { mats: [{ desc: 'flap disc  4 "', cost: 60 }] }),
  ce('CE-03', '2026-07-05T00:00:00Z', { mats: [{ desc: 'RAGS ASSORTED', cost: 90 }] }),
  ce('CE-04', '2026-07-05T00:00:00Z', { mats: [{ desc: 'STEADY ITEM', cost: 100 }] }),
  /* Scraped by the file analyser: no savedAt, no CE number. */
  { info: {}, mats: [{ desc: 'SCRAPED ONLY', cost: 5000 }] }
];

const ML = {
  materials: [
    { desc: 'FLAP DISC 4"', cost: 40 },       /* charged 60 now: +50% */
    { desc: 'RAGS ASSORTED', cost: 120 },     /* charged 90 now: -25% */
    { desc: 'STEADY ITEM', cost: 100 },       /* in step */
    { desc: 'SCRAPED ONLY', cost: 10 },       /* only an imported figure exists */
    { desc: 'NEVER COSTED', cost: 77 },       /* no history at all */
    { desc: 'UNPRICED', cost: 0 },            /* a gap, not a drift */
    { desc: '', cost: 50 }                    /* nameless */
  ]
};

function drift(kind, tab, key, nk, masterlist, hist) {
  const ctx = {
    window: { shicHistory: hist }, masterlist, kind, tab, key, nk,
    mlTrend: { tab, pick: null },
    N: v => parseFloat(v) || 0,
    React: { useMemo: f => f() },
    Number, String, Date, isFinite, Object, Math
  };
  vm.createContext(ctx);
  vm.runInContext(body + ';globalThis._r=drift;', ctx);
  return ctx._r;
}

const rows = drift('mats', 'materials', 'cost', 'desc', ML, HIST);
const find = n => rows.find(r => r.name === n);

console.log('it compares the list against what was last charged:');
ck('a rate that went up is caught', find('FLAP DISC 4"').pct === 0.5, JSON.stringify(find('FLAP DISC 4"')));
ck('a rate that went down is caught too', find('RAGS ASSORTED').pct === -0.25,
  'over-recovering is a different problem, but it is still a problem');
ck('and the name is matched the way a person reads it', find('FLAP DISC 4"').latest === 60,
  'FLAP DISC 4" and flap disc  4 " are the same item');
ck('an item in step is still listed', !!find('STEADY ITEM'),
  'seeing that a rate IS current is worth something');
ck('with a zero difference', find('STEADY ITEM').pct === 0);

console.log('\nfurthest out first, because that is the one worth acting on:');
ck('the biggest gap leads', rows[0].name === 'FLAP DISC 4"', JSON.stringify(rows.map(r => r.name)));
ck('sorted by size of the gap, not its direction',
  Math.abs(rows[0].pct) >= Math.abs(rows[1].pct));

console.log('\nand it leaves out what it cannot speak to:');
ck('an unpriced item is not called drifted', !find('UNPRICED'),
  'that is a gap, and Fill missing prices is the tool for it -- mixing them buries the real movements');
ck('an item with no history at all is omitted', !find('NEVER COSTED'));
ck('a nameless row is omitted', !rows.some(r => !r.name));

console.log('\na scraped spreadsheet never reports your list as wrong:');
ck('an item known only from an imported file is omitted', !find('SCRAPED ONLY'),
  'being told the masterlist is out by 49,900% on the strength of a number nobody approved is worse than being told nothing');
ck('the issued check is in the code', /if \(!\(ce\.savedAt && \(info\.ceNum \|\| ce\.ceNum\)\)\) return;/.test(app));

console.log('\nit reads the history once, not once per row:');
ck('an index is built first', /const idx = \{\};/.test(app) && /idx\[nm\] = idx\[nm\] \|\| \[\]/.test(app),
  'asking shicRateUses per item rescans all 896 CEs two thousand times over');
ck('and the masterlist is then looked up against it', /const u = idx\[norm\(nm\)\];/.test(app));

console.log('\nhooks are not hidden behind the closed state:');
ck('the guard sits below the memos', app.indexOf('const drift = React.useMemo') < app.indexOf('if (!mlTrend) return null;'),
  'an early return that skips a hook changes the hook order between renders');
ck('and it renders as a real element, given what it needs',
  /React\.createElement\(MlTrendModal, \{ mlTrend, setMlTrend, masterlist, ML_HIST_KIND \}\)/.test(app));
/* Declared inside App it would take a fresh identity every App render and be
   remounted each time, recomputing both memos. Rendering it as a bare call
   instead would only move the problem: the call is conditional on the
   masterlist tab, so its hooks would come and go from App's hook sequence.
   check-remounting-editors.js enforces the same rule from the other side. */
ck('it is declared at module scope, not inside App',
  /^function MlTrendModal\(\{/m.test(app) &&
  app.indexOf('function MlTrendModal({') < app.indexOf('function App({'),
  'a component with hooks declared inside another component is remounted on every parent render');

console.log('\nthe view says what it is showing:');
ck('there is a button', /"Rate Trends"/.test(app));
ck('it explains the sort', /furthest first/.test(app));
ck('it says which direction costs money', /BELOW what was last charged/.test(app),
  'a red number with no explanation is just a red number');
ck('the detail is by quarter', /' Q' \+ \(Math\.floor\(d\.getMonth\(\) \/ 3\) \+ 1\)/.test(app));
ck('and names the CEs behind each bar', /r\.ceNum \|\| '\?'\) \+ ': ' \+ money\(r\.rate\)/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nrate trends OK');
process.exit(bad ? 1 : 0);
