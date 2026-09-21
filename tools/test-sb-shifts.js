#!/usr/bin/env node
/* SOW Breakdown: manpower is shown by shift, and a whole shift can be filed
   to a scope task at once. Run: node tools/test-sb-shifts.js */
'use strict';
const app = require('fs').readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('unassigned manpower is grouped under its shift', app.includes("className: 'sb-shift-group'"));
ck('a shift can be ticked as one', app.includes("title: 'Tick every '"));
ck('a whole shift can be assigned to a task', app.includes('assign whole shift to') && app.includes('setMp(p => p.map(x => ids.has(x.id) ? { ...x, taskId: v } : x))'));
ck('a task card says which shift each crew row is', app.includes("className: 'sb-shift-tag'"));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nbreakdown shifts OK'); process.exit(bad ? 1 : 0);
