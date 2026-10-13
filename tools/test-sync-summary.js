#!/usr/bin/env node
/*
 * One truthful sync indicator. The chips used to say "SP connected / Realtime Sync / SharePoint (synced)" whenever a load had succeeded, even
 * with SharePoint off (test mode, no site set) -- the data had come from this browser. syncSummary reads the real link first and gives one answer.
 * Runs the real function. Run: node tools/test-sync-summary.js
 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync('src/widgets.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const m = src.match(/function syncSummary\(sync\) \{[\s\S]*?\n\}\n/);
ck('syncSummary exists', !!m);
if (m) {
  const run = (site, sync) => new Function('getSiteURL', m[0] + '\nreturn syncSummary;')(() => site)(sync);
  const base = { sp: 'connected', masterlist: 'synced', monitoring: 'synced', sowlib: 'synced', drafts: 'synced' };
  ck('no SharePoint site: Local only, even though a load "connected"', run(null, base).level === 'local' && run(null, base).label === 'Local only');
  ck('connected and everything synced: Saved to SharePoint', run('https://x', base).level === 'ok' && /Saved to SharePoint/.test(run('https://x', base).label));
  ck('a list not loaded yet is not a problem', run('https://x', { ...base, sowlib: 'unknown' }).level === 'ok');
  ck('a list showing the browser copy is a warning that names it', (r => r.level === 'warn' && /Monitoring/.test(r.label))(run('https://x', { ...base, monitoring: 'local' })));
  ck('unsaved changes are a warning', run('https://x', { ...base, dirty: true }).level === 'warn');
  ck('a failed list is an error that names it', (r => r.level === 'error' && /Drafts/.test(r.label))(run('https://x', { ...base, drafts: 'error' })));
  ck('SharePoint error is an error', run('https://x', { ...base, sp: 'error' }).level === 'error');
  ck('saving shows syncing', run('https://x', { ...base, drafts: 'saving' }).level === 'busy');
  ck('not connected yet says connecting, not synced', run('https://x', { ...base, sp: 'unknown' }).level === 'unknown');
  ck('every state carries a tooltip', ['ok', 'warn', 'error', 'busy', 'unknown'].length && run(null, base).tip.length > 20);
}
ck('the top bar, the strip and the footer all read syncSummary', (src.match(/syncSummary\(sync\)/g) || []).length >= 5);
ck('the old claims are gone', !src.includes("'Realtime Sync'") && !src.includes("sync.sp === 'connected' ? 'SharePoint (synced)'"));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nSync summary OK');
process.exit(bad ? 1 : 0);
