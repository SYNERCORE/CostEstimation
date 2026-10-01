/* The "header written, rows were not" guard in handleLoad must not refuse a CE
   whose cost lives in Mobilization or Miscellaneous. Run: node tools/test-load-guard-rows.js */
'use strict';
const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('const _arr = v => Array.isArray(v)');
const src = app.slice(a, app.indexOf(';', app.indexOf('_arr(d.misc[k])', a)) + 1);
const count = d => new Function('d', src + '; return _rowCount;')(d);
ck('a CE with only a third-party rental under Miscellaneous counts as having rows',
  count({ grand: 1e6, misc: { thirdParty: [{ cost: 1e6 }] } }) === 1);
ck('so does one with only mobilisation', count({ grand: 5, mobVehicles: [{}], demobVehicles: [{}] }) === 2);
ck('a CE with a total and genuinely nothing is still caught', count({ grand: 5, mp: [], tools: [], misc: {} }) === 0);
ck('and a CE missing every field does not throw', count({}) === 0);
ck('the guard still refuses when there are no rows at all',
  app.indexOf('if (!_rowCount && N(d.grand) > 0) {') > 0);
console.log(bad ? bad + ' FAILURE(S)' : 'load guard rows OK');
process.exit(bad ? 1 : 0);
