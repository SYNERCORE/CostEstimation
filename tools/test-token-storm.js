#!/usr/bin/env node
/*
 * An expired session must cost one sign-in attempt, not one per list.
 *
 * getSPToken called acquireTokenSilent every single time. A silent refresh
 * fails because the refresh token is expired or revoked -- nothing about the
 * next caller changes that, so every failure was guaranteed to be repeated.
 * Opening a tab mounts a dozen list reads at once, and each one sent its own
 * POST to login.microsoftonline.com and got its own 400 back: hundreds of
 * console errors describing one problem.
 *
 * Two things stop it. Callers arriving together share one attempt, and after a
 * failure the answer is remembered briefly instead of re-asked.
 *
 * Run: node tools/test-token-storm.js
 */
'use strict';
const fs = require('fs');
const sp = fs.readFileSync('src/sp.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('concurrent callers share one attempt:');
ck('there is an in-flight promise', /let _spTokenInflight=null;/.test(sp));
ck('a caller joins it rather than starting another', /if\(_spTokenInflight\)return _spTokenInflight;/.test(sp));
ck('and it is cleared when it settles', /\.finally\(\(\)=>\{_spTokenInflight=null;\}\)/.test(sp),
  'left set, one failure would freeze sign-in for the rest of the session');

console.log('\na failed silent refresh is not immediately retried:');
ck('the failure is remembered', /_spSilentFailedUntil=Date\.now\(\)\+SP_SILENT_RETRY_MS;/.test(sp));
ck('and short-circuits the next background caller',
  /else if\(_spNeedsSignIn&&Date\.now\(\)<_spSilentFailedUntil\)return null;/.test(sp));
ck('but it does expire, in case the session came back', /const SP_SILENT_RETRY_MS=60000;/.test(sp));

console.log('\nand a person asking to sign in is never made to wait it out:');
ck('an interactive call clears the cooldown', /if\(interactive\)_spSilentFailedUntil=0;/.test(sp),
  'the Sign in button must work the moment it is pressed');
ck('a success clears it too', /_spNeedsSignIn=false;\n    _spSilentFailedUntil=0;/.test(sp));

console.log('\nthe banner still gets raised, so there is a way back in:');
ck('the event still fires', /shic-auth-required/.test(sp));
ck('on the first failure, before the cooldown is set',
  sp.indexOf('_spNeedsSignIn=true;') < sp.indexOf("dispatchEvent(new Event('shic-auth-required')"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntoken storm OK');
process.exit(bad ? 1 : 0);
