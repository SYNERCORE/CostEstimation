#!/usr/bin/env node
/*
 * "Generate CE (no amounts)": the printed CE with every money figure left blank, to share the scope and quantities without the prices.
 * fmt is the one place a peso amount is written, so blanking it blanks them all; dropTotals removes the total, unit-price, margin and
 * highlighted-cost lines that would be labels with nothing beside them. This pins both, runs dropTotals on sample rows, and checks the
 * button on CE Monitoring, the print URL it opens, and that the normal Generate CE is untouched.
 *
 * Run: node tools/test-ce-no-amounts.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const out = R('src/components/CeOutput.js'), app = R('src/App.js'), sum = R('src/components/SummaryTab.js');
ck('the option is read from opt.noAmounts', /const noAmt = !!\(opt && opt\.noAmounts\)/.test(out));
ck('fmt returns nothing when it is on, and is unchanged when off', /const fmt = \(n, d = 2\) => noAmt \? '' : 'P' \+ N\(n\)\.toLocaleString/.test(out));
ck('the cost summary and the bills go through dropTotals', /\$\{dropTotals\(costTable\)\}/.test(out) && /const bills=dropTotals\(\[/.test(out));
ck('the highlighted-costs and services blocks are left out', /hlRows\.length && !noAmt/.test(out) && /servicesSummary\.ok && !noAmt/.test(out));

/* dropTotals, run on sample rows. */
const m = out.match(/const dropTotals = html => [\s\S]*?\n    \}\);/);
ck('dropTotals is found', !!m);
if (m) {
  const noAmt = true;
  const dropTotals = eval('(' + m[0].replace('const dropTotals = ', '').replace(/;$/, '') + ')');
  const t = rows => dropTotals(rows);
  ck('a TOTAL AMOUNT line is removed', t('<tr class="tot"><td colspan="2" class="b r">TOTAL AMOUNT:</td><td class="r b"></td></tr>') === '');
  ck('a unit price line is removed', t('<tr class="tot"><td colspan="2">UNIT PRICE:</td><td></td></tr>') === '');
  ck('a selling price / margin line is removed, even though it carries a percentage', t('<tr class="tot"><td>SELLING PRICE (+10% margin):</td><td></td></tr>') === '');
  ck('a total whose label only has a code range is removed', t('<tr class="tot"><td colspan="11">TOTAL MANPOWER COST (C.1-C.7):</td><td></td></tr>') === '');
  ck('a div total is removed', t('<div class="tot" style="text-align:right">MISCELLANEOUS TOTAL: </div>') === '');
  const keep = '<tr class="tot"><td colspan="2">SUB TOTAL:</td><td class="c b">5</td><td colspan="7"></td><td></td></tr>';
  ck('a sub total that counts people is kept', t(keep) === keep);
  const plain = '<tr><td>1</td><td>Pump</td><td class="r"></td></tr>';
  ck('an ordinary row is untouched', t(plain) === plain);
}
console.log('\nthe button is on CE Monitoring, not the Summary tab:');
const mon = R('src/components/MonitoringPanel.js');
ck('each CE row has a "CE (no amounts)" button that opens the CE for print as noamt', /openForPrint\(e\.id,'noamt'\)/.test(mon) && /CE \(no amounts\)/.test(mon));
ck('it is for saved CEs only, like the other print buttons', /typeof e\.id==='number'&&[^;]{0,60}createElement\("button",\{style:\{gridRow:3,gridColumn:3[\s\S]{0,200}noamt/.test(mon));
ck('the print URL accepts as=noamt', /_q\.get\('as'\) === 'noamt' \? 'noamt'/.test(app));
ck('and the opened CE is generated with noAmounts', /as === 'noamt'\) handleGenerateCE\(\{ noAmounts: true \}\)/.test(app));
ck('the Summary tab no longer has the button', !/no amounts/.test(sum) && !/handleGenerateCENoAmounts/.test(sum) && !/handleGenerateCENoAmounts/.test(app));
ck('the ordinary Generate CE is still the one with the zero-cost check', /const handleGenerateCEWithCheck = async \(\) => \{\s*if \(!await confirmZeroCost\('Proceed with generating CE\?'\)\) return;\s*handleGenerateCE\(\);/.test(app));


console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE without amounts OK');
process.exit(bad ? 1 : 0);
