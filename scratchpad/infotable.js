/* Renders the SHIPPED infoTable header out of src/App.js, so the CE header can
   be looked at without signing in. Template verbatim; values are stand-ins. */
const fs = require('fs');
const app = fs.readFileSync(__dirname + '/../src/App.js', 'utf8');
const boxA = app.indexOf('const tickRow = (opts, chosen) =>');
const boxSrc = app.slice(boxA, app.indexOf('const infoTable = `<table', boxA));
const a = app.indexOf('const infoTable = `<table');
const b = app.indexOf('</table>`;', a) + '</table>`'.length;
const tpl = app.slice(a + 'const infoTable = '.length, b);

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CE_DISCIPLINES = ['Electrical', 'Mechanical', 'Civil', 'General'];
const CE_CFG = { onsite:{}, shopworks:{}, supply:{}, shopsite:{label:'Shop + Site'} };
const ceTypeLabel = k => (CE_CFG[k]||{}).label || (k==='shopworks'?'ShopWorks':k.charAt(0).toUpperCase()+k.slice(1));
const render = (info, ceType) => new Function('info', 'ceType', 'esc', 'qtyUom', 'CE_DISCIPLINES', 'CE_CFG', 'ceTypeLabel',
  boxSrc + '\n' + 'return ' + tpl)(info, ceType, esc, 'UNIT', CE_DISCIPLINES, CE_CFG, ceTypeLabel);

const withMat = {
  description: 'VALVE WELD REPAIR, NDT, PRE-HEAT WORKS FOR HR MOV 004B',
  client: 'SPPC', location: 'Barangays Dela Paz, Batangas City, Philippines',
  material: 'A217 Gr. C12A with Co-Cr-Mo-Ni & ASTM A335 P91',
  projType: 'Mechanical',
  attention: 'SALES DEPARTMENT', endUser: 'C/O SALES', qty: 1, days: 3 };
const without = { ...withMat, material: '', projType: 'Electrical' };

fs.writeFileSync(__dirname + '/infotable.html',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
  'body{font-family:Calibri,Arial,sans-serif;font-size:8pt;padding:26px;background:#fff;color:#000}' +
  'table{border-collapse:collapse;width:700px}td{border:1px solid #999;padding:2px 5px}' +
  '.b{font-weight:bold}.c{text-align:center}.nw{white-space:nowrap}' +
  'h3{font:700 11px sans-serif;color:#555;margin:22px 0 10px}h3:first-child{margin-top:0}' +
  '</style></head><body>' +
  '<h3>MECHANICAL / SHOPWORKS, WITH A MATERIAL &mdash; printed CE header</h3>' + render(withMat, 'shopworks') +
  '<h3>ELECTRICAL / ON-SITE, NO MATERIAL</h3>' + render(without, 'onsite') +
  '</body></html>');
console.log('wrote scratchpad/infotable.html');
