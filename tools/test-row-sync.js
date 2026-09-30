/* Re-pricing one row, and only that row.
   =====================================
   Sync Rates re-prices the whole CE. On a tab carrying hundreds of rows that
   is the wrong tool for the common case: two items were corrected on the
   Masterlist and everything else was quoted at a price it should keep. So
   every row now has a ↻ of its own.

   The thing to hold still is the "only that row" part. A sync that also
   touched its neighbours would be the whole-tab sync wearing a smaller
   button, and the rows it changed would be the ones nobody was looking at.

   The second is that it must not re-group. The grouping decides which heading
   a tool prints under on the Electrical sheet, and a row can belong somewhere
   else on this job than it usually does. Re-pricing is what was asked for.

   Run: node tools/test-row-sync.js */
'use strict';
const fs = require('fs');
const path = require('path');
const tab = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ResTab.js'), 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const NL = String.fromCharCode(10);
const grab = (re, what) => { const m = tab.match(re); if (!m) { console.error('not found in ResTab.js: ' + what); process.exit(1); } return m[0]; };

const N = v => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? 0 : parseFloat(v);

/* The shipped _mlFind, _money and syncRow, run against a fake tab. */
const cut = (from, to, what) => {
  const a = tab.indexOf(from), b = tab.indexOf(to, a);
  if (a < 0 || b < 0) { console.error('not found in ResTab.js: ' + what); process.exit(1); }
  return tab.slice(a, b);
};
const indexSrc = cut('const _mlIndex = React.useMemo', "const _dlId = 'dl_' + mlType;", 'the Masterlist index');
const src = cut('const _mlFind = r =>', 'const rowPwr', 'syncRow');
const srcFields = grab(/const _srcFields = it => \{[\s\S]*?\n  \};/, '_srcFields');

const build = (rows, ml) => {
  const state = { rows: rows.map(r => ({ ...r })), toasts: [], confirms: [] };
  let answer = true;
  /* useMemo outside React is just "call it": what matters here is the lookup
     the component ends up using, not when it is rebuilt. */
  const React = { useMemo: f => f() };
  const fn = new Function('React', 'masterlist', 'mlType', 'showToast', 'set', 'N', 'window', 'state',
    srcFields + NL + indexSrc + NL + src + NL + 'return syncRow;');
  const api = {
    call: (r, ans) => {
      answer = ans === undefined ? true : ans;
      fn(
        React, { tools: ml }, 'tools',
        (m, err) => state.toasts.push({ m: m, err: !!err }),
        upd => { state.rows = upd(state.rows); },
        N,
        { confirm: m => { state.confirms.push(m); return answer; } },
        state
      )(r);
    },
    state: state
  };
  return api;
};

/* A tool whose rate has moved on the Masterlist, one that has not, one that
   is not on the Masterlist at all -- and a neighbour that must be left alone. */
const ML = [
  { desc: 'Cable Pulling Machine', cost: 2750, unitPrice: 180000, serviceLife: 8, group: 'equipment' },
  { desc: 'Multimeter / Clamp Meter', cost: 500 },
  { desc: 'Site Office Container', cost: 900, group: 'facility' }
];
const ROWS = () => [
  { id: 'r1', desc: 'Cable Pulling Machine', qty: 1, cost: 2500, tier: 1 },
  { id: 'r2', desc: 'Multimeter / Clamp Meter', qty: 2, cost: 500 },
  { id: 'r3', desc: 'Scaffold Tower', qty: 1, cost: 4000 },
  { id: 'r4', desc: 'Site Office Container', qty: 1, cost: 750, group: 'common' }
];

console.log('the row that was asked for:');
let a = build(ROWS(), ML);
a.call(a.state.rows[0]);
ck('takes the Masterlist rate', a.state.rows[0].cost === 2750, a.state.rows[0].cost);
/* A Tier 1 row prices from these, not from the rate, so a sync that left them
   behind would show a new rate and charge the old figure. */
ck('and the figures a tier price is derived from',
  a.state.rows[0].unitPrice === 180000 && a.state.rows[0].serviceLife === 8,
  JSON.stringify({ u: a.state.rows[0].unitPrice, s: a.state.rows[0].serviceLife }));
ck('it says what it did, with both figures',
  /2,500\.00 -> P2,750\.00/.test((a.state.toasts[0] || {}).m || ''), (a.state.toasts[0] || {}).m);

console.log(NL + 'and nothing else on the tab:');
ck('the row above keeps its price', a.state.rows[1].cost === 500);
ck('the row with no Masterlist entry keeps its price', a.state.rows[2].cost === 4000);
ck('and so does the one below it', a.state.rows[3].cost === 750, a.state.rows[3].cost);
ck('the tab still has the same rows', a.state.rows.length === 4);

console.log(NL + 'before it changes a price it asks:');
ck('exactly once', a.state.confirms.length === 1, a.state.confirms.length);
ck('naming the row', /Cable Pulling Machine/.test(a.state.confirms[0]));
ck('and showing what it would become', /2,500\.00/.test(a.state.confirms[0]) && /2,750\.00/.test(a.state.confirms[0]),
  a.state.confirms[0]);
ck('and it says the rest of the tab is untouched',
  /Nothing else on this tab is touched/.test(a.state.confirms[0]));
/* Cancel has to mean cancel: the button sits beside the one that deletes. */
a = build(ROWS(), ML);
a.call(a.state.rows[0], false);
ck('saying no leaves the price alone', a.state.rows[0].cost === 2500, a.state.rows[0].cost);
ck('and writes no toast claiming it worked', a.state.toasts.length === 0);

console.log(NL + 'the cases where there is nothing to do:');
a = build(ROWS(), ML);
a.call(a.state.rows[1]);
ck('a row already matching is left alone', a.state.rows[1].cost === 500);
ck('and is not asked about', a.state.confirms.length === 0);
ck('but is told so, rather than seeming to do nothing',
  /already matches/.test((a.state.toasts[0] || {}).m || ''), (a.state.toasts[0] || {}).m);
a = build(ROWS(), ML);
a.call(a.state.rows[2]);
ck('a row the Masterlist does not have is refused', a.state.rows[2].cost === 4000);
ck('as an error, saying how to fix it',
  (a.state.toasts[0] || {}).err === true && /not on the Masterlist/.test((a.state.toasts[0] || {}).m || ''),
  (a.state.toasts[0] || {}).m);

console.log(NL + 'and the grouping is the CE\'s own:');
a = build(ROWS(), ML);
a.call(a.state.rows[3]);
ck('the price is taken', a.state.rows[3].cost === 900, a.state.rows[3].cost);
/* The Masterlist says facility, this CE says common. Re-pricing must not
   quietly move the row to another heading on the printed sheet. */
ck('but a grouping set on the CE is kept', a.state.rows[3].group === 'common', a.state.rows[3].group);
a = build([{ id: 'r1', desc: 'Site Office Container', qty: 1, cost: 750 }], ML);
a.call(a.state.rows[0]);
ck('while a row with none takes the Masterlist one', a.state.rows[0].group === 'facility', a.state.rows[0].group);

console.log(NL + 'and the button itself:');
ck('every row has one', tab.indexOf('onClick: () => syncRow(r),') > 0);
ck('it is the cycling arrow, not a word that would widen the row',
  tab.indexOf(String.fromCharCode(0x21bb)) > 0);
/* A row with no Masterlist entry can still be clicked -- it explains itself
   rather than doing nothing -- but it should not look live. */
ck('and it is dimmed when there is nothing behind it',
  tab.indexOf('opacity: _mlFind(r) ? 1 : .35') > 0);
ck('the whole-tab Sync Rates is still there for when that is what is wanted',
  fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8').indexOf('const syncRatesFromML = () => {') > 0);

console.log(NL + 'and none of it costs a scan per row:');
/* A long tab re-renders on every keystroke, and each row asked the whole
   Masterlist twice -- once for the + Masterlist mark, once for the arrow.
   Rows x items of that, per keystroke, is what made typing stutter. */
ck('the Masterlist is indexed once, not searched per row',
  tab.indexOf('const _mlIndex = React.useMemo') > 0);
ck('and the index is what both the mark and the arrow read',
  tab.indexOf('const _mlHas = r => { const d = _mlKey(r); return !d || _mlIndex.has(d); };') > 0 &&
  tab.indexOf('const _mlFind = r => { const d = _mlKey(r); return d ? (_mlIndex.get(d) || null) : null; };') > 0);
ck('it is rebuilt only when the Masterlist or the tab changes',
  tab.indexOf('}, [masterlist, mlType]);') > 0);
/* The index keeps the first entry for a description, as .find returned -- a
   duplicated Masterlist row must not change which rate a row is given. */
a = build(ROWS(), [{ desc: 'Cable Pulling Machine', cost: 2750 },
  { desc: 'Cable Pulling Machine', cost: 9999 }]);
a.call(a.state.rows[0]);
ck('a duplicated Masterlist entry still gives the first rate',
  a.state.rows[0].cost === 2750, a.state.rows[0].cost);
/* The suggestion list is identical in every row, so one is enough; a copy
   per row put the whole Masterlist into the page once for every line. */
ck('the suggestion list is built once for the tab',
  tab.indexOf("const _dlId = 'dl_' + mlType;") > 0 && tab.indexOf('list: _dlId,') > 0);
ck('and the table holds one datalist, not one per row',
  tab.split('React.createElement("datalist"').length - 1 === 1,
  tab.split('React.createElement("datalist"').length - 1);

console.log(bad ? NL + bad + ' FAILURE(S)' : NL + 'row sync OK');
process.exit(bad ? 1 : 0);
