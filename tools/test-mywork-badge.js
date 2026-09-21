#!/usr/bin/env node
/* Work waiting on the signed-in user must be visible from any tab, not only
   as a toast that scrolls past.
   Run: node tools/test-mywork-badge.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it counts CEs routed to me for signature', /apv\(x\)\.state === 'pending' && \(apv\(x\)\.waiting \|\| \[\]\)\.includes\(me\)/.test(app));
ck('and my own CEs that came back returned', /apv\(x\)\.state === 'returned' && apv\(x\)\.submittedBy === me/.test(app));
/* The badge read monitoring records while the tab listed CEs, so a record whose
   CE was not the latest revision counted in one and appeared in neither. */
ck('the badge and the My Work lists are the same rows', /const toSign = myTodo\.sign, returned = myTodo\.returned;/.test(app));
ck('a pending record with no CE row is still shown, not just counted', /_orphan: true/.test(app));
ck('the My Work tab carries the count', /sowbreak: sowUnassignedCount, mywork: myTodo\.total/.test(app));
ck('drawn in red, not the dim row-count style', /t\.id === 'mywork' \? ERR :/.test(app));
ck('the browser tab title shows it too', /document\.title = myTodo\.total \?/.test(app));
ck('and a new item says so, not just the first one of the session', /if \(n > was && was >= 0\)/.test(app));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmy work badge OK'); process.exit(bad ? 1 : 0);
