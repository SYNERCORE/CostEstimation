#!/usr/bin/env node
/*
 * "Add details": whoever raised a request that is still waiting can add to its checklist in place; nothing is routed, re-sent or re-statused.
 * Run: node tools/test-add-details.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8'), mw = fs.readFileSync('src/components/MyWorkTab.js', 'utf8'), rv = fs.readFileSync('src/components/RceReviewModal.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf("if (mode === 'add') {"), b = app.indexOf("const st = mode === 'update' ? 'resubmitted'");
const blk = app.slice(a, b);
ck('add mode exists in saveReview before the routing code', a > 0 && b > a);
ck('only the raiser may add', app.includes("(mode === 'update' || mode === 'add') && !reqOwns("));
ck('it keeps the review status and sends no notice', blk.includes('{ ...i0, rce }') && !/reviewStatus|mkReq|updateMon/.test(blk));
ck('it saves to SharePoint and the local copy', /dbPatchCEInfo/.test(blk) && /LS\.set\('history'/.test(blk));
ck('My Work offers Add details to the raiser, on a waiting request', mw.includes("openReview(x.e, 'add')") && mw.includes('i.request && !i.acceptedCeNum'));
ck('the dialog says it only saves, with a Save details button', rv.includes("mode === 'add' ? 'Save details'") && rv.includes('nothing is sent or routed'));
process.exit(bad ? 1 : 0);
