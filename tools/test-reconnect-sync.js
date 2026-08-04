#!/usr/bin/env node
/*
 * Behavioural test for dbPushLocalCEs — the sync that runs when the connection
 * comes back.
 *
 * Audit finding this covers: there was no sync-on-reconnect at all. _spQueue
 * was never pushed to by anything, so the 'online' handler's _flushQ() always
 * found it empty, and the connection pill's "N pending" was permanently 0 while
 * real work sat unsynced. A CE saved offline stayed local indefinitely.
 *
 * Run: node tools/test-reconnect-sync.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const dbSrc = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'App.js'), 'utf8');
const widgets = fs.readFileSync(path.join(ROOT, 'src', 'widgets.js'), 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

const fnSrc = (dbSrc.match(/let _pushRunning=false;[\s\S]*?\n\}/) || [''])[0];
if (!fnSrc) { console.error('dbPushLocalCEs not found in src/db.js'); process.exit(1); }

function makeEnv(opts) {
  const idb = new Map((opts.ces || []).map(c => [c.ceNum, c]));
  const removed = [];
  const saved = [];
  const ctx = {
    console: { warn() {}, info() {}, log() {} },
    setTimeout: (f, _ms) => f(),          /* skip the 300ms throttle in tests */
    Promise, JSON, Object, Array, Math, String, Number, Date,
    navigator: { onLine: opts.onLine !== false },
    localStorage: { removeItem: k => removed.push(k) },
    USE_SP: opts.configured !== false,
    getSiteURL: () => (opts.configured === false ? '' : 'https://x.sharepoint.com'),
    ceKey: n => String(n == null ? '' : n).trim().toUpperCase(),
    ceAll: async () => [...idb.values()],
    ceGet: async n => idb.get(n) || null,
    ceCountBy: async () => {
      const o = { synced: 0, local: 0, unknown: 0 };
      [...idb.values()].forEach(r => { o[r._syncState] = (o[r._syncState] || 0) + 1; });
      return o;
    },
    dbSaveHistory: async e => {
      saved.push(e.ceNum || (e.info && e.info.ceNum));
      if (opts.failOn && opts.failOn.includes(e.ceNum)) throw new Error('SharePoint rejected it');
      /* Mirror the real thing: it re-marks the record on success. */
      const rec = idb.get(e.ceNum);
      if (rec) idb.set(e.ceNum, { ...rec, _syncState: 'synced' });
    },
    _idb: idb, _removed: removed, _saved: saved
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\nglobalThis._push = dbPushLocalCEs;', ctx);
  return ctx;
}

const ce = (n, st) => ({ ceNum: n, _syncState: st, info: { ceNum: n }, mp: [{ role: 'W', rate: 900 }] });

(async () => {
  console.log('Uploads exactly the CEs that exist only here:');
  const env = makeEnv({ ces: [ce('CE-1', 'local'), ce('CE-2', 'synced'), ce('CE-3', 'local'), ce('CE-4', 'unknown')] });
  const r = await env._push();
  ck('two uploaded', r.pushed === 2, JSON.stringify(r));
  ck('only the local ones were sent', env._saved.sort().join(',') === 'CE-1,CE-3', env._saved.join(','));
  ck('already-synced CE not resent', !env._saved.includes('CE-2'));
  ck("'unknown' not resent either", !env._saved.includes('CE-4'));
  ck('they are marked synced afterwards', env._idb.get('CE-1')._syncState === 'synced');
  ck('their localStorage copies are reclaimed', env._removed.length === 2, env._removed.join(','));

  console.log('\nA failed upload keeps the CE (it is the only copy):');
  const env2 = makeEnv({ ces: [ce('CE-1', 'local'), ce('CE-BAD', 'local')], failOn: ['CE-BAD'] });
  const r2 = await env2._push();
  ck('reports the failure', r2.failed === 1 && r2.pushed === 1, JSON.stringify(r2));
  ck('failed CE stays local', env2._idb.get('CE-BAD')._syncState === 'local');
  ck('its localStorage copy is NOT removed', !env2._removed.includes('shic:ce_cache:CE-BAD'), 'would destroy the only copy');
  ck('an error message is surfaced', (r2.errors || []).some(e => e.indexOf('CE-BAD') === 0));

  console.log('\nGuards:');
  ck('does nothing when SharePoint is not configured',
    (await makeEnv({ ces: [ce('CE-1', 'local')], configured: false })._push()).skipped === 'not-configured');
  ck('does nothing while offline',
    (await makeEnv({ ces: [ce('CE-1', 'local')], onLine: false })._push()).skipped === 'offline');
  ck('the manual button can override the online check',
    (await makeEnv({ ces: [ce('CE-1', 'local')], onLine: false })._push({ requireOnline: false })).pushed === 1);
  ck('nothing pending is a clean no-op',
    (await makeEnv({ ces: [ce('CE-1', 'synced')] })._push()).pushed === 0);

  console.log('\nWiring:');
  ck('a reconnect listener exists', /addEventListener\('shic-online', onReconnect\)/.test(appSrc), 'nothing reacted to the connection returning');
  ck('reconnect is debounced', /clearTimeout\(_reconnectTimer\)/.test(appSrc), "'online' can fire repeatedly as an adapter settles");
  ck('reconnect pushes local CEs', /onReconnect[\s\S]{0,600}dbPushLocalCEs\(\)/.test(appSrc));
  ck('reconnect also re-pulls reference data', /onReconnect[\s\S]{0,900}_shicFullRefresh/.test(appSrc));
  ck('the listener is removed on unmount', /_cleanupReconnect\(\)/.test(appSrc));
  ck('a backlog is also pushed when the app starts online', /navigator\.onLine !== false[\s\S]{0,300}dbPushLocalCEs/.test(appSrc));
  ck('admin has a manual upload button', /dbPushLocalCEs\(\{ requireOnline: false \}\)/.test(fs.readFileSync(path.join(ROOT, 'src/components/AdminPanel.js'), 'utf8')));

  console.log('\nThe connection pill reports something real:');
  ck('no longer counts the always-empty _spQueue', !/setQ\(_spQueue/.test(widgets), '_spQueue is never pushed to; the count was always 0');
  ck('counts CEs actually waiting', /dbPendingCount\(\)/.test(widgets));

  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall reconnect-sync assertions passed');
  process.exit(fails ? 1 : 0);
})();
