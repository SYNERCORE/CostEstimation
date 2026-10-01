/* Giving a discipline to CEs that have none.
   Run: node tools/test-bulk-discipline.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const a = app.indexOf('const fillBlankDisc = () => {'), b = app.indexOf('const custOptions', a);
const src = app.slice(a, b);
const monDisc = (e, m) => m.designation || m.discipline || e.info?.discipline || e.info?.projType || '';
const run = (rows, mon, answer, ok, admin = true) => {
  const calls = [], toasts = [];
  new Function('isAdmin', 'sortedHistory', 'monDisc', 'monOf', 'showToast', 'window', 'CE_DISCIPLINES', 'updateMon', 'auditLog', 'currentUser',
    src + 'fillBlankDisc();')(admin, rows, monDisc, e => mon[e.id] || {}, (m, err) => toasts.push({ m, err }),
    { prompt: () => answer, confirm: () => ok }, ['Electrical', 'Mechanical', 'Civil', 'General'], (id, f, v) => calls.push([id, f, v]), () => {}, { username: 'u' });
  return { calls, toasts };
};
const ROWS = [{ id: 1, info: {} }, { id: 2, info: { projType: 'Civil' } }, { id: 3, info: {} }, { id: 4, _draft: {}, info: {} }, { id: 'x', info: {} }];
const MON = { 3: { designation: '' } };
let r = run(ROWS, MON, 'mechanical', true);
ck('only the blank CEs are written', JSON.stringify(r.calls.map(c => c[0])) === '[1,3]', JSON.stringify(r.calls));
ck('with the discipline as typed in the list, case-insensitively', r.calls.every(c => c[1] === 'designation' && c[2] === 'Mechanical'));
ck('one that already has a discipline is never overwritten', !r.calls.some(c => c[0] === 2));
ck('drafts and unsaved rows are skipped', !r.calls.some(c => c[0] === 4 || c[0] === 'x'));
r = run(ROWS, MON, 'plumbing', true);
ck('a name that is not a discipline writes nothing and says so', r.calls.length === 0 && r.toasts[0].err === true);
r = run(ROWS, MON, 'Civil', false);
ck('declining the confirmation writes nothing', r.calls.length === 0);
r = run(ROWS, MON, null, true);
ck('cancelling the prompt writes nothing', r.calls.length === 0);
r = run(ROWS, MON, 'Civil', true, false);
ck('non-admins cannot', r.calls.length === 0);
ck('the button is admin-only and only when blanks exist', app.indexOf("isAdmin && discOptions.some(o => !o.label) && /*#__PURE__*/React.createElement(\"button\"") > 0);
process.exit(bad ? 1 : 0);
