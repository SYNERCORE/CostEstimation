#!/usr/bin/env node
/* The unit price is labelled with the unit the quantity is counted in --
   "UNIT PRICE PER PCS" -- on the summary, the printed CE and both exports.
   Run: node tools/test-unit-price-uom.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

ck('the label names the unit, not the count',
  app.includes("const unitLbl = 'UNIT PRICE PER ' + (String(info.qtyUom || 'LOT').trim().toUpperCase() || 'LOT') +") &&
  !app.includes("'UNIT PRICE (qty '"));
ck('per-job costs still say they are left out', app.includes("(perJobT ? ' (excl. per-job costs)' : '') + ':';"));

/* One label, so the four places cannot drift apart. */
ck('the summary on screen uses it', app.includes("S(unitLbl, 'totlbl', 4)"));
ck('the printed CE uses it', app.includes('<td colspan="2" class="b r">${esc(unitLbl)}</td>'));
ck('the xlsx export uses it', app.includes("if (showUnitP) a.total('', unitLbl, a.money(unitP));"));

const m = app.match(/const unitLbl = [\s\S]{0,260}?':';/);
const fn = new Function('info', 'perJobT', (m ? m[0] : '') + '\nreturn unitLbl;');
ck('a CE quoted in pieces', fn({ qtyUom: 'pcs' }, 0) === 'UNIT PRICE PER PCS:');
ck('a CE with no unit chosen is still a lot', fn({}, 0) === 'UNIT PRICE PER LOT:');
ck('and per-job costs are flagged', fn({ qtyUom: 'SET' }, 5000) === 'UNIT PRICE PER SET (excl. per-job costs):');

/* The figure itself is unchanged: still the total, less per-job costs,
   divided by the quantity. */
ck('the unit price is still worked out the same way',
  app.includes('const unitP = (grand - perJobT) / (N(info.qty) || 1);'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nunit price label OK'); process.exit(bad ? 1 : 0);
