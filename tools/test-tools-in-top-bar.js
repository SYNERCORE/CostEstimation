#!/usr/bin/env node
/*
 * Project Analyzer and ML Insights floated over the bottom-right corner of every screen and covered the last column of any list, worst on a
 * small screen. They are two small icon buttons in the top bar now, calling the same panels, and nothing floats there any more.
 *
 * Run: node tools/test-tools-in-top-bar.js
 */
'use strict';
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const bar = fs.readFileSync('src/components/AppChrome.js', 'utf8');
const ml = fs.readFileSync('src/ml_utils.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

ck('no floating Project Analyzer button remains', !/onclick="openODPanel\(\)"/.test(html) && !/title="Project Analyzer"/.test(html));
ck('no floating ML Insights button remains', !/onclick="shicMLToggle\(\)"/.test(html) && !/title="ML Insights"/.test(html));
ck('the two panels are still in the page', /id="shic-ml-panel"/.test(html) && /id="shic-od-panel"/.test(html));
ck('the top bar has both buttons, with a name each', /\['Project Analyzer'|'Project Analyzer', 'openODPanel'/.test(bar) && /'ML Insights', 'shicMLToggle'/.test(bar) && /'aria-label': lbl/.test(bar));
ck('they call the same functions', /function shicMLToggle\(\)/.test(ml) && /function openODPanel\(\)/.test(ml) && /typeof window\[fn\] === 'function'\) window\[fn\]\(\)/.test(bar));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nTools in top bar OK');
process.exit(bad ? 1 : 0);
