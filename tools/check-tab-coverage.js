#!/usr/bin/env node
/*
 * Every tab in CE_TABS must have a render branch in App.js.
 *
 * Why: a text splice that ended with "tab === 'scopelib' &&" silently ate the
 * rest of that line, which carried the branches for Scope Library, Masterlist
 * and CE Monitoring. The result was still valid JavaScript and a structurally
 * valid render tree — the three tabs simply rendered nothing, with no error in
 * the console. Nothing else in the suite could see it.
 *
 * Run: node tools/check-tab-coverage.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cfg = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src', 'App.js'), 'utf8');

const decl = cfg.match(/const CE_TABS\s*=\s*\[([\s\S]*?)\];/);
if (!decl) { console.error('CE_TABS not found in src/config.js'); process.exit(1); }

const tabs = [...decl[1].matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
if (!tabs.length) { console.error('CE_TABS parsed but no tab ids found'); process.exit(1); }
/* The admin tab is appended at runtime for admins, so check it too. */
tabs.push('admin');

const missing = [];
const empty = [];
for (const id of tabs) {
  const re = new RegExp("tab === '" + id + "'\\s*&&\\s*([\\s\\S]{0,80})");
  const m = app.match(re);
  if (!m) { missing.push(id); continue; }
  /* Guard against the exact failure above: the branch exists but the thing it
     renders was cut off, leaving it to fall through to an unrelated condition. */
  const after = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
  /* `Name()` counts too. An editor that holds state must be CALLED rather than
     rendered as a component, or App re-creating it every render remounts it --
     see check-remounting-editors.js. Both spellings render a tab. */
  if (!after || !/^(\(|React\.createElement|isAdmin|[A-Z][A-Za-z0-9_]*\()/.test(after))
    empty.push(id + '  ->  ' + JSON.stringify(after.slice(0, 50)));
}

if (missing.length || empty.length) {
  console.error('\nTabs that would render nothing:\n');
  missing.forEach(t => console.error('  ' + t + '  -  no `tab === \'' + t + '\'` branch in App.js at all'));
  empty.forEach(t => console.error('  ' + t + '  -  branch exists but renders nothing'));
  console.error('');
  process.exit(1);
}
console.log('tab coverage OK (' + tabs.length + ' tabs, all render something)');
