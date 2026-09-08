#!/usr/bin/env node
/*
 * Filtering CE Monitoring by discipline and by customer.
 *
 * Both fields already had a column and a sort; neither could be filtered, so
 * finding every Mechanical CE for one client meant reading 919 rows or
 * searching for a string that also matches job titles and remarks.
 *
 * Two things decide whether these work on real data. The same value is stored
 * as "Mechanical" by the editor and "MECHANICAL" by the xlsx import, so a
 * case-sensitive filter offers both and finds half the CEs under each. And
 * both fields have a monitoring value that falls back to the CE's own, so the
 * filter has to read them exactly as the column does or a row is hidden by a
 * value nobody can see.
 *
 * Run: node tools/test-monitoring-filters.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const raw = fs.readFileSync('src/App.js', 'utf8');
const app = raw.replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- the real readers ---------------------------------------------------- */
const src = (raw.match(/  const monDisc = [^\n]*\n  const monCust = [^\n]*/) || [''])[0];
if (!src) { console.error('monDisc / monCust not found'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._d=monDisc;globalThis._c=monCust;', ctx);
const D = ctx._d, C = ctx._c;

console.log('each field is read the way its column reads it:');
ck('the monitoring value wins', D({info: {discipline: 'Civil'}}, {designation: 'Mechanical'}) === 'Mechanical');
ck('then the older field name', D({info: {}}, {discipline: 'Electrical'}) === 'Electrical');
ck('then the CE itself', D({info: {discipline: 'Civil'}}, {}) === 'Civil');
ck('then the project type', D({info: {projType: 'Mechanical'}}, {}) === 'Mechanical');
ck('and blank when there is nothing', D({info: {}}, {}) === '');
ck('customer prefers the monitoring value', C({info: {client: 'A'}}, {customer: 'B'}) === 'B');
ck('and falls back to the CE client', C({info: {client: 'A'}}, {}) === 'A');

console.log('\nthe filter compares case-insensitively:');
ck('discipline', /monDisc\(e, m\)\.trim\(\)\.toUpperCase\(\) !== monDiscFilter/.test(app),
  '"Mechanical" from the editor and "MECHANICAL" from the import are one discipline');
ck('customer', /monCust\(e, m\)\.trim\(\)\.toUpperCase\(\) !== monCustFilter/.test(app));
ck('and the options are keyed the same way', /const key = raw\.toUpperCase\(\);/.test(app),
  'a key that differs from what the filter compares matches nothing');

console.log('\nthe options come from the data, not a fixed list:');
ck('built by walking the rows', /monRows\.forEach\(e => \{/.test(app));
ck('through the same readers', /useMonFacet\(monDisc\)/.test(app) && /useMonFacet\(monCust\)/.test(app),
  'a separate reading would offer a value the filter cannot match');
ck('counted', /seen\[key\]\.n\+\+/.test(app));
ck('and ordered by count, not alphabetically',
  /sort\(\(a, b\) => b\.n - a\.n \|\| a\.label\.localeCompare\(b\.label\)\)/.test(app),
  'the customer with ninety CEs should not be halfway down a list of two hundred');
ck('the count is shown on the option', /'  \\u00b7 ' \+ o\.n/.test(raw));
ck('and a blank value is offerable rather than hidden', /o\.label \|\| '\(none\)'/.test(app),
  'a CE with no discipline is a real thing to go looking for');

console.log('\nthe facet builder is treated as the hook it is:');
ck('named accordingly', /const useMonFacet = \(read\) => useMemo/.test(app));
ck('and called unconditionally, twice', (app.match(/useMonFacet\(mon(Disc|Cust)\)/g) || []).length === 2,
  'a conditional call would change the hook order between renders');

console.log('\nthe table reacts to them:');
ck('both are in the filter dependencies', /monTypeFilter, monDiscFilter, monCustFilter, monSortCol/.test(app));
ck('choosing one returns to page 1', /setMonDiscFilter\(e\.target\.value\); setMonPage\(0\)/.test(app),
  'staying on page 7 of a list that is now four rows long shows nothing');
ck('and the same for customer', /setMonCustFilter\(e\.target\.value\); setMonPage\(0\)/.test(app));

console.log('\nClear Filters clears these too:');
ck('it notices they are set', /monTypeFilter !== 'all' \|\| monDiscFilter !== 'all' \|\| monCustFilter !== 'all'/.test(app),
  'otherwise the button hides while a filter is still on');
ck('and resets both', /setMonDiscFilter\('all'\); setMonCustFilter\('all'\)/.test(app));

console.log('\nthe sort reads the same values:');
ck('discipline', /case 'designation':  return monDisc\(e, m\);/.test(app));
ck('customer', /case 'customer':     return monCust\(e, m\);/.test(app),
  'a column that sorts by one value and filters by another is two columns wearing one hat');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmonitoring filters OK');
process.exit(bad ? 1 : 0);
