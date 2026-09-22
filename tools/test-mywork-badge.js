#!/usr/bin/env node
/* Work waiting on the signed-in user must be visible from any tab, not only
   as a toast that scrolls past.
   Run: node tools/test-mywork-badge.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it counts CEs routed to me for signature', app.includes('const sign = rows.filter(x => apvMonWaitsOn(x.m, me));'));
ck('and my own CEs that came back returned', /apv\(x\)\.state === 'returned' && apv\(x\)\.submittedBy === me/.test(app));
/* The badge read monitoring records while the tab listed CEs, so a record whose
   CE was not the latest revision counted in one and appeared in neither. */
ck('the badge and the My Work lists are the same rows', /const toSign = myTodo\.sign, returned = myTodo\.returned;/.test(app));
/* An approval left pending on a replaced revision showed as "CE #2817" with
   nothing to sign: only the latest revision waits on anyone. */
ck('a stale approval on an older revision is not counted', !app.includes('_orphan: true') && app.includes('return {sign: sign, returned: returned, total: sign.length + returned.length};'));
ck('an approver who is not an admin still receives the CEs routed to them', app.includes("if (apvMonWaitsOn(m, currentUser?.username)) return true;"));
ck('the My Work tab carries the count', /sowbreak: sowUnassignedCount, mywork: myTodo\.total/.test(app));
ck('drawn in red, not the dim row-count style', /t\.id === 'mywork' \? ERR :/.test(app));
ck('the browser tab title shows it too', /document\.title = myTodo\.total \?/.test(app));
ck('and a new item says so, not just the first one of the session', /if \(n > was && was >= 0\)/.test(app));
/* Replaced revisions have their approval closed, not left pending for ever. */
ck('an older revision approval is marked superseded', app.includes("updateMon(e.id, 'apv', {...a, state: 'superseded', waiting: [], supersededBy: headNum"));
ck('only pending or returned ones, each written once', app.includes("['pending', 'returned'].includes(a.state) || _supersededRef.current.has(String(e.id))"));
ck('Monitoring shows it', app.includes("'⊘ Superseded' + (m.apv.supersededBy ? ' by ' + m.apv.supersededBy : '')"));
ck('and opening the old revision says so', app.includes("superseded: '⊘ Superseded'"));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmy work badge OK'); process.exit(bad ? 1 : 0);
