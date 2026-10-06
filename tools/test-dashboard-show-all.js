/* The Dashboard's Open CEs and Overdue requests lists can be opened to every row, and Open CEs can be filtered.
   Run: node tools/test-dashboard-show-all.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
ck('state holds which list is opened', app.indexOf('const [dashAll, setDashAll] = useState({});') > 0);
ck('Open CEs: first 15, or all once opened', app.indexOf('openShown.slice(0, dashAll.open ? openShown.length : 15)') > 0);
ck('a button says how many and toggles', app.indexOf("'Show all ' + openShown.length + (_dq.length ? ' matching' : '') + ' open CEs'") > 0 && app.indexOf('setDashAll(p=>({...p,open:!p.open}))') > 0);
ck('opened to all, it scrolls inside a box with the header kept in view', app.indexOf("maxHeight:dashAll.open ? 560 : 'none'") > 0 && app.indexOf("position:'sticky',top:0,background:CARD") > 0);
ck('Overdue requests the same', app.indexOf('reqShown.slice(0, dashAll.over ? reqShown.length : 15)') > 0 && app.indexOf("'Show all ' + reqShown.length + (_rq.length ? ' matching' : '') + ' overdue requests'") > 0);
ck('Overdue requests have the same filter box', app.indexOf("'aria-label':'Filter overdue requests'") > 0 && app.indexOf('_rq.every(w => hay.indexOf(w) >= 0)') > 0 && app.indexOf("onClick:()=>setDashReqQ('')") > 0 && app.indexOf("'No overdue request matches") > 0);
{ const a2 = app.indexOf('const _rq = '), e2 = app.indexOf('\n  });', app.indexOf('const reqShown', a2)) + 6;
  const runR = q => new Function('dashReqQ', 'reqOverdueRows', app.slice(a2, e2) + '; return reqShown.map(x => x.h.id);')(q, [
    { h: { id: 1, info: { requestNum: 'RCE-1', client: 'HEDCOR', description: 'Pump seal' } }, m: { ceeName: 'Ana Cruz', receivedBy: 'Jess' } },
    { h: { id: 2, info: { requestNum: 'RCE-2', client: 'UPPC', description: 'Boiler tube' } }, m: { ceeName: 'Ben Reyes', receivedBy: 'Jess' } }]);
  ck('requests: empty shows all, words match in any order, a stranger matches none', runR('').length === 2 && runR('jess ben').join() === '2' && runR('hedcor').join() === '1' && runR('zzz').length === 0); }
ck('the old "see the CE Monitoring tab" dead end is gone', app.indexOf('more \\u2014 see the CE Monitoring tab') < 0 && app.indexOf('more — see the CE Monitoring tab') < 0);

console.log('\nthe filter box:');
ck('a box sits above the list', app.indexOf("'aria-label':'Filter open CEs'") > 0 && app.indexOf("const [dashQ, setDashQ] = useState('')") > 0);
ck('every word typed must be found in some column', app.indexOf('_dq.every(w => hay.indexOf(w) >= 0)') > 0);
ck('the header says how many of the total match, and Clear empties it', app.indexOf("openShown.length + ' of ' + openCEs.length") > 0 && app.indexOf("onClick:()=>setDashQ('')") > 0);
ck('no match says so', app.indexOf("'No open CE matches") > 0);
const a = app.indexOf('const _dq = '), e = app.indexOf('\n  });', app.indexOf('const openShown', a)) + 6;
const run = q => new Function('dashQ', 'openCEs', app.slice(a, e) + '; return openShown.map(x => x.h.id);')(q, [
  { h: { id: 1, info: { ceNum: 'SY3-CE-1', client: 'HEDCOR', description: 'Pump seal' } }, m: { ceeName: 'Ana Cruz', status: 'Ongoing' } },
  { h: { id: 2, info: { ceNum: 'SY3-CE-2', client: 'UPPC', description: 'Boiler tube' } }, m: { ceeName: 'Ben Reyes', status: 'Pending' } },
  { h: { id: 3, info: { ceNum: 'SHIC-CE-3', client: 'HEDCOR', description: 'Valve' } }, m: { ceeName: 'Ben Reyes', status: 'Pending' } }]);
ck('empty: all', run('').length === 3);
ck('one word, any case, any column', run('hedcor').join() === '1,3' && run('ana').join() === '1');
ck('two words in any order', run('ben pending').join() === '2,3' && run('hedcor ben').join() === '3');
ck('no match: none', run('zzz').length === 0);
process.exit(bad ? 1 : 0);
