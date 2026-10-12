#!/usr/bin/env node
/*
 * Importing a CE list (xlsx) sets Date Received to the date in the file -- the field the Date Recv column reads -- and for a CE that is
 * already in the app changes only what the file says: a column the file lacks, or a blank cell, leaves the record alone. The sheet's
 * "Date Recieved", "Date Received" and "Date Recv." headings all work, and a date typed as text is not moved a day by the time zone.
 *
 * Runs the real importer against a real .xlsx built here. Run: node tools/test-import-date-received.js
 */
'use strict';
process.env.TZ = 'Asia/Manila';
const fs = require('fs');
const vm = require('vm');
const XLSX = require('../vendor/xlsx.full.min.js');
const src = fs.readFileSync('src/components/AppImports.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const m = src.match(/function makeImportMonitoringXLSX\(getCtx\) \{[\s\S]*?\n\}\n/);
if (!m) { console.error('importer not found'); process.exit(1); }

const sheet = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };

async function run(rows, existingHist, monData, saveOverride) {
  const saved = {}, ctxOut = {};
  const sandbox = {
    XLSX, console, Promise, Object, Array, String, Set, Date, JSON,
    localStorage: { setItem() {}, getItem() { return null; } },
    uiConfirm: async msg => { ctxOut.preview = msg; return true; },
    spWithRetry: f => f(),
    dbSaveHistory: async () => ({ sp: true }),
    dbGetHistory: async () => existingHist,
    dbSaveMonAll: saveOverride || (async (merged, h, cb) => { saved.merged = merged; if (cb) cb(Object.keys(merged).length, Object.keys(merged).length); return { saved: Object.keys(merged).length, failed: 0 }; }),
    auditLog() {}, setSyncStatus() {}, logSwallowed() {}
  };
  const ctx = vm.createContext(sandbox);
  const mk = vm.runInContext(m[0] + '\nmakeImportMonitoringXLSX', ctx);
  let lastMon = null;
  const imp = mk(() => ({
    MON_KEY: 'k', currentUser: { username: 'u' }, monData,
    setHistory() {}, setImportProgress() {}, setMonData: v => { lastMon = v; }, showToast: (t, e) => { ctxOut.toast = t; ctxOut.err = e; }
  }));
  await imp({ arrayBuffer: async () => { const b = sheet(rows); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
  return { mon: lastMon, saved, ...ctxOut };
}

const HEAD = (recv) => ['CE No.', 'CE Name', 'Customer', 'Job Title', recv, 'Deadline', 'Status', 'Received By'];
const hist = [{ id: 7, info: { ceNum: 'SHIC-CE-2026-0001' }, savedAt: '2026-10-12T00:00:00Z' }];
const existingMon = { 7: { status: 'Ongoing', dateRecv: '2026-10-12', customer: 'ACME', jobTitle: 'Keep me', apv: { state: 'pending' }, remarks: 'old remark', deadline: '2026-11-01' } };

(async () => {
  /* 1. the sheet's own heading */
  let r = await run([[], [], HEAD('Date Recieved'), ['SHIC-CE-2026-0001', 'Ana', 'ACME', 'x', '2026-10-05', '', '', '']], hist, existingMon);
  const row = r.mon && r.mon[7];
  ck('Date Received from the file lands in dateRecv, the field the table reads', row && row.dateRecv === '2026-10-05', JSON.stringify(row));
  ck('and the CE no longer keeps its upload date', row && row.dateRecv !== '2026-10-12');
  ck('blank cells (status, deadline, received by) leave the record\'s values alone', row && row.status === 'Ongoing' && row.deadline === '2026-11-01');
  ck('what the file does not carry is kept: approval state, customer, job title, remarks', row && row.apv && row.apv.state === 'pending' && row.customer === 'ACME' && row.jobTitle === 'Keep me' && row.remarks === 'old remark', JSON.stringify(row));
  ck('the preview says the date will be set', /Date Received set from the file for 1 CE/.test(r.preview || ''), r.preview);

  /* 2. the correct spelling and the table's own heading */
  for (const h of ['Date Received', 'Date Recv.']) {
    r = await run([[], [], HEAD(h), ['SHIC-CE-2026-0001', 'Ana', 'ACME', 'x', '2026-10-06', '', '', '']], hist, existingMon);
    ck('"' + h + '" is recognised', r.mon && r.mon[7] && r.mon[7].dateRecv === '2026-10-06', JSON.stringify(r.mon && r.mon[7]));
  }

  /* 3. text dates are not moved a day (Manila is UTC+8) */
  r = await run([[], [], HEAD('Date Received'), ['SHIC-CE-2026-0001', 'Ana', 'ACME', 'x', '10/10/2026', '', '', '']], hist, existingMon);
  ck('a date typed as text keeps its day', r.mon && r.mon[7] && r.mon[7].dateRecv === '2026-10-10', JSON.stringify(r.mon && r.mon[7]));
  r = await run([[], [], HEAD('Date Received'), ['SHIC-CE-2026-0001', 'Ana', 'ACME', 'x', 'Oct 10, 2026', '', '', '']], hist, existingMon);
  ck('"Oct 10, 2026" keeps its day too', r.mon && r.mon[7] && r.mon[7].dateRecv === '2026-10-10', JSON.stringify(r.mon && r.mon[7]));

  /* 4. no date column: nothing about dates changes, and the user is told */
  r = await run([[], [], ['CE No.', 'CE Name', 'Customer', 'Job Title', 'Status'], ['SHIC-CE-2026-0001', 'Ana', 'ACME', 'x', 'Approved']], hist, existingMon);
  ck('a file with no Date Received column leaves the date alone', r.mon && r.mon[7] && r.mon[7].dateRecv === '2026-10-12');
  ck('and the preview says so', /No "Date Received" column was found/.test(r.preview || ''));
  ck('a column that IS in the file still updates (status)', r.mon && r.mon[7] && r.mon[7].status === 'Approved');

  /* 5. a new CE still gets the date */
  r = await run([[], [], HEAD('Date Received'), ['SHIC-CE-2026-0099', 'Ana', 'ACME', 'x', '2026-10-01', '', '', '']], [], {});
  ck('a CE not in the app yet is created (no history match, so the importer reports it)', typeof r.preview === 'string' && /1 new CE/.test(r.preview), r.preview);

  /* only the CEs in the file are written to SharePoint, not the whole monitoring table */
  const many = {}; for (let i = 100; i < 150; i++) many[i] = { status: 'Draft' };
  many[7] = existingMon[7];
  const ONE = [[], [], HEAD('Date Received'), ['SHIC-CE-2026-0001', 'Ana', 'ACME', 'x', '2026-10-05', '', '', '']];
  r = await run(ONE, hist, many);
  ck('a one-row list writes ONE monitoring record to SharePoint, not all of them', r.saved.merged && Object.keys(r.saved.merged).length === 1 && !!r.saved.merged[7], JSON.stringify(Object.keys((r.saved.merged) || {})));

  /* a SharePoint failure is reported, not swallowed */
  r = await run(ONE, hist, existingMon, async () => ({ saved: 0, failed: 1 }));
  ck('records SharePoint refused are named in the result', r.err === true && /did not save to SharePoint/.test(r.toast || ''), r.toast);
  r = await run(ONE, hist, existingMon);
  ck('a clean save still says complete', /^Import complete/.test(r.toast || ''), r.toast);

  console.log(bad ?'\n' + bad + ' FAILURE(S)' : '\nImport date received OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
