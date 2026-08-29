#!/usr/bin/env node
/*
 * A save that only reached this browser must not be reported as an import.
 *
 * dbSaveHistory swallows a SharePoint failure on purpose -- work is never lost
 * offline -- and then returned exactly as if it had succeeded. Callers could
 * not tell the two apart, so a bulk import kept counting, kept toasting
 * "Imported CE-xxxx - 12 manpower, 8 tools", and finished with a clean
 * success line.
 *
 * That is how a run of CEs ended up in SharePoint as headers with a stored
 * total and no line items under them: dbSaveHistory POSTs the header BEFORE
 * the rows, so anything failing in between leaves precisely that.
 *
 * Run: node tools/test-save-reporting.js
 */
'use strict';

const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

console.log('dbSaveHistory says where the CE landed:');
ck('a SharePoint save reports sp:true', /return\{sp:true,id:ceId\}/.test(db));
ck('a browser-only save reports sp:false', /return\{sp:false,reason:_spFailReason\}/.test(db));
ck('and carries the reason, not just a flag', /_spFailReason=msg/.test(db),
  '"SharePoint refused it" is not actionable without the why');

console.log('\nthe CE-file import acts on it:');
const ceImp = (app.match(/const res = await dbSaveHistory\(entry\);[\s\S]{0,700}/) || [''])[0];
ck('a failed CE is not counted as done', /if \(res && res\.sp === false\)[\s\S]{0,200}continue;/.test(ceImp),
  'done++ ran regardless, and the success toast with it');
ck('it lands in the errors list the summary reads', /errors\.push\(effCeNum \+ ': SharePoint refused it/.test(ceImp));

console.log('\nthe monitoring xlsx import acts on it:');
ck('the per-CE catch no longer discards the result', !/dbSaveHistory\(e\)\)\.catch\(\(\)=>\{\}\)/.test(app),
  'a batch where every CE failed counted as a batch where every CE succeeded');
ck('failures are collected', /importFails\.push/.test(app));
ck('and the summary line reports them', /Import finished with problems/.test(app));
ck('as does the audit entry', /' FAILED' : ''/.test(app),
  'the audit log is where this would be reconstructed months later');

/* The masterlist had the same silence: dbSaveML caught the SharePoint failure
   and returned as if it had worked, so the sidebar showed a synced tick while
   every rate change sat in one browser. */
console.log('\nthe masterlist save says where it landed:');
ck('dbSaveML reports success', /return\{sp:true\}/.test(db));
ck('and reports refusal with the reason', /return\{sp:false,reason:e\.message\}/.test(db));
ck('an unconfigured site is not called a sync', /SharePoint is not configured/.test(db));
ck('saveML surfaces it instead of ticking synced',
  /setSyncStatus\(\{masterlist:'error', dirty:true\}\)/.test(app));
ck('so does the debounced cell edit',
  /setSyncStatus\(\{ masterlist: 'error', dirty: true \}\)/.test(app),
  'typing a new rate is the commonest masterlist change there is');

/* This is the button that repairs CEs whose rows never reached SharePoint --
   the failed save wrote the full CE to that browser, so pushing from the
   machine that did the import is the recovery. It must not tick every CE green
   while changing nothing. */
console.log('\nthe local push acts on it:');
const push = fs.readFileSync('src/components/LocalToSPSync.js', 'utf8');
ck('a refused CE is counted as a failure, not a sync',
  /if \(res && res\.sp === false\)[\s\S]{0,300}continue;/.test(push));
ck('and says which CE and why', /SharePoint refused it/.test(push));
ck('and the masterlist push does the same', /Masterlist: SharePoint refused it/.test(push));
ck('it still refuses to push a summary with no line items',
  /no line items stored locally/.test(push),
  'pushing one would overwrite the SharePoint rows with nothing');

console.log('\nand a header-only CE refuses to open:');
ck('a CE with a total but no rows is caught', /if \(!_rowCount && N\(d\.grand\) > 0\)/.test(app));
ck('every row type counts toward that', /\(d\.mp \|\| \[\]\)\.length \+ \(d\.tools \|\| \[\]\)\.length \+ \(d\.mats \|\| \[\]\)\.length \+ \(d\.ppe \|\| \[\]\)\.length/.test(app));
ck('it says the total that is missing its rows', /has a stored total of/.test(app),
  'P0.00 and a cheerful "Loaded" reads as "this CE is empty"');
ck('and nothing is applied to the editor', /Re-import or re-save this CE to restore it[\s\S]{0,40}return;/.test(app),
  'a blank CE in the editor can be saved back over the header');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nsave reporting OK');
process.exit(fails ? 1 : 0);
