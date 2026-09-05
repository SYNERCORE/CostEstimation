function CompanyDBPanel(){
  const[companies,setCompanies]=React.useState(()=>getCompanies());
  const[editId,setEditId]=React.useState(null);
  const[draft,setDraft]=React.useState(null);
  const[spStatus,setSpStatus]=React.useState('');
  const spConnected=!!(USE_SP||getSiteURL());

  React.useEffect(()=>{
    if(!spConnected)return;
    setSpStatus('Loading from SharePoint…');
    dbGetCompanies().then(list=>{
      if(list&&list.length){setCompanies(list);saveCompanies(list);setSpStatus('✅ Loaded from SharePoint.');}
      else setSpStatus('No company data on SP yet — save to publish.');
    }).catch(e=>setSpStatus('⚠️ SP load failed: '+e.message));
  },[]);

  const persist=list=>{setCompanies(list);saveCompanies(list);};

  const startEdit=co=>{setEditId(co.id);setDraft({...co});};
  const cancelEdit=()=>{setEditId(null);setDraft(null);};
  const saveEdit=()=>{
    const list=companies.map(c=>c.id===draft.id?draft:c);
    persist(list);setEditId(null);setDraft(null);
  };
  const addCo=()=>{
    const id=Date.now();
    const blank={id,name:'New Company',sub:'',color:'#cc0000',logo:'',docNo:'',revNo:'0',revDate:''};
    persist([...companies,blank]);
    startEdit(blank);
  };
  const delCo=id=>{
    if(companies.length<=1){alert('At least one company is required.');return;}
    if(!confirm('Delete this company?'))return;
    persist(companies.filter(c=>c.id!==id));
  };
  const handleLogo=e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>300000){alert('Logo too large. Use an image under 300KB.');return;}
    const reader=new FileReader();
    reader.onload=ev=>setDraft(p=>({...p,logo:ev.target.result}));
    reader.readAsDataURL(file);
  };

  const G={display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10};
  return React.createElement('div',null,
    React.createElement('div',{style:{fontWeight:700,marginBottom:8,fontSize:13,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},
      '🏢 Company Database',
      React.createElement('span',{style:{fontSize:10,color:MT,fontWeight:400,marginLeft:4}},companies.length+' compan'+(companies.length===1?'y':'ies')),
      spConnected&&React.createElement('span',{style:{fontSize:10,padding:'2px 8px',borderRadius:10,background:'#22c55e22',color:'#22c55e',fontWeight:600}},
        '☁ SP Connected'),
      React.createElement('button',{style:{...btn('acc'),marginLeft:'auto',fontSize:11},onClick:addCo},'+ Add Company')
    ),
    spStatus&&React.createElement('div',{style:{fontSize:11,color:MT,marginBottom:8,padding:'4px 8px',background:SURF,borderRadius:5,border:'1px solid '+BDR}},spStatus),
    React.createElement('div',{style:{fontSize:11,color:MT,marginBottom:12}},'Each company has its own CE prefix, logo, document number, revision number and date. Changes are '+(spConnected?'auto-synced to SharePoint for all users.':'saved locally only — connect SharePoint to share across users.')),

    /* Company cards */
    companies.map(co=>React.createElement('div',{key:co.id,style:{border:'1px solid '+(editId===co.id?'var(--accent-violet)':BDR),borderRadius:8,marginBottom:10,overflow:'hidden'}},

      /* Card header */
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:editId===co.id?'#A78BFA11':SURF}},
        co.logo
          ?React.createElement('img',{src:co.logo,style:{width:48,height:28,objectFit:'contain',background:'#fff',borderRadius:3,padding:2}})
          :React.createElement('div',{style:{width:48,height:28,background:co.color||'#cc0000',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:700,textAlign:'center',lineHeight:1.1}},
            (co.name||'').split(' ').map(w=>w[0]||'').slice(0,3).join('')),
        React.createElement('div',{style:{flex:1,minWidth:0}},
          React.createElement('div',{style:{fontWeight:700,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},co.name||'—'),
          React.createElement('div',{style:{fontSize:10,color:MT}},co.sub||''),
          React.createElement('div',{style:{fontSize:10,color:MT,marginTop:2}},
            'CE Prefix: ',React.createElement('b',null,co.cePrefix||'SHIC'),
            '  Doc No: ',React.createElement('b',null,co.docNo||'—'),
            '  Rev: ',React.createElement('b',null,co.revNo||'0'))
        ),
        editId!==co.id&&React.createElement('div',{style:{display:'flex',gap:6,flexShrink:0}},
          React.createElement('button',{style:btn('def',true),onClick:()=>startEdit(co)},'Edit'),
          companies.length>1&&React.createElement('button',{style:btn('danger',true),onClick:()=>delCo(co.id)},'Del')
        )
      ),

      /* Inline editor */
      editId===co.id&&draft&&React.createElement('div',{style:{padding:14,borderTop:'1px solid '+BDR}},
        React.createElement('div',{style:G},
          React.createElement('div',{style:{gridColumn:'1/-1'}},
            React.createElement('label',{style:LBL},'Company Name'),
            React.createElement('input',{style:INP,value:draft.name||'',onChange:e=>setDraft(p=>({...p,name:e.target.value})),placeholder:'SYNERCORE'})
          ),
          React.createElement('div',{style:{gridColumn:'1/-1'}},
            React.createElement('label',{style:LBL},'Sub-heading / Division'),
            React.createElement('input',{style:INP,value:draft.sub||'',onChange:e=>setDraft(p=>({...p,sub:e.target.value})),placeholder:'HEAVY INDUSTRIES CORP.'})
          ),
          React.createElement('div',null,
            React.createElement('label',{style:LBL},'CE Number Prefix'),
            React.createElement('input',{style:INP,value:draft.cePrefix||'',onChange:e=>setDraft(p=>({...p,cePrefix:e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')})),placeholder:'SHIC'}),
            React.createElement('div',{style:{fontSize:10,color:MT,marginTop:3}},'CE numbers: '+(draft.cePrefix||'SHIC')+'-CE-'+new Date().getFullYear()+'-0001')
          ),
          React.createElement('div',null,
            React.createElement('label',{style:LBL},'Document No.'),
            React.createElement('input',{style:INP,value:draft.docNo||'',onChange:e=>setDraft(p=>({...p,docNo:e.target.value})),placeholder:'SHIC-F-TSG025'})
          ),
          React.createElement('div',null,
            React.createElement('label',{style:LBL},'Revision No.'),
            React.createElement('input',{style:INP,value:draft.revNo||'',onChange:e=>setDraft(p=>({...p,revNo:e.target.value})),placeholder:'0'})
          ),
          React.createElement('div',null,
            React.createElement('label',{style:LBL},'Revision Date'),
            React.createElement('input',{style:{...INP,colorScheme:'dark'},type:'date',value:draft.revDate||'',onChange:e=>setDraft(p=>({...p,revDate:e.target.value}))})
          ),
          React.createElement('div',null,
            React.createElement('label',{style:LBL},'Brand Color'),
            React.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},
              React.createElement('input',{type:'color',value:draft.color||'#cc0000',onChange:e=>setDraft(p=>({...p,color:e.target.value})),style:{width:40,height:32,border:'none',borderRadius:4,cursor:'pointer'}}),
              React.createElement('span',{style:{fontSize:11,color:MT}},'Company name color')
            )
          ),
          React.createElement('div',{style:{gridColumn:'1/-1'}},
            React.createElement('label',{style:LBL},'Company Logo'),
            React.createElement('div',{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}},
              draft.logo&&React.createElement('img',{src:draft.logo,style:{maxWidth:80,maxHeight:36,objectFit:'contain',border:'1px solid '+BDR,borderRadius:4,padding:4,background:'#fff'}}),
              React.createElement('input',{type:'file',id:'co-logo-'+co.id,accept:'image/*',style:{display:'none'},onChange:handleLogo}),
              React.createElement('button',{style:btn('acc',true),onClick:()=>document.getElementById('co-logo-'+co.id).click()},'Upload Logo'),
              draft.logo&&React.createElement('button',{style:{...btn('danger',true),marginLeft:4},onClick:()=>setDraft(p=>({...p,logo:''}))},'Remove')
            ),
            React.createElement('div',{style:{fontSize:10,color:MT,marginTop:4}},'PNG/JPG/SVG, max 300KB.')
          )
        ),
        React.createElement('div',{style:{display:'flex',gap:8,marginTop:4}},
          React.createElement('button',{style:btn('acc'),onClick:saveEdit},'Save'),
          React.createElement('button',{style:btn('def'),onClick:cancelEdit},'Cancel')
        )
      )
    ))
  );
}
