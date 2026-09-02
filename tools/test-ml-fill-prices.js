#!/usr/bin/env node
/*
 * Price the masterlist from what was actually charged.
 *
 * An item priced at zero is not a cheap item, it is an unpriced one, and a
 * masterlist full of them is how a CE goes out understating its own cost. A
 * merged warehouse export arrived with 620 of them -- and the company had
 * bought most of those before. The costs were sitting in the CE history and
 * nothing read them back.
 *
 * The rule that matters: only rates from CEs this company actually issued get
 * written. A figure the file analyser lifted out of somebody's spreadsheet is
 * worth showing beside a rate for a person to weigh, which the clock does, but
 * it is not worth writing into the masterlist unattended.
 *
 * Run: node tools/test-ml-fill-prices.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
const w = fs.readFileSync('src/widgets.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- run the real fillFromHistory against a fake masterlist -------------- */
const fn = (app.match(/    const fillFromHistory = \(\) => \{[\s\S]*?\n    \};/) || [''])[0];
const kinds = (app.match(/  const ML_HIST_KIND = \{[\s\S]*?\n  \};/) || [''])[0];
const uses = (w.match(/function shicRateUses\(kind, name, limit\) \{[\s\S]*?\n\}/) || [''])[0];
if (!fn || !kinds || !uses) { console.error('fillFromHistory / ML_HIST_KIND / shicRateUses not found'); process.exit(1); }

const ce = (num, when, rows) => Object.assign({ savedAt: when, info: { ceNum: num } }, rows);
const HIST = [
  ce('CE-0100', '2026-01-10T00:00:00Z', { mats: [{ desc: 'FLAP DISC 4"', cost: 40 }] }),
  ce('CE-0300', '2026-06-02T00:00:00Z', { mats: [{ desc: 'flap disc  4 "', cost: 55 }] }),
  ce('CE-0400', '2026-07-01T00:00:00Z', { mats: [{ desc: 'PENETRANT 500ML', cost: 310 }] }),
  /* No savedAt, no CE number: scraped by the file analyser. */
  { info: {}, mats: [{ desc: 'BEARING 6311 C3', cost: 9999 }] }
];

function run(list, answer) {
  const saved = [];
  const toasts = [];
  const ctx = {
    window: { shicHistory: HIST },
    N: v => parseFloat(v) || 0,
    mlTab: 'materials',
    masterlist: { materials: list },
    saveML: ml => saved.push(ml),
    showToast: (m, err) => toasts.push({ m: m, err: !!err }),
    confirm: m => { toasts.push({ confirm: m }); return answer; },
    Number, String, Date, isFinite, Math, Object
  };
  vm.createContext(ctx);
  vm.runInContext(uses + ';' + kinds.trim() + ';' + fn.trim() + ';fillFromHistory();', ctx);
  return { saved, toasts };
}

const LIST = [
  { id: 1, desc: 'FLAP DISC 4"', cost: 0 },
  { id: 2, desc: 'PENETRANT 500ML', cost: '' },
  { id: 3, desc: 'BEARING 6311 C3', cost: 0 },
  { id: 4, desc: 'NEVER BOUGHT ANYWHERE', cost: 0 },
  { id: 5, desc: 'ALREADY PRICED', cost: 120 }
];

console.log('it prices what the history can answer for:');
let r = run(LIST, true);
const out = r.saved[0].materials;
const by = id => out.find(x => x.id === id);
ck('an unpriced item gets its most recent rate', by(1).cost === 55, JSON.stringify(by(1)));
ck('an empty string counts as unpriced too', by(2).cost === 310, JSON.stringify(by(2)));
ck('and the name is matched the way a person reads it', by(1).cost === 55,
  'FLAP DISC 4" and flap disc  4 " are the same item');

console.log('\nand leaves alone what it cannot:');
ck('an item in no saved CE is untouched', by(4).cost === 0);
ck('an item that already has a price is untouched', by(5).cost === 120,
  'this fills gaps; it is not a re-pricing tool');

console.log('\nan analysed spreadsheet never sets a masterlist price:');
ck('the scraped rate is not written', by(3).cost === 0, JSON.stringify(by(3)));
ck('the filter is on issued, in the code', /\.filter\(u => u\.issued\)/.test(app));
ck('and the prompt says so', /Rates read out of analysed spreadsheets are not used/.test(app));

console.log('\nnothing is written without saying what and from where:');
const q = r.toasts.find(t => t.confirm);
ck('it confirms first', !!q);
ck('it says how many of how many', /Price 2 of 4 unpriced/.test(q.confirm), q.confirm.split('\n')[0]);
ck('it names the items and their prices', /FLAP DISC 4"/.test(q.confirm) && /P55\.00/.test(q.confirm));
ck('and the CE each price came from', /\(CE-0300\)/.test(q.confirm),
  'a price with no provenance is just another number to distrust');
ck('it says what it will not touch', /appear in no saved CE and are left alone/.test(q.confirm));

console.log('\nand declining changes nothing:');
ck('cancel writes nothing', run(LIST, false).saved.length === 0);

console.log('\nthe empty cases say something useful:');
ck('an already-complete tab', /already has a price/.test(run([{ id: 9, desc: 'X', cost: 5 }], true).toasts[0].m));
const none = run([{ id: 9, desc: 'NOTHING KNOWN', cost: 0 }], true);
ck('unpriced but unknown is reported, not silently ignored',
  /appear in any saved CE/.test(none.toasts[0].m) && none.toasts[0].err === true);

console.log('\nthe clock is on the masterlist row too:');
ck('beside the cost cell', /kind: ML_HIST_KIND\[mlTab\],\s*name: r\[nameKey\],/.test(app));
ck('and clicking a past rate writes it', /onPick: v => updML\(r\.id, costKey, v\)/.test(app));
ck('the tab name is mapped to the history key, not assumed equal',
  /manpower: 'mp', tools: 'tools', materials: 'mats',/.test(app),
  "the Materials tab is 'materials' and its rows are stored under 'mats'");
ck('the button is in the toolbar', /onClick: fillFromHistory/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmasterlist price fill OK');
process.exit(bad ? 1 : 0);
