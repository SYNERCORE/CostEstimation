/* ── SP Draft persistence ── */
async function dbSaveDraft(d){
  if(USE_SP||getSiteURL()){
    try{
      const existing=await spGet(spList('Drafts'),`Title eq '${(d.draftId||'').replace(/'/g,"''")}' `,'Id');
      const payload={Title:d.draftId,shicSavedBy:d.savedByName||'',shicData:JSON.stringify(d)};
      if(existing.length)await spPatch(spList('Drafts'),existing[0].Id,payload);
      else await spPost(spList('Drafts'),payload);
      return true;
    }catch(e){console.warn('dbSaveDraft:',e.message);}
  }
  try{localStorage.setItem('shic_draft_'+d.draftId,JSON.stringify(d));}catch{}
  return false;
}
async function dbGetDrafts(){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Drafts'),'','Id,Title,shicSavedBy,shicData,Modified');
      return r.map(x=>{try{return JSON.parse(x.shicData||'{}');}catch{return null;}}).filter(Boolean)
               .sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt));
    }catch(e){console.warn('dbGetDrafts:',e.message);}
  }
  return [];
}
async function dbDeleteDraft(draftId){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Drafts'),`Title eq '${(draftId||'').replace(/'/g,"''")}'`,'Id');
      if(r.length)await spDelete(spList('Drafts'),r[0].Id);
    }catch(e){console.warn('dbDeleteDraft:',e.message);}
  }
  try{localStorage.removeItem('shic_draft_'+draftId);}catch{}
}

/* ── SP Monitoring persistence — one item per CE ── */
/* Cache of ceId → SP item Id to avoid repeated GET lookups */
const _monSpIdCache = {};

async function dbSaveMonEntry(ceId, ceNum, monFields){
  if(!(USE_SP||getSiteURL()))return false;
  try{
    const numId=Number(ceId);
    let spId=_monSpIdCache[ceId];
    if(!spId){
      const r=await spGet(spList('Monitoring'),`shicCEId eq ${numId}`,'Id');
      if(r.length){spId=r[0].Id;_monSpIdCache[ceId]=spId;}
    }
    const payload={shicMonData:JSON.stringify(monFields)};
    if(spId){
      try{
        await spPatch(spList('Monitoring'),spId,payload);
      }catch(patchErr){
        /* 404 = item was deleted in SP; clear cache and create fresh */
        if(patchErr.message&&patchErr.message.includes('404')){
          delete _monSpIdCache[ceId];
          const created=await spPost(spList('Monitoring'),{Title:ceNum||String(ceId),shicCEId:numId,...payload});
          if(created&&created.Id)_monSpIdCache[ceId]=created.Id;
        }else throw patchErr;
      }
    }else{
      const created=await spPost(spList('Monitoring'),{Title:ceNum||String(ceId),shicCEId:numId,...payload});
      if(created&&created.Id)_monSpIdCache[ceId]=created.Id;
    }
    return true;
  }catch(e){console.warn('dbSaveMonEntry:',e.message);return false;}
}

/* Batch-save all entries (import / migration). histItems needed for ceNum lookup. */
async function dbSaveMonAll(monData, histItems){
  if(!(USE_SP||getSiteURL()))return;
  const ceNumMap={};
  for(const h of(histItems||[])){ceNumMap[h.id]=h.info?.ceNum||h.ceNum||String(h.id);}
  const entries=Object.entries(monData);
  const BATCH=3;
  for(let i=0;i<entries.length;i+=BATCH){
    const chunk=entries.slice(i,i+BATCH);
    await Promise.all(chunk.map(([ceId,fields])=>dbSaveMonEntry(ceId,ceNumMap[ceId]||String(ceId),fields).catch(()=>{})));
    if(i+BATCH<entries.length)await new Promise(r=>setTimeout(r,500));
  }
}


async function dbGetMon(){
  if(!(USE_SP||getSiteURL()))return null;
  try{
    /* Fetch all per-CE items */
    const r=await spGet(spList('Monitoring'),"Title ne 'config'",'Id,Title,shicCEId,shicMonData,Modified');
    if(r.length){
      const data={};let latest=null;
      for(const item of r){
        const cid=String(item.shicCEId);
        if(cid&&cid!=='null'&&cid!=='0'&&item.shicMonData){
          try{data[cid]=JSON.parse(item.shicMonData);_monSpIdCache[cid]=item.Id;}catch{}
        }
        if(!latest||item.Modified>latest)latest=item.Modified;
      }
      if(Object.keys(data).length)return{data,modifiedAt:latest};
      /* SP reachable, items exist but none had valid data */
      return{data:{},modifiedAt:latest,empty:true};
    }
    /* No per-CE items at all — check legacy blob */
    const legacy=await spGet(spList('Monitoring'),"Title eq 'config'",'Id,shicMonData,Modified');
    if(legacy.length&&legacy[0].shicMonData){
      try{return{data:JSON.parse(legacy[0].shicMonData),modifiedAt:legacy[0].Modified,legacy:true};}catch{}
    }
    /* SP reachable, list is completely empty */
    return{data:{},modifiedAt:null,empty:true};
  }catch(e){console.warn('dbGetMon:',e.message);}
  return null; /* null = fetch failed, keep local cache */
}

/* ── Sync status helpers ── */
let _syncStatus={sp:'unknown',lastSyncAt:null,dirty:false,stale:false,masterlist:'unknown',monitoring:'unknown',drafts:'unknown'};
function getSyncStatus(){return _syncStatus;}
function setSyncStatus(patch){_syncStatus={..._syncStatus,...patch};window.dispatchEvent(new Event('shic:sync:updated'));}

/* &#9472;&#9472; Offline queue &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; */
let _isOnline=navigator.onLine,_spQueue=[],_qRunning=false;
async function _flushQ(){if(_qRunning||!_isOnline||!_spQueue.length)return;_qRunning=true;while(_spQueue.length&&_isOnline){const{fn,res,rej}=_spQueue.shift();try{res(await fn());}catch(e){rej(e);}}_qRunning=false;}
window.addEventListener('online',()=>{_isOnline=true;_flushQ();window.dispatchEvent(new Event('shic-online'));});
window.addEventListener('offline',()=>{_isOnline=false;window.dispatchEvent(new Event('shic-offline'));});

/* &#9472;&#9472; Auto-lock &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; */
let _lockTimer=null;
function resetLockTimer(fn){clearTimeout(_lockTimer);if(fn)_lockTimer=setTimeout(fn,30*60*1000);}
['click','keydown','touchstart'].forEach(ev=>window.addEventListener(ev,()=>resetLockTimer(window._shicLock),{passive:true}));

/* &#9472;&#9472; Storage obfuscation &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; */
/* Legacy decoder only — reads old XOR+btoa encoded values for migration */
const _lsK=()=>{try{const k=localStorage.getItem('shic:_sk');return k||'shic2026';}catch{return'shic2026';}};
const _d=(s)=>{try{const k=_lsK(),b=atob(s);return Array.from(b,(c,i)=>String.fromCharCode(c.charCodeAt(0)^k.charCodeAt(i%k.length))).join('');}catch{return s;}};

/* &#9472;&#9472; localStorage helper &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; */
const LS = {
  get: k => {
    try {
      const v = localStorage.getItem('shic:' + k);
      if (!v) return null;
      // Plain JSON first (new format), then legacy XOR+btoa fallback
      try { return JSON.parse(v); } catch { try { return JSON.parse(_d(v)); } catch { return null; } }
    } catch { return null; }
  },
  set: (k, v) => {
    try {
      localStorage.setItem('shic:' + k, JSON.stringify(v));
      // Quota guard — one toast per session
      if (!window._lsWarnShown) {
        try {
          let total = 0;
          for (let i = 0; i < localStorage.length; i++) total += (localStorage.getItem(localStorage.key(i))||'').length * 2;
          if (total > 4 * 1024 * 1024) {
            window._lsWarnShown = true;
            setTimeout(() => (window._shicToast||console.warn)('Storage almost full (' + Math.round(total/1024) + ' KB). Sync to SharePoint or export a backup.', true), 500);
          }
        } catch {}
      }
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        if (!window._lsFullShown) { window._lsFullShown = true; setTimeout(() => (window._shicToast||console.error)('Storage full! Export a backup or connect SharePoint to free space.', true), 100); }
      }
    }
  }
};

/* One-time migration: rewrite legacy XOR+btoa keys as plain JSON to reclaim ~33% space */
(function migrateLSEncoding() {
  try {
    if (localStorage.getItem('shic:_migv2')) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('shic:')) keys.push(k); }
    for (const fullKey of keys) {
      const raw = localStorage.getItem(fullKey);
      if (!raw) continue;
      try { JSON.parse(raw); } catch {
        try { const dec = _d(raw); JSON.parse(dec); localStorage.setItem(fullKey, dec); } catch {}
      }
    }
    localStorage.setItem('shic:_migv2', '1');
  } catch {}
})();
async function dbGetUsers(){if(USE_SP||getSiteURL()){try{const r=await spGet(spList('Users'),'','Id,Title,shicName,shicHash,shicRole,shicStatus,shicEmail,Created');return r.filter(u=>u&&u.Title).map(u=>({id:u.Id,username:u.Title,name:u.shicName||'',hash:u.shicHash||'',role:u.shicRole||'user',status:u.shicStatus||'pending',email:u.shicEmail||'',createdAt:u.Created}));}catch(e){console.warn('dbGetUsers:',e.message);}}return(LS.get('users')||[]).filter(u=>u&&u.username);}
async function dbCreateUser(u){if(USE_SP||getSiteURL()){try{const r=await spPost(spList('Users'),{Title:u.username,shicName:u.name,shicHash:u.hash,shicRole:u.role,shicStatus:u.status,shicEmail:u.email||''});return{...u,id:r.Id};}catch(e){console.warn('dbCreateUser:',e.message);}}const all=LS.get('users')||[];const nu={...u,id:Date.now()};LS.set('users',[...all,nu]);return nu;}
async function dbUpdateUser(id,data){if(USE_SP||getSiteURL()){try{const sp={};if(data.status!==undefined)sp.shicStatus=data.status;if(data.role!==undefined)sp.shicRole=data.role;if(data.hash!==undefined)sp.shicHash=data.hash;if(data.name!==undefined)sp.shicName=data.name;await spPatch(spList('Users'),id,sp);return;}catch(e){console.warn('dbUpdateUser:',e.message);}}LS.set('users',(LS.get('users')||[]).map(u=>u.id===id?{...u,...data}:u));}
async function dbGetHistory(username,isAdmin){if(USE_SP||getSiteURL()){try{const f=isAdmin?"":`shicSavedBy eq '${username}'`;const r=await spGet(spList('CEs'),f,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt');return r.map(h=>({id:h.Id,ceNum:h.Title,ceType:h.shicType,client:h.shicClient||'',grand:h.shicTotal||0,savedBy:h.shicSavedBy||'',savedAt:h.shicSavedAt||h.Created,info:{ceNum:h.Title,client:h.shicClient||'',description:h.shicDesc||''}}));}catch(e){console.warn('dbGetHistory:',e.message);}}const all=LS.get('history')||[];return isAdmin?all:all.filter(h=>h.savedBy===username);}
async function dbLoadCE(id){if(!(USE_SP||getSiteURL()))return null;try{const[hR,mR,rR]=await Promise.all([spGet(spList('CEs'),`Id eq ${id}`,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt,shicScope,shicNotes,shicApprovers,shicMob,shicDemob,shicMisc'),spGet(spList('CE_MP'),`shicCEId eq ${id}`,'Id,shicRole,shicRate,shicShift,shicDays,shicQty'),spGet(spList('CE_Resources'),`shicCEId eq ${id}`,'Id,shicTab,shicDesc,shicQty,shicUOM,shicCost,shicDays')]);if(!hR.length)return null;const h=hR[0];return{id:h.Id,ceType:h.shicType||'onsite',grand:h.shicTotal||0,savedBy:h.shicSavedBy||'',savedAt:h.shicSavedAt||'',info:{ceNum:h.Title,client:h.shicClient||'',description:h.shicDesc||''},scope:h.shicScope||'',mp:mR.map(r=>({id:'sp'+r.Id,role:r.shicRole||'',rate:r.shicRate||0,shift:r.shicShift||'straight',days:r.shicDays||1,qty:r.shicQty||1})),tools:rR.filter(r=>r.shicTab==='tools').map(r=>({id:'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0,days:r.shicDays||1})),mats:rR.filter(r=>r.shicTab==='mats').map(r=>({id:'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0})),ppe:rR.filter(r=>r.shicTab==='ppe').map(r=>({id:'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0})),misc:h.shicMisc?JSON.parse(h.shicMisc):{},notes:h.shicNotes?JSON.parse(h.shicNotes):[],approvers:h.shicApprovers?JSON.parse(h.shicApprovers):[],mobVehicles:h.shicMob?JSON.parse(h.shicMob):[],demobVehicles:h.shicDemob?JSON.parse(h.shicDemob):[]};}catch(e){console.warn('dbLoadCE:',e.message);return null;}}
async function dbSaveHistory(e){if(USE_SP||getSiteURL()){try{const existing=await spGet(spList('CEs'),`Title eq '${(e.info.ceNum||'').replace(/'/g,"''")}'`,'Id');const hdr={Title:e.info.ceNum,shicType:e.ceType,shicClient:e.info.client||'',shicDesc:e.info.description||'',shicTotal:Math.round(e.grand||0),shicSavedBy:e.savedBy||'',shicSavedAt:new Date().toISOString(),shicScope:e.scope||'',shicNotes:JSON.stringify(e.notes||[]),shicApprovers:JSON.stringify(e.approvers||[]),shicMob:JSON.stringify(e.mobVehicles||[]),shicDemob:JSON.stringify(e.demobVehicles||[]),shicMisc:JSON.stringify(e.misc||{})};let ceId;if(existing.length){ceId=existing[0].Id;await spPatch(spList('CEs'),ceId,hdr);}else{const r=await spPost(spList('CEs'),hdr);ceId=r.Id;}const[om,or]=await Promise.all([spGet(spList('CE_MP'),`shicCEId eq ${ceId}`,'Id'),spGet(spList('CE_Resources'),`shicCEId eq ${ceId}`,'Id')]);/* Insert new rows FIRST — if any insert fails the old rows are still intact */const mpRows=(e.mp||[]).filter(r=>r.role).map(r=>({shicCEId:ceId,shicRole:r.role,shicRate:r.rate||0,shicShift:r.shift||'regular_day',shicDays:r.days||1,shicPax:r.pax||1,shicOTHours:r.otHours||0,shicPerDiem:r.perDiem||0}));const resRows=[...(e.tools||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'tools',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0})),...(e.mats||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'mats',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0})),...(e.ppe||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'ppe',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0}))];const ins=[...mpRows.map(p=>spPost(spList('CE_MP'),p)),...resRows.map(p=>spPost(spList('CE_Resources'),p))];let spErr=null;for(let i=0;i<ins.length;i+=5){try{await Promise.all(ins.slice(i,i+5));}catch(batchErr){spErr=batchErr;console.error('dbSaveHistory batch insert failed:',batchErr.message);break;}}if(spErr)throw spErr;/* Only delete OLD rows after new ones safely written */const dels=[...om.map(x=>spDelete(spList('CE_MP'),x.Id)),...or.map(x=>spDelete(spList('CE_Resources'),x.Id))];for(let i=0;i<dels.length;i+=5)await Promise.all(dels.slice(i,i+5)).catch(()=>{});try{LS.set('ce_cache:'+e.info.ceNum,{...e,id:ceId,shicSavedAt:hdr.shicSavedAt});}catch(_){}return;}catch(e2){const msg=e2.message||String(e2);console.warn('dbSaveHistory SP error:',msg);setTimeout(()=>(window._shicToast||console.warn)('SharePoint save failed ('+msg.slice(0,80)+') — CE stored locally.',true),100);}}const h=LS.get('history')||[];const _eid=Date.now();const _savedAt=new Date().toISOString();LS.set('history',[{...e,id:_eid,savedAt:_savedAt},...h.filter(x=>(x.info?.ceNum||x.ceNum)!==e.info.ceNum)]);try{LS.set('ce_cache:'+e.info.ceNum,{...e,id:_eid,savedAt:_savedAt});}catch(_){}}
async function dbDeleteHistory(id){if(USE_SP||getSiteURL()){try{const[m,r]=await Promise.all([spGet(spList('CE_MP'),`shicCEId eq ${id}`,'Id'),spGet(spList('CE_Resources'),`shicCEId eq ${id}`,'Id')]);const d=[...m.map(x=>spDelete(spList('CE_MP'),x.Id)),...r.map(x=>spDelete(spList('CE_Resources'),x.Id))];for(let i=0;i<d.length;i+=5)await Promise.all(d.slice(i,i+5));await spDelete(spList('CEs'),id);return;}catch(e){console.warn('dbDeleteHistory:',e.message);}}LS.set('history',(LS.get('history')||[]).filter(h=>h.id!==id));}
async function dbGetML(){if(USE_SP||getSiteURL()){try{const r=await spGet(spList('Masterlist'),"Title eq 'config'",'Id,shicData');if(r.length&&r[0].shicData)return JSON.parse(r[0].shicData);}catch(e){console.warn('dbGetML:',e.message);}}return LS.get('masterlist');}

/* &#9472;&#9472; ML Import persistence (shared across all users via SP) &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; */
async function spSaveMLImport(project){
  /* Save one extracted project to SHICCE_ML_Imports list */
  if(!(USE_SP||getSiteURL()))return;
  try{
    const existing=await spGet(spList('ML_Imports'),`Title eq '${(project.source||'').replace(/'/g,"''")}' ` ,'Id');
    const data={
      Title:(project.source||'unknown').slice(0,255),
      shicData:JSON.stringify(project)
    };
    if(existing.length)await spPatch(spList('ML_Imports'),existing[0].Id,data);
    else await spPost(spList('ML_Imports'),data);
  }catch(e){console.warn('spSaveMLImport:',e.message);}
}
async function spSaveMLImports(projects){
  /* Batch-save all projects in groups of 5 */
  if(!(USE_SP||getSiteURL())||!projects.length)return;
  for(let i=0;i<projects.length;i+=5){
    await Promise.all(projects.slice(i,i+5).map(p=>spSaveMLImport(p).catch(()=>{})));
  }
}
async function spLoadMLImports(){
  /* Load all ML imports from SP on app startup */
  if(!(USE_SP||getSiteURL()))return[];
  try{
    const rows=await spGet(spList('ML_Imports'),'','Id,Title,shicData,Created');
    return rows.filter(r=>r.shicData).map(r=>{
      try{return JSON.parse(r.shicData);}catch{return null;}
    }).filter(Boolean);
  }catch(e){console.warn('spLoadMLImports:',e.message);return[];}
}

async function dbSaveCompanies(list){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq 'config'",'Id');
      if(r.length)await spPatch(spList('Companies'),r[0].Id,{shicData:JSON.stringify(list)});
      else await spPost(spList('Companies'),{Title:'config',shicData:JSON.stringify(list)});
      return true;
    }catch(e){console.warn('dbSaveCompanies:',e.message);}
  }
  try{localStorage.setItem('shic:companies',JSON.stringify(list));}catch{}
  return false;
}
async function dbGetCompanies(){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq 'config'",'Id,shicData');
      if(r.length&&r[0].shicData)return JSON.parse(r[0].shicData);
    }catch(e){console.warn('dbGetCompanies:',e.message);}
  }
  try{const s=localStorage.getItem('shic:companies');return s?JSON.parse(s):null;}catch{return null;}
}
async function dbSaveML(data){if(USE_SP||getSiteURL()){try{const r=await spGet(spList('Masterlist'),"Title eq 'config'",'Id');if(r.length)await spPatch(spList('Masterlist'),r[0].Id,{shicData:JSON.stringify(data)});else await spPost(spList('Masterlist'),{Title:'config',shicData:JSON.stringify(data)});return;}catch(e){console.warn('dbSaveML:',e.message);}}LS.set('masterlist',data);}
async function dbSaveSowLib(lib){
  if(USE_SP||getSiteURL()){
    try{
      /* Fetch current SP state first */
      const existing=await spGet(spList('SowLib'),'','Id,shicData');
      /* Build SP map: svc.id (string) → {spRowId, svc} */
      const spMap={};
      existing.forEach(r=>{
        try{const d=JSON.parse(r.shicData||'{}');if(d&&d.id!=null)spMap[String(d.id)]={spId:r.Id,svc:d};}catch{}
      });
      /* Build local map: svc.id (string) → svc */
      const localMap={};
      lib.forEach(s=>localMap[String(s.id)]=s);
      /* MERGE: SP-only services are preserved; local wins on same id */
      const merged={...spMap};
      lib.forEach(s=>{ merged[String(s.id)]={spId:(spMap[String(s.id)]||{}).spId,svc:s}; });
      /* Upsert merged result; Title = readable "Cat | Name" */
      for(const key of Object.keys(merged)){
        const{spId,svc}=merged[key];
        const data={Title:(svc.cat||'')+(svc.cat&&svc.title?' | ':'')+svc.title,shicData:JSON.stringify(svc)};
        if(spId!=null)await spPatch(spList('SowLib'),spId,data);
        else await spPost(spList('SowLib'),data);
      }
      return true;
    }catch(e){console.warn('dbSaveSowLib:',e.message);}
  }
  LS.set('sy3:sowlib',lib);return false;
}
async function dbGetSowLib(){
  if(USE_SP||getSiteURL()){
    try{
      const rows=await spGet(spList('SowLib'),'','Id,Title,shicData');
      if(rows.length){
        const parsed=rows.filter(r=>r.shicData).map(r=>{try{return JSON.parse(r.shicData);}catch{return null;}}).filter(Boolean);
        if(parsed.length)return parsed.sort((a,b)=>String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true}));
      }
    }catch(e){console.warn('dbGetSowLib:',e.message);}
  }
  try{const s=localStorage.getItem('sy3:sowlib');return s?JSON.parse(s):null;}catch{return null;}
}
async function ensureAdmin() {
  try {
    /* Migrate data from old sy3: prefix to shic: prefix */
    try {
      const oldUsers = localStorage.getItem('sy3:users');
      if (oldUsers && !localStorage.getItem('shic:users')) {
        localStorage.setItem('shic:users', oldUsers);
        localStorage.removeItem('sy3:users');
      }
      const oldHistory = localStorage.getItem('sy3:history');
      if (oldHistory && !localStorage.getItem('shic:history')) {
        localStorage.setItem('shic:history', oldHistory);
        localStorage.removeItem('sy3:history');
      }
      const oldML = localStorage.getItem('sy3:masterlist');
      if (oldML && !localStorage.getItem('shic:masterlist')) {
        localStorage.setItem('shic:masterlist', oldML);
        localStorage.removeItem('sy3:masterlist');
      }
    } catch (me) {
      console.warn('migration:', me);
    }
    const u = await dbGetUsers();
    const admin = u.find(x => x && x.role === 'admin');
    if (!admin) {
      /* Generate a random first-run password — never hardcoded in source */
      const tmpPw = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36)).join('').slice(0,10) + 'A1!';
      const h = await hashPassword(tmpPw);
      await dbCreateUser({username:'admin',name:'Administrator',hash:h,role:'admin',status:'approved',email:'',createdAt:new Date().toISOString()});
      setTimeout(()=>(window._shicToast||console.warn)('First-run admin created. Temporary password: '+tmpPw+' — Change this in Admin Panel immediately.',true),2000);
    }
  } catch (e) {
    console.warn('seed admin:', e);
  }
}
const session = {
  get: () => {
    try {
      const v = sessionStorage.getItem('shics');
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set: u => {
    try {
      sessionStorage.setItem('shics', JSON.stringify(u));
    } catch {}
  },
  clear: () => {
    try {
      sessionStorage.removeItem('shics');
    } catch {}
  }
};