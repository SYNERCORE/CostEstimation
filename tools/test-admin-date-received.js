#!/usr/bin/env node
/*
 * An admin can correct Date Recv. in CE Monitoring (Edit mode of the row): a date picker in the cell, saved as the monitoring record's
 * dateRecv -- the field the Dashboard's Monthly Trend groups by -- and written to the audit log with the old and new date. Nobody else
 * gets the picker, and an empty or unchanged value writes nothing.
 * Run: node tools/test-admin-date-received.js
 */
'use strict';
const fs = require('fs');
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const i = mon.indexOf("key: e.id + 'dateRecv'");
const seg = i > 0 ? mon.slice(i - 400, i + 900) : '';
ck('the date picker exists in the row', i > 0 && seg.includes('type: "date"'));
ck('only for an admin, and only while the row is in Edit mode', seg.includes('isAdmin && editingRow === e.id'));
ck('it saves to dateRecv through updateMon', seg.includes("updateMon(e.id, 'dateRecv', v)"));
ck('only a real, changed date is written (blank or unchanged is ignored)', seg.includes('if (v && v !== old)'));
ck('the change is audited with the old and new date', seg.includes("auditLog('change_date_received'") && seg.includes("(old || '(none)') + ' -> ' + v"));
ck('everyone else still sees the plain date', mon.includes('(m.dateRecv || dateRecv)), /*#__PURE__*/React.createElement("td", {'));
console.log(bad ? bad + ' FAILURE(S)' : 'Admin date received OK');
process.exit(bad ? 1 : 0);
