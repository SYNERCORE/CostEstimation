/* A request that is missing several required fields says so once, listing all.
   Run: node tools/test-request-all-missing.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('const submitRequest = async () => {'), b = app.indexOf('setReqBusy(true);', a);
const head = app.slice(a, b);
const run = f => {
  const toasts = [];
  const fn = new Function('reqForm', 'showToast', 'setReqForm', 'rceUnanswered',
    head.replace('const submitRequest = async () => {', 'return (() => {') + '  return "ok"; })();');
  const r = fn(f, (m, e) => toasts.push(m), () => {}, x => (x.unanswered || []));
  return { r, toasts };
};
let o = run({});
ck('an empty form is refused with ONE message', o.r === undefined && o.toasts.length === 1);
ck('it names RCE No., Customer and Assigned to together', /RCE No./.test(o.toasts[0]) && /Customer/.test(o.toasts[0]) && /Assigned to/.test(o.toasts[0]));
o = run({ rceNo: 'RCE-1', client: 'X', assignee: 'E' });
ck('the checklist and item 14 are not asked of whoever logs it', o.r === 'ok' && o.toasts.length === 0);
ck('a complete form goes through with no message', o.r === 'ok' && o.toasts.length === 0);
ck('flagged inputs get a red border', app.indexOf("reqForm._errs[k] && !reqForm[k]") > 0);
process.exit(bad ? 1 : 0);