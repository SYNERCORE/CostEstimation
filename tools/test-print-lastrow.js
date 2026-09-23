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
ck('a page is full when its content reaches the bottom, not one pixel before',
  pg.includes('function fits(){ return body.scrollHeight <= avail; }'));
/* scrollHeight never reports less than the box: avail - 1 can never be met, so
   every sheet would close after a single row. Guard the shape, not the words. */
ck('the fit test cannot be tightened into one row a page', !/scrollHeight\s*<=?\s*avail\s*-/.test(pg));

/* the real fits(), against what a flex body actually reports */
const fits = new Function('body', 'avail', pg.slice(pg.indexOf('function fits(){'), pg.indexOf('}', pg.indexOf('function fits(){')) + 1) + '\n return fits();');
ck('an empty page, whose scrollHeight is its own height, still takes a row', fits({ scrollHeight: 982 }, 982) === true);
ck('a page one pixel over does not', fits({ scrollHeight: 983 }, 982) === false);

/* ---- printing waits for the sheets ---- */
ck('the print window waits until the sheets are laid out',
  app.includes("if ((w.document.body && w.document.body.getAttribute('data-paged')) || n > 40) { w.print(); return; }"));
ck('so does Print in the viewer', app.includes("paged=!!(_w.document.body&&_w.document.body.getAttribute('data-paged'));"));
ck('and neither waits for ever', app.includes('setTimeout(() => _waitThenPrint(n + 1), 150);') && app.includes('setTimeout(()=>_go(n+1),150);'));
ck('the paginator says when it is done', app.includes("document.body.setAttribute('data-paged', '1');"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nprint last row OK');
process.exit(bad ? 1 : 0);
