#!/usr/bin/env node
/*
 * A throttled SharePoint does not look like a 429 from a browser.
 *
 * SharePoint answers a throttled request with a redirect to its Throttle page,
 * and that page carries no CORS headers. The browser blocks it, and the call
 * surfaces as a bare "Failed to fetch" TypeError. So every retry path was blind
 * to throttling on exactly the requests being throttled: each caller saw a
 * network error, gave up, and the next one fired again -- which is what kept
 * the site throttled and filled the console with 123 errors while a push of
 * 896 CEs ground through them one failure at a time.
 *
 * One gate for the whole app: when SharePoint says stop, everything stops until
 * the clock runs out.
 *
 * Run: node tools/test-throttle-gate.js
 */
'use strict';
const fs = require('fs');
const sp = fs.readFileSync('src/sp.js', 'utf8');
const push = fs.readFileSync('src/components/LocalToSPSync.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* Build the real gate. */
const gateSrc = sp.match(/let _spCooldownUntil = 0;[\s\S]*?\n\}\n(?=function spErr)/)[0];
const errSrc = sp.match(/function spErr\(verb,list,status,body,retryAfter\)\{[\s\S]*?\n\}/)[0];

const mk = fetchImpl => new Function('fetch', 'navigator', 'window', 'console',
  errSrc + '\n' + gateSrc +
  '; return {spFetch, spThrottleLeft, spNoteThrottled, spNoteOk};'
)(fetchImpl, {onLine: true}, {}, console);

(async () => {
  console.log('a blocked request is read as the throttle it almost always is:');
  let calls = 0;
  const G = mk(async () => { calls++; throw new TypeError('Failed to fetch'); });
  let err = null;
  try { await G.spFetch('u', {}, 'post', 'SHICCE_CEs'); } catch (e) { err = e; }
  ck('it is flagged as throttled, not as an outage', err && err.throttled === true, err && err.message);
  ck('and says so in words someone can act on', /blocked before it reached SharePoint/.test(err.message));
  ck('the gate is now shut', G.spThrottleLeft() > 0, String(G.spThrottleLeft()));

  console.log('\nand while it is shut, nothing touches the network:');
  const before = calls;
  let e2 = null;
  try { await G.spFetch('u', {}, 'get', 'SHICCE_CEs'); } catch (e) { e2 = e; }
  ck('the second caller never fetches', calls === before, calls + ' calls');
  ck('it is told to wait, with a number', /Waiting \d+s/.test(e2.message), e2.message);
  ck('and it is marked as gated, not as a new failure', e2.gated === true && e2.throttled === true);
  ck('nothing is lost is stated plainly', /stays in this browser/.test(e2.message));

  console.log('\nthe wait grows while the site keeps saying stop:');
  const H = mk(async () => { throw new TypeError('Failed to fetch'); });
  await H.spFetch('u', {}, 'get', 'L').catch(() => {});
  const first = H.spThrottleLeft();
  H.spNoteThrottled(20); const second = H.spThrottleLeft();
  H.spNoteThrottled(20); const third = H.spThrottleLeft();
  ck('each throttle in a row waits longer', second > first && third > second,
    [first, second, third].join(' -> '));
  ck('but never beyond five minutes', H.spNoteThrottled(20) <= 300 && H.spNoteThrottled(9999) <= 300);

  console.log('\na real 429 is handled the same way:');
  const I = mk(async () => ({ok: false, status: 429, headers: {get: k => k === 'Retry-After' ? '45' : null}}));
  let e3 = null;
  try { await I.spFetch('u', {}, 'post', 'L'); } catch (e) { e3 = e; }
  ck('flagged as throttled', e3.throttled === true);
  ck('and Retry-After is honoured', I.spThrottleLeft() >= 40, String(I.spThrottleLeft()));

  console.log('\na call that works is not punished for an old throttle:');
  const J = mk(async () => ({ok: true, status: 200, headers: {get: () => null}}));
  const r = await J.spFetch('u', {}, 'get', 'L').catch(e => e);
  ck('a good response passes straight through', r && r.ok === true, r && r.message);
  ck('and the gate stays open', J.spThrottleLeft() === 0, String(J.spThrottleLeft()));

  console.log('\nand a genuine outage is still an outage:');
  const K = new Function('fetch', 'navigator', 'window', 'console',
    errSrc + '\n' + gateSrc + '; return {spFetch};'
  )(async () => { throw new TypeError('Failed to fetch'); }, {onLine: false}, {}, console);
  let e4 = null;
  try { await K.spFetch('u', {}, 'get', 'L'); } catch (e) { e4 = e; }
  ck('offline is not reported as throttling', !e4.throttled,
    'the browser already knows it has no connection');

  console.log('\nthe bulk push waits rather than burning through the queue:');
  ck('a throttled CE pauses the run', /SharePoint is throttling — pausing/.test(push));
  ck('and the CE is retried, not skipped', /i--;\s*\/\* retry this CE rather than skipping it \*\//.test(push),
    'skipping it would leave the very CE the push exists to repair unsynced');
  ck('a thrown throttle pauses too', /if \(err && err\.throttled\)/.test(push));
  ck('the pause is not counted as a failure', /ceFail--;/.test(push));

  console.log('\nevery verb goes through the gate:');
  ['get', 'post', 'patch', 'delete'].forEach(v => {
    ck(v, new RegExp("spFetch\\(" + "[\\s\\S]{0,240}?'" + v + "'").test(sp));
  });
  ck('the digest call goes through it too',
    /spFetch\(`\$\{su\}\/_api\/contextinfo`/.test(sp),
    'it runs before every write, so outside the gate a throttled site still takes two requests for every one held back');
  ck('and only the gate itself calls fetch directly',
    (sp.match(/await fetch\(/g) || []).length === 1,
    (sp.match(/await fetch\(/g) || []).length + ' direct fetches; a call outside the gate keeps knocking while the others wait');

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nthrottle gate OK');
  process.exit(bad ? 1 : 0);
})();
