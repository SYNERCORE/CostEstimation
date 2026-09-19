#!/usr/bin/env node
/* Being offline or signed out of SharePoint is said in a dialog, not only by
   the small top-bar button that people overlooked.
   Run: node tools/test-offline-popup.js */
'use strict';
const w = require('fs').readFileSync('src/widgets.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('a dialog opens when the device goes offline', /addEventListener\('offline', o\)/.test(w) && /You are offline/.test(w));
ck('and when already offline on opening', /if \(navigator\.onLine === false\) setPop\('offline'\)/.test(w));
ck('and when the SharePoint session expires', /setPop\('signin'\)/.test(w) && /You are not signed in to SharePoint/.test(w));
ck('it offers sign-in from the dialog', /onClick: doSignIn/.test(w));
ck('it shows even while the button is hidden', /if \(!need\) return dialog \|\| null;/.test(w));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\noffline popup OK'); process.exit(bad ? 1 : 0);
