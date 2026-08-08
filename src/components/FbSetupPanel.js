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
      addLog(result.added
        ? 'Repair done: '+result.added+' column(s) added'+(result.created?', '+result.created+' list(s) created':'')+'. Re-save any CE that failed.'
        : 'Repair done: nothing was missing.');
      if(result.errors&&result.errors.length){
        addLog('⚠ '+result.errors.length+' problem(s) — see below:');
        result.errors.slice(0,6).forEach(e=>addLog('   '+e));
      }
    }catch(e){addLog('Repair failed: '+e.message.slice(0,120));}
    setProgress(null);setBusy(false);
  };
  const[access,setAccess]=React.useState(null);
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
  React.useEffect(()=>{
    const saved=getSPConfig();
    if(saved.siteUrl&&saved.clientId)handleConnect();
  },[]);
  const pfx=cfg.listPrefix||'SHICCE';const stC=status==='connected'?OK:status.startsWith('error')?ERR:MT;
  return React.createElement('div',null,
    React.createElement('div',{style:{fontWeight:700,marginBottom:12,fontSize:13,display:'flex',alignItems:'center',gap:8}},'SP SharePoint Sync',React.createElement('span',{style:{fontSize:10,padding:'2px 8px',borderRadius:10,background:stC+'22',color:stC,fontWeight:700,marginLeft:4}},status)),
    React.createElement('div',{style:{color:MT,fontSize:11,marginBottom:12,lineHeight:1.6}},'Connect to SharePoint. CEs stored across separate lists - no blob limits, 20+ concurrent users.'),
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}},
      React.createElement('div',{style:{gridColumn:'1/-1'}},React.createElement('label',{style:LBL},'Site URL ',React.createElement('span',{style:{color:ERR}},'*')),React.createElement('input',{style:INP,value:cfg.siteUrl||'',onChange:e=>setCfg(p=>({...p,siteUrl:e.target.value.trim()})),placeholder:'https://yourcompany.sharepoint.com/sites/SiteName'})),
      React.createElement('div',null,React.createElement('label',{style:LBL},'Client ID'),React.createElement('input',{style:INP,value:cfg.clientId||'',onChange:e=>setCfg(p=>({...p,clientId:e.target.value.trim()})),placeholder:'Azure App Client ID'})),
      React.createElement('div',null,React.createElement('label',{style:LBL},'Tenant ID'),React.createElement('input',{style:INP,value:cfg.tenantId||'',onChange:e=>setCfg(p=>({...p,tenantId:e.target.value.trim()})),placeholder:'common'})),
      React.createElement('div',null,React.createElement('label',{style:LBL},'List Prefix'),React.createElement('input',{style:{...INP,fontFamily:"'JetBrains Mono',monospace"},value:cfg.listPrefix||'SHICCE',onChange:e=>setCfg(p=>({...p,listPrefix:e.target.value.replace(/[^a-zA-Z0-9_]/g,'')})),placeholder:'SHICCE'}))
    ),
    React.createElement('div',{style:{fontSize:10,color:MT,marginBottom:10,padding:'8px 10px',background:SURF,borderRadius:6,lineHeight:1.7}},
      React.createElement('b',{style:{color:TX}},'Azure Redirect URI (must match exactly): '),React.createElement('br',null),
      React.createElement('code',{style:{color:'#F0A429',wordBreak:'break-all'}},window.location.origin+window.location.pathname.replace(/\/[^\/]*$/,'/')),
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
      React.createElement('button',{style:btn('def'),disabled:busy,title:'Tries a read and a write on every list AS THE SIGNED-IN ACCOUNT. Run it from the machine of whoever cannot sync.',onClick:handleCheckAccess},busy?'Working...':'Check my access')
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

