#!/usr/bin/env node
/*
 * Customer, Job Title and Discipline kept coming up blank in CE Monitoring:
 *  1. Saving a CE (and saving a revision) seeds them into the CE's Monitoring record where the record has nothing, never replacing a value
 *     someone typed in Monitoring.
 *  2. Revise asks for the same Project Info as Save (it used to get in without it).
 *  3. A draft row with one of the three blank says "needed" instead of a dash; drafts themselves are still allowed to be unfinished.
 *
 * Run: node tools/test-mon-seed-and-revise-gate.js
 */
'use strict';
const fs = require('fs');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const m = app.match(/const monSeed = \(inf, m\) => \{[\s\S]*?\n  \};/);
ck('monSeed exists', !!m);
const fn = m ? eval('(' + m[0].replace(/^const monSeed = /, '').replace(/;$/, '') + ')') : null;
if (fn) {
  const inf = { client: ' ACME ', description: 'Overhaul', projType: 'Mechanical' };
  const a = fn(inf, {});
  ck('an empty record gets the CE\'s Client, Description and Project type', a.customer === 'ACME' && a.jobTitle === 'Overhaul' && a.designation === 'Mechanical', JSON.stringify(a));
  const b = fn(inf, { customer: 'Typed', jobTitle: 'Typed too', designation: 'Civil' });
  ck('what someone typed in Monitoring is never replaced', Object.keys(b).length === 0, JSON.stringify(b));
  ck('a legacy discipline field counts as set', !('designation' in fn(inf, { discipline: 'Electrical' })));
  ck('a CE with a blank field seeds nothing for it', Object.keys(fn({ client: '', description: ' ', projType: '' }, {})).length === 0);
  ck('no record at all is fine', fn(inf, undefined).customer === 'ACME');
}
ck('Save seeds the record when it first lists the CE', /Object\.assign\(_w, monSeed\(_entry\.info, _m\)\);/.test(app));
ck('a revision seeds its own record too', /noteRevisionRemark\(_re\.info\.ceNum, _why, _re\.info\)/.test(app) && /\.\.\.monSeed\(inf, monData\[saved\.id\]\)/.test(app));
ck('Revise refuses an incomplete Project Info before it even asks for a reason', /infoMissing\.length\) \{\n\s+showToast\('Project Info is incomplete[^\n]*\n\s+return;\n\s+\}\n\s+const _why = await askRevisionReason\(ceNum\);/.test(app));
ck('Save is still gated, and Draft is still not', /if \(infoMissing\.length\) \{\n\s+showToast\('Project Info is incomplete/.test(app) && !/const saveDraft = guard\('draft', async \(\) => \{[\s\S]{0,600}infoMissing/.test(app));
ck('a draft row shows "needed" in each of the three blank cells', (mon.match(/e\._draft \? \/\*#__PURE__\*\/React\.createElement\("span", \{style:\{fontSize:10,color:'#F59E0B'\},title:"This draft has no (discipline|customer|job title) yet/g) || []).length === 3);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nMonitoring seed and Revise gate OK');
process.exit(bad ? 1 : 0);
