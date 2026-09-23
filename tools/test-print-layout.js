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
/* A position:fixed header is drawn wherever the printer's own margins fall, so
   it struck through the middle of tables; the document is laid out into real
   sheets instead, which is also the only way to count the pages. */
ck('the document is laid out into A4 sheets', /\.sheet\{width:210mm;height:297mm/.test(app));
ck('each sheet carries the header and the footer', /d\.innerHTML = HDR \+ '<div class="sbody"><\/div>' \+ FTR/.test(app));
ck('the footer is the document number, then page X of Y', /class="run-ftr"><span>Document No\.[\s\S]{0,80}class="pnum"/.test(app) && /'Page ' \+ \(p \+ 1\) \+ ' of ' \+ n/.test(app));
ck('nothing is left overflowing a sheet', /if \(!fits\(\) && placed\)/.test(app));
ck('a long table is cut between rows, headings repeated', /if \(i && head\) tb\.appendChild\(head\.cloneNode\(true\)\)/.test(app));
ck('a table too tall for any sheet is cut where it stands, under its heading',
  /if \(tall \|\| body\.children\.length === 1\) \{ split\(el\); return; \}/.test(app));
ck('and one that moves to the next sheet takes its heading with it',
  /var carry = \(lead && lead\.tagName !== 'TABLE' && body\.children\.length > 1\) \? lead : null;/.test(app) &&
  /if \(carry\) body\.appendChild\(carry\);/.test(app));
ck('a section too tall for a sheet is taken apart rather than swallowed by one',
  /if \(tall && el\.children\.length\) \{[\s\S]{0,120}forEach\(put\);/.test(app));
ck('the page box is edge to edge, the sheet holds the margins', /@page\{size:A4 portrait;margin:0\}/.test(app));
/* The header on every page is the company block itself -- logo, title and
   the Document / Revision numbers -- not a line of small print. */
ck('every sheet is headed by the logo and document-number block', app.includes('const runHdr = `<div class="run-hdr">${docTop}</div>`;'));
ck('the document number never wraps', app.includes('white-space:nowrap">${esc(co.doc)}'));
/* PPE has six columns; its TOTAL row spanned five and put the amount under
   UNIT PRICE, leaving the TOTAL column empty. */
ck('the PPE total sits under TOTAL', app.includes('<td colspan="5" class="r b">TOTAL:</td><td class="r b">${fmt(ppeT)}</td>'));
ck('and so does the materials total', app.includes('<td colspan="5" class="r b">TOTAL:</td><td class="r b">${fmt(matsT)}</td>'));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint layout OK'); process.exit(bad ? 1 : 0);
