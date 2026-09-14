#!/usr/bin/env node
/*
 * A number box you can type a whole figure into.
 *
 * Every numeric cell in the editor was a controlled input that re-parsed its
 * own text on each keystroke -- `value: r.days` against
 * `parseInt(e.target.value) || 1`. React then wrote the parsed number back
 * into the box, so what had been typed was replaced as it was being typed:
 *
 *   typing "4.5"   the "." was deleted the moment it was typed, because
 *                  parseFloat('4.') is 4 -- a decimal could not be entered
 *   clearing       parseFloat('') is NaN, the `|| 1` caught it, and the box
 *                  snapped back to 1 before a new figure could be started
 *   min: 1         a half-typed number was pushed up to the minimum
 *
 * Which is why a figure had to be entered one character at a time, clicking
 * back into the box between each one.
 *
 * NumBox keeps the typed text in a buffer while the box has focus and parses
 * only on the way out. The MODEL still updates on every keystroke from
 * whatever parses so far -- the row total has to keep moving as you type --
 * so the buffer changes what the box shows, not when the CE is costed.
 *
 * Run: node tools/test-numbox.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = app.match(/function NumBox\(\{[\s\S]*?\n\}/);
if (!src) { console.error('NumBox not found in src/App.js'); process.exit(1); }

/* A React stub small enough to drive the component by hand: useState keeps its
   value between calls, and createElement just hands back the props so the
   handlers and the rendered `value` can be inspected. */
function mount(props) {
  let state = null;
  const React = {
    useState: init => [state === null ? (typeof init === 'function' ? init() : init) : state,
                       v => { state = v; }],
    createElement: (_tag, p) => p
  };
  const ctx = vm.createContext({React, console});
  vm.runInContext(src[0] + ';this.NumBox=NumBox;', ctx);
  const render = () => ctx.NumBox(props);
  return {
    render,
    /* One keystroke: the box now holds `text`. */
    type: text => { const el = render(); el.onChange({target: {value: text}}); },
    blur: text => { const el = render(); el.onBlur({target: {value: text}}); },
    shown: () => render().value
  };
}

const track = extra => {
  const committed = [];
  const box = mount({value: 1, onCommit: v => committed.push(v), ...(extra || {})});
  return {box, committed};
};

console.log('a decimal survives being typed:');
{
  const {box, committed} = track({value: 0, min: 0, step: 0.5});
  box.type('4');
  ck('after "4" the box shows 4', box.shown() === '4', String(box.shown()));
  box.type('4.');
  ck('after "4." the box still shows "4."', box.shown() === '4.', String(box.shown()),
    'this is the keystroke the old box threw away');
  box.type('4.5');
  ck('after "4.5" the box shows 4.5', box.shown() === '4.5', String(box.shown()));
  ck('and 4.5 reached the CE', committed[committed.length - 1] === 4.5, JSON.stringify(committed));
  ck('the total moved on every keystroke, not just at the end',
    JSON.stringify(committed) === JSON.stringify([4, 4, 4.5]),
    JSON.stringify(committed) + ' — "4." commits 4, so the row total is right while it is half typed');
}

console.log('\nclearing the box does not snap it back:');
{
  const {box, committed} = track({value: 5, min: 1, intOnly: true});
  box.type('');
  ck('the box is empty', box.shown() === '', JSON.stringify(box.shown()));
  ck('and nothing was committed', committed.length === 0,
    'the old one committed the minimum here, so the figure was back before it could be replaced');
  box.type('1');
  box.type('12');
  ck('a new figure types straight in', box.shown() === '12');
  ck('and lands as 12', committed[committed.length - 1] === 12, JSON.stringify(committed));
}

console.log('\nleaving the box settles whatever is in it:');
{
  const {box, committed} = track({value: 0, min: 0});
  box.blur('4.');
  ck('"4." settles as 4', committed[committed.length - 1] === 4, JSON.stringify(committed));
}
{
  const {box, committed} = track({value: 5, min: 1});
  box.type('');
  box.blur('');
  ck('an empty box falls back to the minimum', committed[committed.length - 1] === 1, JSON.stringify(committed));
}
{
  const {box, committed} = track({value: 5});
  box.blur('');
  ck('with no minimum it falls back to 0', committed[committed.length - 1] === 0, JSON.stringify(committed));
}

console.log('\nblank is kept where blank is a real answer:');
{
  const {box, committed} = track({value: 100, min: 0, allowBlank: true});
  box.type('');
  ck('an emptied box commits blank', committed[committed.length - 1] === '', JSON.stringify(committed));
  box.blur('');
  ck('and stays blank on the way out', committed[committed.length - 1] === '', JSON.stringify(committed));
}
ck('the unpriced-tool figures allow it',
  /onCommit: v => updML\(r\.id, k, v\),\s*\n\s*allowBlank: true/.test(app),
  'a tool with no unit price is not a tool that cost nothing');
ck('so does a service role with no days of its own',
  /min: 0, allowBlank: true, value: r\.days === undefined/.test(app),
  'blank there means the role runs the whole project');

console.log('\nthe limits are still enforced:');
{
  const {box, committed} = track({value: 5, min: 1, max: 10});
  box.type('99');
  ck('above the maximum is pulled down', committed[committed.length - 1] === 10, JSON.stringify(committed));
  box.type('0');
  ck('below the minimum is pushed up', committed[committed.length - 1] === 1, JSON.stringify(committed));
}
{
  const {box, committed} = track({value: 1, min: 1, intOnly: true});
  box.type('3.7');
  ck('a whole-number field stays whole', committed[committed.length - 1] === 3, JSON.stringify(committed));
}
{
  const {box, committed} = track({value: 1, min: 0});
  box.type('abc');
  ck('nonsense commits nothing', committed.length === 0, JSON.stringify(committed));
  ck('and is left on screen to be corrected', box.shown() === 'abc', String(box.shown()));
}

console.log('\nthe value shown follows the CE when the box is not being typed in:');
{
  const box = mount({value: 7, onCommit: () => {}});
  ck('it shows what the row holds', box.shown() === '7', String(box.shown()));
  const blank = mount({value: '', onCommit: () => {}});
  ck('a blank row shows blank, not 0', blank.shown() === '', JSON.stringify(blank.shown()));
  const zero = mount({value: 0, onCommit: () => {}});
  ck('a zero shows 0', zero.shown() === '0', JSON.stringify(zero.shown()));
}

console.log('\nevery editor number cell goes through it:');
ck('no numeric cell re-parses its own text any more',
  !/onChange: e => \w+\([^)]*parse(Float|Int)\(e\.target\.value\)/.test(app),
  'one left behind is one box that still eats the decimal point');
const n = (app.match(/React\.createElement\(NumBox, \{/g) || []).length;
ck('there are ' + n + ' of them', n >= 12, String(n));
ck('NumBox is declared at module scope, not inside App',
  /^function NumBox\(/m.test(app),
  'declared inside App it would take a new identity every render, and React would remount it on every keystroke -- the very fault it exists to fix');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nNumBox OK');
process.exit(bad ? 1 : 0);
