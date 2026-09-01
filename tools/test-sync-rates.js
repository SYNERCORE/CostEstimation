#!/usr/bin/env node
/*
 * A saved CE keeps the cost it was quoted at. Prices move only when asked.
 *
 * Rates and costs live on the row they belong to, so loading a CE restores
 * exactly what was saved -- a masterlist increase never rewrites a quote that
 * has already gone out. Re-pricing is a deliberate act on the CE on screen:
 * Sync Rates, on the way to quoting the work again.
 *
 * What has to hold:
 *   - it re-prices manpower AND tools, materials and PPE, not just one shift
 *   - a row the masterlist does not know keeps the price it has -- a missing
 *     entry must never zero a priced row
 *   - it matches on role/description regardless of case or padding
 *   - nothing is written to history: it edits the CE on screen, and Save is
 *     still a separate act
 *   - if the CE number is already saved, it warns first, because saving after
 *     re-pricing replaces the record of what was quoted
 *
 * Run: node tools/test-sync-rates.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const body = app.match(/const syncRatesFromML = \(\) => \{[\s\S]*?\n  \};/);
if (!body) { console.error('syncRatesFromML not found'); process.exit(1); }

const N = v => Number(v) || 0;
const run = (state, opts) => {
  opts = opts || {};
  let prompt = null, toast = null;
  const out = {};
  const set = k => fn => { out[k] = fn(state[k]); };
  const fn = new Function(
    'masterlist', 'mp', 'tools', 'mats', 'ppe', 'info', 'history', 'N',
    'showToast', 'confirm', 'setMp', 'setTools', 'setMats', 'setPpe',
    'return ' + body[0].replace(/^const syncRatesFromML = /, '').replace(/;$/, '')
  )(
    state.masterlist, state.mp, state.tools, state.mats, state.ppe,
    state.info, state.history || [], N,
    (m) => { toast = m; },
    (m) => { prompt = m; return opts.cancel ? false : true; },
    set('mp'), set('tools'), set('mats'), set('ppe')
  );
  fn();
  return {out, prompt, toast};
};

const base = () => ({
  masterlist: {
    manpower: [{role: 'Welder', rate: 1100, perDiem: 50}, {role: 'HELPER', rate: 700}],
    tools: [{desc: 'Crane', cost: 6000}],
    materials: [{desc: 'Plywood', cost: 1900}],
    ppe: [{desc: 'Gloves', cost: 95}]
  },
  mp: [
    {role: 'WELDER', rate: 950, perDiem: 0},
    {role: ' helper ', rate: 650},
    {role: 'Specialist Diver', rate: 5000}
  ],
  tools: [{desc: 'crane', cost: 5000}, {desc: 'Hired Barge', cost: 40000}],
  mats: [{desc: 'PLYWOOD', cost: 1750}],
  ppe: [{desc: 'Gloves', cost: 80}],
  info: {ceNum: 'SY3-CE-2026-0900'},
  history: []
});

console.log('it re-prices the whole CE, not one shift:');
let r = run(base());
ck('manpower', N(r.out.mp[0].rate) === 1100, JSON.stringify(r.out.mp[0]));
ck('tools', N(r.out.tools[0].cost) === 6000);
ck('materials', N(r.out.mats[0].cost) === 1900);
ck('PPE', N(r.out.ppe[0].cost) === 95);
ck('and per diem rides along with the rate', N(r.out.mp[0].perDiem) === 50);
ck('matching ignores case and padding', N(r.out.mp[1].rate) === 700,
  '" helper " must find "HELPER"');

console.log('\nwhat the masterlist does not know, it does not touch:');
ck('a role with no masterlist entry keeps its rate', N(r.out.mp[2].rate) === 5000,
  'a missing entry must never zero a priced row');
ck('and so does a one-off tool', N(r.out.tools[1].cost) === 40000);

console.log('\nit asks before changing anything:');
ck('the prompt lists what will change', /Welder/i.test(r.prompt) && /Crane/i.test(r.prompt), r.prompt);
ck('it counts the rows', /Re-price 5 rows/.test(r.prompt), r.prompt);
ck('and says untouched rows stay as they are', /keep the price they have/.test(r.prompt));

const c = run(base(), {cancel: true});
ck('saying no changes nothing', Object.keys(c.out).length === 0,
  'the preview must not be able to half-apply');

console.log('\nand a CE that is already saved is called out:');
const st = base(); st.history = [{info: {ceNum: 'sy3-ce-2026-0900'}}];
const w = run(st);
ck('saving after this would replace what was quoted', /REPLACES what was quoted/.test(w.prompt), w.prompt);
ck('with the way out named', /Clone it to a new CE number/.test(w.prompt));
ck('a CE number not yet in history gets no such warning', !/REPLACES what was quoted/.test(r.prompt));

console.log('\nnothing is written by the action itself:');
ck('no history save', !/dbSaveHistory/.test(body[0]) && !/handleSave\(/.test(body[0]));
ck('no draft write', !/saveDraft\(/.test(body[0]));
ck('and the toast says Save is still needed', /Nothing is saved until you press Save/.test(app));

console.log('\nthe button is on the CE, next to the other CE-wide actions:');
ck('it exists', /onClick: syncRatesFromML/.test(app));
ck('and explains that a saved CE holds its quoted cost',
  /A saved CE keeps the cost it was quoted at until you do this/.test(app));

console.log('\nnothing re-prices a CE on its own:');
const load = app.match(/const handleLoad = async e => \{[\s\S]*?\n  \};/)[0];
ck('loading a CE does not touch the masterlist',
  !/masterlist/.test(load),
  'a load that re-priced would silently rewrite what was quoted');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nsync rates OK');
process.exit(bad ? 1 : 0);
