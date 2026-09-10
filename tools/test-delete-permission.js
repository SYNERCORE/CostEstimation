#!/usr/bin/env node
/*
 * Deleting a CE from Monitoring is an admin/owner action.
 *
 * It used to be `isAdmin || e.savedBy === currentUser.username` -- anyone
 * could delete their own saved CE. A CE is a company record the moment it is
 * saved: it holds the number, the client, the price that was quoted, and other
 * people's work is filed against it. The estimator who typed it is not the
 * person who gets to remove it.
 *
 * A DRAFT is different. It is unsaved personal work, local to one user, and
 * there is no record behind it -- so its owner can still discard it.
 *
 * The button being hidden is not the guarantee. dbDeleteHistory reaches
 * SharePoint and deletes CE_MP and CE_Resources rows, so it refuses on its own.
 *
 * Run: node tools/test-delete-permission.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const db = fs.readFileSync('src/db.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

console.log('the Del button:');
ck('is shown to an admin or the owner',
  /\(isAdmin \|\| \(e\._draft && e\.savedBy === currentUser\.username\)\) && /.test(app));
ck('and the author-of-a-saved-CE case is gone',
  !/isAdmin \|\| e\.savedBy === currentUser\.username/.test(app),
  'a saved CE is a company record, not the estimator\'s to remove');
ck('isAdmin covers the owner too', /const isAdmin = hasAdminPowers\(currentUser\.role\)/.test(app),
  'hasAdminPowers is owner OR admin, so the owner is never locked out');

console.log('\nand the database refuses regardless of the button:');
ck('dbDeleteHistory takes the actor role', /async function dbDeleteHistory\(id,actorRole\)\{/.test(db));
ck('and throws when it is not admin or owner',
  /if\(!hasAdminPowers\(actorRole\)\) throw new Error\('Only an admin or the owner can delete a CE\.'\);/.test(db));
/* Scoped to the function -- db.js deletes rows in several other places. */
const body = db.slice(db.indexOf('async function dbDeleteHistory('));
ck('the check runs before anything is deleted',
  body.indexOf('hasAdminPowers(actorRole)') < body.indexOf('spDelete('),
  'a guard after the first delete leaves half a CE behind');
ck('the call site passes it', /dbDeleteHistory\(e\.id, currentUser\.role\)/.test(app));

console.log('\na draft is still the user\'s own to discard:');
ck('drafts are deleted through deleteDraft, not the CE path',
  /if \(e\._draft\) \{ await deleteDraft\(e\._draft\.draftId\); return; \}/.test(app),
  'it never reaches dbDeleteHistory, so no role is needed');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ndelete permission OK');
process.exit(bad ? 1 : 0);
