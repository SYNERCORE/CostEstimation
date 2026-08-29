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
for (const m of src.matchAll(/\n(\s+)const ([A-Z][A-Za-z0-9_]*) = \(([^)]*)\) => \{/g)) {
  if (m.index < appAt) continue;
  const indent = m[1].replace(/\n/g, '');
  /* The declaration ends at the first line closing at the same indentation. */
  const close = '\n' + indent + '};';
  const end = src.indexOf(close, m.index);
  decls.push({name: m[2], depth: indent.length, body: src.slice(m.index, end === -1 ? src.length : end)});
}

console.log('components declared inside App:');
if (!decls.length) console.log('  (none)');

for (const d of decls) {
  const hooks = (d.body.match(/use(?:State|Ref|Memo|Effect|Callback)\s*\(/g) || []).length;
  /* Rendered as a component -- React.createElement(Name, ...) -- rather than
     called as a plain function, Name(). */
  const asComponent = new RegExp('React\\.createElement\\(' + d.name + '\\b').test(src);
  ck(d.name + ' (depth ' + d.depth + '): ' + hooks + ' hook(s), rendered as ' + (asComponent ? 'a component' : 'a function call'),
    !(hooks > 0 && asComponent),
    'a new identity every App render remounts it: state resets and the focused input is destroyed');
}

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nno remounting editors');
process.exit(fails ? 1 : 0);
