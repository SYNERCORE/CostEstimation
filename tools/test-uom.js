#!/usr/bin/env node
/*
 * Units of measure.
 *
 * There were five near-identical copies of a twelve-item list across App.js and
 * ResTab.js, in three different orders, so adding a unit meant finding all five
 * and the Materials tab could offer something the Masterlist could not. Common
 * trade units — Can, Gallon, Pail, Drum, Bag, Ton, sq.m — were missing from all
 * of them.
 *
 * The subtle rule is the last one: a saved CE or an xlsx import can carry any
 * UOM string, and a <select> whose options do not include the current value
 * renders the FIRST option instead. That misrepresents the saved row, and
 * rewrites it for real the moment anyone touches the control.
 *
 * Run: node tools/test-uom.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const constants = rd('src/constants.js'), app = rd('src/App.js'), res = rd('src/components/ResTab.js');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* Lift the real block out of constants.js with a stub React. */
const start = constants.indexOf('const UOM_GROUPS');
const src = start >= 0 ? constants.slice(start) : '';
if (!src) { console.error('UOM block not found in src/constants.js'); process.exit(1); }
const ctx = {
  React: {
    createElement: (type, props, children) => ({
      type, label: props && props.label, value: props && props.value,
      children: Array.isArray(children) ? children : (children === undefined ? [] : [children])
    })
  }
};
vm.createContext(ctx);
vm.runInContext(src + '\nglobalThis._groups=UOM_GROUPS;globalThis._all=UOM_OPTIONS;globalThis._els=uomOptionEls;', ctx);
const ALL = ctx._all, els = ctx._els;

console.log('The units people actually asked for are present:');
for (const u of ['Can', 'Gallon', 'Pail', 'Drum', 'Bag', 'Sack', 'Bottle', 'Tube', 'Cartridge'])
  ck(u + ' is available', ALL.includes(u));

console.log('\nAnd the rest of the trade units:');
for (const u of ['Ton', 'lb', 'g', 'sq.m', 'sq.ft', 'cu.m', 'Ft', 'Inch', 'mm', 'cm', 'Km',
                 'Sheet', 'Plate', 'Bar', 'Rod', 'Length', 'Coil', 'Spool', 'Bundle',
                 'Dozen', 'Ream', 'Assy', 'Kit', 'Hour', 'Man-day', 'Trip', 'Shift'])
  ck(u + ' is available', ALL.includes(u));

console.log('\nNothing that used to work has been dropped:');
/* The twelve that every one of the old copies carried. */
for (const u of ['Day', 'Lot', 'Pcs', 'Set', 'Unit', 'M', 'Kg', 'L', 'Box', 'Pack', 'Roll', 'Pair'])
  ck(u + ' still offered', ALL.includes(u), 'existing CEs use this');

console.log('\nList hygiene:');
ck('no duplicates', new Set(ALL.map(u => u.toLowerCase())).size === ALL.length,
  ALL.filter((u, i) => ALL.findIndex(x => x.toLowerCase() === u.toLowerCase()) !== i).join(','));
ck('no blank entries', ALL.every(u => typeof u === 'string' && u.trim() === u && u.length > 0));
ck('meaningfully longer than the old twelve', ALL.length > 40, ALL.length);
ck('every group has a name and members', ctx._groups.every(g => g[0] && Array.isArray(g[1]) && g[1].length));

console.log('\nGrouped for scanning, not one flat wall:');
const plain = els('Pcs');
ck('renders optgroups', plain.every(g => g.type === 'optgroup'));
ck('one per group', plain.length === ctx._groups.length, plain.length);
ck('groups are labelled', plain.map(g => g.label).join(',') === ctx._groups.map(g => g[0]).join(','));
ck('Can sits with the containers',
  ctx._groups.find(g => g[0] === 'Container')[1].includes('Can'));
ck('Gallon sits beside it, where someone buying paint would look',
  ctx._groups.find(g => g[0] === 'Container')[1].includes('Gallon'));

console.log('\nAn unrecognised value from a saved CE or an import is preserved:');
const odd = els('SET/S');
ck('it is offered', odd.length === ctx._groups.length + 1, odd.length);
ck('and offered first, where it is visible', odd[0].label === 'From this record');
ck('with the original text intact', odd[0].children[0].value === 'SET/S');
ck('a known value adds no extra group', els('Kg').length === ctx._groups.length);
ck('matching is case-insensitive, so "kg" is not duplicated', els('kg').length === ctx._groups.length,
  'a case difference would look like an unknown unit');
ck('whitespace is tolerated', els('  Kg  ').length === ctx._groups.length);
ck('an empty value adds nothing', els('').length === ctx._groups.length);
ck('null/undefined are safe', els(null).length === ctx._groups.length && els(undefined).length === ctx._groups.length);

console.log('\nOne list, used everywhere:');
ck('no hardcoded list left in App.js', !/'Roll', 'Pair'/.test(app), 'a copy will drift from the others');
ck('no hardcoded list left in ResTab.js', !/'Roll', 'Pair'/.test(res));
ck('the datalist for the free-text inputs uses it too', /const UOMS = UOM_OPTIONS;/.test(app),
  'the CE rows would offer fewer units than the Masterlist');
const uses = (app.match(/uomOptionEls\(/g) || []).length + (res.match(/uomOptionEls\(/g) || []).length;
ck('every select renders from the shared helper', uses === 4, uses);
ck('the helper lives in constants.js, which loads before its callers',
  /function uomOptionEls/.test(constants));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall UOM assertions passed');
process.exit(fails ? 1 : 0);
