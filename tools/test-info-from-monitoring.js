#!/usr/bin/env node
/*
 * Customer, Job Title and Discipline edited in CE Monitoring live on the monitoring record, not in the CE, so a CE whose own Client,
 * Description or Project type was blank opened, printed and exported with those boxes empty. handleLoad now fills the blanks from the
 * record (every print, view and export loads the CE through handleLoad) and never overwrites what the CE itself holds.
 *
 * Run: node tools/test-info-from-monitoring.js
 */
'use strict';
const fs = require('fs');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const m = app.match(/const infoFromMon = \(inf, m\) => \{[\s\S]*?\n  \};/);
ck('infoFromMon exists', !!m);
const CE_DISCIPLINES = ['Electrical', 'Mechanical', 'Civil', 'General'];
const fn = m ? eval('(' + m[0].replace(/^const infoFromMon = /, '').replace(/;$/, '') + ')') : null;
if (fn) {
  const mon = { customer: ' PPEI ', jobTitle: 'EMERGENCY MECHANICAL INTEGRITY', designation: 'MECHANICAL' };
  const a = fn({ client: '', description: '  ', projType: '' }, mon);
  ck('blank Client, Description and Project type are filled from the record', a.client === 'PPEI' && a.description === 'EMERGENCY MECHANICAL INTEGRITY' && a.projType === 'Mechanical', JSON.stringify(a));
  const b = fn({ client: 'ACME', description: 'Own text', projType: 'Civil' }, mon);
  ck('what the CE already holds is never overwritten', b.client === 'ACME' && b.description === 'Own text' && b.projType === 'Civil');
  ck('a discipline that is not one of the four is not invented', fn({ projType: '' }, { designation: 'Instrumentation' }).projType === '');
  ck('no record, or an empty one, changes nothing', fn({ client: '' }, null).client === '' && fn({ client: '' }, {}).client === '');
  const src = { client: '' }; fn(src, mon); ck('the saved object is not mutated', src.client === '');
}
ck('handleLoad uses it, looking the record up by the CE id in memory and then in the saved monitoring cache', /\.\.\.infoFromMon\(d\.info \|\| \{\}, _mon\)/.test(app) && /\(monData \|\| \{\}\)\[d\.id\] \|\| \(LS\.get\('monitoring'\) \|\| \{\}\)\[d\.id\]/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nInfo from monitoring OK');
process.exit(bad ? 1 : 0);
