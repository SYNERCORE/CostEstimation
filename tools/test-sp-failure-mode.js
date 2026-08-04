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
  ck('a silent failure returns null when nobody asked to sign in',
    /if\(!interactive\)\{[\s\S]{0,300}return null;/.test(sp),
    'still falls through to acquireTokenPopup/Redirect on a background read');
  /* Order matters: the guard must sit BEFORE the popup/redirect branch.
     Compare positions in comment-stripped source -- sp.js explains the redirect
     hazard in prose above the guard, and a naive indexOf matches that prose. */
  const spCode = sp.replace(/\/\*[\s\S]*?\*\//g, '');
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

  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall SharePoint-failure-mode assertions passed');
  process.exit(fails ? 1 : 0);
})();
