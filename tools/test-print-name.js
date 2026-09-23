#!/usr/bin/env node
/* The printed CE is offered for saving under its CE number and job title,
   and each signature carries its date once, not twice.
   Run: node tools/test-print-name.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
const help = fs.readFileSync('src/helpers.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

ck('the job title comes from Monitoring, then the CE',
  app.includes("const _jobTitle = String((openCeId != null ? (monData[openCeId] || {}).jobTitle : '') || info.description || '').trim();"));
ck('one place builds the name, for the print and the viewer alike',
  app.includes('const printName = ceFileName(info.ceNum, _jobTitle);') &&
  help.includes("return [String(ceNum || '').trim(), String(jobTitle || '').trim()].filter(Boolean).join(' - ')"));
ck('what a file name cannot hold is dropped', help.includes(".replace(/[^\\w .,()+&#-]+/g, ' ')"));
ck('and it is never empty or endless', help.includes(".slice(0, 120) || 'Cost Estimate';"));
ck('the document title carries it, not "CE <number>"',
  app.includes('<title>${esc(printName)}<\\/title>') && !app.includes("<title>CE ${esc(info.ceNum||'')}"));
/* The viewer prints an iframe, and the browser names the PDF after the page's
   own title, not the frame's, so the page lends its title for the print. */
ck('the viewer lends its title to the CE while it prints',
  app.includes('document.title=ceFileName(viewCE.ceNum||((monData[viewCE.id]||{}).ceNum), (monData[viewCE.id]||{}).jobTitle||viewCE.jobTitle);'));
ck('and takes it back afterwards', app.includes('setTimeout(()=>{try{document.title=_was;}catch(_e){}},1000);'));

/* The signature image is stamped with the date already; the line beneath the
   name repeated it. */
ck('the date is not printed a second time under the name',
  !app.includes("e-signed ' + esc(apvWhen(line.at))"));
ck('the name and title are still printed', app.includes("${esc((line || {}).byName || a.name || '')}</b><br><span style=\"font-size:7.5pt\">${esc(a.title || a.role || '')}</span></div></td>"));

const ctx = { console }; vm.createContext(ctx);
vm.runInContext(help + '\nthis.ceFileName = ceFileName;', ctx);
const fn = ctx.ceFileName;
ck('a real CE names its file', fn('SY3-CE-2026-1060-R2', 'Steam Cut Repair') === 'SY3-CE-2026-1060-R2 - Steam Cut Repair');
ck('a slash in the job title cannot break the name', fn('A/B', 'Rotor: repair') === 'A B - Rotor repair');
ck('and a CE with neither still has a name', fn('', '') === 'Cost Estimate');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint file name OK'); process.exit(bad ? 1 : 0);
