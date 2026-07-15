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
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw last;
}

/* ── Audit log ───────────────────────────────────────────────────── */
function auditLog(action, detail, user) {
  try {
    const log = LS.get('auditlog') || [];
    log.unshift({ ts: new Date().toISOString(), action, detail, user: user || '' });
    if (log.length > 500) log.length = 500;
    LS.set('auditlog', log);
  } catch {}
}

/* ── Auto-backup counter ─────────────────────────────────────────── */
let _saveCount = 0;
function _checkAutoBackup(getCEData) {
  _saveCount++;
  if (_saveCount % 50 === 0) {
    try {
      const data = getCEData ? getCEData() : (LS.get('history') || []);
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
