#!/usr/bin/env node
/*
 * What a Scope Library save is allowed to delete.
 *
 * dbSaveSowLib first merged: any service SharePoint held and the caller did not
 * was preserved. Two bugs came out of that -- an imported replacement library
 * kept every old service beside the new one, and deleting a service did
 * nothing, because the next save put it back. So it was changed to make
 * SharePoint MATCH the list it was handed.
 *
 * That went too far the other way. The library is read once, at startup, so a
 * browser open since before a colleague added three services deleted those
 * three the next time its owner edited anything at all -- silently, with a tick
 * in the sidebar. Absence from the list is not evidence of intent.
 *
 * So a deliberate deletion is NAMED by the caller now:
 *   opts.deleted  ids this caller removed on purpose.
 *   opts.replace  true only for Import-replace and Reset Defaults, the two that
 *                 really do mean "this list and nothing else".
 * Anything else the site holds is another user's work: it survives, and comes
 * back in `adopted` so the caller can fold it in and say so.
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
const m = db.match(/async function dbSaveSowLib\(lib,opts\)\{[\s\S]*?\n\}/);
if (!m) { console.error('dbSaveSowLib(lib,opts) not found in src/db.js'); process.exit(1); }
const src = m[0];

function run(lib, spRows, opts) {
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
  return scope(lib, opts).then(res => ({posted, patched, deleted, res}));
}

const row = (spId, id, title) => ({Id: spId, shicData: JSON.stringify({id, title, cat: 'Turbine Repair'})});

(async () => {
  console.log('an imported REPLACEMENT library replaces what was there:');
  let r = await run(
    [{id: 1, title: 'New A', cat: 'Turbine Repair'}, {id: 2, title: 'New B', cat: 'Turbine Repair'}],
    [row(11, 90, 'Old A'), row(12, 91, 'Old B'), row(13, 92, 'Old C')],
    {replace: true}
  );
  ck('the new services are written', r.posted.length === 2, JSON.stringify(r.posted.length));
  ck('and the ones it replaced are removed', r.deleted.length === 3, JSON.stringify(r.deleted));
  ck('so the site is left holding only the library it was given',
    r.posted.length + r.patched.length === 2 && r.deleted.length === 3);
  ck('and a replace adopts nothing', r.res.adopted.length === 0,
    'replace means this list and nothing else, so there is nothing to keep');

  console.log('\ndeleting a service actually deletes it, when the caller says so:');
  r = await run(
    [{id: 1, title: 'Keep', cat: 'X'}],
    [row(11, 1, 'Keep'), row(12, 2, 'Delete me')],
    {deleted: [2]}
  );
  ck('the survivor is updated in place', r.patched.length === 1 && r.patched[0].id === 11);
  ck('the deleted one is gone from SharePoint', r.deleted.join() === '12', JSON.stringify(r.deleted));
  ck('and nothing is posted twice', r.posted.length === 0);

  console.log('\nbut an ORDINARY save never deletes what it merely has not seen:');
  r = await run(
    [{id: 1, title: 'Mine', cat: 'X'}],
    [row(11, 1, 'Mine'), row(12, 2, 'Theirs'), row(13, 3, 'Theirs too')]
  );
  ck('a colleague\'s services stay on the site', r.deleted.length === 0, JSON.stringify(r.deleted));
  ck('and come back to be merged in', r.res.adopted.length === 2, JSON.stringify(r.res.adopted));
  ck('named, so the caller can say which', r.res.adopted.map(s => s.title).sort().join() === 'Theirs,Theirs too');
  ck('this save still went through', r.res.sp === true);

  console.log('\nand a deletion does not take the rest of the site with it:');
  r = await run(
    [{id: 1, title: 'Mine', cat: 'X'}],
    [row(11, 1, 'Mine'), row(12, 2, 'Deleted on purpose'), row(13, 3, 'Theirs')],
    {deleted: [2]}
  );
  ck('only the named service goes', r.deleted.join() === '12', JSON.stringify(r.deleted));
  ck('the unseen one is adopted instead', r.res.adopted.length === 1 && r.res.adopted[0].title === 'Theirs');

  console.log('\nan empty list never empties the site:');
  r = await run([], [row(11, 1, 'A'), row(12, 2, 'B')], {replace: true});
  ck('nothing is deleted', r.deleted.length === 0,
    'a failed read hands over [], and that must not be able to wipe the library');

  console.log('\na row SharePoint cannot parse names no service:');
  r = await run([{id: 1, title: 'A', cat: 'X'}], [{Id: 99, shicData: 'not json'}], {replace: true});
  ck('a replace clears it out', r.deleted.join() === '99', JSON.stringify(r.deleted));
  r = await run([{id: 1, title: 'A', cat: 'X'}], [{Id: 99, shicData: 'not json'}]);
  ck('an ordinary save leaves it alone', r.deleted.length === 0,
    'nobody asked for it to go, and it cannot be asked for back');

  console.log('\na save that fails says so instead of reporting success:');
  const failing = new Function(
    'spGet', 'spPost', 'spPatch', 'spDelete', 'spList', 'USE_SP', 'getSiteURL', 'localStorage', 'console',
    src + '; return dbSaveSowLib;'
  )(
    async () => { throw new Error('403 Forbidden'); },
    async () => {}, async () => {}, async () => {},
    n => n, true, () => 'https://x', {setItem() {}}, {warn() {}}
  );
  const f = await failing([{id: 1, title: 'A', cat: 'X'}]);
  ck('sp is false', f.sp === false);
  ck('and the reason comes back with it', /403/.test(f.reason || ''),
    'it used to return false into a .catch(()=>{}) while the sidebar kept its tick');

  console.log('\nThe caller acts on all of that:');
  ck('an ordinary edit names no deletion', /saveSowLib\(sowLib\.map\(s => s\.id === saved\.id \? saved : s\)\);/.test(app));
  ck('deleting one service names it', /saveSowLib\(sowLib\.filter\(s => s\.id !== id\), \{deleted: \[id\]\}\);/.test(app));
  ck('Remove duplicates names all of them', /saveSowLib\(kept, \{deleted: droppedIds\}\)/.test(app));
  ck('Reset Defaults is a replace', /saveSowLib\(window\.SOW_LIBRARY, \{replace: true\}\)/.test(app));
  ck('Import-replace is a replace', /saveSowLib\(parsed, \{replace: true\}\)/.test(app));
  ck('adopted services are merged into the list on screen',
    /const merged = \[\.\.\.adopted, \.\.\.lib\];/.test(app));
  ck('and the user is told whose they are',
    /added by someone else since you opened this page/.test(app));
  ck('a failed save turns the badge red, not green',
    /setSyncStatus\(\{sowlib: 'error'\}\)/.test(app) && /setSyncStatus\(\{sowlib: 'saving'\}\)/.test(app),
    'the badge used to report the last LOAD, so a failed save showed a tick');
  ck('opening the tab re-reads the library',
    /if \(tab !== 'scopelib' \|\| !\(USE_SP \|\| getSiteURL\(\)\) \|\| _editSvc\) return;/.test(app),
    'read once at startup means a colleague\'s new service is invisible until a reload');

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

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nscope library save OK');
  process.exit(bad ? 1 : 0);
})();
