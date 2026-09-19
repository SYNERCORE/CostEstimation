#!/usr/bin/env node
/* Masterlist deletes ask first and land in a 30-day Trash.
   Run: node tools/test-ml-trash.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8'), db = fs.readFileSync('src/db.js', 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const del = (app.match(/const delML = async id => \{[\s\S]*?\n    \};/) || [''])[0];
ck('the red x asks before deleting', /if \(!confirm\(/.test(del));
ck('and moves the item to the Trash first', /await mlToTrash\(mlTab, \[it\]\);[\s\S]*saveML/.test(del));
ck('Clear List goes to the Trash too', /mlToTrash\(mlTab, masterlist\[mlTab\] \|\| \[\]\);/.test(app));
ck('the Trash keeps 30 days', /const ML_TRASH_DAYS = 30;/.test(db) && /Date\.now\(\) - ML_TRASH_DAYS \* 864e5/.test(db));
ck('it is shared, merged with what the site holds', /Title eq 'trash'/.test(db) && /const out=apply\(theirs\)/.test(db));
ck('items can be restored', /const mlRestore = async entries/.test(app));
ck('permanent delete asks again and is admin only', /Delete ' \+ entries\.length[\s\S]{0,80}permanently/.test(app) && /isAdmin && \/\*#__PURE__\*\/React\.createElement\("button", \{style:\{\.\.\.btn\('danger',true\)/.test(app));
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nmasterlist trash OK');
process.exit(bad ? 1 : 0);
