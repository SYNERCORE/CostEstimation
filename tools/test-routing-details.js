/* Routing a CE for approval first asks you to check the printed header, and the days must say what they cover.
   Run: node tools/test-routing-details.js */
'use strict';
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const apv = rd('src/approval.js'), app = require('./lib/appsrc').plus(rd('src/App.js')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = apv.indexOf('function apvDetailsText(');
ck('apvDetailsText is in approval.js', a > 0);
const f = new Function('daysPrinted', apv.slice(a) + '\nreturn apvDetailsText;')(i => i.days + ' DAYS' + (i.daysNote ? ' (NOTE)' : ''));
const t = f({ ceNum: 'SHIC-CE-2026-1270B', projType: 'MECHANICAL', client: 'SLPGC', description: 'Inspection', location: 'Calaca', qty: '1', days: '10', daysNote: 'excl-md' }, { ceTypeLabel: 'Onsite', rceNo: 'RCE-1', qtyUom: 'LOT' });
ck('the header fields read as printed', t[0] === 'CE No.: SHIC-CE-2026-1270B' && t.includes('Client: SLPGC') && t.includes('Quantity: 1 LOT') && t.includes('RCE No.: RCE-1') && t.includes('CE type: Onsite'));
ck('the days line carries the note', t[t.length - 1] === 'No. of days: 10 DAYS (NOTE)');
ck('a blank field shows a dash, not nothing', f({}, {}).includes('Client: \u2014') && f({}, {}).includes('No. of days: \u2014'));
const s = app.indexOf('const apvSubmit = async'), e = app.indexOf('const apvWithdraw');
const fn = app.slice(s, e);
ck('with no days note it asks what the days cover and stops', fn.includes('if (!info.daysNote) {') && fn.includes('What do the ') && fn.includes('DAYS_NOTES.filter(x => x[0])') && fn.includes("setInfo(p => ({...p, daysNote: f[0]}))"));
ck('Go back on that question submits nothing', fn.includes('if (!f) return;'));
ck('the details are shown and confirmed before the routing notice and before anything is saved', fn.indexOf('Details are correct') > 0 && fn.indexOf('Details are correct') < fn.indexOf('apvRoutingNotice(') && fn.indexOf('Details are correct') < fn.indexOf('apvPersist(apv'));
ck('Go back on the details submits nothing', fn.includes("cancel: 'Go back', danger: false})) return;"));
process.exit(bad ? 1 : 0);
