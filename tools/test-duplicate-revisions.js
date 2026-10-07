/* Which revisions are copies, and which are somebody's work.
   ==========================================================
   Repeated presses of Revise left chains of identical revisions behind. This
   finds them -- and the whole risk is in what it finds by MISTAKE, because
   the row beside each answer has a Delete button on it.

   So the interesting assertions here are the ones about what it refuses to
   flag: a revision whose figures moved, whose line count moved, made by
   somebody else, made days later, or that is not the next revision in the
   run. And a revision that has been submitted or signed is never offered for
   deletion however much it looks like a copy -- the approval trail names it.

   The function is lifted from the shipped db.js and run against fabricated
   SharePoint rows, so what is tested is the code that ships.

   Run: node tools/test-duplicate-revisions.js */
'use strict';
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const db = R('src/db.js');
const app = R('src/App.js');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const NL = String.fromCharCode(10);

/* The real ceFamily, and the real finder. */
const famSrc = app.slice(app.indexOf('const CE_REV_RE = '), app.indexOf('/* Collapse a list of CEs'));
const findSrc = db.slice(db.indexOf('const _DUP_REV_WINDOW_MS'), db.indexOf('async function dbSaveHistory(e){'));

/* A stand-in SharePoint: the selects the finder makes, and nothing else. */
const mk = (heads, mp, res) => {
  const spGet = async (list, filter, select) => {
    if (list === 'CE_MP') return mp.map(id => ({ Id: 0, shicCEId: id }));
    if (list === 'CE_Resources') return res.map(id => ({ Id: 0, shicCEId: id }));
    if (select && select.indexOf('shicInfo') >= 0) {
      const want = String(filter || '').split(' or ').map(t => Number(t.replace('Id eq', '').trim()));
      return heads.filter(h => want.indexOf(h.Id) >= 0)
        .map(h => ({ Id: h.Id, shicInfo: JSON.stringify({ approval: h._apv ? { state: h._apv } : undefined }) }));
    }
    return heads;
  };
  return new Function('spGet', 'spList', 'getSiteURL', 'USE_SP', 'ceFamily',
    famSrc + NL + findSrc + NL + 'return dbFindDuplicateRevisions;'
  )(spGet, x => x, () => 'https://site', true, undefined);
};

/* Three revisions of one CE, twenty seconds apart, identical in every way
   the finder looks at -- which is what a spam-clicked Revise produced. */
const T = (n, over) => Object.assign({
  Id: n, Title: 'SY3-CE-2026-0148' + (n === 1 ? '' : '-R' + (n - 1)),
  shicTotal: 250000, shicSavedBy: 'aljon', shicClient: 'Petron',
  shicDesc: 'Turnaround support',
  shicSavedAt: new Date(Date.UTC(2026, 8, 29, 2, 0, (n - 1) * 20)).toISOString()
}, over || {});
const at = (h, m, s) => new Date(Date.UTC(2026, 8, 29, h, m, s)).toISOString();

(async () => {
  console.log('a chain left by repeated clicks:');
  let find = mk([T(1), T(2), T(3)], [1, 1, 2, 2, 3, 3], [1, 1, 1, 2, 2, 2, 3, 3, 3]);
  let g = await find();
  ck('the chain is found as one group', g.length === 1, g.length);
  ck('the lowest revision is the one to keep',
    g[0] && g[0].keep.ceNum === 'SY3-CE-2026-0148', g[0] && g[0].keep.ceNum);
  ck('and the two after it are the copies',
    g[0] && g[0].extras.map(e => e.ceNum).join() === 'SY3-CE-2026-0148-R1,SY3-CE-2026-0148-R2',
    g[0] && g[0].extras.map(e => e.ceNum).join());

  console.log(NL + 'what it must NOT call a copy:');
  const only = async (heads, mp, res) =>
    await mk(heads, mp || [1, 1, 2, 2], res || [1, 1, 1, 2, 2, 2])();
  ck('a revision whose total moved, by one centavo',
    (await only([T(1), T(2, { shicTotal: 250000.01 })])).length === 0);
  ck('a revision with a different number of lines',
    (await only([T(1), T(2)], [1, 1, 2], [1, 1, 1, 2, 2, 2])).length === 0);
  ck('a revision somebody else made',
    (await only([T(1), T(2, { shicSavedBy: 'kenneth2026' })])).length === 0);
  ck('a revision for a different client',
    (await only([T(1), T(2, { shicClient: 'Shell' })])).length === 0);
  ck('a revision with a different description',
    (await only([T(1), T(2, { shicDesc: 'Shutdown scope' })])).length === 0);
  /* The window is what separates a spam click from a real revision that
     happened not to change the figures yet. */
  ck('a revision saved the next day',
    (await only([T(1), T(2, { shicSavedAt: new Date(Date.UTC(2026, 8, 30, 2, 0, 0)).toISOString() })])).length === 0);
  ck('a revision saved an hour later',
    (await only([T(1), T(2, { shicSavedAt: at(3, 0, 0) })])).length === 0);
  ck('but one saved four minutes later IS one',
    (await only([T(1), T(2, { shicSavedAt: at(2, 4, 0) })])).length === 1);
  /* R1 and R5 with nothing between them are not a run. */
  ck('revisions that are not consecutive',
    (await only([T(1), T(2, { Title: 'SY3-CE-2026-0148-R5' })])).length === 0);
  ck('a CE with no revisions at all',
    (await only([T(1)], [1, 1], [1, 1, 1])).length === 0);
  ck('two unrelated CEs that happen to cost the same',
    (await only([T(1), T(2, { Title: 'SY3-CE-2026-0999' })])).length === 0);

  console.log(NL + 'and what it refuses to offer for deletion:');
  find = mk([T(1), T(2, { _apv: 'pending' }), T(3)], [1, 1, 2, 2, 3, 3], [1, 1, 1, 2, 2, 2, 3, 3, 3]);
  g = await find();
  const byNum = {};
  g.forEach(x => x.extras.forEach(e => { byNum[e.ceNum] = e; }));
  ck('one that is out for signature is marked, not offered',
    byNum['SY3-CE-2026-0148-R1'] && byNum['SY3-CE-2026-0148-R1'].locked === true,
    JSON.stringify(byNum['SY3-CE-2026-0148-R1']));
  ck('and it says what state it is in, so the reason is visible',
    byNum['SY3-CE-2026-0148-R1'] && byNum['SY3-CE-2026-0148-R1'].apvState === 'pending');
  ck('the stray beside it is still offered',
    byNum['SY3-CE-2026-0148-R2'] && byNum['SY3-CE-2026-0148-R2'].locked === false);
  for (const st of ['approved', 'returned']) {
    const gg = await mk([T(1), T(2, { _apv: st })], [1, 1, 2, 2], [1, 1, 1, 2, 2, 2])();
    ck('a ' + st + ' revision is never offered', gg[0].extras[0].locked === true);
  }
  /* Withdrawn is the estimator taking it back; nobody is acting on it. */
  const wd = await mk([T(1), T(2, { _apv: 'withdrawn' })], [1, 1, 2, 2], [1, 1, 1, 2, 2, 2])();
  ck('a withdrawn one is offered like any other', wd[0].extras[0].locked === false);

  console.log(NL + 'and the panel around it:');
  const panel = R('src/components/FbSetupPanel.js');
  ck('nothing is deleted without a confirmation naming the CE',
    panel.indexOf("await uiConfirm('Delete '+row.ceNum") > 0);
  ck('deletion goes through the permission check, not round it',
    panel.indexOf('dbDeleteHistory(row.id,(currentUser||{}).role)') > 0 &&
    db.indexOf('if(!hasAdminPowers(actorRole)) throw new Error') > 0);
  ck('the panel is given the user whose permission that is',
    R('src/components/AdminPanel.js').indexOf('FbSetupPanel, { currentUser }') > 0);
  /* A locked row must not have a Delete button at all -- a disabled button is
     still a button somebody finds a way to press. */
  ck('a locked row shows no Delete button to press',
    panel.indexOf('e.locked') > 0 && panel.indexOf("? React.createElement('span'") > 0);
  ck('there is a button to run the check', panel.indexOf("'Find duplicate revisions'") > 0);
  /* The finder answers a question. Acting on the answer is a separate, human
     act -- so the finder must hold no write of any kind. */
  ck('and the finder itself only ever reads',
    findSrc.indexOf('spDelete') < 0 && findSrc.indexOf('spPatch') < 0 && findSrc.indexOf('spPost') < 0);

  console.log(bad ? NL + bad + ' FAILURE(S)' : NL + 'duplicate revisions OK');
  process.exit(bad ? 1 : 0);
})();
