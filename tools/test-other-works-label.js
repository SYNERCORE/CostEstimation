/* The services-summary balance line reads OTHER WORKS TO THE PROJECT everywhere: it is the rest of the grand total, not miscellaneous items.
   Run: node tools/test-other-works-label.js */
'use strict';
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const out = rd('src/components/CeOutput.js'), sum = rd('src/components/SummaryTab.js'), app = rd('src/App.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const n = (s, t) => s.split(t).length - 1;
ck('the printed CE, the detailed workbook and the template workbook use the new label', n(out, 'OTHER WORKS TO THE PROJECT:') === 3);
ck('the Summary card uses it', sum.includes('"OTHER WORKS TO THE PROJECT"') && sum.includes('prints as Other works to the project'));
ck('the explanation in App.js uses it', app.includes('"Other works to the project" is whatever'));
ck('the old label is gone', !/OTHER MISC\. TO THE PROJECT/i.test(out + sum + app));
process.exit(bad ? 1 : 0);
