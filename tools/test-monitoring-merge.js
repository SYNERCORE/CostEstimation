#!/usr/bin/env node
/*
 * Two people, one CE, in the monitoring table.
 *
 * Monitoring is one SharePoint ITEM PER CE, not one blob for the lot, so this
 * was never as bad as the masterlist -- two people on two different CEs cannot
 * collide at all. But the write carried this browser's WHOLE field object for
 * the CE, built from a copy read at startup. Two people on the SAME CE did
 * collide: setting a status at 10am wrote the deadline back as it stood at 8am,
 * quietly undoing whoever had changed it since. The monitoring table is exactly
 * where several people touch one CE -- the PIC moves the status, somebody else
 * sets the deadline.
 *
 * The edit now names the fields it touched, and only those are taken from this
 * browser. The status trail is merged rather than replaced, because both sides
 * append to a copy read at startup.
 *
 * Run: node tools/test-monitoring-merge.js
 */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const grab = (re, what) => { const m = db.match(re); if (!m) { console.error('not found in src/db.js: ' + what); process.exit(1); } return m[0]; };
const src =
  'const _monSpIdCache={};\n' +
  grab(/function _monMergeLog\(theirs,mine\)\{[\s\S]*?\n\}/, '_monMergeLog') + '\n' +
  grab(/async function dbSaveMonEntry\(ceId, ceNum, monFields, changed\)\{[\s\S]*?\n\}/, 'dbSaveMonEntry');

/* Runs the real dbSaveMonEntry against a fake SharePoint holding `theirs`. */
function run(mine, theirs, changed) {
  let written = null, posted = null;
  const save = new Function(
    'spGet', 'spPost', 'spPatch', 'spWithRetry', 'spList', 'USE_SP', 'getSiteURL', 'console',
    src + '; return dbSaveMonEntry;'
  )(
    async () => theirs === null ? [] : [{Id: 5, shicMonData: JSON.stringify(theirs)}],
    async (l, d) => { posted = JSON.parse(d.shicMonData); return {Id: 5}; },
    async (l, id, d) => { written = JSON.parse(d.shicMonData); },
    fn => fn(),
    n => n, true, () => 'https://x', {warn() {}}
  );
  return save(7, 'SHIC-CE-2026-0001', mine, changed).then(res => ({res, written, posted}));
}

const log = (status, at) => ({status, at, by: 'someone'});

(async () => {
  console.log('setting a status leaves alone what it did not touch:');
  let r = await run(
    {status: 'Submitted', deadline: '2026-09-01', pic: 'JU'},        // my stale copy
    {status: 'Ongoing', deadline: '2026-09-30', pic: 'JU'},          // theirs, deadline moved since
    ['status']
  );
  ck('my status is written', r.written.status === 'Submitted');
  ck("their deadline survives", r.written.deadline === '2026-09-30',
    'this is the bug: an 8am copy of the deadline went back over their 9am change');
  ck('and comes back so the screen agrees', r.res.fields.deadline === '2026-09-30');
  ck('the save reports success', r.res.ok === true);

  console.log('\nand a field I clear really is cleared, not treated as absent:');
  r = await run({deadline: '', status: 'Ongoing'}, {deadline: '2026-09-30', status: 'Ongoing'}, ['deadline']);
  ck('the blank is written', r.written.deadline === '',
    'a merge that skipped empty values would make a deadline impossible to remove');

  console.log('\nthe status trail is merged, not replaced:');
  r = await run(
    {status: 'Submitted', statusLog: [log('Draft', '2026-09-01'), log('Submitted', '2026-09-03')]},
    {status: 'Ongoing', statusLog: [log('Draft', '2026-09-01'), log('Ongoing', '2026-09-02')]},
    ['status', 'statusLog']
  );
  ck('it carries both sides', r.written.statusLog.length === 3, JSON.stringify(r.written.statusLog));
  ck('the shared entry is not doubled',
    r.written.statusLog.filter(h => h.status === 'Draft').length === 1);
  ck('and it stays in time order',
    r.written.statusLog.map(h => h.at).join() === '2026-09-01,2026-09-02,2026-09-03');

  console.log('\na CE nobody has touched yet is created:');
  r = await run({status: 'Draft'}, null, ['status']);
  ck('posted, not patched', r.posted && r.posted.status === 'Draft' && r.written === null);

  console.log('\nthe import path still writes the whole entry, which is what it means:');
  r = await run({status: 'Submitted', deadline: '2026-09-01'}, {status: 'Ongoing', deadline: '2026-09-30'});
  ck('no field list means replace', r.written.deadline === '2026-09-01', JSON.stringify(r.written));

  console.log('\nand "ensure" never overwrites a row it only needed to find:');
  r = await run({}, {status: 'Ongoing', deadline: '2026-09-30'}, 'ensure');
  ck('nothing is written', r.written === null && r.posted === null,
    'the attachment upload only needs an item to attach to');
  ck('and it hands back what the site holds', r.res.fields.status === 'Ongoing');

  console.log('\na refusal is reported, not swallowed:');
  const failing = new Function(
    'spGet', 'spPost', 'spPatch', 'spWithRetry', 'spList', 'USE_SP', 'getSiteURL', 'console',
    src + '; return dbSaveMonEntry;'
  )(
    async () => { throw new Error('403 Forbidden'); },
    async () => {}, async () => {}, fn => fn(),
    n => n, true, () => 'https://x', {warn() {}}
  );
  const f = await failing(7, 'X', {status: 'Draft'}, ['status']);
  ck('ok is false', f.ok === false);
  ck('with the reason', /403/.test(f.reason || ''));

  console.log('\nThe monitoring table acts on all of that:');
  ck('the edit names the fields it touched',
    /const changed = \[\.\.\.Object\.keys\(fields\), \.\.\.Object\.keys\(extra\)\];/.test(app),
    'the stamps a status change adds are part of that edit too');
  ck('and passes them to the save', /dbSaveMonEntry\(ceId, ceNum, n\[ceId\], changed\)/.test(app));
  ck('what came back is shown', /if \(res\.fields\) setMonData/.test(app));
  ck('a refusal turns the badge red and says so',
    /setSyncStatus\(\{monitoring:'error', dirty:true\}\)/.test(app) &&
    /Monitoring change saved in this browser only/.test(app),
    'it used to do nothing at all, so a refused edit looked like an accepted one');
  ck('the attachment upload only ensures the row exists',
    /dbSaveMonEntry\(ceId, ceNum, monData\[ceId\] \|\| \{\}, 'ensure'\)/.test(app));
  ck('opening the tab re-reads the monitoring data',
    /if \(tab !== 'history' \|\| !\(USE_SP \|\| getSiteURL\(\)\)\) return;/.test(app));
  ck('but not over a save in flight',
    /if \(getSyncStatus\(\)\.monitoring === 'saving'\) return;/.test(app));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmonitoring merge OK');
  process.exit(bad ? 1 : 0);
})();
