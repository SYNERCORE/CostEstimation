/* Continue on the start dialog gives a new CE its number; the calculators are a main tab.
   Run: node tools/test-continue-number-and-calc-tab.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = R('src/App.js'), cfg = R('src/config.js'), calc = R('src/components/Calculators.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const NL = String.fromCharCode(10);

console.log('Continue:');
const a = app.indexOf('const continueGate = () => {'), b = app.indexOf('const _gated', a);
const src = app.slice(a, b);
const run = o => {
  const c = { set: null, claimed: null, gate: null };
  const fn = new Function('setPiGate', '_ownNum', 'info', '_claimedSeq', 'companies', 'history', 'ceNums', 'nextCeNumForCompany', 'setInfo', 'claimCeNum', 'ceSeqOf', 'String',
    src + NL + 'return continueGate;')(v => { c.gate = v; }, { current: o.own || '' }, { ceNum: o.ceNum, companyId: o.companyId }, { current: o.claimed || '' },
    [{ id: 1, cePrefix: 'SHIC' }, { id: 2, cePrefix: 'SY3' }], [], [], (h, co) => (co.cePrefix + '-CE-2026-1196'), f => { c.set = f({}); }, (p, g) => { c.claimed = [p, g]; },
    n => { const m = String(n).match(/^([A-Z0-9]+)-CE-(\d{4})-(\d+)$/); return m ? { prefix: m[1], seq: m[2] + '-' + m[3].padStart(4, '0') } : null; }, String);
  fn();
  return c;
};
let c = run({ ceNum: 'SHIC-CE-2026-0001', companyId: 2 });
ck('a fresh editor on its placeholder number is given the next number for the chosen company', c.set && c.set.ceNum === 'SY3-CE-2026-1196' && c.claimed && c.claimed[1] === 'SY3-CE-2026-1196');
ck('and the dialog closes', c.gate === false);
c = run({ ceNum: 'SHIC-CE-2026-1196', claimed: '2026-1196', companyId: 1 });
ck('a number already claimed for this CE is kept, not claimed again', !c.set && !c.claimed);
c = run({ ceNum: 'SHIC-CE-2026-1100', own: 'SHIC-CE-2026-1100', companyId: 1 });
ck('a CE that was opened or saved keeps its number', !c.set && !c.claimed);

console.log(NL + 'the Calculators tab:');
ck('it is one of the tabs', cfg.indexOf('{id:"calculators",label:"🧮 Calculators"}') > 0);
ck('it is a main group beside Workspace, Estimate and Libraries', app.indexOf("{id: 'calculators', label: 'Calculators', ids: ['calculators']}") > 0);
ck('it shows the calculators as a page, not the side drawer', app.indexOf("tab === 'calculators' && /*#__PURE__*/React.createElement(CalcDrawer, {" + NL + '  page: true, open: true') > 0);
ck('the drawer has a page mode: no close button, no Escape handler', calc.indexOf("page ? null : h('button', { className: 'calc-x'") > 0 && calc.indexOf('if (!open || page) return;') > 0);
ck('adding the lines takes you to Materials, where they are', app.indexOf("calcAddLines(l, k, u); setTab('materials');") > 0);
ck('the page has its own layout rule', R('index.html').indexOf('.calc-page{position:static') > 0);
ck('the Materials button still opens the drawer', app.indexOf('openCalc: () => setCalcOpen(true)') > 0);
ck('requestors, who have no estimate, do not get it', app.indexOf("const REQUESTOR_TABS = ['mywork', 'info', 'sow', 'history', 'dashboard']") > 0);
process.exit(bad ? 1 : 0);
