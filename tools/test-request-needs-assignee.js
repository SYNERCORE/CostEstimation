/* A request cannot be logged without an assigned estimator.
   Run: node tools/test-request-needs-assignee.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const a = app.indexOf('const submitRequest = async () => {'), b = app.indexOf('setReqBusy(true);', a);
ck('submitRequest is found', a > 0 && b > a);
const head = app.slice(a, b);
ck('a blank assignee is refused with the others, before anything is saved', head.indexOf("if (!String(f.assignee || '').trim()) { _errs.assignee = 1;") > 0);
ck('the toast names what is missing', head.indexOf("Assigned to (pick at least one estimator)") > 0);

/* run just the checks with each kind of input */
const run = f => {
  const body = head.slice(head.indexOf('const _errs'), head.indexOf('if (_todo.length)'));
  return new Function('f', 'ceNum', body + '; return _todo;')(f, 'T-1');
};
ck('no assignee: refused', run({ client: 'ACME', assignee: '' }).some(t => /Assigned to/.test(t)));
ck('only spaces: refused', run({ client: 'ACME', assignee: '   ' }).some(t => /Assigned to/.test(t)));
ck('one estimator: accepted', run({ client: 'ACME', assignee: 'Ana Cruz' }).length === 0);
ck('several estimators: accepted', run({ client: 'ACME', assignee: 'Ana Cruz, Ben Reyes' }).length === 0);

ck('the label is starred and no longer says optional', app.indexOf('"Assigned to * (one or more)"') > 0 && app.indexOf('Assigned to (optional') < 0);
ck('the field turns red until one is picked', app.indexOf("reqForm._errs.assignee && !String(reqForm.assignee || '').trim()") > 0);
ck('the placeholder no longer promises a reviewer will assign', app.indexOf('Leave blank: a reviewer will assign one') < 0);
process.exit(bad ? 1 : 0);
