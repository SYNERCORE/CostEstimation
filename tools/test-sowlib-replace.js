#!/usr/bin/env node
/*
 * Saving the Scope Library must make SharePoint match it.
 *
 * dbSaveSowLib merged: any service SharePoint held and the caller did not was
 * preserved. Two bugs came out of that, and both were reported.
 *
 *   - Importing a replacement library kept every old service beside the new
 *     one. The import says it replaces the library; connected to SharePoint,
 *     that was untrue, and the list came back with each service twice.
 *   - Deleting a service did nothing. It went locally, and the next save put
 *     it straight back from SharePoint.
 *
 * A service missing from the library handed over is a service meant to be
 * gone -- with one exception, an empty list, which is what a failed read looks
 * like and must never be able to empty the site.
 *
 * Run: node tools/test-sowlib-replace.js
 */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- run the real dbSaveSowLib against a fake SharePoint ---- */
const src = db.match(/async function dbSaveSowLib\(lib\)\{[\s\S]*?\n\}/)[0];

function run(lib, spRows) {
  const posted = [], patched = [], deleted = [];
  const scope = new Function(
    'spGet', 'spPost', 'spPatch', 'spDelete', 'spList', 'USE_SP', 'getSiteURL', 'localStorage', 'console',
    src + '; return dbSaveSowLib;'
  )(
    async () => spRows,
    async (l, d) => { posted.push(d); },
    async (l, id, d) => { patched.push({id, d}); },
    async (l, id) => { deleted.push(id); },
    n => n, true, () => 'https://x', {setItem() {}}, {warn() {}}
  );
  return scope(lib).then(() => ({posted, patched, deleted}));
}

const row = (spId, id, title) => ({Id: spId, shicData: JSON.stringify({id, title, cat: 'Turbine Repair'})});

(async () => {
  console.log('an imported library replaces what was there:');
  let r = await run(
    [{id: 1, title: 'New A', cat: 'Turbine Repair'}, {id: 2, title: 'New B', cat: 'Turbine Repair'}],
    [row(11, 90, 'Old A'), row(12, 91, 'Old B'), row(13, 92, 'Old C')]
  );
  ck('the new services are written', r.posted.length === 2, JSON.stringify(r.posted.length));
  ck('and the ones it replaced are removed', r.deleted.length === 3, JSON.stringify(r.deleted));
  ck('so the site is left holding only the library it was given',
    r.posted.length + r.patched.length === 2 && r.deleted.length === 3);

  console.log('\ndeleting a service actually deletes it:');
  r = await run(
    [{id: 1, title: 'Keep', cat: 'X'}],
    [row(11, 1, 'Keep'), row(12, 2, 'Delete me')]
  );
  ck('the survivor is updated in place', r.patched.length === 1 && r.patched[0].id === 11);
  ck('the deleted one is gone from SharePoint', r.deleted.join() === '12', JSON.stringify(r.deleted));
  ck('and nothing is posted twice', r.posted.length === 0);

  console.log('\nbut an empty list never empties the site:');
  r = await run([], [row(11, 1, 'A'), row(12, 2, 'B')]);
  ck('nothing is deleted', r.deleted.length === 0,
    'a failed read hands over [], and that must not be able to wipe the library');

  console.log('\nand a row SharePoint cannot parse is not left behind:');
  r = await run([{id: 1, title: 'A', cat: 'X'}], [{Id: 99, shicData: 'not json'}]);
  ck('it is removed with the rest', r.deleted.join() === '99', JSON.stringify(r.deleted));

  console.log('\nreading never hands back the same service twice:');
  ck('one per id', /const byId=\{\},byName=\{\};/.test(db));
  ck('and one per category and title',
    /String\(svc\.cat\|\|''\)\.toUpperCase\(\)\.trim\(\)\+'\|'\+String\(svc\.title\|\|''\)/.test(db),
    'a site merged before this fix holds both libraries; the reader is where that stops showing');

  console.log('\nand the duplicates already on the site can be cleared on purpose:');
  ck('there is an action for it', /const dedupeLib = \(\) => \{/.test(app));
  ck('it is in the Scope Library toolbar', /onClick: dedupeLib/.test(app));
  ck('it says how many before doing anything', /Remove ' \+ dropped \+ ' duplicate/.test(app));
  ck('it keeps the more recently imported one', /\[\.\.\.sowLib\]\.reverse\(\)/.test(app));
  ck('and says so when there is nothing to do', /No duplicates — every service is listed once/.test(app));

  console.log('\nand importing one service does not delete the rest:');
  ck('merge is the default, not replace', /Merge: keep your other/.test(app),
    'uploading one new service deleted the other sixty-eight');
  ck('it keeps every service not in the file',
    /const merged = sowLib\.map\(s => \{/.test(app) &&
    /\.concat\(parsed\.filter\(s => !byId\[String\(s\.id\)\]\)\)/.test(app));
  ck('a service already in the library is updated, not duplicated',
    /const hit = parsed\.find\(p => String\(p\.id\) === String\(s\.id\)\);/.test(app));
  ck('it says how many are new and how many update',
    /will update a service you already have/.test(app));

  console.log('\nreplacing is still possible, but it says what it deletes:');
  ck('there is a second prompt for it', /Replace the ENTIRE library/.test(app));
  ck('it names what will go', /not in this file will be DELETED/.test(app));
  ck('and it is not offered when there is nothing to lose', /else if \(rest > 0 &&/.test(app));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nscope library replace OK');
  process.exit(bad ? 1 : 0);
})();
