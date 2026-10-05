/* Two fixes from the review of builds 333-339:
   - a saved row still holding the removed status "Waiting in..." reads as Waiting for Information
   - the calculators' team history is re-read before it is written, so two estimators do not wipe each other
   Run: node tools/test-waiting-in-and-calc-history.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const cfg = R('src/config.js'), app = R('src/App.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const NL = String.fromCharCode(10);

const a = cfg.indexOf('const STATUS_RENAMED'), b = cfg.indexOf('const DEFAULT_STATUS_OPTIONS');
const ceStatusName = new Function(cfg.slice(a, b) + NL + 'return ceStatusName;')();
console.log('statuses:');
ck('"Waiting in..." reads as Waiting for Information', ceStatusName('Waiting in...') === 'Waiting for Information');
ck('"For site insp." still reads as For site Inspection', ceStatusName('For site insp.') === 'For site Inspection');
ck('a current status is left alone', ceStatusName('Ongoing') === 'Ongoing' && ceStatusName('') === '');
ck('importing "waiting in" now lands on Waiting for Information', app.indexOf("'waiting in':'Waiting for Information'") > 0);

console.log(NL + 'calculator history:');
const s = app.indexOf('    const ce = String(info.ceNum'), e = app.indexOf('    setCalcOpen(false);' + NL + '    showToast((added + updated)', s);
const blk = app.slice(s, e);
ck('the stored list is read again just before it is written', blk.indexOf("dbGetCompanyKey('calc_hist')") > 0 && blk.indexOf("dbSaveCompanyKey('calc_hist'") > blk.indexOf("dbGetCompanyKey('calc_hist')"));
ck('an unsaved CE is filed under its user', blk.indexOf("'(unsaved ' + (currentUser?.username || '') + ')'") > 0);
const run = (stored, local, info, used, user) => {
  const out = { local: null, saved: null };
  const fn = new Function('info', 'currentUser', 'calcHist', 'used', 'setCalcHist', 'dbGetCompanyKey', 'dbSaveCompanyKey', 'logSwallowed',
    blk + NL + 'return Promise.resolve();');
  return fn(info, { username: user }, local, used, v => { out.local = v; }, async () => stored, async (k, o) => { out.saved = o; return true; }, () => {})
    .then(() => new Promise(r => setTimeout(r, 5))).then(() => out);
};
(async () => {
  const theirs = { rows: [{ ce: 'CE-B', k: 'smaw', v: 30, at: 't' }] };
  let o = await run(theirs, [], { ceNum: 'CE-A' }, { smaw: 35 }, 'me');
  ck("another estimator's entry made since this session started is kept", o.saved.rows.some(r => r.ce === 'CE-B') && o.saved.rows.some(r => r.ce === 'CE-A' && r.v === 35));
  o = await run({ rows: [{ ce: 'CE-A', k: 'smaw', v: 20, at: 't' }] }, [], { ceNum: 'CE-A' }, { smaw: 35 }, 'me');
  ck('this CE keeps one value per allowance, the latest', o.saved.rows.filter(r => r.ce === 'CE-A' && r.k === 'smaw').length === 1 && o.saved.rows[0].v === 35);
  o = await run(null, [{ ce: 'CE-X', k: 'tig', v: 1, at: 't' }], { ceNum: '' }, { tig: 2 }, 'ann');
  ck('with nothing stored it builds on what this session has', o.saved.rows.some(r => r.ce === 'CE-X') && o.saved.rows.some(r => r.ce === '(unsaved ann)'));
  const many = { rows: Array.from({ length: 405 }, (_, i) => ({ ce: 'C' + i, k: 'smaw', v: 1, at: 't' })) };
  o = await run(many, [], { ceNum: 'N' }, { smaw: 5 }, 'me');
  ck('it is still capped at the newest 400', o.saved.rows.length === 400 && o.saved.rows[399].ce === 'N');
  process.exit(bad ? 1 : 0);
})();
