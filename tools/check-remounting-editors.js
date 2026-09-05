#!/usr/bin/env node
/*
 * A component declared inside App must not hold hooks AND be rendered as a
 * component.
 *
 * `const MlEditor = () => {...}` inside App is a NEW function identity on every
 * App render. React compares element types by identity, so it unmounts the old
 * subtree and mounts a fresh one every single time App re-renders. Anything the
 * component held in useState went back to its default, and the focused input
 * ceased to exist.
 *
 * On the Masterlist tab that meant: typing one character called setMasterlist,
 * which re-rendered App, which remounted the editor -- so the field lost focus
 * after each keystroke, and mlTab reset, throwing you back to Manpower while
 * editing Tools.
 *
 * Two ways out, and either is fine:
 *   - hoist the state into App and call the function directly -- MlEditor() --
 *     so its output is part of App's own tree and nothing remounts
 *   - move the component to module scope, outside App, where its identity is
 *     stable
 *
 * What is NOT fine is the combination this checks for.
 *
 * "Holds hooks" is not the only reason to care. A remount destroys DOM state
 * as well: autoFocus fires again, and an uncontrolled input loses what was
 * typed into it. HistPanel had no hooks at all and still made CE Monitoring
 * unusable to edit -- every cell change remounted the panel, and its autoFocus
 * put the caret back in the search box.
 *
 * Run: node tools/check-remounting-editors.js
 */
'use strict';

const fs = require('fs');
const src = fs.readFileSync('src/App.js', 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

const appAt = src.indexOf('function App({');

/* Any component declared inside App, at ANY depth. ResEditor sat two levels
   down, inside ScopeLibraryEditor, and a check that only looked at App's own
   indentation walked straight past the one that ate keystrokes. */
const decls = [];
/* Both shapes. This used to require `=> {`, so an expression-bodied component
   -- `const HistPanel = () => React.createElement(...)`, no braces -- was
   never scanned at all. That is the one that shipped: the whole CE Monitoring
   panel, remounting on every App render. */
for (const m of src.matchAll(/\n(\s+)const ([A-Z][A-Za-z0-9_]*) = \(([^)]*)\) => (\{|\/\*#__PURE__\*\/React\.createElement)/g)) {
  if (m.index < appAt) continue;
  const indent = m[1].replace(/\n/g, '');
  /* A block body ends at the first line closing at the same indentation. An
     expression body runs to the next declaration at that indentation. */
  const end = m[4] === '{'
    ? src.indexOf('\n' + indent + '};', m.index)
    : src.indexOf('\n' + indent + 'const ', m.index + 10);
  decls.push({name: m[2], depth: indent.length, body: src.slice(m.index, end === -1 ? src.length : end)});
}

console.log('components declared inside App:');
if (!decls.length) console.log('  (none)');

for (const d of decls) {
  const hooks = (d.body.match(/use(?:State|Ref|Memo|Effect|Callback)\s*\(/g) || []).length;
  /* Rendered as a component -- React.createElement(Name, ...) -- rather than
     called as a plain function, Name(). */
  const asComponent = new RegExp('React\\.createElement\\(' + d.name + '\\b').test(src);
  /* Hooks were the only thing checked for, and a component with none read as
     safe. It is not: a remount destroys DOM state too. autoFocus fires again
     on every mount, and an uncontrolled input -- defaultValue, no value --
     loses whatever was typed into it and reverts to its default.

     That is exactly what shipped. HistPanel holds no hooks, one autoFocus and
     nine defaultValue inputs, so editing any cell in CE Monitoring remounted
     the panel and threw the caret back into the search box. */
  const dom = (d.body.match(/\bautoFocus\b/g) || []).length + (d.body.match(/\bdefaultValue:/g) || []).length;
  const risky = hooks > 0 || dom > 0;
  ck(d.name + ' (depth ' + d.depth + '): ' + hooks + ' hook(s), ' + dom +
     ' uncontrolled/focus prop(s), rendered as ' + (asComponent ? 'a component' : 'a function call'),
    !(risky && asComponent),
    'a new identity every App render remounts it: state resets, the caret is destroyed and half-typed inputs revert');
}

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nno remounting editors');
process.exit(fails ? 1 : 0);
