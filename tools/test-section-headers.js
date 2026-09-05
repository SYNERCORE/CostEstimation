#!/usr/bin/env node
/*
 * One definition of a section header.
 *
 * The heading treatment -- uppercase, weighted, tracked -- was written out
 * inline at every section, each with its own size and margin, so they had
 * drifted from one another: 9px in one panel and 18px in another, all meant to
 * read as the same thing. The mockups add a coloured dot and a grey aside.
 *
 * Field labels are deliberately NOT this. "Copy to shift:" with a coloured dot
 * in front of it reads as a status, which it is not.
 *
 * Run: node tools/test-section-headers.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const con = fs.readFileSync('src/constants.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = (con.match(/const secHead = \(label, color, note, opts\) => \{[\s\S]*?\n\};/) || [''])[0];
if (!src) { console.error('secHead not found in src/constants.js'); process.exit(1); }

/* Render it with a stand-in React so the output can be inspected. */
const el = (type, props, ...kids) => ({type, props: props || {}, kids: kids.filter(k => k !== null)});
const ctx = {React: {createElement: el}, ACC: 'ACC', MT: 'MT'};
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._h=secHead;', ctx);
const H = ctx._h;

console.log('it renders the mockup treatment:');
const h = H('MOBILIZATION EXPENSES', 'INFO', 'Add each charge as a separate line item');
ck('a dot, a label and the note', h.kids.length === 3, String(h.kids.length));
const [dot, label, note] = h.kids;
ck('the dot is round and carries the colour',
  dot.props.style.borderRadius === '50%' && dot.props.style.background === 'INFO');
ck('the label is uppercase', label.props.style.textTransform === 'uppercase');
ck('tracked at 0.05em per DESIGN.md §3', label.props.style.letterSpacing === '0.05em');
ck('semi-bold, not heavy', label.props.style.fontWeight === 600);
ck('and it takes the section colour too', label.props.style.color === 'INFO');

console.log('\nthe aside stays out of the heading:');
ck('it is muted', note.props.style.color === 'MT');
ck('and not uppercased with the label', note.props.style.textTransform === 'none',
  'the heading has to stay scannable on its own');
ck('no note means no empty element', H('X', 'ACC').kids.length === 2);
ck('and an omitted colour falls back to the accent', H('X').kids[0].props.style.background === 'ACC');

console.log('\nsize and margin are per-site, with a sane default:');
ck('default size', H('X', 'ACC').kids[1].props.style.fontSize === 12);
ck('default margin', H('X', 'ACC').props.style.marginBottom === 12);
ck('both overridable', (() => {
  const o = H('X', 'ACC', null, {size: 18, mb: 2});
  return o.kids[1].props.style.fontSize === 18 && o.props.style.marginBottom === 2;
})());
ck('and a zero margin is honoured, not treated as absent',
  H('X', 'ACC', null, {mb: 0}).props.style.marginBottom === 0,
  'the usual `opts.mb || 12` would quietly restore the default here');

console.log('\nthe real section headings use it:');
for (const t of ['Project Details', 'Client Document', 'Mobilization Expenses',
  'Demobilization Expenses', 'Manpower Total', 'C.7 Benefits & Others'])
  ck(t, app.indexOf('secHead("' + t + '"') >= 0);

console.log('\nand field labels do not:');
for (const t of ['Copy to shift:', 'Status Options'])
  ck(t + ' is left as a label', app.indexOf('secHead("' + t + '"') < 0,
    'a coloured dot in front of it reads as a status');

console.log('\nthe asides from the mockups are there:');
ck('the expense tables say how to add a charge',
  (app.match(/"Add each charge as a separate line item"/g) || []).length === 2);
ck('and C.7 names its basis', /Standard Philippine mandated formula/.test(app));

console.log('\ncards carry the spec chrome (DESIGN.md §3):');
ck('rounded-xl', /borderRadius: 10,/.test(con));
ck('and the theme shadow', /boxShadow: "var\(--card-shadow\)"/.test(con));
ck('on the card surface, which differs from the canvas in light mode',
  /background: "var\(--bg-surface-card\)"/.test(con));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nsection headers OK');
process.exit(bad ? 1 : 0);
