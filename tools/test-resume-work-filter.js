/* Resume Work has a search box and an estimator filter. Run: node tools/test-resume-work-filter.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.js'), 'utf8').replace(/\r\n/g, '\n');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('it parses', (() => { try { new Function(app); return true; } catch (e) { console.log(e.message); return false; } })());
ck('a search box and an estimator select sit above the list', app.indexOf("'aria-label': 'Search Resume Work'") > 0 && app.indexOf("'aria-label': 'Filter by estimator'") > 0);
ck('the list is the filtered one, with a Clear and an X of N count', app.indexOf("draftsShown.map(d => {") > 0 && app.indexOf("draftsShown.length + ' of ' + sharedDrafts.length") > 0 && app.indexOf("setDrftQ(''); setDrftBy('');") > 0);
ck('a filter that matches nothing says so', app.indexOf("'No draft matches'") > 0);
const a = app.indexOf('const _drftWords = '), e = app.indexOf('/* Who has drafts, with how many');
const owners = app.indexOf('const draftOwners = '), oe = app.indexOf('})();', owners) + 5;
const run = (q, by, drafts) => new Function('drftQ', 'drftBy', 'sharedDrafts', app.slice(a, e) + app.slice(owners, oe) + '; return {ids: draftsShown.map(d => d.draftId), owners: draftOwners.map(o => o.name + o.n)};')(q, by, drafts);
const D = [{ draftId: 1, savedBy: 'ana', savedByName: 'Ana Cruz', info: { ceNum: 'SY3-CE-1', client: 'HEDCOR', description: 'Pump seal' }, ceType: 'onsite' },
  { draftId: 2, savedBy: 'ben', savedByName: 'Ben Reyes', info: { ceNum: 'SY3-CE-2', client: 'UPPC', description: 'Boiler tube' }, ceType: 'supply' },
  { draftId: 3, savedBy: 'ana', savedByName: 'Ana Cruz', info: { ceNum: 'SHIC-CE-3', client: 'HEDCOR', description: 'Valve' }, ceType: 'onsite' }];
ck('empty shows all', run('', '', D).ids.length === 3);
ck('words in any order, any case, across client, job and who saved it', run('hedcor', '', D).ids.join() === '1,3' && run('boiler ben', '', D).ids.join() === '2');
ck('the estimator filter narrows to one person', run('', 'ana', D).ids.join() === '1,3');
ck('both together', run('valve', 'ana', D).ids.join() === '3' && run('valve', 'ben', D).ids.length === 0);
ck('the estimator list counts each person\'s drafts', run('', '', D).owners.join() === 'Ana Cruz2,Ben Reyes1');
process.exit(bad ? 1 : 0);
