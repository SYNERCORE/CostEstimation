#!/usr/bin/env node
/*
 * A 429 is "later", not "failed".
 *
 * Repair issues dozens of schema writes in a row, SharePoint throttled the lot
 * of them, and the run reported seventeen problems having changed nothing --
 * including the tier columns it had been run to add. Three separate faults
 * behind that:
 *
 *   - a 429 body contains the word "throttl", which spErr's view-threshold
 *     branch matched, so throttling was reported as a 5,000-item index problem.
 *     The advice was to press the button that was being throttled.
 *   - spWithRetry waited 1s then 2s. SharePoint's Retry-After is typically far
 *     longer, and retrying inside its window extends the throttle.
 *   - the list existence check read a throttled response as "not there", so it
 *     tried to create lists that already existed and reported the resulting
 *     "already exists" as a failure.
 *
 * Run: node tools/test-throttling.js
 */
'use strict';
const fs = require('fs');
const sp = fs.readFileSync('src/sp.js', 'utf8');
const auth = fs.readFileSync('src/auth.js', 'utf8');
const reg = fs.readFileSync('src/components/RegisterPage.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* --- the real spErr --- */
const spErr = new Function('return ' + sp.match(/function spErr\(verb,list,status,body,retryAfter\)\{[\s\S]*?\n\}/)[0].replace('function spErr', 'function'))();

console.log('throttling is named as throttling:');
const t = spErr('post', 'SHICCE_CEs', 429, 'The request has been throttled', '30');
ck('a 429 says the site is throttling', /throttling this site/.test(t.message), t.message);
ck('and not that an index is missing', !/view threshold|indexed/i.test(t.message),
  'that is a different fault with a different remedy');
ck('it says it clears on its own', /clears on its own/.test(t.message));
ck('and repeats the wait SharePoint asked for', /about 30 seconds/.test(t.message), t.message);
ck('it is flagged for the retry logic', t.throttled === true && t.retryAfter === 30);
ck('503 counts too', spErr('get', 'X', 503, '', null).throttled === true);
ck('with no header it still gives usable advice',
  /a minute or two/.test(spErr('get', 'X', 429, '', null).message));

console.log('\na genuine threshold error is still a threshold error:');
const th = spErr('get', 'SHICCE_CE_MP', 500, 'The attempted operation is prohibited because it exceeds the list view threshold', null);
ck('it is still recognised', /view threshold/.test(th.message));
ck('and is not mistaken for throttling', !th.throttled);

console.log('\nalready-existing is not a failure:');
const ex = spErr('post', 'SHICCE_CEs', 500, 'A list, survey, discussion board, or document library with the specified title already exists in this Web site.', null);
ck('it is flagged, not dressed up as an outage', ex.alreadyExists === true);
ck('and reads plainly', /already exists/.test(ex.message) && !/Please choose another title/.test(ex.message));

console.log('\nthe retry waits as long as it is asked to:');
ck('a throttled call is retried', /e && e\.throttled && throttleWaits < 3/.test(auth));
ck('honouring Retry-After', /Number\(e\.retryAfter\) \|\| 15/.test(auth));
ck('capped so the app never looks hung', /Math\.min\(Math\.max\(Number\(e\.retryAfter\) \|\| 15, 5\), 60\)/.test(auth));
ck('and a wait does not burn an attempt', /i--; \/\* a throttle wait is not a failed attempt \*\//.test(auth));

console.log('\nand provisioning waits rather than hammering:');
ck('there is one patient fetch', /async function _spFetchPatient/.test(reg));
ck('the schema writes go through it', /const r = await _spFetchPatient\(\(\) => fetch\(url,\{/.test(reg));
ck('so does the list existence check', /_spFetchPatient\(\(\) => fetch\(`\$\{su\}\/_api\/web\/lists\/getbytitle\('\$\{name\}'\)`/.test(reg),
  'reading a 429 as "not there" is what made it create lists that existed');
ck('and so does the column read', /_spFetchPatient\(\(\) => fetch\(`\$\{su\}\/_api\/web\/lists\/getbytitle\('\$\{listName\}'\)\/fields/.test(reg),
  'failing that read turns one request into a burst of redundant writes');
ck('a list that already exists is counted, not reported',
  /if\(!res\.ok&&\/already exists\/i\.test\(String\(res\.text\|\|''\)\)\)return false;/.test(reg));
ck('it tells the user it is waiting rather than sitting silent',
  /SharePoint is throttling — waiting/.test(reg));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nthrottling OK');
process.exit(bad ? 1 : 0);
