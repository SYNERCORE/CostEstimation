/* The estimate stays shut until Project Info has an issuing company, a project type, a
   discipline and a description, and what is missing is listed all together.
   Run: node tools/test-project-info-gate.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8'));
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const a = app.indexOf('  const infoMissing = isRequestor'), b = app.indexOf('  const pickCompany', a);
const src = app.slice(a, b);
const miss = (o) => new Function('isRequestor', 'info', 'ceType', 'companies', src + '\nreturn infoMissing;')(!!o.req, Object.assign({ companyId: 1, client: 'HEDCOR' }, o.info || {}), o.ceType === undefined ? 'onsite' : o.ceType, [{ id: 1 }]);
ck('a blank sheet lists the discipline and the description', miss({}).join() === 'Discipline,Project Description');
ck('all five are listed together when all are missing', miss({ ceType: '', info: { companyId: '', client: '' } }).join() === 'Issuing Company,Client Name,Project Type,Discipline,Project Description');
ck('a spaces-only client name does not count', miss({ info: { client: '  ', projType: 'Civil', description: 'x' } }).join() === 'Client Name');
ck('a new CE starts with no company and no project type', app.indexOf('useState("");') > 0 && app.indexOf("setCeType('');") > 0 && app.indexOf("companyId: '',\n      ceNum: _newGuess") > 0);
ck('a CE saved before this keeps the company it was using', app.indexOf('Saved before the company was a choice') > 0 && app.indexOf("setCeType(d.ceType || 'onsite')") > 0);
ck('both are chosen from a dropdown with a blank first option', app.indexOf('"— Select issuing company —"') > 0 && app.indexOf('"— Project type * —"') > 0);
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
