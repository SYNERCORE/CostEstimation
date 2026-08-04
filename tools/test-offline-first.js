#!/usr/bin/env node
/*
 * Guards the rule that reference data renders from the local cache, so the app
 * is usable before (and without) a SharePoint sync.
 *
 * Verified manually against a stopped dev server: all three tabs populate.
 * These assertions stop the individual pieces regressing.
 *
 * Run: node tools/test-offline-first.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = rd('src/App.js'), db = rd('src/db.js'), sw = rd('sw.js'), idb = rd('src/idb.js'), html = rd('index.html');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

console.log('Masterlist renders from cache, not DEFAULT_ML:');
ck('useState reads the cached copy',
  /useState\(\(\) => mlShape\(LS\.get\('masterlist'\)\)/.test(app), 'still seeds from DEFAULT_ML');
ck('no bare useState(DEFAULT_ML)', !/useState\(DEFAULT_ML\)/.test(app));

console.log('\nStartup is not gated on a network round-trip:');
/* dbGetML was the single blocking await: offline it sat until the network timed
   out and history/monitoring never began loading. */
const effect = (app.match(/const autoTimer=setInterval[\s\S]*?\n  \}, \[\]\);/) || [''])[0];
ck('startup effect found', effect.length > 0);
ck('masterlist fetch is not awaited on the critical path',
  !/const ml = await dbGetML\(\)/.test(effect), 'dbGetML still blocks startup');
ck('loadML is kicked off instead', /loadML\(\);/.test(effect));

console.log('\nEvery collection has a loader that caches what it fetched:');
for (const fn of ['loadML', 'loadSowLib']) ck(fn + ' exists', new RegExp('const ' + fn + ' = async').test(app));
ck('loadML mirrors to localStorage', /loadML = async[\s\S]{0,600}LS\.set\('masterlist', ml\)/.test(app));
ck('scope library has one cache writer', /const cacheSowLib = lib =>/.test(app));
ck('cacheSowLib uses the raw key App.js reads', /cacheSowLib[\s\S]{0,300}localStorage\.setItem\('sy3:sowlib'/.test(app));
ck('spPull caches what it pulled', /spPull[\s\S]{0,400}cacheSowLib\(lib\)/.test(app));

console.log('\ndbSaveML mirrors locally on BOTH branches:');
/* The SharePoint branch used to `return` before reaching the LS.set, so editing
   the masterlist online left the offline copy stale forever. */
const saveML = (db.match(/async function dbSaveML[\s\S]*?\n(?=async function)/) || [''])[0];
ck('dbSaveML found', saveML.length > 0);
ck('caches before the USE_SP branch',
  saveML.indexOf("LS.set('masterlist',data)") < saveML.indexOf('if(USE_SP'), 'mirror is still behind the SP return');

console.log('\ndbSaveSowLib writes the key App.js actually reads:');
ck('uses raw sy3:sowlib, not LS.set', /localStorage\.setItem\('sy3:sowlib'/.test(db));
ck("no LS.set('sy3:sowlib') dead write", !/LS\.set\('sy3:sowlib'/.test(db), "writes shic:sy3:sowlib, which nothing reads");

console.log('\nA corrupt cache must not white-screen the app:');
ck('mlShape exists', /function mlShape\(ml\)/.test(app));
ck('mlShape lives in App.js with its call sites',
  /function mlShape/.test(app) && !/function mlShape/.test(rd('src/helpers.js')),
  'cross-file helper can break under a partially-updated cache');
/* Behavioural check, not just presence. */
const mlShape = eval('(' + (app.match(/function mlShape\(ml\) \{[\s\S]*?\n\}/) || [''])[0] + ')');
global.DEFAULT_ML = { manpower: [{ role: 'd' }], tools: [{ d: 1 }], mats: [], ppe: [] };
ck('rejects an array', mlShape([{ a: 1 }]) === null);
ck('rejects an empty object', mlShape({}) === null);
ck('rejects null', mlShape(null) === null);
ck('backfills a missing section', (() => { const r = mlShape({ manpower: [{ role: 'X' }] }); return r && Array.isArray(r.tools) && r.manpower.length === 1; })());

console.log('\nRefresh resolves every pill it marks as saving:');
const refresh = (app.match(/window\._shicFullRefresh = async[\s\S]*?\n      \};/) || [''])[0];
ck('_shicFullRefresh found', refresh.length > 0);
for (const fn of ['loadHist()', 'loadMonData()', 'loadML()', 'loadSowLib()']) ck('refreshes ' + fn, refresh.includes(fn));
ck("downgrades anything left 'saving'", /finally[\s\S]{0,300}'saving'[\s\S]{0,120}'local'/.test(refresh));
ck('sowlib is a tracked sync entity', /sowlib:'unknown'/.test(db) && /key:'sowlib'/.test(rd('src/widgets.js')));

console.log('\nService worker cannot serve a stale shell:');
/* index.html pins the ?v= every script loads with. A stale one paired a new
   App.js with an old helpers.js and white-screened the app offline. */
ck("shell fetch bypasses the browser http cache", /fetch\(e\.request,\{cache:'reload'\}\)/.test(sw));
ck('shell precache bypasses it too', /SHELL\.map\(u=>fetch\(u,\{cache:'reload'\}\)/.test(sw), 'addAll(SHELL) can copy a stale index.html into the SW cache');

console.log('\nidb.js is loaded before db.js:');
const order = [...html.matchAll(/src="\.\/src\/([\w/]+\.js)/g)].map(m => m[1]);
ck('idb.js is in index.html', order.includes('idb.js'));
ck('idb.js precedes db.js', order.indexOf('idb.js') >= 0 && order.indexOf('idb.js') < order.indexOf('db.js'));
ck('idb.js exposes the full API',
  ['idbReady', 'ceGet', 'cePut', 'ceBulkPut', 'ceDelete', 'ceAll', 'ceCount', 'ceCountBy', 'refGet', 'refPut', 'storageReport']
    .every(f => new RegExp('function ' + f + '\\b').test(idb)));
ck('the fallback shim implements the same CE/ref surface',
  ['ceGet', 'cePut', 'ceBulkPut', 'ceDelete', 'ceAll', 'ceCount', 'ceCountBy', 'refGet', 'refPut']
    .every(f => new RegExp('\\n  ' + f + '[({]').test(idb)));
ck('open() has a timeout so it cannot hang forever', /setTimeout\([\s\S]{0,160}done\(null\)[\s\S]{0,20}, 3000\)/.test(idb));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall offline-first assertions passed');
process.exit(fails ? 1 : 0);
