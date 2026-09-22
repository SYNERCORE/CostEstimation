#!/usr/bin/env node
/* The printed CE is offered for saving under its CE number and job title,
   and each signature carries its date once, not twice.
   Run: node tools/test-print-name.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

ck('the job title comes from Monitoring, then the CE',
  app.includes("const _jobTitle = String((openCeId != null ? (monData[openCeId] || {}).jobTitle : '') || info.description || '').trim();"));
ck('the name is the CE number and the job title',
  app.includes("const printName = [String(info.ceNum || '').trim(), _jobTitle].filter(Boolean).join(' - ')"));
ck('what a file name cannot hold is dropped', app.includes(".replace(/[^\\w .,()+&#-]+/g, ' ')"));
ck('and it is never empty or endless', app.includes(".slice(0, 120) || 'Cost Estimate';"));
ck('the document title carries it, not "CE <number>"',
  app.includes('<title>${esc(printName)}<\\/title>') && !app.includes("<title>CE ${esc(info.ceNum||'')}"));

/* The signature image is stamped with the date already; the line beneath the
   name repeated it. */
ck('the date is not printed a second time under the name',
  !app.includes("e-signed ' + esc(apvWhen(line.at))"));
ck('the name and title are still printed', app.includes("${esc((line || {}).byName || a.name || '')}</b><br><span style=\"font-size:7.5pt\">${esc(a.title || a.role || '')}</span></div></td>"));

const m = app.match(/const printName = [\s\S]{0,300}?'Cost Estimate';/);
const fn = new Function('info', '_jobTitle', (m ? m[0] : '') + '\nreturn printName;');
ck('a real CE names its file', fn({ ceNum: 'SY3-CE-2026-1060-R2' }, 'Steam Cut Repair') === 'SY3-CE-2026-1060-R2 - Steam Cut Repair');
ck('a slash in the job title cannot break the name', fn({ ceNum: 'A/B' }, 'Rotor: repair') === 'A B - Rotor repair');
ck('and a CE with neither still has a name', fn({}, '') === 'Cost Estimate');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint file name OK'); process.exit(bad ? 1 : 0);
