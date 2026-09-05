#!/usr/bin/env node
/*
 * The Summary screen, per the mockup.
 *
 * The audit and the matrix both existed, and the signatories were already a
 * four-column grid. What the mockup does differently is state the counts as
 * chips in their own severity colour, lay the findings out as pills rather
 * than a stacked list, and colour-code each cost group so a matrix row can be
 * found by eye.
 *
 * Everything here is presentation. The issues the audit raises, the figures in
 * the matrix and the share percentages are all unchanged -- and
 * check-logic-unchanged proves the formulas behind them are too.
 *
 * Run: node tools/test-summary-screen.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const raw = fs.readFileSync('src/App.js', 'utf8');
const app = raw.replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('the audit states its counts as chips:');
ck('it is named as an audit', /"⚠ CE Audit"/.test(app) && /CE Audit — complete/.test(app));
ck('items to fix, in the danger colour', /errs, " item", errs === 1 \? '' : 's', " to fix"/.test(app));
ck('items to review, in the warning colour', /warns, " to review"/.test(app));
ck('each chip is tinted through alpha, not concatenated',
  /background: alpha\(ERR, '22'\)/.test(app) && /alpha\('var\(--status-warning\)', '22'\)/.test(app));
ck('and the run-on line is gone', !/errs \+ " to fix"\) \+ \(errs && warns \? " · "/.test(app),
  '"2 to fix · 2 to review" made the more urgent half the harder one to pick out');

console.log('\nthe findings are pills, each with its own action:');
ck('laid out as a wrapping row', /marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6/.test(app));
ck('each one tinted by severity', /background: alpha\(c, '11'\), border: `1px solid \$\{alpha\(c, '44'\)\}`/.test(app));
ck('an error says Fix', /"Fix →" : "View →"/.test(app));
ck('and a warning says View', /i\.sev === 'err' \? "Fix →"/.test(app));
ck('the action still moves to the tab that owns it', /onClick: \(\) => setTab\(i\.tabId\)/.test(app));
ck('and Summary findings offer no link to Summary',
  /i\.tabId && i\.tabId !== 'summary'/.test(app),
  'a button that goes where you already are is worse than none');

console.log('\nthe matrix is colour-coded and named as the mockup names it:');
ck('Cost Group / Scope Classification', /"Cost Group \/ Scope Classification"/.test(app));
ck('Computed Cost', /"Computed Cost \(\\u20b1\)"|"Computed Cost \(₱\)"/.test(raw));
ck('% Total Share', /"% Total Share"/.test(app));
ck('every row carries a dot', /background: val > 0 \? summaryDot\(label\) : BDR/.test(app),
  'an empty group is greyed rather than coloured');

const src = (raw.match(/const SUMMARY_DOT = \{[\s\S]*?\n  \};[\s\S]*?const summaryDot = [^\n]*/) || [''])[0];
ck('the palette is defined', src.length > 50);
const ctx = {INFO: 'INFO', ACC: 'ACC', OK: 'OK', MT: 'MT', String, RegExp};
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._d=summaryDot;', ctx);
const D = ctx._d;
console.log('\nand the colour survives the lettering the matrix adds:');
ck('a plain label', D('Manpower Cost') === 'ACC');
ck('a lettered one', D('A.  Manpower Cost') === 'ACC',
  'summaryRows prefixes "A. ", "B. " as sections become non-zero');
ck('mobilisation', D('Mobilization Expenses') === 'INFO');
ck('materials', D('Materials & Consumables') === 'OK');
ck('PPE has its own', D('PPE') === 'var(--accent-violet)');
ck('and anything unknown is muted, not undefined', D('Something New') === 'MT');

console.log('\nkeyed by name, not by position:');
ck('the map is an object keyed on the label', /'Manpower Cost': ACC/.test(raw),
  'mob/demob rows only exist on onsite, so an index would shift the palette on every other CE type');

console.log('\nthe signatory grid is unchanged and still four across:');
ck('a grid', /gridTemplateColumns: `repeat\(\$\{Math\.min\(approvers\.length, 4\)\},1fr\)`/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nsummary screen OK');
process.exit(bad ? 1 : 0);
