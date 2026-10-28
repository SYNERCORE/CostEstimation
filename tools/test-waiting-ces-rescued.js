/* When the full CE list cannot be read, the CEs waiting on this person are still fetched by Id, and the empty list says why.
   Run: node tools/test-waiting-ces-rescued.js */
'use strict';
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const db = rd('src/db.js'), imp = rd('src/components/AppImports.js'), app = rd('src/App.js'), mon = rd('src/components/MonitoringPanel.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const a = db.indexOf('const _histCols'), b = db.indexOf('\n', db.indexOf('async function dbGetHistory('));
const seen = [];
const run = new Function('USE_SP', 'getSiteURL', 'spList', '_spGetTolerant', 'LS', 'window',
  db.slice(a, b) + '; return {dbGetHistory, dbGetHistoryByIds};');
const w = {};
const mk = (tol) => run(true, () => '', () => 'CEs', tol, { get: () => [] }, w);

(async () => {
  const f1 = mk(async (l, f, s) => { seen.push(f); return [{ Id: 7, Title: 'CE-7', shicSavedBy: 'x' }, { Id: 9, Title: 'CE-9', shicSavedBy: 'x' }]; });
  const r = await f1.dbGetHistoryByIds([7, '9', 'junk']);
  ck('asks for the named Ids only, as one query', seen[0] === 'Id eq 7 or Id eq 9');
  ck('returns them as list rows', r.length === 2 && r[0].id === 7 && r[0].info.ceNum === 'CE-7');
  ck('nothing named, nothing asked', (await f1.dbGetHistoryByIds([])).length === 0 && seen.length === 1);

  const f2 = mk(async () => { throw new Error('SP 500 on CEs'); });
  const h = await f2.dbGetHistory('u', true);
  ck('a failed list read is remembered for the screen', w.shicHistErr === 'SP 500 on CEs' && Array.isArray(h));
  const f3 = mk(async () => [{ Id: 1, Title: 'A', shicSavedBy: 'u' }]);
  await f3.dbGetHistory('u', true);
  ck('a good read clears it', w.shicHistErr === '');

  ck('loadHist fetches the CEs waiting on the user when the list lacks them', /apvMonWaitsOn\(monData\[id\], me\)/.test(imp) && /dbGetHistoryByIds\(need\)/.test(imp));
  ck('App hands loadHist the monitoring rows', /monData: _monRef\.current/.test(app));
  ck('someone who sees every CE has the missing ones asked for again', /canSeeAll \? \(id => apvMonWaitsOn/.test(app));
  ck('the empty list says why, not "No saved estimates"', /No CEs match the filters/.test(mon) && /has no CE in SharePoint/.test(mon) && /could not be read from SharePoint/.test(mon));
  ck('rows SharePoint confirmed have no CE can be cleared, after a confirmation', mon.includes('stale approval request') && mon.includes("uiConfirm('Clear the approval request") && mon.includes('r.asked.includes(id) && !r.found.includes'));
  process.exit(bad ? 1 : 0);
})();
