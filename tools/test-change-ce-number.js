/* An admin can change the number of a saved CE, in place.
   Run: node tools/test-change-ce-number.js */
'use strict';
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const db = rd('src/db.js'), app = rd('src/App.js'), mon = rd('src/components/MonitoringPanel.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = db.indexOf('async function dbRenameCE('), b = db.indexOf('/* The Cost Estimation team accepts a request');
ck('dbRenameCE is in db.js before dbAcceptRequest', a > 0 && b > a);
const src = db.slice(a, b);
const run = async (stored, patchFailsOn) => {
  const patches = [], put = [];
  const f = new Function('USE_SP', 'getSiteURL', 'spGet', 'spPatch', 'spList', 'spWithRetry', '_monRowsFor', '_ceLoadLocal', 'cePut', 'logSwallowed',
    src + '\nreturn dbRenameCE;')(true, () => '', async () => stored, async (l, id, body) => { if (patchFailsOn && patchFailsOn(l, body)) throw new Error('400'); patches.push([l, id, body]); }, n => n, fn => fn(),
    async () => [{ Id: 900 }], async () => ({ id: 7, ceNum: 'SHIC-CE-2026-1297', info: { ceNum: 'SHIC-CE-2026-1297', x: 1 } }), async r => { put.push(r); }, () => {});
  return { res: await f(7, 'SHIC-CE-2026-1297', 'SY3-CE-2026-1297', 'jhuniel'), patches, put };
};
(async () => {
  const ok = await run([{ Id: 7, Title: 'SHIC-CE-2026-1297', shicInfo: JSON.stringify({ ceNum: 'SHIC-CE-2026-1297', client: 'Acme', acceptedCeNum: 'SHIC-CE-2026-1297' }) }]);
  const ce = ok.patches.find(p => p[0] === 'CEs'), mo = ok.patches.find(p => p[0] === 'Monitoring');
  ck('the CE keeps its id and gets the new title', ok.res.ok && ce[1] === 7 && ce[2].Title === 'SY3-CE-2026-1297');
  ck('the number inside the saved header is rewritten and the rest of it kept', JSON.parse(ce[2].shicInfo).ceNum === 'SY3-CE-2026-1297' && JSON.parse(ce[2].shicInfo).client === 'Acme' && JSON.parse(ce[2].shicInfo).acceptedCeNum === 'SY3-CE-2026-1297');
  ck('the old number is kept in the CE record, with who and when', JSON.parse(ce[2].shicInfo).previousCeNums[0].num === 'SHIC-CE-2026-1297' && JSON.parse(ce[2].shicInfo).previousCeNums[0].by === 'jhuniel');
  ck('the Monitoring row follows, title and number', mo[1] === 900 && mo[2].Title === 'SY3-CE-2026-1297' && mo[2].shicCENum === 'SY3-CE-2026-1297');
  ck('the offline copy follows', ok.put.length === 1 && ok.put[0].ceNum === 'SY3-CE-2026-1297' && ok.put[0].info.ceNum === 'SY3-CE-2026-1297' && ok.put[0].info.x === 1);
  const nocol = await run([{ Id: 7, Title: 'SHIC-CE-2026-1297', shicInfo: '' }], (l, body) => l === 'Monitoring' && 'shicCENum' in body);
  ck('a site without the shicCENum column still renames, on the title alone', nocol.res.ok && nocol.patches.some(p => p[0] === 'Monitoring' && p[2].Title === 'SY3-CE-2026-1297' && !('shicCENum' in p[2])));
  const moved = await run([{ Id: 7, Title: 'SHIC-CE-2026-9999', shicInfo: '' }]);
  ck('it refuses when the CE is no longer under the number the admin saw, and changes nothing', !moved.res.ok && /reload/.test(moved.res.reason) && moved.patches.length === 0);
  const gone = await run([]);
  ck('it refuses a CE that is not on the site', !gone.res.ok && gone.patches.length === 0);
  const c = app.indexOf('const renameCeNum = async e => {'), d = app.indexOf('/* The Cost Estimation team accepts a request: only now');
  const fn = app.slice(c, d);
  ck('renameCeNum is admin-only', c > 0 && d > c && fn.includes("if (!isAdmin) {"));
  ck('it leaves an unsaved draft, an unaccepted request, and a CE with revisions alone', fn.includes('e._draft || typeof e.id') && fn.includes('i0.request && !i0.acceptedCeNum') && fn.includes('e._isRev || (e._revs || []).length'));
  ck('it leaves a CE that is out for approval, approved or superseded alone', fn.includes("st === 'pending' || st === 'approved' || st === 'superseded'"));
  ck('the new number is checked in both company sequences, ignoring the CE own old number', fn.includes('dbFindCEByNum(newNum)') && fn.includes('dbFindCESeqClash(newNum, ceNums.filter('));
  ck('the lists, the browser copy and the number box follow', fn.includes('setHistory(p => p.map(re))') && fn.includes("LS.set('history'") && fn.includes('setCeNums(') && fn.includes('setInfo(p =>') && fn.includes('_ownNum.current = newNum'));
  ck('it is written to the audit log', fn.includes("auditLog('change_ce_number', old + ' -> ' + newNum"));
  ck('the Monitoring panel gets it, and shows the button to an admin in Edit mode only', app.includes('MonitoringPanel({ renameCeNum,') && mon.includes('    renameCeNum,') &&
    mon.includes("isAdmin && editingRow === e.id && !e._draft && !e._isRev && typeof e.id === 'number'") && mon.includes('onClick: () => renameCeNum(e)'));
  process.exit(bad ? 1 : 0);
})();
