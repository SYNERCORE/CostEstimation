/* The Dashboard's Open CEs and Overdue requests lists can be opened to every row.
   Run: node tools/test-dashboard-show-all.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
ck('state holds which list is opened', app.indexOf('const [dashAll, setDashAll] = useState({});') > 0);
ck('Open CEs: first 15, or all once opened', app.indexOf('openCEs.slice(0, dashAll.open ? openCEs.length : 15)') > 0);
ck('a button says how many and toggles', app.indexOf("'Show all ' + openCEs.length + ' open CEs'") > 0 && app.indexOf('setDashAll(p=>({...p,open:!p.open}))') > 0);
ck('opened to all, it scrolls inside a box with the header kept in view', app.indexOf("maxHeight:dashAll.open ? 560 : 'none'") > 0 && app.indexOf("position:'sticky',top:0,background:CARD") > 0);
ck('Overdue requests the same', app.indexOf('reqOverdueRows.slice(0, dashAll.over ? reqOverdueRows.length : 15)') > 0 && app.indexOf("'Show all ' + reqOverdueN + ' overdue requests'") > 0);
ck('the old "see the CE Monitoring tab" dead end is gone', app.indexOf('more \u2014 see the CE Monitoring tab') < 0 && app.indexOf('more — see the CE Monitoring tab') < 0);
process.exit(bad ? 1 : 0);
