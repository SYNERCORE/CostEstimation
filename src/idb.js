/* ── IndexedDB store for the offline CE archive ──────────────────────────────
   localStorage caps out around 5 MB and we hold 800+ full CEs; IndexedDB gives
   us hundreds of MB. This file only *provides* the store — nothing reads from
   it yet (see Stages 4-6 of the offline-first plan).

   Loaded after helpers.js and BEFORE db.js: check-undefined-calls.js walks the
   scripts in index.html order, so ceGet/cePut must exist before db.js names them.

   Every function here is safe to call even when IndexedDB is unavailable — an
   identical-API shim backed by localStorage takes over, so callers never have
   to branch on availability. */

const IDB_NAME = 'shic-ce', IDB_VER = 1;

/* Booleans are not valid IndexedDB keys, so _syncState is a string:
     'synced'  — confirmed present in SharePoint
     'local'   — exists only in this browser; NEVER delete these
     'unknown' — migrated from localStorage, not yet reconciled */
const CE_SYNC_STATES = ['synced', 'local', 'unknown'];

const ceKey = n => String(n == null ? '' : n).trim().toUpperCase();

/* ── Connection ───────────────────────────────────────────────────────────── */

let _idbConn = null;

/* One promise for the whole session. Resolves to an IDBDatabase, or null when
   we must fall back to the shim. The 3-second timeout matters: in Firefox
   private browsing an open() request can fire neither onsuccess nor onerror,
   which would otherwise hang every awaited call in the app forever. */
const _idbAvailable = (() => {
  if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
  return new Promise(resolve => {
    let settled = false;
    const done = db => { if (!settled) { settled = true; _idbConn = db; resolve(db); } };
    const timer = setTimeout(() => { console.warn('IndexedDB open timed out — using localStorage fallback'); done(null); }, 3000);
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = ev => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains('ces')) {
          const s = db.createObjectStore('ces', { keyPath: 'ceNum' });
          s.createIndex('by_id', 'id', { unique: false });            // SharePoint item Id — dbLoadCE / dbDeleteHistory
          s.createIndex('by_savedAt', 'savedAt', { unique: false });
          s.createIndex('by_savedBy', 'savedBy', { unique: false });
          s.createIndex('by_syncState', '_syncState', { unique: false });
        }
        if (!db.objectStoreNames.contains('refdata')) db.createObjectStore('refdata', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        const db = req.result;
        db.onversionchange = () => { try { db.close(); } catch (_e) {} _idbConn = null; };
        done(db);
      };
      req.onerror = () => { clearTimeout(timer); console.warn('IndexedDB unavailable:', req.error && req.error.message); done(null); };
      req.onblocked = () => { clearTimeout(timer); console.warn('IndexedDB blocked by another tab'); done(null); };
    } catch (e) { clearTimeout(timer); console.warn('IndexedDB open threw:', e.message); done(null); }
  });
})();

async function idbReady() { return !!(await _idbAvailable); }

/* Run fn(store) inside one transaction and resolve on oncomplete, not on the
   individual request — a quota failure must not leave a bulk write half done. */
function _tx(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(storeName, mode); } catch (e) { return reject(e); }
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error || new Error('IndexedDB transaction failed'));
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
    try { fn(t.objectStore(storeName)); } catch (e) { try { t.abort(); } catch (_e) {} reject(e); }
  });
}

/* Capture a request's result synchronously in onsuccess. Going through a
   promise here would be a microtask race against the transaction's oncomplete;
   assigning in the handler itself is ordered by the spec. */
const _grab = (req, set) => { req.onsuccess = () => set(req.result); };

/* ── CE archive ───────────────────────────────────────────────────────────── */

async function ceGet(ceNum) {
  const db = await _idbAvailable;
  if (!db) return _shim.ceGet(ceNum);
  const k = ceKey(ceNum);
  if (!k) return null;
  let hit = null;
  await _tx(db, 'ces', 'readonly', s => { _grab(s.get(k), v => { hit = v || null; }); });
  return hit;
}

async function cePut(ce) {
  const db = await _idbAvailable;
  const rec = _normalizeCE(ce);
  if (!rec) return false;
  if (!db) return _shim.cePut(rec);
  await _tx(db, 'ces', 'readwrite', s => { s.put(rec); });
  return true;
}

async function ceBulkPut(list) {
  const db = await _idbAvailable;
  const recs = (list || []).map(_normalizeCE).filter(Boolean);
  if (!recs.length) return 0;
  if (!db) return _shim.ceBulkPut(recs);
  await _tx(db, 'ces', 'readwrite', s => { recs.forEach(r => s.put(r)); });
  return recs.length;
}

async function ceDelete(ceNum) {
  const db = await _idbAvailable;
  const k = ceKey(ceNum);
  if (!k) return false;
  if (!db) return _shim.ceDelete(k);
  await _tx(db, 'ces', 'readwrite', s => { s.delete(k); });
  return true;
}

/* Newest first. `savedBy` and `since` filter, `limit` caps the result. */
async function ceAll(opts) {
  const o = opts || {};
  const db = await _idbAvailable;
  if (!db) return _shim.ceAll(o);
  let rows = [];
  await _tx(db, 'ces', 'readonly', s => { _grab(s.getAll(), v => { rows = v || []; }); });
  return _filterCEs(rows, o);
}

async function ceCount() {
  const db = await _idbAvailable;
  if (!db) return _shim.ceCount();
  let n = 0;
  await _tx(db, 'ces', 'readonly', s => { _grab(s.count(), v => { n = v || 0; }); });
  return n;
}

/* {synced: n, local: n, unknown: n} — drives the storage card and tells the
   migration how many records must never be deleted. */
async function ceCountBy() {
  const db = await _idbAvailable;
  const out = { synced: 0, local: 0, unknown: 0 };
  if (!db) return _shim.ceCountBy();
  /* One transaction for all three counts — three separate ones would each pay
     the transaction round-trip and could disagree if a write landed between. */
  await _tx(db, 'ces', 'readonly', s => {
    CE_SYNC_STATES.forEach(st => _grab(s.index('by_syncState').count(IDBKeyRange.only(st)), v => { out[st] = v || 0; }));
  });
  return out;
}

function _normalizeCE(ce) {
  if (!ce) return null;
  const num = ceKey(ce.ceNum || (ce.info && ce.info.ceNum));
  if (!num) return null;
  const st = CE_SYNC_STATES.indexOf(ce._syncState) >= 0 ? ce._syncState : 'unknown';
  return { ...ce, ceNum: num, savedAt: ce.savedAt || '', savedBy: ce.savedBy || '', _syncState: st };
}

function _filterCEs(rows, o) {
  let out = rows;
  if (o.savedBy) out = out.filter(r => (r.savedBy || '').toLowerCase() === String(o.savedBy).toLowerCase());
  if (o.since) { const t = new Date(o.since).getTime(); out = out.filter(r => new Date(r.savedAt || 0).getTime() >= t); }
  out = out.slice().sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  return o.limit ? out.slice(0, o.limit) : out;
}

/* ── Reference data (masterlist, scope library, monitoring) ───────────────── */

async function refGet(key) {
  const db = await _idbAvailable;
  if (!db) return _shim.refGet(key);
  let hit = null;
  await _tx(db, 'refdata', 'readonly', s => { _grab(s.get(key), v => { hit = v || null; }); });
  return hit;
}

/* source: 'sharepoint' | 'local'. syncedAt is what the status pills render. */
async function refPut(key, data, source) {
  const rec = {
    key, data,
    syncedAt: new Date().toISOString(),
    source: source || 'local',
    count: Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : 0)
  };
  const db = await _idbAvailable;
  if (!db) return _shim.refPut(key, data, source);
  await _tx(db, 'refdata', 'readwrite', s => { s.put(rec); });
  return rec;
}

/* ── Meta (migration flags, manifests) ────────────────────────────────────── */

async function metaGet(key) {
  const db = await _idbAvailable;
  if (!db) return _shim.metaGet(key);
  let hit = null;
  await _tx(db, 'meta', 'readonly', s => { _grab(s.get(key), v => { hit = v || null; }); });
  return hit ? hit.value : null;
}

async function metaPut(key, value) {
  const db = await _idbAvailable;
  if (!db) return _shim.metaPut(key, value);
  await _tx(db, 'meta', 'readwrite', s => { s.put({ key, value }); });
  return true;
}

/* ── Storage report ───────────────────────────────────────────────────────── */

/* navigator.storage.estimate() is the accurate source; the length*2 loop is a
   labelled estimate for browsers without it (Safari < 17, older Firefox). */
async function storageReport() {
  const out = { idb: await idbReady(), ceCount: 0, byState: { synced: 0, local: 0, unknown: 0 }, lsBytes: 0, usage: null, quota: null, estimated: true, refs: {} };
  try { out.ceCount = await ceCount(); out.byState = await ceCountBy(); } catch (_e) {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out.lsBytes += ((localStorage.getItem(k) || '').length + (k || '').length) * 2;
    }
  } catch (_e) {}
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      out.usage = est.usage; out.quota = est.quota; out.estimated = false;
    }
  } catch (_e) {}
  for (const k of ['masterlist', 'sowlib', 'monitoring']) {
    try { const r = await refGet(k); if (r) out.refs[k] = { syncedAt: r.syncedAt, source: r.source, count: r.count }; } catch (_e) {}
  }
  return out;
}

/* ── localStorage shim ────────────────────────────────────────────────────────
   Identical API, backed by the keys db.js already uses, so no caller ever has
   to know IndexedDB is missing. It inherits localStorage's ~5 MB ceiling —
   pruneCeCache stays the eviction policy here. LS is declared in db.js, which
   loads after this file; every reference below runs at call time, not load. */

const _shim = {
  ceGet(ceNum) { const k = ceKey(ceNum); return k ? LS.get('ce_cache:' + k) : null; },
  cePut(ce) { const r = _normalizeCE(ce); if (!r) return false; LS.set('ce_cache:' + r.ceNum, r); return true; },
  ceBulkPut(list) { let n = 0; (list || []).forEach(c => { if (_shim.cePut(c)) n++; }); return n; },
  ceDelete(ceNum) { try { localStorage.removeItem('shic:ce_cache:' + ceKey(ceNum)); } catch (_e) {} return true; },
  ceAll(o) { return _filterCEs(_shim._scan(), o || {}); },
  ceCount() { return _shim._scan().length; },
  ceCountBy() {
    const out = { synced: 0, local: 0, unknown: 0 };
    _shim._scan().forEach(r => { out[CE_SYNC_STATES.indexOf(r._syncState) >= 0 ? r._syncState : 'unknown']++; });
    return out;
  },
  _scan() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf('shic:ce_cache:') !== 0) continue;
        try { const v = JSON.parse(localStorage.getItem(key)); if (v) out.push(_normalizeCE(v) || v); } catch (_e) {}
      }
    } catch (_e) {}
    return out;
  },
  refGet(key) { return LS.get('refdata:' + key); },
  refPut(key, data, source) {
    const rec = { key, data, syncedAt: new Date().toISOString(), source: source || 'local', count: Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : 0) };
    LS.set('refdata:' + key, rec);
    return rec;
  },
  metaGet(key) { const r = LS.get('meta:' + key); return r ? r.value : null; },
  metaPut(key, value) { LS.set('meta:' + key, { key, value }); return true; }
};
