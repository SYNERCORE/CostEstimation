#!/usr/bin/env node
/* A Monitoring edit reaches SharePoint as ONE write. Two writes in the same
   tick each read the row, add their own field and patch it back, so the one
   that lands second carries the row from before the first and the first
   field is lost -- which is how a status change failed to reach the site.
   Run: node tools/test-mon-one-write.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

ck('one edit may carry several fields',
  app.includes("const fields = (field && typeof field === 'object') ? field : { [field]: val };") &&
  app.includes('const changed = [...Object.keys(fields), ...Object.keys(extra)];'));

/* Every place that used to write twice in a row. */
ck('the status panel sends the status and its date together',
  app.includes('if (Object.keys(_w).length) updateMon(statusPanel, _w);') &&
  !app.includes("updateMon(statusPanel, 'status', _d.status)"));
ck('signing sends the approval and the status it implies together',
  app.includes('apv: apvMirror(full.approvers, apv),') &&
  app.includes(": apv.state === 'approved' ? { status: 'Approved' } : {})"));
ck('submitting for approval does too',
  app.includes("apv: apvMirror(e.approvers, apv),") && app.includes("? { status: 'For Approval' } : {})"));
ck('saving a CE seeds both in one write', app.includes('if (Object.keys(_w).length) updateMon(saved.id, _w);'));
ck('and a superseded revision closes in one write',
  app.includes("...(closeApv ? { apv: {...a, state: 'superseded'") && app.includes("...(setStatus ? { status: 'Superseded' } : {})"));

/* Everything from the first line of the edit down to the row it builds --
   the part that decides what is stamped and what is written. */
const start = app.indexOf("const fields = (field && typeof field === 'object')");
const stop = app.indexOf('    try {', start);
ck('the stamping rule is in one piece', start > 0 && stop > start);
const run = new Function('field', 'val', 'prev', 'ceId', 'currentUser',
  app.slice(start, stop) + '\n  return { fields, extra, n };');
const me = { name: 'Jhuniel' };

let r = run('status', 'Submitted', { 7: { status: 'For Approval' } }, 7, me);
ck('a status change is stamped with who and when', r.extra.statusChangedBy === 'Jhuniel' && !!r.extra.statusChangedAt);
ck('and joins the trail, saying where it came from',
  r.extra.statusLog.length === 1 && r.extra.statusLog[0].status === 'Submitted' && r.extra.statusLog[0].from === 'For Approval');

r = run({ status: 'Submitted', statusChangedAt: '2026-09-01T12:00:00.000Z' }, undefined, { 7: { status: 'Draft' } }, 7, me);
ck('a date sent with the status is the date it happened, not today',
  r.extra.statusChangedAt === '2026-09-01T12:00:00.000Z' && r.extra.statusLog[0].at === '2026-09-01T12:00:00.000Z');
ck('and both fields land on the row', r.n[7].status === 'Submitted' && r.n[7].statusChangedAt === '2026-09-01T12:00:00.000Z');

r = run({ statusChangedAt: '2026-08-08T12:00:00.000Z' }, undefined,
  { 7: { status: 'Approved', statusLog: [{ status: 'Draft', at: 'x' }, { status: 'Approved', at: 'y' }] } }, 7, me);
ck('correcting the date alone corrects the last entry in the trail',
  r.extra.statusLog[1].at === '2026-08-08T12:00:00.000Z' && r.extra.statusLog[0].at === 'x');

r = run({ apv: { state: 'superseded' }, status: 'Superseded' }, undefined, { 7: { status: 'For Approval' } }, 7, me);
ck('an approval and a status written together both land',
  r.n[7].apv.state === 'superseded' && r.n[7].status === 'Superseded');
ck('and SharePoint is told both fields changed',
  ['apv', 'status'].every(k => Object.prototype.hasOwnProperty.call(r.fields, k)));

r = run('status', '', { 7: { status: 'Draft' } }, 7, me);
ck('clearing a status is not stamped as a change', !r.extra.statusChangedAt && !r.extra.statusLog);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nMonitoring writes OK'); process.exit(bad ? 1 : 0);
