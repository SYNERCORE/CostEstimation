#!/usr/bin/env node
/* Sync UOM on Tools, Materials and PPE: units follow the Masterlist, costs do not move.
   Run: node tools/test-sync-uom.js */
'use strict';
const src = require('fs').readFileSync('src/components/ResTab.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const blk = (src.match(/"↺ Sync Rates"\), \/\*#__PURE__\*\/React\.createElement\("button", \{[\s\S]*?\}, "↺ Sync UOM"\)/) || [''])[0];
ck('the button sits beside Sync Rates in the shared table', !!blk);
ck('only the unit is changed', /\{\.\.\.r, uom: m\.uom\}/.test(blk) && !/cost:/.test(blk));
ck('rows not on the Masterlist, or with no unit there, are left alone', /m && m\.uom && m\.uom !== r\.uom/.test(blk));
console.log('\nadd to Masterlist from the CE:');
const app = require('fs').readFileSync('src/App.js', 'utf8');
ck('a row the Masterlist lacks offers to add itself', /addToML && !_mlHas\(r\) && /.test(src));
ck('and the header adds them all at once', /_newRows\.length > 0 && /.test(src));
ck('Tools, Materials and PPE are each wired to their own section',
  ['tools', 'materials', 'ppe'].every(t => app.includes("addToML: list => addRowsToML('" + t + "', list),")));
ck('an item already there is never added twice', /if \(!d \|\| have\.has\(k\)\) return;/.test(app));
ck('it asks first, since everyone shares the list', /confirm\('Add ' \+ add\.length \+ ' item\(s\) to the shared Masterlist\?/.test(app));
ck('it goes through the normal Masterlist save and is logged', /saveML\(\{ \.\.\.masterlist, \[tab\]: \[\.\.\.add, \.\.\.cur\] \}\);/.test(app) && /auditLog\('masterlist_add_from_ce'/.test(app));

console.log(bad ?'\n' + bad + ' FAILURE(S)' : '\nsync UOM OK');
process.exit(bad ? 1 : 0);
