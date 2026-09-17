#!/usr/bin/env node
/*
 * A request for estimation is logged when it arrives, before it is costed:
 * CE number, customer, job, deadline, the estimator it is assigned to, and
 * the documents that came with it. It lives in CE Monitoring as an empty CE
 * flagged `request`, so it takes attachments and opens with Load like any
 * other. The estimator saves the finished estimate over it under the same
 * number -- the one overwrite allowed without Revise.
 *
 * Run: node tools/test-ce-requests.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };
const has = re => re.test(app);

console.log('logging a request:');
ck('Monitoring has a + New Request button', has(/onClick: openRequest\n  \}, "\+ New Request"\)/));
ck('it suggests the next free CE number', has(/ceNum: nextCeNum\(history, null, ceNums\)/));
ck('customer and assignee are required', has(/Customer is required\./) && has(/Assign the request to an estimator\./));
ck('a number already in use is refused', has(/const dup = await dbFindCEByNum\(ceNum\)\.catch\(\(\) => null\);\n      if \(dup\) \{/));
ck('it is saved as an empty CE flagged as a request, under its own number',
  has(/status: 'DRAFT', request: true, requestNum: ceNum/));
ck('only a SharePoint save counts -- a request nobody else can see is not assigned',
  has(/if \(!saved \|\| saved\.sp === false \|\| saved\.id == null\)/));
ck('the assignment is the Estimator column, with status Pending and who received it',
  has(/status: 'Pending', ceeName: f\.assignee\.trim\(\)/) && has(/receivedBy: currentUser\.name \|\| currentUser\.username/));
ck('deadline, date received, job title and remarks are written too',
  has(/deadline: f\.deadline \|\| ''/) && has(/dateRecv: f\.dateRecv \|\| ''/) && has(/jobTitle: String\(f\.description/) && has(/remarks: String\(f\.remarks/));
ck('the attachments panel opens straight after', has(/openAttachPanel\(saved\.id\);\n    \} catch/));
ck('estimators are offered from the user list', has(/list:'req-users'/));

console.log('\nfinding it:');
ck('the row is badged REQUEST', has(/\}, 'REQUEST'\),/));
ck('"Assigned to me" filters on the Estimator column',
  has(/if \(monMine && !meNames\(\)\.includes\(String\(m\.ceeName \|\| m\.preparedBy \|\| e\.savedBy \|\| ''\)/));
ck('and the list recomputes when it is toggled', has(/monCustFilter, monMine, monSortCol, monSortDir\]\);/));

console.log('\nthe estimator can actually see it:');
const db = fs.readFileSync('src/db.js', 'utf8');
ck('a non-admin history keeps CEs assigned to or received by them, not only their own saves',
  /h\.savedBy===username\|\|\(keep&&keep\(h\.id\)\)/.test(db) && has(/dbGetHistory\(currentUser\.username, isAdmin, isAdmin \? null : mineToSee\)/));
ck('mineToSee reads the Estimator and Received By columns',
  has(/me\.includes\(String\(m\.ceeName \|\| ''\)\.trim\(\)\.toUpperCase\(\)\) \|\| me\.includes\(String\(m\.receivedBy/));
ck('history reloads when monitoring reveals an assigned CE it lacks', has(/if \(missing && missing !== _assignedKey\.current\)/));

console.log('\nreassigning from the row:');
ck('each row has an Assign action', has(/onClick: \(\) => \{ if \(!e\._draft\) openAssign\(e\); \}\n    \}, '👤 Assign'\)/));
ck('it offers the user list', has(/list: 'assign-users'/));
ck('it writes the Estimator column through the normal monitoring save', has(/updateMon\(a\.id, 'ceeName', to\);/));
ck('and the change is audited', has(/auditLog\('reassign_ce'/));
ck('an unchanged pick writes nothing', has(/if \(to !== String\(a\.from \|\| ''\)\.trim\(\)\) \{/));

console.log('\nbuilding it out:');
ck('saving over the request is allowed only under the number it was raised as',
  has(/const _fromRequest = !!\(info\.request && String\(info\.requestNum \|\| ''\)\.toUpperCase\(\) === ceNum\);/));
ck('every other existing number is still refused', has(/if \(dup && !dup\._imported && !_fromRequest\) \{/));
ck('and the saved CE is no longer a request',
  has(/if \(_fromRequest\) \{ _entry\.info = \{\.\.\._entry\.info, request: false\}; setInfo\(p => \(\{\.\.\.p, request: false\}\)\); \}/));

/* The rule itself, run. */
const rule = (info, ceNum) => !!(info.request && String(info.requestNum || '').toUpperCase() === ceNum);
ck('a loaded request saves over itself', rule({request: true, requestNum: 'SHIC-CE-2026-1134'}, 'SHIC-CE-2026-1134'));
ck('renamed to another CE, it does not', !rule({request: true, requestNum: 'SHIC-CE-2026-1134'}, 'SHIC-CE-2026-1133'));
ck('a normal CE does not', !rule({}, 'SHIC-CE-2026-1133'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nce requests OK');
process.exit(bad ? 1 : 0);
