/* "Requests I sent" on My Work. A request stops being the requestor's by the
   savedBy test the moment the estimator makes the first costed save, so the
   section must key on receivedBy, which is stamped once and never changes.
   Run: node tools/test-requests-sent.js */
'use strict';
const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const i = app.indexOf('const sent = rows.filter(');
const line = app.slice(i, app.indexOf(';', i));
/* The shipped filter, run on rows. */
const names = ['JESSICA TAN', 'JESS'];
const run = new Function('rows', 'names', line + '; return sent;');
const R = (id, m, d) => ({ e: { id, _draft: d }, m });
const out = run([
  R(1, { receivedBy: 'jessica tan', ceeName: 'Aljon', status: 'Pending' }),
  R(2, { receivedBy: 'Jessica Tan', ceeName: 'Kenneth', status: 'Submitted' }),
  R(3, { receivedBy: 'Somebody Else' }),
  R(4, {}),
  R(5, { receivedBy: 'jessica tan' }, true)], names).map(x => x.e.id);
ck('finds her requests whatever their status, case-insensitively', out.indexOf(1) >= 0 && out.indexOf(2) >= 0);
ck('not other people\'s, nor rows with no requester, nor drafts', out.length === 2);
ck('it is keyed on receivedBy, not savedBy, so it survives the estimator\'s save', line.indexOf('savedBy') < 0);
ck('the section is on My Work for every requestor, even with none sent',
  app.indexOf("(isRequestor || sent.length > 0) && section('📤 Requests I sent'") > 0);
ck('and shows who it is with', app.indexOf("' · with ' + x.m.ceeName") > 0);
const sp = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'sp.js'), 'utf8');
ck('the SharePoint throttle code is recognised, not shown as an outage', sp.indexOf('-2146232832') > 0);
console.log(bad ? bad + ' FAILURE(S)' : 'requests sent OK');
process.exit(bad ? 1 : 0);
