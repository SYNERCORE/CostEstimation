/* Revising a CE asks for the reason, refuses without one, keeps it on the CE and puts it in the revision's Monitoring remarks.
   Run: node tools/test-revision-needs-reason.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
const g = k => { const i = app.indexOf(k); return i < 0 ? '' : app.slice(i, i + 2600); };
ck('a prompt asks for the reason; cancel or a blank answer returns nothing', app.indexOf("const askRevisionReason = (num) => {") > 0 && app.indexOf("if (t == null) return null;") > 0 && app.indexOf("trim().length < 3") > 0 && app.indexOf('A revision needs a reason. Nothing was revised.') > 0);
const btn = g("const handleSaveRevision = guard('revise'");
ck('the Revise button asks first and stops without a reason', /askRevisionReason\(ceNum\);\s*if \(!_why\) return;/.test(btn) && btn.indexOf('await dbSaveHistory') > btn.indexOf('askRevisionReason'));
ck('the reason is saved on the CE and in the revision\'s remarks', btn.indexOf('revisionReason: _why') > 0 && btn.indexOf('noteRevisionRemark(_re.info.ceNum, _why)') > 0);
const lst = g('const handleRevise = (e) => {');
ck('Revise from the list asks before loading the copy and stops without a reason', /askRevisionReason\(raw \|\| newCeNum\);\s*if \(!_why\) return;/.test(lst) && lst.indexOf('askRevisionReason') < lst.indexOf('handleLoad('));
ck('that copy carries the reason and is remembered for its first save', lst.indexOf('revisionReason: _why') > 0 && lst.indexOf('_revReason.current = {num: newCeNum.toUpperCase(), why: _why}') > 0);
ck('saving it writes the remark once, without overwriting a remark already there', app.indexOf("_revReason.current.num === String(ceNum).toUpperCase() && !(monData[saved.id] || {}).remarks") > 0 && app.indexOf('_revReason.current = null;') > 0);
process.exit(bad ? 1 : 0);
