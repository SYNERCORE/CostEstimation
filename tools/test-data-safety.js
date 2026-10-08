#!/usr/bin/env node
/*
 * Three data-safety guards, run against the real code in db.js with a stand-in for SharePoint.
 *
 *  1. Saving a CE that someone else saved after it was read here writes nothing and says who/when (dbSaveHistory opts.baseAt). The Save
 *     handler's own question covers changes it can see when the button is pressed; this covers the minutes after.
 *  2. Saving the Scope Library rewrites only the services that changed, not all of them (one row per service).
 *  3. SharePoint list sizes are counted, graded against the 5,000 limit, and an admin hears once a day from 4,000.
 *
 * Run: node tools/test-data-safety.js
 */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');
const helpers = fs.readFileSync('src/helpers.js', 'utf8');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const grab = (re, what) => { const m = db.match(re); if (!m) { console.error('not found in src/db.js: ' + what); process.exit(1); } return m[0]; };
const chgSrc = helpers.slice(helpers.indexOf('function ceChangedSince'), helpers.indexOf('/* Anything that is not a finite number is zero.'));

(async () => {
  /* ---- 1. CE save guard ---- */
  console.log('a CE someone else saved after it was read here:');
  const saveSrc = grab(/async function dbSaveHistory\(e,opts\)\{[\s\S]*?\n(?=\/\* Patch ONLY the stored grand total)/, 'dbSaveHistory');
  const calls = [];
  let row = { Id: 5, shicSavedAt: '2026-10-07T08:00:00.000Z', shicSavedBy: 'ana' };
  const mkSave = () => new Function('spGet', 'spPost', 'spPatch', 'spDelete', 'spList', 'spWithRetry', 'USE_SP', 'getSiteURL', 'LS', 'logSwallowed', 'cePut', '_spInvalidateBigList', '_rowKeysOf', '_shDump', '_srcDump', '_spGetByCE',
    'let _spFailReason="";' + chgSrc + ';' + saveSrc + '; return dbSaveHistory;')(
    async () => [row],
    async (...a) => { calls.push(['post', ...a]); return { Id: 9 }; },
    async (...a) => { calls.push(['patch', ...a]); },
    async (...a) => { calls.push(['delete', ...a]); },
    n => n, fn => fn(), true, () => 'https://x', { get: () => null, set: () => {} }, () => {}, async () => {}, () => {}, () => [], () => '', () => '', async () => []);
  const entry = { info: { ceNum: 'SHIC-CE-1' }, grand: 1, mp: [], tools: [], mats: [], ppe: [] };
  let r = await mkSave()(entry, { baseAt: '2026-10-07T07:00:00.000Z', me: 'ben' });
  ck('nothing is written', calls.length === 0, JSON.stringify(calls.map(c => c[0])));
  ck('and the caller is told who and when', r.sp === false && r.conflict && r.conflict.by === 'ana' && r.conflict.at === row.shicSavedAt);
  ck('the CE is not kept as a local copy that would later overwrite theirs', !('id' in r));
  calls.length = 0;
  r = await mkSave()(entry, { baseAt: '2026-10-07T07:00:00.000Z', me: 'ana' }).catch(() => ({}));
  ck('my own later save is not a conflict', !r.conflict && calls.length > 0);
  calls.length = 0;
  r = await mkSave()(entry, { baseAt: '2026-10-07T08:00:00.000Z', me: 'ben' }).catch(() => ({}));
  ck('a copy read after their save is not a conflict', !r.conflict && calls.length > 0);
  calls.length = 0;
  r = await mkSave()(entry).catch(() => ({}));
  ck('callers that name no base (imports, sync, approvals) behave as before', !r.conflict && calls.length > 0);
  ck('the Save handler passes the copy it checked, and stops on a conflict',
    /dbSaveHistory\(_entry, \{ baseAt: _base, me: currentUser\?\.username \}\)/.test(app) && /if \(_res && _res\.conflict\) \{[\s\S]{0,420}return;\s*\}\s*_loadedAt\.current = /.test(app));

  /* ---- 2. Scope Library ---- */
  console.log('\nthe Scope Library writes only what changed:');
  const libSrc = grab(/async function dbSaveSowLib\(lib,opts\)\{[\s\S]*?\n\}\n(?=async function dbGetSowLib)/, 'dbSaveSowLib');
  const rows = [];
  const lib0 = Array.from({ length: 30 }, (_, i) => ({ id: 's' + i, cat: 'Elec', title: 'Service ' + i, items: [i] }));
  lib0.forEach((s, i) => rows.push({ Id: 100 + i, Title: 'Elec | ' + s.title, shicData: JSON.stringify(s) }));
  const ops = [];
  const save = new Function('spGet', 'spPost', 'spPatch', 'spDelete', 'spList', 'USE_SP', 'getSiteURL', 'logSwallowed', 'lsPut',
    libSrc + '; return dbSaveSowLib;')(
    async () => rows.map(x => ({ ...x })),
    async (l, d) => { ops.push('post'); }, async (l, id, d) => { ops.push('patch'); }, async () => { ops.push('delete'); },
    n => n, true, () => 'https://x', () => {}, () => {});
  let res = await save(lib0);
  ck('the same library again writes nothing', res.sp === true && ops.length === 0, ops.join());
  const lib1 = lib0.map((s, i) => i === 7 ? { ...s, items: [99] } : s);
  ops.length = 0; await save(lib1);
  ck('one edited service is one write', ops.join() === 'patch', ops.join());
  ops.length = 0; await save([...lib0, { id: 'new', cat: 'Elec', title: 'Brand new' }]);
  ck('a new service is one insert', ops.join() === 'post', ops.join());
  ops.length = 0; await save(lib0.filter(s => s.id !== 's3'), { deleted: ['s3'] });
  ck('a named delete is one delete', ops.join() === 'delete', ops.join());

  /* ---- 3. SharePoint list sizes ---- */
  console.log('\nSharePoint list sizes:');
  const sizeSrc = grab(/const SP_LIST_LIMIT=5000,SP_LIST_WARN=4000;[\s\S]*?\nasync function dbFindMonDuplicates/, 'list sizes').replace(/\nasync function dbFindMonDuplicates$/, '');
  const counts = { CEs: 4500, CE_MP: 120, CE_Resources: 5300, Monitoring: 800 };
  const store = {}; const toasts = [];
  const mk = () => new Function('spItemCount', 'spList', 'USE_SP', 'getSiteURL', 'LS', 'window', 'setTimeout',
    sizeSrc + '; return {dbSpListSizes, dbWarnSpListSizes, spSizeLevel};')(
    async name => { const k = name.replace(/^SHICCE_/, ''); if (k === 'Drafts') throw new Error('no such list'); return counts[k] != null ? counts[k] : 10; },
    n => 'SHICCE_' + n, true, () => 'https://x', { get: k => store[k], set: (k, v) => { store[k] = v; } },
    { _shicToast: (m, e) => toasts.push({ m, e }) }, fn => fn());
  const S = mk();
  ck('grades against 4,000 and 5,000', S.spSizeLevel(3999) === 'ok' && S.spSizeLevel(4000) === 'near' && S.spSizeLevel(5000) === 'over' && S.spSizeLevel(null) === 'unknown');
  const sizes = await S.dbSpListSizes();
  ck('every list is counted', sizes.length === 12 && sizes.find(s => s.key === 'CE_Resources').level === 'over' && sizes.find(s => s.key === 'CEs').level === 'near');
  ck('a list that cannot be read is reported, not fatal', sizes.find(s => s.key === 'Drafts').level === 'unknown' && /no such list/.test(sizes.find(s => s.key === 'Drafts').error));
  const hot = await S.dbWarnSpListSizes();
  ck('an admin is warned, naming the lists', hot.length === 2 && toasts.length === 1 && /CE_Resources 5,300/.test(toasts[0].m) && toasts[0].e === true, JSON.stringify(toasts));
  await S.dbWarnSpListSizes();
  ck('and only once a day', toasts.length === 1);
  store.sp_size_checked = '2000-01-01';
  Object.keys(counts).forEach(k => { counts[k] = 50; });
  toasts.length = 0; await S.dbWarnSpListSizes();
  ck('nothing is said when every list has room', toasts.length === 0);
  ck('the check runs for admins only, on a connected site', /if \(isAdmin && \(USE_SP \|\| getSiteURL\(\)\)\) dbWarnSpListSizes\(\)/.test(app));
  ck('the panel offers the same check on demand', /React\.createElement\(SpListSizes, null\)/.test(fs.readFileSync('src/components/LocalToSPSync.js', 'utf8')));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ndata safety OK');
  process.exit(bad ? 1 : 0);
})();
