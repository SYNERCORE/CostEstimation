#!/usr/bin/env node
/*
 * Behavioural test for dbMigrateToIDB — it moves 800+ real cost estimates
 * between stores and then DELETES the originals, so its safety rules have to
 * be provable, not just documented.
 *
 * Rules under test:
 *   1. A _syncState:'local' record is never deleted (it exists only here).
 *   2. A post-sync summary never overwrites a record that has line items.
 *   3. If reconciliation fails / we are offline: delete nothing, set no flag.
 *   4. Re-running is a no-op.
 *
 * Runs the real function against fake localStorage + IndexedDB shims.
 *
 * Run: node tools/test-migration.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const dbSrc = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* Pull just the migration out of db.js; the rest of the file drags in the DOM. */
const fnSrc = (dbSrc.match(/async function dbMigrateToIDB[\s\S]*?\n\}/) || [''])[0];
if (!fnSrc) { console.error('dbMigrateToIDB not found in src/db.js'); process.exit(1); }

function makeEnv(opts) {
  const store = Object.assign({}, opts.ls);
  const idb = new Map();
  const meta = new Map();
  const localStorage = {
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i],
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const ctx = {
    console: { warn() {}, info() {}, log() {} },
    localStorage,
    Date, JSON, Object, Array, Set, Math, String, Number, Promise,
    USE_SP: true,
    getSiteURL: () => 'https://example.sharepoint.com',
    ceKey: n => String(n == null ? '' : n).trim().toUpperCase(),
    LS: {
      get: k => { try { return JSON.parse(store['shic:' + k]); } catch (_e) { return null; } },
      set: (k, v) => { store['shic:' + k] = JSON.stringify(v); }
    },
    idbReady: async () => opts.idbReady !== false,
    metaGet: async k => (meta.has(k) ? meta.get(k) : null),
    metaPut: async (k, v) => { meta.set(k, v); return true; },
    ceBulkPut: async list => { list.forEach(r => idb.set(r.ceNum, r)); return list.length; },
    ceCount: async () => idb.size,
    dbGetHistory: async () => {
      if (opts.spFails) throw new Error('network down');
      return opts.spRows;
    },
    _store: store, _idb: idb, _meta: meta
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\nglobalThis._run = dbMigrateToIDB;', ctx);
  return ctx;
}

const fullCE = n => ({ info: { ceNum: n }, savedBy: 'admin', savedAt: '2026-07-01T00:00:00Z', grand: 1000,
  mp: [{ role: 'Welder', rate: 900, days: 2, pax: 1 }], tools: [{ desc: 'Grinder', cost: 50 }] });

/* ── 1. Happy path ───────────────────────────────────────────────────────── */
console.log('Normal run: synced CEs move and are reclaimed:');
(async () => {
  const env = makeEnv({
    ls: {
      'shic:ce_cache:CE-1': JSON.stringify(fullCE('CE-1')),
      'shic:ce_cache:CE-2': JSON.stringify(fullCE('CE-2')),
      'shic:history': JSON.stringify([fullCE('CE-1'), fullCE('CE-2')])
    },
    spRows: [{ ceNum: 'CE-1' }, { ceNum: 'CE-2' }]
  });
  const r = await env._run('admin', true);
  ck('reports both moved', r.moved === 2, JSON.stringify(r));
  ck('both are in the archive', env._idb.size === 2);
  ck('both marked synced', [...env._idb.values()].every(x => x._syncState === 'synced'));
  ck('line items survived the move', env._idb.get('CE-1').mp.length === 1);
  ck('ce_cache keys removed', !Object.keys(env._store).some(k => k.startsWith('shic:ce_cache:')));
  ck('history kept as summaries', JSON.parse(env._store['shic:history']).every(h => !Array.isArray(h.mp)));
  ck('flag written', !!env._meta.get('migv3'));
  ck('manifest recorded for support', (env._meta.get('migv3').manifest || []).length === 2);

  /* ── 2. Rule 1: local-only records are untouchable ────────────────────── */
  console.log('\nRule 1 — a CE that SharePoint does not have is never deleted:');
  const env2 = makeEnv({
    ls: {
      'shic:ce_cache:CE-SYNCED': JSON.stringify(fullCE('CE-SYNCED')),
      'shic:ce_cache:CE-ONLYHERE': JSON.stringify(fullCE('CE-ONLYHERE')),
      'shic:history': JSON.stringify([fullCE('CE-SYNCED'), fullCE('CE-ONLYHERE')])
    },
    spRows: [{ ceNum: 'CE-SYNCED' }]   /* CE-ONLYHERE is not in SharePoint */
  });
  const r2 = await env2._run('admin', true);
  ck('local-only counted', r2.localOnly === 1, JSON.stringify(r2));
  ck("marked _syncState 'local'", env2._idb.get('CE-ONLYHERE')._syncState === 'local');
  ck('its localStorage copy is KEPT', !!env2._store['shic:ce_cache:CE-ONLYHERE'], 'the only copy would have been destroyed');
  ck('the synced one is still reclaimed', !env2._store['shic:ce_cache:CE-SYNCED']);
  ck('its history record keeps line items',
    Array.isArray(JSON.parse(env2._store['shic:history']).find(h => h.info.ceNum === 'CE-ONLYHERE').mp));

  /* ── 3. Rule 3: offline / failed reconciliation deletes nothing ───────── */
  console.log('\nRule 3 — reconciliation failure must not delete or flag:');
  const env3 = makeEnv({
    ls: { 'shic:ce_cache:CE-1': JSON.stringify(fullCE('CE-1')), 'shic:history': JSON.stringify([fullCE('CE-1')]) },
    spFails: true
  });
  const r3 = await env3._run('admin', true);
  ck('reports deferred', !!r3.deferred, JSON.stringify(r3));
  ck('nothing deleted', !!env3._store['shic:ce_cache:CE-1']);
  ck('no flag set, so it retries next open', !env3._meta.get('migv3'));

  /* ── 4. Rule 2: a summary must not clobber a full record ──────────────── */
  console.log('\nRule 2 — a post-sync summary never overwrites line items:');
  const summary = { info: { ceNum: 'CE-1' }, ceNum: 'CE-1', grand: 1000, savedBy: 'admin' };
  const env4 = makeEnv({
    ls: { 'shic:ce_cache:CE-1': JSON.stringify(fullCE('CE-1')), 'shic:history': JSON.stringify([summary]) },
    spRows: [{ ceNum: 'CE-1' }]
  });
  await env4._run('admin', true);
  ck('the full copy won', Array.isArray(env4._idb.get('CE-1').mp), 'summary overwrote the real data');

  /* ── 5. Rule 4: idempotent ────────────────────────────────────────────── */
  console.log('\nRule 4 — re-running does nothing:');
  const again = await env._run('admin', true);
  ck('second run is a no-op', again.skipped === 'done', JSON.stringify(again));

  /* ── 6. No SharePoint configured at all ──────────────────────────────────
     Distinct from "configured but unreachable". A purely local install has
     nothing to reconcile against, and deferring on that basis meant it never
     built an archive at all — the exact case an offline deployment hits. */
  console.log('\nNo SharePoint configured (purely local install):');
  const envL = makeEnv({
    ls: { 'shic:ce_cache:CE-1': JSON.stringify(fullCE('CE-1')), 'shic:history': JSON.stringify([fullCE('CE-1')]) },
    spRows: []
  });
  envL.USE_SP = false;
  envL.getSiteURL = () => '';
  const rL = await envL._run('admin', true);
  ck('does NOT defer forever', !rL.deferred, JSON.stringify(rL));
  ck('the CE reaches the archive', envL._idb.size === 1);
  ck("every record is 'local'", envL._idb.get('CE-1')._syncState === 'local');
  ck('and its localStorage copy is kept', !!envL._store['shic:ce_cache:CE-1']);
  ck('flag is set so it does not re-run', !!envL._meta.get('migv3'));

  console.log('\nNo IndexedDB at all:');
  const env5 = makeEnv({ ls: { 'shic:ce_cache:CE-1': JSON.stringify(fullCE('CE-1')) }, idbReady: false, spRows: [] });
  const r5 = await env5._run('admin', true);
  ck('skips cleanly', r5.skipped === 'no-indexeddb');
  ck('deletes nothing', !!env5._store['shic:ce_cache:CE-1']);

  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall migration assertions passed');
  process.exit(fails ? 1 : 0);
})();
