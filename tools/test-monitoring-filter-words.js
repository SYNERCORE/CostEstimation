/* CE Monitoring's filter box matches every word typed, in any order, across all the columns (like the Dashboard's).
   Run: node tools/test-monitoring-filter-words.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
const a = app.indexOf("      /* Every word typed must be found in some column of the row");
ck('every word must be found, in any order', a > 0 && app.indexOf('.every(w => hay.indexOf(w) >= 0)', a) > a);
const seg = a > 0 ? app.slice(a, app.indexOf('\n    });', a)) : '';
ck('estimator, discipline, status and job title are searched', ['m.ceeName', 'm.designation', "m.status || 'Draft'", 'm.jobTitle'].every(k => seg.indexOf(k) > 0));
ck('the box says what it filters', app.indexOf('"aria-label": "Filter CE Monitoring"') > 0);
const f = (q, e, m) => { const body = seg.split('\n').filter(l => !/^\s*\/\*/.test(l)).join('\n'); return new Function('monSearch', 'e', 'm', 'rceOf', body)(q, e, m, () => ''); };
const E = { info: { ceNum: 'SY3-CE-1', client: 'HEDCOR', description: 'Pump seal' } }, M = { ceeName: 'Ben Reyes', status: 'Pending' };
ck('one word, any case', f('hedcor', E, M) === true);
ck('words from different columns', f('ben pending', E, M) === true && f('seal hedcor', E, M) === true);
ck('a word that is nowhere fails the row', f('ben zzz', E, M) === false);
process.exit(bad ? 1 : 0);
