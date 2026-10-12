#!/usr/bin/env node
/*
 * CE Monitoring "Export xlsx": the rows the list is showing (filters and sort apply), revisions included, drafts left out, in the import
 * template's columns -- and a date only where the record has its own. Runs the real export function. Run: node tools/test-monitoring-export.js
 */
'use strict';
const fs = require('fs');
const XLSX = require('../vendor/xlsx.full.min.js');
const src = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const m = src.match(/const exportMonXlsx = \(\) => \{[\s\S]*?\n  \};\n/);
ck('the export function exists', !!m);
ck('the button is wired to it and says Export xlsx', src.includes('onClick: exportMonXlsx') && src.includes(' Export xlsx"'));
if (m) {
  const sorted = [
    { id: 1, info: { ceNum: 'SHIC-CE-2026-0001', client: 'ACME', description: 'Overhaul', projType: 'Mechanical' }, _revs: [{ id: 2, info: { ceNum: 'SHIC-CE-2026-0001-R1' } }] },
    { id: 'd1', _draft: true, info: { ceNum: 'SHIC-CE-2026-0009' } },
    { id: 3, info: { ceNum: 'SHIC-CE-2026-0002' } }
  ];
  const mon = { 1: { status: 'Ongoing', dateRecv: '2026-10-05', ceeName: 'Ana', customer: 'ACME Inc', rceNo: 'RCE-1', remarks: 'r' }, 2: { status: 'Revised' }, 3: {} };
  let out = null, toast = null;
  const fn = new Function('sortedHistory', 'monOf', 'showToast', 'XLSX', m[0] + '\nreturn exportMonXlsx;')(sorted, e => mon[e.id] || {}, (t, e) => { toast = [t, e]; },
    { utils: XLSX.utils, writeFile: (wb, name) => { out = { wb, name }; } });
  fn();
  const rows = XLSX.utils.sheet_to_json(out.wb.Sheets['CE Monitoring'], { header: 1, defval: '' });
  ck('one header row plus the CE, its revision and the other CE (the draft is left out)', rows.length === 4 && !rows.some(r => String(r[0]).includes('0009')), JSON.stringify(rows.map(r => r[0])));
  ck('the columns are the import template\'s', rows[0].join('|') === 'CE No.|CE Name|Company Designation|Discipline|Customer|Job Title|Date Recieved|Deadline|Date Submitted|Status|Recieved By|Remarks|RCE No.');
  ck('values land in the right columns', rows[1][0] === 'SHIC-CE-2026-0001' && rows[1][1] === 'Ana' && rows[1][3] === 'Mechanical' && rows[1][4] === 'ACME Inc' && rows[1][5] === 'Overhaul' && rows[1][6] === '2026-10-05' && rows[1][9] === 'Ongoing' && rows[1][12] === 'RCE-1', JSON.stringify(rows[1]));
  ck('a CE with no received date of its own exports it blank (the save date is not invented)', rows[3][6] === '');
  ck('the file is dated and named', /^SHIC_CE_Monitoring_\d{4}-\d{2}-\d{2}\.xlsx$/.test(out.name) && /Exported 3 CE/.test(toast[0]));
  /* it reads back through the importer's header rule */
  const hn = h => h.toLowerCase().replace(/[\s.]+/g, '');
  ck('the headers are ones the importer recognises', ['daterecieved'].includes(hn(rows[0][6])) && hn(rows[0][0]) === 'ceno');
  fn.call(null);
  const empty = new Function('sortedHistory', 'monOf', 'showToast', 'XLSX', m[0] + '\nreturn exportMonXlsx;')([], () => ({}), (t, e) => { toast = [t, e]; }, { utils: XLSX.utils, writeFile() { throw new Error('should not write'); } });
  empty();
  ck('an empty list says so and writes no file', /Nothing to export/.test(toast[0]) && toast[1] === true);
}
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nMonitoring export OK');
process.exit(bad ? 1 : 0);
