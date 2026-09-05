#!/usr/bin/env node
/*
 * The Co. column answers "whose CE is this", and it was answering with the
 * name of the person who wrote it.
 *
 * Its dropdown was a hardcoded list that had grown to hold MFS, JAVV and EMN
 * -- estimator initials, not companies. And the value itself defaulted to a
 * flat 'SHIC' regardless of the CE number, so every SY3-CE-2026-xxxx sat under
 * a SHIC label while its own number said otherwise.
 *
 * The number is the authority. SHIC-CE-2026-0004 is SHIC's; SY3-CE-2026-0004
 * is SY3's. It is on the row already.
 *
 * Run: node tools/test-company-column.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const raw = fs.readFileSync('src/App.js', 'utf8');
/* Comments here quote the very strings under test. */
const app = raw.replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = (help.match(/function ceNumPrefix\(ceNum\) \{[\s\S]*?\n\}/) || [''])[0];
if (!src) { console.error('ceNumPrefix not found in src/helpers.js'); process.exit(1); }
const ctx = { String };
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._p=ceNumPrefix;', ctx);
const P = ctx._p;

console.log('the company is read out of the CE number:');
ck('SHIC', P('SHIC-CE-2026-0004') === 'SHIC');
ck('SY3', P('SY3-CE-2026-0004') === 'SY3', P('SY3-CE-2026-0004'));
ck('a revision keeps its company', P('SY3-CE-2026-0004-R1') === 'SY3');
ck('lowercase is read the same', P('sy3-ce-2026-0004') === 'SY3');

console.log('\nand nothing is invented when there is no number:');
for (const v of [null, undefined, '', 'no dashes here', '-CE-2026-0001'])
  ck('no prefix from ' + JSON.stringify(v), P(v) === '');

console.log('\nthe dropdown is built from the companies on file:');
ck('estimator initials are gone from it',
  !/\['SHIC', 'SY3', 'ACE', 'MCR', 'EMN', 'SDB', 'RML', 'MFS', 'JAVV', 'Other'\]/.test(app),
  'MFS, JAVV and EMN are people, and the column that says whose CE this is was offering them');
for (const who of ['MFS', 'JAVV'])
  ck(who + ' is not hardcoded anywhere in App', !new RegExp("'" + who + "'").test(app));
ck('the options come from companies', /\(companies \|\| \[\]\)\.forEach\(c => \{ const p = String\(c\.cePrefix/.test(app));
ck('and from prefixes CEs already carry',
  /monRows\.forEach\(e => \{ const p = ceNumPrefix/.test(app),
  'a company since removed must not strip its old CEs of their label');
ck('with SHIC as the floor when there is nothing else',
  /return out\.length \? out : \['SHIC'\]/.test(app));

console.log('\nthe list is computed at App scope, not inside another hook:');
ck('coOptions is declared before sortedHistory',
  app.indexOf('const coOptions = useMemo') > 0 &&
  app.indexOf('const coOptions = useMemo') < app.indexOf('const sortedHistory = useMemo'),
  'a hook called from inside another hook callback runs conditionally');
ck('and it is a top-level const in App', /\n  const coOptions = useMemo\(\(\) => \{/.test(app));

console.log('\nthe cell shows the number’s own company:');
ck('the row derives it', /const coDesig = ceNumPrefix\(ceNum\) \|\| m\.companyDesig \|\| 'SHIC';/.test(app));
ck('the read-only cell shows it', /React\.createElement\("span", \{style:\{fontSize:11\}\}, coDesig\)/.test(app));
ck('the editor starts from it', /defaultValue: coDesig,/.test(app));
ck('and no cell falls back to a flat SHIC any more',
  !/m\.companyDesig\|\|'SHIC'/.test(app) && !/m\.companyDesig \|\| 'SHIC',/.test(app),
  "that default is what labelled every SY3 CE as SHIC's");

console.log('\na label the list no longer offers is still kept:');
ck('the row’s own value is prepended when missing',
  /\[\.\.\.\(coDesig && coOptions\.indexOf\(coDesig\) < 0 \? \[coDesig\] : \[\]\), \.\.\.coOptions\]/.test(app),
  'otherwise an old CE shows an empty dropdown, which reads as having no company');

console.log('\nand sorting follows what the column shows:');
ck('it sorts by the prefix, not the stored field',
  /case 'companyDesig': return ceNumPrefix\(\(e\.info && e\.info\.ceNum\) \|\| e\.ceNum\) \|\| m\.companyDesig/.test(app),
  'sorting by the stored field put a SY3 CE among the SHIC ones');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ncompany column OK');
process.exit(bad ? 1 : 0);
