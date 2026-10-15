#!/usr/bin/env node
/*
 * "Check indexes" in the admin sync panel: read-only, reports for each column the app filters on whether SharePoint has it indexed
 * (past 5,000 items a filter on a column without an index is refused). Never changes the site.
 * Run: node tools/test-sp-index-status.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const db = fs.readFileSync('src/db.js', 'utf8');
const sp = fs.readFileSync('src/sp.js', 'utf8');
const panel = fs.readFileSync('src/components/LocalToSPSync.js', 'utf8');
const setup = fs.readFileSync('src/components/RegisterPage.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = db.indexOf('const SP_INDEX_CHECKS'), b = db.indexOf('/* Once a day, for an admin: say so if a list');
(async () => {
  const state = { 'CE_MP|shicCEId': true, 'CE_Resources|shicCEId': false, 'Monitoring|shicCENum': null };
  const ctx = vm.createContext({
    USE_SP: true, getSiteURL: () => 'x', spList: n => n,
    spFieldIndexed: async (l, c) => { if (l === 'Drafts') throw new Error('boom'); const k = l + '|' + c; return k in state ? state[k] : true; }
  });
  vm.runInContext(db.slice(a, b) + '\nthis.f=dbSpIndexStatus;this.checks=SP_INDEX_CHECKS;', ctx);
  const r = await ctx.f();
  const get = (k, c) => r.find(x => x.key === k && x.col === c);
  ck('a column with an index reads true', get('CE_MP', 'shicCEId').indexed === true);
  ck('a column without one reads false', get('CE_Resources', 'shicCEId').indexed === false);
  ck('a missing column reads null', get('Monitoring', 'shicCENum').indexed === null);
  ck('a list that cannot be read is reported, not hidden', get('Drafts', 'Title').indexed === undefined && /boom/.test(get('Drafts', 'Title').error));
  ck('the two big line-item lists are among the columns checked', ctx.checks.some(x => x[0] === 'CE_MP' && x[1] === 'shicCEId') && ctx.checks.some(x => x[0] === 'CE_Resources' && x[1] === 'shicCEId'));
  const idxSrc = setup.slice(setup.indexOf('const INDEXED={'), setup.indexOf('const names=Object.keys(lists)'));
  const setupCols = [...idxSrc.matchAll(/\[spList\('(\w+)'\)\]:\[([^\]]*)\]/g)];
  ck('it checks every column Repair lists & columns indexes', setupCols.length >= 7 && setupCols.every(m => m[2].split(',').every(c => ctx.checks.some(x => x[0] === m[1] && x[1] === c.trim().replace(/'/g, '')))));
  ck('the check only reads: a GET of the field, no write verbs', /async function spFieldIndexed[\s\S]*?\n\}/.exec(sp)[0].indexOf("'get'") > 0 && !/spFieldIndexed[\s\S]{0,900}(POST|MERGE|PATCH)/.test(/async function spFieldIndexed[\s\S]*?\n\}/.exec(sp)[0]));
  ck('the panel has the button and says what to do about a missing index', panel.includes('Check indexes') && panel.includes('NOT indexed'));
  console.log(bad ? bad + ' FAILURE(S)' : 'Index status OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
