#!/usr/bin/env node
/*
 * Archiving old CEs. CE_MP / CE_Resources only grow (~40 rows a CE); a closed CE nobody has touched for two years can have its line items
 * moved into a file the admin keeps. The header stays, so Monitoring and the Dashboard are unchanged; the CE is flagged info.archived and
 * will not open (it would be an empty estimate) until the file is restored.
 *
 * Runs the real db functions against an in-memory SharePoint. Run: node tools/test-archive-ces.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
const admin = fs.readFileSync('src/components/AdminPanel.js', 'utf8');
const panel = fs.readFileSync('src/components/LocalToSPSync.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = db.indexOf('const _ARCH_MP_COLS'), b = db.indexOf('async function dbSaveShiftRates');
if (a < 0 || b < 0) { console.error('archive functions not found'); process.exit(1); }

const old = '2022-01-10T00:00:00Z', recent = new Date().toISOString();
function world() {
  const S = {
    CEs: [
      { Id: 1, Title: 'SHIC-CE-2022-0001', shicTotal: 100, shicSavedAt: old, shicInfo: JSON.stringify({ ceNum: 'SHIC-CE-2022-0001' }) },
      { Id: 2, Title: 'SHIC-CE-2022-0002', shicTotal: 200, shicSavedAt: old, shicInfo: '{}' },
      { Id: 3, Title: 'SHIC-CE-2026-0003', shicTotal: 300, shicSavedAt: recent, shicInfo: '{}' },
      { Id: 4, Title: 'SHIC-CE-2022-0004', shicTotal: 400, shicSavedAt: old, shicInfo: JSON.stringify({ archived: { at: 'x' } }) },
      { Id: 5, Title: 'SHIC-CE-2022-0005', shicTotal: 500, shicSavedAt: old, shicInfo: '{}' }
    ],
    CE_MP: [], CE_Resources: []
  };
  let id = 100;
  const mp = (ce, role) => S.CE_MP.push({ Id: ++id, shicCEId: ce, shicRole: role, shicRate: 10, shicShift: 'regular_day', shicDays: 2, shicPax: 3, shicShares: '' });
  const rs = (ce, d) => S.CE_Resources.push({ Id: ++id, shicCEId: ce, shicTab: 'tools', shicDesc: d, shicQty: 1, shicUOM: 'Lot', shicCost: 5, shicTaskId: 't1' });
  [1, 2, 3, 5].forEach(c => { mp(c, 'Welder'); mp(c, 'Helper'); rs(c, 'Grinder'); });
  const mon = { 1: { status: 'Awarded', dateRecv: '2022-01-05' }, 2: { status: 'Ongoing' }, 3: { status: 'Awarded' }, 4: { status: 'Awarded' }, 5: { status: 'Cancelled', dateRecv: '2026-09-01' } };
  const calls = { del: [], patch: [], post: [] };
  const sandbox = {
    USE_SP: true, getSiteURL: () => 'x', Date, Math, Number, String, Array, Object, Set, JSON, Promise, RegExp, Error, parseInt,
    spList: n => n, _spInvalidateBigList() {},
    spWithRetry: f => f(),
    spGet: async (list, filter, sel) => {
      let r = S[list].slice();
      let m;
      if (filter && (m = filter.match(/^Id eq (\d+)$/))) r = r.filter(x => x.Id === Number(m[1]));
      else if (filter && (m = filter.match(/^Title eq '(.*)'$/))) r = r.filter(x => x.Title === m[1].replace(/''/g, "'"));
      return r.map(x => ({ ...x }));
    },
    _spGetByCE: async (list, ceId) => S[list].filter(x => x.shicCEId === ceId).map(x => ({ ...x })),
    spPatch: async (list, id2, o) => { calls.patch.push([list, id2]); Object.assign(S[list].find(x => x.Id === id2), o); },
    spDelete: async (list, id2) => { calls.del.push(id2); S[list] = S[list].filter(x => x.Id !== id2); },
    spPost: async (list, o) => { calls.post.push(list); S[list].push({ Id: ++id, ...o }); return { Id: id }; },
    dbGetMon: async () => mon,
    statusNames: () => [], statusGroupMembers: () => ['Approved', 'Submitted', 'Awarded', 'No Quote', 'Cancelled', 'Superseded']
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(db.slice(a, b) + '\nthis.find=dbFindArchivable;this.arch=dbArchiveCEs;this.rest=dbRestoreArchive;', ctx);
  return { S, calls, ctx };
}

(async () => {
  let w = world();
  const found = await w.ctx.find(24);
  ck('a closed CE not touched for two years is a candidate', found.some(x => x.id === 1), JSON.stringify(found.map(x => x.id)));
  ck('an open CE (Ongoing) is not', !found.some(x => x.id === 2));
  ck('a recent CE is not', !found.some(x => x.id === 3));
  ck('one already archived is not', !found.some(x => x.id === 4));
  ck('one received recently is not, however old its last save', !found.some(x => x.id === 5));
  ck('the line count is reported', found[0] && found[0].rows === 3);

  /* not confirmed -> nothing deleted */
  const items = found.filter(x => x.id === 1);
  let delivered = null;
  let r = await w.ctx.arch(items, async bundle => { delivered = bundle; return false; });
  ck('the file is built before anything is deleted, and stopping deletes nothing', !!delivered && r.stopped === true && w.calls.del.length === 0 && w.S.CE_MP.length === 8);
  ck('the file holds every line with its figures', delivered.ces[0].mp.length === 2 && delivered.ces[0].res.length === 1 && delivered.ces[0].mp[0].shicRate === 10 && delivered.ces[0].res[0].shicDesc === 'Grinder');

  /* confirmed */
  r = await w.ctx.arch(items, async bundle => { delivered = bundle; return true; });
  ck('once confirmed, its lines are deleted and nobody else\'s', r.archived === 1 && r.rows === 3 && !w.S.CE_MP.some(x => x.shicCEId === 1) && w.S.CE_MP.some(x => x.shicCEId === 2) && w.S.CE_Resources.some(x => x.shicCEId === 3));
  ck('the header is flagged archived and keeps its total', JSON.parse(w.S.CEs[0].shicInfo).archived && JSON.parse(w.S.CEs[0].shicInfo).archived.mp === 2 && w.S.CEs[0].shicTotal === 100);
  ck('it is flagged before its rows are removed', w.calls.patch.length >= 1);
  const again = await w.ctx.find(24);
  ck('an archived CE is never offered twice', !again.some(x => x.id === 1));

  /* restore */
  const file = JSON.parse(JSON.stringify(delivered));
  const log = [];
  let rr = await w.ctx.rest(file, m => log.push(m));
  const back = w.S.CE_MP.filter(x => x.shicCEId === 1);
  ck('restoring puts the lines back, same figures', rr.restored === 1 && back.length === 2 && back.some(x => x.shicRole === 'Welder' && x.shicRate === 10 && x.shicPax === 3) && w.S.CE_Resources.some(x => x.shicCEId === 1 && x.shicDesc === 'Grinder' && x.shicTaskId === 't1'));
  ck('restored rows are new rows of the same CE, with no old Id carried over', back.every(x => x.shicCEId === 1) && w.calls.post.length === 3);
  ck('the archived flag is cleared', !JSON.parse(w.S.CEs[0].shicInfo).archived && JSON.parse(w.S.CEs[0].shicInfo).ceNum === 'SHIC-CE-2022-0001');
  rr = await w.ctx.rest(file, () => {});
  ck('restoring twice never doubles the lines', rr.restored === 0 && rr.skipped === 1 && w.S.CE_MP.filter(x => x.shicCEId === 1).length === 2);
  let threw = false; try { await w.ctx.rest({ nope: 1 }, () => {}); } catch (e) { threw = true; }
  ck('a file that is not an archive is refused', threw);

  /* the rest of the app */
  ck('an archived CE comes back from dbLoadCE flagged _archived and _partial, with its saved total', db.includes('_ac._partial=true;_ac._archived=_arch;'));
  ck('opening it is refused with a message, before and after the fetch', (app.match(/if \(d\._archived\)/g) || []).length >= 2 && app.includes('is archived'));
  ck('saving an archived CE with no lines is refused at the database layer', db.includes('are archived. Restore the archive file first'));
  ck('the totals check skips archived CEs (it would "fix" them to zero)', admin.includes('full._archived'));
  ck('the damaged-CE finders skip archived CEs', db.includes('.filter(h=>!_isArch(h))') && db.includes('if(_isArch(h)){skipped++;continue;}'));
  ck('the admin sync panel has Archive old CEs', panel.includes('React.createElement(ArchiveOldCEs, null)') && panel.includes('File is saved, delete now'));
  console.log(bad ? bad + ' FAILURE(S)' : 'Archive OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
