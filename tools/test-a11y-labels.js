#!/usr/bin/env node
/*
 * The estimate tables are rows of bare number boxes and drop-downs, so a screen reader said "edit, spin button" for every cell. src/a11y.js
 * names any control that has no name, from its column heading and row ("PAX - row 2"), or the text before it, or its placeholder. This pins the
 * rules that keep it safe: it is loaded, it never replaces a name someone wrote, it only looks at what was just added, and a form laid out as a
 * table is not mistaken for a table with headings.
 *
 * Run: node tools/test-a11y-labels.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const js = R('src/a11y.js'), html = R('index.html'), sw = R('sw.js');
ck('the script is a script tag', /src="\.\/src\/a11y\.js\?v=\d+"/.test(html));
ck('and is precached for offline use', /a11y\.js/.test(sw));
ck('it parses', (() => { try { new Function(js); return true; } catch (e) { return false; } })());

console.log('\nit never overrides a name someone wrote:');
ck('aria-label by hand is kept', /getAttribute\('aria-label'\) && !el\.hasAttribute\('data-a11y'\)/.test(js));
ck('aria-labelledby and title are kept', /aria-labelledby'\) \|\| el\.getAttribute\('title'\)/.test(js));
ck('a <label for> and a wrapping <label> are kept', /label\[for=/.test(js) && /closest\('label'\)/.test(js));
ck('a name it wrote is marked, so it can be refreshed', /setAttribute\('data-a11y', '1'\)/.test(js));
ck('checkboxes, radios, files and hidden inputs are left alone', /:not\(\[type=hidden\]\):not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=file\]\)/.test(js));

console.log('\nhow it names:');
ck('a table cell gets its column heading', /thead th, thead td/.test(js));
ck('a headingless first row counts only when every cell is a th', /x\.tagName === 'TH'/.test(js));
ck('a form laid out as a table is named by the cell before it', /previousElementSibling/.test(js));
ck('a blank row is named by its position', /rowName = 'row ' \+ n/.test(js));
ck('a button just before a control is not its name', /matches\('button,input,select,textarea'\)/.test(js));
ck('it falls back to the placeholder, then the kind of field', /getAttribute\('placeholder'\)/.test(js) && /Text field/.test(js));

console.log('\nit stays cheap:');
ck('only added nodes are scanned, not the whole page each time', /addedNodes/.test(js) && /pending\.push\(n\)/.test(js));
ck('the scan waits for idle time', /requestIdleCallback/.test(js));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\naccessibility labels OK');
process.exit(bad ? 1 : 0);
