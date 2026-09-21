#!/usr/bin/env node
/* The printed CE: signatories wrap instead of shrinking, and every page says
   which CE and which document it belongs to.
   Run: node tools/test-print-layout.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('at most four signatories to a row', /const SIG_PER_ROW = 4;/.test(app) && /approvers\.slice\(i, i \+ SIG_PER_ROW\)/.test(app));
ck('a short last row keeps the same cell width', /fill\('<td style="border:none"><\/td>'\)/.test(app));
ck('a signature block is never split across pages', /class="sig"/.test(app) && /page-break-inside:avoid" class="sig"/.test(app));
ck('the header repeats on every page', /\.run-hdr\{top:/.test(app) && /position:fixed/.test(app));
ck('and names the CE', /class="run-hdr"[\s\S]{0,200}CE No\./.test(app));
ck('the footer repeats too, with the document number', /class="run-ftr"[\s\S]{0,120}Document No\./.test(app));
ck('the page margins leave room for both', /@page\{size:A4 portrait;margin:16mm 0\.25in 12mm\}/.test(app));
ck('neither shows on screen, only in print', /@media screen\{\.run-hdr,\.run-ftr\{display:none\}\}/.test(app));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint layout OK'); process.exit(bad ? 1 : 0);
