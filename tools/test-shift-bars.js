#!/usr/bin/env node
/*
 * The shift bars read as rows, and every tint on them survives the theme.
 *
 * Most of this already existed: the dot, the label, the multiplier pill, the
 * head count, the subtotal and the four actions. What the mockup does
 * differently is state the zeros -- hidden, an empty shift and one nobody has
 * opened look identical, and the row silently changes shape the moment the
 * first person is added.
 *
 * The real find here was a regression from the palette change. shiftColor,
 * statusColor and spColor are locals holding CSS variables, and each had a hex
 * alpha concatenated onto it -- "var(--accent-violet)22", which the browser
 * drops. The shift pills, the status chips and the online pill all lost their
 * backgrounds for two builds. test-theme now checks any identifier, not the
 * ten constants it used to name.
 *
 * Run: node tools/test-shift-bars.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const live = app.replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('all six shifts, at DESIGN.md §5.2 multipliers:');
const src = (cfg.match(/const SHIFTS = \{[\s\S]*?\n\};/) || [''])[0];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._s=SHIFTS;', ctx);
const S = ctx._s;
for (const [k, mult, label] of [
  ['regular_day', 1, 'Regular Day Shift'],
  ['regular_night', 1.25, 'Regular Night Shift'],
  ['sunday_day', 1.3, 'Sunday Day (Non-working)'],
  ['sunday_night', 1.625, 'Sunday Night (Non-working)'],
  ['holiday_day', 2, 'Legal Holiday Day'],
  ['holiday_night', 2.5, 'Legal Holiday Night']])
  ck(label + ' ×' + mult, S[k] && S[k].mult === mult && S[k].label === label,
    S[k] ? JSON.stringify(S[k]) : 'missing');
ck('and no seventh crept in', Object.keys(S).length === 6, Object.keys(S).join(','));

console.log('\nthe bar states its zeros:');
ck('the head count is always shown',
  !/shiftWorkers > 0 && \/\*#__PURE__\*\/React\.createElement\("span"/.test(live),
  'hidden, an empty shift and an unopened one look the same');
ck('and so is the subtotal', !/shiftSub > 0 && \/\*#__PURE__\*\/React\.createElement\("span", \{\s*style: \{\s*\.\.\.MONO/.test(live));
ck('a zero is muted rather than coloured',
  /color: shiftSub > 0 \? shiftColor : 'var\(--text-muted\)'/.test(live),
  'a bright P0.00 reads as a figure somebody entered');
ck('the peso sign is the peso sign', /"\\u20b1", ph\(shiftSub\)/.test(app) || /"₱", ph\(shiftSub\)/.test(app));

console.log('\nthe pill says what the number means:');
ck('it names the multiplier when the shift is in use',
  /rows\.length > 0 \? " Multiplier" : ""/.test(live));
ck('and the footer agrees with it', /Multiplier applied\): /.test(app));

console.log('\na shift carrying people is ringed, not only tinted:');
ck('there is a ring', /boxShadow: rows\.length > 0/.test(live));
ck('drawn from the shift colour', /'0 0 0 1px ' \+ alpha\(shiftColor, '33'\)/.test(live),
  'a tint alone is nearly invisible on the light canvas');
ck('and it keeps the card shadow under it', /var\(--card-shadow\)'/.test(live));
ck('a collapsed bar is tighter than an open card', /padding: collapsed \? '10px 14px' : 16/.test(live));

console.log('\nevery tint on the bar survives the theme:');
for (const [name, file] of [['shiftColor', 'src/App.js'], ['statusColor', 'src/App.js'],
  ['spColor', 'src/widgets.js']]) {
  const body = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ck(name + ' is not concatenated',
    !new RegExp('\\b' + name + "\\s*\\+\\s*'[0-9A-Fa-f]{2}'").test(body),
    'var(--x)22 is not a colour, and the browser says nothing');
  ck(name + ' goes through alpha()', new RegExp('alpha\\(' + name + ',').test(body));
}
ck('and the guard now watches identifiers, not a list of names',
  /ANY identifier, not just the ten constants/.test(fs.readFileSync('tools/test-theme.js', 'utf8')));

console.log('\nthe four actions are still on every shift:');
for (const t of ['"ML"', '"+ Add"', 'Sync Rates', 'Consolidate'])
  ck(t, app.indexOf(t) >= 0);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nshift bars OK');
process.exit(bad ? 1 : 0);
