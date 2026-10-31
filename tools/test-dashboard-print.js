/* The Dashboard has a Print Dashboard button that prints the whole page as it is now.
   Run: node tools/test-dashboard-print.js */
'use strict';
const fs = require('fs'), path = require('path');
const d = fs.readFileSync(path.join(__dirname, '..', 'src/components/DashboardTab.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = d.indexOf('  const printDashboard = () => {'), b = d.indexOf("  return /*#__PURE__*/React.createElement(\"div\",{className:'dash-root'");
ck('the print function sits just before the page', a > 0 && b > a);
const body = d.slice(a, b);
ck('it copies the page root, not a rebuilt page', body.includes("document.querySelector('.dash-root')") && body.includes('cloneNode(true)'));
ck('buttons, pickers and the filter toggle are left off the printout', body.includes('.dash-noprint, .dash-disc-toggle, button, select, input'));
ck('it prints in the light theme with the app styles', body.includes('data-theme="light"') && body.includes("link[rel=\"stylesheet\"]"));
ck('it names the company and discipline picked', body.includes('[_dc, _dd].filter(Boolean)'));
ck('a blocked pop-up does nothing', body.includes('if (!w) return;') && body.includes('w.print()'));
ck('the page root carries the class and the button is in the header, not printed', d.includes("className:'dash-root'") && d.includes("className:'dash-noprint'") && d.includes('onClick:printDashboard'));
process.exit(bad ? 1 : 0);
