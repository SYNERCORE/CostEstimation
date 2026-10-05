/* The review dialog shows what the request says and the papers that came with it.
   Run: node tools/test-review-shows-request.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = R('src/App.js'), m = R('src/components/RceReviewModal.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('the dialog takes the facts and a way to list the files', m.indexOf('facts, loadFiles, onClose, onDone') > 0);
ck('it prints each fact and links each attachment', m.indexOf('facts.map(([k, v])') > 0 && m.indexOf('spAbsUrl(f.ServerRelativeUrl)') > 0);
ck('a failed read says so rather than claiming there are none', m.indexOf("'Could not read them: '") > 0 && m.indexOf("'None came with this request yet.'") > 0);
ck('the facts include company, dates, location, sales and who sent it', ["'Company'", "'Date received'", "'Deadline'", "'Work location'", "'Assigned sales'", "'Requested by'"].every(k => app.indexOf(k) > 0));
ck('the files are the Monitoring item attachments', app.indexOf("spGetAttachments(spList('Monitoring'), sp)") > 0);
process.exit(bad ? 1 : 0);
