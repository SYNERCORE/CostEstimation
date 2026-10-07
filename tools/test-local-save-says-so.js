/* A save to this device that fails is said out loud, and a username with an apostrophe does not break the history filter.
   Run: node tools/test-local-save-says-so.js */
'use strict';
const fs = require('fs'), path = require('path');
const db = fs.readFileSync(path.join(__dirname, '..', 'src/db.js'), 'utf8').replace(/\r\n/g, '\n');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('db.js parses', (() => { try { new Function(db); return true; } catch (e) { console.log(e.message); return false; } })());

const a = db.indexOf('const _isQuotaErr'), b = db.indexOf('/* &#9472;&#9472; localStorage helper');
ck('lsPut is found', a > 0 && b > a);
const mk = (store, pruned) => {
  const toasts = [], logs = [];
  const win = { _shicToast: (m, bad) => toasts.push(m) };
  const LS = { pruneCeCache: () => { const n = pruned.n; pruned.n = 0; if (n) store.full = false; return n; } };
  const fn = new Function('localStorage', 'window', 'LS', 'logSwallowed', 'setTimeout', 'console', db.slice(a, b) + '; return lsPut;')(
    { setItem: (k, v) => { if (store.err) { const e = new Error('x'); e.name = store.err; throw e; } if (store.full) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } store[k] = v; } },
    win, LS, (t, e) => logs.push(t), f => f(), { warn() {} });
  return { fn, toasts, logs };
};
let s = {}, h = mk(s, { n: 0 });
ck('a normal write is kept and says nothing', h.fn('k', { a: 1 }, 'this draft') === true && s.k === '{"a":1}' && h.toasts.length === 0);
s = { full: true }; h = mk(s, { n: 0 });
ck('storage full with nothing to free: false, and the person is told', h.fn('k', 1, 'this draft') === false && h.toasts.length === 1 && /storage is full/.test(h.toasts[0]) && /this draft/.test(h.toasts[0]));
ck('told once per kind of data, not every autosave', (h.fn('k', 1, 'this draft'), h.toasts.length === 1) && (h.fn('k', 1, 'the Scope Library'), h.toasts.length === 2));
s = { full: true }; h = mk(s, { n: 3 });
ck('storage full but cached CEs can go: freed, retried, kept, no alarm', h.fn('k', 1, 'x') === true && s.k === '1' && h.toasts.length === 0);
s = { err: 'SecurityError' }; h = mk(s, { n: 0 });
ck('a blocked browser is also reported, with its own wording', h.fn('k', 1, 'x') === false && /blocked/.test(h.toasts[0]));
ck('Firefox\'s quota error name counts as full', (() => { const e = { name: 'NS_ERROR_DOM_QUOTA_REACHED' }; const f = new Function(db.slice(a, db.indexOf('const _lsPutTold')) + '; return _isQuotaErr;')(); return f(e) && f({ code: 22 }) && !f({ name: 'SecurityError' }); })());

ck('the draft kept on the device goes through lsPut (db and autosave)', db.indexOf("lsPut('shic_draft_'+d.draftId,d,'this draft')") > 0 && app.indexOf("lsPut(DRAFT_KEY, d, 'this draft')") > 0);
ck('the Scope Library cache goes through lsPut in all three places', (db.match(/lsPut\('sy3:sowlib',lib,'the Scope Library'\)/g) || []).length === 2 && app.indexOf("lsPut('sy3:sowlib', lib, 'the Scope Library')") > 0);
ck('a Monitoring edit goes through lsPut', app.indexOf("lsPut(MON_KEY, n, 'this Monitoring change')") > 0);
ck('LS.set no longer ignores a non-quota failure', db.indexOf("logSwallowed('db:LS.set:' + k, e)") > 0);

const f = db.indexOf('async function dbGetHistory');
const line = db.slice(f, db.indexOf('\n', f));
ck('the history filter doubles an apostrophe in the username', line.indexOf("String(username||'').replace(/'/g,\"''\")") > 0 && line.indexOf("eq '${username}'") < 0);
process.exit(bad ? 1 : 0);
