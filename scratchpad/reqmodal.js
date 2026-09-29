reqForm && (() => {
  const set = (k, v) => setReqForm(p => ({...p, [k]: v}));
  /* One item's answer, or its remark, without disturbing the other twelve. */
  const setItem = (n, patch) => setReqForm(p => ({...p, items: {...(p.items || {}), [n]: {...((p.items || {})[n] || {}), ...patch}}}));
  const L = (label, el) => /*#__PURE__*/React.createElement("label", {style:{display:'flex',flexDirection:'column',gap:3,fontSize:11,color:MT}}, label, el);
  const inp = (k, extra) => /*#__PURE__*/React.createElement("input", {style:INP, value:reqForm[k] || '', onChange:e=>set(k, e.target.value), ...(extra || {})});
  const sect = (title, note) => /*#__PURE__*/React.createElement("div", {style:{marginTop:16,marginBottom:8,borderTop:'1px solid '+BDR,paddingTop:10}},
    /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:11,letterSpacing:'.5px',color:TX}}, title),
    note && /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginTop:2}}, note));
  const grid = (...kids) => /*#__PURE__*/React.createElement("div", {style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10}}, ...kids);
  const missing = rceUnanswered(reqForm);
  const answered = RCE_ITEMS.length - missing.length;
  return /*#__PURE__*/React.createElement("div", {
    style:{position:'fixed',inset:0,background:'#000b',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},
    onClick:()=>{ if (!reqBusy) setReqForm(null); }
  }, /*#__PURE__*/React.createElement("div", {
    style:{...CS, width:'min(760px,100%)', maxHeight:'92vh', overflow:'auto'}, onClick:e=>e.stopPropagation()
  },
    /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:14,marginBottom:2}}, "Request for Costing (RCE) Checklist"),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginBottom:10,...MONO}}, "SHIC-F-SMD-002 Rev 01"),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:11,marginBottom:12}},
      "Logs the request in CE Monitoring, assigns it, and sends whatever came with it. The estimator Loads it, builds the estimate, and Saves under the same number."),

    sect("THE INQUIRY"),
    grid(
      L("CE Number *", inp('ceNum', {style:{...INP,...MONO}})),
      L("Inquiry number", inp('inquiryNo', {placeholder:'e.g. HSAB - RFQ 130000516', style:{...INP,...MONO}})),
      L("RCE No.", inp('rceNo', {placeholder:'From Sales', style:{...INP,...MONO}})),
      L("Inquiry date", inp('inquiryDate', {type:'date'})),
      L("Submission deadline", inp('deadline', {type:'date'})),
      L("Completion date", inp('completionDate', {type:'date'})),
      L("Date received", inp('dateRecv', {type:'date'})),
      L("Assigned sales", inp('assignedSales', {placeholder:'Who took the inquiry'}))
    ),

    sect("THE CUSTOMER AND THE WORK"),
    grid(
      L("Customer *", inp('client', {placeholder:'e.g. SLTEC'})),
      L("Work location", inp('workLocation', {placeholder:'Where the work happens'}))
    ),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Address", inp('address', {placeholder:'Site or office address as the inquiry gives it'}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Project title", /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:46,resize:'vertical'}, value:reqForm.description, placeholder:'What the client is asking for', onChange:e=>set('description', e.target.value)}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, grid(
      L("Assigned to *", /*#__PURE__*/React.createElement(React.Fragment, null,
        inp('assignee', {list:'req-users', placeholder:'Estimator'}),
        /*#__PURE__*/React.createElement("datalist", {id:'req-users'}, reqUsers.map(u => /*#__PURE__*/React.createElement("option", {key:u.username, value:u.name || u.username}))))),
      L("Inquiry type", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.inquiryType || '', onChange:e=>set('inquiryType', e.target.value)},
        /*#__PURE__*/React.createElement("option", {value:''}, '--'),
        RCE_INQUIRY_TYPES.map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, k)))),
      L("Discipline", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.projType, onChange:e=>set('projType', e.target.value)},
        ['Electrical', 'Mechanical', 'Civil', 'General'].map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, k)))),
      L("CE Type", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.ceType, onChange:e=>set('ceType', e.target.value)},
        Object.keys(CE_CFG).map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, ceTypeLabel(k))))),
      L("Project stage", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.stage || '', onChange:e=>set('stage', e.target.value)},
        RCE_STAGES.map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, k))))
    )),

    sect("COMPLETE?", "Every item is answered. No is not a refusal -- it is the record of what did not arrive, and item 14.2 is the recommendation that follows from it."),
    /*#__PURE__*/React.createElement("div", {style:{border:'1px solid '+BDR,borderRadius:7,overflow:'hidden'}},
      RCE_ITEMS.map((it, ix) => {
        const cur = (reqForm.items || {})[it.n] || {};
        return /*#__PURE__*/React.createElement("div", {
          key:it.n,
          style:{display:'grid',gridTemplateColumns:'26px 1fr 150px',gap:8,alignItems:'center',padding:'6px 9px',
            background: ix % 2 ? 'transparent' : alpha(TX, '06'),
            borderLeft:'3px solid ' + (cur.v === 'yes' ? OK : cur.v === 'no' ? ERR : cur.v === 'na' ? MT : 'transparent')}
        },
          /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,...MONO}}, it.n),
          /*#__PURE__*/React.createElement("div", null,
            /*#__PURE__*/React.createElement("div", {style:{fontSize:11.5,color: cur.v ? TX : MT}}, it.t),
            /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:5,marginTop:4}},
              RCE_ANSWERS.map(a => /*#__PURE__*/React.createElement("button", {
                key:a.v, disabled:reqBusy, onClick:()=>setItem(it.n, {v: cur.v === a.v ? '' : a.v}),
                title: a.v === 'no' ? 'This did not come with the inquiry' : a.v === 'na' ? 'This does not apply to this inquiry' : 'This came with the inquiry',
                style:{fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:5,cursor:'pointer',
                  border:'1px solid ' + (cur.v === a.v ? 'transparent' : BDR),
                  background: cur.v !== a.v ? 'transparent' : a.v === 'yes' ? OK : a.v === 'no' ? ERR : MT,
                  color: cur.v === a.v ? '#fff' : MT}
              }, a.t)))),
          /*#__PURE__*/React.createElement("input", {
            style:{...INP,fontSize:10.5,padding:'4px 7px'}, disabled:reqBusy, placeholder:'Remarks',
            value:cur.r || '', onChange:e=>setItem(it.n, {r: e.target.value})
          }));
      })),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:6,fontSize:10,color: missing.length ? ACC : OK}},
      missing.length
        ? answered + ' of ' + RCE_ITEMS.length + ' answered. Next unanswered: item ' + missing[0].n + ', ' + missing[0].t + '.'
        : 'All ' + RCE_ITEMS.length + ' items answered.'),

    sect("14. RECOMMENDATION"),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexDirection:'column',gap:5}},
      RCE_RECOMMENDATIONS.map(r => /*#__PURE__*/React.createElement("button", {
        key:r.v, disabled:reqBusy, onClick:()=>set('recommendation', reqForm.recommendation === r.v ? '' : r.v),
        style:{textAlign:'left',fontSize:11.5,padding:'7px 11px',borderRadius:6,cursor:'pointer',
          border:'1px solid ' + (reqForm.recommendation === r.v ? 'transparent' : BDR),
          background: reqForm.recommendation !== r.v ? 'transparent' : r.v === 'decline' ? ERR : r.v === 'secure' ? ACC : OK,
          color: reqForm.recommendation !== r.v ? TX : r.v === 'secure' ? ON_ACC : '#fff', fontWeight: reqForm.recommendation === r.v ? 700 : 400}
      }, r.t))),
    reqForm.recommendation === 'decline' && /*#__PURE__*/React.createElement("div", {style:{marginTop:10}},
      L("Reason to decline / no quote *", /*#__PURE__*/React.createElement("textarea", {
        style:{...INP,height:46,resize:'vertical'}, value:reqForm.declineReason || '', disabled:reqBusy,
        placeholder:'Why SHIC is not quoting this one', onChange:e=>set('declineReason', e.target.value)}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Other remarks", /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:46,resize:'vertical'}, value:reqForm.otherRemarks || '', placeholder:'Anything the estimator should know that no item above covers', onChange:e=>set('otherRemarks', e.target.value)}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Remarks for CE Monitoring", /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:40,resize:'vertical'}, value:reqForm.remarks, placeholder:'Site visit needed, contact person, anything not to forget...', onChange:e=>set('remarks', e.target.value)}))),

    /* Chosen here, sent the moment the request has a row to hang them on. */
    sect("DOCUMENTS THAT CAME WITH IT"),
    /*#__PURE__*/React.createElement("div", {style:{border:'1px dashed '+BDR,borderRadius:6,padding:9}},
      /*#__PURE__*/React.createElement("input", {
        type:'file', multiple:true, disabled:reqBusy, style:{fontSize:11,color:MT,width:'100%'},
        onChange:e=>{ const picked=Array.from(e.target.files||[]); if(picked.length) setReqFiles(p=>p.concat(picked.filter(f=>!p.some(x=>x.name===f.name&&x.size===f.size)))); e.target.value=''; }
      }),
      reqFiles.length > 0 && /*#__PURE__*/React.createElement("div", {style:{marginTop:8,display:'flex',flexDirection:'column',gap:4}},
        reqFiles.map((f, i) => /*#__PURE__*/React.createElement("div", {key:f.name+i, style:{display:'flex',alignItems:'center',gap:8,fontSize:11}},
          /*#__PURE__*/React.createElement("span", {style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, '📎 ' + f.name),
          /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:10,whiteSpace:'nowrap'}}, Math.max(1, Math.round(f.size/1024)).toLocaleString('en-US') + ' KB'),
          /*#__PURE__*/React.createElement("button", {
            style:{...btn('def',true),fontSize:10,padding:'1px 7px'}, disabled:reqBusy,
            title:'Take this one off the request', onClick:()=>setReqFiles(p=>p.filter((_x,k)=>k!==i))
          }, '✕')))),
      /*#__PURE__*/React.createElement("div", {style:{marginTop:6,fontSize:10,color:MT}},
        reqFiles.length
          ? reqFiles.length + ' file(s) go up as soon as the request is logged. More can be added afterwards from the 📎 button.'
          : 'Drawings, TOR, the RFQ, a PO -- anything the estimator needs. They can also be added afterwards from the 📎 button.')),

    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14,alignItems:'center'}},
      /*#__PURE__*/React.createElement("div", {style:{flex:1,fontSize:10,color:MT}},
        'Prepared by ' + (currentUser.name || currentUser.username || '')),
      /*#__PURE__*/React.createElement("button", {style:btn('def'), disabled:reqBusy, onClick:()=>{setReqFiles([]);setReqForm(null);}}, "Cancel"),
      /*#__PURE__*/React.createElement("button", {style:btn('acc'), disabled:reqBusy, onClick:submitRequest},
        reqBusy ? "Logging..." : (reqFiles.length ? "Log request & send " + reqFiles.length + " file(s)" : "Log request"))
    )
  ));
})(),
