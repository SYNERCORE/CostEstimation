/* The estimate stays shut until Project Info has an issuing company, a project type, a
   discipline and a description, and what is missing is listed all together.
   Run: node tools/test-project-info-gate.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('  const infoMissing = isRequestor'), b = app.indexOf('  const _gated', a);
const src = app.slice(a, b);
const miss = (o) => new Function('isRequestor', 'info', 'ceType', 'companies', src + '\nreturn infoMissing;')(!!o.req, o.info || {}, o.ceType === undefined ? 'onsite' : o.ceType, o.companies || [{ id: 1 }]);
ck('a blank sheet lists the discipline and the description', miss({}).join() === 'Discipline,Project Description');
ck('all four are listed together when all are missing', miss({ ceType: '', companies: [] }).join() === 'Issuing Company,Project Type,Discipline,Project Description');
ck('a spaces-only description does not count', miss({ info: { projType: 'Mechanical', description: '   ' } }).join() === 'Project Description');
ck('complete Project Info lets the estimate open', miss({ info: { projType: 'Civil', description: 'Pump overhaul' } }).length === 0);
ck('a requestor, who only logs a request, is never held', miss({ req: true }).length === 0);
const gated = (app.match(/const _gated = \[([^\]]*)\]/) || [])[1] || '';
ck('every estimating screen after Project Info is gated', ['sow', 'sowbreak', 'manpower', 'tools', 'materials', 'ppe', 'misc', 'summary'].every(t => gated.indexOf("'" + t + "'") >= 0));
ck('Project Info itself, My Work and the libraries are not', ['info', 'mywork', 'history', 'scopelib', 'masterlist', 'dashboard'].every(t => gated.indexOf("'" + t + "'") < 0));
ck('a gated tab sends the person back to Project Info with the list', app.indexOf("setTab('info');") > 0 && app.indexOf("'Fill in Project Info first. Still needed: '") > 0);
ck('Save refuses incomplete Project Info with the same list', app.indexOf("'Project Info is incomplete. Still needed: '") > 0);
ck('the description is marked required and outlined when empty', app.indexOf("String(info.description || '').trim() ? {} : { borderColor: ERR }") > 0);
process.exit(bad ? 1 : 0);
