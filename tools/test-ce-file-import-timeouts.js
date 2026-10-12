#!/usr/bin/env node
/*
 * Importing a CE workbook (the blue "Import CE File(s)" button) must never hang silently. A file that never opens (a OneDrive file that is not
 * on the PC, a locked file) or a SharePoint save that never answers ends with a message that says what to do, the button comes back, and the
 * button names the step it is on ("Reading", "Saving", "Waiting for your answer").
 *
 * Runs the real importer with the app's data stubbed. Run: node tools/test-ce-file-import-timeouts.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const XLSX = require('../vendor/xlsx.full.min.js');
const src = fs.readFileSync('src/components/AppImports.js', 'utf8');
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const m = src.match(/function makeImportShicCeFiles\(getCtx\) \{[\s\S]*?\n\}\n/);
if (!m) { console.error('importer not found'); process.exit(1); }

const wbBuf = () => {
  const wb = XLSX.utils.book_new();
  const rows = []; for (let i = 0; i < 16; i++) rows.push([]);
  rows[7] = []; rows[7][11] = 'SY3-CE-2026-0777';
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'CE SUMMARY');
  const b = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

async function run(file, save, ctxExtra) {
  const seen = [], toasts = [];
  const sandbox = {
    XLSX, console: { log() {}, warn() {}, error() {} }, Promise, Object, Array, String, Set, Date, JSON, Math, Number, isFinite,
    uiConfirm: async () => true, dbSaveHistory: save, computeCEGrand: () => 0, uid: () => 'u', logSwallowed() {}, setTimeout, clearTimeout
  };
  const ctx = vm.createContext(sandbox);
  const mk = vm.runInContext(m[0] + '\nmakeImportShicCeFiles', ctx);
  const imp = mk(() => ({ currentUser: { username: 'u' }, history: [], loadHist: async () => {}, setCeImportProgress: p => seen.push(p && { ...p }), showToast: (t, e) => toasts.push([t, e]), ...ctxExtra }));
  const t0 = Date.now();
  await imp([file]);
  await new Promise(r => setTimeout(r, 3300));
  return { seen, toasts, ms: Date.now() - t0 };
}

(async () => {
  /* a file that never opens */
  let r = await run({ name: 'x.xlsx', arrayBuffer: () => new Promise(() => {}) }, async () => ({ sp: true }), { readMs: 200, saveMs: 200 });
  ck('a file that never opens ends with a message instead of waiting forever', r.toasts.some(t => /could not open the file/.test(t[0]) && t[1] === true), JSON.stringify(r.toasts));
  ck('the message tells the user what to do (keep it on this device / local copy)', r.toasts.some(t => /Always keep on this device/.test(t[0])));
  ck('and the button comes back (progress is cleared)', r.seen[r.seen.length - 1] === null);

  /* a save that never answers */
  r = await run({ name: 'x.xlsx', arrayBuffer: async () => wbBuf() }, () => new Promise(() => {}), { readMs: 2000, saveMs: 200 });
  ck('a SharePoint save that never answers ends with a message', r.toasts.some(t => /did not finish saving/.test(t[0]) && t[1] === true), JSON.stringify(r.toasts));
  ck('the message says it may still complete and what to check', r.toasts.some(t => /may still complete/.test(t[0]) && /line items/.test(t[0])));
  ck('the button comes back', r.seen[r.seen.length - 1] === null);

  /* a normal import names its steps */
  r = await run({ name: 'x.xlsx', arrayBuffer: async () => wbBuf() }, async () => ({ sp: true }), {});
  const steps = r.seen.filter(Boolean).map(p => p.step);
  ck('a normal import goes Reading, then Saving', steps.includes('Reading') && steps.includes('Saving') && steps.indexOf('Reading') < steps.indexOf('Saving'), steps.join(','));
  ck('and finishes with the button back', r.seen[r.seen.length - 1] === null && r.toasts.length >= 0);

  ck('the button shows the step', /ceImportProgress\.step \|\| 'Importing'/.test(mon));
  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE file import timeouts OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
