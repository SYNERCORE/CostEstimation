#!/usr/bin/env node
/* Client Document takes several files, and only the latest revision of a CE
   can be submitted for approval.
   Run: node tools/test-client-docs.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

console.log('client documents:');
ck('the file picker takes several files', /accept: "\.pdf,\.docx,\.xlsx,\.xls,\.txt,\.csv",\s*multiple: true,/.test(app));
ck('dropping several files keeps them all', app.includes('handleDocUpload(e.dataTransfer.files, true)'));
ck('a new file is added to the ones already there', app.includes('const keep = append ? docFilesOf(prev)'));
ck('the AI reads every file, each under its own heading', app.includes("'=== ' + f.name + ' ===\\n' + f.text"));
ck('every file is saved with the CE', app.includes('files: docFilesOf(docFile).map(f => ({name: f.name, spUrl: f.spUrl || null, size: f.size || 0}))'));
ck('and comes back when the CE is loaded', app.includes('docCombine(d.docRef.files.map(f => ({...f, text: \'\'})))'));
ck('a CE saved with one document still loads', app.includes("{name: d.docRef.name, spUrl: d.docRef.spUrl, text: '', size: 0}"));
ck('each file can be removed on its own', app.includes('onClick: () => removeDoc(f.name)'));

console.log('\nsubmitting an old revision:');
ck('a later revision is looked for', app.includes('const apvNewerRevision = num =>') && app.includes('g.key === f.key && g.rev > f.rev'));
ck('and submit refuses, naming the latest', /const newer = apvNewerRevision\(info\.ceNum\);\s*if \(newer\) \{ showToast\(/.test(app));
ck('before anything is stored', app.indexOf('const newer = apvNewerRevision(info.ceNum)') < app.indexOf('const ok = await apvPersist(apv, apvStripSigs(approvers, signatures))'));

console.log('\nreading a PDF:');
ck('every page is read, not the first 30', app.includes('const PDF_MAX_PAGES = 200;') && !app.includes('Math.min(pdf.numPages, 30)'));
ck('one line per printed line, so table rows stay rows', app.includes('Math.abs(y - lastY) > 2') && app.includes('x.hasEOL'));
ck('the AI reads more of a long document', app.includes('const AI_DOC_CHARS = 30000;'));
ck('and says when it could not read all of it', app.includes('the AI reads the first '));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nclient docs OK'); process.exit(bad ? 1 : 0);
