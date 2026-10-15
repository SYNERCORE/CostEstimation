#!/usr/bin/env node
/* The top bar is a banner landmark and the product name is the page's level-1 heading, so a screen reader can find the page's start. */
'use strict';
const fs = require('fs');
const s = fs.readFileSync('src/components/AppChrome.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('the top bar has role banner', s.includes("role: 'banner',"));
ck('the product name is a level-1 heading', s.includes("role: 'heading',") && s.includes("'aria-level': 1,"));
const info = fs.readFileSync('src/components/InfoTab.js', 'utf8');
ck('the Department, Material and No. of Days boxes have an accessible name (their visible label is not tied to them)', ["'aria-label': 'Department'", "'aria-label': 'Material'", "'aria-label': 'No. of Days'"].every(k => info.includes(k)));
ck('the screen content is the main landmark', fs.readFileSync('src/App.js', 'utf8').includes("role: 'main',"));
process.exit(bad ? 1 : 0);
