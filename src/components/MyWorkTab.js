/* The My Work tab: everything waiting on the signed-in user, in one place.

   Moved out of App.js unchanged. Invoked as MyWorkTab({...}) from the render of App, never as an element: it holds no state or hooks,
   and everything it reads comes in through ctx. */
function MyWorkTab(ctx) {
  const {
    currentUser,
    getStatusColor,
    handleLoad,
    isRequestor,
    meNames,
    monOf,
    monRows,
    mwOpen,
    mwQ,
    mwReqQ,
    myTodo,
    openRequest,
    openReview,
    reqDeadline,
    resumeDraft,
    setMwOpen,
    setMwQ,
    setMwReqQ,
    setRceReview,
    setTab,
    setViewCE,
    sharedDrafts
  } = ctx;

  const me = currentUser.username, names = meNames();
  const heads = groupCERevisions(monRows, h => (h.info && h.info.ceNum) || h.ceNum || '').map(g => g.head);
  const rows = heads.map(e => ({e, m: monOf(e)}));
  const isMine = x => ceeMatches(names, x.m.ceeName || x.m.preparedBy || x.e.savedBy || '') || x.e.savedBy === me;
  const mine = rows.filter(x => !x.e._draft && isMine(x));
  const apv = x => x.m.apv || {};
  const toSign = myTodo.sign, returned = myTodo.returned;
  const inApproval = mine.filter(x => apv(x).state === 'pending');
  /* A logged request nobody has accepted cannot be loaded (it has no CE number yet); the team reviews it here. */
  const _unaccepted = x => { const i = ((x.e && x.e.data) || x.e || {}).info || x.e.info || {}; return !isRequestor && i.request && !i.acceptedCeNum && String(i.ceNum || '') === String(i.requestNum || '') && typeof x.e.id === 'number'; };
  /* Every logged request still waiting for the team, whoever it is assigned to: Review is how it gets accepted. */
  const awaitingReq = rows.filter(x => !x.e._draft && typeof x.e.id === 'number' && _unaccepted(x));
  /* Overdue requests: waiting on the Cost Estimation team and past their submission deadline. The team sees every one; a requestor sees their own. */
  const _todayMw = new Date(); _todayMw.setHours(0, 0, 0, 0);
  const _reqLate = x => { const i = x.e.info || {}, r = i.rce || {};
    if (!i.request || i.acceptedCeNum || i.reviewStatus === 'returned' || i.reviewStatus === 'declined' || x.e._draft || typeof x.e.id !== 'number') return false;
    const dl = x.m.deadline || r.deadline || reqDeadline('', r.inquiryDate, x.m.dateRecv || i.date), d = dl ? new Date(dl + 'T00:00:00') : null;
    return !!d && !isNaN(d) && d < _todayMw; };
  const overdueReq = (isRequestor ? rows.filter(x => x.m.receivedBy && names.includes(String(x.m.receivedBy).trim().toUpperCase()) || x.e.savedBy === me) : awaitingReq).filter(_reqLate);
  const forReview = rows.filter(x => !x.e._draft && x.m.status === 'For Approval' && !isMine(x) && !(apv(x).state === 'pending'));
  /* A request the Cost Estimation team returned is waiting on its requestor: it belongs in Returned to me. */
  const _retReq = x => { const i = x.e.info || {}; return isRequestor && !x.e._draft && i.request && !i.acceptedCeNum && i.reviewStatus === 'returned' && ((x.m.receivedBy && names.includes(String(x.m.receivedBy).trim().toUpperCase())) || x.e.savedBy === me); };
  const retReq = rows.filter(_retReq);
  const returnedAll = [...returned, ...retReq];
  const open = mine.filter(x => ceIsOpen(x.m.status) && apv(x).state !== 'pending' && !_retReq(x))
    .map(x => ({...x, dl: ceDeadline(x.m.deadline, x.m.dateSubmitted, x.m.status)}))
    .sort((a, b) => (a.dl.days == null) - (b.dl.days == null) || (a.dl.days || 0) - (b.dl.days || 0));
  /* Requests this user raised, wherever they have got to. `mine` stops matching
     once the estimator's first costed save flips savedBy, so a request that has
     moved on would vanish from here; receivedBy is stamped at request time and
     never changes, the same field mineToSee uses to keep it visible. */
  const sent = rows.filter(x => !x.e._draft && x.m.receivedBy && names.includes(String(x.m.receivedBy).trim().toUpperCase()));
  const drafts = (sharedDrafts || []).filter(d => d.savedBy === me);
  const now = new Date(), inMonth = v => { const d = v ? new Date(v) : null; return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };
  const subMonth = mine.filter(x => inMonth(x.m.dateSubmitted ? x.m.dateSubmitted + 'T00:00:00' : null) || (x.m.status === 'Submitted' && inMonth(x.m.statusChangedAt)));
  const timed = mine.map(x => ceDeadline(x.m.deadline, x.m.dateSubmitted, x.m.status)).filter(d => d.done && d.days != null);
  const onTime = timed.length ? Math.round(100 * timed.filter(d => !d.late).length / timed.length) : null;
  const yr = mine.filter(x => new Date(x.e.savedAt || 0).getFullYear() === now.getFullYear());
  const won = yr.filter(x => x.m.status === 'Awarded').length, lost = yr.filter(x => ['No Quote', 'Cancelled'].includes(x.m.status)).length;
  const overdue = open.filter(x => x.dl.late).length, dueSoon = open.filter(x => !x.dl.late && x.dl.days != null && x.dl.days <= 3).length;
  /* The filter box: every word typed must be found in some column of the row, in any order. It narrows the lists below; the cards above stay totals. */
  const _mq = String(mwQ || '').toLowerCase().split(/\s+/).filter(Boolean);
  const _mqHit = hay => _mq.every(w => String(hay).toLowerCase().indexOf(w) >= 0);
  const _rowHay = x => { const i = x.e.info || {}; return [i.ceNum || x.e.ceNum, i.requestNum, x.m.rceNo, i.client || x.m.customer, x.m.jobTitle || i.description, i.projType || x.m.designation, x.m.ceeName, x.m.preparedBy, x.m.receivedBy, x.m.status || 'Draft'].join(' '); };
  const mwF = list => !_mq.length ? list : list.filter(x => _mqHit(_rowHay(x)));
  const fToSign = mwF(toSign), fReturned = mwF(returnedAll), fOpen = mwF(open), fInApproval = mwF(inApproval), fSent = mwF(sent), fAwaiting = mwF(awaitingReq), fForReview = mwF(forReview);
  /* A requestor's own table of requests has its own box: every word typed must be found in the row, in any order. */
  const _rqw = String(mwReqQ || '').toLowerCase().split(/\s+/).filter(Boolean);
  const sentShown = !_rqw.length ? sent : sent.filter(x => { const hay = _rowHay(x) + ' ' + ((x.e.info && x.e.info.reviewStatus) || '') + ' ' + ((x.e.info && x.e.info.reviewNote) || ''); return _rqw.every(w => hay.toLowerCase().indexOf(w) >= 0); });
  const fDrafts = !_mq.length ? drafts : drafts.filter(d => _mqHit([d.info && d.info.ceNum, d.info && d.info.client, d.info && d.info.description, d.savedBy].join(' ')));
  const peso = v => '₱' + Math.round(N(v)).toLocaleString();
  const kpi = (label, val, sub, col) => /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:'12px 14px',minWidth:0}},
    /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,textTransform:'uppercase',letterSpacing:'.06em'}}, label),
    /*#__PURE__*/React.createElement("div", {style:{fontSize:24,fontWeight:800,color:col||'inherit',...MONO}}, val),
    sub && /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT}}, sub));
  /* A request nobody has accepted has no CE number: it shows as its RCE No. */
  const ceLabel = e => { const i = e.info || {}; return i.request && !i.acceptedCeNum ? 'RCE ' + (i.requestNum || i.ceNum || e.ceNum) : i.ceNum || e.ceNum || '(no number)'; };
  const line = (x, extra, actions) => /*#__PURE__*/React.createElement("div", {key: x.e.id, style:{display:'flex',alignItems:'center',gap:8,padding:'6px 2px',borderBottom:'1px solid '+alpha(BDR,'44'),fontSize:12}},
    /*#__PURE__*/React.createElement("b", {style:{...MONO,fontSize:11,whiteSpace:'nowrap'}}, ceLabel(x.e)),
    /*#__PURE__*/React.createElement("span", {style:{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:MT},
      title: [(x.e.info && x.e.info.client) || x.m.customer || '', x.m.jobTitle || (x.e.info && x.e.info.description) || ''].filter(Boolean).join(' · ')},
      [(x.e.info && x.e.info.client) || x.m.customer || '', x.m.jobTitle || (x.e.info && x.e.info.description) || ''].filter(Boolean).join(' · '),
      /* Which discipline it is and who it is with, so the list can be read without opening each one. */
      (() => { const d = (x.e.info && x.e.info.projType) || x.m.designation || '', who = String(x.m.ceeName || '').replace(/^Unassigned$/, '') || x.m.preparedBy || '';
        /* The RCE No. (a request already shows it as its label), who received it and when. */
        const i = x.e.info || {}, rce = (i.request && !i.acceptedCeNum) ? '' : String(x.m.rceNo || i.requestNum || i.rceNo || '').trim();
        const rcv = x.m.dateRecv ? new Date(x.m.dateRecv + 'T00:00:00').toLocaleDateString('en-PH', {month:'short', day:'numeric', year:'numeric'}) : '';
        const bits = [d, who && ('\u270E ' + who), rce && ('RCE ' + rce), x.m.receivedBy && ('from ' + x.m.receivedBy), rcv && ('recv ' + rcv)].filter(Boolean);
        return bits.length ? /*#__PURE__*/React.createElement("div", {style:{fontSize:10,opacity:.8}}, bits.join(' · ')) : null; })()),
    extra, actions);
  const viewBtn = x => typeof x.e.id === 'number' && /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setViewCE({id:x.e.id,ceNum:ceLabel(x.e)})}, "👁 View");
  const loadBtn = x => (isRequestor && (x.e.info || {}).request && !(x.e.info || {}).acceptedCeNum && typeof x.e.id === 'number')
    ? /*#__PURE__*/React.createElement("button", {style:btn('info',true),title:'Add what the Cost Estimation team asked for, then send it back',onClick:()=>openReview(x.e, 'update')}, "Update")
    : _unaccepted(x)
    ? /*#__PURE__*/React.createElement("button", {style:btn('ok',true),title:'Review the checklist and decide: proceed, secure the missing data first, or decline',onClick:()=>openReview(x.e, 'review')}, "Review")
    : /*#__PURE__*/React.createElement("button", {style:btn('acc',true),onClick:()=>handleLoad(x.e.data || x.e)}, "Load");
  const section = (title, list, render, empty) => /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:'12px 14px'}},
    /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:13,marginBottom:6}}, title, /*#__PURE__*/React.createElement("span", {style:{marginLeft:6,fontSize:11,color:MT}}, '(' + list.length + ')')),
    list.length ? list.slice(0, 15).map(render) : /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,padding:'6px 0'}}, empty),
    list.length > 15 && /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginTop:4}}, '+' + (list.length - 15) + ' more in CE Monitoring'));
  /* Three labelled, collapsible groups instead of eight boxes, all on one page so nothing is hidden behind a tab. Each header carries a
     count, in red when something there needs the user. A group with something in it starts open and an empty one starts folded; a
     click on a header changes that, and the page remembers the choice for the visit. A list with nothing in it is left out. */
  const mwPanel = items => {
    const n = [fToSign.length, fReturned.length, fOpen.length, fDrafts.length, fInApproval.length, isRequestor ? 0 : fSent.length, isRequestor ? 0 : fAwaiting.length, isRequestor ? 0 : fForReview.length];
    const groups = [
      {id: 'act', label: '\u26A1 Needs my action', idx: [0, 1, 6], urgent: true},
      {id: 'mine', label: '\uD83D\uDCC2 My CEs and drafts', idx: [2, 4, 3]},
      {id: 'req', label: '\uD83D\uDCE4 Requests and reviews', idx: [5, 7]}
    ].map(g => ({...g, count: g.idx.reduce((t, i) => t + n[i], 0)})).filter(g => g.id !== 'req' || !isRequestor);
    return /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexDirection:'column',gap:8}},
      groups.map(g => {
        const isOpen = mwOpen[g.id] != null ? mwOpen[g.id] : g.count > 0;
        return /*#__PURE__*/React.createElement("div", {key:g.id, style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,overflow:'hidden'}},
          /*#__PURE__*/React.createElement("button", {'aria-expanded': isOpen, onClick:() => setMwOpen(p => ({...p, [g.id]: !isOpen})),
            title: g.id === 'act' ? toSign.length + ' awaiting my signature \u00B7 ' + returnedAll.length + ' returned to me' + (isRequestor ? '' : ' \u00B7 ' + awaitingReq.length + ' requests awaiting review') : undefined,
            style:{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'transparent',border:'none',cursor:'pointer',color:TX,fontSize:13,fontWeight:700,textAlign:'left'}},
            /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11,width:12}}, isOpen ? '\u25BE' : '\u25B8'),
            g.label,
            /*#__PURE__*/React.createElement("span", {style:{minWidth:18,textAlign:'center',borderRadius:9,padding:'0 6px',fontSize:11,fontWeight:800,background:g.count ? (g.urgent ? ERR : ACC) : alpha(BDR,'66'),color:g.count ? '#fff' : MT}}, g.count)),
          isOpen && /*#__PURE__*/React.createElement("div", {style:{padding:'0 12px 12px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:12}},
            g.count ? g.idx.filter(i => n[i] > 0).map(i => /*#__PURE__*/React.createElement(React.Fragment, {key:i}, items[i])) : /*#__PURE__*/React.createElement("div", {style:{fontSize:12,color:MT,padding:'2px 4px'}}, _mq.length ? 'Nothing here matches "' + mwQ + '".' : g.id === 'act' ? 'Nothing needs you right now.' : g.id === 'mine' ? 'No open CEs, drafts or approvals of yours.' : 'No requests or reviews waiting.')));
      }));
  };
  return /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexDirection:'column',gap:12}},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("div", {style:{fontSize:18,fontWeight:800}}, 'Good ' + (now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening') + ', ' + String(currentUser.name || me).split(' ')[0]),
      /*#__PURE__*/React.createElement("span", {style:{fontSize:12,color:MT}}, toSign.length + returnedAll.length + overdue ? 'Here is what needs you today.' : 'Nothing urgent — you are all caught up.'),
      /*#__PURE__*/React.createElement("button", isRequestor
        ? {style:{...btn('acc',true),marginLeft:'auto'},onClick:openRequest,title:"Log a request for estimation: CE number, customer, deadline, who it is assigned to, and its documents"}
        : {style:{...btn('acc',true),marginLeft:'auto'},onClick:()=>setTab('info')},
        isRequestor ? "➕ New Request" : "➕ Go to the CE editor")),
    /*#__PURE__*/React.createElement("div", {style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}},
      kpi('Open CEs assigned', open.length, overdue + ' overdue · ' + dueSoon + ' due ≤3 days', overdue ? ERR : null),
      kpi('Overdue requests', overdueReq.length, isRequestor ? 'yours, past deadline' : 'awaiting review, past deadline', overdueReq.length ? ERR : null),
      kpi('Submitted this month', subMonth.length, peso(subMonth.reduce((t, x) => t + N(x.e.grand), 0))),
      kpi('On-time rate', onTime == null ? '—' : onTime + '%', timed.length + ' CEs with a deadline', onTime != null && onTime < 80 ? ERR : '#16a34a'),
      kpi('Won ' + now.getFullYear(), won, lost + ' lost · ' + yr.length + ' CEs this year', '#16a34a')),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,alignItems:'center'}},
      /*#__PURE__*/React.createElement("input", {type:'search',value:mwQ,placeholder:'Filter my work: CE no., client, job, estimator, status\u2026','aria-label':'Filter my work',onChange:e=>setMwQ(e.target.value),style:{...INP,flex:1,maxWidth:420,fontSize:12,padding:'5px 10px'}}),
      mwQ && /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setMwQ('')}, 'Clear')),
    mwPanel([
      section('✍ For my approval', fToSign, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,whiteSpace:'nowrap'}}, apv(x).signed + '/' + apv(x).total + ' signed'), viewBtn(x)), 'No CE is waiting on your signature.'),
      section('↩ Returned to me', fReturned, x => line(x, (x.e.info || {}).reviewNote && (x.e.info || {}).request ? /*#__PURE__*/React.createElement("span", {title: x.e.info.reviewNote, style:{fontSize:10,color:ACC,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, 'Returned: ' + x.e.info.reviewNote) : null, loadBtn(x)), 'Nothing returned.'),
      section('📂 My open CEs', fOpen, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,fontWeight:700,whiteSpace:'nowrap',color:x.dl.late ? ERR : x.dl.days != null && x.dl.days <= 3 ? 'var(--accent-orange, #F07F12)' : MT}}, (x.m.status || 'Draft') + ' · ' + x.dl.label), [viewBtn(x), loadBtn(x)]), 'No open CEs assigned to you.'),
      section('📝 My drafts', fDrafts, d => /*#__PURE__*/React.createElement("div", {key: d.draftId, style:{display:'flex',alignItems:'center',gap:8,padding:'6px 2px',borderBottom:'1px solid '+alpha(BDR,'44'),fontSize:12}},
        /*#__PURE__*/React.createElement("b", {style:{...MONO,fontSize:11}}, (d.info && d.info.ceNum) || 'Untitled'),
        /*#__PURE__*/React.createElement("span", {style:{flex:1,color:MT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, ((d.info && d.info.client) || '') + ' · saved ' + new Date(d.savedAt).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})),
        /*#__PURE__*/React.createElement("button", {style:btn('acc',true),onClick:()=>resumeDraft(d)}, "Resume")), 'No saved drafts.'),
      section('⏳ My CEs in approval', fInApproval, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,whiteSpace:'nowrap'}}, apv(x).signed + '/' + apv(x).total + ' signed · waiting on ' + (apv(x).waiting || []).join(', ')), viewBtn(x)), 'None of your CEs are in approval.'),
      !isRequestor && fSent.length > 0 && section('📤 Requests I sent', fSent, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,whiteSpace:'nowrap',color:MT}},
        (x.m.status || 'Pending') + (x.m.ceeName ? ' · with ' + x.m.ceeName : '')), viewBtn(x)), 'You have not sent a request yet. Use + New Request in CE Monitoring.'),
      !isRequestor && fAwaiting.length > 0 && section('📥 Requests awaiting review', fAwaiting, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,whiteSpace:'nowrap',color:MT}}, (x.m.ceeName || 'Unassigned') + (((x.e.info || {}).reviewStatus) ? ' · ' + (x.e.info || {}).reviewStatus : '')), [viewBtn(x), /*#__PURE__*/React.createElement("button", {key:'rv',style:btn('ok',true),title:'Review the checklist and decide: proceed, secure the missing data first, or decline',onClick:()=>openReview(x.e, 'review')}, "Review")]), ''),
      !isRequestor && fForReview.length > 0 && section('🔎 For review (status For Approval)', fForReview, x => line(x, null, viewBtn(x)), '')]),
    isRequestor && /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:'12px 14px',overflowX:'auto'}},
      /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:13,marginBottom:8}}, '📤 My requests', /*#__PURE__*/React.createElement("span", {style:{marginLeft:6,fontSize:11,color:MT}}, _rqw.length ? '(' + sentShown.length + ' of ' + sent.length + ')' : '(' + sent.length + ')')),
      sent.length > 0 && /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,alignItems:'center',marginBottom:8}},
        /*#__PURE__*/React.createElement("input", {type:'search',value:mwReqQ,placeholder:'Filter my requests: RCE no., customer, job, estimator, status\u2026','aria-label':'Filter my requests',onChange:e=>setMwReqQ(e.target.value),style:{...INP,flex:1,maxWidth:420,fontSize:12,padding:'5px 10px'}}),
        mwReqQ && /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setMwReqQ('')}, 'Clear')),
      sent.length ? /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
        /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['RCE / CE NO.', 'CUSTOMER', 'JOB', 'DISCIPLINE', 'ASSIGNED TO', 'STATUS', ''].map((h, i) => /*#__PURE__*/React.createElement("th", {key: i, style:{textAlign:'left',padding:'6px 8px',fontSize:10,color:MT,letterSpacing:'.06em',borderBottom:'1px solid '+BDR}}, h)))),
        /*#__PURE__*/React.createElement("tbody", null, sentShown.map(x => {
          const _rs = x.e.info && x.e.info.request && !x.e.info.acceptedCeNum ? x.e.info.reviewStatus : '';
          const st = _rs === 'returned' ? 'Returned to you' : _rs === 'resubmitted' ? 'Sent back to Cost Estimation' : (x.m.status || 'Pending'), col = _rs === 'returned' ? ACC : getStatusColor(st), still = !!(x.e.info && x.e.info.request);
          const td = {padding:'7px 8px',borderBottom:'1px solid '+alpha(BDR,'44'),verticalAlign:'middle'};
          return /*#__PURE__*/React.createElement("tr", {key: x.e.id},
            /*#__PURE__*/React.createElement("td", {style:{...td,...MONO,fontWeight:700,whiteSpace:'nowrap'}}, ceLabel(x.e)),
            /*#__PURE__*/React.createElement("td", {style:td}, (x.e.info && x.e.info.client) || x.m.customer || '—'),
            /*#__PURE__*/React.createElement("td", {style:td}, x.m.jobTitle || (x.e.info && x.e.info.description) || '—'),
            /*#__PURE__*/React.createElement("td", {style:td}, (x.e.info && x.e.info.projType) || x.m.designation || '—'),
            /*#__PURE__*/React.createElement("td", {style:td}, x.m.ceeName || '—'),
            /*#__PURE__*/React.createElement("td", {style:td}, /*#__PURE__*/React.createElement("span", {style:{display:'inline-block',padding:'2px 10px',borderRadius:12,fontSize:11,fontWeight:700,color:col,border:'1px solid '+col,background:alpha(col,'18')}}, st),
              still && x.e.info.reviewStatus && /*#__PURE__*/React.createElement("div", {style:{fontSize:10,marginTop:3,color:x.e.info.reviewStatus === 'declined' ? ERR : MT}},
                String(x.e.info.reviewStatus).toUpperCase() + (x.e.info.reviewNote ? ': ' + x.e.info.reviewNote : ''))),
            /*#__PURE__*/React.createElement("td", {style:{...td,textAlign:'right'}}, still && !x.e.info.acceptedCeNum && x.e.info.reviewStatus !== 'declined' && typeof x.e.id === 'number' && /*#__PURE__*/React.createElement("button", {style:{...btn('info',true),marginRight:6},onClick:()=>setRceReview({e:x.e,mode:'update'})}, 'Update'), still ? /*#__PURE__*/React.createElement("span", {style:{display:'inline-block',padding:'3px 12px',borderRadius:6,fontSize:11,fontWeight:800,color:'#fff',background:'#16a34a',letterSpacing:'.06em'}}, 'REQUEST') : viewBtn(x)));
        }))) : /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,padding:'6px 0'}}, 'You have not sent a request yet. Use + New Request in CE Monitoring.'),
      sent.length > 0 && sentShown.length === 0 && /*#__PURE__*/React.createElement("div", {style:{fontSize:12,color:MT,textAlign:'center',padding:'12px 0'}}, 'No request matches "' + mwReqQ + '".')));
}
