/* The Dashboard tab: the numbers across every CE, the open pipeline and the overdue requests.

   Moved out of App.js unchanged. It is invoked as DashboardTab({...}) from App's render, never as an element, because it is not a
   component of its own: it holds no state and no hooks, and everything it reads comes in through `ctx` -- the App state and helpers it
   used to reach by closure. The two lists' filter boxes and "show all" state still live in App (dashQ, dashReqQ, dashAll) so they
   survive leaving the tab. */
function DashboardTab(ctx) {
  const {
    dashAll,
    dashQ,
    dashReqQ,
    getStatusColor,
    history,
    monOf,
    monRows,
    reqDeadline,
    setDashAll,
    setDashQ,
    setDashReqQ
  } = ctx;

  const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();
  /* R01 of a CE is the same job, priced again. Counted as its own CE it was
     an extra row in every tally on this page and its whole value again in the
     pipeline -- so a job revised twice reported three times the money it could
     ever bring in. Every figure below is of the NEWEST revision only. */
  const liveOnly = rows => groupCERevisions(rows, h => (h.info && h.info.ceNum) || h.ceNum || '').map(g => g.head);
  const liveHist = liveOnly(history), liveRows = liveOnly(monRows);
  const supersededN = history.length - liveHist.length;
  const monthHist = liveHist.filter(h => { const d=new Date(h.savedAt||h.createdAt||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; });
  const totalThis = monthHist.reduce((s,h)=>s+N(h.grand||0),0);
  const avgVal = liveHist.length ? liveHist.reduce((s,h)=>s+N(h.grand||0),0)/liveHist.length : 0;
  const statuses = liveRows.map(h=>monOf(h).status||'Draft');
  /* An "open" CE is one still needing work. Submitted, No Quote and Cancelled
     CE_CLOSED_STATUSES are the end states -- everything else, Draft and On
     Hold included, is open.
     Sorted by deadline so the next thing due is the first thing read. A CE
     with no deadline set cannot be ranked, so it sorts to the bottom; as a
     plain string compare an empty deadline would sort to the very top and
     bury the genuinely urgent rows. */
  /* A request nobody has accepted is not a CE yet: it is counted once, in Requests Awaiting Review, and not again as an open CE. */
  const isUnacceptedReq = h => { const i = h.info || {}; return !!(i.request && !i.acceptedCeNum); };
  const reqAwaitingN = liveRows.filter(h => isUnacceptedReq(h) && !h._draft && typeof h.id === 'number' && (h.info || {}).reviewStatus !== 'returned' && (h.info || {}).reviewStatus !== 'declined').length;
  const reqReturnedN = liveRows.filter(h => isUnacceptedReq(h) && !h._draft && (h.info || {}).reviewStatus === 'returned').length;
  /* Overdue: still waiting on the team (not accepted, returned or declined) and past its submission deadline. A request with no deadline
     is given the same three days from the inquiry date the form uses. */
  const _today = new Date(); _today.setHours(0, 0, 0, 0);
  /* The overdue ones themselves, most late first, each with how many days past its deadline. */
  const reqOverdueRows = liveRows.map(h => {
    const i = h.info || {};
    if (!isUnacceptedReq(h) || h._draft || typeof h.id !== 'number' || i.reviewStatus === 'returned' || i.reviewStatus === 'declined') return null;
    const m = monOf(h), r = i.rce || {};
    const dl = m.deadline || r.deadline || reqDeadline('', r.inquiryDate, m.dateRecv || i.date);
    const d = dl ? new Date(dl + 'T00:00:00') : null;
    return (d && !isNaN(d) && d < _today) ? {h, m, dl, late: Math.round((_today - d) / 86400000)} : null;
  }).filter(Boolean).sort((a, b) => b.late - a.late);
  const reqOverdueN = reqOverdueRows.length;
  /* The filter box on the overdue requests: every word typed must be found in some column, in any order. */
  const _rq = String(dashReqQ || '').toLowerCase().split(/\s+/).filter(Boolean);
  const reqShown = !_rq.length ? reqOverdueRows : reqOverdueRows.filter(x => {
    const hay = [x.h.info?.requestNum || x.m.rceNo || x.h.info?.ceNum || x.h.ceNum, x.h.info?.client || x.m.customer, x.m.jobTitle || x.h.info?.description,
      x.h.info?.projType || x.m.designation, x.m.ceeName, x.m.receivedBy, x.m.preparedBy, x.m.status || 'Pending'].join(' ').toLowerCase();
    return _rq.every(w => hay.indexOf(w) >= 0);
  });
  const openCEs = liveRows.filter(h => !isUnacceptedReq(h)).map(h => ({h, m: monOf(h)}))
    .filter(x => ceIsOpen(x.m.status))
    .sort((a, b) => {
      const da = a.m.deadline || '', db = b.m.deadline || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : da > db ? 1 : 0;
    });
  const openValue = openCEs.reduce((t, x) => t + N(x.h.grand || 0), 0);
  /* The filter box: every word typed must be found in some column of the row, in any order. */
  const _dq = String(dashQ || '').toLowerCase().split(/\s+/).filter(Boolean);
  const openShown = !_dq.length ? openCEs : openCEs.filter(x => {
    const hay = [x.h.info?.ceNum || x.h.ceNum, x.m.rceNo || x.h.info?.requestNum || x.h.info?.rceNo, x.h.info?.client || x.h.client, x.m.jobTitle || x.h.info?.description,
      x.h.info?.projType || x.m.designation, x.m.ceeName, x.m.preparedBy, x.m.receivedBy, x.m.status || 'Draft'].join(' ').toLowerCase();
    return _dq.every(w => hay.indexOf(w) >= 0);
  });
  const statusCount = statuses.reduce((m,s)=>{m[s]=(m[s]||0)+1;return m;},{});
  const clients = {}; liveHist.forEach(h=>{const c=h.info?.client||h.client||'Unknown';clients[c]=(clients[c]||{count:0,total:0});clients[c].count++;clients[c].total+=N(h.grand||0);});
  const top5 = Object.entries(clients).sort((a,b)=>b[1].total-a[1].total).slice(0,5);
  const prefixMap = {}; liveHist.forEach(h=>{const cn=(h.info?.ceNum||'').toUpperCase();const pfx=cn.split('-CE-')[0]||'?';prefixMap[pfx]=(prefixMap[pfx]||{count:0,total:0});prefixMap[pfx].count++;prefixMap[pfx].total+=N(h.grand||0);});
  const months=[]; for(let i=5;i>=0;i--){const d=new Date(thisYear,thisMonth-i,1);months.push({label:d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2),month:d.getMonth(),year:d.getFullYear()});}
  const monthTotals = months.map(m=>({...m,total:liveHist.filter(h=>{const d=new Date(h.savedAt||0);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).reduce((s,h)=>s+N(h.grand||0),0)}));
  const maxBar = Math.max(...monthTotals.map(m=>m.total),1);
  const kpiCard = (label,value,color) => /*#__PURE__*/React.createElement("div",{style:{background:SURF,border:'1px solid '+BDR,borderRadius:8,padding:'14px 18px',flex:1,minWidth:140}},
    /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:4}},label),
    /*#__PURE__*/React.createElement("div",{style:{fontSize:20,fontWeight:800,color:color||TX,...MONO}},value));
  return /*#__PURE__*/React.createElement("div",{style:{padding:'0 0 24px'}},
    /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:15,marginBottom:supersededN?4:16,color:ACC}}, "📊 Dashboard"),
    /* Said out loud, because a figure that quietly drops is a figure nobody
       trusts: these numbers moved the day revisions stopped being counted. */
    supersededN > 0 && /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:16}},
      'Counting the newest revision of each CE — ' + supersededN + ' superseded revision' +
      (supersededN === 1 ? '' : 's') + ' excluded from every figure below.'),
    /* KPI row */
    /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}},
      kpiCard('CEs This Month', monthHist.length, INFO),
      kpiCard('Value This Month', '₱'+ph(totalThis), OK),
      kpiCard('Avg CE Value', '₱'+ph(avgVal), ACC),
      kpiCard('Total CEs', history.length, MT),
      kpiCard('Open CEs', openCEs.length, ERR),
      /* What the Cost Estimation team has to decide on. Returned ones are with their requestors, so they are named but not counted. */
      kpiCard('Requests Awaiting Review' + (reqReturnedN ? ' (' + reqReturnedN + ' returned)' : ''), reqAwaitingN, reqAwaitingN ? ACC : MT),
      kpiCard('Overdue Requests', reqOverdueN, reqOverdueN ? ERR : MT)),
    /* Monthly trend */
    /*#__PURE__*/React.createElement("div",{style:{...CS,marginBottom:16}},
      /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:12,fontSize:12}}, "📈 Monthly Trend (Last 6 Months)"),
      /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:8,alignItems:'flex-end',height:80}},
        monthTotals.map(m => {
          const pct = maxBar>0?(m.total/maxBar):0;
          return /*#__PURE__*/React.createElement("div",{key:m.label,style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}},
            /*#__PURE__*/React.createElement("div",{style:{fontSize:9,color:MT,...MONO}}, m.total>0?'₱'+ph(m.total):'—'),
            /*#__PURE__*/React.createElement("div",{style:{width:'100%',background:ACC+(m.total>0?'cc':'22'),borderRadius:'3px 3px 0 0',height:Math.max(4,pct*60)+'px',transition:'height .3s'}}),
            /*#__PURE__*/React.createElement("div",{style:{fontSize:9,color:MT,whiteSpace:'nowrap'}},m.label));
        }))),
    /* Overdue requests: which ones, not only how many. */
    reqOverdueN > 0 && /*#__PURE__*/React.createElement("div",{style:{...CS,marginBottom:16}},
      /*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:12,color:ERR}}, "\u26A0 Overdue requests"),
        /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT}}, _rq.length ? reqShown.length + ' of ' + reqOverdueN : reqOverdueN, " waiting on the team, past their deadline")),
      /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
        /*#__PURE__*/React.createElement("input",{type:'search',value:dashReqQ,placeholder:'Filter requests: RCE no., customer, job, estimator, received by\u2026','aria-label':'Filter overdue requests',onChange:e=>setDashReqQ(e.target.value),style:{...INP,flex:1,maxWidth:420,fontSize:12,padding:'5px 10px'}}),
        dashReqQ && /*#__PURE__*/React.createElement("button",{style:btn('def',true),onClick:()=>setDashReqQ('')},'Clear')),
      /*#__PURE__*/React.createElement("div",{style:{overflowX:'auto'}},
        /*#__PURE__*/React.createElement("table",{style:{width:'100%',borderCollapse:'collapse',fontSize:11}},
          /*#__PURE__*/React.createElement("thead",null,/*#__PURE__*/React.createElement("tr",null,
            ['RCE No.','Customer','Job Title','Discipline','Estimator','Received By','Date Recv.','Deadline','Days Late'].map(hd=>/*#__PURE__*/React.createElement("th",{key:hd,style:THS},hd)))),
          /*#__PURE__*/React.createElement("tbody",null, reqShown.slice(0, dashAll.over ? reqShown.length : 15).map(x=>/*#__PURE__*/React.createElement("tr",{key:x.h.id},
            /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,color:INFO,fontWeight:600,whiteSpace:'nowrap'}}, x.h.info?.requestNum || x.m.rceNo || x.h.info?.ceNum || x.h.ceNum || '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:TDS}, x.h.info?.client || x.m.customer || '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:{...TDS,maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},title:x.m.jobTitle || x.h.info?.description || ''}, x.m.jobTitle || x.h.info?.description || '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:TDS}, x.h.info?.projType || x.m.designation || '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:{...TDS,whiteSpace:'nowrap'}}, String(x.m.ceeName || '').replace(/^Unassigned$/, '') || '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:{...TDS,whiteSpace:'nowrap'}}, x.m.receivedBy || '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,whiteSpace:'nowrap'}}, x.m.dateRecv ? new Date(x.m.dateRecv+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,whiteSpace:'nowrap'}}, new Date(x.dl+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'})),
            /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,color:ERR,fontWeight:700,whiteSpace:'nowrap'}}, x.late + 'd')))))),
      reqShown.length === 0 && /*#__PURE__*/React.createElement("div",{style:{fontSize:12,color:MT,textAlign:'center',padding:'12px 0'}}, 'No overdue request matches "' + dashReqQ + '".'),
      reqShown.length > 15 && /*#__PURE__*/React.createElement("div",{style:{fontSize:11,marginTop:8,textAlign:'center'}},
        /*#__PURE__*/React.createElement("button",{style:btn('def',true),onClick:()=>setDashAll(p=>({...p,over:!p.over}))}, dashAll.over ? 'Show the first 15' : 'Show all ' + reqShown.length + (_rq.length ? ' matching' : '') + ' overdue requests'))),
    /* Open CEs, soonest deadline first */
    /*#__PURE__*/React.createElement("div",{style:{...CS,marginBottom:16}},
      /*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10,gap:10,flexWrap:'wrap'}},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:12}}, "⏳ Open CEs — by deadline"),
        /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT}}, _dq.length ? openShown.length + ' of ' + openCEs.length : openCEs.length, " open · ",
          /*#__PURE__*/React.createElement("span",{style:{...MONO,color:OK}}, "₱"+ph(openValue)))),
      openCEs.length > 0 && /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
        /*#__PURE__*/React.createElement("input",{type:'search',value:dashQ,placeholder:'Filter open CEs: CE no., client, job, estimator, status\u2026','aria-label':'Filter open CEs',onChange:e=>setDashQ(e.target.value),style:{...INP,flex:1,maxWidth:420,fontSize:12,padding:'5px 10px'}}),
        dashQ && /*#__PURE__*/React.createElement("button",{style:btn('def',true),onClick:()=>setDashQ('')},'Clear')),
      openCEs.length === 0
        ? /*#__PURE__*/React.createElement("div",{style:{textAlign:'center',padding:'14px 0',color:MT,fontSize:12,border:'1px dashed '+BDR,borderRadius:6}}, "Nothing open — every CE is Submitted, No Quote or Cancelled.")
        : /*#__PURE__*/React.createElement("div",null,
            /*#__PURE__*/React.createElement("div",{style:{overflow:'auto',maxHeight:dashAll.open ? 560 : 'none'}},
              /*#__PURE__*/React.createElement("table",{style:{width:'100%',borderCollapse:'collapse',fontSize:11}},
                /*#__PURE__*/React.createElement("thead",{style:{position:'sticky',top:0,background:CARD,zIndex:1}},/*#__PURE__*/React.createElement("tr",null,
                  ['CE No.','RCE No.','Client','Job Title','Discipline','Estimator','Received By','Date Recv.','Status','Deadline','Days Left','Total'].map(hd=>/*#__PURE__*/React.createElement("th",{key:hd,style:THS},hd)))),
                /*#__PURE__*/React.createElement("tbody",null, openShown.slice(0, dashAll.open ? openShown.length : 15).map(x=>{
                  const st = x.m.status || 'Draft';
                  const dl = x.m.deadline ? new Date(x.m.deadline+'T00:00:00') : null;
                  const days = dl ? Math.round((dl - new Date())/(1000*60*60*24)) : null;
                  const dCol = days === null ? MT : days < 0 ? ERR : days <= 7 ? 'var(--status-warning)' : OK;
                  return /*#__PURE__*/React.createElement("tr",{key:x.h.id},
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,color:INFO,fontWeight:600}}, x.h.info?.ceNum || x.h.ceNum || "—"),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,whiteSpace:'nowrap'}}, x.m.rceNo || x.h.info?.requestNum || x.h.info?.rceNo || '\u2014'),
                    /*#__PURE__*/React.createElement("td",{style:TDS}, x.h.info?.client || x.h.client || 'Unknown'),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},title:x.m.jobTitle || x.h.info?.description || ''}, x.m.jobTitle || x.h.info?.description || '\u2014'),
                    /*#__PURE__*/React.createElement("td",{style:TDS}, x.h.info?.projType || x.m.designation || '\u2014'),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,whiteSpace:'nowrap'}}, String(x.m.ceeName || '').replace(/^Unassigned$/, '') || x.m.preparedBy || '\u2014'),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,whiteSpace:'nowrap'}}, x.m.receivedBy || '\u2014'),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,whiteSpace:'nowrap'}}, x.m.dateRecv ? new Date(x.m.dateRecv+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : '\u2014'),
                    /*#__PURE__*/React.createElement("td",{style:TDS}, /*#__PURE__*/React.createElement("span",{style:{background:getStatusColor(st)+'33',color:getStatusColor(st),borderRadius:4,padding:'1px 6px',fontWeight:700,whiteSpace:'nowrap'}}, st)),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,whiteSpace:'nowrap'}}, dl ? dl.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : "—"),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,color:dCol,fontWeight:700,whiteSpace:'nowrap'}}, days === null ? "—" : days < 0 ? Math.abs(days)+'d OD' : days+'d'),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,textAlign:'right'}}, "₱"+ph(N(x.h.grand||0))));
                }))),
            openShown.length === 0 && /*#__PURE__*/React.createElement("div",{style:{fontSize:12,color:MT,textAlign:'center',padding:'12px 0'}}, 'No open CE matches "' + dashQ + '".'),
            openShown.length > 15 && /*#__PURE__*/React.createElement("div",{style:{fontSize:11,marginTop:8,textAlign:'center'}},
              /*#__PURE__*/React.createElement("button",{style:btn('def',true),onClick:()=>setDashAll(p=>({...p,open:!p.open}))}, dashAll.open ? 'Show the first 15' : 'Show all ' + openShown.length + (_dq.length ? ' matching' : '') + ' open CEs'))))),
    /* Bottom row: by company + by status + top clients */
    /*#__PURE__*/React.createElement("div",{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,flexWrap:'wrap'}},
      /* By company */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏢 By Company Prefix"),
        Object.entries(prefixMap).map(([pfx,d])=>/*#__PURE__*/React.createElement("div",{key:pfx,style:{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}},
          /*#__PURE__*/React.createElement("span",{style:{color:INFO,fontWeight:600}},pfx),
          /*#__PURE__*/React.createElement("span",{style:{color:MT}},d.count,' CE · '),
          /*#__PURE__*/React.createElement("span",{style:{...MONO,fontSize:11}}, '₱'+ph(d.total))))),
      /* By status */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏷 By Status"),
        Object.entries(statusCount).sort((a,b)=>b[1]-a[1]).map(([s,c])=>/*#__PURE__*/React.createElement("div",{key:s,style:{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}},
          /*#__PURE__*/React.createElement("span",null,s),
          /*#__PURE__*/React.createElement("span",{style:{background:alpha(ACC, '33'),color:ACC,borderRadius:4,padding:'0 6px',fontWeight:700}},c)))),
      /* Top clients */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏆 Top 5 Clients"),
        top5.map(([name,d],i)=>/*#__PURE__*/React.createElement("div",{key:name,style:{marginBottom:6,fontSize:11}},
          /*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between'}},
            /*#__PURE__*/React.createElement("span",{style:{color:i===0?ACC:TX}}, (i+1)+'. '+name),
            /*#__PURE__*/React.createElement("span",{style:{color:MT}},d.count,' CE')),
          /*#__PURE__*/React.createElement("div",{style:{...MONO,fontSize:10,color:OK}},'₱'+ph(d.total)))))));
}
