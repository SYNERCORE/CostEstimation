#!/usr/bin/env node
/*
 * The owner role: exactly one account that delegated admins cannot touch, and
 * which alone can appoint a successor.
 *
 * Every rule here exists because an admin could otherwise take the app from the
 * person who delegated to them — by demoting, disabling, deleting, or simply
 * resetting the owner's password and signing in as them. The password path
 * matters as much as the role path and is easy to forget.
 *
 * Runs the real canManageUser / dbTransferOwnership / dbClaimOwnership.
 *
 * NOTE ON SCOPE: this is app-level enforcement. Anyone with direct write access
 * to the SharePoint Users list can still change shicRole there. These tests
 * cover the app's behaviour, which is what the app can actually promise.
 *
 * Run: node tools/test-ownership.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const db = rd('src/db.js'), ap = rd('src/components/AdminPanel.js'), app = rd('src/App.js');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

const start = db.indexOf('const ROLE_OWNER=');
const end = db.indexOf('/* ── Bulk upload mode');
const src = start >= 0 && end > start ? db.slice(start, end) : '';
if (!src) { console.error('ownership block not found in src/db.js'); process.exit(1); }

function makeEnv(opts) {
  const patched = [];
  const ctx = {
    console: { warn() {}, info() {} }, JSON, Object, Array, String, Number, Boolean, Promise, Error,
    dbUpdateUser: async (id, data) => {
      if (opts && opts.failOn !== undefined && id === opts.failOn) throw new Error('SharePoint rejected it');
      patched.push({ id, ...data });
    },
    _patched: patched
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nglobalThis._can=canManageUser;globalThis._xfer=dbTransferOwnership;globalThis._claim=dbClaimOwnership;globalThis._findOwner=findOwner;globalThis._powers=hasAdminPowers;globalThis._isOwner=isOwnerRole;', ctx);
  return ctx;
}
const E = makeEnv();
const owner = { id: 1, username: 'jhuniel', role: 'owner', status: 'approved' };
const admin = { id: 2, username: 'delegate', role: 'admin', status: 'approved' };
const admin2 = { id: 3, username: 'other', role: 'admin', status: 'approved' };
const user = { id: 4, username: 'staff', role: 'user', status: 'approved' };
const can = (a, t, c) => E._can(a, t, c).ok;

console.log('Role powers:');
ck('the owner has admin powers', E._powers('owner') === true);
ck('an admin has admin powers', E._powers('admin') === true);
ck('a user does not', E._powers('user') === false);
ck('owner is recognised regardless of case', E._isOwner('Owner') === true);
ck('findOwner picks the owner out', E._findOwner([user, owner, admin]).username === 'jhuniel');
ck('findOwner returns null when there is none', E._findOwner([admin, user]) === null);

console.log('\nA delegated admin cannot touch the owner — by ANY route:');
for (const change of ['role', 'status', 'delete', 'password', 'email', 'name'])
  ck('cannot change the owner\'s ' + change, can(admin, owner, change) === false,
    'a delegated admin could take the app this way');
ck('the refusal explains why', /Only the owner/.test(E._can(admin, owner, 'role').reason));

console.log('\nBut a delegated admin still runs the day to day:');
ck('can approve a normal user', can(admin, user, 'status') === true);
ck('can change a normal user\'s role', can(admin, user, 'role') === true);
ck('can delete a normal user', can(admin, user, 'delete') === true);
ck('can reset another admin\'s password', can(admin, admin2, 'password') === true);
ck('can edit another admin\'s email', can(admin, admin2, 'email') === true);

console.log('\nA plain user can manage nobody:');
for (const change of ['role', 'status', 'delete', 'password'])
  ck('user cannot change ' + change, can(user, admin, change) === false);

console.log('\nThe owner account cannot be deleted or stranded:');
ck('nobody can delete the owner', can(admin, owner, 'delete') === false);
ck('not even the owner themselves', can(owner, owner, 'delete') === false,
  'deleting the last owner leaves nobody able to appoint another');
/* Two later rules also refuse this, so the outcome alone does not prove the
   delete rule is there — a mutation removing it still passed. What it uniquely
   contributes is the actionable reason, so assert that instead of the verdict:
   without it the owner is told "you cannot change your own access", which is
   misleading when the real answer is "transfer it first". */
ck('deleting the owner explains the way forward',
  /Transfer ownership first/.test(E._can(owner, owner, 'delete').reason),
  E._can(owner, owner, 'delete').reason);
ck('and says the same to another admin',
  /Transfer ownership first/.test(E._can(admin, owner, 'delete').reason),
  E._can(admin, owner, 'delete').reason);
ck('the owner cannot self-demote by role toggle', can(owner, owner, 'role') === false,
  'that would leave the app with no owner');
ck('the message points at transfer', /Transfer ownership/i.test(E._can(owner, owner, 'role').reason));
ck('the owner CAN change their own password', can(owner, owner, 'password') === true);
ck('the owner CAN change their own email', can(owner, owner, 'email') === true);
ck('the owner cannot disable themselves', can(owner, owner, 'status') === false);

console.log('\nThe owner manages everyone else normally:');
for (const change of ['role', 'status', 'delete', 'password', 'email'])
  ck('owner can change an admin\'s ' + change, can(owner, admin, change) === true);

(async () => {
  console.log('\nTransfer: promotes the successor BEFORE stepping down:');
  const t = makeEnv();
  const r = await t._xfer(owner, admin);
  ck('reports both ends', r.from === 'jhuniel' && r.to === 'delegate', JSON.stringify(r));
  ck('two writes', t._patched.length === 2, JSON.stringify(t._patched));
  ck('successor is promoted first', t._patched[0].id === admin.id && t._patched[0].role === 'owner',
    'demoting first and then failing would leave NO owner');
  ck('previous owner steps down to admin', t._patched[1].id === owner.id && t._patched[1].role === 'admin');

  console.log('\nTransfer refuses the cases that would break the invariant:');
  const bad = async (label, fn, match) => {
    let msg = null;
    try { await fn(); } catch (e) { msg = e.message; }
    ck(label, msg !== null && (!match || match.test(msg)), msg === null ? 'it was allowed' : msg);
  };
  await bad('an admin cannot transfer ownership', () => makeEnv()._xfer(admin, admin2), /Only the owner/);
  await bad('a user cannot transfer ownership', () => makeEnv()._xfer(user, admin));
  await bad('cannot transfer to nobody', () => makeEnv()._xfer(owner, null));
  await bad('cannot transfer to yourself', () => makeEnv()._xfer(owner, owner), /already the owner/);
  await bad('cannot transfer to a pending account',
    () => makeEnv()._xfer(owner, { id: 9, username: 'newbie', role: 'user', status: 'pending' }), /approved/);

  console.log('\nIf the step-down fails, it says so rather than pretending:');
  const half = makeEnv({ failOn: owner.id });
  let msg = null;
  try { await half._xfer(owner, admin); } catch (e) { msg = e.message; }
  ck('the failure is surfaced', msg !== null);
  ck('it names both the success and the problem', /granted to delegate/.test(msg) && /two owners/.test(msg), msg);
  ck('the successor really is owner, so the app is never ownerless',
    half._patched.some(p => p.id === admin.id && p.role === 'owner'));

  console.log('\nClaiming is a one-time bootstrap:');
  const c1 = makeEnv();
  ck('an admin can claim when there is no owner', (await c1._claim(admin, [admin, user])) === 'delegate');
  ck('the claim writes the owner role', c1._patched[0].role === 'owner');
  await bad('cannot claim when an owner exists', () => makeEnv()._claim(admin, [owner, admin]), /already has an owner/);
  await bad('a plain user cannot claim', () => makeEnv()._claim(user, [user]), /Only an admin/);

  console.log('\nWiring:');
  ck('the app grants admin powers to the owner too', /hasAdminPowers\(currentUser\.role\)/.test(app),
    'the owner would lose the admin tab');
  ck('no bare role === \'admin\' gate left in App.js', !/const isAdmin = currentUser\.role === 'admin'/.test(app));
  ck('the seeder counts an owner as an admin', /hasAdminPowers\(x\.role\)/.test(db),
    'it would mint a second admin alongside the owner');
  ck('admin actions go through the policy', /const allow = \(u, change\) =>/.test(ap));
  for (const fn of ['status', 'delete', 'role', 'password', 'email'])
    ck('  ' + fn + ' is gated', new RegExp("allow\\((u|changePwUser), '" + fn + "'\\)").test(ap));
  ck('refused attempts are audit-logged', /auditLog\('denied_' \+ change/.test(ap),
    'a delegated admin probing the owner account should leave a trace');
  ck('buttons are hidden when refused', /canManageUser\(currentUser, u, 'delete'\)\.ok/.test(ap));
  ck('creating a user can never mint an owner', /role: role === 'admin' \? 'admin' : 'user'/.test(ap),
    'creation would be a second route to the role');
  ck('the transfer control is owner-only', /iAmOwner && !isOwnerRole\(u\.role\)/.test(ap));
  ck('transfer is double-confirmed', (ap.match(/Last check — transfer ownership/) || []).length === 1);
  ck('an unclaimed install says so', /No owner set/.test(ap));
  ck('the app-level limit is stated in the UI', /SharePoint Users list can still change roles/.test(ap),
    'users should not believe this is stronger than it is');

  /* ── The bulk push must not be a back door round the rules above ────────
     "Push All Local Data to SharePoint" used to PATCH shicRole/shicStatus for
     every locally cached account. The local cache is editable from the browser
     console, so a delegated admin could set their own role to owner (or the
     owner's to user) and press that button — writing it to SharePoint without
     canManageUser ever being consulted. Even with nobody acting in bad faith, a
     stale cached copy silently reverted a demotion or a disable. */
  console.log('\nThe bulk push cannot rewrite existing accounts:');
  const sync = rd('src/components/LocalToSPSync.js');
  ck('it no longer patches users', !/spPatch\(spList\('Users'\)/.test(sync),
    'a cached role could be written over the live one, bypassing every ownership rule');
  ck('an existing account is skipped, not updated', /already in SharePoint, left unchanged/.test(sync));
  ck('it still creates accounts that do not exist yet', /spPost\(spList\('Users'\)/.test(sync),
    'the first-run migration is the whole point of the tool');
  ck('the owner role can never be pushed from a cache',
    /=== 'owner' \? 'admin'/.test(sync),
    'ownership is claimed or transferred in the app, never uploaded');
  ck('the UI says existing accounts are untouched', /never from a local copy/.test(sync));

  /* The CE archive moved to IndexedDB and the migration deletes the ce_cache
     keys it copied, so this tool read an empty store and called every CE a
     failure. */
  console.log('\nThe bulk push reads the archive CEs actually live in:');
  ck('it asks IndexedDB for the line items', /await ceGet\(ceNum\)/.test(sync),
    'post-migration localStorage no longer holds them');
  ck('ce_cache remains as the pre-migration fallback', /LS\.get\('ce_cache:' \+ ceNum\)/.test(sync));

  /* ── Remote data must not become an executable link ───────────────────── */
  console.log('\nA URL from a fetched document cannot execute:');
  ck('safeHttpUrl exists', /function safeHttpUrl\(u\)/.test(app));
  ck('the update banner runs its href through it', /href: safeHttpUrl\(updateInfo\.downloadUrl\)/.test(app),
    'a javascript: URL in an href runs in this origin when clicked');
  ck('the link is only rendered when the URL survives', /safeHttpUrl\(updateInfo\.downloadUrl\) &&/.test(app));
  ck('it lives in App.js beside its call site', !/function safeHttpUrl/.test(rd('src/helpers.js')),
    'a cross-file helper can go missing from a partially-updated cache');
  const safe = eval('(' + (app.match(/function safeHttpUrl\(u\) \{[\s\S]*?\n\}/) || [''])[0] + ')');
  global.window = { location: { href: 'https://app.example.com/ce/' } };
  global.URL = URL;
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)  ',
                     'data:text/html,<script>x</script>', 'vbscript:msgbox(1)', '', null, undefined])
    ck('blocks ' + JSON.stringify(bad), safe(bad) === '');
  ck('allows a normal https link', safe('https://example.com/app.zip') === 'https://example.com/app.zip');
  ck('allows a normal http link', safe('http://example.com/app.zip') === 'http://example.com/app.zip');

  /* Until now only the Admin panel asked canManageUser, so any OTHER code path
     that wrote a role went straight through -- which is exactly how
     LocalToSPSync came to PATCH shicRole from an editable local cache. The
     guard inside dbUpdateUser catches that class of mistake at the write.

     It is a guard against wrong code, not a security boundary: the console can
     pass `_ownership` as easily as the real callers can. The boundary is
     SharePoint's Users list permissions, as the module says. */
  console.log('\nThe write itself refuses a role change it should not make:');
  const uuSrc = (db.match(/async function dbUpdateUser\(id,data,opts\)\{[\s\S]*?\n\}/) || [''])[0];
  ck('dbUpdateUser found with its opts argument', uuSrc.length > 0);
  const cached = [{ id: 1, username: 'jhuniel', role: 'owner' }, { id: 2, username: 'delegate', role: 'admin' }];
  const uctx = {
    JSON, Object, Array, String, Number, Boolean, Promise, Error,
    USE_SP: false, getSiteURL: () => '', spPatch: async () => {}, spList: n => n,
    LS: { get: () => cached.map(u => ({ ...u })), set: () => {} },
    isOwnerRole: E._isOwner
  };
  vm.createContext(uctx);
  vm.runInContext(uuSrc + '\nglobalThis._uu=dbUpdateUser;', uctx);
  const refused = async (label, id, data, opts) => {
    let msg = '';
    try { await uctx._uu(id, data, opts); } catch (e) { msg = e.message; }
    return msg;
  };
  const results = await Promise.all([
    refused('grant', 2, { role: 'owner' }),
    refused('demote', 1, { role: 'admin' }),
    refused('demote to user', 1, { role: 'user' }),
    refused('normal promotion', 2, { role: 'admin' }),
    refused('transfer grant', 2, { role: 'owner' }, { _ownership: true }),
    refused('transfer step-down', 1, { role: 'admin' }, { _ownership: true }),
    refused('unrelated field on the owner', 1, { email: 'a@b.c' })
  ]);
  ck('granting owner outside a transfer is refused', /transfer only/.test(results[0]), results[0]);
  ck('demoting the owner is refused', /cannot be demoted/.test(results[1]), results[1]);
  ck('...to any role, not just admin', /cannot be demoted/.test(results[2]), results[2]);
  ck('an ordinary promotion still works', results[3] === '', results[3]);
  ck('the real transfer is allowed through', results[4] === '', results[4]);
  ck('and so is the owner stepping down as part of it', results[5] === '', results[5]);
  ck('non-role edits to the owner are untouched by this guard', results[6] === '', results[6]);
  ck('the guard is honest about what it is', /NOT a security boundary/.test(db),
    'claiming more than it delivers is worse than the gap');
  ck('the two ownership functions pass the flag',
    (db.match(/\{_ownership:true\}/g) || []).length === 3,
    'a missing flag would break transfer entirely');

  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall ownership assertions passed');
  process.exit(fails ? 1 : 0);
})();
