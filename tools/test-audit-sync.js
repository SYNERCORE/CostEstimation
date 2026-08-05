#!/usr/bin/env node
/*
 * Behavioural test for the audit log's offline durability.
 *
 * The SharePoint write was fire-and-forget with an empty catch, so an entry
 * recorded during an outage existed only in that browser, competed for a
 * 500-entry cap with entries SharePoint already had, and never uploaded. For a
 * log of who approved, deleted and changed things, silently losing exactly the
 * entries made while disconnected is the wrong failure.
 *
 * Rules under test:
 *   1. An entry that fails to upload is kept and marked unsynced.
 *   2. The cap evicts SYNCED entries first — a synced entry is safe to drop
 *      because SharePoint still has it; an unsynced one is the only copy.
 *   3. The push uploads oldest-first, so SharePoint Ids match event order.
 *   4. A mid-run failure stops rather than pressing on out of order.
 *   5. Re-pushing never duplicates an entry that already landed.
 *
 * Runs the real functions from src/auth.js against a fake localStorage.
 *
 * Run: node tools/test-audit-sync.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const auth = fs.readFileSync(path.join(ROOT, 'src', 'auth.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src', 'App.js'), 'utf8');
const db = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* Pull the audit block out of auth.js; the rest drags in crypto/DOM. */
const start = auth.indexOf('const AUDIT_CAP');
const end = auth.indexOf('/* ── Auto-backup counter');
const fnSrc = start >= 0 && end > start ? auth.slice(start, end) : '';
if (!fnSrc) { console.error('audit block not found in src/auth.js'); process.exit(1); }

function makeEnv(opts) {
  const store = {};
  const posted = [];
  const ctx = {
    console: { warn() {}, info() {}, log() {} },
    Promise, JSON, Object, Array, Math, String, Number, Date,
    USE_SP: opts.configured !== false,
    getSiteURL: () => (opts.configured === false ? '' : 'https://x.sharepoint.com'),
    spList: n => 'SHICCE_' + n,
    LS: {
      get: k => { try { return JSON.parse(store['shic:' + k]); } catch (_e) { return null; } },
      set: (k, v) => { store[k === 'auditlog' ? 'shic:auditlog' : 'shic:' + k] = JSON.stringify(v); }
    },
    spPost: async (_l, d) => {
      if (opts.failAfter !== undefined && posted.length >= opts.failAfter) throw new Error('network down');
      posted.push(d);
      return { Id: posted.length };
    },
    _posted: posted, _store: store
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\nglobalThis._log=auditLog;globalThis._push=dbPushAuditLog;globalThis._pending=auditPendingCount;globalThis._read=_auditRead;', ctx);
  return ctx;
}
const settle = () => new Promise(r => setTimeout(r, 0));

(async () => {
  console.log('An entry that cannot upload is kept, not dropped:');
  const off = makeEnv({ failAfter: 0 });
  off._log('user_delete', 'removed juan', 'boss');
  await settle();
  ck('the entry is stored', off._read().length === 1);
  ck('it is marked unsynced', off._read()[0]._synced === false);
  ck('auditPendingCount sees it', off._pending() === 1);
  ck('it carries an id so the push can mark it later', !!off._read()[0].id);
  ck('nothing reached SharePoint', off._posted.length === 0);

  console.log('\nA successful write marks the entry synced:');
  const on = makeEnv({});
  on._log('user_approve', 'approved juan', 'boss');
  await settle();
  ck('it reached SharePoint', on._posted.length === 1, JSON.stringify(on._posted));
  ck('the detail is carried', on._posted[0].shicDetail === 'approved juan');
  ck('it is no longer pending', on._pending() === 0);

  console.log('\nThe cap evicts synced entries before unsynced ones:');
  const cap = makeEnv({ failAfter: 0 });
  /* 600 entries, well past the 500 cap, none of which can upload. */
  for (let i = 0; i < 600; i++) cap._log('a' + i, 'd', 'u');
  await settle();
  ck('every unsynced entry survives the cap', cap._pending() === 600,
    'the only copy of an audit entry was discarded to make room');
  /* Now the reverse: a full log of synced entries must still be trimmed. */
  const cap2 = makeEnv({});
  for (let i = 0; i < 600; i++) cap2._log('a' + i, 'd', 'u');
  await settle();
  ck('synced entries are still capped', cap2._read().length <= 500, cap2._read().length);
  ck('the newest synced entry is the one kept', cap2._read()[0].action === 'a599');

  console.log('\nThe pending backlog is bounded so it cannot fill localStorage:');
  const ceil = makeEnv({ failAfter: 0 });
  for (let i = 0; i < 2100; i++) ceil._log('a' + i, 'd', 'u');
  await settle();
  ck('stops at the hard ceiling', ceil._pending() === 2000, ceil._pending());
  ck('and keeps the NEWEST, not the oldest', ceil._read()[0].action === 'a2099');

  console.log('\nReconnect uploads the backlog oldest-first:');
  const re = makeEnv({ failAfter: 0 });
  re._log('first', 'd', 'u'); re._log('second', 'd', 'u'); re._log('third', 'd', 'u');
  await settle();
  re.spPost = async (_l, d) => { re._posted.push(d); return { Id: re._posted.length }; };
  vm.runInContext('spPost=globalThis.spPost;', re);
  const r = await re._push();
  ck('all three uploaded', r.pushed === 3, JSON.stringify(r));
  ck('in the order the events happened',
    re._posted.map(p => p.shicAction).join(',') === 'first,second,third',
    re._posted.map(p => p.shicAction).join(','));
  ck('nothing left pending', re._pending() === 0);

  console.log('\nRe-pushing does not duplicate what already landed:');
  const again = await re._push();
  ck('second push is a no-op', again.pushed === 0, JSON.stringify(again));
  ck('SharePoint still has exactly three', re._posted.length === 3);

  console.log('\nA failure part-way through keeps the rest:');
  const part = makeEnv({ failAfter: 0 });
  part._log('e1', 'd', 'u'); part._log('e2', 'd', 'u'); part._log('e3', 'd', 'u');
  await settle();
  let n = 0;
  part.spPost = async (_l, d) => { if (n++ >= 2) throw new Error('down'); part._posted.push(d); return { Id: n }; };
  vm.runInContext('spPost=globalThis.spPost;', part);
  const pr = await part._push();
  ck('reports what got through', pr.pushed === 2 && pr.failed === 1, JSON.stringify(pr));
  ck('the un-uploaded entry is still here', part._pending() === 1);
  ck('and it is the last one, so order is preserved', part._read().filter(e => e._synced === false)[0].action === 'e3');

  console.log('\nGuards:');
  ck('does nothing when SharePoint is not configured',
    (await makeEnv({ configured: false })._push()).skipped === 'not-configured');

  console.log('\nWiring:');
  ck('reconnect pushes the audit log', /onReconnect[\s\S]{0,900}dbPushAuditLog\(\)/.test(app));
  ck('a failed CE push does not strand it (separate try)',
    /reconnect push failed[\s\S]{0,400}try \{[\s\S]{0,200}dbPushAuditLog/.test(app),
    'one shared try means a CE failure skips the audit upload');
  ck('a backlog is also pushed when the app starts online', /navigator\.onLine !== false[\s\S]{0,500}dbPushAuditLog/.test(app));
  ck('the admin view merges entries still waiting to upload',
    /localPending\.concat\(remote\)/.test(db),
    'the SharePoint list alone hides entries made during an outage');
  const ap = fs.readFileSync(path.join(ROOT, 'src/components/AdminPanel.js'), 'utf8');
  ck('the pending count is surfaced', /auditPendingCount\(\)/.test(ap));
  ck('there is a manual upload button', /onClick: pushAudit/.test(ap));

  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall audit-sync assertions passed');
  process.exit(fails ? 1 : 0);
})();
