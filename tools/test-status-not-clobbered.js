#!/usr/bin/env node
/* Saving a CE must never undo a status somebody chose. A CE out for approval
   had its pipeline status shoved back to "For Approval" on every save, so
   Submitted, Ongoing or Awarded would not stay put.
   Run: node tools/test-status-not-clobbered.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const start = app.indexOf('        const mapped = DOC_TO_MON[info.status];');
const stop = app.indexOf('if (Object.keys(_w).length) updateMon(saved.id, _w);', start);
ck('the seeding rule is where a CE is saved', start > 0 && stop > start);
const run = new Function('DOC_TO_MON', 'info', '_entry', 'monData', 'saved', 'apvMirror', 'updateMon',
  'let _out = {};' + app.slice(start, stop) +
  'if (Object.keys(_w).length) updateMon(saved.id, _w); _out = _w; } return _out;');

const D2M = { DRAFT: 'Draft', APPROVED: 'Approved' };
const pending = { state: 'pending', lines: {} };
const saved = { id: 7 };
const mirror = () => ({ state: 'pending', waiting: ['boss'] });
const go = (status, approval, docStatus) => run(D2M, { status: docStatus || 'DRAFT' },
  { info: { approval }, approvers: [] }, { 7: { status } }, saved, mirror, () => {});

ck('a CE nobody has triaged is seeded from the document', go('', null).status === 'Draft');
ck('and one submitted for approval starts there', go('', pending).status === 'For Approval');
ck('a Draft moves on when it goes out for approval', go('Draft', pending).status === 'For Approval');
/* The reported fault: everything anyone set by hand stays set. */
['Submitted', 'Ongoing', 'Awarded', 'For site insp.', 'No Quote', 'Approved', 'Cancelled'].forEach(st => {
  const w = go(st, pending);
  ck('a CE moved to ' + st + ' stays there when it is saved', !('status' in w));
});
ck('the approval summary is still refreshed on every save', !!go('Submitted', pending).apv);
ck('and a CE with no approval at all is left alone', !('status' in go('Ongoing', null)));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nstatus stays where it is put OK'); process.exit(bad ? 1 : 0);
