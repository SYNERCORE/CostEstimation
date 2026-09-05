#!/usr/bin/env node
/*
 * Editing a cell in CE Monitoring must not throw the caret into the search box.
 *
 * Two bugs, and it took both to make the tab unusable.
 *
 * HistPanel is declared inside App and was rendered as a component, so it took
 * a fresh function identity on every App render and React remounted the whole
 * panel each time. It holds no hooks, which is why check-remounting-editors
 * passed it -- but a remount destroys DOM state too, and the panel holds nine
 * uncontrolled inputs and a search box.
 *
 * And that search box carried autoFocus, which fires on every mount. So every
 * edit to any cell re-mounted the panel and put the caret back at the top of
 * the page.
 *
 * Run: node tools/test-monitoring-focus.js
 */
'use strict';
const fs = require('fs');
const raw = fs.readFileSync('src/App.js', 'utf8');
const guard = fs.readFileSync('tools/check-remounting-editors.js', 'utf8');

/* Comments explaining these rules mention the very strings being searched for.
   Reading them as code is how a fix gets marked broken by its own note. */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const i = src.indexOf('const HistPanel = () =>');
const panel = i < 0 ? '' : src.slice(i, src.indexOf('\n  const ', i + 20));
ck('HistPanel found', panel.length > 1000, String(panel.length));

console.log('\nthe panel is not remounted on every App render:');
ck('it is invoked, not rendered as an element', /tab === 'history' && HistPanel\(\)/.test(src));
ck('and nothing creates an element from it', !/React\.createElement\(HistPanel\b/.test(src),
  'declared inside App, it takes a new identity every render and React remounts the subtree');

console.log('\nthe search box does not grab the caret:');
ck('no autoFocus on it', !/autoFocus\s*:/.test(panel),
  'autoFocus fires on every mount, so a remounting panel steals focus on every edit');
ck('the box is still there and still controlled',
  /placeholder: "Search CE#, client, customer\.\.\.",/.test(panel) && /value: monSearch,/.test(panel),
  'the fix is to stop it stealing focus, not to remove the search');

console.log('\nand the cells it holds survive a re-render:');
ck('the panel has uncontrolled inputs worth protecting',
  (panel.match(/defaultValue\s*:/g) || []).length >= 9,
  'a remount reverts each of these to its default, losing whatever was typed');

console.log('\nautoFocus that remains is on things that open on demand:');
const rest = src.slice(0, i) + src.slice(i + panel.length);
for (const m of rest.matchAll(/autoFocus\s*:/g)) {
  const near = rest.slice(Math.max(0, m.index - 900), m.index);
  ck('an autoFocus at ' + m.index + ' sits in a modal or picker',
    /Picker|modal|Modal|selProv|position: 'fixed'/.test(near),
    'autofocusing something always on screen takes the caret from wherever the person meant to be');
}

console.log('\nthe guard would catch this shape now:');
ck('it scans expression-bodied components too',
  /\(\\\{\|\\\/\\\*#__PURE__\\\*\\\/React\\\.createElement\)/.test(guard) ||
  /React\\\.createElement\)/.test(guard),
  'it required `=> {`, so HistPanel was never scanned at all');
ck('and a component with no hooks is no longer assumed safe',
  /const dom = /.test(guard) && /autoFocus/.test(guard) && /defaultValue:/.test(guard),
  'hooks are not the only thing a remount destroys');
ck('the failure message says what is actually lost',
  /the caret is destroyed and half-typed inputs revert/.test(guard));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmonitoring focus OK');
process.exit(bad ? 1 : 0);
