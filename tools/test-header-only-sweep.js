#!/usr/bin/env node
/*
 * Find every CE whose line items never reached SharePoint.
 *
 * dbSaveHistory POSTs the CE header before its rows, so anything failing in
 * between leaves a CE with a stored total and nothing under it. It reads
 * normally in Monitoring and opens empty, and there is no way to spot one
 * without opening it -- so a whole import can land this way unnoticed, which
 * is exactly what happened when the line-item lists passed the view threshold.
 *
 * What has to hold:
 *   - a CE is flagged only if NEITHER list has a row for it
 *   - a zero-total CE is never flagged: a tracking stub imported from the
 *     monitoring spreadsheet has no rows by design
 *   - the whole site costs a handful of requests, not two per CE
 *   - every read is unfiltered, so the check itself works above the threshold
 *     that causes the problem it is looking for
 *
 * Run: node tools/test-header-only-sweep.js
 */
const fs=require('fs');
const db=fs.readFileSync('src/db.js','utf8');
let calls=[];
const LISTS={
  'SHICCE_CE_MP':[{Id:1,shicCEId:11},{Id:2,shicCEId:11}],
  'SHICCE_CE_Resources':[{Id:3,shicCEId:12}],
  'SHICCE_CEs':[
    {Id:11,Title:'CE-GOOD-MP',shicTotal:1000,shicSavedBy:'a',shicSavedAt:'2026-01-01T00:00:00Z'},
    {Id:12,Title:'CE-GOOD-RES',shicTotal:2000,shicSavedBy:'a',shicSavedAt:'2026-01-01T00:00:00Z'},
    {Id:13,Title:'CE-BROKEN',shicTotal:5227438,shicSavedBy:'Aestillore',shicSavedAt:'2026-08-27T00:00:00Z'},
    {Id:14,Title:'CE-BIGGER',shicTotal:8674980.37,shicSavedBy:'Aestillore',shicSavedAt:'2026-08-27T00:00:00Z'},
    {Id:15,Title:'CE-STUB',shicTotal:0,shicSavedBy:'x',shicSavedAt:''}
  ]
};
async function spGet(list,filter,sel){ calls.push({list,filter,sel}); return LISTS[list]||[]; }
const src=db.match(/async function dbFindHeaderOnlyCEs[\s\S]*?\n\}\n/)[0];
const fn=new Function('spGet','spList','USE_SP','getSiteURL',src+'; return dbFindHeaderOnlyCEs;')
  (spGet, n=>'SHICCE_'+n, true, ()=>'x');
(async()=>{
  let bad=0; const ck=(n,c,x)=>{ if(c)console.log('  PASS  '+n); else {console.log('  FAIL  '+n+(x?'  -> '+x:''));bad++;} };
  const steps=[];
  const rows=await fn(p=>steps.push(p.msg));
  ck('finds only the CEs with no rows anywhere', rows.map(r=>r.ceNum).join(',')==='CE-BIGGER,CE-BROKEN',
    'got '+rows.map(r=>r.ceNum).join(','));
  ck('a CE with manpower rows is not flagged', !rows.find(r=>r.ceNum==='CE-GOOD-MP'));
  ck('nor one with only resource rows', !rows.find(r=>r.ceNum==='CE-GOOD-RES'));
  ck('a zero-total tracking stub is not flagged', !rows.find(r=>r.ceNum==='CE-STUB'),
    'an imported monitoring stub has no rows by design');
  ck('worst first, so the biggest exposure is on screen', rows[0].total>rows[1].total);
  ck('it carries who saved it and when', rows[0].savedBy==='Aestillore' && !!rows[0].savedAt);
  ck('three requests for the whole site, not two per CE', calls.length===3,
    'a per-CE check would be ~1,800 requests');
  ck('all unfiltered, so it works above the view threshold', calls.every(c=>c.filter===null));
  ck('and reports progress while it runs', steps.length===3);
  console.log(bad?'\n'+bad+' FAILURE(S)':'\nheader-only sweep OK');
  process.exit(bad?1:0);
})();
