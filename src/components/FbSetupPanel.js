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
      const tok=await getSPToken();
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
      status!=='connected'?React.createElement('button',{style:btn('acc'),disabled:busy||!cfg.siteUrl,onClick:handleConnect},busy?'Working...':'Connect & Auto-Setup'):React.createElement('button',{style:btn('danger'),onClick:()=>{_spToken=null;setStatus('idle');}},'Disconnect')
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

