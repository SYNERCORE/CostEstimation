/* The four figures a Tier 1 or Tier 3 price is derived from ride on the row,
   copied off the Masterlist when the item was added, so a later Masterlist edit
   cannot reprice a quoted CE. They had no column, so a saved CE came back
   without them -- and toolRowCost, finding nothing to derive from, fell back to
   the daily rate. A Tier 1 row costed 36,500 in the editor and 6,000 after a
   reload. One column holding the four, rather than four columns. */
function _srcDump(r){
  const o={};
  ['unitPrice','serviceLife','projectsPerYear','maintPerYear'].forEach(k=>{
    if(r[k]!==undefined&&r[k]!==''&&r[k]!==null)o[k]=r[k];
  });
  /* Empty string, not '{}': a row with no figures must read back with no keys,
     or every tool would claim a basis of zero. */
  return Object.keys(o).length?JSON.stringify(o):'';
}
function _srcParse(v){
  if(!v)return {};
  try{const o=JSON.parse(v);return (o&&typeof o==='object')?o:{};}catch(_){return {};}
}
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
      /* EVERY match, not just the first. A retried POST (the write succeeded but
         the response never arrived) leaves two rows under one Title, and
         deleting one of them left the draft on screen after the CE was saved --
         looking exactly like the save had not worked. */
      for(const x of r)await spDelete(spList('Drafts'),x.Id).catch(()=>{});
    }catch(e){console.warn('dbDeleteDraft:',e.message);}
  }
  try{localStorage.removeItem('shic_draft_'+draftId);}catch{}
}

/* ── SP Monitoring persistence — one item per CE ── */
/* Cache of ceId → SP item Id to avoid repeated GET lookups */
const _monSpIdCache = {};

/* Merge two status trails into one. Both sides appended to a copy that was
   read at startup, so concatenating would double every shared entry; an entry
   is the same entry when it records the same status at the same moment. */
function _monMergeLog(theirs,mine){
  const out=[],seen={};
  for(const h of [...(Array.isArray(theirs)?theirs:[]),...(Array.isArray(mine)?mine:[])]){
    if(!h||typeof h!=='object')continue;
    const k=String(h.status!=null?h.status:(h.text||''))+'|'+String(h.at||'')+'|'+String(h.by||'');
    if(seen[k])continue;
    seen[k]=1;out.push(h);
  }
  return out.sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))).slice(-60);
}
/* Save one CE's monitoring fields.

   `changed` names the fields this edit actually touched. Monitoring is one SP
   item per CE, so two people on two different CEs never collide -- but the
   write used to carry this browser's WHOLE field object for the CE, built from
   a copy read at startup. Two people on the SAME CE did collide: setting a
   status at 10am wrote back the deadline as it stood at 8am, quietly undoing
   whoever had changed it since. With `changed`, only those fields are taken
   from this browser and the rest of the row is left as the site has it.

   Without `changed` -- the import and migration paths -- the whole object is
   written, which is what those callers mean. */
async function dbSaveMonEntry(ceId, ceNum, monFields, changed){
  if(!(USE_SP||getSiteURL()))return false;
  try{
    const numId=Number(ceId);
    let spId=_monSpIdCache[ceId];
    let theirs=null,alsoWrite=[];
    /* Always read the row before writing it -- and take the same copy the
       table reads, the newest, when the CE has more than one. */
    if(!spId||(changed&&changed!=='ensure'&&changed.length)){
      try{
        const r=await spGet(spList('Monitoring'),`shicCEId eq ${numId}`,'Id,shicMonData');
        if(r.length){
          const sorted=r.slice().sort((a,b)=>b.Id-a.Id);
          spId=sorted[0].Id;_monSpIdCache[ceId]=spId;
          alsoWrite=sorted.slice(1).map(x=>x.Id);
          try{theirs=sorted[0].shicMonData?JSON.parse(sorted[0].shicMonData):null;}catch(_e){}
        }
      }catch(_e){if(!spId)throw _e;}
    }
    /* 'ensure' means the caller only needs the row to EXIST -- the attachment
       upload needs an item id to attach to. If the site already has one, its
       data is left exactly as it is rather than being replaced by whatever
       this browser happens to hold. */
    if(changed==='ensure'&&spId)return {ok:true,fields:theirs||monFields};
    let toWrite=monFields;
    if(changed&&changed!=='ensure'&&changed.length&&theirs&&typeof theirs==='object'){
      toWrite={...theirs};
      for(const k of changed)toWrite[k]=monFields[k];
      if(changed.indexOf('statusLog')>=0)toWrite.statusLog=_monMergeLog(theirs.statusLog,monFields.statusLog);
      /* Remarks from two people at once both stay in the trail, and the
         column shows whichever was written last. */
      if(changed.indexOf('remarksLog')>=0){
        toWrite.remarksLog=_monMergeLog(theirs.remarksLog,monFields.remarksLog);
        const last=toWrite.remarksLog[toWrite.remarksLog.length-1];
        if(last)toWrite.remarks=last.text||'';
      }
    }
    const payload={shicMonData:JSON.stringify(toWrite)};
    if(spId){
      try{
        await spWithRetry(()=>spPatch(spList('Monitoring'),spId,payload));
        /* The older copies of the same CE are written too, so whichever one
           a colleague's table happens to read says the same thing. */
        for(const other of alsoWrite){
          try{await spPatch(spList('Monitoring'),other,payload);}catch(_e){console.warn('duplicate monitoring row '+other+' not updated:',_e.message);}
        }
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
    /* What was actually written, so the caller can show the row the site now
       holds rather than the one it hoped for. */
    return {ok:true,fields:toWrite};
  }catch(e){console.warn('dbSaveMonEntry:',e.message);return {ok:false,reason:e.message};}
}

/* Write just the info column of a saved CE. The approval's fingerprint is
   corrected right after a submit, and rewriting every line item to store one
   string risks the rows for nothing. */
async function dbPatchCEInfo(ceId,info){
  if(!(USE_SP||getSiteURL()))return false;
  try{
    const r=await spGet(spList('CEs'),`Id eq ${Number(ceId)}`,'Id');
    if(!r.length)return false;
    await spWithRetry(()=>spPatch(spList('CEs'),r[0].Id,{shicInfo:JSON.stringify(info||{})}));
    try{const loc=await _ceLoadLocal(ceId);if(loc)await cePut({...loc,info:info,ceNum:(info&&info.ceNum)||loc.ceNum});}catch(_e){}
    return true;
  }catch(e){console.warn('dbPatchCEInfo:',e.message);return false;}
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


/* ── duplicate Monitoring rows ──
   A CE is supposed to have one row. Two is how a status change looked like it
   reverted: the table read the newest copy and every save wrote the oldest.
   Both sides take the newest now, so duplicates are harmless -- but they
   double the list, slow every save, and the older copy may still hold changes
   nobody ever saw. These two find them and fold them back into one. */
async function dbFindMonDuplicates(){
  if(!(USE_SP||getSiteURL()))return [];
  const r=await spGet(spList('Monitoring'),"Title ne 'config'",'Id,Title,shicCEId,shicMonData');
  const by={};
  r.forEach(it=>{const cid=String(it.shicCEId);if(!cid||cid==='null'||cid==='0')return;(by[cid]=by[cid]||[]).push(it);});
  return Object.keys(by).filter(cid=>by[cid].length>1).map(cid=>{
    const rows=by[cid].slice().sort((a,b)=>b.Id-a.Id);
    const parse=x=>{try{return x.shicMonData?JSON.parse(x.shicMonData):{};}catch(_e){return {};}};
    return {ceId:cid,title:rows[0].Title||cid,keep:rows[0].Id,drop:rows.slice(1).map(x=>x.Id),
      rows:rows.map(x=>({Id:x.Id,data:parse(x)}))};
  });
}
/* Everything the two copies know, in one row. The copy the table has been
   showing wins where they disagree, EXCEPT on the status: a change written to
   the other copy and never seen is the one being rescued here, so the later
   of the two stamps is the one that stands. Both trails are kept. */
function _monMergeRow(keep,other){
  const k=keep||{},o=other||{};
  const out={...o,...k};
  const kAt=Date.parse(k.statusChangedAt||'')||0,oAt=Date.parse(o.statusChangedAt||'')||0;
  if(o.status&&oAt>kAt){out.status=o.status;out.statusChangedAt=o.statusChangedAt;out.statusChangedBy=o.statusChangedBy||'';}
  const sl=_monMergeLog(o.statusLog,k.statusLog);if(sl.length)out.statusLog=sl;
  const rl=_monMergeLog(o.remarksLog,k.remarksLog);
  if(rl.length){out.remarksLog=rl;const last=rl[rl.length-1];if(last&&last.text)out.remarks=last.text;}
  return out;
}
/* Fold each group into its newest row, then delete the copies. onStep is told
   what happened to every CE, so the panel can show the work as it goes. */
async function dbTidyMonDuplicates(groups,onStep){
  let merged=0,dropped=0,failed=0;
  for(const g of groups||[]){
    try{
      let data=(g.rows[0]||{}).data||{};
      for(const r of g.rows.slice(1))data=_monMergeRow(data,r.data||{});
      await spWithRetry(()=>spPatch(spList('Monitoring'),g.keep,{shicMonData:JSON.stringify(data)}));
      merged++;
      for(const id of g.drop){
        await spWithRetry(()=>spDelete(spList('Monitoring'),id));
        dropped++;delete _monSpIdCache[g.ceId];
        await new Promise(r=>setTimeout(r,120));
      }
      if(onStep)onStep({ceId:g.ceId,title:g.title,ok:true,kept:g.keep,dropped:g.drop.length,status:data.status||''});
    }catch(e){failed++;if(onStep)onStep({ceId:g.ceId,title:g.title,ok:false,reason:e.message});}
  }
  return {merged,dropped,failed};
}
async function dbGetMon(){
  if(!(USE_SP||getSiteURL()))return null;
  try{
    /* Fetch all per-CE items */
    const r=await spGet(spList('Monitoring'),"Title ne 'config'",'Id,Title,shicCEId,shicMonData,Modified');
    if(r.length){
      const data={};let latest=null;const seen={};let dups=0;
      for(const item of r){
        const cid=String(item.shicCEId);
        if(cid&&cid!=='null'&&cid!=='0'&&item.shicMonData){
          /* A CE with two rows in the list is how a status change came to
             "revert": the read showed one row and the write went to the
             other. Both sides now take the same one -- the newest -- and a
             save writes every copy, so the two cannot drift apart. */
          if(seen[cid]!=null){dups++;if(item.Id<seen[cid])continue;}
          seen[cid]=item.Id;
          try{data[cid]=JSON.parse(item.shicMonData);_monSpIdCache[cid]=item.Id;}catch{}
        }
        if(!latest||item.Modified>latest)latest=item.Modified;
      }
      if(dups)console.warn('dbGetMon: '+dups+' duplicate monitoring row(s); the newest of each is used');
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
          const u = LS.usage();
          if (u.total > LS.WARN_AT) {
            /* This used to say the storage was almost full and leave it at
               that. Nothing cleared anything until a write actually failed,
               so the same warning came back every session with the same
               number behind it and nothing anyone could do about it.
               The cached CEs are the one thing here that can go: they are a
               copy of what SharePoint holds and are fetched again when a CE
               is opened. Clear them first, then say what happened -- and if
               the space is being held by something that cannot be thrown
               away, say what that is instead of asking for a guess. */
            const freed = LS.pruneCeCache(40);
            const after = freed ? LS.usage() : u;
            if (freed && after.total <= LS.WARN_AT) {
              setTimeout(() => (window._shicToast||console.warn)('Storage was almost full, so ' + freed + ' cached CE(s) were cleared (' +
                LS.kb(u.total - after.total) + ' freed). They are fetched from SharePoint again when opened.'), 500);
            } else {
              window._lsWarnShown = true;
              setTimeout(() => (window._shicToast||console.warn)('Storage almost full (' + LS.kb(after.total) + ' of about 5,000 KB). ' +
                (freed ? freed + ' cached CE(s) cleared and it is still full. ' : '') +
                'Most of it is ' + after.top.name + ' (' + LS.kb(after.top.bytes) + '). Sync to SharePoint or export a backup.', true), 500);
            }
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
  WARN_AT: 4 * 1024 * 1024,
  kb: n => Math.round(n / 1024).toLocaleString('en-US') + ' KB',
  /* What is being held, and by what. A number on its own -- "4102 KB" -- tells
     nobody which of the things the app keeps is the one filling the browser. */
  usage: () => {
    const groups = {}; let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (!k) continue;
        const n = ((localStorage.getItem(k) || '').length + k.length) * 2;
        total += n;
        const name = k.indexOf('shic:ce_cache:') === 0 ? 'cached CEs'
          : k.indexOf('shic:draft') === 0 ? 'unsaved drafts'
          : k.indexOf('shic:my_sig') === 0 ? 'signatures'
          : k.indexOf('shic:refdata:') === 0 ? 'reference data'
          : k === 'shic:history' || k === 'shic:local_history' || k === 'shic:od_history' ? 'the CE list'
          : k === 'shic:masterlist' || k === 'shic:ml_trash' ? 'the masterlist'
          : k === 'shic:auditlog' ? 'the audit log'
          : 'other settings';
        groups[name] = (groups[name] || 0) + n;
      }
    } catch (_e) {}
    const top = Object.keys(groups).sort((a, b) => groups[b] - groups[a])[0] || 'other settings';
    return { total, groups, top: { name: top, bytes: groups[top] || 0 } };
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
/* True when the last dbGetUsers could not read SharePoint and fell back to the
   handful of accounts cached on this machine. The login screen needs to tell
   those apart: an unread user list looks identical to "no such account", and
   reporting "Account not found" to someone whose account plainly exists sends
   them hunting for the wrong problem. */
let _userListStale=false;
/* Separate from stale-because-offline. A refusal never fixes itself: the person
   keeps working against a local copy that drifts further from SharePoint every
   day, and nothing on screen says why. This is what "accounts do not sync until
   you make them an admin" looks like from the inside. */
let _userListDenied=false;
function userListIsStale(){return _userListStale;}
function userListDenied(){return _userListDenied;}
async function dbGetUsers(){if(USE_SP||getSiteURL()){try{const r=await spGet(spList('Users'),'','Id,Title,shicName,shicHash,shicRole,shicStatus,shicEmail,Created');_userListStale=false;_userListDenied=false;return r.filter(u=>u&&u.Title).map(u=>({id:u.Id,username:u.Title,name:u.shicName||'',hash:u.shicHash||'',role:u.shicRole||'user',status:u.shicStatus||'pending',email:u.shicEmail||'',createdAt:u.Created}));}catch(e){console.warn('dbGetUsers:',e.message);_userListStale=true;_userListDenied=spDenied(e);if(_userListDenied){try{window.dispatchEvent(new CustomEvent('shic-sp-denied',{detail:{list:spList('Users'),op:'read'}}));}catch(_e){}}}}else{_userListStale=false;_userListDenied=false;}return(LS.get('users')||[]).filter(u=>u&&u.username);}

/* Which lists this signed-in account can actually read and write.
   Every call the app makes runs on the user's own delegated token -- there is
   no service identity -- so "it works for me" tells you nothing about whether
   it works for them. This answers that per list, per person. The write probe
   creates one row and deletes it again; on a list where the account can create
   but not delete, the row is left behind and named in the result rather than
   hidden. */
const SP_PROBE_LISTS=[['Users','the sign-in list — everyone needs this'],
  ['CEs','saving a CE'],['CE_MP','manpower rows'],['CE_Resources','tools / consumables / PPE rows'],
  ['Monitoring','the CE Monitoring tab'],['Drafts','shared drafts'],['AuditLog','the audit trail'],
  ['Masterlist','rates'],['SowLib','the Scope Library'],['Companies','issuing companies'],
  ['ML_Imports','document analysis']];
async function spCheckAccess(onProgress){
  const out=[];
  for(let i=0;i<SP_PROBE_LISTS.length;i++){
    const [key,why]=SP_PROBE_LISTS[i];
    const name=spList(key);
    const row={list:name,why,read:'?',write:'?',note:'',leftover:0};
    onProgress&&onProgress({name,i,total:SP_PROBE_LISTS.length});
    try{await spGet(name,'','Id');row.read='yes';}
    catch(e){row.read=spDenied(e)?'DENIED':'error';row.note=String(e.message||e).slice(0,120);}
    if(row.read==='yes'){
      let created=null;
      try{created=await spPost(name,{Title:'__shic_access_probe__'});row.write='yes';}
      catch(e){row.write=spDenied(e)?'DENIED':'error';if(!row.note)row.note=String(e.message||e).slice(0,120);}
      if(created&&created.Id!==undefined){
        try{await spDelete(name,created.Id);}
        catch(_e){row.leftover=created.Id;row.note='probe row '+created.Id+' could not be deleted — this account can add but not remove rows';}
      }
    }
    out.push(row);
  }
  return out;
}
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
/* The owner role moves by dbTransferOwnership / dbClaimOwnership alone, which
   validate first and then set `_ownership`. Any other code path that writes
   `role:'owner'`, or strips it off the current owner, is a bug -- that is
   exactly how LocalToSPSync came to PATCH shicRole from an editable local
   cache and hand the owner role back to whoever held it in that browser.

   This is a guard against wrong code, NOT a security boundary: the console can
   pass `_ownership` as easily as the real callers can. The boundary is
   SharePoint's Users list permissions, as the ownership block below says. */
async function dbUpdateUser(id,data,opts){
  if(data&&data.role!==undefined&&!(opts&&opts._ownership)){
    if(isOwnerRole(data.role))
      throw new Error('dbUpdateUser: the owner role is granted by transfer only. Use dbTransferOwnership or dbClaimOwnership.');
    const known=(()=>{try{return LS.get('users')||[];}catch(_){return [];}})();
    const target=known.find(u=>u&&u.id===id);
    if(target&&isOwnerRole(target.role))
      throw new Error('dbUpdateUser: the owner cannot be demoted directly. Transfer ownership instead.');
  }
  const mirror=()=>{try{const cur=LS.get('users')||[];if(cur.some(u=>u.id===id))LS.set('users',cur.map(u=>u.id===id?{...u,...data}:u));}catch(_){}};
  if(USE_SP||getSiteURL()){
    /* Every editable field must be mapped. shicEmail was missing, so editing a
       user's email patched nothing and silently reported success — the change
       appeared locally, vanished on the next SharePoint read, and never
       reached anyone else. */
    const sp={};if(data.status!==undefined)sp.shicStatus=data.status;if(data.role!==undefined)sp.shicRole=data.role;if(data.hash!==undefined)sp.shicHash=data.hash;if(data.name!==undefined)sp.shicName=data.name;if(data.email!==undefined)sp.shicEmail=data.email;
    /* A patch that maps to nothing is a silent no-op; say so rather than
       reporting a success that changed nothing. */
    if(!Object.keys(sp).length)throw new Error('dbUpdateUser: no updatable field in '+JSON.stringify(Object.keys(data)));
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
/* EVERY CE number in use, whoever saved it.
   =========================================
   dbGetHistory filters a non-admin to `shicSavedBy eq '<user>'`, which is
   right for the CE list -- an estimator's work is their own -- and wrong for
   picking the next number. Allocating from a list that cannot see other
   people's CEs hands the same number to two estimators on the same prefix,
   and neither finds out until one of them has finished the estimate and the
   save is refused.

   Titles only, and no user filter. A CE number is an identifier, not content:
   dbFindCEByNum already reads other users' Titles to catch exactly this
   collision, so nothing new is exposed here. */
async function dbGetCeNumbers(){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('CEs'),'','Title');
      return (r||[]).map(x=>String(x.Title||'')).filter(Boolean);
    }catch(e){ console.warn('dbGetCeNumbers:',e.message); }
  }
  /* Offline, the local cache is all there is. It holds only what this browser
     has seen, so the number may still collide -- the check on save is what
     catches that, and it is the reason that check exists. */
  try{ return (LS.get('history')||[]).map(h=>String((h.info&&h.info.ceNum)||h.ceNum||'')).filter(Boolean); }
  catch(_e){ return []; }
}
/* Another company's CE already holding this sequence number (SHIC vs SY3).
   The same prefix is not a clash here -- that is the CE itself or its
   revision, which dbFindCEByNum and Revise already handle. */
async function dbFindCESeqClash(ceNum,known){
  const me=ceSeqOf(ceNum);if(!me)return null;
  const other=t=>{const s=ceSeqOf(t);return !!s&&s.seq===me.seq&&s.prefix!==me.prefix;};
  if(USE_SP||getSiteURL()){
    try{
      const tail='-CE-'+me.seq;
      const r=await spGet(spList('CEs'),"substringof('"+tail+"',Title)",'Id,Title,shicSavedBy,shicSavedAt');
      const hit=(r||[]).find(x=>other(x.Title));
      if(hit)return{id:hit.Id,ceNum:hit.Title,savedBy:hit.shicSavedBy||'',savedAt:hit.shicSavedAt||''};
    }catch(e){console.warn('dbFindCESeqClash:',e.message);}
  }
  const loc=[...(known||[]),...(LS.get('history')||[]).map(h=>(h.info&&h.info.ceNum)||h.ceNum)].find(other);
  return loc?{ceNum:loc,savedBy:'',savedAt:''}:null;
}
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
/* keep(id): a CE someone else saved that is still this user's to see -- a request assigned to them or received by them. Without it a non-admin only ever got their own saves, so an assigned request never reached the estimator. */
async function dbGetHistory(username,isAdmin,keep){if(USE_SP||getSiteURL()){try{const f=(isAdmin||keep)?"":`shicSavedBy eq '${username}'`;const r=await spGet(spList('CEs'),f,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt');return r.map(h=>({id:h.Id,ceNum:h.Title,ceType:h.shicType,client:h.shicClient||'',grand:h.shicTotal||0,savedBy:h.shicSavedBy||'',savedAt:h.shicSavedAt||h.Created,info:{ceNum:h.Title,client:h.shicClient||'',description:h.shicDesc||''}})).filter(h=>isAdmin||h.savedBy===username||(keep&&keep(h.id)));}catch(e){console.warn('dbGetHistory:',e.message);}}const all=LS.get('history')||[];return isAdmin?all:all.filter(h=>h.savedBy===username||(keep&&keep(h.id)));}
/* A consolidated crew row carries `shares` -- what each scope task originally
   asked for -- so the SOW Breakdown can split the merged cost back across the
   tasks the crew actually serves. Every other row field has its own column, but
   shares is a variable-length list, so it rides as JSON in one Note column.

   It cannot live in the CE header blob instead: dbLoadCE regenerates row ids as
   'sp'+Id, so anything keyed by row id would not match after a reload. It has to
   travel WITH the row.

   Without this the field was written to state by "Consolidate crew" / "Combine"
   and then dropped on save. The grand total was unaffected, so nothing looked
   wrong -- but on reload the surviving taskId took 100% of the merged cost and
   every other task the crew served showed no manpower at all. */
/* Line items are inserted five at a time in parallel, so SharePoint can
   number them out of order and a reloaded CE came back with rows swapped --
   and with ids ('sp'+Id) that no callout could point at. The header keeps each
   row's id and a signature of what was written, in order; the loader matches
   rows back to it. Identical rows are interchangeable, so a signature match is
   exact. A CE saved before this has no list and keeps SharePoint order. */
const _rowSig=(r)=>[r.shicTab||'',r.shicRole||'',r.shicDesc||'',r.shicShift||'',r.shicUOM||'',Number(r.shicRate)||0,Number(r.shicCost)||0,Number(r.shicQty)||0,Number(r.shicPax)||0,Number(r.shicDays)||0,r.shicTaskId||''].join('|');
function _rowKeysOf(e){
  const mp=(e.mp||[]).filter(r=>r.role).map(r=>[r.id,_rowSig({shicRole:r.role,shicRate:r.rate||0,shicShift:r.shift||'regular_day',shicDays:r.days||1,shicPax:r.pax||1,shicTaskId:r.taskId||''})]);
  const res=(tab,list,days)=>(list||[]).filter(r=>r.desc).map(r=>[r.id,_rowSig({shicTab:tab,shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0,shicDays:days?(r.days||1):0,shicTaskId:r.taskId||''})]);
  return {mp,tools:res('tools',e.tools,true),mats:res('mats',e.mats),ppe:res('ppe',e.ppe)};
}
let _rowOrphans=0,_rowDrop=false,_rowMissing=0;
function _rowOrder(rows,keys){
  if(!Array.isArray(keys)||!keys.length)return rows.map(r=>({r,id:null}));
  const pool=rows.slice(),out=[];
  keys.forEach(([id,sig])=>{const i=pool.findIndex(r=>_rowSig(r)===sig);if(i>=0)out.push({r:pool.splice(i,1)[0],id});});
  /* Every row the last save wrote was found, so anything left over is an
     orphan: a row an earlier save failed to delete. Counting it multiplied the
     CE -- one SY3 CE saved at P745,593 opened at P2,075,492. The next save
     removes them for good. If some keyed row is missing, the save itself was
     interrupted and nothing is dropped. */
  if(out.length<keys.length)_rowMissing+=keys.length-out.length;
  if(out.length===keys.length&&pool.length){_rowOrphans+=pool.length;if(_rowDrop)return out;}
  return out.concat(pool.map(r=>({r,id:null})));
}
const _shDump=v=>Array.isArray(v)&&v.length?JSON.stringify(v):'';
const _shParse=s=>{try{const v=s?JSON.parse(s):null;return Array.isArray(v)?v:[];}catch(_){return [];}};
/* SharePoint answers a $select naming a column the site has not got with a 500,
   not a 400 -- and that 500 took the whole CE down with it. dbLoadCE fell
   through to the local archive, which holds nothing for a CE saved on another
   machine, so the estimate opened blank at a grand total of P0.00 with only a
   console warning to say why. Saving from there would have written that blank
   back over the real CE, deleting every line item.

   Every column added after the first release is optional for READING: a CE
   written before it existed has nothing in it anyway. So drop them and ask
   again. The CE opens, minus whatever those columns carried, and the user is
   told once what to run to get them back. */
const _SP_OPTIONAL_COLS = ['shicShares','shicTaskId','shicPax','shicOTHours','shicPerDiem','shicInfo','shicTier','shicHours','shicKW','shicRunHrs','shicSrc'];
let _spSchemaGapWarned = false;
async function _spGetTolerant(list, filter, sel){
  try{ return await spGet(list, filter, sel); }
  catch(err){
    const kept = String(sel).split(',').filter(c => _SP_OPTIONAL_COLS.indexOf(c) < 0).join(',');
    /* Nothing optional in this query, so the failure is real -- do not mask it. */
    if(kept === sel) throw err;
    const rows = await spGet(list, filter, kept);
    console.warn('SP get ' + list + ': retried without ' + _SP_OPTIONAL_COLS.filter(c => sel.indexOf(c) >= 0).join(', ') + ' — the site is missing those columns.');
    if(!_spSchemaGapWarned){
      _spSchemaGapWarned = true;
      setTimeout(()=>(window._shicToast||console.warn)('This SharePoint site is missing columns this version uses, so parts of older CEs cannot be read. An admin should open SP Setup and press "Repair lists & columns".', true), 300);
    }
    return rows;
  }
}
/* Reading a per-CE list that has outgrown its index.

   Above 5,000 items SharePoint refuses a $filter on a non-indexed column, but
   an UNFILTERED paged read is always allowed -- that is how a large list is
   meant to be walked. So walk it once, group the rows by shicCEId and keep
   that for the session: the first CE opened pays a handful of requests, every
   one after it is free.

   This is a fallback, not the fix. The fix is the index, which SP Setup >
   "Repair lists & columns" now creates. This exists so a site that has not
   been repaired -- or a tenant that will not index a list already past the
   threshold -- can still open its CEs instead of showing 500s. */
const _spBigListCache = {};
/* Any write to these lists makes the grouped snapshot wrong. Dropping it is
   cheap -- it is rebuilt on the next read that needs it -- and keeping a stale
   one is not: a save would miss the rows it had just inserted and leave the
   old ones behind as duplicates. */
function _spInvalidateBigList(){ for(const k of Object.keys(_spBigListCache)) delete _spBigListCache[k]; }
async function _spGetByCE(list, ceId, sel){
  /* Once a list is known to be past the threshold, do not keep trying the
     filter that cannot work -- that is a failing round-trip per CE opened. The
     snapshot is dropped on every write, so this never serves stale rows. */
  if(_spBigListCache[list]) return _spBigListCache[list].get(String(ceId)) || [];
  try{ return await _spGetTolerant(list, `shicCEId eq ${ceId}`, sel); }
  catch(err){
    if(!/view threshold/i.test(err.message||'')) throw err;
    if(!_spBigListCache[list]){
      setTimeout(()=>(window._shicToast||console.warn)('Reading all of ' + list + ' once — it is past the SharePoint 5,000-item limit and shicCEId is not indexed, so CEs cannot be fetched one at a time. Run SP Setup > "Repair lists & columns" to make this fast again.', true), 100);
      /* shicCEId is not in the caller's $select -- the filter used to supply
         it -- and without it there is nothing to group on. */
      const all = await _spGetTolerant(list, null, sel.indexOf('shicCEId') < 0 ? sel + ',shicCEId' : sel);
      const byCE = new Map();
      for(const r of all){
        const k = String(r.shicCEId);
        if(!byCE.has(k)) byCE.set(k, []);
        byCE.get(k).push(r);
      }
      console.info('Read ' + all.length + ' rows from ' + list + ' across ' + byCE.size + ' CEs (threshold fallback).');
      _spBigListCache[list] = byCE;
    }
    return _spBigListCache[list].get(String(ceId)) || [];
  }
}
/* One CE, assembled from its header row and its line-item rows.
   Shared by dbLoadCE and the offline prefetch: a second copy of this would
   drift, and the two would then disagree about what a CE contains. */
/* Every CE, into the offline archive.

   The list in Monitoring is cached, but the CEs behind it are not: only ones
   saved from this browser were ever stored, so the CE you had not opened yet
   was exactly the one unavailable offline.

   Fetched one at a time this would be two requests per CE -- around 1,800 on a
   site this size. Instead read the three lists once each, paged, and group the
   rows by CE id: a handful of requests for the whole archive. Every read is
   unfiltered, so it also works above the view threshold.

   Incremental: a CE already stored with the same savedAt is left alone, so a
   second run costs the three reads and no writes. */
async function dbCacheAllCEs(progressCb){
  if(!(USE_SP||getSiteURL()))throw new Error('This needs a SharePoint connection.');
  const step=(msg,p)=>{try{progressCb&&progressCb({msg:msg,progress:p});}catch(_){}};
  step('Reading CE headers...',0.05);
  const heads=await _spGetTolerant(spList('CEs'),null,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt,shicScope,shicNotes,shicApprovers,shicMob,shicDemob,shicMisc,shicSOW,shicInfo');
  step('Reading manpower rows...',0.3);
  const mpRows=await _spGetTolerant(spList('CE_MP'),null,'Id,shicCEId,shicRole,shicRate,shicShift,shicDays,shicQty,shicPax,shicOTHours,shicPerDiem,shicTaskId,shicShares');
  step('Reading resource rows...',0.55);
  const resRows=await _spGetTolerant(spList('CE_Resources'),null,'Id,shicCEId,shicTab,shicDesc,shicQty,shicUOM,shicCost,shicDays,shicTaskId,shicShares,shicTier,shicHours,shicKW,shicRunHrs,shicSrc');
  const byCE=(rows)=>{const m=new Map();for(const r of rows){const k=String(r.shicCEId);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;};
  const mpBy=byCE(mpRows),resBy=byCE(resRows);
  step('Checking what is already stored...',0.75);
  const have=new Map();
  try{for(const r of await ceAll()) have.set(String(r.ceNum||'').toUpperCase(),r.savedAt||'');}catch(_){}
  const out=[];let skipped=0;
  for(const h of heads){
    const num=String(h.Title||'').toUpperCase();
    if(num&&have.has(num)&&have.get(num)===(h.shicSavedAt||'')){skipped++;continue;}
    const ce=_assembleCE(h,mpBy.get(String(h.Id))||[],resBy.get(String(h.Id))||[]);
    out.push({...ce,ceNum:ce.info.ceNum,savedAt:ce.savedAt||'',savedBy:ce.savedBy||'',_syncState:'synced'});
  }
  step('Storing '+out.length+' CE(s) offline...',0.9);
  let stored=0;
  /* In batches: one transaction holding 900 full CEs is a long write, and a
     failure part-way through would lose the lot. */
  for(let i=0;i<out.length;i+=100){
    stored+=await ceBulkPut(out.slice(i,i+100));
    step('Storing '+stored+'/'+out.length+'...',0.9+0.1*(stored/Math.max(1,out.length)));
  }
  return{total:heads.length,stored:stored,skipped:skipped,
         rows:mpRows.length+resRows.length};
}
function _assembleCE(h,mR,rR){let _rk={};try{_rk=(h.shicMisc?JSON.parse(h.shicMisc):{})._rowKeys||{};}catch(_){}const _ord=(rows,k)=>_rowOrder(rows,_rk[k]).map(({r,id})=>{r._rid=id;return r;});mR=_ord(mR,'mp');rR=[..._ord(rR.filter(r=>r.shicTab==='tools'),'tools'),..._ord(rR.filter(r=>r.shicTab==='mats'),'mats'),..._ord(rR.filter(r=>r.shicTab==='ppe'),'ppe'),...rR.filter(r=>!['tools','mats','ppe'].includes(r.shicTab))];return {id:h.Id,ceType:h.shicType||'onsite',grand:h.shicTotal||0,savedBy:h.shicSavedBy||'',savedAt:h.shicSavedAt||'',info:(()=>{let base={};try{if(h.shicInfo)base=JSON.parse(h.shicInfo)||{};}catch(_){}/* The dedicated columns win for the three fields that also exist as columns: Title is what duplicate detection and every filter match on, so the JSON must never be able to disagree with it. A CE saved before shicInfo existed has no JSON and falls back to exactly what it had. */return{...base,ceNum:h.Title,client:h.shicClient||base.client||'',description:h.shicDesc||base.description||''};})(),scope:h.shicScope||'',mp:mR.map(r=>({id:r._rid||'sp'+r.Id,role:r.shicRole||'',rate:r.shicRate||0,shift:r.shicShift||'regular_day',days:r.shicDays||1,/* pax, not qty: the editor and every cost formula read `pax`, so a row loaded as `qty` costed 0. shicQty is the fallback for rows written before shicPax existed. */pax:r.shicPax||r.shicQty||1,otHours:r.shicOTHours||0,perDiem:r.shicPerDiem||0,taskId:r.shicTaskId||'',shares:_shParse(r.shicShares)})),tools:rR.filter(r=>r.shicTab==='tools').map(r=>({id:r._rid||'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0,days:r.shicDays||1,taskId:r.shicTaskId||'',shares:_shParse(r.shicShares),/* No tier stored means the row predates tiers, which is Tier 2 -- the pricing it was quoted at. */tier:r.shicTier||2,hours:r.shicHours||0,kw:r.shicKW||0,runHrs:r.shicRunHrs||0,..._srcParse(r.shicSrc)})),mats:rR.filter(r=>r.shicTab==='mats').map(r=>({id:r._rid||'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0,taskId:r.shicTaskId||'',shares:_shParse(r.shicShares)})),ppe:rR.filter(r=>r.shicTab==='ppe').map(r=>({id:r._rid||'sp'+r.Id,desc:r.shicDesc||'',qty:r.shicQty||1,uom:r.shicUOM||'Lot',cost:r.shicCost||0,taskId:r.shicTaskId||'',shares:_shParse(r.shicShares)})),misc:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};/* _verifyNotes joins _addlCosts and _margin as a reserved key. Left in, it would come back as a miscellaneous cost group named '_verifyNotes'. */const{_addlCosts,_margin,_verifyNotes,_rates,_docRef,_rowKeys,_signatures,...rest}=m;return rest;})(),verifyNotes:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._verifyNotes||{};})(),rates:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._rates||{};})(),docRef:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._docRef||null;})(),signatures:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._signatures||{};})(),addlCosts:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._addlCosts||[];})(),margin:(()=>{const m=h.shicMisc?JSON.parse(h.shicMisc):{};return m._margin||0;})(),sowItems:(()=>{try{return h.shicSOW?JSON.parse(h.shicSOW):[];}catch(_){return [];}})(),notes:h.shicNotes?JSON.parse(h.shicNotes):[],approvers:h.shicApprovers?JSON.parse(h.shicApprovers):[],mobVehicles:h.shicMob?JSON.parse(h.shicMob):[],demobVehicles:h.shicDemob?JSON.parse(h.shicDemob):[]};}
async function dbLoadCE(id){
  /* Offline (or SharePoint unreachable) this returned null and the CE simply
     would not open. The IndexedDB archive holds the full record -- line items
     and all -- so serve it instead. SharePoint stays authoritative when online. */
  if(!(USE_SP||getSiteURL()))return await _ceLoadLocal(id);
  try{const[hR,mR,rR]=await Promise.all([_spGetTolerant(spList('CEs'),`Id eq ${id}`,'Id,Title,shicType,shicClient,shicDesc,shicTotal,shicSavedBy,shicSavedAt,shicScope,shicNotes,shicApprovers,shicMob,shicDemob,shicMisc,shicSOW,shicInfo'),_spGetByCE(spList('CE_MP'),id,'Id,shicRole,shicRate,shicShift,shicDays,shicQty,shicPax,shicOTHours,shicPerDiem,shicTaskId,shicShares'),_spGetByCE(spList('CE_Resources'),id,'Id,shicTab,shicDesc,shicQty,shicUOM,shicCost,shicDays,shicTaskId,shicShares,shicTier,shicHours,shicKW,shicRunHrs,shicSrc')]);if(!hR.length)return null;const h=hR[0];/* Rows outside the last save's row keys are either leftovers an earlier save
   failed to delete, or real rows the keys do not describe. Only the saved
   total can tell which: build the CE both ways and keep the one that matches
   it. If neither does, nothing is dropped and the figures are reported. */
_rowOrphans=0;_rowDrop=false;_rowMissing=0;let _ce=_assembleCE(h,mR,rR);const _extra=_rowOrphans,_missing=_rowMissing;
/* An interrupted save: the header (and its total) reached SharePoint but some
   of its lines did not. The saving browser kept the whole CE locally, so if
   this is that browser, open that copy instead of the partial one. */
let _partial=false;
if(_missing&&typeof computeCEGrand==='function'){
  const _tgt=Number(h.shicTotal)||0,_num=String(_ce.info.ceNum||'').trim().toUpperCase();
  let _loc=null;try{_loc=(await ceAll()).filter(r=>r&&String((r.info&&r.info.ceNum)||r.ceNum||'').trim().toUpperCase()===_num)
    .find(r=>Math.abs(computeCEGrand(r)-_tgt)<=Math.max(1,_tgt*0.001));}catch(_){}
  if(_loc){_ce={..._loc,id:h.Id};setTimeout(()=>(window._shicToast||console.warn)(_ce.info.ceNum+': only part of its last save reached SharePoint. Opened the complete copy kept in this browser — SAVE it now to upload the missing lines.',true),800);}
  else{_partial=true;_ce._partial=true;_ce._missingRows=_missing;setTimeout(()=>(window._shicToast||console.warn)(_ce.info.ceNum+': its last save was interrupted — '+_missing+' line(s) never reached SharePoint, so it adds up to less than its saved total. Do not save it from here. The complete copy is in the browser of '+(h.shicSavedBy||'whoever saved it')+': they should open the app and run Push All Local Data (Users tab).',true),800);}
  }
if(_extra&&typeof computeCEGrand==='function'){
  _rowDrop=true;const _slim=_assembleCE(h,mR,rR);_rowDrop=false;
  const _tgt=Number(h.shicTotal)||0,_gAll=computeCEGrand(_ce),_gSlim=computeCEGrand(_slim);
  const _near=(x)=>Math.abs(x-_tgt)<=Math.max(1,_tgt*0.001);
  const _pf=v=>'P'+Math.round(v).toLocaleString();
  if(_near(_gSlim)&&!_near(_gAll)){_ce=_slim;setTimeout(()=>(window._shicToast||console.warn)(_ce.info.ceNum+': ignored '+_extra+' leftover line(s) from an earlier save (with them it came to '+_pf(_gAll)+'). Save the CE once to clean them up.',true),800);}
  else if(!_near(_gAll))setTimeout(()=>(window._shicToast||console.warn)(_ce.info.ceNum+' does not add up to its saved total '+_pf(_tgt)+': all '+(mR.length+rR.length)+' lines give '+_pf(_gAll)+', the '+(mR.length+rR.length-_extra)+' from the last save give '+_pf(_gSlim)+'. Nothing was dropped — check it before saving, and send this message to TSG.',true),800);
  }

/* Keep what was just fetched. Without this, opening a colleague's CE online
   left nothing behind, and the same CE would not open offline an hour later. */
/* Not a partial one: it would overwrite the complete local copy of the
   browser that saved it, the only place the missing lines still exist. */
if(!_partial&&!_missing)try{await cePut({..._ce,ceNum:_ce.info.ceNum,savedAt:_ce.savedAt||new Date().toISOString(),savedBy:_ce.savedBy||'',_syncState:'synced'});}catch(_){}
return _ce;}catch(e){console.warn('dbLoadCE:',e.message);return await _ceLoadLocal(id);}}
/* Full CE from the offline archive, by SharePoint item Id. */
async function _ceLoadLocal(id){
  try{
    const all=await ceAll();
    const hit=all.find(r=>r.id===id);
    if(hit)return hit;
  }catch(e){console.warn('_ceLoadLocal:',e.message);}
  return null;
}
let _spFailReason='';
/* Which CEs have a header but no line items behind it.

   dbSaveHistory POSTs the header before the rows, so anything failing in
   between leaves a CE with a stored total and nothing under it: it reads
   normally in Monitoring and opens empty. A whole import can land this way
   without saying so.

   Checked one CE at a time this would be two requests each -- around 1,800 for
   a site this size. Instead read the two line-item lists once, unfiltered, and
   keep only which CE ids appear. That is a handful of requests for the whole
   site, and it works above the view threshold, which a filtered check would
   not. */
async function dbFindHeaderOnlyCEs(progressCb){
  if(!(USE_SP||getSiteURL()))throw new Error('This needs a SharePoint connection.');
  const seen=new Set();
  const lists=[spList('CE_MP'),spList('CE_Resources')];
  for(let i=0;i<lists.length;i++){
    progressCb&&progressCb({msg:'Reading '+lists[i]+'...',progress:i/(lists.length+1)});
    const rows=await spGet(lists[i],null,'Id,shicCEId');
    for(const r of rows)seen.add(String(r.shicCEId));
  }
  progressCb&&progressCb({msg:'Reading CE headers...',progress:lists.length/(lists.length+1)});
  const heads=await spGet(spList('CEs'),null,'Id,Title,shicTotal,shicSavedBy,shicSavedAt');
  /* A CE with a total of zero is not evidence of anything -- a tracking stub
     imported from the monitoring spreadsheet has no rows by design. */
  return heads
    .filter(h=>Number(h.shicTotal||0)>0&&!seen.has(String(h.Id)))
    .map(h=>({id:h.Id,ceNum:h.Title||('#'+h.Id),total:Number(h.shicTotal||0),savedBy:h.shicSavedBy||'',savedAt:h.shicSavedAt||''}))
    .sort((a,b)=>b.total-a.total);
}
async function dbSaveHistory(e){_spFailReason='';if(USE_SP||getSiteURL()){try{const existing=await spGet(spList('CEs'),`Title eq '${(e.info.ceNum||'').replace(/'/g,"''")}'`,'Id');const hdr={Title:e.info.ceNum,shicType:e.ceType,shicClient:e.info.client||'',shicDesc:e.info.description||'',shicTotal:Math.round((e.grand||0)*100)/100,shicSavedBy:e.savedBy||'',shicSavedAt:new Date().toISOString(),shicScope:e.scope||'',shicNotes:JSON.stringify(e.notes||[]),shicApprovers:JSON.stringify(e.approvers||[]),shicMob:JSON.stringify(e.mobVehicles||[]),shicDemob:JSON.stringify(e.demobVehicles||[]),shicMisc:JSON.stringify({...(e.misc||{}), _addlCosts:(e.addlCosts||[]), _margin:(e.margin||0), _verifyNotes:(e.verifyNotes||{}), _rates:(e.rates||{}), _docRef:(e.docRef||null), _rowKeys:_rowKeysOf(e), _signatures:(e.signatures||{})}),shicSOW:JSON.stringify(e.sowItems||[]),/* The whole info object. Only client and description had columns, so date, location, discipline, department, status, material, QUANTITY, DAYS, attention, end user and the issuing company never reached SharePoint at all -- they lived in the saving browser's cache and nowhere else. Anyone else opening the CE got BLANK_INFO defaults: today's date, qty 1, status DRAFT, discipline Electrical. Saving from there wrote those defaults back as if they were real. One JSON column carries the lot, and new fields ride along without another migration. */shicInfo:JSON.stringify(e.info||{})};let ceId;if(existing.length){ceId=existing[0].Id;await spWithRetry(()=>spPatch(spList('CEs'),ceId,hdr));}else{const r=await spWithRetry(()=>spPost(spList('CEs'),hdr));ceId=r.Id;/* Race-condition guard: if two users POSTed simultaneously, keep the lowest Id and delete the duplicate */const dupes=await spGet(spList('CEs'),`Title eq '${(e.info.ceNum||'').replace(/'/g,"''")}'`,'Id,shicSavedBy');if(dupes.length>1){dupes.sort((a,b)=>a.Id-b.Id);const winner=dupes[0];if(winner.Id!==ceId){/* We lost the race — our row is the duplicate. Delete it, preserve our data locally, and surface a clear error to the user so they can save under a different CE number. The winner row is left completely untouched. */await spDelete(spList('CEs'),ceId).catch(()=>{});const _savedAt=new Date().toISOString();try{const h=LS.get('history')||[];LS.set('history',[{...e,id:Date.now(),savedAt:_savedAt,_raceConflict:true},...h.filter(x=>(x.info?.ceNum||x.ceNum)!==e.info.ceNum)]);LS.set('ce_cache:'+e.info.ceNum,{...e,id:Date.now(),savedAt:_savedAt});}catch(_){}/* 'local': we LOST the race and deleted our own SharePoint row, so this browser holds the only copy of the user's work. Nothing may ever delete a 'local' record. */try{await cePut({...e,ceNum:e.info.ceNum,savedAt:_savedAt,savedBy:e.savedBy||'',_syncState:'local',_raceConflict:true});}catch(_){}throw new Error(`CE number "${e.info.ceNum}" was saved by "${winner.shicSavedBy||'another user'}" at the same time. Your data has been kept in this browser — load the local draft and save again with a different CE number.`);}else{for(const dup of dupes.slice(1))await spDelete(spList('CEs'),dup.Id).catch(()=>{});}}}/* Fresh, not the big-list snapshot: rows another browser added since it was
   taken would be missed here, never deleted, and counted on every load. */_spInvalidateBigList();const[om,or]=await Promise.all([_spGetByCE(spList('CE_MP'),ceId,'Id'),_spGetByCE(spList('CE_Resources'),ceId,'Id')]);/* Insert new rows FIRST — if any insert fails the old rows are still intact */const mpPayloads=(e.mp||[]).filter(r=>r.role).map(r=>({shicCEId:ceId,shicRole:r.role,shicRate:r.rate||0,shicShift:r.shift||'regular_day',shicDays:r.days||1,shicPax:r.pax||1,shicOTHours:r.otHours||0,shicPerDiem:r.perDiem||0,shicTaskId:r.taskId||'',shicShares:_shDump(r.shares)}));const resPayloads=[...(e.tools||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'tools',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0,shicDays:r.days||1,shicTaskId:r.taskId||'',shicShares:_shDump(r.shares),/* Tier 2 is the default and what every existing row already is, so it is written as 0 rather than 2: an unrepaired site rejects the column, and a row that never names a tier must still cost what it always did. */shicTier:r.tier||0,shicHours:r.hours||0,shicKW:r.kw||0,shicRunHrs:r.runHrs||0,shicSrc:_srcDump(r)})),...(e.mats||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'mats',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0,shicTaskId:r.taskId||'',shicShares:_shDump(r.shares)})),...(e.ppe||[]).filter(r=>r.desc).map(r=>({shicCEId:ceId,shicTab:'ppe',shicDesc:r.desc,shicQty:r.qty||1,shicUOM:r.uom||'Lot',shicCost:r.cost||0,shicTaskId:r.taskId||'',shicShares:_shDump(r.shares)}))];const insFns=[...mpPayloads.map(p=>()=>spWithRetry(()=>spPost(spList('CE_MP'),p))),...resPayloads.map(p=>()=>spWithRetry(()=>spPost(spList('CE_Resources'),p)))];let spErr=null;for(let i=0;i<insFns.length;i+=5){try{await Promise.all(insFns.slice(i,i+5).map(fn=>fn()));}catch(batchErr){spErr=batchErr;console.error('dbSaveHistory batch insert failed:',batchErr.message);break;}}if(spErr)throw spErr;/* Only delete OLD rows after new ones safely written */const dels=[...om.map(x=>()=>spDelete(spList('CE_MP'),x.Id)),...or.map(x=>()=>spDelete(spList('CE_Resources'),x.Id))];let _delFail=0;for(let i=0;i<dels.length;i+=5)await Promise.all(dels.slice(i,i+5).map(fn=>fn().catch(()=>{_delFail++;})));if(_delFail)setTimeout(()=>(window._shicToast||console.warn)(_delFail+' old line(s) of '+e.info.ceNum+' could not be removed from SharePoint. They are ignored when the CE opens; save it again to clear them.',true),1200);_spInvalidateBigList();try{LS.set('ce_cache:'+e.info.ceNum,{...e,id:ceId,savedAt:hdr.shicSavedAt});}catch(_){}/* Write through to IndexedDB alongside the localStorage cache. 'synced' -- SharePoint accepted it, so the migration may safely treat the two copies as agreeing. */try{await cePut({...e,ceNum:e.info.ceNum,id:ceId,savedAt:hdr.shicSavedAt,savedBy:e.savedBy||'',_syncState:'synced'});}catch(_){}return{sp:true,id:ceId};}catch(e2){const msg=e2.message||String(e2);_spFailReason=msg;console.warn('dbSaveHistory SP error:',msg);/* A 400 InvalidClientQueryException on an insert almost always means the
   site is missing a column this version writes -- exactly what happened when
   shicPax/shicOTHours/shicPerDiem shipped without being added to the
   provisioning list. The raw SharePoint JSON tells the user nothing they can
   act on, and the fix is one button, so name it. */
const schemaGap=/InvalidClientQueryException|does not exist on this list|Column .* does not exist/i.test(msg);
setTimeout(()=>(window._shicToast||console.warn)(schemaGap
  ?'SharePoint is missing columns this version needs, so the CE was stored in this browser only. An admin should open SP Setup and press "Repair lists & columns", then save again.'
  :'SharePoint save failed ('+msg.slice(0,80)+') — CE stored locally.',true),100);}}const h=LS.get('history')||[];const _eid=Date.now();const _savedAt=new Date().toISOString();LS.set('history',[{...e,id:_eid,savedAt:_savedAt},...h.filter(x=>(x.info?.ceNum||x.ceNum)!==e.info.ceNum)]);try{LS.set('ce_cache:'+e.info.ceNum,{...e,id:_eid,savedAt:_savedAt});}catch(_){}/* 'local': saved offline or after a SharePoint failure. Not yet uploaded. */try{await cePut({...e,ceNum:e.info.ceNum,id:_eid,savedAt:_savedAt,savedBy:e.savedBy||'',_syncState:'local'});}catch(_){}
  /* Callers could not tell a SharePoint save from a browser-only one: the
     SharePoint failure is swallowed on purpose, so work is never lost offline,
     and then this returned exactly as if it had succeeded. A bulk import of a
     hundred CEs could write a hundred headers with no line items behind them
     and report complete success -- which is what happened.

     The header is POSTed before the line items, so a failure in between leaves
     SharePoint holding a CE with a total and nothing under it. */
  return{sp:false,reason:_spFailReason};}
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
async function dbDeleteHistory(id,actorRole){
  /* Deleting a saved CE is an admin/owner action. The button is hidden from
     everyone else, but the check belongs here too -- the UI is not a
     permission boundary, and this call reaches SharePoint. */
  if(!hasAdminPowers(actorRole)) throw new Error('Only an admin or the owner can delete a CE.');
  if(USE_SP||getSiteURL()){try{const[m,r]=await Promise.all([_spGetByCE(spList('CE_MP'),id,'Id'),_spGetByCE(spList('CE_Resources'),id,'Id')]);const d=[...m.map(x=>spDelete(spList('CE_MP'),x.Id)),...r.map(x=>spDelete(spList('CE_Resources'),x.Id))];for(let i=0;i<d.length;i+=5)await Promise.all(d.slice(i,i+5));await spDelete(spList('CEs'),id);_spInvalidateBigList();return;}catch(e){console.warn('dbDeleteHistory:',e.message);}}LS.set('history',(LS.get('history')||[]).filter(h=>h.id!==id));await _ceDeleteById(id);}
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
/* Merges anything still waiting to upload into the SharePoint view. Showing the
   remote list alone would hide entries made during an outage — precisely the
   ones an admin needs to know exist. Pending entries are flagged so nobody
   mistakes a local-only record for one everybody can see. */
async function dbGetAuditLog(limit=200){
  const localPending=(LS.get('auditlog')||[]).filter(e=>e&&e._synced===false);
  if(getSiteURL()){
    try{
      const r=await spGet(spList('AuditLog'),'','Id,shicAction,shicDetail,shicUser,shicTs');
      const remote=r.sort((a,b)=>b.Id-a.Id).map(x=>({ts:x.shicTs||x.Created,action:x.shicAction||x.Title||'',detail:x.shicDetail||'',user:x.shicUser||''}));
      return localPending.concat(remote)
        .sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||'')))
        .slice(0,limit);
    }catch(e){console.warn('dbGetAuditLog:',e.message);}
  }
  return(LS.get('auditlog')||[]).slice(0,limit);
}

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
/* Default notes and signatories, per CE type and discipline.

   Stored as another row in the Companies list rather than a list of its own:
   that list already exists on every site, so this needs no provisioning and
   no "Repair lists & columns" run before it works. The Title column is the
   key -- 'config' is the company roster, 'ce_defaults' is this. */
const CE_DEFAULTS_KEY = 'ce_defaults';
async function dbSaveCeDefaults(list){
  /* Mirror locally first, so the presets survive a SharePoint failure the way
     everything else does. */
  try{localStorage.setItem('shic:ce_defaults',JSON.stringify(list));}catch{}
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq '"+CE_DEFAULTS_KEY+"'",'Id');
      if(r.length)await spPatch(spList('Companies'),r[0].Id,{shicData:JSON.stringify(list)});
      else await spPost(spList('Companies'),{Title:CE_DEFAULTS_KEY,shicData:JSON.stringify(list)});
      return true;
    }catch(e){console.warn('dbSaveCeDefaults:',e.message);}
  }
  return false;
}
async function dbGetCeDefaults(){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq '"+CE_DEFAULTS_KEY+"'",'Id,shicData');
      if(r.length&&r[0].shicData){
        const v=JSON.parse(r[0].shicData);
        if(Array.isArray(v)){try{localStorage.setItem('shic:ce_defaults',JSON.stringify(v));}catch{}return v;}
      }
    }catch(e){console.warn('dbGetCeDefaults:',e.message);}
  }
  try{const s=localStorage.getItem('shic:ce_defaults');return s?JSON.parse(s):[];}catch{return [];}
}
/* The company's standard shift and OT multipliers. Another row in the
   Companies list, like ce_defaults, so it needs no new list. */
const SHIFT_RATES_KEY = 'shift_rates';
/* Company-wide feature switches, shared through the Companies list like the
   shift rates. */
const FEATURES_KEY = 'features';
async function dbSaveFeatures(obj){
  try{localStorage.setItem('shic:features',JSON.stringify(obj));}catch{}
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq '"+FEATURES_KEY+"'",'Id');
      if(r.length)await spPatch(spList('Companies'),r[0].Id,{shicData:JSON.stringify(obj)});
      else await spPost(spList('Companies'),{Title:FEATURES_KEY,shicData:JSON.stringify(obj)});
      return true;
    }catch(e){console.warn('dbSaveFeatures:',e.message);}
  }
  return false;
}
async function dbGetFeatures(){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq '"+FEATURES_KEY+"'",'Id,shicData');
      if(r.length&&r[0].shicData){const v=JSON.parse(r[0].shicData);
        if(v&&typeof v==='object'){try{localStorage.setItem('shic:features',JSON.stringify(v));}catch{}return v;}}
    }catch(e){console.warn('dbGetFeatures:',e.message);}
  }
  try{return JSON.parse(localStorage.getItem('shic:features')||'{}');}catch{return {};}
}
async function dbSaveShiftRates(obj){
  try{localStorage.setItem('shic:shift_rates',JSON.stringify(obj));}catch{}
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq '"+SHIFT_RATES_KEY+"'",'Id');
      if(r.length)await spPatch(spList('Companies'),r[0].Id,{shicData:JSON.stringify(obj)});
      else await spPost(spList('Companies'),{Title:SHIFT_RATES_KEY,shicData:JSON.stringify(obj)});
      return true;
    }catch(e){console.warn('dbSaveShiftRates:',e.message);}
  }
  return false;
}
async function dbGetShiftRates(){
  if(USE_SP||getSiteURL()){
    try{
      const r=await spGet(spList('Companies'),"Title eq '"+SHIFT_RATES_KEY+"'",'Id,shicData');
      if(r.length&&r[0].shicData){
        const v=JSON.parse(r[0].shicData);
        if(v&&typeof v==='object'){try{localStorage.setItem('shic:shift_rates',JSON.stringify(v));}catch{}return v;}
      }
    }catch(e){console.warn('dbGetShiftRates:',e.message);}
  }
  try{const s=localStorage.getItem('shic:shift_rates');return s?JSON.parse(s):null;}catch{return null;}
}
/* The five masterlist sections, and how an item is recognised across two
   browsers. An id is the real identity; a name is the fallback for rows that
   came in from a workbook before ids were handed out, so the same role does
   not come back as a second copy of itself. */
const ML_SECS=['manpower','tools','materials','ppe','vehicles'];
function _mlKey(it){
  if(!it||typeof it!=='object')return null;
  if(it.id!=null&&it.id!=='')return 'id:'+String(it.id);
  const nm=String(it.role||it.desc||'').trim().toUpperCase();
  return nm?'nm:'+String(it.cat||'').trim().toUpperCase()+'|'+nm:null;
}
/* Save the masterlist.

   opts.deleted      {section: [ids]} the caller removed on purpose.
   opts.replaceTabs  sections the caller is rewriting whole -- Clear List and
                     Reset Defaults, which really do mean "this and nothing
                     else in this tab".

   Returns {sp, adopted, merged, reason}. The masterlist is ONE JSON blob in
   ONE row, read at startup, and every save wrote the whole blob back. The
   conflict guard noticed that the site was newer and then overwrote it
   anyway, with a console.warn nobody sees -- so a rate a colleague changed
   this morning was gone the moment anybody else saved. Items the site has
   that the caller does not are merged back in and handed to the caller in
   `adopted`, section by section. */
/* Masterlist Trash. Deleted items wait here for 30 days before they are gone
   for good, so a stray click on the red x can be undone. Kept as one JSON row
   ('trash') in the Masterlist list beside 'config', and mirrored locally.

   op.add     entries to put in: {key, tab, item, at, by}
   op.remove  keys to take out (restored, or deleted forever)
   Anything older than 30 days is dropped on every read and write. */
const ML_TRASH_DAYS = 30;
function _mlTrashFresh(list){
  const cut = Date.now() - ML_TRASH_DAYS * 864e5;
  return (Array.isArray(list) ? list : []).filter(e => e && e.key && new Date(e.at).getTime() > cut);
}
/* A user's saved signature, used to pre-fill Approve & Sign. One row per
   user ('sig:<username>') in the Masterlist list, beside 'config' and 'trash'.
   Mirrored locally so it is there offline. */
async function dbGetMySig(username){
  const k='sig:'+String(username||'').toLowerCase();
  if(USE_SP||getSiteURL()){
    try{const r=await spGet(spList('Masterlist'),"Title eq '"+k.replace(/'/g,"''")+"'",'Id,shicData');
      const v=r.length&&r[0].shicData?(JSON.parse(r[0].shicData).img||''):'';
      LS.set('my_sig:'+k,v);return v;}catch(e){console.warn('dbGetMySig:',e.message);}
  }
  return LS.get('my_sig:'+k)||'';
}
async function dbSaveMySig(username,img){
  const k='sig:'+String(username||'').toLowerCase();
  LS.set('my_sig:'+k,img||'');
  if(USE_SP||getSiteURL()){
    try{const r=await spGet(spList('Masterlist'),"Title eq '"+k.replace(/'/g,"''")+"'",'Id');
      const body={shicData:JSON.stringify({img:img||'',at:new Date().toISOString()})};
      if(r.length)await spWithRetry(()=>spPatch(spList('Masterlist'),r[0].Id,body));
      else await spWithRetry(()=>spPost(spList('Masterlist'),{Title:k,...body}));
      return true;}catch(e){console.warn('dbSaveMySig:',e.message);return false;}
  }
  return false;
}
async function dbGetMLTrash(){
  if(USE_SP||getSiteURL()){
    try{const r=await spGet(spList('Masterlist'),"Title eq 'trash'",'Id,shicData');
      const v=r.length&&r[0].shicData?JSON.parse(r[0].shicData):[];
      const f=_mlTrashFresh(v);LS.set('ml_trash',f);return f;}catch(e){console.warn('dbGetMLTrash:',e.message);}
  }
  return _mlTrashFresh(LS.get('ml_trash'));
}
async function dbMLTrashOp(op){
  const o=op||{};const rm=new Set((o.remove||[]).map(String));
  const apply=list=>{const have=new Set();const out=[];
    for(const e of [...(o.add||[]),..._mlTrashFresh(list)]){if(!e||rm.has(String(e.key))||have.has(e.key))continue;have.add(e.key);out.push(e);}
    return out;};
  let local=apply(LS.get('ml_trash'));LS.set('ml_trash',local);
  if(USE_SP||getSiteURL()){
    try{const r=await spGet(spList('Masterlist'),"Title eq 'trash'",'Id,shicData');
      let theirs=[];try{theirs=r.length&&r[0].shicData?JSON.parse(r[0].shicData):[];}catch(_e){}
      const out=apply(theirs);
      if(r.length)await spWithRetry(()=>spPatch(spList('Masterlist'),r[0].Id,{shicData:JSON.stringify(out)}));
      else await spWithRetry(()=>spPost(spList('Masterlist'),{Title:'trash',shicData:JSON.stringify(out)}));
      LS.set('ml_trash',out);return{sp:true,list:out};
    }catch(e){console.warn('dbMLTrashOp:',e.message);return{sp:false,list:local,reason:e.message};}
  }
  return{sp:false,list:local};
}
async function dbSaveML(data,opts){
/* Mirror locally FIRST, on both branches. The SharePoint branch used to
   `return` before ever reaching the LS.set below, so saving the masterlist
   while online left the offline cache stale forever. */
LS.set('masterlist',data);LS.set('masterlist_savedAt',new Date().toISOString());
const o=opts||{};const _del=o.deleted||{};const _repl=new Set(o.replaceTabs||[]);
if(USE_SP||getSiteURL()){try{const r=await spGet(spList('Masterlist'),"Title eq 'config'",'Id,Modified,shicData');
  let merged=data,adopted={},adoptedN=0;
  if(r.length&&r[0].shicData){
    let theirs=null;try{theirs=JSON.parse(r[0].shicData);}catch(_e){}
    if(theirs&&typeof theirs==='object'){
      merged={...data};
      for(const sec of ML_SECS){
        if(_repl.has(sec))continue;
        const mine=Array.isArray(data[sec])?data[sec]:[];
        const other=Array.isArray(theirs[sec])?theirs[sec]:[];
        if(!other.length)continue;
        const gone=new Set((_del[sec]||[]).map(String));
        const have=new Set(mine.map(_mlKey).filter(Boolean));
        const keep=other.filter(it=>{
          const k=_mlKey(it);
          if(!k)return false;
          if(have.has(k))return false;
          return !(it.id!=null&&gone.has(String(it.id)));
        });
        if(keep.length){adopted[sec]=keep;adoptedN+=keep.length;merged[sec]=[...keep,...mine];}
      }
    }
  }
  if(adoptedN){LS.set('masterlist',merged);}
  if(r.length){/* Conflict guard: if SP was updated more recently than our local copy, warn before overwriting */const spModified=new Date(r[0].Modified||0).getTime();const localSavedAt=new Date(LS.get('masterlist_savedAt')||0).getTime();if(spModified>localSavedAt+5000)console.warn('dbSaveML: SP masterlist was modified by another user at',r[0].Modified,'— merged',adoptedN,'item(s) back in');await spPatch(spList('Masterlist'),r[0].Id,{shicData:JSON.stringify(merged)});}else await spPost(spList('Masterlist'),{Title:'config',shicData:JSON.stringify(merged)});return{sp:true,adopted,merged};}catch(e){
/* Reported, not swallowed. This caught the SharePoint failure and returned as
   if it had worked, so saveML marked the masterlist "synced" and the sidebar
   showed a tick while every rate change sat in one browser. The same silence
   put 48 CEs into SharePoint as headers with no line items. */
console.warn('dbSaveML:',e.message);return{sp:false,reason:e.message};}}
return{sp:false,reason:'SharePoint is not configured'};}
/* Save the scope library.

   opts.deleted  ids the caller deleted on purpose, this session. Only these
                 are removed from SharePoint.
   opts.replace  true for Import-replace and Reset Defaults, the two callers
                 that really do mean "this list, and nothing else".

   Returns {sp, adopted, reason}. `adopted` is every service SharePoint had
   that the caller's list did not and did not delete -- another user's work,
   which the caller must fold into its own copy and say so.

   It used to make SharePoint MATCH the list it was handed, unconditionally.
   That is right for a replace and wrong for everything else: the library is
   loaded once at startup, so a browser that had been open since before a
   colleague added three services deleted those three services the next time
   its owner edited anything at all, silently. Deliberate deletion is now
   named by the caller rather than inferred from absence. */
async function dbSaveSowLib(lib,opts){
  const o=opts||{};
  const deleted=new Set((o.deleted||[]).map(String));
  const replace=o.replace===true;
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
      /* What the site has that this caller does not, minus what it deleted. */
      const adopted=[];
      if(!replace){
        for(const k of Object.keys(spMap))
          if(localMap[k]===undefined&&!deleted.has(k))adopted.push(spMap[k].svc);
      }
      for(const s of lib){
        const spId=(spMap[String(s.id)]||{}).spId;
        const data={Title:(s.cat||'')+(s.cat&&s.title?' | ':'')+s.title,shicData:JSON.stringify(s)};
        if(spId!=null)await spPatch(spList('SowLib'),spId,data);
        else await spPost(spList('SowLib'),data);
      }
      /* Never on an empty list. A failed read or a half-loaded editor handing
         over [] must not be able to empty the site's library, and no legitimate
         caller ever saves an empty one -- Reset Defaults writes the seeded set,
         not nothing. */
      if(lib.length){
        for(const r of existing){
          let id=null;
          try{const d=JSON.parse(r.shicData||'{}');id=d&&d.id!=null?String(d.id):null;}catch{}
          /* A row with no readable id names no service, so nothing can ask for
             it back; it goes only when the caller is rewriting the whole list. */
          const gone=id===null?replace:(replace?localMap[id]===undefined:deleted.has(id));
          if(gone)await spDelete(spList('SowLib'),r.Id).catch(()=>{});
        }
      }
      return {sp:true,adopted};
    }catch(e){console.warn('dbSaveSowLib:',e.message);
      /* Reported, not swallowed. A save that failed used to return false into
         a .catch(()=>{}) while the sidebar kept its tick, so a library edited
         all afternoon could exist in one browser and nowhere else. */
      try{localStorage.setItem('sy3:sowlib',JSON.stringify(lib));}catch(_e){}
      return {sp:false,adopted:[],reason:e.message};}
  }
  /* Raw key, no shic: prefix — App.js reads localStorage['sy3:sowlib'] directly.
     LS.set would write 'shic:sy3:sowlib', which nothing ever read. */
  try{localStorage.setItem('sy3:sowlib',JSON.stringify(lib));}catch(e){console.warn('sowlib not cached locally:',e&&e.message);}
  return {sp:false,adopted:[],reason:'SharePoint is not configured'};
}
async function dbGetSowLib(){
  if(USE_SP||getSiteURL()){
    try{
      const rows=await spGet(spList('SowLib'),'','Id,Title,shicData');
      if(rows.length){
        const parsed=rows.filter(r=>r.shicData).map(r=>{try{return JSON.parse(r.shicData);}catch{return null;}}).filter(Boolean);
        /* One service per id, and one per title within a category. A site that
           was merged before this fix holds both the old library and the new
           one, and the reader is where that stops being visible: the last row
           wins, which is the most recently written. */
        const byId={},byName={};
        for(const svc of parsed){
          if(svc&&svc.id!=null)byId[String(svc.id)]=svc;
          else byName['\u0000'+Math.random()]=svc;
        }
        const uniq=[];
        for(const svc of Object.values(byId)){
          const key=String(svc.cat||'').toUpperCase().trim()+'|'+String(svc.title||'').toUpperCase().trim();
          byName[key]=svc;
        }
        for(const svc of Object.values(byName))uniq.push(svc);
        if(uniq.length)return uniq.sort((a,b)=>String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true}));
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
    /* An owner counts — they hold every admin power, so a fresh admin must not
       be minted alongside one. */
    const admin = u.find(x => x && hasAdminPowers(x.role));
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
/* ── Roles and ownership ─────────────────────────────────────────────────────
   Three roles: owner > admin > user. Exactly one owner.

   The point of `owner` is that delegated admins can run the day to day without
   being able to remove or demote the person who delegated to them. The owner
   picks their own successor; nobody else can.

   HONEST LIMIT: this is enforced in the app, not by SharePoint. The real
   boundary is the Users list permissions — anyone who can write shicRole there
   (via the list UI, Graph, or the browser console) can still change roles. This
   stops a delegated admin from doing it by accident or on impulse through the
   app, and every attempt is audit-logged. It is not a defence against someone
   with direct list access. Restrict write access to the Users list in
   SharePoint if that matters.                                                */
const ROLE_OWNER='owner', ROLE_ADMIN='admin', ROLE_USER='user', ROLE_REQUESTOR='requestor';
const _role=u=>String((u&&u.role)||u||'').toLowerCase();
const isOwnerRole=r=>_role(r)===ROLE_OWNER;
/* The owner keeps every admin power; `admin` alone is the delegated tier. */
const hasAdminPowers=r=>{const x=_role(r);return x===ROLE_OWNER||x===ROLE_ADMIN;};
/* A requestor raises the request -- the CE number, the customer, what the job
   is, when it is wanted and who is to cost it -- and hands it over there. They
   see everything that comes back, and change none of it: the one thing they
   may save is their own request, and only while it is still a request. */
const isRequestorRole=r=>_role(r)===ROLE_REQUESTOR;
const canCostCE=r=>!isRequestorRole(r);
const ROLE_NAMES={owner:'Owner',admin:'Admin',user:'Estimator',requestor:'Requestor'};
const roleName=r=>ROLE_NAMES[_role(r)]||_role(r)||'user';
/* Every role an admin may hand out. The owner is reached by transfer alone, so
   it is not among them: this cannot mint a second owner. */
const ASSIGNABLE_ROLES=[ROLE_USER,ROLE_REQUESTOR,ROLE_ADMIN];
const findOwner=users=>(users||[]).find(u=>u&&isOwnerRole(u.role))||null;
const sameUser=(a,b)=>{const x=String((a&&a.username)||a||'').toLowerCase(),y=String((b&&b.username)||b||'').toLowerCase();return !!x&&x===y;};

/* One place that answers "may this person change that account?".
   `change` is the field being touched: 'role' | 'status' | 'delete' | 'password'
   | 'email' | 'name'. Returns {ok, reason} so callers can explain a refusal
   rather than just hiding a button. */
function canManageUser(actor, target, change){
  if(!hasAdminPowers(actor&&actor.role)) return {ok:false, reason:'Only an admin can change accounts.'};
  const actorIsOwner=isOwnerRole(actor&&actor.role);
  const targetIsOwner=isOwnerRole(target&&target.role);
  const self=sameUser(actor,target);

  /* Nobody deletes the owner — not even the owner. Removing the last owner
     would leave the app with no one able to appoint another. Transfer first. */
  if(change==='delete'&&targetIsOwner)
    return {ok:false, reason:'The owner account cannot be deleted. Transfer ownership first, then delete it.'};

  /* The owner's account is off limits to everyone else. This is the whole
     point of the role: a delegated admin cannot lock the owner out, demote
     them, reset their password, or quietly change their email. */
  if(targetIsOwner&&!self)
    return {ok:false, reason:'Only the owner can change the owner account.'};

  /* The owner role moves by transfer alone, so a stray "make admin" click can
     neither create a second owner nor leave the app without one. */
  if(change==='role'){
    if(targetIsOwner&&self)
      return {ok:false, reason:'Use Transfer ownership to hand the owner role to someone else.'};
    if(!actorIsOwner&&targetIsOwner)
      return {ok:false, reason:'Only the owner can change the owner role.'};
  }

  /* An admin disabling or rejecting themselves is how people lock themselves
     out; the existing UI already hides it, this makes it a rule. */
  if(self&&(change==='status'||change==='delete'))
    return {ok:false, reason:'You cannot change your own access.'};

  return {ok:true, reason:''};
}

/* Hand the owner role to someone else. Two writes, and the order is deliberate:
   promote the successor FIRST. If the second write fails there are briefly two
   owners, which is recoverable by either of them. Demoting first and then
   failing would leave NO owner and no way to appoint one. */
async function dbTransferOwnership(currentOwner, successor){
  if(!isOwnerRole(currentOwner&&currentOwner.role)) throw new Error('Only the owner can transfer ownership.');
  if(!successor||successor.id===undefined) throw new Error('Pick the account that should become owner.');
  if(sameUser(currentOwner,successor)) throw new Error('That is already the owner.');
  if(String(successor.status||'')!=='approved') throw new Error('Ownership can only go to an approved account.');
  await dbUpdateUser(successor.id,{role:ROLE_OWNER},{_ownership:true});
  try{
    await dbUpdateUser(currentOwner.id,{role:ROLE_ADMIN},{_ownership:true});
  }catch(e){
    throw new Error('Ownership was granted to '+successor.username+', but your own account could not be stepped down ('+e.message+'). There are two owners right now — either of you can fix it from the Users tab.');
  }
  return {from:currentOwner.username, to:successor.username};
}

/* One-time bootstrap for an install that predates the owner role. Only offered
   while NO owner exists, and only to an admin. Deliberately a deliberate act
   rather than an automatic assignment: picking "oldest admin" would quietly
   hand the app to whichever account happened to be created first. */
async function dbClaimOwnership(actor, users){
  if(!hasAdminPowers(actor&&actor.role)) throw new Error('Only an admin can claim ownership.');
  const existing=findOwner(users);
  if(existing) throw new Error('This app already has an owner ('+existing.username+'). Only they can transfer it.');
  await dbUpdateUser(actor.id,{role:ROLE_OWNER},{_ownership:true});
  return actor.username;
}

/* ── Bulk upload mode ────────────────────────────────────────────────────────
   Admin-only, temporary bypass of the duplicate CE-number guard so historical
   CEs can be loaded in.

   Stored in localStorage, so it survives closing the tab. It used to live in
   sessionStorage, which capped it at the life of one tab — that made any window
   longer than a sitting meaningless, and a multi-day import is a real need. The
   constraints that remain are therefore the only ones left, and each matters
   more than it did:

     - a hard expiry, clamped to BULK_MAX_MINUTES, so it cannot be left on
       indefinitely by forgetting about it
     - bound to the admin who enabled it: a shared browser is now a real
       exposure, because tab lifetime no longer incidentally scopes this. Anyone
       else signing in on the same machine gets normal duplicate protection
     - anything malformed fails closed
     - the caller still re-checks isAdmin on every save; this only records the
       window, so a demoted account loses the bypass immediately

   NOTE: with the guard bypassed, saving a CE number that already exists UPDATES
   that CE (dbSaveHistory patches the row it finds by Title) rather than adding
   a second one — and that row may belong to someone else. Every replacement
   writes a bulk_overwrite audit entry. */
const BULK_MAX_MINUTES = 7 * 24 * 60;   /* one week */
const bulkMode = {
  get() {
    try {
      const v = JSON.parse(localStorage.getItem('shic:bulk') || 'null');
      /* `until` must be a real number. A non-numeric value makes the comparison
         below NaN, which is never true, so a corrupted entry would leave the
         protection off indefinitely. Anything unexpected fails closed. */
      if (!v || typeof v.until !== 'number' || !isFinite(v.until)) { localStorage.removeItem('shic:bulk'); return null; }
      if (Date.now() > v.until) { localStorage.removeItem('shic:bulk'); return null; }
      /* Longer than the ceiling means the clock moved or the entry was edited;
         either way, do not honour it. */
      if (v.until - Date.now() > BULK_MAX_MINUTES * 60000) { localStorage.removeItem('shic:bulk'); return null; }
      return v;
    } catch (_e) { return null; }
  },
  /* Pass the signed-in username. Without a match the bypass does not apply —
     this is what stops a second person on the same browser inheriting it. */
  on(username) {
    const v = bulkMode.get();
    if (!v) return false;
    if (username === undefined) return true;
    return !!v.by && String(v.by).toLowerCase() === String(username || '').toLowerCase();
  },
  minutesLeft() { const v = bulkMode.get(); return v ? Math.max(0, Math.ceil((v.until - Date.now()) / 60000)) : 0; },
  /* "6d 4h" / "3h 20m" / "12 min" — minutes alone stopped being readable once
     the window could run into days. */
  timeLeftText() {
    const m = bulkMode.minutesLeft();
    if (!m) return 'expired';
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mm + 'm';
    return mm + ' min';
  },
  /* How long the window has been open. A week-long window is a real need, but
     it is also long enough to forget about, and "6d 4h left" reads like
     something with plenty of time rather than something running unattended
     since Monday. `since` is optional -- a window opened before this shipped
     simply reports nothing rather than a wrong age. */
  openedAt() { const v = bulkMode.get(); const t = v && Number(v.since); return isFinite(t) && t > 0 ? t : 0; },
  /* Clamped at 0: a `since` in the future (a clock change, or an edited entry)
     would otherwise report "-1 days", which looks like a bug sitting next to a
     destructive setting. No age is better than a wrong one. */
  openHours() { const t = bulkMode.openedAt(); return t ? Math.max(0, Math.floor((Date.now() - t) / 3600000)) : 0; },
  isStale() { return bulkMode.openHours() >= 24; },
  openForText() {
    const h = bulkMode.openHours();
    if (!h) return '';
    const d = Math.floor(h / 24);
    return d ? d + ' day' + (d === 1 ? '' : 's') : h + ' hour' + (h === 1 ? '' : 's');
  },
  enable(minutes, by) {
    const mins = Math.min(BULK_MAX_MINUTES, Math.max(1, Number(minutes) || 60));
    try { localStorage.setItem('shic:bulk', JSON.stringify({ until: Date.now() + mins * 60000, by: by || '', since: Date.now() })); } catch (_e) {}
    try { window.dispatchEvent(new Event('shic:bulk:changed')); } catch (_e) {}
    return mins;
  },
  disable() {
    try { localStorage.removeItem('shic:bulk'); } catch (_e) {}
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
