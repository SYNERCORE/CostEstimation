/* A requestor lands on My Work and sees the Estimate tab only once a CE is open.
   Run: node tools/test-requestor-landing.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('everyone starts on My Work', app.includes('const [tab, setTab] = useState("mywork");'));
ck('a requestor with no CE open has no Estimate group', app.includes("!(isRequestor && g.id === 'estimate' && !info.ceNum && g.ids.indexOf(tab) < 0)"));
ck('the group holding the open tab is never hidden', app.includes('g.ids.indexOf(tab) < 0'));
ck('estimators and admins are not affected', app.includes('isRequestor && g.id'));
process.exit(bad ? 1 : 0);
