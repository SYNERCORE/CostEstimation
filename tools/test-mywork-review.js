/* My Work offers Review, not Load, for a logged request nobody has accepted.
   Run: node tools/test-mywork-review.js */
'use strict';
const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('an unaccepted request gets a Review button that opens the review', app.indexOf("onClick:()=>openReview(x.e, 'review')}, \"Review\")") > 0);
ck('only for the team, and only before it is accepted', app.indexOf("!isRequestor && i.request && !i.acceptedCeNum && String(i.ceNum || '') === String(i.requestNum || '') && typeof x.e.id === 'number'") > 0);
ck('everything else still loads', app.indexOf("onClick:()=>handleLoad(x.e.data || x.e)}, \"Load\")") > 0);
ck('a section lists every request awaiting the team, whoever it is assigned to', app.indexOf("section('📥 Requests awaiting review', awaitingReq") > 0 && app.indexOf('const awaitingReq = rows.filter(') > app.indexOf('const _unaccepted'));
ck('the View window has a Review button for an unaccepted request', app.indexOf("onClick: () => { setViewCE(null); openReview(_e, 'review'); }") > 0);
process.exit(bad ? 1 : 0);
