#!/usr/bin/env node
/*
 * Tools & Equipment, Materials and PPE: the title and button row (From Masterlist, Import list, Sync, Combine, Add, Export/Import XLS) stays
 * under the tab strip while a long list scrolls, so nobody has to scroll back up for a button. It sticks at the top of the page body, above
 * the rows, and stretches over the card's padding so rows do not show through at its edges.
 *
 * Run: node tools/test-restab-sticky-toolbar.js
 */
'use strict';
const fs = require('fs');
const s = fs.readFileSync('src/components/ResTab.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const i = s.indexOf("className: 'res-sticky'");
const blk = i > 0 ? s.slice(i, i + 700) : '';
ck('the header row of the resource card is marked res-sticky', i > 0);
ck('it sticks just under the tab strips', /position: 'sticky'/.test(blk) && /top: 'var\(--y-body\)'/.test(blk) && /--y-body:/.test(html));
ck('it sits above the rows but below the top bars (z-index 40, bars are 49 and 50)', /zIndex: 40/.test(blk));
ck('it has a solid background so rows do not show through', /background: 'var\(--bg-surface-card\)'/.test(blk));
ck('it covers the card padding on all sides of the strip', /margin: '-16px -16px 12px'/.test(blk) && /padding: '16px 16px 8px'/.test(blk));
ck('the buttons are still inside it', s.indexOf('"From Masterlist"') > i && s.indexOf('"From Masterlist"') < i + 20000);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nResTab sticky toolbar OK');
process.exit(bad ? 1 : 0);
