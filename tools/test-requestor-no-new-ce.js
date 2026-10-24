#!/usr/bin/env node
/*
 * A requestor raises requests; they cannot start a blank CE (New button, Ctrl+N or banner), because they could not save or cost it.
 * Run: node tools/test-requestor-no-new-ce.js
 */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8'), chrome = fs.readFileSync('src/components/AppChrome.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('handleNew refuses a requestor before doing anything', /const handleNew = \(\) => \{\n[^\n]*\n    if \(isRequestor\) \{ showToast\([^\n]*return; \}\n    _ownNum\.current/.test(app));
ck('the New button is not drawn for a requestor', /!isRequestor && \/\*#__PURE__\*\/React\.createElement\("button", \{\n    className: "tb-btn",\n    style: [^\n]*\n    onClick: handleNew,/.test(chrome));
process.exit(bad ? 1 : 0);
