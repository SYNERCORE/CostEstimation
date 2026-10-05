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
ck('the facts include company, dates, location, sales and who sent it', ["'Customer'", "'Date received'", "'Submission deadline'", "'Work location'", "'Assigned sales'", "'Requested by'"].every(k => app.indexOf(k) > 0));
ck('the files are the Monitoring item attachments', app.indexOf("spGetAttachments(spList('Monitoring'), sp)") > 0);
ck('every field is listed, blank ones as a dash', app.indexOf("const bl = v => (v == null || v === '') ? '—' : v;") > 0 && app.indexOf("['Work location', r.workLocation]") > 0 && app.indexOf("['Address', r.address]") > 0);
ck('no deadline means three days after the inquiry date', app.indexOf('const reqDeadline = (dl, inquiryDate, dateRecv) => {') > 0 && app.indexOf('deadline: reqDeadline(f.deadline, f.inquiryDate, f.dateRecv), receivedBy:') > 0 && app.indexOf("completionDate: f.completionDate || '', deadline: reqDeadline(") > 0);
{ const a = app.indexOf('const reqDeadline'), b = app.indexOf('const handleLoad', a); const f = new Function(app.slice(a, b) + 'return reqDeadline;')();
  ck('3 days after 2026-10-05 is 2026-10-08, month ends roll over, an explicit deadline wins', f('', '2026-10-05', '') === '2026-10-08' && f('', '2026-10-30', '') === '2026-11-02' && f('2026-12-01', '2026-10-05', '') === '2026-12-01' && f('', '', '') === ''); }
ck('an unaccepted request has no CE number on screen: My Work reads it as its RCE No., CE Monitoring leaves a dash', app.indexOf("'RCE ' + (i.requestNum || i.ceNum || e.ceNum)") > 0 && app.indexOf("style:{color:MT}}, '\\u2014') : ceNum),") > 0);
process.exit(bad ? 1 : 0);
