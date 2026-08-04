/* ── SP Draft persistence ── */
async function dbSaveDraft(d){
  if(USE_SP||getSiteURL()){
    try{
      const existing=await spGet(spList('Drafts'),`Title eq '${(d.draftId||'').replace(/'/g,"''")}' `,'Id');
      const payload={Title:d.draftId,shicSavedBy:d.savedByName||'',shicData:JSON.stringify(d)};
      if(existing.length)await spWithRetry(()=>spPatch(spList('Drafts'),existing[0].Id,payload));
      else await spWithRetry(()=>spPost(spList('Drafts'),payload));
      return true;
    }catch(e){console.warn('dbSaveDraft:',e.message);}
  }
  try{localStorage.setItem('shic_draft_'+d.draftId,JSON.stringify(d));}catch{}
  return false;
}
async function dbGetDrafts(){
  if(USE_SP||getSiteURL()){
    try{
      /* Intentionally fetches ALL users' drafts — team-visibility feature.
         Each draftId embeds the owner username so there are no Title collisions.
         App.js gates resume/delete to owner + admin only. */
      const r=await spGet(spList('Drafts'),'','Id,Title,shicSavedBy,shicData,Modified');
      const out=r.map(x=>{try{return JSON.parse(x.shicData||'{}');}catch{return null;}}).filter(Boolean)
                 .sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt));
      /* `ok` distinguishes "SharePoint confirmed this list" from "we have
         nothing to show". Both used to be an empty array, so a failed query was
         indistinguishable from no drafts — and anything pruning local drafts on
         that basis would delete work that was never uploaded. Still an array,
         so existing callers are unaffected. */
      out.ok=true;
      return out;
    }catch(e){console.warn('dbGetDrafts:',e.message);}
  }
  const empty=[];
  empty.ok=false; /* not configured, or the query failed — confirms nothing */
  return empty;
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
        await spWithRetry(()=>spPatch(spList('Monitoring'),spId,payload));
      }catch(patchErr){
        /* 404 = item was deleted in SP; clear cache and create fresh */
        if(patchErr.message&&patchErr.message.includes('404')){
          delete _monSpIdCache[ceId];
          const created=await spWithRetry(()=>spPost(spList('Monitoring'),{Title:ceNum||String(ceId),shicCEId:numId,...payload}));
          if(created&&created.Id)_monSpIdCache[ceId]=created.Id;
        }else throw patchErr;
      }
    }else{
      const created=await spWithRetry(()=>spPost(spList('Monitoring'),{Title:ceNum||String(ceId),shicCEId:numId,...payload}));
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
      /* Items exist but none carried readable shicMonData. This is NOT an empty
         list — it usually means the shicMonData column is missing or unpopulated
         (Note-column creation failed with a 400 until 3fc4b1b), or the results
         were permission-trimmed. Callers must keep their local copy. */
      return{data:{},modifiedAt:latest,parseFailed:true,itemCount:r.length};
    }
    /* No per-CE items at all — check legacy blob */
    const legacy=await spGet(spList('Monitoring'),"Title eq 'config'",'Id,shicMonData,Modified');
    if(legacy.length&&legacy[0].shicMonData){
      try{return{data:JSON.parse(legacy[0].shicMonData),modifiedAt:legacy[0].Modified,legacy:true};}catch{}
    }
    /* The list really is empty: the request succeeded and returned no items. */
    return{data:{},modifiedAt:null,empty:true,definitive:true};
  }catch(e){console.warn('dbGetMon:',e.message);}
  return null; /* null = fetch failed, keep local cache */
}

/* ── Sync status helpers ── */
let _syncStatus={sp:'unknown',lastSyncAt:null,dirty:false,stale:false,masterlist:'unknown',monitoring:'unknown',drafts:'unknown',sowlib:'unknown'};
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
      /* Quota guard. This used to re-read and measure EVERY key on every single
         write until the warning fired — megabytes of string reads per save and
         per 3-minute autosave. Now it samples at most once a minute. */
      if (!window._lsWarnShown && Date.now() - (window._lsLastScan || 0) > 60000) {
        window._lsLastScan = Date.now();
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
        /* Free the most expendable thing we hold — per-CE caches — and retry
           once, so a full disk degrades instead of losing the write outright. */
        const freed = LS.pruneCeCache(20);
        if (freed) {
          try { localStorage.setItem('shic:' + k, JSON.stringify(v)); return; } catch (_e2) {}
        }
        if (!window._lsFullShown) { window._lsFullShown = true; setTimeout(() => (window._shicToast||console.error)('Storage full! Export a backup or connect SharePoint to free space.', true), 100); }
      }
    }
  },
  /* ce_cache: holds one full CE per saved estimate and was never pruned, which
     with 800+ CEs is the bulk of what fills localStorage. Keep the most recent
     `keep` entries (by savedAt) and drop the rest; they are only a cache and are
     refetched from SharePoint on demand. Returns how many were removed. */
  pruneCeCache: (keep = 60) => {
    try {
      const entries = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf('shic:ce_cache:') !== 0) continue;
        let when = 0;
        try { when = new Date((JSON.parse(localStorage.getItem(key)) || {}).savedAt || 0).getTime() || 0; } catch (_e) {}
        entries.push({ key, when });
      }
      if (entries.length <= keep) return 0;
      entries.sort((a, b) => b.when - a.when);
      const doomed = entries.slice(keep);
      doomed.forEach(e => { try { localStorage.removeItem(e.key); } catch (_e) {} });
      return doomed.length;
    } catch (_e) { return 0; }
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
/* On a SharePoint install this must NOT fall back to a local write. The Users
   list is where admins approve people; a locally written account is invisible
   there and never syncs, so registering offline showed the "request submitted"
   screen for a request nobody would ever receive. Fail loudly instead — the
   caller reports it and the person can try again on the network. Accounts are
   also the one thing an offline queue cannot help with: approval has to happen
   centrally. */
async function dbCreateUser(u){if(USE_SP||getSiteURL()){const r=await spPost(spList('Users'),{Title:u.username,shicName:u.name,shicHash:u.hash,shicRole:u.role,shicStatus:u.status,shicEmail:u.email||''});return{...u,id:r.Id};}const all=LS.get('users')||[];const nu={...u,id:Date.now()};LS.set('users',[...all,nu]);return nu;}
/* Mirrors the change into the local cache so a password change does not leave a
   stale hash that would let the old password keep working offline. Only touches
   a user already cached here -- it never adds one.

   On a SharePoint install the remote write happens FIRST and its failure is
   propagated. It used to write locally first and swallow the failure, which
   diverged the two stores in the worst possible direction: a password change
   reported "changed successfully" while SharePoint kept the old hash, so the
   NEW password worked offline and the OLD one still worked online. Approving a
   user had the same shape -- the admin saw success and the account stayed
   pending for everyone else. */
async function dbUpdateUser(id,data){
  const mirror=()=>{try{const cur=LS.get('users')||[];if(cur.some(u=>u.id===id))LS.set('users',cur.map(u=>u.id===id?{...u,...data}:u));}catch(_){}};
  if(USE_SP||getSiteURL()){
    const sp={};if(data.status!==undefined)sp.shicStatus=data.status;if(data.role!==undefined)sp.shicRole=data.role;if(data.hash!==undefined)sp.shicHash=data.hash;if(data.name!==undefined)sp.shicName=data.name;
    await spPatch(spList('Users'),id,sp);
    mirror();
    return;
  }
  mirror();
  LS.set('users',(LS.get('users')||[]).map(u=>u.id===id?{...u,...data}:u));
}
/* Was called by the Admin panel's Delete button but never defined anywhere, so
   deleting a user threw a ReferenceError and the user stayed. */
async function dbDeleteUser(id){
  if(USE_SP||getSiteURL()){
    try{ await spWithRetry(()=>spDelete(spList('Users'),id)); }
    catch(e){ console.warn('dbDeleteUser:',e.message); throw e; }
  }
  LS.set('users',(LS.get('users')||[]).filter(u=>u.id!==id));
}
/* Look up a single CE by number. Save used to pull the entire history (800+
   rows) just to check whether one Title already existed, which made every save
   wait on a full list fetch. This asks SharePoint for the one row instead. */
async function dbFindCEByNum(ceNum){
  const t=String(ceNum||'').trim();
  if(!t)return null;
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('CEs'),`Title eq '${t.replace(/'/g,"''")}'`,'Id,Title,shicSavedBy,shicSavedAt');
      if(r&&r.length)return{id:r[0].Id,ceNum:r[0].Title,savedBy:r[0].shicSavedBy||'',savedAt:r[0].shicSavedAt||''};
      return null;
    }catch(e){ console.warn('dbFindCEByNum:',e.message); /* fall through to local */ }
  }
  const all=LS.get('history')||[];
  const hit=all.find(h=>(((h.info&&h.info.ceNum)||h.ceNum||'')+'').trim().toUpperCase()===t.toUpperCase());
  if(hit)return{id:hit.id,ceNum:t,savedBy:hit.savedBy||'',savedAt:hit.savedAt||'',_imported:hit._imported};
  /* Also consult the offline archive: history holds summaries after a sync and
     may have been pruned, so a CE saved offline could otherwise look unused and
     let a second CE claim the same number. */
  try{
    const rec=await ceGet(t);
    if(rec)return{id:rec.id,ceNum:t,savedBy:rec.savedBy||'',savedAt:rec.savedAt||'',_imported:rec._imported};
  }catch(_){}
  return null;
}
async function dbGetHistory(username,isAdmin){if(USE_SP||getSiteURL()){try{const f=isAdmin?"":`shicSavedBy eq '${username}'`;const r=await spGet(spList('CEs'),f,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt');return r.map(h=>({id:h.Id,ceNum:h.Title,ceType:h.shicType,client:h.shicClient||'',grand:h.shicTotal||0,savedBy:h.shicSavedBy||'',savedAt:h.shicSavedAt||h.Created,info:{ceNum:h.Title,client:h.shicClient||'',description:h.shicDesc||''}}));}catch(e){console.warn('dbGetHistory:',e.message);}}const all=LS.get('history')||[];return isAdmin?all:all.filter(h=>h.savedBy===username);}
async function dbLoadCE(id){
  /* Offline (or SharePoint unreachable) this returned null and the CE simply
     would not open. The IndexedDB archive holds the full record -- line items
     and all -- so serve it instead. SharePoint stays authoritative when online. */
  if(!(USE_SP||getSiteURL()))return await _ceLoadLocal(id);
  try{const[hR,mR,rR]=await Promise.all([spGet(spList('CEs'),`Id eq ${id}`,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt,shicScope,shicNotes,shicApprovers,shicMob,shicDemob,shicMisc,shicSOW'),spGet(spList('CE_MP'),`shicCEId eq ${id}`,'Id,shicRole,shicRate,shicShift,shicDays,shicQty,shicTaskId'),spGet(spList('CE_Resources'),`shicCEId eq ${id}`,'Id,shicTab,shicDesc,shicQty,shicUOM,shicCost,shicDays,shicTaskId')]);if(!hR.length)return null;const h=hR[0];return{id:h.Id,ceType:h.shicType||'onsite',grand:h.shicTotal||0,savedBy:h.shicSavedBy||'',savedAt:h.shicSavedAt||'',info:{ceNum:h.Title,client:h.shicClient||'',description:h.shicDesc||''},scope:h.shicScope||'',mp:mR.map(r=>({id:'sp'+r.Id,role:r.shicRole||'',rate:r.shicRate||0,shift:r.shicShift||'straight',days:r.shicDays||1,qty:r.shicQty||1,taskId:r.shicTaskId||''})),tools:rR.filter(r=>r.shicTab==='tools').map(r=>({id:'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0,days:r.shicDays||1,taskId:r.shicTaskId||''})),mats:rR.filter(r=>r.shicTab==='mats').map(r=>({id:'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0,taskId:r.shicTaskId||''})),ppe:rR.filter(r=>r.shicTab==='ppe').map(r=>({id:'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0,taskId:r.shicTaskId||''})),misc:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};const{_addlCosts,_margin,...rest}=m;return rest;})(),addlCosts:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._addlCosts||[];})(),margin:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._margin||0;})(),sowItems:(()=>{try{return h.shicSOW?JSON.parse(h.shicSOW):[];}catch(_){return [];}})(),notes:h.shicNotes?JSON.parse(h.shicNotes):[],approvers:h.shicApprovers?JSON.parse(h.shicApprovers):[],mobVehicles:h.shicMob?JSON.parse(h.shicMob):[],demobVehicles:h.shicDemob?JSON.parse(h.shicDemob):[]};}catch(e){console.warn('dbLoadCE:',e.message);return await _ceLoadLocal(id);}}
/* Full CE from the offline archive, by SharePoint item Id. */
async function _ceLoadLocal(id){
  try{
    const all=await ceAll();
    const hit=all.find(r=>r.id===id);
    if(hit)return hit;
  }catch(e){console.warn('_ceLoadLocal:',e.message);}
  return null;
}
async function dbSaveHistory(e){if(USE_SP||getSiteURL()){try{const existing=await spGet(spList('CEs'),`Title eq '${(e.info.ceNum||'').replace(/'/g,"''")}'`,'Id');const hdr={Title:e.info.ceNum,shicType:e.ceType,shicClient:e.info.client||'',shicDesc:e.info.description||'',shicTotal:Math.round((e.grand||0)*100)/100,shicSavedBy:e.savedBy||'',shicSavedAt:new Date().toISOString(),shicScope:e.scope||'',shicNotes:JSON.stringify(e.notes||[]),shicApprovers:JSON.stringify(e.approvers||[]),shicMob:JSON.stringify(e.mobVehicles||[]),shicDemob:JSON.stringify(e.demobVehicles||[]),shicMisc:JSON.stringify({...(e.misc||{}), _addlCosts:(e.addlCosts||[]), _margin:(e.margin||0)}),shicSOW:JSON.stringify(e.sowItems||[])};let ceId;if(existing.length){ceId=existing[0].Id;await spWithRetry(()=>spPatch(spList('CEs'),ceId,hdr));}else{const r=await spWithRetry(()=>spPost(spList('CEs'),hdr));ceId=r.Id;/* Race-condition guard: if two users POSTed simultaneously, keep the lowest Id and delete the duplicate */const dupes=await spGet(spList('CEs'),`Title eq '${(e.info.ceNum||'').replace(/'/g,"''")}'`,'Id,shicSavedBy');if(dupes.length>1){dupes.sort((a,b)=>a.Id-b.Id);const winner=dupes[0];if(winner.Id!==ceId){/* We lost the race — our row is the duplicate. Delete it, preserve our data locally, and surface a clear error to the user so they can save under a different CE number. The winner row is left completely untouched. */await spDelete(spList('CEs'),ceId).catch(()=>{});const _savedAt=new Date().toISOString();try{const h=LS.get('history')||[];LS.set('history',[{...e,id:Date.now(),savedAt:_savedAt,_raceConflict:true},...h.filter(x=>(x.info?.ceNum||x.ceNum)!==e.info.ceNum)]);LS.set('ce_cache:'+e.info.ceNum,{...e,id:Date.now(),savedAt:_savedAt});}catch(_){}/* 'local': we LOST the race and deleted our own SharePoint row, so this browser holds the only copy of the user's work. Nothing may ever delete a 'local' record. */try{await cePut({...e,ceNum:e.info.ceNum,savedAt:_savedAt,savedBy:e.savedBy||'',_syncState:'local',_raceConflict:true});}catch(_){}throw new Error(`CE number "${e.info.ceNum}" was saved by "${winner.shicSavedBy||'another user'}" at the same time. Your data has been kept in this browser — load the local draft and save again with a different CE number.`);}else{for(const dup of dupes.slice(1))await spDelete(spList('CEs'),dup.Id).catch(()=>{});}}}const[om,or]=await Promise.all([spGet(spList('CE_MP'),`shicCEId eq ${ceId}`,'Id'),spGet(spList('CE_Resources'),`shicCEId eq ${ceId}`,'Id')]);/* Insert new rows FIRST — if any insert fails the old rows are still intact */const mpPayloads=(e.mp||[]).filter(r=>r.role).map(r=>({shicCEId:ceId,shicRole:r.role,shicRate:r.rate||0,shicShift:r.shift||'regular_day',shicDays:r.days||1,shicPax:r.pax||1,shicOTHours:r.otHours||0,shicPerDiem:r.perDiem||0,shicTaskId:r.taskId||''}));const resPayloads=[...(e.tools||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'tools',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0,shicDays:r.days||1,shicTaskId:r.taskId||''})),...(e.mats||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'mats',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0,shicTaskId:r.taskId||''})),...(e.ppe||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'ppe',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0,shicTaskId:r.taskId||''}))];const insFns=[...mpPayloads.map(p=>()=>spWithRetry(()=>spPost(spList('CE_MP'),p))),...resPayloads.map(p=>()=>spWithRetry(()=>spPost(spList('CE_Resources'),p)))];let spErr=null;for(let i=0;i<insFns.length;i+=5){try{await Promise.all(insFns.slice(i,i+5).map(fn=>fn()));}catch(batchErr){spErr=batchErr;console.error('dbSaveHistory batch insert failed:',batchErr.message);break;}}if(spErr)throw spErr;/* Only delete OLD rows after new ones safely written */const dels=[...om.map(x=>()=>spDelete(spList('CE_MP'),x.Id)),...or.map(x=>()=>spDelete(spList('CE_Resources'),x.Id))];for(let i=0;i<dels.length;i+=5)await Promise.all(dels.slice(i,i+5).map(fn=>fn())).catch(()=>{});try{LS.set('ce_cache:'+e.info.ceNum,{...e,id:ceId,savedAt:hdr.shicSavedAt});}catch(_){}/* Write through to IndexedDB alongside the localStorage cache. 'synced' -- SharePoint accepted it, so the migration may safely treat the two copies as agreeing. */try{await cePut({...e,ceNum:e.info.ceNum,id:ceId,savedAt:hdr.shicSavedAt,savedBy:e.savedBy||'',_syncState:'synced'});}catch(_){}return;}catch(e2){const msg=e2.message||String(e2);console.warn('dbSaveHistory SP error:',msg);setTimeout(()=>(window._shicToast||console.warn)('SharePoint save failed ('+msg.slice(0,80)+') — CE stored locally.',true),100);}}const h=LS.get('history')||[];const _eid=Date.now();const _savedAt=new Date().toISOString();LS.set('history',[{...e,id:_eid,savedAt:_savedAt},...h.filter(x=>(x.info?.ceNum||x.ceNum)!==e.info.ceNum)]);try{LS.set('ce_cache:'+e.info.ceNum,{...e,id:_eid,savedAt:_savedAt});}catch(_){}/* 'local': saved offline or after a SharePoint failure. Not yet uploaded. */try{await cePut({...e,ceNum:e.info.ceNum,id:_eid,savedAt:_savedAt,savedBy:e.savedBy||'',_syncState:'local'});}catch(_){}}
/* Patch ONLY the stored grand total of a saved CE. Used by the Admin recompute so
   it never rewrites the CE's rows -- a full dbSaveHistory would delete and
   re-insert every CE_MP / CE_Resources row, which is far riskier than the fix. */
async function dbUpdateCETotal(ceNum, id, total){
  const t = Math.round((total||0)*100)/100;
  if((USE_SP||getSiteURL()) && typeof id === 'number'){
    try{ await spWithRetry(()=>spPatch(spList('CEs'), id, {shicTotal:t})); }
    catch(e){ console.warn('dbUpdateCETotal SP:', e.message); throw e; }
  }
  /* Keep the local mirrors in step so Monitoring/Dashboard agree immediately. */
  try{
    const h = LS.get('history')||[];
    LS.set('history', h.map(x => ((x.info&&x.info.ceNum)||x.ceNum)===ceNum ? {...x, grand:t} : x));
    const c = LS.get('ce_cache:'+ceNum);
    if(c) LS.set('ce_cache:'+ceNum, {...c, grand:t});
  }catch(_){}
  /* Same for the IndexedDB archive, or a recompute would leave the offline copy
     showing the old total. Preserve _syncState -- do not silently re-mark. */
  try{
    const rec = await ceGet(ceNum);
    if(rec) await cePut({...rec, grand:t});
  }catch(_){}
}
async function dbDeleteHistory(id){if(USE_SP||getSiteURL()){try{const[m,r]=await Promise.all([spGet(spList('CE_MP'),`shicCEId eq ${id}`,'Id'),spGet(spList('CE_Resources'),`shicCEId eq ${id}`,'Id')]);const d=[...m.map(x=>spDelete(spList('CE_MP'),x.Id)),...r.map(x=>spDelete(spList('CE_Resources'),x.Id))];for(let i=0;i<d.length;i+=5)await Promise.all(d.slice(i,i+5));await spDelete(spList('CEs'),id);return;}catch(e){console.warn('dbDeleteHistory:',e.message);}}LS.set('history',(LS.get('history')||[]).filter(h=>h.id!==id));await _ceDeleteById(id);}
/* Delete by SharePoint item Id. The archive is keyed by CE number, so find the
   record through the by_id index first; falling back to a scan keeps a record
   that predates the index from being orphaned. */
async function _ceDeleteById(id){
  try{
    const all=await ceAll();
    const hit=all.find(r=>r.id===id);
    if(hit)await ceDelete(hit.ceNum);
  }catch(_){}
}
async function dbGetML(){if(USE_SP||getSiteURL()){try{const r=await spGet(spList('Masterlist'),"Title eq 'config'",'Id,shicData');if(r.length&&r[0].shicData)return JSON.parse(r[0].shicData);}catch(e){console.warn('dbGetML:',e.message);}}return LS.get('masterlist');}
async function dbGetAuditLog(limit=200){if(getSiteURL()){try{const r=await spGet(spList('AuditLog'),'','Id,shicAction,shicDetail,shicUser,shicTs');return r.sort((a,b)=>b.Id-a.Id).slice(0,limit).map(x=>({ts:x.shicTs||x.Created,action:x.shicAction||x.Title||'',detail:x.shicDetail||'',user:x.shicUser||''}));}catch(e){console.warn('dbGetAuditLog:',e.message);}}return(LS.get('auditlog')||[]).slice(0,limit);}

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
async function dbSaveML(data){/* Mirror locally FIRST, on both branches. The SharePoint branch used to
   `return` before ever reaching the LS.set below, so saving the masterlist
   while online left the offline cache stale forever. */
LS.set('masterlist',data);LS.set('masterlist_savedAt',new Date().toISOString());
if(USE_SP||getSiteURL()){try{const r=await spGet(spList('Masterlist'),"Title eq 'config'",'Id,Modified');if(r.length){/* Conflict guard: if SP was updated more recently than our local copy, warn before overwriting */const spModified=new Date(r[0].Modified||0).getTime();const localSavedAt=new Date(LS.get('masterlist_savedAt')||0).getTime();if(spModified>localSavedAt+5000)console.warn('dbSaveML: SP masterlist was modified by another user at',r[0].Modified,'— overwriting with local version');await spPatch(spList('Masterlist'),r[0].Id,{shicData:JSON.stringify(data)});}else await spPost(spList('Masterlist'),{Title:'config',shicData:JSON.stringify(data)});return;}catch(e){console.warn('dbSaveML:',e.message);}}}
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
  /* Raw key, no shic: prefix — App.js reads localStorage['sy3:sowlib'] directly.
     LS.set would write 'shic:sy3:sowlib', which nothing ever read. */
  try{localStorage.setItem('sy3:sowlib',JSON.stringify(lib));}catch(e){console.warn('sowlib not cached locally:',e&&e.message);}
  return false;
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
    /* Never mint a local admin on a SharePoint-backed install. The admin lives
       in the Users list; if we cannot read it we know nothing about who exists,
       and inventing one is a privilege-escalation route — any user could open
       the app offline and read the generated password straight off the toast.
       Only a genuinely unconfigured install has a first run to seed. */
    if (USE_SP || getSiteURL()) return;
    const u = await dbGetUsers();
    const admin = u.find(x => x && x.role === 'admin');
    if (!admin) {
      /* Generate a random first-run password — never hardcoded in source */
      const tmpPw = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36)).join('').slice(0,10) + 'A1!';
      const h = await hashPassword(tmpPw);
      await dbCreateUser({username:'admin',name:'Administrator',hash:h,role:'admin',status:'approved',email:'',createdAt:new Date().toISOString()});
      console.info('%cSHIC first-run admin password: '+tmpPw+' — Change this immediately in Admin Panel.','color:#F59E0B;font-weight:bold');setTimeout(()=>(window._shicToast||console.warn)('First-run admin created. Temporary password: '+tmpPw+' — Change this in Admin Panel immediately.',true),2000);
    }
  } catch (e) {
    console.warn('seed admin:', e);
  }
}
/* ── Bulk upload mode ────────────────────────────────────────────────────────
   Admin-only, temporary bypass of the duplicate CE-number guard so historical
   CEs can be loaded in. Deliberately constrained:
     - sessionStorage, so it dies with the tab and never persists to another
       machine or another day
     - carries an expiry, so it cannot be left on and quietly permit duplicates
       weeks later
     - the caller still checks isAdmin; this only records the window
   NOTE: with the guard bypassed, saving a CE number that already exists UPDATES
   that CE (dbSaveHistory patches the row it finds by Title) rather than adding
   a second one. */
const bulkMode = {
  get() {
    try {
      const v = JSON.parse(sessionStorage.getItem('shic:bulk') || 'null');
      /* `until` must be a real number. A non-numeric value makes the comparison
         below NaN, which is never true, so a corrupted entry would leave the
         protection off indefinitely. Anything unexpected fails closed. */
      if (!v || typeof v.until !== 'number' || !isFinite(v.until)) { sessionStorage.removeItem('shic:bulk'); return null; }
      if (Date.now() > v.until) { sessionStorage.removeItem('shic:bulk'); return null; }
      return v;
    } catch (_e) { return null; }
  },
  on() { return !!bulkMode.get(); },
  minutesLeft() { const v = bulkMode.get(); return v ? Math.max(0, Math.ceil((v.until - Date.now()) / 60000)) : 0; },
  enable(minutes, by) {
    try { sessionStorage.setItem('shic:bulk', JSON.stringify({ until: Date.now() + (minutes || 60) * 60000, by: by || '' })); } catch (_e) {}
    try { window.dispatchEvent(new Event('shic:bulk:changed')); } catch (_e) {}
  },
  disable() {
    try { sessionStorage.removeItem('shic:bulk'); } catch (_e) {}
    try { window.dispatchEvent(new Event('shic:bulk:changed')); } catch (_e) {}
  }
};
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
/* ── One-time move of the CE archive into IndexedDB ──────────────────────────
   localStorage held a full CE per estimate under ce_cache:<num> plus fat
   records in `history`, which with 800+ CEs is what pushed it to ~4.7 MB of a
   ~5 MB budget and started failing writes.

   Safety rules, in order of importance:
     1. A record with _syncState 'local' is NEVER deleted by anything here. It
        exists only in this browser.
     2. Nothing is removed from localStorage until the IndexedDB write has
        actually committed.
     3. Reconciliation is ONE bulk fetch, not 823 lookups: per-record calls
        would be slow and a single throttled request could mis-mark a synced CE
        as local-only.
     4. If reconciliation cannot run (offline, or the fetch failed) we stop
        without deleting anything and without setting the flag, so the next
        open simply retries.
     5. The flag is written LAST, so an interrupted run re-runs cleanly. */
async function dbMigrateToIDB(username, isAdmin){
  try{
    if(!(await idbReady()))return{skipped:'no-indexeddb'};
    if(await metaGet('migv3'))return{skipped:'done'};

    let before=0;
    try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);before+=((localStorage.getItem(k)||'').length+k.length)*2;}}catch(_){}

    /* 1. Gather ce_cache:* — full CEs, provenance not yet known. */
    const cacheKeys=[],staged={};
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.indexOf('shic:ce_cache:')===0)cacheKeys.push(k);
      }
    }catch(_){}
    for(const k of cacheKeys){
      try{
        const v=JSON.parse(localStorage.getItem(k));
        const num=ceKey((v&&((v.info&&v.info.ceNum)||v.ceNum))||k.slice('shic:ce_cache:'.length));
        if(num&&v)staged[num]={...v,ceNum:num,_syncState:'unknown'};
      }catch(_){}
    }

    /* 2. Fat history records. A CE is "full" only if it carries line items; a
       post-sync summary must never overwrite a record that already has them. */
    const hist=LS.get('history')||[];
    const isFull=r=>['mp','tools','mats','ppe','sowItems','notes'].some(f=>Array.isArray(r&&r[f]));
    for(const r of hist){
      const num=ceKey((r.info&&r.info.ceNum)||r.ceNum);
      if(!num)continue;
      if(isFull(r)&&!(staged[num]&&isFull(staged[num])))staged[num]={...r,ceNum:num,_syncState:'unknown'};
    }

    const nums=Object.keys(staged);
    if(!nums.length){await metaPut('migv3',{at:new Date().toISOString(),moved:0,freedBytes:0,localOnly:0});return{moved:0};}

    /* 3. Reconcile against SharePoint with a SINGLE listing. */
    const spConfigured=!!(USE_SP||getSiteURL());
    let spTitles=null;
    if(spConfigured){
      try{
        const rows=await dbGetHistory(username,isAdmin);
        if(Array.isArray(rows))spTitles=new Set(rows.map(r=>ceKey(r.ceNum||(r.info&&r.info.ceNum))).filter(Boolean));
      }catch(e){console.warn('dbMigrateToIDB: reconciliation failed:',e.message);}
      if(!spTitles){
        /* Configured but unreachable: we cannot tell a synced CE from a
           local-only one, and guessing wrong would delete the only copy.
           Change nothing, set no flag, retry on the next open. */
        console.info('dbMigrateToIDB: cannot reconcile (offline or fetch failed) — deferring.');
        return{deferred:true};
      }
    }else{
      /* No SharePoint at all — a purely local install. There is nothing to
         reconcile against and nothing is "synced", so every record is
         legitimately local-only. Still move them into IndexedDB (that is what
         makes the archive available offline); rule 1 then keeps every
         localStorage copy, so this frees no space but loses nothing either.
         Without this branch the migration deferred forever and a local-only
         install never got an archive at all. */
      spTitles=new Set();
    }
    let localOnly=0;
    for(const n of nums){
      const synced=spTitles.has(n);
      if(!synced)localOnly++;
      staged[n]._syncState=synced?'synced':'local';
    }

    /* 4. Commit to IndexedDB in batches, then verify before deleting anything. */
    const list=nums.map(n=>staged[n]);
    for(let i=0;i<list.length;i+=50)await ceBulkPut(list.slice(i,i+50));
    const stored=await ceCount();
    if(stored<list.length){
      console.warn('dbMigrateToIDB: only',stored,'of',list.length,'stored — not deleting anything.');
      return{deferred:true,stored};
    }

    /* 5. Only now reclaim the space. Rule 1: a 'local' record keeps its
       localStorage copy as well, belt and braces, until it has been uploaded. */
    let removed=0;
    for(const k of cacheKeys){
      const num=ceKey(k.slice('shic:ce_cache:'.length));
      if(staged[num]&&staged[num]._syncState==='local')continue;
      try{localStorage.removeItem(k);removed++;}catch(_){}
    }
    /* history becomes summaries; local-only records keep their line items. */
    try{
      LS.set('history',hist.map(r=>{
        const num=ceKey((r.info&&r.info.ceNum)||r.ceNum);
        if(staged[num]&&staged[num]._syncState==='local')return r;
        return{id:r.id,ceNum:r.ceNum,ceType:r.ceType,client:r.client||(r.info&&r.info.client)||'',grand:r.grand||0,savedBy:r.savedBy||'',savedAt:r.savedAt||'',info:r.info||{ceNum:r.ceNum}};
      }));
    }catch(_){}

    let after=0;
    try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);after+=((localStorage.getItem(k)||'').length+k.length)*2;}}catch(_){}
    const freedBytes=Math.max(0,before-after);
    /* Rule 5: flag last. Keep a manifest of what was removed — a list of CE
       numbers is negligible in size and is the only support path if a record
       is ever reported missing. */
    await metaPut('migv3',{at:new Date().toISOString(),moved:list.length,removed,freedBytes,localOnly,manifest:nums});
    console.info('dbMigrateToIDB: moved '+list.length+' CE(s), freed '+Math.round(freedBytes/1024)+' KB, '+localOnly+' local-only kept.');
    return{moved:list.length,removed,freedBytes,localOnly};
  }catch(e){console.warn('dbMigrateToIDB:',e.message);return{error:e.message};}
}

/* ── Upload CEs that exist only in this browser ──────────────────────────────
   Audit finding: there was NO sync-on-reconnect at all. _spQueue was never
   pushed to by anything, so the 'online' handler's _flushQ() always found it
   empty and the OnlinePill's "N pending" was permanently 0 — which actively
   implied a queue was working. A CE saved offline sat at _syncState:'local'
   until somebody happened to find "Push Local Data" in the admin panel.

   dbSaveHistory is the upload path: it looks up the CE number and PATCHes an
   existing row rather than inserting, so re-sending is an upsert and cannot
   duplicate. It also re-marks the record 'synced' on success and leaves it
   'local' on failure, so this function does not have to track state itself. */
let _pushRunning=false;
async function dbPushLocalCEs(opts){
  const o=opts||{};
  if(!(USE_SP||getSiteURL()))return{skipped:'not-configured'};
  if(_pushRunning)return{skipped:'already-running'};
  const heedOnline=o.requireOnline!==false;
  if(heedOnline&&navigator.onLine===false)return{skipped:'offline'};
  _pushRunning=true;
  try{
    const all=await ceAll();
    const pending=all.filter(r=>r&&r._syncState==='local');
    if(!pending.length)return{pushed:0,failed:0};
    let pushed=0,failed=0;const errors=[];
    for(const rec of pending){
      /* Stop the moment the connection drops again rather than burning the
         whole list against a dead network -- unless the caller explicitly
         overrode the check (the manual admin button), since navigator.onLine
         reports false on some corporate networks that can still reach an
         intranet SharePoint perfectly well. */
      if(heedOnline&&navigator.onLine===false)break;
      try{
        await dbSaveHistory({...rec,info:rec.info||{ceNum:rec.ceNum}});
        /* dbSaveHistory only reaches its 'synced' write when SharePoint
           accepted it, so re-read rather than assuming success. */
        const after=await ceGet(rec.ceNum);
        if(after&&after._syncState==='synced'){
          pushed++;
          /* Now that SharePoint holds it, the localStorage copy the migration
             deliberately kept is no longer the only one. Reclaim it. */
          try{localStorage.removeItem('shic:ce_cache:'+ceKey(rec.ceNum));}catch(_){}
        }else{failed++;errors.push(rec.ceNum+': SharePoint did not confirm the save');}
      }catch(e){failed++;errors.push(rec.ceNum+': '+(e.message||String(e)));}
      /* Throttle so a large backlog cannot trip SharePoint rate limiting. */
      await new Promise(r=>setTimeout(r,300));
    }
    return{pushed,failed,errors,remaining:pending.length-pushed};
  }catch(e){console.warn('dbPushLocalCEs:',e.message);return{error:e.message};}
  finally{_pushRunning=false;}
}

/* How many CEs are waiting to be uploaded. Drives the connection pill, which
   used to read the always-empty _spQueue. */
async function dbPendingCount(){
  try{const by=await ceCountBy();return by.local||0;}catch(_){return 0;}
}
