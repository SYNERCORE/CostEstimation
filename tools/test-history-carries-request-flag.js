/* The CE list read from SharePoint tells a logged request from an ordinary CE, so Review is offered.
   Run: node tools/test-history-carries-request-flag.js */
'use strict';
const fs = require('fs'), path = require('path');
const db = fs.readFileSync(path.join(__dirname, '..', 'src/db.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = db.indexOf('async function dbGetHistory'), b = db.indexOf('\n', a);
const fn = db.slice(a, b);
ck('the list reads shicInfo, tolerantly', fn.indexOf("_spGetTolerant(spList('CEs'),f,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt,shicInfo')") > 0);
ck('a request keeps its info, an ordinary CE keeps the small one', fn.indexOf('...(pi.request?pi:{})') > 0);
ck('the title, client and description still win', fn.indexOf("ceNum:h.Title,client:h.shicClient||pi.client||'',description:h.shicDesc||pi.description||''") > 0);
// run it: a request row and an ordinary row
const run = new Function('USE_SP', 'getSiteURL', 'spList', '_spGetTolerant', 'LS', fn + '; return dbGetHistory;');
const rows = [{ Id: 1, Title: 'RCE-9', shicInfo: JSON.stringify({ request: true, requestNum: 'RCE-9', rce: { items: {} } }), shicSavedBy: 'a' }, { Id: 2, Title: 'SHIC-CE-1', shicInfo: JSON.stringify({ approval: { big: 1 } }), shicSavedBy: 'a' }, { Id: 3, Title: 'X', shicInfo: '{bad', shicSavedBy: 'a' }];
run(true, () => '', () => 'CEs', async () => rows, { get: () => [] })('a', true).then(h => {
  ck('a request row carries request, requestNum and the checklist', h[0].info.request === true && h[0].info.requestNum === 'RCE-9' && !!h[0].info.rce && h[0].info.ceNum === 'RCE-9');
  ck('an ordinary row does not carry the rest of its info', !h[1].info.approval && h[1].info.ceNum === 'SHIC-CE-1');
  ck('an unreadable info does not break the list', h.length === 3 && h[2].info.ceNum === 'X');
  process.exit(bad ? 1 : 0);
});
