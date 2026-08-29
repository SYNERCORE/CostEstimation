#!/usr/bin/env node
/*
 * Opening a CE must still work when the line-item list is past the threshold.
 *
 * Above 5,000 items SharePoint refuses a $filter on a non-indexed column, but
 * an UNFILTERED paged read is always allowed. _spGetByCE walks the list once,
 * groups by shicCEId and keeps that for the session.
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
async function _spGetTolerant(list,filter,sel){
  calls.push({list,filter,sel});
  if(filter) throw err;
  return [
    {Id:1,shicCEId:7,shicDesc:'A'},{Id:2,shicCEId:7,shicDesc:'B'},
    {Id:3,shicCEId:9,shicDesc:'C'}
  ];
}
const src=db.match(/const _spBigListCache[\s\S]*?\n\}\n/)[0];
const g=new Function('_spGetTolerant','console','setTimeout','window',src+'; return {_spGetByCE,_spInvalidateBigList,_spBigListCache};')
  (_spGetTolerant,console,f=>f(),{_shicToast:()=>{}});
(async()=>{
  let bad=0; const ck=(n,c,x)=>{ if(c)console.log('  PASS  '+n); else {console.log('  FAIL  '+n+(x?'  -> '+x:''));bad++;} };
  const a=await g._spGetByCE('L',7,'Id,shicDesc');
  ck('rows for the CE come back', a.length===2 && a[0].shicDesc==='A');
  ck('it tried the filter first', calls[0].filter==='shicCEId eq 7');
  ck('then read the list unfiltered', calls[1].filter===null);
  ck('adding shicCEId so it has something to group on', /shicCEId/.test(calls[1].sel));
  calls=[];
  const b=await g._spGetByCE('L',9,'Id,shicDesc');
  ck('a second CE is served from the snapshot, no new request', calls.length===0 && b.length===1 && b[0].shicDesc==='C');
  const c=await g._spGetByCE('L',99,'Id,shicDesc');
  ck('a CE with no rows returns empty, not undefined', Array.isArray(c) && c.length===0);
  g._spInvalidateBigList();
  calls=[];
  await g._spGetByCE('L',7,'Id,shicDesc');
  ck('invalidating forces a re-read after a write', calls.length===2,
     'a stale snapshot would miss rows a save had just inserted');
  console.log(bad?'\n'+bad+' FAILURE(S)':'\nthreshold fallback OK');
  process.exit(bad?1:0);
})();
