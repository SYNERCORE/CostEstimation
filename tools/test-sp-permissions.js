#!/usr/bin/env node
/*
 * SharePoint permission failures must be named, not swallowed.
 *
 * Every call the app makes runs on the SIGNED-IN USER'S OWN delegated token --
 * there is no service identity. So permission is per person, per list, and
 * "it works for me" says nothing about whether it works for them. Granting
 * someone elevated site access makes their syncing start working and tells you
 * nothing about why.
 *
 * The failure was invisible from inside the app: a 403 landed in the same catch
 * as being offline, so dbGetUsers quietly returned the stale localStorage copy
 * and carried on. The person kept working against a local list that drifted
 * further from SharePoint every day, with nothing on screen to explain it.
 *
 * Run: node tools/test-sp-permissions.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sp = rd('src/sp.js'), db = rd('src/db.js'), w = rd('src/widgets.js'), fb = rd('src/components/FbSetupPanel.js'), app = rd('src/App.js');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* ---- the real spDenied / spErr, lifted ----------------------------------- */
const src = (sp.match(/function spDenied\(e\)\{[\s\S]*?\n\}\n/) || [''])[0]
          + (sp.match(/function spErr\(verb,list,status,body,retryAfter\)\{[\s\S]*?\n\}\n/) || [''])[0];
if (!/spDenied/.test(src) || !/spErr/.test(src)) { console.error('spDenied / spErr not found in src/sp.js'); process.exit(1); }
const ctx = { Error, String, RegExp };
vm.createContext(ctx);
vm.runInContext(src + 'globalThis._d=spDenied;globalThis._e=spErr;', ctx);
const denied = ctx._d, err = ctx._e;

console.log('A refusal is recognised for what it is:');
ck('403 is a refusal', denied(new Error('SP get Users:403')));
ck('401 is a refusal', denied(new Error('SP post CEs:401 unauthorized')));
ck('the SharePoint wording is recognised', denied(new Error('Access is denied. (Exception from HRESULT ...)')));
ck('"unauthorized" in any casing', denied(new Error('Unauthorized')));
ck('a plain string, not just an Error', denied('403'));

console.log('\nAnd is NOT confused with the things that fix themselves:');
ck('being offline is not a refusal', !denied(new Error('Failed to fetch')));
ck('a 500 is not a refusal', !denied(new Error('SP get CEs:500')));
ck('a 404 is not a refusal', !denied(new Error('SP get CEs:404')), 'that is a missing list, a different fix');
ck('a 400 is not a refusal', !denied(new Error('SP post CE_MP:400 InvalidClientQueryException')),
  'that is a missing column, and it already has its own message');
ck('a 429 throttle is not a refusal', !denied(new Error('SP get CEs:429')));
ck('an empty error does not read as a refusal', !denied(undefined) && !denied(null) && !denied(''));
ck('a CE number containing 403 does not trip it', !denied(new Error('SP post CEs:500 SHIC-CE-2026-0403 rejected')),
  'the digits must be bounded, or an ordinary failure would be blamed on permissions');

console.log('\nThe message tells the reader what to do:');
const m403 = err('get', 'SHICCE_Users', 403).message;
ck('it names the list', /SHICCE_Users/.test(m403));
ck('it says access denied in words, not just a number', /access denied/i.test(m403));
ck('it names the fix', /Contribute/.test(m403));
ck('it says where to click', /Site contents/.test(m403));
ck('it rules out the wrong fix', /not the Azure app registration/i.test(m403),
  'the setup panel talks about the app registration, which is a different permission entirely');
ck('a write says write, a read says read',
  /read/.test(err('get', 'X', 403).message) && /write to/.test(err('post', 'X', 403).message));
const m500 = err('get', 'SHICCE_CEs', 500, 'boom').message;
ck('an ordinary failure is left alone', !/Contribute/.test(m500) && /500/.test(m500));

console.log('\nEvery verb reports it:');
for (const [verb, re] of [['get', /throw spErr\('get'/], ['post', /throw spErr\('post'/],
                          ['patch', /throw spErr\('patch'/], ['delete', /throw spErr\('delete'/]])
  ck('sp' + verb + ' goes through spErr', re.test(sp), 'a bare status code is not actionable');

console.log('\nThe user list stops failing silently:');
const gu = (db.match(/async function dbGetUsers\(\)\{[\s\S]*?\n\}/) || [''])[0];
ck('dbGetUsers found', gu.length > 0);
ck('it distinguishes a refusal from being offline', /_userListDenied=spDenied\(e\)/.test(gu));
ck('and announces it', /shic-sp-denied/.test(gu), 'the fallback is invisible otherwise');
ck('a success clears the flag', /_userListDenied=false/.test(gu),
  'a stuck banner is as bad as no banner');
ck('it still falls back to the local copy', /LS\.get\('users'\)/.test(gu),
  'refusing to work at all would be worse than working locally with a warning');

console.log('\nThe person affected can see it:');
ck('there is a banner', /function SPDeniedBanner/.test(w));
ck('it is rendered', /React\.createElement\(SPDeniedBanner, null\)/.test(app));
ck('it says signing in again will not help', /signing in again will not help/i.test(w),
  'the other banner tells them to sign in, which would send them in circles');
ck('it names the list they were refused', /hit\.list/.test(w));
ck('it is separate from the session banner', /function SignInBanner/.test(w) && /function SPDeniedBanner/.test(w));

console.log('\nAn admin can find out WHOSE access is broken:');
ck('there is a per-list probe', /async function spCheckAccess/.test(db));
ck('it tests reading', /await spGet\(name,'','Id'\)/.test(db));
ck('and writing, because read access alone looks fine until you save',
  /await spPost\(name,\{Title:'__shic_access_probe__'\}\)/.test(db));
ck('it cleans up after itself', /await spDelete\(name,created\.Id\)/.test(db));
ck('a probe row it cannot delete is reported, not hidden', /row\.leftover=created\.Id/.test(db),
  'a stray row left in a live list must be surfaced');
ck('the Users list is checked first', /\['Users','the sign-in list/.test(db),
  'it is the one every single person needs');
ck('every list the app writes is probed',
  ['Users', 'CEs', 'CE_MP', 'CE_Resources', 'Monitoring', 'Drafts', 'AuditLog', 'Masterlist', 'SowLib', 'Companies', 'ML_Imports']
    .every(l => new RegExp("\\['" + l + "',").test(db)));
ck('it is reachable from the setup panel', /Check my access/.test(fb));
ck('and the panel explains there is no service account', /no service account/i.test(fb),
  'without that, "it works on my machine" stays mysterious');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall SharePoint permission assertions passed');
process.exit(fails ? 1 : 0);
