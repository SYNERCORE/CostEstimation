#!/usr/bin/env node
/* RCE No. on the printed CE; the Quantity carries its own unit; SIL and ECC
   are two columns, adding up to what the one column said.
   Run: node tools/test-rce-uom-sil.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('RCE No. is read from the CE, then Monitoring', app.includes("const rceNo = String(info.rceNo || (openCeId != null ? (monData[openCeId] || {}).rceNo : '') || '').trim();"));
ck('and printed beside the CE No. when there is one', app.includes("${rceNo ? '<b>RCE No.:</b>&nbsp;' + esc(rceNo)"));
ck('typed on Project Info it reaches Monitoring too', app.includes("className: 'info-rce'") && app.includes("updateMon(openCeId, 'rceNo', v)"));
ck('Quantity has a unit, LOT unless chosen', app.includes("const qtyUom = String(info.qtyUom || 'LOT')") && app.includes("className: 'qty-uom'"));
ck('and the printed CE and exports use it', !app.includes("} LOT</td>") && !app.includes("+ ' LOT')") && app.includes('${esc(info.qty||1)} ${esc(qtyUom)}'));
ck('SIL and ECC are separate columns on screen', app.includes('}, "SIL"),') && app.includes('}, "ECC"),') && !app.includes('}, "SIL & ECC")'));
ck('the group row splits them', app.includes('cell(g.sil - (g.ecc || 0)), cell(g.ecc || 0),'));
ck('on the printed C.7', app.includes('<th class="r">SIL</th><th class="r">ECC</th>') && app.includes('${fmt(r.sil-(r.ecc||0))}</td><td class="r">${fmt(r.ecc||0)}'));
ck('and in the detailed export', app.includes("'HDMF & PHIC', 'SIL', 'ECC', ..._inc, 'TOTAL'"));
ck('the printed totals still span the table', app.includes('colspan="${incOn?9:8}" class="r b">BENEFITS') && app.includes('colspan="${incOn?12:11}" class="r b">TOTAL MANPOWER COST'));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nRCE, UOM, SIL/ECC OK'); process.exit(bad ? 1 : 0);
