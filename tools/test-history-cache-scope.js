/* A cached history is one key for the whole browser, so a non-admin must never
   be shown it unfiltered. Run: node tools/test-history-cache-scope.js */
'use strict';
const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const i = app.indexOf('} else if (spAvail && h && h.length === 0) {');
const seg = app.slice(i, app.indexOf('setHistory(effective);', i));
ck('the empty-result fallback filters the cache for non-admins',
  seg.indexOf('canSeeAll ? _c : _c.filter(') > 0 && seg.indexOf('mineToSee(x.id)') > 0);
ck('and no longer assigns the raw cache', seg.indexOf("effective = LS.get('history') || []") < 0);
console.log(bad ? bad + ' FAILURE(S)' : 'history cache scope OK');
process.exit(bad ? 1 : 0);
