#!/usr/bin/env node
/*
 * Phone layout (375px). The top bar used to be one 875px strip scrolling sideways behind the screen edge, so the sync button, Save and Resume were
 * cut off; label-and-buttons rows ran off the edge; most controls were under 32px tall. Under 600px the bar now wraps onto two rows (its height
 * variable grows with it, so the sticky strips below keep their offsets), rows wrap, and controls outside tables are fingertip-sized.
 * Run: node tools/test-phone-layout.js
 */
'use strict';
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const chrome = fs.readFileSync('src/components/AppChrome.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const a = html.indexOf('@media(max-width:600px){'), b = html.indexOf('@media(max-width:768px){', a);
const css = a >= 0 && b > a ? html.slice(a, b) : '';
ck('there is a phone block (max-width 600px)', css.length > 0);
ck('the top bar wraps and no longer scrolls sideways', /\.shic-topbar\{[^}]*flex-wrap:wrap!important[^}]*overflow:visible!important/.test(css));
ck('its height variable grows, so the sticky strips below keep their offsets', /:root\{--h-top:\d+px\}/.test(css) && html.includes('--y-tabs: calc(var(--h-status) + var(--h-top))'));
ck('the four work buttons share a full-width row of finger-sized buttons', /\.shic-tb-actions\{[^}]*flex:1 1 100%/.test(css) && /\.shic-tb-actions>\.tb-btn,\.shic-tb-actions>button\{[^}]*min-height:38px/.test(css));
ck('rows with a label and buttons wrap instead of running off the edge', css.includes('justify-content: space-between') && css.includes('{flex-wrap:wrap}'));
ck('a button group that refused to shrink is allowed to', css.includes('flex-shrink: 0') && css.includes('flex-shrink:1!important'));
ck('controls outside tables are at least 36px tall', /min-height:36px/.test(css) && css.includes('button:not(table button)'));
ck('the top bar groups carry the class names the rules use', ['shic-topbar', 'shic-tb-logo', 'shic-tb-type', 'shic-tb-actions', 'shic-tb-account'].every(c => chrome.includes("'" + c + "'")));
process.exit(bad ? 1 : 0);
