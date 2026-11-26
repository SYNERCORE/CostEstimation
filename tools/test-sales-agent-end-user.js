/* END USER names the Sales Agent: a required dropdown of Requestor accounts plus an admin's extra names.
   Run: node tools/test-sales-agent-end-user.js */
'use strict';
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const gate = rd('src/components/ProjectInfoGate.js'), app = require('./lib/appsrc').plus(rd('src/App.js')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const ce = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat(9) });
const m = new Function('React', 'isRequestorRole', gate + '\nreturn { salesAgentNames, endUserFor, isSalesAgentEndUser, SalesAgentSelect };')(
  { createElement: ce }, r => r === 'requestor');

const names = m.salesAgentNames([
  { name: 'Maria Reyes', role: 'requestor', status: 'active' }, { name: 'Ana Estimator', role: 'user' },
  { name: 'Gone Agent', role: 'requestor', status: 'disabled' }, { name: 'New Agent', role: 'requestor', status: 'pending' }, { username: 'jcruz', role: 'requestor' }
], ['  Ben   Santos ', 'maria reyes', '']);
ck('active Requestor accounts and the extra names, once each, sorted', names.join('|') === 'Ben Santos|jcruz|Maria Reyes');
ck('it prints as C/O NAME', m.endUserFor('Maria Reyes') === 'C/O MARIA REYES' && m.endUserFor('c/o ben') === 'C/O BEN' && m.endUserFor('') === '' && m.endUserFor(undefined) === '');
ck('a name can be typed with a space in it', m.endUserFor('Maria ') === 'C/O MARIA ');
ck('C/O SALES, SALES and blank are not an agent', ['C/O SALES', 'c/o sales', 'SALES', 'C/O SALES DEPARTMENT', '', undefined].every(v => !m.isSalesAgentEndUser(v)) && m.isSalesAgentEndUser('C/O MARIA REYES') && m.isSalesAgentEndUser('C/O SALESA CRUZ'));

const opts = t => t.kids.flat(9).filter(k => k && k.type === 'option').map(k => k.props.value);
let got = null;
let s = m.SalesAgentSelect({ value: '', agents: names, onChange: v => { got = v; } });
ck('with names listed it is a dropdown with a blank first choice', s.type === 'select' && opts(s).join('|') === '|C/O BEN SANTOS|C/O JCRUZ|C/O MARIA REYES');
s.props.onChange({ target: { value: 'C/O JCRUZ' } });
ck('picking an agent stores the C/O line', got === 'C/O JCRUZ');
s = m.SalesAgentSelect({ value: 'C/O SALES', agents: names, onChange() {} });
ck('an older CE keeps what it holds, shown as naming no agent', s.props.value === 'C/O SALES' && opts(s)[1] === 'C/O SALES');
s = m.SalesAgentSelect({ value: '', agents: [], onChange() {} });
ck('with nobody listed it is a text box, so nobody is stuck', s.type === 'input');

ck('a new CE starts with no end user', /\n  endUser: "",\n/.test(rd('src/helpers.js')));
ck('it is one of the required items that hold the estimate shut', app.includes("!String(info.endUser || '').trim() ? 'End User' : ''"));
const fn = app.slice(app.indexOf('const apvSubmit = async'), app.indexOf('const apvWithdraw'));
ck('routing stops while the line names no agent, before anything is saved', fn.indexOf('!isSalesAgentEndUser(info.endUser)') > 0 && fn.indexOf('!isSalesAgentEndUser(info.endUser)') < fn.indexOf('apvPersist(apv'));
ck('a request is prefilled only when Assigned sales is a listed agent', app.includes('endUser: endUserFor(salesAgents.find('));
const info = rd('src/components/InfoTab.js'), sum = rd('src/components/SummaryTab.js');
ck('Project Info and the Summary sheet use the same dropdown', rd('src/components/InfoTab.js').includes('SalesAgentSelect({') && rd('src/components/SummaryTab.js').includes('SalesAgentSelect({') && !rd('src/components/SummaryTab.js').includes("info.endUser || 'C/O SALES'"));
ck('an admin keeps the extra names in the Users tab', rd('src/components/AdminPanel.js').includes('SalesAgentsPanel'));
/* Adding an agent from the dropdown. */
(async () => {
  let store = { names: ['Ben Santos'] }, saves = 0, ok = true;
  const a = new Function('React', 'isRequestorRole', 'dbGetCompanyKey', 'dbSaveCompanyKey', gate + '\nreturn { salesAgentAdd, SalesAgentSelect };')(
    { createElement: ce }, r => r === 'requestor', async () => store, async (k, v) => { saves++; if (ok) store = v; return ok; });
  let r = await a.salesAgentAdd('  c/o  Hedesa   Macahia ', ['Maria Reyes']);
  ck('a new name is tidied, added to the shared list and kept with the others', r.added && r.shared && r.name === 'Hedesa Macahia' && store.names.join('|') === 'Ben Santos|Hedesa Macahia');
  const before = saves;
  r = await a.salesAgentAdd('maria reyes', ['Maria Reyes']);
  const r2 = await a.salesAgentAdd('BEN SANTOS', []);
  ck('a name already offered is picked as it stands, not added twice', !r.added && r.name === 'Maria Reyes' && !r2.added && r2.name === 'Ben Santos' && saves === before);
  ck('blank or "Sales" is not an agent and saves nothing', await a.salesAgentAdd('  ', []) === null && await a.salesAgentAdd('C/O Sales', []) === null && saves === before);
  ok = false;
  r = await a.salesAgentAdd('Mari Carandang', []);
  ck('a SharePoint refusal is reported', r.added && !r.shared);

  let asked = null, changed = null;
  const sel = a.SalesAgentSelect({ value: '', agents: ['Ben Santos'], onChange: v => { changed = v; }, onAddAgent: pick => { asked = pick; } });
  ck('the add entry is last in the dropdown', opts(sel)[opts(sel).length - 1] === '__add_agent__');
  sel.props.onChange({ target: { value: '__add_agent__' } });
  ck('choosing it asks for a name and never writes the entry onto the CE', typeof asked === 'function' && changed === null);
  const plain = a.SalesAgentSelect({ value: '', agents: ['Ben Santos'], onChange() {} });
  ck('without the right to add there is no add entry', !opts(plain).includes('__add_agent__'));
  const empty = a.SalesAgentSelect({ value: '', agents: [], onChange() {}, onAddAgent() {} });
  ck('with nobody listed an admin still gets the dropdown, to add the first', empty.type === 'select');
  ck('only admins and the owner are given it, in all three places', app.split('onAddAgent: isAdmin ? addSalesAgent : null').length - 1 === 3);
  ck('both tabs hand it to the dropdown', [info, sum].every(t => t.includes('onAddAgent: ctx.onAddAgent,')));
  process.exit(bad ? 1 : 0);
})();
