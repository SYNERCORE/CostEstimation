#!/usr/bin/env node
/*
 * Two people, one masterlist.
 *
 * The masterlist is ONE JSON blob in ONE SharePoint row, read once at startup.
 * Every save wrote the whole blob back, so a browser open since before a
 * colleague added a role deleted that role the next time its owner changed any
 * rate at all. There WAS a conflict guard -- it compared timestamps, logged
 * "overwriting with local version" to a console nobody reads, and overwrote.
 *
 * Removal is now something a caller asks for by name:
 *   opts.deleted      {section: [ids]} the user actually deleted
 *   opts.replaceTabs  sections being rewritten whole -- Clear List, Reset
 *                     Defaults
 * Everything else the site holds is merged back in and handed to the caller in
 * `adopted`, so the list on screen matches what was just written.
 *
 * Run: node tools/test-masterlist-merge.js
 */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const grab = (re, what) => { const m = db.match(re); if (!m) { console.error('not found in src/db.js: ' + what); process.exit(1); } return m[0]; };
const src =
  grab(/const ML_SECS=\[[^\]]*\];/, 'ML_SECS') + '\n' +
  grab(/function _mlKey\(it\)\{[\s\S]*?\n\}/, '_mlKey') + '\n' +
  grab(/const ML_CHUNK=\d+;/, 'ML_CHUNK') + '\n' +
  grab(/async function _mlReadSP\(\)\{[\s\S]*?\nasync function _mlWriteSP[\s\S]*?\n\}\n(?=async function dbSaveML)/, 'the SharePoint reader and writer') + '\n' +
  grab(/async function dbSaveML\(data,opts\)\{[\s\S]*?\nreturn\{sp:false,reason:'SharePoint is not configured'\};\}/, 'dbSaveML');

/* A fake Masterlist list: rows by Title. It understands the two filters the code uses. */
function fakeSP(list) {
  let id = 100;
  return {
    list,
    spGet: async (l, f) => {
      let m;
      if ((m = /^Title eq '(.*)'$/.exec(f))) return list.filter(r => r.Title === m[1]);
      if ((m = /^startswith\(Title,'(.*)'\)$/.exec(f))) return list.filter(r => r.Title.indexOf(m[1]) === 0);
      throw new Error('unexpected filter ' + f);
    },
    spPost: async (l, d) => { list.push({Id: ++id, Modified: new Date().toISOString(), ...d}); },
    spPatch: async (l, i, d) => { Object.assign(list.find(r => r.Id === i), d); },
    spDelete: async (l, i) => { list.splice(list.findIndex(r => r.Id === i), 1); }
  };
}
/* What a reader of the site sees: the index and its parts put back together, or the old single row. */
function assembled(list) {
  const ix = list.find(r => r.Title === 'ml:index');
  if (!ix) { const c = list.find(r => r.Title === 'config'); return c ? JSON.parse(c.shicData) : null; }
  const idx = JSON.parse(ix.shicData), out = {...(idx.extra || {})};
  for (const s of Object.keys(idx.counts)) {
    out[s] = [];
    for (let i = 0; i < idx.counts[s]; i++) out[s] = out[s].concat(JSON.parse(list.find(r => r.Title === 'ml:' + s + ':' + i).shicData));
  }
  return out;
}
const mk = (sp, store) => new Function(
  'spGet', 'spPost', 'spPatch', 'spDelete', 'spList', 'spWithRetry', 'logSwallowed', 'USE_SP', 'getSiteURL', 'LS', 'console',
  src + '; return dbSaveML;'
)(sp.spGet, sp.spPost, sp.spPatch, sp.spDelete, n => n, fn => fn(), () => {}, true, () => 'https://x',
  {get: k => store[k], set: (k, v) => { store[k] = v; }}, {warn() {}});

/* Runs the real dbSaveML against a fake SharePoint holding `theirs` in the old single row. */
function run(mine, theirs, opts) {
  const store = {};
  const sp = fakeSP([]);
  if (theirs !== null) sp.list.push({Id: 7, Title: 'config', Modified: new Date().toISOString(), shicData: JSON.stringify(theirs)});
  return mk(sp, store)(mine, opts).then(res => ({res, written: assembled(sp.list), store, sp}));
}

const role = (id, r, rate) => ({id, role: r, rate, cat: 'Technical'});

(async () => {
  console.log('an ordinary rate edit keeps what the site has and this browser does not:');
  let r = await run(
    {manpower: [role(1, 'WELDER', 900)]},
    {manpower: [role(1, 'WELDER', 850), role(2, 'RIGGER', 700)]}
  );
  ck('the edit is written', r.written.manpower.find(x => x.id === 1).rate === 900);
  ck("the colleague's role survives", !!r.written.manpower.find(x => x.id === 2),
    'this is the bug: RIGGER was deleted by someone else saving a WELDER rate');
  ck('and is reported back to be shown', r.res.adopted.manpower.length === 1 &&
    r.res.adopted.manpower[0].role === 'RIGGER');
  ck('the merged list comes back too', r.res.merged.manpower.length === 2);
  ck('the save succeeded', r.res.sp === true);

  console.log('\nacross every section, not just the one being edited:');
  r = await run(
    {manpower: [role(1, 'WELDER', 900)], tools: []},
    {manpower: [role(1, 'WELDER', 850)], tools: [{id: 9, desc: 'CRANE 40T', cost: 8000}],
     materials: [{id: 10, desc: 'BLUESHEET', cost: 420}]}
  );
  ck('tools are kept', r.written.tools.length === 1);
  ck('materials are kept', r.written.materials.length === 1);
  ck('both are named', Object.keys(r.res.adopted).sort().join() === 'materials,tools',
    JSON.stringify(Object.keys(r.res.adopted)));

  console.log('\ndeleting an item deletes it, when the caller says so:');
  r = await run(
    {manpower: [role(1, 'WELDER', 900)]},
    {manpower: [role(1, 'WELDER', 900), role(2, 'RIGGER', 700)]},
    {deleted: {manpower: [2]}}
  );
  ck('the named item is gone', !r.written.manpower.find(x => x.id === 2), JSON.stringify(r.written.manpower));
  ck('and nothing was adopted', !r.res.adopted.manpower);

  console.log('\nClear List and Reset Defaults still rewrite their tab whole:');
  r = await run(
    {manpower: [], tools: [{id: 9, desc: 'CRANE', cost: 1}]},
    {manpower: [role(1, 'WELDER', 850), role(2, 'RIGGER', 700)], tools: [{id: 8, desc: 'OTHER', cost: 2}]},
    {replaceTabs: ['manpower']}
  );
  ck('the cleared tab is emptied', r.written.manpower.length === 0, JSON.stringify(r.written.manpower));
  ck('but the other tabs are still merged', r.written.tools.length === 2,
    'replacing one tab must not authorise deleting another');

  console.log('\nan item with no id is matched by name, not duplicated:');
  r = await run(
    {manpower: [{role: 'WELDER', cat: 'Technical', rate: 900}]},
    {manpower: [{role: 'welder', cat: 'technical', rate: 850}]}
  );
  ck('the same role does not come back twice', r.written.manpower.length === 1,
    JSON.stringify(r.written.manpower));

  console.log('\na first save, with nothing on the site yet:');
  r = await run({manpower: [role(1, 'WELDER', 900)]}, null);
  ck('is written as given', r.written.manpower.length === 1);
  ck('and adopts nothing', Object.keys(r.res.adopted).length === 0);

  console.log('\nthe local mirror matches what was actually written:');
  r = await run(
    {manpower: [role(1, 'WELDER', 900)]},
    {manpower: [role(1, 'WELDER', 850), role(2, 'RIGGER', 700)]}
  );
  ck('the offline copy carries the adopted item too', (r.store.masterlist.manpower || []).length === 2,
    'otherwise the next save offers to delete it all over again');

  console.log('\na save that fails still says so:');
  const failing = mk({spGet: async () => { throw new Error('403 Forbidden'); }, spPost: async () => {}, spPatch: async () => {}, spDelete: async () => {}}, {});
  const f = await failing({manpower: []});
  ck('sp is false', f.sp === false);
  ck('with the reason', /403/.test(f.reason || ''));

  console.log('\nsplit into parts, so no one row limits the list:');
  const many = n => Array.from({length: n}, (_, i) => ({id: 'i' + i, desc: 'ITEM ' + i, cost: i, cat: 'General'}));
  r = await run({tools: many(1000), manpower: [role(1, 'WELDER', 900)]}, null);
  const titles = r.sp.list.map(x => x.Title).sort();
  ck('1,000 tools become 3 parts, not one row', titles.filter(t => /^ml:tools:/.test(t)).length === 3, titles.join());
  ck('with an index row naming them', titles.includes('ml:index'));
  ck('and no row holds more than a part', Math.max(...r.sp.list.map(x => x.shicData.length)) < 400 * 200);
  ck('read back whole and in order', r.written.tools.length === 1000 && r.written.tools[999].id === 'i999' && r.written.manpower.length === 1);
  ck('the old single row is not touched by a save', !r.sp.list.some(x => x.Title === 'config'));
  console.log('\nmigrating from the old single row:');
  r = await run({tools: many(10)}, {tools: [{id: 'z', desc: 'FROM OLD ROW', cost: 1}]});
  ck('the old row is merged in and written as parts', r.written.tools.length === 11 && r.sp.list.some(x => x.Title === 'ml:index'));
  ck('and left as it was', JSON.parse(r.sp.list.find(x => x.Title === 'config').shicData).tools.length === 1);
  console.log('\nonly the parts that changed are written:');
  {
    const store = {}, sp = fakeSP([]);
    let writes = 0;
    const p = sp.spPatch; sp.spPatch = async (...a) => { writes++; return p(...a); };
    const save = mk(sp, store);
    await save({tools: many(1000)});
    writes = 0;
    const edited = many(1000); edited[500].cost = 99999;
    await save({tools: edited});
    ck('one edit rewrites its part and the index, not all three', writes === 2, 'patches: ' + writes);
    ck('and the edit is there', assembled(sp.list).tools[500].cost === 99999);
    await save({tools: many(100)}, {replaceTabs: ['tools']});
    ck('a list that shrank leaves no stale parts', sp.list.filter(x => /^ml:tools:/.test(x.Title)).length === 1 && assembled(sp.list).tools.length === 100);
    await save({tools: []}, {replaceTabs: ['tools']});
    ck('Clear List leaves none', !sp.list.some(x => /^ml:tools:/.test(x.Title)) && assembled(sp.list).tools.length === 0);
  }
  console.log('\nan incomplete list on the site is refused, not read as a short one:');
  {
    const sp = fakeSP([]);
    const store = {};
    await mk(sp, store)({tools: many(900)});
    sp.list.splice(sp.list.findIndex(x => x.Title === 'ml:tools:1'), 1);
    const f2 = await mk(sp, store)({tools: many(5)});
    ck('the save fails with a reason rather than overwriting', f2.sp === false && /incomplete/.test(f2.reason || ''), JSON.stringify(f2));
  }

  console.log('\nThe app asks for removal by name, and shows what it kept:');
  ck('deleting one row names it', /\{deleted: \{\[mlTab\]: \[id\]\}\}/.test(app));
  ck('Reset Defaults replaces its tab', /\{replaceTabs: \[mlTab\]\}/.test(app));
  ck('Clear List does too', (app.match(/\{replaceTabs: \[mlTab\]\}/g) || []).length >= 2,
    'Reset Defaults and Clear List are both whole-tab rewrites');
  ck('an ordinary edit names nothing', /const res = await dbSaveML\(ml, opts\);/.test(app));
  ck('adopted items are merged into the list on screen',
    /const kept = mlRound\(res\.merged\);/.test(app));
  ck('the debounced typing path merges as well',
    (app.match(/const kept = mlRound\(res\.merged\);/g) || []).length >= 2,
    'editing a rate by hand goes straight to dbSaveML, bypassing saveML');
  ck('and the user is told', /added by someone else/.test(app));
  ck('opening the Masterlist tab re-reads it',
    /if \(tab !== 'masterlist' \|\| !\(USE_SP \|\| getSiteURL\(\)\)\) return;/.test(app),
    'read once at startup means a colleague\'s new rate is invisible until a reload');
  ck('but not over a save in flight',
    /if \(getSyncStatus\(\)\.masterlist === 'saving'\) return;/.test(app));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmasterlist merge OK');
  process.exit(bad ? 1 : 0);
})();
