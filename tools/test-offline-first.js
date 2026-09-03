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
/* mlShape rounds money on the way in, so mlRound has to come with it. */
global.mlRound = eval('(' + (app.match(/function mlRound\(ml\) \{[\s\S]*?\n\}/) || [''])[0] + ')');
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

console.log('\nThe app carries its own libraries (no public internet at runtime):');
/* React itself came from unpkg. If that precache failed the app was simply dead
   offline -- and c.addAll is atomic, so ONE bad CDN entry discarded the whole
   batch and cost the app its entire offline capability. */
['react.production.min.js', 'react-dom.production.min.js', 'xlsx.full.min.js', 'pdf.min.js',
 'mammoth.browser.min.js', 'pdf.worker.min.js', 'msal-browser.min.js']
  .forEach(f => ck(f + ' is committed', fs.existsSync(path.join(ROOT, 'vendor', f))));
ck('index.html loads no remote <script>', !/<script src="https?:/.test(html), 'a CDN script tag is a hard online dependency');
ck('pdf.js worker points at the local copy', /workerSrc = '\.\/vendor\/pdf\.worker\.min\.js'/.test(app));
ck('msal tries the local copy first', /'\.\/vendor\/msal-browser\.min\.js',/.test(rd('src/sp.js')));
ck('vendored libs are precached', /'\.\/vendor\/react\.production\.min\.js/.test(sw));
ck('runtime-loaded libs are precached too', /const EXTRA=\['\.\/vendor\/pdf\.worker\.min\.js','\.\/vendor\/msal-browser\.min\.js'\]/.test(sw));
ck('vendor is served cache-first', /\(src\|vendor\)/.test(sw));
/* Strip comments first -- sw.js explains the addAll hazard in prose, and a
   naive search would match that explanation rather than the code. */
const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, '');
ck('precache is per-file, not an atomic addAll',
  !/c\.addAll\(APP\)/.test(swCode) && /APP\.concat\(EXTRA\)\.map/.test(swCode),
  'addAll(APP) discards everything if one entry fails');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall offline-first assertions passed');
process.exit(fails ? 1 : 0);
