#!/usr/bin/env node
/* The last row of every page of a generated CE came out sliced in half by the
   footer. The sheets are laid out by a paginator in the generated HTML, and it
   was measuring the running header before the company logo had loaded: a logo
   that is not in yet measures as nothing, so every sheet was filled to the
   height of a header without it, and when the logo arrived the header grew and
   pushed the bottom row under the footer.

   Two things keep it out: the logo reserves its box in the markup, and nothing
   is measured until the images are in. A third keeps the print itself honest --
   printing before the sheets exist prints one long unpaginated run.

   Run: node tools/test-print-lastrow.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- the logo takes up its space whether it has arrived or not ---- */
ck('the logo is given its size in the markup, not only in style',
  app.includes('<img src="${esc(co.logo)}" width="70" height="36" style="width:70px;height:36px;object-fit:contain">'));

/* ---- nothing is measured until the images are in ---- */
const pg = app.slice(app.indexOf('    const paginator = `(function(){'), app.indexOf('    })();`;'));
ck('the paginator waits for the images before it lays anything out',
  /function whenLoaded\(\)\{[\s\S]*document\.images[\s\S]*addEventListener\('load'/.test(pg));
ck('and runs once only, whichever arrives first', pg.includes('var ran = false;') && pg.includes('function go(){ if (ran) return; ran = true; run(); }'));
ck('a logo that never arrives still prints the CE', pg.includes('setTimeout(go, 4000);'));
ck('a page already loaded is laid out at once, not only on DOMContentLoaded',
  pg.includes("if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenLoaded); else whenLoaded();"));

/* ---- the fit test itself ---- */
ck('a page is full by where its content ends, not by scrollHeight',
  pg.includes('function fits(){') && pg.includes('last.getBoundingClientRect().bottom - body.getBoundingClientRect().top <= avail - GAP'));
/* scrollHeight is a whole number and never reports less than the box itself:
   it cannot see a row overflowing by half a line, and cannot be asked for any
   room in hand -- "avail - 1" against it is met by nothing, one row a sheet. */
ck('and not by scrollHeight again, which can be neither fractional nor reduced', !/body.scrollHeight/.test(pg));
ck('a millimetre is kept back for the printer, whose 297mm is not the screen mm', pg.includes('var GAP = 4;'));

/* the real fits(), against what the boxes actually report */
const cut = pg.slice(pg.indexOf('var GAP = 4;'), pg.indexOf('function put(el)'));
const mkBody = bottom => ({
  lastElementChild: bottom === null ? null : { getBoundingClientRect: () => ({ bottom }) },
  getBoundingClientRect: () => ({ top: 0 })
});
const fits = (bottom, avail) => new Function('body', 'avail', cut + ' return fits();')(mkBody(bottom), avail);
ck('an empty page takes a row', fits(null, 982) === true);
ck('a page with room to spare takes another', fits(900, 982) === true);
ck('a row ending half a line past the bottom does not fit', fits(982.6, 982) === false);
ck('nor one that lands exactly on it, which a printer would push over', fits(982, 982) === false);
ck('the last row that truly fits is still taken', fits(978, 982) === true);

/* ---- a block that cannot be cut ---- */
/* Only rows can be cut between, so a section too tall for a sheet is taken
   apart and its heading and table placed separately -- see
   tools/test-print-nothing-lost.js, which lays such a CE out and counts it. */
ck('only a table is cut between its rows', pg.includes("if (tbl.tagName !== 'TABLE') return;"));
ck('a section too tall for a sheet is taken apart rather than laid down whole',
  pg.includes('if (tall && el.children.length) {') && pg.includes("[].slice.call(el.children).forEach(put);"));

/* ---- printing waits for the sheets ---- */
ck('the print window waits until the sheets are laid out',
  app.includes("if ((w.document.body && w.document.body.getAttribute('data-paged')) || n > 40) { w.print(); return; }"));
ck('so does Print in the viewer', app.includes("paged=!!(_w.document.body&&_w.document.body.getAttribute('data-paged'));"));
ck('and neither waits for ever', app.includes('setTimeout(() => _waitThenPrint(n + 1), 150);') && app.includes('setTimeout(()=>_go(n+1),150);'));
ck('the paginator says when it is done', app.includes("document.body.setAttribute('data-paged', '1');"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint last row OK');
process.exit(bad ? 1 : 0);
