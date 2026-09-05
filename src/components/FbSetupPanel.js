function FbSetupPanel(){
  const[cfg,setCfg]=React.useState(()=>getSPConfig()||{});
  const[status,setStatus]=React.useState('idle');
  const[busy,setBusy]=React.useState(false);
  const[progress,setProgress]=React.useState(null);
  const[log,setLog]=React.useState([]);
  const addLog=msg=>setLog(p=>[{t:new Date().toLocaleTimeString(),msg},...p.slice(0,14)]);

  const handleConnect=async()=>{
    if(!cfg.siteUrl){setStatus('error: Site URL required');return;}
    setBusy(true);setStatus('connecting...');setProgress(null);
    try{
      saveSPConfig(cfg);_spToken=null;_spExpiry=0;_spMsalApp=null;
      const tok=await getSPToken({interactive:true});
      if(!tok)throw new Error('Sign-in cancelled or failed');
      const h={'Accept':'application/json;odata=nometadata','Authorization':'Bearer '+tok};
      const r=await fetch(cfg.siteUrl.replace(/\/$/,'')+'/_api/web/currentuser',{credentials:'omit',headers:h});
      if(r.status===403)throw new Error('403 &#8212; check redirect URI in Azure matches exactly: '+window.location.origin+window.location.pathname.replace(/\/[^\/]*$/,'/'));
      if(!r.ok)throw new Error('HTTP '+r.status);
      const u=await r.json();
      addLog('Signed in as '+(u.Title||u.LoginName||'user'));
      setStatus('setting up lists...');

      /* Auto-create SP lists */
      const result=await autoSetupSP(p=>{
        setProgress(p);
        if(p.step!=='done')addLog(p.msg);
      });
      setStatus('connected');
      addLog('Lists ready: '+result.created+' created, '+result.skipped+' already existed, '+(result.added||0)+' column(s) added.');
      if(result.errors&&result.errors.length){
        addLog('⚠ '+result.errors.length+' problem(s) — see below:');
        result.errors.slice(0,6).forEach(e=>addLog('   '+e));
      }
      setProgress(null);
    }catch(e){
      setStatus('error: '+e.message.slice(0,100));
      addLog('Error: '+e.message.slice(0,100));
      setProgress(null);
    }
    setBusy(false);
  };
  const handleRepair=async()=>{
    setBusy(true);setProgress(null);
    try{
      const result=await autoSetupSP(p=>{setProgress(p);if(p.step!=='done')addLog(p.msg);});
      /* Indexes are the reason to press this on a site whose columns are all
         present, so "nothing was missing" must not be the answer when they
         were applied -- it reads as "I did nothing" and sent the last round of
         debugging down the wrong path. */
      const bits=[];
      if(result.created)bits.push(result.created+' list(s) created');
      if(result.added)bits.push(result.added+' column(s) added');
      if(result.indexed)bits.push(result.indexed+' column(s) indexed');
      addLog(bits.length
        ? 'Repair done: '+bits.join(', ')+'.'+(result.added?' Re-save any CE that failed.':'')
        : 'Repair done: nothing was missing and every filtered column was already indexed.');
      if(result.errors&&result.errors.length){
        addLog('⚠ '+result.errors.length+' problem(s) — see below:');
        result.errors.slice(0,6).forEach(e=>addLog('   '+e));
      }
    }catch(e){addLog('Repair failed: '+e.message.slice(0,120));}
    setProgress(null);setBusy(false);
  };
  const[access,setAccess]=React.useState(null);
  const[orphans,setOrphans]=React.useState(null);
  const[offline,setOffline]=React.useState(null);
  /* The Monitoring list is cached, the CEs behind it were not: only ones saved
     from this browser were stored, so the CE nobody here had opened yet was
     exactly the one missing when the connection went. */
  const handleCacheAll=async()=>{
    setBusy(true);setOffline(null);addLog('Downloading every CE for offline use...');
    try{
      const r=await dbCacheAllCEs(p=>setProgress({msg:p.msg,progress:p.progress}));
      setOffline(r);
      addLog('Offline copy ready: '+r.stored+' CE(s) stored'+(r.skipped?', '+r.skipped+' already current':'')+' — '+r.total+' in total.');
    }catch(e){addLog('Offline download failed: '+e.message.slice(0,140));}
    setProgress(null);setBusy(false);
  };
  /* dbSaveHistory writes the CE header before its line items, so a failure in
     between leaves a CE that reads normally in Monitoring and opens empty.
     There is no way to spot one without opening it, and a whole import can
     land this way -- so list them all at once. */
  const handleFindOrphans=async()=>{
    setBusy(true);setOrphans(null);addLog('Looking for CEs whose line items never reached SharePoint...');
    try{
      const rows=await dbFindHeaderOnlyCEs(p=>setProgress({msg:p.msg,progress:p.progress}));
      setOrphans(rows);
      /* The panel shows the first 200; the console carries the lot, so a long
         list can still be copied out and worked through. */
      if(rows.length)console.warn('CEs with a header but no line items ('+rows.length+'):',rows.map(o=>o.ceNum).join(', '));
      addLog(rows.length
        ? '⚠ '+rows.length+' CE(s) have a total but no line items. Re-import or re-save each one.'
        : 'Every CE with a total has its line items. Nothing to repair.');
    }catch(e){addLog('Check failed: '+e.message.slice(0,140));}
    setProgress(null);setBusy(false);
  };
  /* "It works for me" proves nothing: every SharePoint call runs on the
     signed-in user's own token, so permission is per person, per list. Have
     the person who cannot sync press this and read the row that says DENIED. */
  const handleCheckAccess=async()=>{
    setBusy(true);setAccess(null);addLog('Checking what this account can read and write...');
    try{
      const rows=await spCheckAccess(p=>setProgress({msg:'Checking '+p.name+'...',progress:p.i/p.total}));
      setAccess(rows);
      const bad=rows.filter(r=>r.read!=='yes'||r.write!=='yes');
      addLog(bad.length?('⚠ '+bad.length+' list(s) this account cannot use: '+bad.map(r=>r.list).join(', ')):'All lists readable and writable by this account.');
      const left=rows.filter(r=>r.leftover);
      if(left.length)addLog('⚠ Probe rows left behind (delete them by hand): '+left.map(r=>r.list+' #'+r.leftover).join(', '));
    }catch(e){addLog('Access check failed: '+e.message.slice(0,120));}
    setProgress(null);setBusy(false);
  };
  /* Opening the Users tab used to run handleConnect, which runs the FULL
     provisioning: an interactive sign-in, then twelve lists, every column and
     every index verified one request at a time. The tab mounts every time it
     is opened, so that ran on every visit -- it is why the panel appeared to
     reconnect each time, and it is almost certainly what was tipping the site
     into 429 throttling.

     Nothing about opening a tab justifies rewriting a site's schema. All this
     needs to know is whether the connection still works, which is one cheap
     read against a token we already hold. Provisioning stays where it belongs:
     on "Connect & Auto-Setup" and on "Repair lists & columns", both of which
     someone presses on purpose. */
  React.useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const saved=getSPConfig();
      if(!(saved.siteUrl&&saved.clientId))return;
      try{
        /* Not interactive. A silent token means the session is still good; no
           token means sign in again, and the user does that by pressing
           Connect -- not by having a popup thrown at them for opening a tab. */
        const tok=await getSPToken();
        if(cancelled)return;
        if(!tok){setStatus('idle');return;}
        const r=await fetch(saved.siteUrl.replace(/\/$/,'')+'/_api/web/currentuser',
          {credentials:'omit',headers:{'Accept':'application/json;odata=nometadata','Authorization':'Bearer '+tok}});
        if(cancelled)return;
        if(r.ok){
          setStatus('connected');
          try{const u=await r.json();addLog('Connected as '+(u.Title||u.LoginName||'user')+'. Lists were not re-checked — press "Repair lists & columns" if this version needs a new one.');}
          catch(_){setStatus('connected');}
        }else if(r.status===401||r.status===403){
          setStatus('idle');
        }else{
          setStatus('error: HTTP '+r.status);
        }
      }catch(e){
        if(!cancelled)setStatus('idle');
      }
    })();
    return()=>{cancelled=true;};
  },[]);
  const pfx=cfg.listPrefix||'SHICCE';const stC=status==='connected'?OK:status.startsWith('error')?ERR:MT;
  return React.createElement('div',null,
    React.createElement('div',{style:{fontWeight:700,marginBottom:12,fontSize:13,display:'flex',alignItems:'center',gap:8}},'SP SharePoint Sync',React.createElement('span',{style:{fontSize:10,padding:'2px 8px',borderRadius:10,background:alpha(stC, '22'),color:stC,fontWeight:700,marginLeft:4}},status)),
    React.createElement('div',{style:{color:MT,fontSize:11,marginBottom:12,lineHeight:1.6}},'Connect to SharePoint. CEs stored across separate lists - no blob limits, 20+ concurrent users.'),
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}},
      React.createElement('div',{style:{gridColumn:'1/-1'}},React.createElement('label',{style:LBL},'Site URL ',React.createElement('span',{style:{color:ERR}},'*')),React.createElement('input',{style:INP,value:cfg.siteUrl||'',onChange:e=>setCfg(p=>({...p,siteUrl:e.target.value.trim()})),placeholder:'https://yourcompany.sharepoint.com/sites/SiteName'})),
      React.createElement('div',null,React.createElement('label',{style:LBL},'Client ID'),React.createElement('input',{style:INP,value:cfg.clientId||'',onChange:e=>setCfg(p=>({...p,clientId:e.target.value.trim()})),placeholder:'Azure App Client ID'})),
      React.createElement('div',null,React.createElement('label',{style:LBL},'Tenant ID'),React.createElement('input',{style:INP,value:cfg.tenantId||'',onChange:e=>setCfg(p=>({...p,tenantId:e.target.value.trim()})),placeholder:'common'})),
      React.createElement('div',null,React.createElement('label',{style:LBL},'List Prefix'),React.createElement('input',{style:{...INP,fontFamily:"'JetBrains Mono',monospace"},value:cfg.listPrefix||'SHICCE',onChange:e=>setCfg(p=>({...p,listPrefix:e.target.value.replace(/[^a-zA-Z0-9_]/g,'')})),placeholder:'SHICCE'}))
    ),
    React.createElement('div',{style:{fontSize:10,color:MT,marginBottom:10,padding:'8px 10px',background:SURF,borderRadius:6,lineHeight:1.7}},
      React.createElement('b',{style:{color:TX}},'Azure Redirect URI (must match exactly): '),React.createElement('br',null),
      React.createElement('code',{style:{color:'var(--brand-accent)',wordBreak:'break-all'}},window.location.origin+window.location.pathname.replace(/\/[^\/]*$/,'/')),
      React.createElement('hr',{style:{border:'none',borderTop:'1px solid #30363D',margin:'6px 0'}}),
      React.createElement('b',{style:{color:TX}},'Lists: '),pfx+'_Users | '+pfx+'_CEs | '+pfx+'_CE_MP | '+pfx+'_CE_Resources | '+pfx+'_Masterlist | '+pfx+'_Drafts'
    ),
    React.createElement('div',{style:{display:'flex',gap:8}},
      status!=='connected'?React.createElement('button',{style:btn('acc'),disabled:busy||!cfg.siteUrl,onClick:handleConnect},busy?'Working...':'Connect & Auto-Setup'):React.createElement('button',{style:btn('danger'),onClick:()=>{_spToken=null;setStatus('idle');}},'Disconnect'),
      /* Once connected, the only button used to be Disconnect -- so a site set
         up by an older version had no way to receive a column added since,
         short of disconnecting and reconnecting. autoSetupSP only ever adds
         what is missing, so running it again is safe at any time. */
      status==='connected'&&React.createElement('button',{style:btn('info'),disabled:busy,title:'Adds any list or column this version needs and the site does not have. Existing data is never touched.',onClick:handleRepair},busy?'Working...':'Repair lists & columns'),
      React.createElement('button',{style:btn('def'),disabled:busy,title:'Tries a read and a write on every list AS THE SIGNED-IN ACCOUNT. Run it from the machine of whoever cannot sync.',onClick:handleCheckAccess},busy?'Working...':'Check my access'),
      status==='connected'&&React.createElement('button',{style:btn('def'),disabled:busy,title:'Lists every CE that has a stored total but no line items behind it — the state a save leaves when it fails after writing the header. Read-only.',onClick:handleFindOrphans},busy?'Working...':'Find CEs missing line items'),
      status==='connected'&&React.createElement('button',{style:btn('info'),disabled:busy,title:'Stores every CE in this browser so any of them can be opened, printed and exported with no connection. Reads the three lists once each rather than two requests per CE. Safe to re-run: only CEs that have changed are written.',onClick:handleCacheAll},busy?'Working...':'⬇ Download all CEs for offline')
    ),
    offline&&React.createElement('div',{style:{marginTop:10,padding:'10px 12px',background:SURF,borderRadius:6}},
      React.createElement('div',{style:{fontWeight:700,fontSize:12,marginBottom:6,color:OK}},'Offline copy ready'),
      React.createElement('div',{style:{fontSize:11,color:MT,lineHeight:1.7}},
        offline.stored+' CE(s) stored in this browser',
        offline.skipped?', '+offline.skipped+' already up to date':'',
        '. ',offline.total+' CE(s) on the site, '+offline.rows.toLocaleString()+' line-item rows read.',
        React.createElement('br',null),
        'Any of them now opens, prints and exports with no connection. Re-run after other people save, to pick up their changes.')
    ),
    orphans&&React.createElement('div',{style:{marginTop:10,padding:'10px 12px',background:SURF,borderRadius:6}},
      React.createElement('div',{style:{fontWeight:700,fontSize:12,marginBottom:6,color:orphans.length?ERR:OK}},
        orphans.length?orphans.length+' CE(s) with a total but no line items':'Every CE with a total has its line items'),
      orphans.length>0&&React.createElement('div',{style:{fontSize:10,color:MT,marginBottom:8,lineHeight:1.6}},
        'The header reached SharePoint and the rows did not. Monitoring shows the total; opening the CE shows nothing. Re-import the source file, or open the local copy if this browser has one and press Save.'),
      orphans.length>0&&React.createElement('div',{style:{maxHeight:220,overflowY:'auto'}},
        orphans.slice(0,200).map(o=>React.createElement('div',{key:o.id,style:{display:'flex',gap:8,fontSize:10,padding:'3px 0',borderBottom:'1px solid '+alpha(BDR, '44')}},
          React.createElement('span',{style:{fontFamily:"'JetBrains Mono',monospace",minWidth:150}},o.ceNum),
          React.createElement('span',{style:{minWidth:100,textAlign:'right',color:ERR}},'P'+o.total.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})),
          React.createElement('span',{style:{color:MT}},o.savedBy||''),
          React.createElement('span',{style:{color:MT,marginLeft:'auto'}},o.savedAt?new Date(o.savedAt).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}):'')
        ))),
      orphans.length>200&&React.createElement('div',{style:{fontSize:10,color:MT,marginTop:6}},'+ '+(orphans.length-200)+' more (see the console for the full list).')
    ),
    access&&React.createElement('div',{style:{marginTop:10,padding:'10px 12px',background:SURF,borderRadius:6}},
      React.createElement('div',{style:{fontSize:11,color:TX,fontWeight:700,marginBottom:6}},'What this account can do'),
      React.createElement('div',{style:{fontSize:10,color:MT,marginBottom:8,lineHeight:1.6}},
        'The app has no service account: it acts as whoever is signed in. A list marked DENIED here works for you and fails for them until a site owner grants that person ',
        React.createElement('b',{style:{color:TX}},'Contribute'),' on it.'),
      React.createElement('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:10}},
        React.createElement('thead',null,React.createElement('tr',null,
          ['List','Read','Write','Needed for'].map(h=>React.createElement('th',{key:h,style:{...THS,fontSize:9}},h)))),
        React.createElement('tbody',null,access.map(r=>React.createElement('tr',{key:r.list},
          React.createElement('td',{style:{...TDS,fontFamily:"'JetBrains Mono',monospace"}},r.list),
          ...['read','write'].map(k=>React.createElement('td',{key:k,style:{...TDS,color:r[k]==='yes'?OK:ERR,fontWeight:700}},r[k]==='yes'?'ok':r[k])),
          React.createElement('td',{style:{...TDS,color:MT}},r.note||r.why))))
      )
    ),
    progress&&React.createElement('div',{style:{marginTop:8,padding:'8px 10px',background:SURF,borderRadius:6}},
      React.createElement('div',{style:{fontSize:11,color:TX,marginBottom:6}},progress.msg),
      React.createElement('div',{style:{background:BDR,borderRadius:6,height:5}},
        React.createElement('div',{style:{background:OK,height:5,borderRadius:6,width:Math.round((progress.progress||0)*100)+'%',transition:'width .3s'}})
      )
    ),
    log.length>0&&React.createElement('div',{style:{marginTop:10,maxHeight:100,overflowY:'auto'}},log.map((l,i)=>React.createElement('div',{key:i,style:{fontSize:10,color:MT,fontFamily:"'JetBrains Mono',monospace"}},'['+l.t+'] '+l.msg)))
  );
}

