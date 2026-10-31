/* The Dashboard tab: the numbers across every CE, the open pipeline and the overdue requests.

   Moved out of App.js unchanged. It is invoked as DashboardTab({...}) from App's render, never as an element, because it is not a
   component of its own: it holds no state and no hooks, and everything it reads comes in through `ctx` -- the App state and helpers it
   used to reach by closure. The two lists' filter boxes and "show all" state still live in App (dashQ, dashReqQ, dashAll) so they
   survive leaving the tab. */
function DashboardTab(ctx) {
  const estName = ctx.estName || (x => x);
  const {
    allStatuses,
    dashAll,
    dashCo,
    setDashCo,
    dashYear,
    setDashYear,
    dashMonth,
    setDashMonth,
    dashDisc,
    setDashDisc,
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
  /* The Mechanical / Electrical toggle: when one is picked every figure and list on this page is of that discipline alone. */
  const discOf = x => { const i = x.h.info || {}, d = String(x.m.designation || x.m.discipline || i.discipline || i.projType || '').toLowerCase(); return /electr/.test(d) ? 'Electrical' : /mechan/.test(d) ? 'Mechanical' : ''; };
  const _dd = dashDisc || '';
  /* The issuing company: the prefix of the CE number, else the company on the Monitoring row, else SHIC -- the same rule the Company column in CE Monitoring uses. */
  const coOf = h => ceNumPrefix((h.info && h.info.ceNum) || h.ceNum) || String((monOf(h) || {}).companyDesig || '').toUpperCase() || 'SHIC';
  const _dc = dashCo || '';
  const byDisc = h => (!_dd || discOf({h, m: monOf(h)}) === _dd) && (!_dc || coOf(h) === _dc);
  const allHist = liveOnly(history), liveHist = allHist.filter(byDisc), liveRows = liveOnly(monRows).filter(byDisc);
  const coList = [...new Set(liveOnly(monRows).map(coOf))].sort();
  /* The money figures leave out Superseded CEs: a replaced estimate is not value that can still come in. */
  const valHist = liveHist.filter(h => ((monOf(h) || {}).status || '') !== 'Superseded');
  const supersededN = history.length - allHist.length;
  const monthHist = valHist.filter(h => { const d=new Date(h.savedAt||h.createdAt||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; });
  const totalThis = monthHist.reduce((s,h)=>s+N(h.grand||0),0);
  const avgVal = valHist.length ? valHist.reduce((s,h)=>s+N(h.grand||0),0)/valHist.length : 0;
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
      x.m.designation || x.m.discipline || x.h.info?.discipline || x.h.info?.projType, x.m.ceeName, x.m.receivedBy, x.m.preparedBy, x.m.status || 'Pending'].join(' ').toLowerCase();
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
      x.m.designation || x.m.discipline || x.h.info?.discipline || x.h.info?.projType, x.m.ceeName, x.m.preparedBy, x.m.receivedBy, x.m.status || 'Draft'].join(' ').toLowerCase();
    return _dq.every(w => hay.indexOf(w) >= 0);
  });
  const statusCount = statuses.reduce((m,s)=>{m[s]=(m[s]||0)+1;return m;},{});
  const clients = {}; valHist.forEach(h=>{const c=h.info?.client||h.client||'Unknown';clients[c]=(clients[c]||{count:0,total:0});clients[c].count++;clients[c].total+=N(h.grand||0);});
  const top5 = Object.entries(clients).sort((a,b)=>b[1].total-a[1].total).slice(0,5);
  const prefixMap = {}; valHist.forEach(h=>{const cn=(h.info?.ceNum||'').toUpperCase();const pfx=cn.split('-CE-')[0]||'?';prefixMap[pfx]=(prefixMap[pfx]||{count:0,total:0});prefixMap[pfx].count++;prefixMap[pfx].total+=N(h.grand||0);});
  const months=[]; for(let i=5;i>=0;i--){const d=new Date(thisYear,thisMonth-i,1);months.push({label:d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2),month:d.getMonth(),year:d.getFullYear()});}
  /* Grouped by the date the CE was received -- the one the Date Recv. column shows: the record's own received date, else the day it was saved. */
  const recvDate = h => { const r = (monOf(h) || {}).dateRecv; return /^\d{4}-\d{2}-\d{2}$/.test(r || '') ? new Date(r + 'T00:00:00') : new Date(h.savedAt || 0); };
  const monthTotals = months.map(m=>({...m,total:valHist.filter(h=>{const d=recvDate(h);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).reduce((s,h)=>s+N(h.grand||0),0)}));
  const maxBar = Math.max(...monthTotals.map(m=>m.total),1);
  /* STATISTICS for a chosen period. It follows the Company and Mechanical / Electrical choices, and counts CEs by the date they were received (the
     same date as the trend below). A request nobody has accepted is not a CE yet, and a superseded revision is not counted (valHist). */
  const _sy = dashYear || String(thisYear), _sm = dashMonth == null ? '' : String(dashMonth);
  const stRows = valHist.filter(h => !isUnacceptedReq(h) && !h._draft);
  const recvY = h => recvDate(h).getFullYear(), recvM = h => recvDate(h).getMonth();
  const stYears = [...new Set(stRows.map(recvY).filter(y => y > 2000).concat([thisYear]))].sort((a, b) => b - a);
  const inPeriod = (h, y, m) => (y === 'all' || recvY(h) === Number(y)) && (m === '' || recvM(h) === Number(m));
  const sumG = rs => rs.reduce((t, h) => t + N(h.grand || 0), 0);
  const statOf = rows => {
    const st = h => (monOf(h) || {}).status || 'Draft', by = f => rows.filter(h => f(st(h)));
    const sub = by(s => s === 'Submitted' || s === 'Awarded'), awd = by(s => s === 'Awarded'), lost = by(s => s === 'No Quote' || s === 'Cancelled'), open = by(s => ceIsOpen(s));
    return {n: rows.length, value: sumG(rows), avg: rows.length ? sumG(rows) / rows.length : 0, sub, awd, lost, open, subV: sumG(sub), awdV: sumG(awd)};
  };
  const monthName = (m, long) => new Date(2000, m, 1).toLocaleString('default', {month: long ? 'long' : 'short'});
  const stNow = statOf(stRows.filter(h => inPeriod(h, _sy, _sm)));
  const stPrev = _sy !== 'all' ? statOf(stRows.filter(h => inPeriod(h, String(Number(_sy) - 1), _sm))) : null;
  const stLabel = (_sm !== '' ? monthName(Number(_sm), true) + ' ' : '') + (_sy === 'all' ? 'all years' : _sy);
  const pctVs = (a, b) => b ? Math.round((a - b) / b * 100) : null;
  const vsTxt = (a, b) => { const p = stPrev ? pctVs(a, b) : null; return p === null ? '' : (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '% vs ' + (_sm !== '' ? monthName(Number(_sm)) + ' ' : '') + (Number(_sy) - 1); };
  /* An awarded CE was submitted first, so Submitted includes it and the award rate is of everything submitted. */
  const awardBase = stNow.sub.length;
  /* One line per month of the year picked (or per year when every year is), so a month can be opened with a click. */
  const stBreak = _sm !== '' ? [] : (_sy === 'all' ? stYears.slice().reverse().map(y => ({key: String(y), label: String(y), pick: () => setDashYear && setDashYear(String(y)), s: statOf(stRows.filter(h => recvY(h) === y))}))
    : Array.from({length: 12}, (_, m) => ({key: String(m), label: monthName(m), future: Number(_sy) === thisYear && m > thisMonth, pick: () => setDashMonth && setDashMonth(String(m)), s: statOf(stRows.filter(h => inPeriod(h, _sy, String(m))))})));
  const stCard = (label, value, sub, color) => /*#__PURE__*/React.createElement("div",{style:{background:SURF,border:'1px solid '+BDR,borderRadius:8,padding:'12px 16px',flex:'1 1 150px',minWidth:0,overflow:'hidden'}},
    /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:3}}, label),
    /*#__PURE__*/React.createElement("div",{style:{fontSize:String(value).length>14?14:String(value).length>11?16:19,fontWeight:800,color:color||TX,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...MONO},title:String(value)}, value),
    sub ? /*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:MT,marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'},title:sub}, sub) : null);
  /* PRINT: a plain black-on-white page of the figures on screen (the period, the cards, and the month / year lines), opened in its own window so
     the app's dark theme and controls stay out of it. */
  const printStats = () => {
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const peso = v => '₱' + ph(v);
    const cards = [
      ['CEs received', stNow.n, vsTxt(stNow.n, stPrev && stPrev.n)],
      ['Total value', peso(stNow.value), vsTxt(stNow.value, stPrev && stPrev.value)],
      ['Average value', peso(stNow.avg), ''],
      ['Submitted', stNow.sub.length, peso(stNow.subV) + ' · includes Awarded'],
      ['Awarded', stNow.awd.length, peso(stNow.awdV) + (awardBase ? ' · ' + Math.round(100 * stNow.awd.length / awardBase) + '% of Submitted' : '')],
      ['No Quote / Cancelled', stNow.lost.length, ''],
      ['Still open', stNow.open.length, peso(sumG(stNow.open))]];
    const scope = [_dc, _dd].filter(Boolean).join(' · ');
    const head = [_sy === 'all' ? 'Year' : 'Month', 'CEs', 'Value', 'Submitted', 'Awarded', 'No Quote / Cancelled', 'Still open'];
    const rows = stBreak.filter(r => !r.future).map(r => '<tr><td>' + esc(r.label) + '</td><td>' + r.s.n + '</td><td>' + esc(peso(r.s.value)) + '</td><td>' + r.s.sub.length + '</td><td>' + r.s.awd.length + '</td><td>' + r.s.lost.length + '</td><td>' + r.s.open.length + '</td></tr>').join('');
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>CE Statistics - ' + esc(stLabel) + '</title><style>'
      + 'body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:18mm 14mm}h1{font-size:18px;margin:0 0 2px}.sub{font-size:12px;color:#444;margin-bottom:14px}'
      + '.cards{display:flex;flex-wrap:wrap;gap:8px}.card{border:1px solid #999;border-radius:4px;padding:8px 12px;width:150px;box-sizing:border-box}.card b{display:block;font-size:18px;margin:2px 0}.card span{font-size:10px;color:#444}'
      + 'table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border-bottom:1px solid #bbb;padding:5px 8px;text-align:right}th:first-child,td:first-child{text-align:left}th{font-size:10px;text-transform:uppercase;letter-spacing:.05em}'
      + '@media print{body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'
      + '<h1>CE Statistics · ' + esc(stLabel) + '</h1><div class="sub">' + esc(scope ? scope + ' · ' : '') + 'Printed ' + esc(new Date().toLocaleDateString('en-PH', {year: 'numeric', month: 'long', day: 'numeric'})) + '</div>'
      + '<div class="cards">' + cards.map(c => '<div class="card"><span>' + esc(c[0]) + '</span><b>' + esc(c[1]) + '</b><span>' + esc(c[2]) + '&nbsp;</span></div>').join('') + '</div>'
      + (rows ? '<table><thead><tr>' + head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table>' : '')
      + '</body></html>';
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_e) { /* the window was closed */ } }, 300);
  };
  const stSel = {...INP, fontSize:12, width:'auto', padding:'4px 8px'};
  const statsCard = /*#__PURE__*/React.createElement("div",{className:'dash-stats',style:{...CS,marginBottom:20}},
    /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}},
      /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:13}}, '📅 Statistics · ' + stLabel + (_dc ? ' · ' + _dc : '') + (_dd ? ' · ' + _dd : '')),
      /*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:MT,marginLeft:'auto'}}, 'Year'),
      /*#__PURE__*/React.createElement("select",{'aria-label':'Statistics year',style:stSel,value:_sy,onChange:e=>{ setDashYear && setDashYear(e.target.value); if (e.target.value === 'all' && setDashMonth) setDashMonth(''); }},
        stYears.map(y => /*#__PURE__*/React.createElement("option",{key:y,value:String(y)}, y + (y === thisYear ? ' (this year)' : ''))), /*#__PURE__*/React.createElement("option",{value:'all'}, 'All years')),
      /*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:MT}}, 'Month'),
      /*#__PURE__*/React.createElement("select",{'aria-label':'Statistics month',style:stSel,value:_sm,disabled:_sy === 'all',onChange:e=>setDashMonth && setDashMonth(e.target.value)},
        /*#__PURE__*/React.createElement("option",{value:''}, 'Whole year'), Array.from({length: 12}, (_, m) => /*#__PURE__*/React.createElement("option",{key:m,value:String(m)}, monthName(m, true)))),
      /*#__PURE__*/React.createElement("button",{type:'button',style:btn('def',true),title:'Print these statistics',onClick:printStats}, '🖨 Print')),
    /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:10,flexWrap:'wrap'}},
      stCard('CEs received', stNow.n, vsTxt(stNow.n, stPrev && stPrev.n), INFO),
      stCard('Total value', '₱' + ph(stNow.value), vsTxt(stNow.value, stPrev && stPrev.value), OK),
      stCard('Average value', '₱' + ph(stNow.avg), '', ACC),
      stCard('Submitted', stNow.sub.length, '₱' + ph(stNow.subV) + ' · includes Awarded', INFO),
      stCard('Awarded', stNow.awd.length, '₱' + ph(stNow.awdV) + (awardBase ? ' · ' + Math.round(100 * stNow.awd.length / awardBase) + '% of Submitted' : ''), OK),
      stCard('No Quote / Cancelled', stNow.lost.length, '', stNow.lost.length ? ERR : MT),
      stCard('Still open', stNow.open.length, '₱' + ph(sumG(stNow.open)), ERR)),
    stBreak.length > 0 && /*#__PURE__*/React.createElement("div",{style:{overflowX:'auto',marginTop:14}},
      /*#__PURE__*/React.createElement("table",{style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
        /*#__PURE__*/React.createElement("thead",null, /*#__PURE__*/React.createElement("tr",null, [_sy === 'all' ? 'YEAR' : 'MONTH', 'CEs', 'VALUE', 'SUBMITTED', 'AWARDED', 'NO QUOTE / CANCELLED', 'STILL OPEN'].map((h, i) => /*#__PURE__*/React.createElement("th",{key:i,style:{textAlign:i?'right':'left',padding:'6px 8px',fontSize:10,color:MT,letterSpacing:'.06em',borderBottom:'1px solid '+BDR}}, h)))),
        /*#__PURE__*/React.createElement("tbody",null, stBreak.map(r => { const td = {padding:'6px 8px',textAlign:'right',borderBottom:'1px solid '+alpha(BDR,'44'),opacity:r.future?.45:1};
          return /*#__PURE__*/React.createElement("tr",{key:r.key,style:{cursor:'pointer'},title:'Open ' + r.label,onClick:r.pick},
            /*#__PURE__*/React.createElement("td",{style:{...td,textAlign:'left',fontWeight:700}}, r.label),
            /*#__PURE__*/React.createElement("td",{style:{...td,...MONO}}, r.s.n), /*#__PURE__*/React.createElement("td",{style:{...td,...MONO}}, '₱' + ph(r.s.value)),
            /*#__PURE__*/React.createElement("td",{style:{...td,...MONO}}, r.s.sub.length), /*#__PURE__*/React.createElement("td",{style:{...td,...MONO}}, r.s.awd.length),
            /*#__PURE__*/React.createElement("td",{style:{...td,...MONO}}, r.s.lost.length), /*#__PURE__*/React.createElement("td",{style:{...td,...MONO}}, r.s.open.length)); })))));
  /* Mechanical and Electrical monitored apart: each CE and request goes to the discipline on its record (the project type, or the Monitoring
     Discipline). Anything else, or blank, is counted under "No discipline" so the two cards always add up with the figures above. */
  const discRows = liveRows.map(h => ({h, m: monOf(h)}));
  const discStats = key => {
    const mine = discRows.filter(x => discOf(x) === key);
    const reqs = mine.filter(x => isUnacceptedReq(x.h));
    const open = openCEs.filter(x => discOf(x) === key);
    const sc = {}; mine.filter(x => !isUnacceptedReq(x.h) || x.h._draft).forEach(x => { const st = x.m.status || '(no status)'; sc[st] = (sc[st] || 0) + 1; });
    const late = open.filter(x => x.m.deadline && new Date(x.m.deadline + 'T00:00:00') < _today).length;
    return {
      key, open, late, sc,
      /* "Open" is everything not closed, so it includes On hold; Active / On hold are the same groups as CE Monitoring's buttons. */
      activeN: open.filter(x => statusGroupMembers('active', allStatuses || []).includes(x.m.status || '')).length,
      holdN: open.filter(x => statusGroupMembers('hold', allStatuses || []).includes(x.m.status || '')).length,
      value: open.reduce((t, x) => t + N(x.h.grand || 0), 0),
      awaiting: reqs.filter(x => !x.h._draft && typeof x.h.id === 'number' && (x.h.info || {}).reviewStatus !== 'returned' && (x.h.info || {}).reviewStatus !== 'declined').length,
      overdueReq: reqOverdueRows.filter(x => discOf(x) === key).length
    };
  };
  const discLeft = [...openCEs, ...reqOverdueRows].filter(x => !discOf(x));
  const discNone = discLeft.length;
  /* Which ones, and what their discipline says, so the note can be acted on instead of just worried about. */
  const discLeftTxt = discLeft.slice(0, 8).map(x => ((x.h.info && (x.h.info.ceNum || x.h.info.requestNum)) || x.h.ceNum || '?') + ' (' + (String(x.m.designation || x.m.discipline || (x.h.info && (x.h.info.discipline || x.h.info.projType)) || '').trim() || 'blank') + ')').join(', ') + (discLeft.length > 8 ? ' and ' + (discLeft.length - 8) + ' more' : '');
  const discCard = (key, col) => {
    const d = discStats(key), nxt = d.open.slice(0, 5);
    const stat = (l, v, c) => /*#__PURE__*/React.createElement("div",{style:{minWidth:0}},
      /*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:MT,whiteSpace:'nowrap'}}, l), /*#__PURE__*/React.createElement("div",{style:{fontSize:16,fontWeight:800,color:c||TX,whiteSpace:'nowrap',...MONO}}, v));
    return /*#__PURE__*/React.createElement("div",{key,className:'dash-disc',style:{...CS,flex:'1 1 420px',minWidth:0,margin:0,borderTop:'3px solid '+col}},
      /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:13,marginBottom:10,color:col}}, key === 'Electrical' ? "⚡ Electrical" : "⚙ Mechanical"),
      /*#__PURE__*/React.createElement("div",{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,max-content))',columnGap:24,rowGap:10,marginBottom:12}},
        stat('Open CEs', d.open.length), stat('Active', d.activeN), stat('On hold', d.holdN, d.holdN ? 'var(--status-warning)' : MT), stat('Open value', '₱' + ph(d.value), OK), stat('Past deadline', d.late, d.late ? ERR : MT),
        stat('Awaiting review', d.awaiting, d.awaiting ? ACC : MT), stat('Overdue requests', d.overdueReq, d.overdueReq ? ERR : MT)),
      Object.keys(d.sc).length > 0 && /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}},
        Object.entries(d.sc).sort((a,b)=>{const ia=(allStatuses||[]).indexOf(a[0]),ib=(allStatuses||[]).indexOf(b[0]);return (ia<0?1e6:ia)-(ib<0?1e6:ib);}).map(([st,c])=>/*#__PURE__*/React.createElement("span",{key:st,style:{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap',flex:'0 0 auto',lineHeight:'16px',background:getStatusColor(st)+'22',color:getStatusColor(st),border:'1px solid '+getStatusColor(st)+'44'}}, st + ' ' + c))),
      /*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:MT,marginBottom:4}}, nxt.length ? 'Next due' : 'No open CEs'),
      nxt.map(x=>{ const dl = x.m.deadline, days = dl ? Math.round((new Date(dl+'T00:00:00') - _today)/86400000) : null;
        return /*#__PURE__*/React.createElement("div",{key:x.h.id,style:{display:'flex',justifyContent:'space-between',gap:8,fontSize:11,padding:'2px 0',borderBottom:'1px solid '+BDR}},
          /*#__PURE__*/React.createElement("span",{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},title:x.m.jobTitle||x.h.info?.description||''}, /*#__PURE__*/React.createElement("span",{style:{...MONO,color:INFO,fontWeight:600}}, x.h.info?.ceNum||x.h.ceNum||'—'), ' ', x.h.info?.client||x.m.customer||'', (x.m.jobTitle||x.h.info?.description) && /*#__PURE__*/React.createElement("span",{style:{color:MT}}, ' · ' + (x.m.jobTitle||x.h.info?.description))),
          /*#__PURE__*/React.createElement("span",{style:{...MONO,whiteSpace:'nowrap',color:days===null?MT:days<0?ERR:days<=7?'var(--status-warning)':OK}}, days===null?'no deadline':days<0?(-days)+'d late':days===0?'today':days+'d'));}));
  };
  const kpiCard = (label,value,color) => /*#__PURE__*/React.createElement("div",{style:{background:SURF,border:'1px solid '+BDR,borderRadius:8,padding:'14px 18px',flex:'1 1 150px',minWidth:0,overflow:'hidden'}},
    /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:4}},label),
    /* A big peso figure steps down in size so it stays inside its card instead of running into the next one. */
    /*#__PURE__*/React.createElement("div",{style:{fontSize:String(value).length>14?14:String(value).length>11?17:20,fontWeight:800,color:color||TX,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',...MONO},title:String(value)},value));
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
      kpiCard('Total CEs', _dd || _dc ? liveHist.length : history.length, MT),
      kpiCard('Open CEs', openCEs.length, ERR),
      /* What the Cost Estimation team has to decide on. Returned ones are with their requestors, so they are named but not counted. */
      kpiCard('Requests Awaiting Review' + (reqReturnedN ? ' (' + reqReturnedN + ' returned)' : ''), reqAwaitingN, reqAwaitingN ? ACC : MT),
      kpiCard('Overdue Requests', reqOverdueN, reqOverdueN ? ERR : MT)),
    /* Toggle for the whole page */
    /*#__PURE__*/React.createElement("div",{className:'dash-disc-toggle',style:{display:'flex',gap:6,alignItems:'center',marginBottom:14,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:MT}}, 'Show:'),
      [['', 'All'], ['Mechanical', '⚙ Mechanical'], ['Electrical', '⚡ Electrical']].map(([k, l]) => /*#__PURE__*/React.createElement("button",{key:k||'all','data-on':_dd===k?'1':'0','aria-pressed':_dd===k,style:{...btn(_dd===k?'acc':'def',true),borderRadius:14,padding:'3px 14px'},onClick:()=>setDashDisc && setDashDisc(k)}, l)),
      /* Company: each issuing company on its own, or all together. */
      coList.length > 1 && /*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:MT,marginLeft:14}}, 'Company:'),
      coList.length > 1 && [''].concat(coList).map(k => /*#__PURE__*/React.createElement("button",{key:'co'+(k||'all'),'data-on':_dc===k?'1':'0','aria-pressed':_dc===k,style:{...btn(_dc===k?'acc':'def',true),borderRadius:14,padding:'3px 14px'},onClick:()=>setDashCo && setDashCo(k)}, k || 'All companies')),
      (_dd || _dc) && /*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:MT}}, 'Every figure and list below is ' + [_dc, _dd].filter(Boolean).join(' · ') + ' only.')),
    statsCard,
    /* Mechanical and Electrical, each on its own */
    !_dd && /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:12,flexWrap:'wrap',marginBottom:discNone?4:20}}, discCard('Mechanical','#38BDF8'), discCard('Electrical','#F59E0B')),
    !_dd && discNone > 0 && /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:20}}, discNone + ' open CE or overdue request' + (discNone === 1 ? '' : 's') + ' have no Mechanical or Electrical discipline set, so they are in neither card: ' + discLeftTxt + '.'),
    /* Monthly trend */
    /*#__PURE__*/React.createElement("div",{style:{...CS,marginBottom:16}},
      /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:12,fontSize:12}}, "📈 Monthly Trend (Last 6 Months, by Date Received)"),
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
            /*#__PURE__*/React.createElement("td",{style:TDS}, x.m.designation || x.m.discipline || x.h.info?.discipline || x.h.info?.projType || '\u2014'),
            /*#__PURE__*/React.createElement("td",{style:{...TDS,whiteSpace:'nowrap'}}, estName(String(x.m.ceeName || '').replace(/^Unassigned$/, '')) || '\u2014'),
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
                    /*#__PURE__*/React.createElement("td",{style:TDS}, x.m.designation || x.m.discipline || x.h.info?.discipline || x.h.info?.projType || '\u2014'),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,whiteSpace:'nowrap'}}, estName(String(x.m.ceeName || '').replace(/^Unassigned$/, '') || x.m.preparedBy) || '\u2014'),
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
        /* In the order the admin set on the Status manager (a status that is not on the list, e.g. one since deleted, goes last), each in its own colour. */
        Object.entries(statusCount).sort((a,b)=>{const ia=(allStatuses||[]).indexOf(a[0]),ib=(allStatuses||[]).indexOf(b[0]);return (ia<0?1e6:ia)-(ib<0?1e6:ib)||b[1]-a[1];}).map(([s,c])=>/*#__PURE__*/React.createElement("div",{key:s,style:{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}},
          /*#__PURE__*/React.createElement("span",null,/*#__PURE__*/React.createElement("span",{style:{display:'inline-block',width:8,height:8,borderRadius:'50%',background:getStatusColor(s),marginRight:6}}),s),
          /*#__PURE__*/React.createElement("span",{style:{background:getStatusColor(s)+'33',color:getStatusColor(s),borderRadius:4,padding:'0 6px',fontWeight:700}},c)))),
      /* Top clients */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏆 Top 5 Clients"),
        top5.map(([name,d],i)=>/*#__PURE__*/React.createElement("div",{key:name,style:{marginBottom:6,fontSize:11}},
          /*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between'}},
            /*#__PURE__*/React.createElement("span",{style:{color:i===0?ACC:TX}}, (i+1)+'. '+name),
            /*#__PURE__*/React.createElement("span",{style:{color:MT}},d.count,' CE')),
          /*#__PURE__*/React.createElement("div",{style:{...MONO,fontSize:10,color:OK}},'₱'+ph(d.total)))))));
}
