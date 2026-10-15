#!/usr/bin/env node
/*
 * The CE Number guard. A number typed far above every number in use this year (11239 for 1239) is flagged under the field, with the likely
 * intended number offered. It only warns: nothing is blocked or changed unless the person presses the button.
 * Run: node tools/test-ce-number-guard.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const h = fs.readFileSync('src/helpers.js', 'utf8');
const info = fs.readFileSync('src/components/InfoTab.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = h.indexOf('function ceSeqOf'), b = h.indexOf('function nextCeNum(');
const c = h.indexOf('function ceNumTypo'), d = h.indexOf('function nextCeNumForCompany');
const ctx = vm.createContext({ Date, parseInt, String });
vm.runInContext(h.slice(a, b) + h.slice(c, d) + '\nthis.t=ceNumTypo;', ctx);
const yr = new Date().getFullYear();
const n = x => 'SHIC-CE-' + yr + '-' + String(x).padStart(4, '0');
const hist = [1, 2, 1238, 1239].map(x => ({ info: { ceNum: n(x) } }));
const t = ctx.t;

let r = t(n(11239), hist, []);
ck('11239 against a highest of 1239 is flagged', r && r.max === 1239, JSON.stringify(r));
ck('it offers the typed digits with one removed (1239)', r && r.suggested === n(1239), JSON.stringify(r));
ck('the next number (1240) is not flagged', t(n(1240), hist, []) === null);
ck('a few ahead (1242) is not flagged', t(n(1242), hist, []) === null);
ck('a real jump with no obvious slip (5000) offers the next free number', (r = t(n(5000), hist, [])) && r.suggested === n(1240), JSON.stringify(r));
ck('the number being edited does not count against itself', t(n(1239), [{ info: { ceNum: n(1239) } }, ...hist], []) === null);
ck('the saved copy of the same wrong number does not hide the warning', t(n(11239), [{ info: { ceNum: n(11239) } }, ...hist], []) !== null);
ck('known/reserved numbers count too', (r = t(n(11239), [], [n(1239)])) && r.max === 1239);
ck('an empty list (first CE of the year) never warns', t(n(500), [], []) === null);
ck('another year is left alone', t('SHIC-CE-2019-9999', hist, []) === null);
ck('free text that is not a CE number is left alone', t('abc', hist, []) === null && t('', hist, []) === null);
ck('a revision suffix does not confuse it', t(n(11239) + '-R1', hist, []) !== null);
ck('the prefix the person typed is kept in the suggestion', (r = t('SY3-CE-' + yr + '-11239', hist, [])) && r.suggested === 'SY3-CE-' + yr + '-1239', JSON.stringify(r));

ck('the Project Info tab shows it under the field, as an alert with a button', info.includes('ceNumTypo(info.ceNum, history, ceNums)') && info.includes("role: 'alert'") && info.includes('Did you mean'));
ck('the button only fills the field in; it never saves by itself', info.includes('onClick: () => setInfo(p => ({ ...p, ceNum: t.suggested }))'));
ck('the tab is given the history and the known numbers', app.includes('InfoTab({ ScopeBuilder, ceNums, history,'));
process.exit(bad ? 1 : 0);
