#!/usr/bin/env node
/*
 * Guards how the app behaves when SharePoint is CONFIGURED but UNREACHABLE.
 *
 * That state is the normal one for this app: it is offline-first and hosted on
 * GitHub Pages, so "configured but no token" happens every time a user opens it
 * away from the network. spGet used to answer it with [] -- indistinguishable
 * from "SharePoint has no such rows" -- and three separate defects followed,
 * all reproduced in a browser before this test was written:
 *
 *   1. dbGetUsers returned [] instead of falling back to the cached account, so
 *      offline sign-in failed with "Account not found".
 *   2. ensureAdmin read [] as "no admin exists" and minted a fresh local admin
 *      on EVERY load, printing a working admin password to the toast. Any user
 *      could read it -- privilege escalation.
 *   3. The save paths that call spGet to look for an existing row read [] as
 *      "not a duplicate" and would POST a second copy.
 *
 * A fourth defect sat next to them: getSPToken fell through to
 * acquireTokenRedirect on a background read, navigating the whole page to
 * login.microsoftonline.com before the user had clicked anything. Offline that
 * is unreachable, so the app never rendered at all.
 *
 * Run: node tools/test-sp-failure-mode.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sp = rd('src/sp.js'), db = rd('src/db.js'), login = rd('src/components/LoginPage.js');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* ── spGet: behavioural ──────────────────────────────────────────────────── */
console.log('spGet reports a failure instead of an empty list:');
const spGetSrc = (sp.match(/async function spGet\([\s\S]*?\n\}/) || [''])[0];
ck('spGet found in src/sp.js', spGetSrc.length > 0);

function runSpGet(opts) {
  const ctx = {
    console: { warn() {}, info() {}, error() {} },
    Promise, JSON, Object, Array, String, Number, encodeURIComponent,
    getSiteURL: () => opts.site === undefined ? 'https://x.sharepoint.com' : opts.site,
    getSPToken: async () => opts.token,
    fetch: async () => ({ ok: true, json: async () => ({ value: opts.rows || [] }) })
  };
  vm.createContext(ctx);
  vm.runInContext(spGetSrc + '\nglobalThis._get = spGet;', ctx);
  return ctx._get('SHICCE_Users', '', 'Id');
}

(async () => {
  let threw = null;
  try { await runSpGet({ token: null }); } catch (e) { threw = e.message; }
  ck('throws when there is no token', threw !== null, 'returned [] -- callers cannot tell this from "no rows"');
  ck('the message names the list and the cause', /SHICCE_Users/.test(threw || '') && /signed in|offline/i.test(threw || ''), threw);

  const ok = await runSpGet({ token: 'tok', rows: [{ Id: 1 }] });
  ck('still returns rows on the happy path', Array.isArray(ok) && ok.length === 1);
  const empty = await runSpGet({ token: 'tok', rows: [] });
  ck('a genuinely empty list is still []', Array.isArray(empty) && empty.length === 0,
    'a real empty list must stay distinguishable from a failure');

  /* ── getSPToken: no unattended navigation ───────────────────────────────── */
  console.log('\ngetSPToken never hijacks the page on its own:');
  ck('takes an explicit interactive opt-in', /async function getSPToken\(opts\)/.test(sp));
  ck('defaults to non-interactive', /const interactive\s*=\s*!!\(opts&&opts\.interactive\)/.test(sp));
  /* Comment-stripped: sp.js explains the redirect hazard in prose right where
     the guard sits, which both pads the body past any length bound and makes a
     naive indexOf match the explanation instead of the code. */
  const spCode = sp.replace(/\/\*[\s\S]*?\*\//g, '');
  ck('a silent failure returns null when nobody asked to sign in',
    /if\(!interactive\)\{[\s\S]{0,300}return null;/.test(spCode),
    'still falls through to acquireTokenPopup/Redirect on a background read');
  /* ...but it must not be a dead end: tokens expire hourly, and a silent
     refusal with nothing to click locked users out of every list. */
  ck('the failure is raised so the UI can offer a sign-in',
    /_spNeedsSignIn=true/.test(spCode) && /shic-auth-required/.test(spCode));
  ck('a user-initiated sign-in exists', /async function spSignIn\(\)/.test(spCode));
  ck('a successful token clears the flag', /_spNeedsSignIn=false/.test(spCode));
  ck('the banner offers it in-app', /function SignInBanner/.test(rd('src/widgets.js')));
  ck('the banner is rendered', /React\.createElement\(SignInBanner, null\)/.test(rd('src/App.js')));
  ck('the login screen offers it too', /spSignIn\(\)/.test(login));
  ck('login blames the connection, not the account, when the list was unread',
    /userListIsStale\(\)/.test(login) && /_userListStale=true/.test(db),
    '"Account not found" for an account that exists sends people after the wrong problem');
  ck('a connection failure is not counted as a failed login attempt',
    login.indexOf('userListIsStale()') < login.indexOf('recordLoginFail(un);\n        setErr(\'Account not found.'),
    'a lockout over a network problem would be gratuitous');
  /* Order matters: the guard must sit BEFORE the popup/redirect branch. */
  ck('the guard precedes the redirect branch',
    spCode.indexOf('if(!interactive)') < spCode.indexOf('acquireTokenRedirect'),
    'redirect is still reachable without opt-in');
  ck('does not attempt a token while definitively offline',
    /navigator\.onLine===false\)return null/.test(sp));

  console.log('\nOnly a button the user just pressed may sign in interactively:');
  ck('Connect & Test opts in', /getSPToken\(\{interactive:true\}\)/.test(rd('src/components/FbSetupPanel.js')));
  ck('auto-setup opts in', /getSPToken\(\{interactive:true\}\)/.test(rd('src/components/RegisterPage.js')));
  ck('the list-creation button opts in', /getSPToken\(\{ interactive: true \}\)/.test(rd('src/App.js')));
  /* Everything else -- spGet, spDigest, attachments -- must stay silent. A
     redirect mid-save would discard the CE being edited. */
  ck('spDigest stays silent', /const tok=await getSPToken\(\);/.test((sp.match(/async function spDigest[\s\S]*?\n}/) || [''])[0]));

  /* ── ensureAdmin ────────────────────────────────────────────────────────── */
  console.log('\nensureAdmin never invents an admin on a SharePoint install:');
  const ea = (db.match(/async function ensureAdmin\(\)[\s\S]*?\n\}/) || [''])[0];
  ck('ensureAdmin found', ea.length > 0);
  ck('bails out when SharePoint is configured', /if \(USE_SP \|\| getSiteURL\(\)\) return;/.test(ea));
  ck('the bail-out precedes the seeding', ea.indexOf('getSiteURL()) return;') < ea.indexOf('dbCreateUser'),
    'a local admin can still be minted before the guard runs');
  ck('the sy3->shic migration still runs first', ea.indexOf("localStorage.getItem('sy3:users')") < ea.indexOf('getSiteURL()) return;'),
    'the early return must not skip the legacy-key migration');

  /* ── LoginPage ordering ─────────────────────────────────────────────────── */
  console.log('\nApproval is checked before anything is written to the machine:');
  const iPending = login.indexOf("u.status === 'pending'");
  const iCache = login.indexOf("LS.set('users'");
  const iMigrate = login.indexOf('hashPassword(pw)');
  ck('the status gates exist', iPending > 0 && iCache > 0);
  ck('status is checked before the account is cached for offline sign-in', iPending < iCache,
    'a pending/rejected account still gets its hash stored locally');
  ck('status is checked before the legacy hash is rewritten', iPending < iMigrate);
  ck('the gates are not duplicated below', login.split("u.status === 'pending'").length === 2);

  /* ── Account writes must not report success they did not achieve ───────── */
  console.log('\nAccount changes fail loudly rather than diverging the two stores:');
  const cu = (db.match(/async function dbCreateUser[\s\S]*?\n(?=\/\*|async function)/) || [''])[0];
  ck('dbCreateUser does not swallow the SharePoint failure', !/catch\(e\)\{console\.warn\('dbCreateUser/.test(cu),
    'a registration offline becomes a local ghost the admin never sees');
  ck('dbCreateUser writes locally only when SharePoint is not configured',
    cu.indexOf('LS.set(\'users\'') > cu.indexOf('return{...u,id:r.Id};'));

  const uu = (db.match(/async function dbUpdateUser[\s\S]*?\n\}/) || [''])[0];
  ck('dbUpdateUser found', uu.length > 0);
  ck('does not swallow a failed PATCH', !/catch\(e\)\{console\.warn\('dbUpdateUser/.test(uu),
    'a password change reported success while SharePoint kept the old hash');
  ck('writes to SharePoint BEFORE mirroring locally',
    uu.indexOf('await spPatch(') < uu.indexOf('mirror();'),
    'a failed write still leaves a divergent local copy');
  ck('still mirrors after a successful write', /await spPatch\([\s\S]{0,40}mirror\(\);/.test(uu),
    'the cached hash would go stale and the old password keep working offline');
  ck('dbDeleteUser still rethrows', /catch\(e\)\{[^}]*throw e;/.test((db.match(/async function dbDeleteUser[\s\S]*?\n\}/) || [''])[0]));
  /* Every editable field must reach SharePoint. shicEmail was missing, so an
     email edit patched nothing and reported success. */
  ck('dbUpdateUser maps email', /data\.email!==undefined\)sp\.shicEmail=data\.email/.test(uu),
    'an email change is silently dropped');
  for (const f of ['status', 'role', 'hash', 'name', 'email'])
    ck('  maps ' + f, new RegExp('data\\.' + f + '!==undefined').test(uu));
  ck('a patch that maps to nothing throws instead of faking success',
    /if\(!Object\.keys\(sp\)\.length\)throw/.test(uu));
  ck('the admin panel can actually edit an email', /const saveEmail = async u =>/.test(rd('src/components/AdminPanel.js')));

  console.log('\nThe UI reports what did not happen:');
  const ap = rd('src/components/AdminPanel.js');
  ck('admin account actions are wrapped', /const userAction = async \(verb, fn\)/.test(ap));
  for (const fn of ['approve', 'reject', 'disable', 'enable', 'del', 'toggleRole', 'changePw'])
    ck(fn + ' cannot silently no-op', new RegExp('(userAction|setStatus)\\(').test(ap) &&
      new RegExp('const ' + fn + ' = ').test(ap));
  /* Scoped to the success path. changePw also clears the form when the
     ownership policy refuses the reset, which is correct but sits earlier in
     the file, so a whole-file index comparison compares the wrong two things. */
  const pwWrite = (ap.match(/await userAction\('update the password[\s\S]*?\n    \}\);/) || [''])[0];
  ck('the password write block was found', pwWrite.length > 0);
  ck('the password form is cleared only after the write lands',
    pwWrite.indexOf('await dbUpdateUser(changePwUser.id') < pwWrite.indexOf('setChangePwUser(null)'),
    'reporting "Password updated" before the write leaves the old password live');
  ck('error toasts are held long enough to read', /isError \? 9000 : 3000/.test(ap));
  ck('a self-service password change says the old one still applies',
    /Password NOT changed/.test(rd('src/components/ChangePasswordModal.js')));
  ck('registration says it needs a connection', /cannot be queued offline/.test(rd('src/components/RegisterPage.js')));

  /* Saving a CE issues dozens of spWithRetry calls in batches of five. Offline,
     every one of them used to burn a 1s then a 2s sleep on attempts that could
     not succeed, so the user waited roughly half a minute to be told the work
     had been stored locally -- which was already decided by the first failure. */
  /* The OneDrive scanner reports failures by writing the caught message into
     innerHTML. That message can carry a file or folder name someone else chose,
     so it has to be escaped like any other borrowed text. */
  console.log('\nA failure message shown to the user is escaped:');
  const ml = rd('src/ml_utils.js');
  ck('the scan error is escaped', /_esc\(e\.message\)/.test(ml));
  ck('no raw message reaches innerHTML', !/innerHTML=[^;\n]*\+e\.message/.test(ml),
    'a OneDrive file name is not our text');

  console.log('\nOffline writes fail fast instead of sleeping through a backoff:');
  const retrySrc = (rd('src/auth.js').match(/async function spWithRetry\(fn, attempts = 3\) \{[\s\S]*?\n\}/) || [''])[0];
  ck('spWithRetry found', retrySrc.length > 0);
  const runRetry = async (online, failures) => {
    let calls = 0, slept = 0;
    const ctx = {
      navigator: { onLine: online }, Promise, Error, Math,
      setTimeout: (fn, ms) => { slept += ms; fn(); }
    };
    vm.createContext(ctx);
    vm.runInContext(retrySrc + '\nglobalThis._r=spWithRetry;', ctx);
    let threw = false;
    try {
      await ctx._r(async () => { calls++; if (calls <= failures) throw new Error('network'); return 'ok'; });
    } catch (_e) { threw = true; }
    return { calls, slept, threw };
  };
  const off = await runRetry(false, 9);
  ck('offline, it tries once', off.calls === 1, off.calls);
  ck('offline, it never sleeps', off.slept === 0, off.slept + 'ms');
  ck('offline, the caller still gets the error', off.threw === true,
    'swallowing it would hide the failure from the local-save path');
  const on = await runRetry(true, 9);
  ck('online, all three attempts still happen', on.calls === 3, on.calls);
  ck('online, the backoff is still 1s then 2s', on.slept === 3000, on.slept + 'ms');
  const flaky = await runRetry(true, 1);
  ck('a transient failure still recovers on the second try', flaky.calls === 2 && !flaky.threw, flaky.calls);
  const unknown = await runRetry(undefined, 9);
  ck('an environment with no navigator.onLine keeps retrying', unknown.calls === 3, unknown.calls);

  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall SharePoint-failure-mode assertions passed');
  process.exit(fails ? 1 : 0);
})();
