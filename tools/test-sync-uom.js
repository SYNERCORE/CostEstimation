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
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nsync UOM OK');
process.exit(bad ? 1 : 0);
