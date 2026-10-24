#!/usr/bin/env node
/*
 * View on an RCE request that has no CE number yet shows the request (the checklist card), not the empty read-only CE viewer.
 * Run: node tools/test-view-request.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('an unaccepted request opens the request panel', /i\.request && !i\.acceptedCeNum && i\.rce\) \{ setViewCE\(null\); setViewRce\(e\.id\); return; \}/.test(app));
ck('a real CE still opens the viewer', /\n    setViewCE\(o\);\n  \};/.test(app));
ck('My Work and CE Monitoring both go through it', /MonitoringPanel\(\{[^\n]*setViewCE: openViewCE/.test(app) && /MyWorkTab\(\{[^\n]*setViewCE: openViewCE/.test(app));
ck('the request panel finds the entry even when a filter hides it', app.includes('const _e = history.find(x => x.id === viewRce);'));
process.exit(bad ? 1 : 0);
