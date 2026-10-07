/* Refresh sits in the top bar, in one colour that says how sync stands; the strip keeps its own copy.
   Run: node tools/test-top-refresh-button.js */
'use strict';
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const w = rd('src/widgets.js'), app = require('./lib/appsrc').plus(rd('src/App.js'));
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('widgets.js parses', (() => { try { new Function(w); return true; } catch (e) { console.log(e.message); return false; } })());
ck('one refresh action, shared', w.indexOf('async function shicRefreshAll()') > 0 && w.indexOf('onClick: shicRefreshAll,\n      title: \'Refresh all from SharePoint\'') > 0);
ck('the strip no longer holds its own copy of the action', (w.match(/All data refreshed from SharePoint/g) || []).length === 1);
ck('a top-bar button exists and uses the same action', w.indexOf('function TopRefreshButton()') > 0 && w.indexOf('onClick: shicRefreshAll, disabled: busy') > 0);
ck('it says syncing, failed, this device only, or just Refresh', ["'Syncing", "'Sync failed - retry'", "'This device only - refresh'", "'Refresh'"].every(k => w.indexOf(k) > 0));
ck('the top bar draws it before + New', app.indexOf('React.createElement(TopRefreshButton, null)') > 0 && app.indexOf('React.createElement(TopRefreshButton, null)') < app.indexOf('title: "New CE (Ctrl+N)"'));
process.exit(bad ? 1 : 0);
