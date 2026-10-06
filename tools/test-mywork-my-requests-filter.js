/* A requestor's My requests table has its own filter box: every word typed must be found in the row, in any order.
   Run: node tools/test-mywork-my-requests-filter.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
ck('a box above the table, with Clear', app.indexOf("'aria-label':'Filter my requests'") > 0 && app.indexOf("const [mwReqQ, setMwReqQ] = useState('')") > 0 && app.indexOf("onClick:()=>setMwReqQ('')") > 0);
ck('the table and its count follow the filter', app.indexOf('tbody", null, sentShown.map(x =>') > 0 && app.indexOf("sentShown.length + ' of ' + sent.length") > 0);
ck('no match says so', app.indexOf("'No request matches \"' + mwReqQ") > 0);
const a = app.indexOf('const _rqw = '), e = app.indexOf('const fDrafts', a);
const run = (q, sent) => new Function('mwReqQ', 'sent', '_rowHay', app.slice(a, e) + '; return sentShown.map(x => x.e.id);')(q, sent, x => (x.e.info.requestNum + ' ' + x.e.info.client + ' ' + x.m.ceeName));
const S = [{ e: { id: 1, info: { requestNum: 'RCE-1', client: 'HEDCOR', reviewStatus: 'returned', reviewNote: 'add photos' } }, m: { ceeName: 'Ana Cruz' } },
  { e: { id: 2, info: { requestNum: 'RCE-2', client: 'UPPC' } }, m: { ceeName: 'Ben Reyes' } }];
ck('empty shows all; words in any order; the review status and note are searched', run('', S).length === 2 && run('ben uppc', S).join() === '2' && run('returned photos', S).join() === '1' && run('zzz', S).length === 0);
process.exit(bad ? 1 : 0);
