#!/usr/bin/env node
/* Shop + Site CEs: each main scope item is Shop or Site. The Incentive is paid
   only for site work; tool power is charged only for shop work.
   Run: node tools/test-shop-site.js */
'use strict';
const fs = require('fs'), vm = require('vm');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

const ctx = { console, window: {}, localStorage: { getItem: () => null, setItem() {} }, document: undefined, navigator: {} };
vm.createContext(ctx);
vm.runInContext(['src/helpers.js', 'src/config.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n;\n') + '\n;this.CE_CFG=CE_CFG;this.MISC_DEF=MISC_DEF;', ctx);
const run = code => vm.runInContext(code, ctx);

console.log('the type:');
ck('Shop + Site is a CE type', run("CE_CFG.shopsite && CE_CFG.shopsite.incentive === 'site' && CE_CFG.shopsite.power === 'shop'"));
ck('with its own Miscellaneous categories', run('Array.isArray(MISC_DEF.shopsite) && MISC_DEF.shopsite.length > 0'));
ck('named "Shop + Site" on screen and paper', run("ceTypeLabel('shopsite')") === 'Shop + Site' && run("ceTypeLabel('shopworks')") === 'ShopWorks');
ck('other types do not split', !run("ceSplitOn('onsite')") && !run("ceSplitOn('shopworks')") && run("ceSplitOn('shopsite')"));

console.log('\nscope tags:');
run(`var W = ceWorkMap([{id:'a',type:'main'},{id:'a1',type:'sub'},{id:'b',type:'main',work:'shop'},{id:'b1',type:'sub'}]);`);
ck('an untagged main item is site work, and its subs', run("W.a === 'site' && W.a1 === 'site'"));
ck('a Shop main item takes its subs with it', run("W.b === 'shop' && W.b1 === 'shop'"));
ck('a row on shop scope is 0% site', run("ceSiteFrac({taskId:'b1'}, W)") === 0);
ck('a row filed nowhere counts as site', run("ceSiteFrac({}, W)") === 1);
ck('a shared row splits by weight', Math.abs(run("ceSiteFrac({shares:[{taskId:'a',weight:3},{taskId:'b',weight:1}]}, W)") - 0.75) < 1e-9);

console.log('\nthe money:');
const ce = `({ceType:'shopsite', sowItems:[{id:'a',type:'main'},{id:'b',type:'main',work:'shop'}],
  mp:[{role:'W',pax:1,days:10,rate:0,perDiem:100,taskId:'a'},{role:'W',pax:1,days:10,rate:0,perDiem:100,taskId:'b'}],
  tools:[], mats:[], ppe:[], misc:{}})`;
const onsiteMp = run(`computeCEParts(Object.assign(${ce}, {ceType:'onsite'})).mpT`);
const splitMp = run(`computeCEParts(${ce}).mpT`);
ck('Incentive is paid on the site row only (P1,000 less than onsite)', Math.abs((onsiteMp - splitMp) - 1000) < 0.01);
ck('toolRowTotal charges only the given share of power', run("toolRowTotal({qty:1,days:1,cost:0,kw:1,hrs:8}, 10, undefined, 0) === toolRowTotal({qty:1,days:1,cost:0,kw:1,hrs:8}, 0)"));

console.log('\nthe editor:');
ck('the Benefits table counts site shares', app.includes("(cfg.incentive === 'site' ? siteFrac(r) : 1)"));
ck('tool power follows the shop share everywhere', !/toolRowTotal\(r, kwhRate\)[^,]/.test(app) && app.includes('toolRowTotal(r, kwhRate, undefined, pwrFrac(r))'));
ck('main scope items get a Shop / Site switch', app.includes("it.type === 'main' && ceSplitOn(ceType)") && app.includes('"🏭 Shop" : "🏗 Site"'));
ck('the print says SHOP + SITE, not SHOPSITE', app.includes('esc(ceTypeLabel(ceType).toUpperCase())'));
ck('the C.1-C.4 subtotal shows a dash, not \\u2013', !app.includes('"C.1\\\\u2013C.4'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nshop + site OK'); process.exit(bad ? 1 : 0);
