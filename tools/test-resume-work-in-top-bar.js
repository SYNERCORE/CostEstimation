/* Resume Work opens from the top bar, on any tab, so it no longer depends on an estimate being open.
   Run: node tools/test-resume-work-in-top-bar.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const save = app.indexOf('title: "Save CE (Ctrl+S)"'), exp = app.indexOf('"Export CE"', save);
ck('the top bar is found', save > 0 && exp > save);
const bar = app.slice(save, exp);
ck('a Resume button sits between Save and Export CE', /\\ud83d\\udccb Resume"/i.test(bar));
ck('it loads the drafts and opens the panel', bar.indexOf('loadSharedDrafts(); setDraftsOpen(true);') > 0);
ck('it shows how many drafts there are', bar.indexOf('sharedDrafts.length > 0') > 0);

const panel = app.indexOf('draftsOpen && /*#__PURE__*/React.createElement("div"');
ck('the panel is one overlay at the root, not inside a tab', panel > 0 && panel < save);
ck('the Summary step button is kept as well', (app.match(/setDraftsOpen\(true\)/g) || []).length >= 2);
process.exit(bad ? 1 : 0);
