#!/usr/bin/env node
/*
 * Tools & Equipment, Materials and PPE: the table's sideways scrollbar is at the bottom of the table, so on a long list it was at the very
 * end of the page. A second bar, pinned to the bottom of the window while the table is on screen, is kept in step with it. Drawn only when
 * the table is wider than its box.
 *
 * Run: node tools/test-restab-hscroll-bar.js
 */
'use strict';
const fs = require('fs');
const s = fs.readFileSync('src/components/ResTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

ck('the table box and the bar are kept by ref', /const _wrapRef = useRef\(null\), _barRef = useRef\(null\);/.test(s) && /ref: _wrapRef,/.test(s) && /ref: _barRef, className: 'res-hbar'/.test(s));
ck('the bar is pinned to the bottom of the window', /position: 'sticky', bottom: 0/.test(s));
ck('it is drawn only when the table is wider than its box', /_sw > 0 && /.test(s) && /w\.scrollWidth > w\.clientWidth \+ 1 \? w\.scrollWidth : 0/.test(s));
ck('its inner width follows the table', /width: _sw, height: 1/.test(s));
ck('moving either one moves the other, without looping', /_barRef\.current\.scrollLeft !== e\.target\.scrollLeft\) _barRef\.current\.scrollLeft = e\.target\.scrollLeft/.test(s) && /_wrapRef\.current\.scrollLeft !== e\.target\.scrollLeft\) _wrapRef\.current\.scrollLeft = e\.target\.scrollLeft/.test(s));
ck('the width is re-measured when the table or its box resizes, and the observer is released', /new ResizeObserver\(measure\)/.test(s) && /ro\.observe\(w\)/.test(s) && /return \(\) => ro\.disconnect\(\)/.test(s));
ck('the hooks sit before the component\'s return', s.indexOf('const _wrapRef') < s.indexOf("return /*#__PURE__*/React.createElement(\"div\", {\n  style: CS"));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nResTab sideways bar OK');
process.exit(bad ? 1 : 0);
