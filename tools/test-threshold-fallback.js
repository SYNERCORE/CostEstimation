#!/usr/bin/env node
/*
 * Opening a CE must still work when the line-item list is past the threshold.
 *
 * Above 5,000 items SharePoint refuses a $filter on a non-indexed column, but
 * an UNFILTERED paged read is always allowed. _spGetByCE walks the list once
 * -- Id and shicCEId ONLY, because the first version pulled every column of
 * tens of thousands of line items and that read was itself refused -- groups
 * by shicCEId, keeps that for the session, and fetches a CE's columns by Id
 * (always indexed), 40 at a time.
 *
 * The index is the real fix (check-sp-indexes.js); this is what keeps a site
 * working until it is applied, or on a tenant that will not index a list
 * already past the threshold.
 *
 * What has to hold:
 *   - the filter is tried FIRST, so a healthy site pays nothing for this
 *   - the fallback read adds shicCEId to the $select, since the filter used to
 *     be the only thing supplying it and there is otherwise nothing to group on
 *   - once a list is known to be over, the doomed filter is not retried -- that
 *     would be a failing round-trip for every CE opened
 *   - a write drops the snapshot. A stale one would make a save miss the rows
 *     it had just inserted and leave the old ones behind as duplicates.
 *
 * Run: node tools/test-threshold-fallback.js
 */
const fs=require('fs');
const db=fs.readFileSync('src/db.js','utf8');
let calls=[];
const err=new Error('SP get L: this list has passed the SharePoint 5,000-item view threshold and shicCEId is not indexed');
const ALL=[{Id:1,shicCEId:7,shicDesc:'A'},{Id:2,shicCEId:7,shicDesc:'B'},{Id:3,shicCEId:9,shicDesc:'C'}];
async function _spGetTolerant(list,filter,sel){
  calls.push({list,filter,sel});
  if(/shicCEId eq/.test(filter||'')) throw err;
  const m=[...String(filter||'').matchAll(/Id eq (\d+)/g)].map(x=>+x[1]);
  return ALL.filter(r=>m.indexOf(r.Id)>=0);
}
async function spGet(list,filter,sel){
  calls.push({list,filter:filter||null,sel,walk:true});
  return ALL.map(r=>({Id:r.Id,shicCEId:r.shicCEId}));
}
const _a=db.indexOf('const _spBigListCache'),_h=db.indexOf('async function _spRowsFromIndex');
const src=db.slice(_a,db.indexOf(String.fromCharCode(10)+'}'+String.fromCharCode(10),_h)+3);
const g=new Function('_spGetTolerant','spGet','console','setTimeout','window',src+'; return {_spGetByCE,_spInvalidateBigList,_spBigListCache};')
  (_spGetTolerant,spGet,console,f=>f(),{_shicToast:()=>{}});
(async()=>{
  let bad=0; const ck=(n,c,x)=>{ if(c)console.log('  PASS  '+n); else {console.log('  FAIL  '+n+(x?'  -> '+x:''));bad++;} };
  const a=await g._spGetByCE('L',7,'Id,shicDesc');
  ck('rows for the CE come back', a.length===2 && a[0].shicDesc==='A');
  ck('it tried the filter first', calls[0].filter==='shicCEId eq 7');
  ck('then read the list unfiltered', calls[1].filter===null && calls[1].walk);
  ck('asking for nothing but Id and shicCEId', calls[1].sel==='Id,shicCEId', calls[1].sel);
  ck('and fetched the CE rows by Id', /Id eq 1 or Id eq 2/.test(calls[2].filter||''), JSON.stringify(calls[2]));
  calls=[];
  const b=await g._spGetByCE('L',9,'Id,shicDesc');
  ck('a second CE needs no new walk, only its own rows by Id', calls.filter(x=>x.walk).length===0 && b.length===1 && b[0].shicDesc==='C');
  const c=await g._spGetByCE('L',99,'Id,shicDesc');
  ck('a CE with no rows returns empty, not undefined', Array.isArray(c) && c.length===0);
  g._spInvalidateBigList();
  calls=[];
  await g._spGetByCE('L',7,'Id,shicDesc');
  ck('invalidating forces a re-walk after a write', calls.filter(x=>x.walk).length===1,
     'a stale snapshot would miss rows a save had just inserted');
  console.log(bad?'\n'+bad+' FAILURE(S)':'\nthreshold fallback OK');
  process.exit(bad?1:0);
})();
