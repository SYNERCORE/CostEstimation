/* ATTENTION names the Sales Agent: a required dropdown of Requestor accounts plus an admin's extra names.
   END USER is the client and stays "C/O SALES" unless the sales rep gives one. (The file keeps its first name, which CI registers.)
   Run: node tools/test-sales-agent-end-user.js */
'use strict';
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const gate = rd('src/components/ProjectInfoGate.js'), app = require('./lib/appsrc').plus(rd('src/App.js')).replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const ce = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat(9) });
const m = new Function('React', 'isRequestorRole', gate + '\nreturn { salesAgentNames, attentionFor, isSalesAgent, SalesAgentSelect };')(
  { createElement: ce }, r => r === 'requestor');

const names = m.salesAgentNames([
  { name: 'Maria Reyes', role: 'requestor', status: 'active' }, { name: 'Ana Estimator', role: 'user' },
  { name: 'Gone Agent', role: 'requestor', status: 'disabled' }, { name: 'New Agent', role: 'requestor', status: 'pending' }, { username: 'jcruz', role: 'requestor' }
], ['  Ben   Santos ', 'maria reyes', '']);
ck('active Requestor accounts and the extra names, once each, sorted', names.join('|') === 'Ben Santos|jcruz|Maria Reyes');
ck('it prints the name in capitals, with no C/O', m.attentionFor('Maria Reyes') === 'MARIA REYES' && m.attentionFor('') === '' && m.attentionFor(undefined) === '');
ck('a name can be typed with a space in it', m.attentionFor('Maria ') === 'MARIA ');
ck('SALES DEPARTMENT, SALES and blank are not an agent', ['SALES DEPARTMENT', 'Sales Dept.', 'SALES', 'C/O SALES', '', undefined].every(v => !m.isSalesAgent(v)) && m.isSalesAgent('MARIA REYES') && m.isSalesAgent('SALESA CRUZ'));

const opts = t => t.kids.flat(9).filter(k => k && k.type === 'option').map(k => k.props.value);
let got = null;
let s = m.SalesAgentSelect({ value: '', agents: names, onChange: v => { got = v; } });
ck('with names listed it is a dropdown with a blank first choice', s.type === 'select' && opts(s).join('|') === '|BEN SANTOS|JCRUZ|MARIA REYES');
s.props.onChange({ target: { value: 'JCRUZ' } });
ck('picking an agent stores the name', got === 'JCRUZ');
s = m.SalesAgentSelect({ value: 'SALES DEPARTMENT', agents: names, onChange() {} });
ck('an older CE keeps what it holds, shown as naming no agent', s.props.value === 'SALES DEPARTMENT' && opts(s)[1] === 'SALES DEPARTMENT');
s = m.SalesAgentSelect({ value: '', agents: [], onChange() {} });
ck('with nobody listed it is a text box, so nobody is stuck', s.type === 'input');

const helpers = rd('src/helpers.js');
ck('a new CE starts with no Attention and END USER as C/O SALES', /\n  attention: "",\n/.test(helpers) && /\n  endUser: "C\/O SALES",\n/.test(helpers));
ck('Attention is a required item and End User is not', app.includes("!String(info.attention || '').trim() ? 'Attention' : ''") && !app.includes("? 'End User' : ''"));
const fn = app.slice(app.indexOf('const apvSubmit = async'), app.indexOf('const apvWithdraw'));
ck('routing stops while Attention names no agent, before anything is saved', fn.indexOf('!isSalesAgent(info.attention)') > 0 && fn.indexOf('!isSalesAgent(info.attention)') < fn.indexOf('apvPersist(apv'));
ck('a request fills Attention only when Assigned sales is a listed agent', app.includes('attention: attentionFor(salesAgents.find(') && !app.includes('endUser: attentionFor('));
const info = rd('src/components/InfoTab.js'), sum = rd('src/components/SummaryTab.js');
ck('Project Info and the Summary sheet use the dropdown for Attention', [info, sum].every(t => t.includes('SalesAgentSelect({') && /value: info\.attention,\n(    agents: ctx\.salesAgents,\n)?    onChange: v =>/.test(t)));
ck('End User is a plain box again, C/O SALES on the sheet when blank', /endUser: e\.target\.value/.test(info) && sum.includes("value: info.endUser || 'C/O SALES',"));
ck('an admin keeps the extra names in the Users tab', rd('src/components/AdminPanel.js').includes('SalesAgentsPanel'));
process.exit(bad ? 1 : 0);
