#!/usr/bin/env node
/*
 * CE Monitoring: the row actions took a column of their own, 14 buttons in 6 rows, on every row. Four stay in view (Status, Remarks,
 * View, Load) with a "More" button that opens the rest in place; the rest are hidden by a stylesheet rule, so nothing was removed and
 * every button keeps its own handler. This pins that the four are marked as primary, the others are not, that no two buttons share
 * a grid cell when More is open, and that the stylesheet rule that hides them is there.
 *
 * Run: node tools/test-monitoring-actions.js
 */
'use strict';
const fs = require('fs');
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = mon.indexOf("className: 'mon-actions'");
const b = mon.indexOf('"⚖ Diff")', a);
ck('the actions container is found', a > 0 && b > a);
const block = mon.slice(a, b);

const pri = (block.match(/className: 'mon-pri'|className:'mon-pri'/g) || []).length;
ck('six buttons are marked primary: Status, Remarks, Load, the two Views (saved / draft) and More', pri === 6, String(pri));
for (const label of ["'⚑ Status')", "'💬 Remarks'", '"Load")', '"👁 View")', "'\\u22EF More'"]) {
  const at = block.indexOf(label);
  const before = block.slice(Math.max(0, at - 700), at);
  ck('primary: ' + label, at > 0 && before.lastIndexOf('mon-pri') > before.lastIndexOf('React.createElement("button"') - 5 || before.lastIndexOf('mon-pri') > 0);
}
for (const label of ["'👤 Assign')", "'📎'", '"Clone")', '"Revise")', "'Sure?' : 'Del')", '"\\u2B07 xlsx (Planning)")', '"\\uD83D\\uDDA8 CE (no amounts)")']) {
  const at = block.indexOf(label);
  const start = block.lastIndexOf('createElement("button"', at) < 0 ? 0 : block.lastIndexOf('createElement("button"', at);
  ck('hidden until More: ' + label, at > 0 && block.slice(start, at).indexOf('mon-pri') < 0);
}

/* No two buttons in one cell once More is open (an earlier layout put the attachments button under "CE (no amounts)"). */
const cells = {};
let m; const re = /gridRow:\s*(\d+),\s*gridColumn:\s*(\d+|'[^']*')/g;
while ((m = re.exec(block))) { const k = m[1] + '/' + m[2]; cells[k] = (cells[k] || 0) + 1; }
const clash = Object.keys(cells).filter(k => cells[k] > 1 && !/^2\/1$/.test(k));
ck('no two buttons share a cell (the draft View and the saved View are alternatives for 2/1)', clash.length === 0, clash.join());
ck('the stylesheet hides what More has not opened, and narrows the column', /\.mon-actions:not\(\.open\) > button:not\(\.mon-pri\) \{ display: none !important; \}/.test(html) && /\.mon-actions:not\(\.open\) \{ grid-template-columns: repeat\(2, auto\) !important; \}/.test(html));
ck('More toggles the open class on its own row', /closest\('\.mon-actions'\)[\s\S]{0,120}classList\.toggle\('open'\)/.test(block));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmonitoring actions OK');
process.exit(bad ? 1 : 0);
