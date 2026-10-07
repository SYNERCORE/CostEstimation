/* The four required Project Info items are asked for in a dialog in front of Project Info,
   which stays until Continue is pressed.
   Run: node tools/test-project-info-dialog.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = require('./lib/appsrc').plus(R('src/App.js')), comp = R('src/components/ProjectInfoGate.js');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
const NL = String.fromCharCode(10);

/* Render the component with a React that just builds a tree, then look inside it. */
const ce = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat(9) });
const render = p => new Function('React', 'MT', 'ERR', 'OK', 'INP', 'BDR', 'TX', 'btn', comp + NL + 'return ProjectInfoGate;')(
  { createElement: ce }, 'm', 'e', 'o', {}, 'b', 't', () => ({}))(p);
const all = (n, out = []) => { if (n && typeof n === 'object') { out.push(n); (n.kids || []).forEach(k => all(k, out)); } return out; };
const base = { missing: ['Issuing Company', 'Client Name', 'Project Type', 'Discipline', 'Project Description'], companies: [{ id: 1, name: 'SYNERCORE' }], companyId: '', client: '', ceType: '', ceTypes: [{ k: 'onsite', label: 'Onsite' }], projType: '', description: '',
  onCompany() {}, onClient() {}, onType() {}, onDiscipline() {}, onDescription() {}, onCancel() {}, onContinue() {} };
const buttons = t => all(t).filter(n => n.type === 'button');
let t = render(base);
const cont = buttons(t).find(b => b.kids.join('').indexOf('Continue') >= 0);
ck('Continue is disabled while anything is missing', cont && cont.props.disabled === true);
ck('it names what is still needed', all(t).some(n => n.kids && n.kids.join('').indexOf('Still needed: Issuing Company, Client Name, Project Type, Discipline, Project Description.') >= 0));
ck('it asks for all five', all(t).filter(n => n.type === 'select').length === 3 && all(t).filter(n => n.type === 'input').length === 1 && all(t).filter(n => n.type === 'textarea').length === 1);
t = render({ ...base, missing: [], companyId: 1, client: 'HEDCOR', ceType: 'onsite', projType: 'Civil', description: 'x' });
ck('Continue opens once all five are in', buttons(t).find(b => b.kids.join('').indexOf('Continue') >= 0).props.disabled === false);
ck('and the last field filled does not close it by itself (only Continue does)', app.indexOf('onContinue: continueGate') > 0 && app.indexOf('const continueGate = () => {' + NL + '    setPiGate(false);') > 0);

console.log(NL + 'in the app:');
ck('it is opened when Project Info is entered incomplete', app.indexOf("if (!isRequestor && tab === \"info\" && infoMissing.length) setPiGate(true);") > 0);
ck('and when a new CE is started', app.indexOf("setCeType('');" + NL + "    if (!isRequestor) setPiGate(true);") > 0);
ck('Cancel goes back to My Work', app.indexOf("onCancel: () => { setPiGate(false); setTab('mywork'); }") > 0);
ck('it uses the same company change as Project Info, so the number\'s prefix follows', app.indexOf('onChange: e => pickCompany(e.target.value)') > 0 && app.indexOf('onCompany: pickCompany') > 0);
ck('a requestor never sees it', app.indexOf('piGate && tab === "info" && !isRequestor') > 0);
process.exit(bad ? 1 : 0);
