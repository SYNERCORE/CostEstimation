#!/usr/bin/env node
/*
 * The RCE checklist dialog must not close when the backdrop is clicked (a stray click lost a half-filled form); it closes from its own buttons.
 * Run: node tools/test-rce-no-backdrop-close.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = app.indexOf('reqForm && (() => {');
const b = app.indexOf('"Request for Costing (RCE) Checklist"');
const head = app.slice(a, b);
ck('found the dialog', a > 0 && b > a);
ck('the backdrop has no click handler that clears the form', !/onClick:\(\)=>\{[^}]*setReqForm\(null\)/.test(head));
ck('the form can still be closed from its own buttons', /setReqForm\(null\)/.test(app.slice(b, b + 20000)));
const rv = fs.readFileSync('src/components/RceReviewModal.js', 'utf8');
ck('the review dialog does not close on a backdrop click either', !rv.includes('if (!busy) onClose(); }') && rv.includes("onClick: onClose }, 'Cancel'"));
process.exit(bad ? 1 : 0);
