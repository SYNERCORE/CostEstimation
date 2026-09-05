#!/usr/bin/env node
/*
 * Executive Light / Dark Slate, per DESIGN.md sections 2 and 5.1.
 *
 * The app was dark and only dark: every colour was a fixed hex, so there was
 * nothing a theme could change. The constants now read CSS variables, which
 * index.html redefines under [data-theme="light"].
 *
 * The trap in that change is transparency. The codebase said ACC + '22' to
 * mean "the accent at 13%", which works on #F0A429 and produces
 * "var(--brand-accent)22" the moment the constant is a variable -- not a
 * colour, so the browser drops the declaration and the tint vanishes with
 * nothing in the console. Every one of those sites had to become alpha().
 *
 * Run: node tools/test-theme.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const con = fs.readFileSync('src/constants.js', 'utf8');
const w = fs.readFileSync('src/widgets.js', 'utf8');
const UI = ['src/App.js', 'src/widgets.js'].concat(
  fs.readdirSync('src/components').map(f => 'src/components/' + f));

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const VARS = ['--bg-canvas', '--bg-surface', '--bg-surface-elevated', '--bg-surface-card',
  '--bg-input', '--border-subtle', '--border-strong', '--text-primary', '--text-secondary',
  '--text-muted', '--brand-primary', '--brand-primary-hover', '--brand-accent',
  '--accent-cyan', '--status-success', '--status-warning', '--status-danger',
  '--card-shadow', '--highlight-gradient'];

const darkBlock = (html.match(/:root, \[data-theme="dark"\] \{[\s\S]*?\n\}/) || [''])[0];
const lightBlock = (html.match(/\[data-theme="light"\] \{[\s\S]*?\n\}/) || [''])[0];

console.log('both themes define the full palette (DESIGN.md §2):');
ck('a dark block exists', darkBlock.length > 100);
ck('a light block exists', lightBlock.length > 100);
for (const v of VARS) {
  const inD = darkBlock.indexOf(v + ':') >= 0, inL = lightBlock.indexOf(v + ':') >= 0;
  ck(v, inD && inL, (inD ? '' : 'missing from dark ') + (inL ? '' : 'missing from light'));
}
ck('and they differ, or the toggle would do nothing',
  darkBlock.indexOf('--bg-canvas: #060e20') >= 0 && lightBlock.indexOf('--bg-canvas: #f8fafc') >= 0);

console.log('\nthe constants read the variables, not fixed hex:');
for (const [name, v] of [['BG', 'bg-canvas'], ['CARD', 'bg-surface'], ['SURF', 'bg-surface-elevated'],
  ['BDR', 'border-subtle'], ['TX', 'text-primary'], ['MT', 'text-secondary'],
  ['ACC', 'brand-accent'], ['ERR', 'status-danger'], ['INFO', 'accent-cyan'], ['OK', 'status-success']])
  ck(name, new RegExp(name + ' = "var\\(--' + v + '\\)"').test(con));
ck('no fixed hex remains among them', !/const BG = "#/.test(con));

console.log('\ntransparency survives the change:');
const src = (con.match(/const alpha = \(color, hex\)[\s\S]*?\n\};/) || [''])[0];
ck('there is an alpha helper', src.length > 50);
const ctx = { Math, parseInt, String };
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._a=alpha;', ctx);
const A = ctx._a;
ck("'22' is about 13%", /13\.3%/.test(A('X', '22')), A('X', '22'));
ck("'88' is about 53%", /53\.3%/.test(A('X', '88')));
ck('it emits color-mix, which accepts a variable', /^color-mix\(in srgb, var\(--brand-accent\) /.test(A('var(--brand-accent)', '44')));
ck('and it is clamped', A('X', 'FF').indexOf('100%') > 0);

console.log('\nno concatenated alpha is left anywhere:');
const CONCAT = /\b(ACC|OK|ERR|INFO|MT|TX|BDR|SURF|CARD|BG)\s*\+\s*'[0-9A-Fa-f]{2}'|\$\{(ACC|OK|ERR|INFO|MT|TX|BDR|SURF|CARD|BG)\}[0-9A-Fa-f]{2}\b/;
for (const f of UI.concat(['src/constants.js'])) {
  const body = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ck(f, !CONCAT.test(body), 'var(--x)22 is not a colour: the browser drops it silently');
}

console.log('\nnothing readable is left stranded on the wrong canvas:');
for (const f of UI) {
  const live = fs.readFileSync(f, 'utf8').split('\n')
    .filter(l => !/printWin|<html|<!DOCTYPE|XLSX|fgColor|svg xmlns|data:image|theme-color/.test(l))
    .join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  /* The dark surfaces specifically: these would be a dark block on a light page. */
  const stranded = (live.match(/['"]#(0D1117|161B22|1C2128|21262D|E6EDF3|7D8590|A78BFA|8B5CF6)['"]/gi) || []);
  ck(f + ' has no stranded dark surface', stranded.length === 0, stranded.join(' '));
}

console.log('\ntext on the accent follows the theme:');
ck('there is an ON_ACC', /const ON_ACC = "var\(--on-accent\)"/.test(con));
ck('both themes define it', /--on-accent: #000000/.test(darkBlock) && /--on-accent: #ffffff/.test(lightBlock),
  'light-mode amber is dark enough that black on it fails contrast');
ck('the accent button uses it', /color: v === "acc" \? ON_ACC/.test(con));
ck('and no on-accent text is hardcoded black', !/background: ACC,\n\s+color: '#000'/.test(fs.readFileSync('src/App.js', 'utf8')));

console.log('\nthe switcher (DESIGN.md §5.1):');
ck('it exists', /function ThemeSwitch\(\)/.test(w));
ck('at module scope, so it is not remounted', /^function ThemeSwitch/m.test(w));
ck('it is a segmented pair, not a single toggle', /seg\('light', '☀', 'Executive Light'\), seg\('dark', '☽', 'Dark Slate'\)/.test(w));
ck('it writes the attribute the CSS keys off', /setAttribute\('data-theme', t\)/.test(w));
ck('it remembers the choice', /localStorage\.setItem\('shic:theme', t\)/.test(w));
ck('it moves the browser chrome too', /meta\[name="theme-color"\]/.test(w));
/* A theme-color is read by the browser chrome, which has no stylesheet to
   resolve var() against. The sweep that turned hex into variables reached
   this line once, and the address bar simply stopped changing. */
ck('with a literal colour, not a variable',
  /setAttribute\('content', t === 'light' \? '#f8fafc' : '#060e20'\)/.test(w));
ck('and the static default matches the dark canvas',
  /<meta name="theme-color" content="#060e20">/.test(html));
ck('and it is in the header', /React\.createElement\(ThemeSwitch, null\)/.test(fs.readFileSync('src/App.js', 'utf8')));

console.log('\nand the choice is applied before the first paint:');
ck('index.html reads it inline', /localStorage\.getItem\("shic:theme"\)/.test(html));
ck('ahead of every script tag', html.indexOf('shic:theme') < html.indexOf('src="./src/constants.js'),
  'applied after React mounts, a light-mode user sees a dark flash on every load');
ck('the root carries a default', /<html lang="en" data-theme="dark">/.test(html));

console.log('\ntypography per DESIGN.md §3:');
ck('Plus Jakarta Sans is loaded', /Plus\+Jakarta\+Sans/.test(html));
ck('and used as the body face', /font-family:'Plus Jakarta Sans'/.test(html));
ck('JetBrains Mono for figures', /JetBrains\+Mono/.test(html) && /JetBrains Mono/.test(con));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntheme OK');
process.exit(bad ? 1 : 0);
