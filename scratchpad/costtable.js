/* Renders the SHIPPED costTable template out of src/App.js so the printed CE's
   summary can be looked at without signing in. The template is taken verbatim;
   only the values around it are stand-ins. */
const fs = require('fs');
const app = fs.readFileSync(__dirname + '/../src/App.js', 'utf8');

const a = app.indexOf('const costTable = `<table');
const b = app.indexOf('`;', app.indexOf('SERVICES TOTAL AMOUNT:', a));
const tpl = app.slice(a + 'const costTable = '.length, b + 1);

const fmt = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const MECH = [
  { letter: 'A.', label: 'MOBILIZATION', v: 10040.00, sub: null },
  { letter: 'B.', label: 'DEMOBILIZATION', v: 10040.00, sub: null },
  { letter: 'C.', label: 'MANPOWER COST', v: 103668.17, sub: null },
  { letter: 'D.', label: 'TOOLS AND EQUIPMENTS', v: 11658.00, sub: null },
  { letter: 'E.', label: 'MATERIALS AND CONSUMABLES', v: 18500.00, sub: null },
  { letter: 'F.', label: 'PERSONAL PROTECTIVE EQUIPMENT', v: 1865.50, sub: null },
  { letter: 'G.', label: 'MISCELLANEOUS', v: 19406.67, sub: [
    { letter: 'G.1', label: 'Accommodation', v: 19200.00 },
    { letter: 'G.2', label: 'Requirements', v: 206.67 }] }
];
/* The same CE on the Electrical sheet: manpower itemised by shift, the parts
   carrying the figures. */
const ELEC = MECH.map(r => r.label === 'MANPOWER COST' ? { ...r, sub: [
    { letter: 'C.1', label: 'REGULAR MANPOWER COST (DAY SHIFT)', v: 61200.00 },
    { letter: 'C.2', label: 'REGULAR MANPOWER COST (NIGHT SHIFT)', v: 18400.00 },
    { letter: 'C.3', label: 'SUNDAY & NON-WORKING MANPOWER COST (DAY SHIFT)', v: 7900.00 },
    { letter: 'C.4', label: 'BENEFITS & OTHERS', v: 16168.17 }] }
  : r.label === 'MISCELLANEOUS' ? { ...r, sub: r.sub.map(s => ({ ...s, label: s.label.toUpperCase() })) } : r);

const _br = { bar: '#1F3864', text: '#ffffff' };
const grand = 175178.34, showUnitP = false, unitLbl = '', unitP = 0, perJobT = 0, perJobLbl = '', margin = 0;
const hlRows = [{ label: '2 HVAC TECHNICIAN - MANPOWER', amt: 156678.34 }, { label: 'REFRIGERANT 10KG', amt: 8500 }];
const hlLabel = r => r.label, hlAmt = r => r.amt;
const servicesSummary = { on: false, ok: false, lines: [], other: 0, total: 0 };

const render = (costRows, ceLayout) => new Function('costRows', 'ceLayout', '_br', 'fmt', 'esc', 'grand',
  'showUnitP', 'unitLbl', 'unitP', 'perJobT', 'perJobLbl', 'margin', 'hlRows', 'hlLabel', 'hlAmt',
  'servicesSummary', 'return ' + tpl)
  (costRows, ceLayout, _br, fmt, esc, grand, showUnitP, unitLbl, unitP, perJobT, perJobLbl, margin,
   hlRows, hlLabel, hlAmt, servicesSummary);

fs.writeFileSync(__dirname + '/costtable.html',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
  'body{font-family:Calibri,Arial,sans-serif;font-size:8pt;padding:26px;background:#fff;color:#000}' +
  'table{border-collapse:collapse;width:640px}' +
  'th,td{border:1px solid #999;padding:2px 5px}' +
  '.c{text-align:center}.r{text-align:right}.b{font-weight:bold}' +
  '.tot{background:#f2f2f2}' +
  'h3{font:700 11px sans-serif;color:#555;margin:22px 0 10px}h3:first-child{margin-top:0}' +
  '</style></head><body>' +
  '<h3>MECHANICAL SHEET &mdash; the section carries its figure, the parts sit beside it</h3>' +
  render(MECH, { parentCarries: true, breaks: ['misc'] }) +
  '<h3>ELECTRICAL SHEET (SY3-F-ACF-009) &mdash; the parts carry the figures, the section line is blank</h3>' +
  render(ELEC, { parentCarries: false, breaks: ['mp', 'misc'] }) +
  '</body></html>');
console.log('wrote scratchpad/costtable.html');
