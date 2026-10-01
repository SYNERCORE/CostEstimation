/* Monitoring past SharePoint's 5,000-item threshold. A filter SharePoint will
   not run must degrade to a walk of the list, never to a failed save (which
   would write a second row) or a Monitoring table that will not load.
   Run: node tools/test-monitoring-threshold.js */
'use strict';
const fs = require('fs');
const db = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'db.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || x === undefined ? '' : '  -> ' + x)); if (!c) bad++; };
const src = db.slice(db.indexOf('async function _monRowsFor(numId,ceNum){'), db.indexOf('/* ── The approval mirror'));
const ROWS = [
  { Id: 1, Title: 'config', shicCEId: null, shicMonData: '{}' },
  { Id: 2, Title: 'SY3-CE-2026-0001', shicCEId: 11, shicMonData: '{}' },
  { Id: 3, Title: 'SY3-CE-2026-0002', shicCEId: 12, shicMonData: '{}' },
  { Id: 4, Title: 'SY3-CE-2026-0001', shicCEId: 0, shicMonData: '{}' }];
const mk = (refuse) => {
  const calls = [];
  const spGet = async (l, f) => { calls.push(f || '(none)'); if (f && refuse) throw new Error('SP get SHICCE_Monitoring: this list has passed the SharePoint 5,000-item view threshold'); return f ? [] : ROWS; };
  return { calls, fn: new Function('spGet', 'spList', src + '; return _monRowsFor;')(spGet, x => x) };
};
(async () => {
  let m = mk(true);
  let r = await m.fn(11, 'SY3-CE-2026-0001');
  ck('a refused filter falls back to walking the list', m.calls.indexOf('(none)') >= 0);
  ck('and finds the row by id and by number', r.map(x => x.Id).sort().join() === '2,4', r.map(x => x.Id).join());
  ck('never returns the legacy config row', r.every(x => x.Title !== 'config'));
  m = mk(false);
  r = await m.fn(11, 'SY3-CE-2026-0001');
  ck('when the filter works it is used and the list is not walked', m.calls.indexOf('(none)') < 0);
  const bare = new Function('spGet', 'spList', src + '; return _monRowsFor;')(async () => { throw new Error('SP get X: 500 boom'); }, x => x);
  let threw = false; try { await bare(1, 'A'); } catch (e) { threw = true; }
  ck('any other failure still surfaces', threw);
  ck('the whole-table reads no longer filter on Title', db.indexOf("\"Title ne 'config'\"") < 0);
  console.log(bad ? bad + ' FAILURE(S)' : 'monitoring threshold OK');
  process.exit(bad ? 1 : 0);
})();
