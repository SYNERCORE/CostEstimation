#!/usr/bin/env node
/*
 * Opening the Users tab must not rewrite the site's schema.
 *
 * The panel's mount effect called handleConnect, which runs the full
 * provisioning: an interactive sign-in, then twelve lists, every column and
 * every index verified one request at a time. The tab mounts every time it is
 * opened, so all of that ran on every visit -- which is why it looked like
 * SharePoint kept reconnecting, and is the most likely thing that tipped the
 * site into 429 throttling while someone was simply looking at the Users tab.
 *
 * On mount it should do one cheap thing: ask whether the connection still
 * works. Provisioning belongs on the two buttons a person presses on purpose.
 *
 * Run: node tools/test-users-tab-mount.js
 */
'use strict';
const fs = require('fs');
const panel = fs.readFileSync('src/components/FbSetupPanel.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const eff = panel.match(/React\.useEffect\(\(\)=>\{\n    let cancelled=false;[\s\S]*?\n  \},\[\]\);/);
if (!eff) { console.error('mount effect not found'); process.exit(1); }
const body = eff[0];

console.log('opening the tab checks the connection, nothing more:');
ck('it does not run the full connect', !/handleConnect\(\)/.test(body),
  'that is an interactive sign-in plus twelve lists of provisioning, on every visit');
ck('it does not provision', !/autoSetupSP/.test(body));
ck('it asks for a token silently', /const tok=await getSPToken\(\);/.test(body),
  'an interactive prompt for opening a tab is a popup nobody asked for');
ck('and makes exactly one read', (body.match(/fetch\(/g) || []).length === 1,
  String((body.match(/fetch\(/g) || []).length) + ' fetches');
ck('against currentuser, the cheapest thing on the site', /_api\/web\/currentuser/.test(body));

console.log('\nand it reports what it found:');
ck('a good session reads as connected', /setStatus\('connected'\)/.test(body));
ck('an expired one falls back to idle, not to an error',
  /if\(!tok\)\{setStatus\('idle'\);return;\}/.test(body),
  'a session that has simply timed out is not a fault to report');
ck('401 and 403 are the same case', /r\.status===401\|\|r\.status===403/.test(body));
ck('and it says the lists were not re-checked',
  /Lists were not re-checked/.test(body),
  'otherwise "connected" implies a schema check that no longer happens');
ck('a tab closed mid-check does not set state after unmount',
  /let cancelled=false;/.test(body) && /return\(\)=>\{cancelled=true;\};/.test(body));

console.log('\nprovisioning still happens where it is asked for:');
ck('Connect & Auto-Setup still provisions',
  /onClick:handleConnect/.test(panel) && /const result=await autoSetupSP/.test(panel));
ck('and Repair lists & columns still does', /onClick:handleRepair/.test(panel));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nusers tab mount OK');
process.exit(bad ? 1 : 0);
