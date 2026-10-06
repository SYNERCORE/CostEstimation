/* My Work has a filter box that narrows its lists; every word typed must be found in a row, in any order.
   Run: node tools/test-mywork-filter.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
ck('a box above the lists, with Clear', app.indexOf("'aria-label':'Filter my work'") > 0 && app.indexOf("const [mwQ, setMwQ] = useState('')") > 0 && app.indexOf("onClick:()=>setMwQ('')") > 0);
ck('every word must be found, in any order', app.indexOf('_mq.every(w => String(hay).toLowerCase().indexOf(w) >= 0)') > 0);
ck('every list and the group counts follow the filter; the cards stay totals', app.indexOf('const n = [fToSign.length, fReturned.length, fOpen.length, fDrafts.length, fInApproval.length') > 0 && app.indexOf("section('📂 My open CEs', fOpen,") > 0 && app.indexOf("section('📝 My drafts', fDrafts,") > 0 && app.indexOf("kpi('Open CEs assigned', open.length") > 0);
ck('a group with no match says so', app.indexOf("'Nothing here matches \"' + mwQ") > 0);
const a = app.indexOf('const _mq = '), e = app.indexOf('const fDrafts', a);
const harness = (q, rows) => new Function('mwQ', 'toSign', 'returnedAll', 'open', 'inApproval', 'sent', 'awaitingReq', 'forReview', 'drafts',
  app.slice(a, e) + "const fDrafts = drafts; return {open: fOpen.map(x => x.e.id), sign: fToSign.length};")(q, rows, [], rows, [], [], [], [], []);
const R = [
  { e: { id: 1, info: { ceNum: 'SY3-CE-1', client: 'HEDCOR', description: 'Pump seal' } }, m: { ceeName: 'Ana Cruz', status: 'Ongoing' } },
  { e: { id: 2, info: { ceNum: 'SY3-CE-2', client: 'UPPC', description: 'Boiler tube' } }, m: { ceeName: 'Ben Reyes', status: 'Pending' } }];
ck('empty shows all', harness('', R).open.length === 2);
ck('any word, any case, any column', harness('hedcor', R).open.join() === '1' && harness('ben pending', R).open.join() === '2');
ck('a stranger word matches none', harness('hedcor ben', R).open.length === 0);
process.exit(bad ? 1 : 0);
