#!/usr/bin/env node
/* Pressing ↻ Refresh must not leave "Drafts — this device only" behind on a
   connection that is working.
   Run: node tools/test-refresh-drafts.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
const wid = fs.readFileSync('src/widgets.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

ck('Refresh says it is fetching drafts', wid.includes("setSyncStatus({sp:'unknown', masterlist:'saving', monitoring:'saving', drafts:'saving'});"));
ck('and the full refresh actually fetches them',
  app.includes('await Promise.all([loadHist(), loadMonData(), loadML(), loadSowLib(), loadSharedDrafts(true)]);'));
ck('quietly, without "nothing in progress" on every refresh',
  app.includes('const loadSharedDrafts = async (quiet) => {') &&
  app.includes("if (!quiet && list.length === 0) showToast('Nothing in progress"));
ck('a real failure still shows, so the warning keeps its meaning',
  app.includes("setSyncStatus({drafts:'error'});") &&
  app.includes("['masterlist','monitoring','drafts','sowlib'].forEach(k => { if (st[k] === 'saving') fix[k] = 'local'; });"));
ck('and a successful fetch marks them synced',
  app.includes("setSyncStatus({drafts:'synced', lastSyncAt: new Date().toISOString(), sp:'connected'});"));

/* The safety net downgrades only what nobody resolved. With drafts fetched,
   nothing is left saying "saving" for it to catch. */
const fin = app.match(/const st = getSyncStatus\(\), fix = \{\};[\s\S]{0,260}?setSyncStatus\(fix\);/);
ck('the net is still there for anything that is genuinely missed', !!fin);
const run = new Function('getSyncStatus', 'setSyncStatus', (fin ? fin[0] : '') + '\nreturn true;');
let wrote = null;
run(() => ({ masterlist: 'synced', monitoring: 'synced', drafts: 'synced', sowlib: 'synced' }), f => { wrote = f; });
ck('and it writes nothing when every one came back', wrote === null);
run(() => ({ masterlist: 'synced', monitoring: 'synced', drafts: 'saving', sowlib: 'synced' }), f => { wrote = f; });
ck('but still catches one left in the air', wrote && wrote.drafts === 'local');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nrefresh and drafts OK'); process.exit(bad ? 1 : 0);
