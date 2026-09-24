#!/usr/bin/env node
/* A request for estimation arrives with its paperwork -- drawings, the TOR,
   the RFQ, a PO -- and the form asked for none of it. The documents could
   only be added after the request was logged, in the panel that opens next,
   which is a second step to remember at the moment the first one has just
   succeeded. The form now takes them, and sends them the instant the request
   has a row to hang them on.

   Run: node tools/test-request-docs.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- the form takes them ---- */
ck('the form holds the files until there is somewhere to put them',
  app.includes('const [reqFiles, setReqFiles] = React.useState([]);'));
ck('and says why it must', app.includes('there is no row to hang them on until the request'));
ck('there is a picker on the form, and it takes more than one',
  /type:'file', multiple:true, disabled:reqBusy/.test(app));
ck('the same file picked twice is not sent twice',
  app.includes("picked.filter(f=>!p.some(x=>x.name===f.name&&x.size===f.size))"));
ck('picking again adds to what is there rather than replacing it',
  app.includes('setReqFiles(p=>p.concat('));
ck('and the picker is cleared each time, so the same file can be picked again after removing it',
  app.includes("e.target.value=''"));
ck('each chosen file can be taken off again',
  app.includes('onClick:()=>setReqFiles(p=>p.filter((_x,k)=>k!==i))'));
ck('the button says what it is about to do',
  app.includes('reqFiles.length ? "Log request & send " + reqFiles.length + " file(s)" : "Log request"'));
ck('a fresh form starts with nothing attached', /const openRequest = \(\) => \{\s*setReqFiles\(\[\]\);/.test(app));
ck('and Cancel does not leave them behind', app.includes("onClick:()=>{setReqFiles([]);setReqForm(null);}"));

/* ---- they go the moment the request exists ---- */
const sub = app.slice(app.indexOf('  const submitRequest = async () => {'), app.indexOf('  /* The row whose status panel is open'));
ck('the request is logged first', sub.indexOf('dbSaveHistory(entry)') > 0);
ck('then the monitoring row it attaches to', sub.indexOf('dbSaveMonEntry(') > sub.indexOf('dbSaveHistory(entry)'));
ck('and only then are the files sent', sub.indexOf('handleAttachUpload(saved.id, ceNum, _docs)') > sub.indexOf('dbSaveMonEntry('));
ck('the panel still opens, so more can be added there',
  sub.indexOf('openAttachPanel(saved.id)') > 0 && sub.indexOf('openAttachPanel(saved.id)') < sub.indexOf('handleAttachUpload(saved.id'));
ck('the files are taken before the form is cleared, not read out of state afterwards',
  sub.includes('const _docs = reqFiles.slice();') && sub.indexOf('const _docs') < sub.indexOf('setReqFiles([]);'));
ck('and the toast says how many are on their way',
  sub.includes("'. Sending ' + _docs.length + ' document(s)...'"));
ck('a request with no documents is logged exactly as before',
  sub.includes("'. Attach the documents that came with it.'") && sub.includes('if (_docs.length) await handleAttachUpload'));
ck('the blurb no longer promises a step that is now part of this one',
  app.includes('assigns it, and sends whatever came with it') && !app.includes('Attachments open next'));

/* ---- and a failure is named, not swallowed ---- */
const up = app.slice(app.indexOf('  const handleAttachUpload = async (ceId, ceNum, files) => {'), app.indexOf('  const handleAttachDelete'));
ck('each file is sent on its own', /for \(const file of Array\.from\(files\)\) \{\s*try \{/.test(up));
ck('one that is refused does not stop the others', up.includes('} catch (err) { kept.push('));
ck('what went up is counted, and what did not is named',
  up.includes('const gone = [], kept = [];') && up.includes("kept.length + ' did NOT: ' + kept.join('; ')"));
ck('the count reported is what actually went, not what was asked for',
  up.includes("showToast(gone.length + ' file(s) uploaded.')") && !up.includes('${files.length} file(s) uploaded'));
ck('a partial failure is reported as a failure', /kept\.join\('; '\)[\s\S]{0,80}true\);/.test(up));
ck('and says where to try again', up.includes('button.'));
ck('the list is re-read from the site either way, not assumed',
  up.includes("const updated = await spGetAttachments(spList('Monitoring'), spId);"));

/* ---- deleting is still an admin's ---- */
ck('uploading has not quietly become deleting',
  app.includes("if (!isAdmin) { showToast('Only an admin or the owner can delete an attachment.', true); return; }"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nrequest documents OK');
process.exit(bad ? 1 : 0);
