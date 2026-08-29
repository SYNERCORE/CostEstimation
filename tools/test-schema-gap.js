#!/usr/bin/env node
/*
 * A SharePoint site missing a column must not swallow a whole CE.
 *
 * SharePoint answers a $select naming a column the site has not got with a
 * 500, not a 400. dbLoadCE caught that, fell through to the local archive --
 * which holds nothing for a CE saved on another machine -- and the estimate
 * opened blank under its real CE number at a grand total of P0.00, with only a
 * console warning to say why. Saving from there would have written that
 * blankness back, deleting every line item the CE had.
 *
 * Every column added after the first release is optional for READING: a CE
 * written before it existed has nothing in it. So _spGetTolerant drops them
 * and asks again, and the CE opens minus whatever they carried.
 *
 * What must stay true:
 *   - a missing optional column costs the shares/taskIds, not the CE
 *   - the retry keeps every column the site DOES have
 *   - a failure with nothing optional to drop propagates rather than being
 *     masked, so a genuine outage is not reported as a schema gap
 *
 * Run: node tools/test-schema-gap.js
 */
const fs=require('fs');
const db=fs.readFileSync('src/db.js','utf8');
const spGetCalls=[];
let mode='missing';           // pretend the site has no shicShares
async function spGet(list,filter,sel){
  spGetCalls.push({list,sel});
  if(mode==='missing' && /shicShares/.test(sel)) { const e=new Error('SP get '+list+':500'); throw e; }
  return [{Id:1,shicTab:'mats',shicDesc:'PLYWOOD',shicQty:30,shicCost:1750}];
}
global.window={_shicToast:(m,bad)=>console.log('  TOAST:',m.slice(0,90)+'…')};
const src=db.match(/const _SP_OPTIONAL_COLS[\s\S]*?\n\}\n/)[0];
const fn=new Function('spGet','console','setTimeout','window', src+'; return _spGetTolerant;')(spGet,console,(f)=>f(),global.window);

(async()=>{
  let bad=0;
  const ck=(n,c)=>{ if(c) console.log('  PASS  '+n); else {console.log('  FAIL  '+n); bad++;} };
  console.log('a site missing shicShares:');
  const rows=await fn('SHICCE_CE_Resources','shicCEId eq 7','Id,shicTab,shicDesc,shicQty,shicUOM,shicCost,shicDays,shicTaskId,shicShares');
  ck('the CE rows still come back', rows.length===1 && rows[0].shicDesc==='PLYWOOD');
  ck('it retried without the newer columns', spGetCalls.length===2 && !/shicShares|shicTaskId/.test(spGetCalls[1].sel));
  ck('and kept every column the site does have', /Id,shicTab,shicDesc,shicQty,shicUOM,shicCost,shicDays/.test(spGetCalls[1].sel));

  console.log('\na failure that is not a missing column:');
  spGetCalls.length=0; mode='down';
  const hardFail=async()=>{ try{ await fn('SHICCE_CEs','Id eq 7','Id,Title'); return 'no throw'; }catch(e){ return 'threw'; } };
  global.spGetHard=1;
  const spGetDown=async()=>{ throw new Error('SP get: 503'); };
  const fn2=new Function('spGet','console','setTimeout','window', src+'; return _spGetTolerant;')(spGetDown,console,(f)=>f(),global.window);
  let threw=false; try{ await fn2('SHICCE_CEs','Id eq 7','Id,Title'); }catch(_){ threw=true; }
  ck('is not masked — nothing optional to drop, so it propagates', threw);

  console.log(bad?'\n'+bad+' FAILURE(S)':'\ntolerant read OK');
  process.exit(bad?1:0);
})();
