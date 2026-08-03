#!/usr/bin/env node
/*
 * Guards the rule that a SharePoint response which returns nothing useful must
 * never destroy good local data.
 *
 * Three real bugs this locks down:
 *  - dbGetMon reported {empty:true} both when the Monitoring list was genuinely
 *    empty AND when items existed with unreadable shicMonData. loadMonData then
 *    deleted the cached table and reported status 'synced'. Because shicMonData
 *    is a multi-line column, and multi-line column creation was failing with a
 *    400, this fired on every load for an affected site.
 *  - loadHist wrote LS.set('history', []) whenever SharePoint returned zero
 *    rows. Non-admins query with `shicSavedBy eq '<user>'`, so a new estimator
 *    with no CEs of their own wiped the shared cache.
 *  - dbGetDrafts returned [] for both "query failed" and "no drafts", so
 *    anything pruning local drafts against it could delete un-uploaded work.
 *
 * Run: node tools/check-cache-preservation.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const db = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src', 'App.js'), 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

console.log('dbGetMon distinguishes unreadable from empty:');
ck('unparseable items report parseFailed, not empty',
  /parseFailed:true/.test(db) && !/none had valid data[\s\S]{0,120}empty:true/.test(db));
ck('a genuinely empty list is marked definitive', /empty:true,definitive:true/.test(db));
ck('itemCount is reported so the message can be specific', /itemCount:r\.length/.test(db));

console.log('\nloadMonData never deletes the cached table:');
const monBody = (app.match(/const loadMonData = async[\s\S]*?\n  \};/) || [''])[0];
ck('loadMonData found in source', monBody.length > 0);
ck('no removeItem(MON_KEY) anywhere in it', !/removeItem\(MON_KEY\)/.test(monBody), 'still purges the cache');
ck('no setMonData({}) blanking', !/setMonData\(\{\}\)/.test(monBody), 'still blanks the table');
ck('handles parseFailed explicitly', /parseFailed/.test(monBody));
ck('only treats empty as empty when definitive', !/r\.empty(?!\s*&&\s*r\.definitive)/.test(monBody.replace(/r\.empty && r\.definitive/g, 'OK')));
ck('parseFailed reports error rather than synced',
  /parseFailed[\s\S]{0,800}monitoring:\s*'error'/.test(monBody) &&
  !/parseFailed[\s\S]{0,800}monitoring:\s*'synced'/.test(monBody));

console.log('\nloadHist never writes an empty history over the cache:');
const histBody = (app.match(/const loadHist = async[\s\S]*?\n  \};/) || [''])[0];
ck('loadHist found in source', histBody.length > 0);
ck("no LS.set('history', []) purge", !/LS\.set\('history',\s*\[\]\)/.test(histBody), 'still purges');
ck('only caches a non-empty result', /h\.length > 0[\s\S]{0,160}LS\.set\('history', h\)/.test(histBody));
ck('falls back to the cached list when SP returns zero rows',
  /h\.length === 0[\s\S]{0,200}LS\.get\('history'\)/.test(histBody));

console.log('\ndbGetDrafts can be told apart from a failure:');
ck('success path sets ok = true', /out\.ok=true/.test(db));
ck('failure / not-configured path sets ok = false', /empty\.ok=false/.test(db));
ck('still returns an array so callers are unaffected',
  /const empty=\[\];/.test(db) && /return empty;/.test(db));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall cache-preservation assertions passed');
process.exit(fails ? 1 : 0);
