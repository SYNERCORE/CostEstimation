#!/usr/bin/env node
/*
 * The financial rail at the proportion DESIGN.md section 4 asks for.
 *
 * The rail existed at a fixed 184px. The spec wants roughly 28%, and the
 * mockup's richer rail -- the grand-total card, quick rates two across -- only
 * works at that width.
 *
 * This is the one structural change in the series, so the things that matter
 * are the bounds and the fallback: a proportion with no floor cannot hold a
 * peso figure on a small laptop, one with no ceiling takes half an ultrawide
 * for six numbers, and one with no stacking rule squeezes a twelve-column CE
 * table to keep a summary beside it.
 *
 * Run: node tools/test-financial-rail.js
 */
'use strict';
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const rail = (html.match(/\.shic-rail \{[\s\S]*?\n\}/) || [''])[0];
const media = (html.match(/@media \(max-width: 1100px\) \{[\s\S]*?\n  \}\n\}/) || [''])[0];

console.log('the rail is a proportion, bounded both ways:');
ck('28% per DESIGN.md §4', /width: clamp\(260px, 28%, 420px\)/.test(rail), rail.slice(0, 80));
ck('with a floor', /clamp\(260px/.test(rail), 'below it a peso figure wraps');
ck('and a ceiling', /, 420px\)/.test(rail), 'above it an ultrawide gives six numbers half the screen');
ck('the fixed 184px is gone', !/width: 184,/.test(app));

console.log('\nit sticks beside the work, from the right offset:');
ck('sticky', /position: sticky/.test(rail));
ck('below the whole header stack', /top: var\(--y-body\)/.test(rail),
  'a hardcoded 96 would drift the moment another bar is added');
ck('and is exactly as tall as what is left', /height: calc\(100vh - var\(--y-body\)\)/.test(rail));
ck('scrolling on its own', /overflow-y: auto/.test(rail));

console.log('\nand on a narrow window it stacks rather than squeezing:');
ck('there is a breakpoint', media.length > 40);
ck('the workspace turns into a column', /flex-direction: column/.test(media));
ck('the rail takes the full width', /width: 100%/.test(media));
ck('it stops being sticky', /position: static/.test(media),
  'a pane that follows the scroll is only useful next to something');
ck('and its left border becomes a top one',
  /border-left: none/.test(media) && /border-top: 1px solid var\(--border-subtle\)/.test(media));

console.log('\nthe grand total is the card §5.4 describes:');
ck('on the theme gradient', /background: 'var\(--highlight-gradient\)'/.test(app));
ck('ringed in the accent', /border: `1px solid \$\{alpha\(ACC, '44'\)\}`/.test(app));
ck('with the amber total', /fontWeight: 800,[\s\S]{0,120}color: ACC/.test(app));
ck('at the §3 display size', /fontSize: 'clamp\(18px, 2\.2vw, 28px\)'/.test(app),
  '28px flat overflows a nine-figure total in a 260px rail');
ck('and the unit rate under it', /"Unit rate: \\u20b1"|"Unit rate: ₱"/.test(fs.readFileSync('src/App.js', 'utf8')));

console.log('\nquick rates are two across, with their full names:');
ck('a grid, not a stacked list', /gridTemplateColumns: 'repeat\(auto-fit, minmax\(108px, 1fr\)\)'/.test(app));
ck('the role is no longer cut to one word', !/r\.role\.split\(' '\)\[0\]/.test(app),
  '"Lead Electrical" and "Electrician" both became "Lead" and "Electrician" at 184px');
ck('the full name is still reachable when it does not fit', /title: r\.role/.test(app));
ck('and the rate reads as a daily one', /"\/day"/.test(app));

console.log('\nnothing about the rail decides anything:');
ck('the totals are still the ones passed in',
  /\['Manpower', mpTot\], \['Tools', toolsT\], \['Materials', matsT\], \['PPE', ppeT\], \['Misc\.', miscT\]/.test(app),
  'the rail reports; it does not compute');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nfinancial rail OK');
process.exit(bad ? 1 : 0);
