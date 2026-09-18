#!/usr/bin/env node
/* Export Detailed: every total sits under its table's last column, label beside it,
   as the printed CE lays it out. Run: node tools/test-export-totals.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !x ? '' : '  -> ' + x)); if (!c) bad++; };
const src = (app.match(/        total: \(\.\.\.cells\) => \{[\s\S]*?\n        \},/) || [''])[0];
ck('the total builder is found', !!src);
const mk = w => { const rows = []; let inTable = true, width = w;
  const f = new Function('rows', 'inTable', 'width', 'return {' + src + '}.total;')(rows, inTable, width); return { rows, f }; };
const amt = v => ({ v, n: true });

let t = mk(8); t.f('', 'TOTAL:', '', '', '', '', amt(100));
let r = t.rows[0];
ck('tools with a POWER column: amount in the 8th column', r.length === 8 && r[7].v === 100 && r[7].s === 'tot', JSON.stringify(r));
ck('and the label spans up to it', r[1].v === 'TOTAL:' && r[1].span === 5);

t = mk(11); t.f('', 'MANPOWER COST TOTAL:', '', '', '', '', '', '', '', amt(5));
r = t.rows[0];
ck('under an 11-column benefits table the total is in column 11', r.length === 11 && r[10].v === 5);

t = mk(10); t.f('', 'SUB TOTAL:', 12, '', '', '', '', '', '', amt(9));
r = t.rows[0];
ck('a head count stays in QTY and is not stretched', r[2].v === 12 && !r[2].span && r[9].v === 9);

t = mk(6); t.f('', 'TOTAL:', '', '', '', amt(1));
ck('a row already the right width is unchanged in place', t.rows[0].length === 6 && t.rows[0][5].v === 1);
ck('the misc grand total is a total row', /a\.total\('', 'MISCELLANEOUS TOTAL:'/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nexport totals OK');
process.exit(bad ? 1 : 0);
