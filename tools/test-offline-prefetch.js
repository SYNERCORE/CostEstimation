#!/usr/bin/env node
/*
 * Every CE must be available offline, not just the ones opened here.
 *
 * The Monitoring list was cached but the CEs behind it were not: only ones
 * SAVED from this browser reached the archive, and dbLoadCE threw away what it
 * fetched. So the CE nobody here had opened yet -- which is exactly the one
 * wanted when the connection goes -- could not be opened at all.
 *
 * dbCacheAllCEs downloads the lot. Fetched per CE that would be two requests
 * each, ~1,800 on a site this size; instead it reads the three lists once,
 * unfiltered (so it works above the view threshold too), groups the rows by CE
 * id and assembles each one through the SAME _assembleCE that dbLoadCE uses --
 * a second copy of that would drift, and the two would then disagree about
 * what a CE contains.
 *
 * It is incremental: a CE already stored with the same savedAt is left alone,
 * so re-running after a colleague saves costs three reads and one write.
 *
 * Run: node tools/test-offline-prefetch.js
 */
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');

const LISTS = {
  CEs: [
    {Id: 11, Title: 'CE-A', shicType: 'onsite', shicClient: 'PETRON', shicDesc: 'PUMP', shicTotal: 1000,
     shicSavedBy: 'ann', shicSavedAt: '2026-08-01T00:00:00Z', shicInfo: JSON.stringify({ceNum: 'IGNORED', location: 'BATAAN', qty: 3})},
    {Id: 12, Title: 'CE-B', shicType: 'supply', shicTotal: 2000, shicSavedAt: '2026-08-02T00:00:00Z'},
    {Id: 13, Title: 'CE-C', shicType: 'onsite', shicTotal: 3000, shicSavedAt: '2026-08-03T00:00:00Z'}
  ],
  CE_MP: [
    {Id: 1, shicCEId: 11, shicRole: 'Welder', shicRate: 950, shicPax: 2, shicDays: 3, shicShift: 'regular_night'},
    {Id: 2, shicCEId: 13, shicRole: 'Helper', shicRate: 650, shicQty: 4}
  ],
  CE_Resources: [
    {Id: 3, shicCEId: 11, shicTab: 'mats', shicDesc: 'PLYWOOD', shicQty: 30, shicCost: 1750},
    {Id: 4, shicCEId: 11, shicTab: 'tools', shicDesc: 'CRANE', shicQty: 1, shicCost: 5000, shicDays: 2},
    {Id: 5, shicCEId: 12, shicTab: 'ppe', shicDesc: 'GLOVES', shicQty: 10, shicCost: 80}
  ]
};

let reads = [];
const spGet = async (list, filter, sel) => { reads.push({list, filter}); return LISTS[list] || []; };
const spList = n => n;
const _shParse = s => { try { const v = s ? JSON.parse(s) : null; return Array.isArray(v) ? v : []; } catch (_) { return []; } };

let stored = [];
const ceBulkPut = async list => { stored = stored.concat(list); return list.length; };
let archive = [];
const ceAll = async () => archive;

const src = db.match(/async function dbCacheAllCEs[\s\S]*?\nfunction _assembleCE[\s\S]*?\n\}\n/)[0];
const scope = new Function(
  'spGet', 'spList', '_shParse', 'ceBulkPut', 'ceAll', 'USE_SP', 'getSiteURL', '_spGetTolerant', 'console',
  src + '; return {dbCacheAllCEs, _assembleCE};'
)(spGet, spList, _shParse, ceBulkPut, ceAll, true, () => 'x', spGet, console);

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

(async () => {
  const steps = [];
  const r = await scope.dbCacheAllCEs(p => steps.push(p.msg));

  console.log('a first run downloads everything:');
  ck('all three CEs stored', r.stored === 3 && r.total === 3, JSON.stringify(r));
  ck('nothing skipped on an empty archive', r.skipped === 0);
  ck('three reads for the whole site, not two per CE', reads.length === 3,
    reads.length + ' reads; per-CE would be 6 here and ~1,800 live');
  ck('every read unfiltered, so it works above the view threshold', reads.every(x => x.filter === null));
  ck('it reports progress', steps.length >= 4);

  console.log('\nthe CEs are assembled, not just listed:');
  const a = stored.find(x => x.ceNum === 'CE-A');
  ck('line items are attached to the right CE', a.mp.length === 1 && a.mats.length === 1 && a.tools.length === 1);
  ck('and not to the wrong one', stored.find(x => x.ceNum === 'CE-B').mp.length === 0);
  ck('manpower keeps pax, days and shift', a.mp[0].pax === 2 && a.mp[0].days === 3 && a.mp[0].shift === 'regular_night');
  ck('a row written before shicPax falls back to shicQty',
    stored.find(x => x.ceNum === 'CE-C').mp[0].pax === 4);
  ck('tools keep their days', a.tools[0].days === 2);
  ck('the info JSON is restored', a.info.location === 'BATAAN' && a.info.qty === 3);
  ck('but Title wins over the JSON ceNum', a.info.ceNum === 'CE-A',
    'duplicate detection matches on Title, so the JSON must never disagree');
  ck('marked synced, not local', a._syncState === 'synced',
    'a local record is never deleted by the archive migration');

  console.log('\na second run writes nothing:');
  archive = stored.map(x => ({ceNum: x.ceNum, savedAt: x.savedAt}));
  stored = []; reads = [];
  const r2 = await scope.dbCacheAllCEs(() => {});
  ck('all three recognised as current', r2.skipped === 3 && r2.stored === 0, JSON.stringify(r2));
  ck('still only three reads', reads.length === 3);

  console.log('\nbut a CE changed elsewhere is refreshed:');
  archive = archive.map(x => x.ceNum === 'CE-B' ? {...x, savedAt: '2026-07-01T00:00:00Z'} : x);
  stored = [];
  const r3 = await scope.dbCacheAllCEs(() => {});
  ck('only the stale one is written', r3.stored === 1 && stored[0].ceNum === 'CE-B', JSON.stringify(r3));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\noffline prefetch OK');
  process.exit(bad ? 1 : 0);
})();
