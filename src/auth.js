/* ── Login rate limiting ─────────────────────────────────────────── */
const _lrKey = un => 'shic:lr:' + un.toLowerCase().trim();
function checkLoginRate(un) {
  try {
    const v = localStorage.getItem(_lrKey(un));
    if (!v) return null;
    const d = JSON.parse(v);
    if (Date.now() > d.until) { localStorage.removeItem(_lrKey(un)); return null; }
    return d;
  } catch { return null; }
}
function recordLoginFail(un) {
  try {
    const v = localStorage.getItem(_lrKey(un));
    const d = v ? JSON.parse(v) : { count: 0, until: 0 };
    d.count = (d.count || 0) + 1;
    if (d.count >= 5) d.until = Date.now() + 15 * 60 * 1000;
    localStorage.setItem(_lrKey(un), JSON.stringify(d));
    return d;
  } catch { return { count: 1, until: 0 }; }
}
function clearLoginRate(un) { try { localStorage.removeItem(_lrKey(un)); } catch {} }

/* ── SP write retry (3 attempts, exponential backoff) ───────────── */
async function spWithRetry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      /* Offline, the retry cannot succeed and each round costs the caller a 1s
         then a 2s wait. Saving a CE issues dozens of these in batches of five,
         so the user sat through half a minute of backoff before being told the
         work had been stored locally -- which was decided the moment the first
         call failed. Give up now and let the local path take over. */
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw last;
}

/* ── Audit log ─────────────────────────────────────────────────────
   The SharePoint write used to be fire-and-forget with an empty catch, so an
   entry created offline existed only in this browser, capped at 500, and never
   reached SharePoint. For a log that records who approved, deleted and changed
   things, losing exactly the entries made while disconnected is the wrong
   failure. Entries are now marked unsynced and pushed on reconnect, and the cap
   evicts synced entries first — a synced entry is safe to drop because
   SharePoint still has it, an unsynced one is the only copy. */
const AUDIT_CAP = 500;        /* synced entries kept for offline viewing */
const AUDIT_PENDING_CAP = 2000; /* hard ceiling so a long outage cannot fill localStorage */

function _auditRead() { try { return LS.get('auditlog') || []; } catch { return []; } }
function _auditWrite(log) { try { LS.set('auditlog', log); return true; } catch { return false; } }
/* Keep every unsynced entry; spend the remaining budget on the newest synced
   ones. Only if the unsynced backlog itself exceeds the hard ceiling do we drop
   the oldest of those, and that is loud rather than silent. */
function _auditTrim(log) {
  const pending = log.filter(e => e && e._synced === false);
  const synced = log.filter(e => !e || e._synced !== false);
  let dropped = 0;
  if (pending.length > AUDIT_PENDING_CAP) {
    dropped = pending.length - AUDIT_PENDING_CAP;
    pending.length = AUDIT_PENDING_CAP;
    console.warn('auditLog: dropped ' + dropped + ' un-uploaded entries at the ' + AUDIT_PENDING_CAP + ' ceiling.');
  }
  const room = Math.max(0, AUDIT_CAP - pending.length);
  return pending.concat(synced.slice(0, room));
}
function auditLog(action, detail, user) {
  const entry = {
    /* A stable id: the push marks entries synced after the fact, and two
       entries can share a millisecond. */
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    ts: new Date().toISOString(), action, detail, user: user || '',
    _synced: false
  };
  _auditWrite(_auditTrim([entry].concat(_auditRead())));
  if (getSiteURL()) Promise.resolve().then(() => _auditPushOne(entry)).catch(() => {});
}
async function _auditPushOne(entry) {
  await spPost(spList('AuditLog'), {
    Title: entry.action, shicAction: entry.action,
    shicDetail: (entry.detail || '').slice(0, 255),
    shicUser: entry.user || '', shicTs: entry.ts
  });
  /* Re-read rather than closing over the array: other entries may have been
     appended while this request was in flight. Trim here as well as on append —
     an entry becoming synced is what frees it to be evicted, so draining a long
     backlog would otherwise leave the log at the pending ceiling until the next
     unrelated write happened to trim it. */
  _auditWrite(_auditTrim(_auditRead().map(e => (e && e.id === entry.id) ? { ...e, _synced: true } : e)));
}
/* Upload everything that never made it. Called on reconnect, alongside the CE
   push. Sequential on purpose: an audit trail read in Id order should keep the
   order things actually happened in, and a burst of parallel POSTs does not. */
let _auditPushRunning = false;
async function dbPushAuditLog() {
  if (!(USE_SP || getSiteURL())) return { skipped: 'not-configured' };
  if (_auditPushRunning) return { skipped: 'already-running' };
  _auditPushRunning = true;
  let pushed = 0, failed = 0;
  try {
    /* Oldest first, so the SharePoint Ids run in the same order as the events. */
    const pending = _auditRead().filter(e => e && e._synced === false).reverse();
    for (const e of pending) {
      try { await _auditPushOne(e); pushed++; }
      catch (err) { failed++; console.warn('auditLog push:', err.message); break; }
    }
  } finally { _auditPushRunning = false; }
  return { pushed, failed };
}
function auditPendingCount() { return _auditRead().filter(e => e && e._synced === false).length; }

/* ── Auto-backup counter ─────────────────────────────────────────── */
let _saveCount = 0;
/* Both call sites pass nothing, so this fell back to LS.get('history') -- which
   holds summary records after any SharePoint sync. Every 50th save has been
   downloading a "backup" with no line items in it, which would not restore
   anything. Default to the IndexedDB archive, which holds full CEs, and warn
   rather than download if the records still look like summaries. */
async function _checkAutoBackup(getCEData) {
  _saveCount++;
  if (_saveCount % 50 === 0) {
    try {
      let data = getCEData ? await getCEData() : null;
      if (!data) { try { data = await ceAll(); } catch (_e) { data = null; } }
      if (!data || !data.length) data = LS.get('history') || [];
      const hasLineItems = data.some(r => ['mp','tools','mats','ppe'].some(f => Array.isArray(r && r[f])));
      if (data.length && !hasLineItems) {
        setTimeout(() => (window._shicToast||console.warn)(
          'Auto-backup skipped: the local archive holds summaries only, so the file would not restore any cost data. Use Export from the Admin panel.', true
        ), 100);
        return;
      }
      const filename = 'shic-autobackup-' + new Date().toISOString().slice(0,10) + '.json';
      setTimeout(() => (window._shicToast||console.warn)(
        'Auto-backup ready (' + (data.length||0) + ' CEs). Downloading ' + filename + '…'
      ), 100);
      setTimeout(() => {
        try {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        } catch {}
      }, 600);
    } catch {}
  }
}
