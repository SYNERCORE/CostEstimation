#!/usr/bin/env node
/*
 * CE Monitoring status filter: Active / Closed / On hold quick groups. One click selects every status in the group, a second click on the lit
 * one clears it. A status in no group (added by hand) and a CE with no status yet count as Active.
 *
 * Run: node tools/test-status-groups.js
 */
'use strict';
const fs = require('fs');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const g = cfg.match(/const STATUS_GROUPS = \[[\s\S]*?\n\];\nconst statusGroupMembers = [\s\S]*?\n\};/);
ck('the groups and the member function are in config', !!g);
const DEFAULTS = eval(cfg.match(/const DEFAULT_STATUS_OPTIONS = (\[[^\]]*\])/)[1]);
const api = g ? new Function(g[0] + '; return { STATUS_GROUPS, statusGroupMembers };')() : null;
if (api) {
  const { STATUS_GROUPS, statusGroupMembers: mem } = api;
  const all = [...DEFAULTS, 'Chasing Client'];
  const a = mem('active', all), c = mem('closed', all), h = mem('hold', all);
  ck('Active holds the open statuses from the brief', ['Pending', 'Waiting for Information', 'Draft', 'Ongoing', 'Sourcing', 'For site Inspection', 'For Approval'].every(s => a.includes(s)));
  ck('Closed holds Cancelled, No Quote, Approved, Submitted', ['Cancelled', 'No Quote', 'Approved', 'Submitted'].every(s => c.includes(s)));
  ck('On hold is On Hold only', h.length === 1 && h[0] === 'On Hold');
  ck('a hand-added status and a blank status fall under Active', a.includes('Chasing Client') && a.includes(''));
  ck('every default status is in exactly one group', DEFAULTS.every(s => [a, c, h].filter(x => x.includes(s)).length === 1), DEFAULTS.filter(s => [a, c, h].filter(x => x.includes(s)).length !== 1).join(','));
  ck('the three groups never overlap', !a.some(s => c.includes(s) || h.includes(s)) && !c.some(s => h.includes(s)));
  ck('a group lists only statuses that exist', mem('hold', ['Draft']).length === 0);
}
ck('the panel draws a button per group, lit only when the filter equals the group', /STATUS_GROUPS\.map\(g => \{/.test(mon) && /monStatusFilter\.size === mem\.length && mem\.every\(s => monStatusFilter\.has\(s\)\)/.test(mon));
ck('a click picks the group, or clears it when it is already lit', /setMonStatusFilter\(on \? new Set\(\) : new Set\(mem\)\); setMonPage\(0\)/.test(mon));
ck('the Status count does not count the blank status', /\[\.\.\.monStatusFilter\]\.filter\(Boolean\)\.length/.test(mon));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nStatus groups OK');
process.exit(bad ? 1 : 0);
