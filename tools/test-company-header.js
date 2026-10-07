/* Whose name is on the document.
   ==============================
   The printed CE and the workbook both build their header from the company
   record the CE names. Both fell back to SYNERCORE / HEAVY INDUSTRIES CORP.
   per FIELD rather than per RECORD, so a company with a name and no subtitle
   -- SY3 -- printed "SY3 - HEAVY INDUSTRIES CORP.", putting another company's
   name on its own documents. A sales team reading that has no way to know it
   is wrong.

   The Synercore names stay as the fallback for having no company record at
   all, which is the state of a first run before the Company DB is filled in.

   Run: node tools/test-company-header.js */
'use strict';
const fs = require('fs');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };

/* The rule, lifted from each builder and run. */
const mk = src => new Function('coInfo', 'coI', '_cos', 'info',
  src + '\nreturn typeof co !== "undefined" ? co : null;');

const print = mk(app.slice(app.indexOf('const _hasCo = !!('), app.indexOf("doc:     coInfo.docNo")) + '};');
const book = mk(app.slice(app.indexOf('const _hasCoI = !!('), app.indexOf("doc: coI.docNo")).replace('const co = {', 'const co = {') + '};');

console.log('the printed CE:');
let co = print({ id: 2, name: 'SY3', sub: '' });
ck('a company with no subtitle gets no subtitle', co.sub === '', co.sub);
ck('and keeps its own name', co.name === 'SY3', co.name);
co = print({ id: 2, name: 'SY3', sub: 'ENERGY MAINTENANCE SERVICES CORPORATION' });
ck('a subtitle that is set is used', co.sub === 'ENERGY MAINTENANCE SERVICES CORPORATION');
/* The first run: no Company DB yet. */
co = print({});
ck('no company record at all still falls back to Synercore',
  co.name === 'SYNERCORE' && co.sub === 'HEAVY INDUSTRIES CORP.', co.name + '/' + co.sub);
/* A record that exists but is empty except for its id is still a record. */
co = print({ id: 5 });
ck('a record that exists does not borrow another name',
  co.name === '' && co.sub === '', co.name + '/' + co.sub);

console.log('\nthe workbook, by the same rule:');
co = book(null, { id: 2, name: 'SY3', sub: '' });
ck('no subtitle means no subtitle', co.sub === '', co.sub);
co = book(null, {});
ck('and no record still falls back', co.name === 'SYNERCORE');

console.log('\nand the header line itself:');
/* "SY3 - " with nothing after it is not better than the wrong name. */
ck('a name with no subtitle carries no dangling dash',
  /\[co\.name, co\.sub\]\.filter\(Boolean\)\.join\(' \u2014 '\)/.test(app));
ck('the two are still joined when both are there',
  app.indexOf("[co.name, co.sub].filter(Boolean).join(' \u2014 ')") > 0);

console.log('\nthe resource toolbar:');
const tab = fs.readFileSync('src/components/ResTab.js', 'utf8');
/* Import XLS was clipped off the right edge with no scrollbar to reach it:
   the button was not off-screen, it was unreachable. */
ck('the row of controls wraps rather than overflowing',
  /display: 'flex',\s*gap: 6,\s*flexWrap: 'wrap'/.test(tab));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ncompany header OK');
process.exit(bad ? 1 : 0);
