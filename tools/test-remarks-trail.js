#!/usr/bin/env node
/* CE Monitoring remarks keep a trail: every remark, who and when; nothing is overwritten.
   Run: node tools/test-remarks-trail.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8'), db = fs.readFileSync('src/db.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const merge = new Function(db.match(/function _monMergeLog\(theirs,mine\)\{[\s\S]*?\n\}/)[0] + ';return _monMergeLog;')();

ck('a remark is appended to remarksLog with who and when', /if \(field === 'remarks'\) \{[\s\S]{0,600}extra\.remarksLog = log\.slice\(-60\);/.test(app));
ck('the remark from before the trail becomes its first entry', /if \(!log\.length && String\(before\.remarks \|\| ''\)\.trim\(\)\) log = \[\{ text: String\(before\.remarks\)/.test(app));
ck('the row has a Remarks button that opens the trail', /'💬 Remarks'/.test(app) && /setRemarksPanel\(\{ id: e\.id,/.test(app));

console.log('\ntwo people adding at once:');
const a = [{ text: 'old', at: '2026-09-01T00:00:00Z', by: 'A' }];
const mine = [...a, { text: 'mine', at: '2026-09-19T01:00:00Z', by: 'A' }];
const theirs = [...a, { text: 'theirs', at: '2026-09-19T02:00:00Z', by: 'B' }];
const m = merge(theirs, mine);
ck('both remarks survive the merge', m.length === 3 && m.some(h => h.text === 'mine') && m.some(h => h.text === 'theirs'));
ck('in time order', m[2].text === 'theirs');
ck('and the column takes the latest', /if\(last\)toWrite\.remarks=last\.text\|\|'';/.test(db));
ck('status trail entries still merge as before', merge([{ status: 'X', at: '1', by: 'a' }], [{ status: 'X', at: '1', by: 'a' }]).length === 1);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nremarks trail OK');
process.exit(bad ? 1 : 0);
