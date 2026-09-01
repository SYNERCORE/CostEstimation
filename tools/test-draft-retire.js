#!/usr/bin/env node
/*
 * Saving a CE must clear its draft, and must say so when it only reached this
 * browser.
 *
 * Two things went wrong during a bulk upload, and they looked like one:
 *
 *   1. The draft stayed in Resume Work after the CE was saved. The draft id is
 *      built from the CE NUMBER as typed, so any of these left an orphan the
 *      save never touched:
 *        - the number was edited after the draft was written (the normal shape
 *          of a bulk upload: open the extracted CE, the 3-minute autosave fires
 *          under whatever is in the field, then the real number is typed in)
 *        - the number differed by a space or a letter case
 *        - a retried POST had left TWO rows under one Title, and the delete
 *          removed the first one only
 *
 *   2. The CE could not be opened from Monitoring. dbSaveHistory swallows a
 *      SharePoint failure on purpose -- the work stays in the browser rather
 *      than being lost -- and returns {sp:false}. handleSave ignored that and
 *      toasted "Saved!", so a CE that reached nobody looked filed.
 *
 * Run: node tools/test-draft-retire.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* ---- run the real retireDrafts ------------------------------------------ */
const body = app.match(/const retireDrafts = async \(\.\.\.nums\) => \{[\s\S]*?\n  \};/);
if (!body) { console.error('retireDrafts not found'); process.exit(1); }

const mk = (drafts, lastId) => {
  const deleted = [];
  const currentUser = {username: 'aestillore'};
  const draftIdFor = num => 'draft_' + (num || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + currentUser.username;
  const _lastDraftId = {current: lastId || null};
  let kept = drafts;
  const fn = new Function(
    '_live', '_lastAutoSig', '_lastDraftId', 'draftIdFor', 'dbDeleteDraft',
    'sharedDrafts', 'currentUser', 'setSharedDrafts', 'console',
    'return ' + body[0].replace(/^const retireDrafts = /, '').replace(/;$/, '')
  )(
    {current: null}, {current: null}, _lastDraftId, draftIdFor,
    async id => { deleted.push(id); },
    drafts, currentUser,
    f => { kept = f(kept); }, console
  );
  return {fn, deleted, kept: () => kept, _lastDraftId};
};

const d = (id, ceNum) => ({draftId: id, savedBy: 'aestillore', info: {ceNum}});

(async () => {
  console.log('the draft goes when the CE is saved:');
  let t = mk([d('draft_SY3-CE-2026-0058_aestillore', 'SY3-CE-2026-0058')]);
  await t.fn('SY3-CE-2026-0058');
  ck('the plain case', t.deleted.indexOf('draft_SY3-CE-2026-0058_aestillore') >= 0, t.deleted.join(','));
  ck('and it leaves the Resume Work list', t.kept().length === 0);

  /* The number is edited between the autosave and the save. */
  t = mk([d('draft_SHIC-CE-2026-0001_aestillore', 'SHIC-CE-2026-0001')], 'draft_SHIC-CE-2026-0001_aestillore');
  await t.fn('SY3-CE-2026-0058');
  ck('a draft written under the CE number it had BEFORE it was renamed',
    t.deleted.indexOf('draft_SHIC-CE-2026-0001_aestillore') >= 0,
    'this is the bulk-upload case: autosave fires, then the real number is typed in');
  ck('and that row leaves the list too', t.kept().length === 0);

  /* Same CE, different id, because the number carried a space or lower case. */
  t = mk([
    d('draft_SY3-CE-2026-0058__aestillore', 'SY3-CE-2026-0058 '),
    d('draft_sy3-ce-2026-0058_aestillore', 'sy3-ce-2026-0058')
  ]);
  await t.fn('SY3-CE-2026-0058');
  ck('a stray space does not save the draft from being retired', t.deleted.length === 3, t.deleted.join(','));
  ck('nor does the case it was typed in', t.kept().length === 0, JSON.stringify(t.kept()));

  console.log('\nbut it only ever retires this user\'s own drafts:');
  t = mk([{draftId: 'draft_SY3-CE-2026-0058_jubana', savedBy: 'jubana', info: {ceNum: 'SY3-CE-2026-0058'}}]);
  await t.fn('SY3-CE-2026-0058');
  ck('someone else mid-edit on the same number keeps their draft',
    t.deleted.indexOf('draft_SY3-CE-2026-0058_jubana') < 0 && t.kept().length === 1,
    'their work in progress is not ours to delete');

  console.log('\nand the id is not reused after the CE is saved:');
  t = mk([], 'draft_X_aestillore');
  await t.fn('SY3-CE-2026-0058');
  ck('the remembered draft id is cleared', t._lastDraftId.current === null,
    'otherwise the NEXT save retires a draft belonging to the CE before it');

  console.log('\nduplicate rows under one Title:');
  ck('every match is deleted, not just the first',
    /for\(const x of r\)await spDelete\(spList\('Drafts'\),x\.Id\)/.test(db),
    'a retried POST leaves two rows, and deleting one left the draft on screen');

  console.log('\nand a save that reached nobody says so:');
  ck('handleSave looks at what dbSaveHistory returned',
    /const _res = await spWithRetry\(\(\) => dbSaveHistory\(mkEntry\(\)\)\)/.test(app),
    'the return value was discarded, so a browser-only save toasted "Saved!"');
  ck('a browser-only save is reported as such',
    /if \(_res && _res\.sp === false\)/.test(app) && /Saved to THIS BROWSER only/.test(app));
  ck('it names the recovery step', /Push All Local Data to SharePoint/.test(app),
    'the CE is not lost -- it is in this browser and can still be pushed');
  ck('and it is toasted as an error, not as success', /Push All Local Data to SharePoint"\.', true\)/.test(app));
  ck('a real SharePoint save still reports plainly', /Saved! CE ' \+ ceNum \+ ' added to history\./.test(app));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ndraft retire OK');
  process.exit(bad ? 1 : 0);
})();
