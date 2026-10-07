/* The Monitoring tab (History): the CE list with its filters, status editing, attachments, remarks, compare, and the import / export
   controls.

   Moved out of App.js unchanged. Like the Dashboard it is invoked -- MonitoringPanel({...}) -- and never rendered as an element: a
   component declared inside App is a new type on every render, which remounts it and destroys whatever was being typed into it (see
   tools/check-remounting-editors.js). It holds no hooks; every piece of App state and every helper it reads arrives through `ctx`. The
   state itself (filters, page, panels) stays in App so it survives leaving the tab. */
function MonitoringPanel(ctx) {
  const {
    MON_PAGE_SIZE,
    STATUS_COLOR_MAP,
    SortIcon,
    addStatus,
    allStatuses,
    assignPanel,
    attachList,
    attachPanel,
    ceImportProgress,
    coOptions,
    compareModal,
    compareSet,
    confirmDel,
    currentUser,
    custOptions,
    deleteDraft,
    discOptions,
    editingRow,
    fillBlankDisc,
    getStatusColor,
    handleClone,
    handleLoad,
    handleRevise,
    handleSave,
    histBusy,
    history,
    importMonitoringXLSX,
    importProgress,
    importShicCeFiles,
    isAdmin,
    isRequestor,
    loadHist,
    loadMonData,
    monApvMine,
    monCustFilter,
    monData,
    monDiscFilter,
    monMine,
    monOf,
    monPage,
    monPageRows,
    monReqFilter,
    monRevOpen,
    monSearch,
    monSpIds,
    monStatusFilter,
    monTableWrapRef,
    monTopScrollRef,
    monTypeFilter,
    newStatusInput,
    openAssign,
    openAttachPanel,
    openForPrint,
    openRequest,
    openReview,
    rceOf,
    removeStatus,
    reqOwns,
    resDays,
    resumeDraft,
    setAttachPanel,
    setCompareModal,
    setCompareSet,
    setConfirmDel,
    setDiffModal,
    setEditingRow,
    setHistory,
    setMonApvMine,
    setMonCustFilter,
    setMonDiscFilter,
    setMonMine,
    setMonPage,
    setMonReqFilter,
    setMonRevOpen,
    setMonSearch,
    setMonStatusFilter,
    setMonTypeFilter,
    setNewStatusInput,
    setRceReview,
    setRemarkDraft,
    setRemarksPanel,
    setShowStatusFilter,
    setShowStatusMgr,
    setStatusPanel,
    setUndoToast,
    setViewCE,
    showStatusFilter,
    showStatusMgr,
    showToast,
    sortedHistory,
    statusPanel,
    toggleSort,
    updateMon
  } = ctx;

  return React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(INFO, '44'),
      marginBottom: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      position: 'sticky',
      top: 88,
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 13
    }
  }, "CE Monitoring"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, sortedHistory.length, " estimates",
     /* Revisions are folded in, so the count is of CEs. Saying how many rows
        were folded away stops the number reading as if work had gone missing. */
     (() => { const r = sortedHistory.reduce((s, e) => s + (e._revs || []).length, 0);
              return r ? ' · ' + r + ' revision' + (r === 1 ? '' : 's') + ' folded in' : ''; })(),
     isAdmin ? ' (all users)' : ''), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      width: 200,
      fontSize: 11,
      marginLeft: 8
    },
    placeholder: "Filter: CE no., client, job, estimator, status\u2026",
    "aria-label": "Filter CE Monitoring",
    /* No autoFocus. It fires whenever this input mounts, and the panel around
       it was remounting on every App render -- so every edit to a cell threw
       the caret back up here. It is wrong on its own terms too: a search box
       that grabs the caret on arrival takes it from wherever the person meant
       to be. */
    value: monSearch,
    onChange: e => { setMonSearch(e.target.value); setMonPage(0); }
  }), /*#__PURE__*/React.createElement("div", {
    style: {position: 'relative', display: 'inline-block'}
  }, /*#__PURE__*/React.createElement("button", {
    style: {...btn(monStatusFilter.size > 0 ? 'acc' : 'def', true), minWidth: 90},
    onClick: () => { setShowStatusFilter(p => !p); setShowStatusMgr(false); }
  }, "▼ Status", monStatusFilter.size > 0 ? ` (${monStatusFilter.size})` : ''),
  showStatusFilter && /*#__PURE__*/React.createElement("div", {
    style: {position:'absolute', top:'110%', left:0, zIndex:200, background:SURF, border:`1px solid ${BDR}`, borderRadius:8, padding:8, minWidth:160, boxShadow:'0 4px 16px #0006'}
  }, /*#__PURE__*/React.createElement("div", {style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}},
    /*#__PURE__*/React.createElement("span", {style:{fontSize:11, fontWeight:700, color:MT}}, "Filter by Status"),
    monStatusFilter.size > 0 && /*#__PURE__*/React.createElement("button", {
      style:{...btn('danger',true), fontSize:10, padding:'1px 6px'},
      onClick: () => { setMonStatusFilter(new Set()); setMonPage(0); }
    }, "Clear")
  ),
  allStatuses.map(s =>
    /*#__PURE__*/React.createElement("label", {
      key: s,
      style: {display:'flex', alignItems:'center', gap:8, padding:'4px 2px', cursor:'pointer', fontSize:12}
    },
    /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: monStatusFilter.has(s),
      onChange: () => {
        setMonStatusFilter(prev => {
          const next = new Set(prev);
          next.has(s) ? next.delete(s) : next.add(s);
          return next;
        });
        setMonPage(0);
      }
    }),
    /*#__PURE__*/React.createElement("span", {
      style: {
        display:'inline-block', width:8, height:8, borderRadius:'50%',
        background: STATUS_COLOR_MAP[s] || ACC, flexShrink:0
      }
    }),
    s)
  ))),
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize:11, width:150},
    value: monReqFilter,
    onChange: e => { setMonReqFilter(e.target.value); setMonPage(0); },
    title: "RCE requests and CEs: requests waiting for the team, requests that became a CE, or CEs that never were requests"
  },
    /*#__PURE__*/React.createElement("option", {value:'all'}, "RCE + CE"),
    /*#__PURE__*/React.createElement("option", {value:'pending'}, "RCE awaiting review"),
    /*#__PURE__*/React.createElement("option", {value:'accepted'}, "RCE accepted \u2192 CE"),
    /*#__PURE__*/React.createElement("option", {value:'ce'}, "CE only")
  ),
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize:11, width:120},
    value: monTypeFilter,
    onChange: e => { setMonTypeFilter(e.target.value); setMonPage(0); },
    title: "Filter by CE type"
  },
    /*#__PURE__*/React.createElement("option", {value:'all'}, "All Types"),
    /*#__PURE__*/React.createElement("option", {value:'onsite'}, "Onsite"),
    /*#__PURE__*/React.createElement("option", {value:'shopworks'}, "Shopworks"),
    /*#__PURE__*/React.createElement("option", {value:'supply'}, "Supply")
  ),
  isAdmin && discOptions.some(o => !o.label) && /*#__PURE__*/React.createElement("button", {
    style: {...btn('def', true), fontSize: 10},
    onClick: fillBlankDisc,
    title: "Give a discipline to every CE in this view that has none. Ones that already have one are left alone."
  }, "Set blank disciplines"),
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize:11, width:150},
    value: monDiscFilter,
    onChange: e => { setMonDiscFilter(e.target.value); setMonPage(0); },
    title: "Filter by discipline"
  },
    /*#__PURE__*/React.createElement("option", {value:'all'}, "All Disciplines"),
    discOptions.map(o => /*#__PURE__*/React.createElement("option", {key: o.key, value: o.key},
      (o.label || '(none)') + '  \u00b7 ' + o.n))
  ),
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize:11, width:190},
    value: monCustFilter,
    onChange: e => { setMonCustFilter(e.target.value); setMonPage(0); },
    title: "Filter by customer"
  },
    /*#__PURE__*/React.createElement("option", {value:'all'}, "All Customers"),
    custOptions.map(o => /*#__PURE__*/React.createElement("option", {key: o.key, value: o.key},
      (o.label || '(none)') + '  \u00b7 ' + o.n))
  ),
  /*#__PURE__*/React.createElement("button", {
    style: btn(monMine ? 'acc' : 'def', true),
    title: "Only the CEs and requests whose Estimator is you",
    onClick: () => { setMonMine(v => !v); setMonPage(0); }
  }, "\uD83D\uDC64 Assigned to me"),
  /*#__PURE__*/React.createElement("button", {
    style: btn(monApvMine ? 'acc' : 'def', true),
    title: "Only the CEs waiting on your signature",
    onClick: () => { setMonApvMine(v => !v); setMonPage(0); }
  }, "✍ Awaiting my signature (" + Object.values(monData || {}).filter(m => apvMonWaitsOn(m, currentUser.username)).length + ")"),
  (monSearch || monStatusFilter.size > 0 || monReqFilter !== 'all' || monTypeFilter !== 'all' || monDiscFilter !== 'all' || monCustFilter !== 'all') && /*#__PURE__*/React.createElement("button", {
    style: {...btn('danger', true), fontSize:10},
    title: "Clear all filters",
    onClick: () => { setMonSearch(''); setMonStatusFilter(new Set()); setMonTypeFilter('all'); setMonReqFilter('all'); setMonDiscFilter('all'); setMonCustFilter('all'); setMonPage(0); }
  }, "\u2715 Clear Filters"),
  /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setShowStatusMgr(p => !p),
    title: "Manage status options"
  }, "\u2699 Status"), /*#__PURE__*/React.createElement("button", {
    style: btn('ok', true),
    title: "Log a request for estimation: CE number, customer, deadline, who it is assigned to, and its documents",
    onClick: openRequest
  }, "+ New Request"), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => {
      loadHist();
      loadMonData();
      /* Move the CE archive out of localStorage. Deliberately AFTER loadHist so
         reconciliation can reuse a warm SharePoint result, and fire-and-forget
         so it can never delay the UI. It defers itself when offline. */
      dbMigrateToIDB(currentUser.username, isAdmin).then(r => {
        if (r && r.moved) showToast('Moved ' + r.moved + ' CE(s) to offline storage, freeing ' + Math.round((r.freedBytes||0)/1024) + ' KB.');
      }).catch(ex => console.warn('CE archive migration skipped:', ex.message));
    }
  }, "\u21BB Refresh"), /*#__PURE__*/React.createElement("button", {
    title: "Download a blank Excel template with the correct column headers for bulk import",
    style: btn('def', true),
    onClick: () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['CE No.','CE Name','Company Designation','Discipline','Customer','Job Title','Date Recieved','Deadline','Date Submitted','Status','Recieved By','Remarks','RCE No.'],
        ['CE-2826-0001','Juan Dela Cruz','SHIC','Mechanical','Sample Client Inc.','PUMP OVERHAUL AND REPAIR','2026-01-15','2026-01-22','2026-01-21','Submitted','Kenneth Mendoza','','RCE-2026-0001'],
      ]);
      ws['!cols'] = [120,120,120,100,140,200,110,110,110,90,120,140,110].map(w=>({wch:Math.round(w/7)}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CE Monitoring');
      XLSX.writeFile(wb, 'SHIC_CE_Import_Template.xlsx');
    }
  }, "\u2193 Template"), /*#__PURE__*/React.createElement("label", {
    title: "Import CE Tracking spreadsheet (.xlsx)",
    style: {...btn('def', true), cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4}
  }, importProgress ? `Importing\u2026 ${importProgress.done}/${importProgress.total}` : "\u2B06 Import xlsx", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".xlsx",
    style: {display:'none'},
    disabled: !!importProgress,
    onChange: e => { if(e.target.files[0]) { importMonitoringXLSX(e.target.files[0]); e.target.value=''; } }
  })), /*#__PURE__*/React.createElement("label", {
    title: "Import one or multiple SHIC CE Excel files (reads BOTE, BOCM, PPE, MISC sheets)",
    style: {...btn('info', true), cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4}
  }, ceImportProgress ? `\u21BB Importing ${ceImportProgress.done}/${ceImportProgress.total}\u2026` : "\u2B06 Import CE File(s)", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".xlsx,.xls",
    multiple: true,
    style: {display:'none'},
    disabled: !!ceImportProgress,
    onChange: e => { if(e.target.files.length) { importShicCeFiles(e.target.files); e.target.value=''; } }
  })), importProgress && /*#__PURE__*/React.createElement("div", {
    style: {display:'flex', alignItems:'center', gap:6, fontSize:10, color:ACC}
  }, /*#__PURE__*/React.createElement("div", {
    style: {width:80, height:4, background:BDR, borderRadius:4, overflow:'hidden'}
  }, /*#__PURE__*/React.createElement("div", {
    style: {width:`${Math.round(importProgress.done/importProgress.total*100)}%`,
            height:'100%', background:ACC, borderRadius:4, transition:'width .2s'}
  })), `${Math.round(importProgress.done/importProgress.total*100)}%`), /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: handleSave
  }, "+ Save Current CE"))), showStatusMgr && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      padding: 10,
      background: SURF,
      borderRadius: 7,
      border: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("div", {style: {color: MT, fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em'}}, "Status Options"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 5,
      marginBottom: 8
    }
  }, allStatuses.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: getStatusColor(s) + '22',
      color: getStatusColor(s),
      border: `1px solid ${getStatusColor(s)}44`,
      borderRadius: 12,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 700
    }
  }, s, !DEFAULT_STATUS_OPTIONS.includes(s) && /*#__PURE__*/React.createElement("button", {
    onClick: () => removeStatus(s),
    style: {
      background: 'none',
      border: 'none',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 11,
      padding: '0 2px',
      lineHeight: 1
    }
  }, "\xD7")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      flex: 1,
      fontSize: 11
    },
    value: newStatusInput,
    onChange: e => setNewStatusInput(e.target.value),
    placeholder: "Add custom status...",
    onKeyDown: e => {
      if (e.key === 'Enter') {
        addStatus(newStatusInput);
        setNewStatusInput('');
      }
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: btn('acc', true),
    onClick: () => {
      addStatus(newStatusInput);
      setNewStatusInput('');
    }
  }, "+ Add")))), histBusy && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      textAlign: 'center',
      padding: 28,
      color: MT,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0
    }
  }, "Loading..."), !histBusy && sortedHistory.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      textAlign: 'center',
      padding: 36,
      color: MT,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0
    }
  }, "No saved estimates yet. Save a CE to start monitoring."), !histBusy && sortedHistory.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null,
  /*#__PURE__*/React.createElement("div", {
    ref: monTopScrollRef,
    style: {overflowX: 'auto', overflowY: 'hidden', height: 13, background: SURF, border: `1px solid ${BDR}`, borderTop: 'none', borderBottom: 'none'},
    onScroll: e => { if(monTableWrapRef.current && monTableWrapRef.current.scrollLeft !== e.target.scrollLeft) monTableWrapRef.current.scrollLeft = e.target.scrollLeft; }
  }, /*#__PURE__*/React.createElement("div", {style: {minWidth: 1470, height: 1}})),
  /*#__PURE__*/React.createElement("div", {
    ref: monTableWrapRef,
    onScroll: e => { if(monTopScrollRef.current && monTopScrollRef.current.scrollLeft !== e.target.scrollLeft) monTopScrollRef.current.scrollLeft = e.target.scrollLeft; },
    style: {
      overflowX: 'auto',
      overflowY: 'auto',
      maxHeight: 'calc(100vh - 200px)',
      background: CARD,
      borderRadius: 8,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      border: `1px solid ${BDR}`,
      borderTop: 'none'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 11,
      minWidth: 1470
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: SURF,
      position: 'sticky',
      top: 0,
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement("th", {style:{...THS,width:28,padding:'6px 4px',fontSize:10,textAlign:'center'}, title:"Select to compare (max 2)"}, "⚖"), [['ceeName', 'Estimator', 80], ['companyDesig', 'Co.', 60], ['ceNum', 'CE No.', 120], ['rceNo', 'RCE No.', 100], ['designation', 'Discipline', 90], ['customer', 'Customer', 100], ['jobTitle', 'Job Title', 320], ['grand', 'Total (₱)', 110], ['dateRecv', 'Date Recv.', 95], ['deadline', 'Deadline', 95], ['deadlineDays', 'Days Left', 65], ['dateSubmitted', 'Date Submitted', 105], ['status', 'Status', 120], ['receivedBy', 'Received By', 100], ['remarks', 'Remarks', 140]].map(([col, label, w]) => /*#__PURE__*/React.createElement("th", {
    key: col,
    onClick: () => ['ceNum', 'rceNo', 'deadline', 'status', 'grand'].includes(col) && toggleSort(col),
    style: {
      ...THS,
      width: w,
      minWidth: w,
      padding: '6px 8px',
      fontSize: 10,
      whiteSpace: 'nowrap',
      cursor: ['ceNum', 'rceNo', 'deadline', 'status', 'grand'].includes(col) ? 'pointer' : 'default',
      userSelect: 'none'
    }
  }, label, ['ceNum', 'rceNo', 'deadline', 'status', 'grand'].includes(col) && SortIcon({
    col: col
  }))), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      width: 80,
      minWidth: 80,
      padding: '6px 8px',
      fontSize: 10,
      /* Matches the pinned body cells below, so the header stays aligned with
         its column while the table scrolls sideways. */
      position: 'sticky',
      right: 0,
      zIndex: 3,
      background: SURF,
      borderLeft: `1px solid ${BDR}`
    }
  }, "Actions"))),/*#__PURE__*/React.createElement("tbody", null, monPageRows.map((e, rowIdx) => {
    /* The 16 columns total ~1570px, so on any normal screen Actions sits past
       the right edge and the row has to be scrolled sideways to reach it —
       which is why people reported the buttons as missing rather than
       off-screen. Pinning the column keeps Edit/Attach/Del reachable at any
       scroll position. Needs an opaque background: the row's own is
       semi-transparent on alternate rows, and cells would scroll visibly
       underneath it. */
    const stickyBg = rowIdx % 2 === 0 ? CARD : SURF;
    const m = monOf(e);
    const ceNum = e.info?.ceNum || e.ceNum || '';
    const jobTitle = e.info?.description || '';
    const dateRecv = e.savedAt ? new Date(e.savedAt).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) : '';
    /* Whose CE this is. The number already says -- SHIC-CE-2026-0004 is
       SHIC's -- so a stored companyDesig that disagrees with it is stale, and
       an absent one needs no default guess. It fell back to a flat 'SHIC',
       which labelled every SY3 CE as SHIC's. */
    const coDesig = ceNumPrefix(ceNum) || m.companyDesig || 'SHIC';

    /* Deadline countdown, which stops when the CE is submitted. */
    const dl = ceDeadline(m.deadline, m.dateSubmitted, m.status);
    const deadlineDays = dl.days;
    /* A finished CE is history, not a warning. Late still reads red -- it is
       the fact of the matter -- but an on-time one is green however close to
       the wire it went, rather than amber for the rest of its life. */
    const daysColor = deadlineDays === null ? MT
      : dl.done ? (dl.late ? ERR : OK)
      : deadlineDays < 0 ? ERR : deadlineDays <= 7 ? 'var(--status-warning)' : OK;
    const statusColor = getStatusColor(m.status || '');
    const trBg = rowIdx % 2 === 0 ? 'transparent' : alpha(SURF, '88');
    /* A superseded revision is shown dimmed and indented under the revision
       that replaced it: still readable, still openable, but plainly not the
       row that counts. */
    return /*#__PURE__*/React.createElement("tr", {
      key: e.id,
      style: {
        background: e._isRev ? alpha(INFO, '0F') : trBg,
        opacity: e._isRev ? .62 : 1,
        borderBottom: `1px solid ${alpha(BDR, '22')}`,
        ...(e._isRev ? {borderLeft: '3px solid ' + alpha(INFO, '55')} : {})
      }
    }, /*#__PURE__*/React.createElement("td", {style:{...TDS,padding:'4px',textAlign:'center'}},
      /*#__PURE__*/React.createElement("input", {
        type:"checkbox",
        title: compareSet.has(e.id) ? "Remove from comparison" : compareSet.size >= 2 ? "Deselect another first" : "Add to comparison",
        checked: compareSet.has(e.id),
        disabled: !compareSet.has(e.id) && compareSet.size >= 2,
        onChange: () => setCompareSet(prev => {
          const next = new Set(prev);
          next.has(e.id) ? next.delete(e.id) : next.add(e.id);
          return next;
        })
      })
    ), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%',
        fontWeight: 700,
        color: CE_CFG[e.ceType]?.color || ACC
      },
      key: e.id + 'ceeName',
      defaultValue: m.ceeName || m.preparedBy || e.savedBy || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.ceeName || m.preparedBy || e.savedBy || '')) updateMon(e.id, 'ceeName', ev.target.value);
      },
      placeholder: "Estimator"
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,fontWeight:700,color:CE_CFG[e.ceType]?.color||ACC}}, m.ceeName||m.preparedBy||e.savedBy||'—'), /*#__PURE__*/React.createElement("span", {
      title: monSpIds.has(String(e.id)) ? 'Synced with SharePoint' : 'Local only — no SP record yet',
      style: {fontSize:9, marginLeft:3, color: monSpIds.has(String(e.id)) ? OK : BDR, cursor:'default'}
    }, monSpIds.has(String(e.id)) ? '☁' : '○')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("select", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'companyDesig',
      defaultValue: coDesig,
      onChange: ev => { updateMon(e.id, 'companyDesig', ev.target.value); }
      /* Built from the companies actually on file, not a hardcoded list.
         That list had grown to hold MFS, JAVV and EMN -- estimator initials,
         not companies -- so the column that answers "whose CE is this" was
         offering the name of the person who wrote it.

         The row's own value comes first when the list no longer offers it, so
         a CE filed under a company since removed keeps its label instead of
         showing an empty dropdown. */
    }, [...(coDesig && coOptions.indexOf(coDesig) < 0 ? [coDesig] : []), ...coOptions].map(o => /*#__PURE__*/React.createElement("option", {
      key: o
    }, o))) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, coDesig)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        ...MONO,
        fontSize: 10,
        whiteSpace: 'nowrap'
      }
    }, e._isRev ? '↳ ' + ceNum : (e.info?.request && !e.info.acceptedCeNum ? /*#__PURE__*/React.createElement("span", {title: 'No CE number until the Cost Estimation team accepts this request. Its RCE No. is in the next column.', style:{color:MT}}, '\u2014') : ceNum),
    e._isRev && /*#__PURE__*/React.createElement("span", {
      title: 'Superseded by a later revision — kept for reference, and not counted as a separate CE',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8,
              background: alpha(INFO, '22'), color: INFO, border: '1px solid ' + alpha(INFO, '44')}
    }, 'SUPERSEDED'),
    e._draft && /*#__PURE__*/React.createElement("span", {
      /* A saved CE whose status is Draft and an unsaved draft both read
         "Draft" in the status column. This badge says which is which. */
      title: 'Unsaved draft by ' + (e.savedByName || e.savedBy || 'someone') + ' — Load to pick it up',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8, background: '#8B5CF622', color: 'var(--accent-violet)', border: '1px solid #8B5CF644'}
    }, 'UNSAVED'),
    e.info?.request && !e._draft && /*#__PURE__*/React.createElement("span", {
      title: e.info.acceptedCeNum ? 'Accepted as ' + e.info.acceptedCeNum + ', not costed yet — Load it to build the estimate' : 'Logged request, not accepted yet — it is known by its RCE No. until the Cost Estimation team accepts it',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8, background: alpha(OK, '22'), color: OK, border: '1px solid ' + alpha(OK, '44')}
    }, 'REQUEST'),
    e.info?.request && e.info.reviewStatus && e.info.reviewStatus !== 'accepted' && !e._draft && /*#__PURE__*/React.createElement("span", {
      title: e.info.reviewNote || '',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8, color: e.info.reviewStatus === 'declined' ? ERR : e.info.reviewStatus === 'returned' ? ACC : INFO, border: '1px solid currentColor'}
    }, String(e.info.reviewStatus).toUpperCase()),
    !isRequestor && e.info?.request && !e.info.acceptedCeNum && !e._draft && typeof e.id === 'number' && /*#__PURE__*/React.createElement("button", {
      style: {...btn('ok', true), marginLeft: 5, fontSize: 9, padding: '1px 7px'},
      title: 'Review the checklist and decide: proceed, secure the missing data first, or decline',
      onClick: () => openReview(e, 'review')
    }, 'Review'),
    isRequestor && e.info?.request && !e.info.acceptedCeNum && e.info.reviewStatus !== 'declined' && reqOwns(e.id) && !e._draft && typeof e.id === 'number' && /*#__PURE__*/React.createElement("button", {
      style: {...btn('info', true), marginLeft: 5, fontSize: 9, padding: '1px 7px'},
      title: 'Add or correct what the Cost Estimation team asked for',
      onClick: () => setRceReview({e, mode: 'update'})
    }, 'Update'),
    /* Superseded revisions are folded into the row that supersedes them. The
       chip says how many, so a CE with history is visible as such without
       having to take three rows to say it. */
    (e._revs || []).length > 0 && /*#__PURE__*/React.createElement("button", {
      title: monRevOpen.has(e.id)
        ? 'Hide the superseded revisions'
        : 'Show the ' + e._revs.length + ' superseded revision' + (e._revs.length === 1 ? '' : 's') + ' of this CE',
      onClick: () => setMonRevOpen(p => { const n = new Set(p); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; }),
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8,
              background: alpha(INFO, '22'), color: INFO, border: '1px solid ' + alpha(INFO, '44'), cursor: 'pointer'}
    }, (monRevOpen.has(e.id) ? '▾ ' : '▸ ') + '+' + e._revs.length + ' rev'),
    /* Two rows claiming the same revision of the same number are not a CE and
       its revision -- they are two different jobs filed under one number. They
       are deliberately NOT merged, because merging would hide one of them and
       its value with it. */
    e._dup && /*#__PURE__*/React.createElement("span", {
      title: 'Another CE on file carries this same number and revision. They have been left as separate rows — one of them needs renumbering.',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8,
              background: alpha(ERR, '22'), color: ERR, border: '1px solid ' + alpha(ERR, '44')}
    }, '⚠ DUPLICATE No.')), /*#__PURE__*/React.createElement("td", {
      className: 'mon-rce',
      style: { ...TDS, padding: '4px 6px' }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: { ...INP, border: 'none', background: 'transparent', padding: '2px 4px', fontSize: 11, width: '100%', ...MONO },
      key: e.id + 'rceNo',
      defaultValue: m.rceNo || '',
      onBlur: ev => { const v = ev.target.value.trim(); if (v !== String(m.rceNo || '')) updateMon(e.id, 'rceNo', v); },
      placeholder: "RCE No. from Sales"
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,...MONO}}, rceOf(e, m) || '—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'designation',
      defaultValue: m.designation || m.discipline || e.info?.discipline || e.info?.projType || '',
      onBlur: ev => {
        const cur = m.designation || m.discipline || e.info?.discipline || e.info?.projType || '';
        if (ev.target.value !== String(cur)) updateMon(e.id, 'designation', ev.target.value);
      }
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, m.designation || m.discipline || e.info?.discipline || e.info?.projType || '')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'customer',
      defaultValue: m.customer || e.info?.client || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.customer || e.info?.client || '')) updateMon(e.id, 'customer', ev.target.value);
      },
      placeholder: e.info?.client
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, m.customer||e.info?.client||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        minWidth: 320,
        maxWidth: 320
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'jobTitle',
      defaultValue: m.jobTitle || jobTitle,
      onBlur: ev => {
        if (ev.target.value !== String(m.jobTitle || jobTitle)) updateMon(e.id, 'jobTitle', ev.target.value);
      },
      placeholder: jobTitle
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,whiteSpace:'normal',wordBreak:'break-word',display:'block',maxWidth:310}}, m.jobTitle||jobTitle||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        whiteSpace: 'nowrap',
        textAlign: 'right',
        fontWeight: 600,
        fontSize: 11,
        color: e.grand ? OK : MT
      }
    }, e.grand ? '₱' + Number(e.grand).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        whiteSpace: 'nowrap',
        color: MT,
        fontSize: 10
      }
    }, m.dateRecv || dateRecv), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      type: "date",
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 10,
        width: '100%',
        ...MONO
      },
      key: e.id + 'deadline',
      defaultValue: m.deadline || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.deadline || '')) updateMon(e.id, 'deadline', ev.target.value);
      }
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:10,...MONO,color:daysColor}}, m.deadline ? new Date(m.deadline+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : '—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        textAlign: 'center',
        ...MONO,
        fontWeight: 700,
        color: daysColor
      }
      , title: dl.done ? 'Submitted ' + m.dateSubmitted + ' against a ' + m.deadline + ' deadline' : ''
    }, dl.label), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      type: "date",
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 10,
        width: '100%',
        ...MONO
      },
      key: e.id + 'dateSubmitted',
      defaultValue: m.dateSubmitted || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.dateSubmitted || '')) updateMon(e.id, 'dateSubmitted', ev.target.value);
      }
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:10,...MONO}}, m.dateSubmitted ? new Date(m.dateSubmitted+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : '—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, /*#__PURE__*/React.createElement("div", null,
      /*#__PURE__*/React.createElement("span", {style:{display:'inline-block',background:alpha(statusColor, '22'),color:statusColor,fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:12,whiteSpace:'nowrap'}}, m.status||'—'),
      m.statusChangedAt && /*#__PURE__*/React.createElement("div", {style:{fontSize:9,color:MT,marginTop:2,lineHeight:1.3},title:'Changed by '+(m.statusChangedBy||'unknown')}, new Date(m.statusChangedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}), m.statusChangedBy?' · '+m.statusChangedBy.split(' ')[0]:''),
      m.apv && m.apv.state === 'superseded' && /*#__PURE__*/React.createElement("div", {style:{fontSize:9,marginTop:2,fontWeight:700,color:MT}, title:'This revision was replaced; its approval was closed.'}, '⊘ Superseded' + (m.apv.supersededBy ? ' by ' + m.apv.supersededBy : '')),
      m.apv && ['pending','approved','returned'].includes(m.apv.state) && (() => {
        const turn = apvMonWaitsOn(m, currentUser.username);
        return /*#__PURE__*/React.createElement("div", {style:{fontSize:9,marginTop:2,fontWeight:700,color:m.apv.state==='approved'?'#16a34a':m.apv.state==='returned'?ERR:'var(--accent-cyan)',cursor:turn?'pointer':'default'},
          title: turn ? 'Open it to approve and sign' : '', onClick: turn ? () => setViewCE({id:e.id,ceNum:e.info?.ceNum||e.ceNum||''}) : undefined},
          m.apv.state === 'approved' ? '✅ Approved' : m.apv.state === 'returned' ? '↩ Returned' : '✍ ' + m.apv.signed + '/' + m.apv.total + ' signed' + (turn ? ' · YOUR TURN' : ''));
      })()
    )), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'receivedBy',
      defaultValue: m.receivedBy || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.receivedBy || '')) updateMon(e.id, 'receivedBy', ev.target.value);
      },
      placeholder: "Name..."
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, m.receivedBy||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        maxWidth: 160
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'remarks',
      defaultValue: m.remarks || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.remarks || '')) updateMon(e.id, 'remarks', ev.target.value);
      },
      placeholder: "Notes..."
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT}}, m.remarks||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        position: 'sticky',
        right: 0,
        zIndex: 2,
        background: stickyBg,
        borderLeft: `1px solid ${BDR}`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        /* Three across rather than one tall column: thirteen stacked buttons
           made every row as tall as the list of actions. */
        display: 'grid',
        gridTemplateColumns: 'repeat(3, auto)',
        /* Each button has a fixed cell, one row per purpose -- track, open,
           output, copy, and Delete alone -- so a button a row does not offer
           leaves a gap instead of shuffling the rest out of their group. */
        gap: 3,
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      /* Status changes constantly and everything else in the row does not, so
         it gets its own action rather than sharing Edit with the reference
         fields. It opens a panel: pick the new status, and read the trail. */
      disabled: !!e._draft || (isRequestor && !reqOwns(e.id)),
      style: {gridRow: 1, gridColumn: 1, ...btn(statusPanel === e.id ? 'acc' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'A draft is always Draft — save the CE to start tracking it' : 'Update status and view its history',
      onClick: () => { if (!e._draft) setStatusPanel(statusPanel === e.id ? null : e.id); }
    }, '⚑ Status'), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft || (isRequestor && !reqOwns(e.id)),
      style: {gridRow: 1, gridColumn: 2, ...btn('def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE to start its remarks' : 'Add a remark and read every earlier one',
      onClick: () => { if (!e._draft) { setRemarkDraft(''); setRemarksPanel({ id: e.id, ceNum: e.info?.ceNum || e.ceNum || '' }); } }
    }, '💬 Remarks' + (((monData[e.id] || {}).remarksLog || []).length > 1 ? ' (' + monData[e.id].remarksLog.length + ')' : '')), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft || (isRequestor && !reqOwns(e.id)),
      style: {gridRow: 1, gridColumn: 3, ...btn(assignPanel && assignPanel.id === e.id ? 'acc' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE first — a draft has no monitoring record to assign' : 'Reassign this CE to another estimator',
      onClick: () => { if (!e._draft) openAssign(e); }
    }, '👤 Assign'), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft || (isRequestor && !reqOwns(e.id)),
      style: {gridRow: 2, gridColumn: 3, ...btn(editingRow === e.id ? 'ok' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE first — a draft has no monitoring record to hold a deadline' : 'Edit monitoring fields',
      onClick: () => { if (!e._draft) setEditingRow(editingRow === e.id ? null : e.id); }
    }, editingRow === e.id ? '✓ Done' : '✎ Edit'), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft,
      style: {gridRow: 3, gridColumn: 3, ...btn(attachPanel === e.id ? 'acc' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE first — attachments need a saved record' : "Attachments (Drawings, TOR, etc.)",
      onClick: () => { if (e._draft) return; if (attachPanel === e.id) { setAttachPanel(null); } else { openAttachPanel(e.id); } }
    }, '📎', monSpIds.has(String(e.id)) && attachList.length > 0 && attachPanel === e.id ? ` ${attachList.length}` : ''), (e.data || e.info) && /*#__PURE__*/React.createElement("button", {
      style: {
        gridRow: 2, gridColumn: 2, ...btn('acc', true),
        fontSize: 10,
        padding: '2px 8px'
      },
      onClick: () => e._draft ? resumeDraft(e._draft) : handleLoad(e.data || e)
    }, "Load"), (isAdmin || (e._draft && e.savedBy === currentUser.username)) && /*#__PURE__*/React.createElement("button", {
      style: {
        gridRow: 5, gridColumn: 3, ...btn('danger', true),
        fontSize: 10,
        padding: '2px 8px'
      },
      onClick: async () => {
        if (confirmDel !== e.id) {
          setConfirmDel(e.id);
          return;
        }
        setConfirmDel(null);
        /* A draft row has no history entry behind it; deleting one has to go
           to the drafts list or the row comes back on the next refresh. */
        if (e._draft) { await deleteDraft(e._draft.draftId, e._draft, true); return; }
        const ceNum = e.info?.ceNum || e.ceNum || String(e.id);
        const snapshot = [...history];
        setHistory(prev => prev.filter(h => h.id !== e.id));
        let undone = false;
        const tid = setTimeout(async () => {
          if (!undone) {
            await dbDeleteHistory(e.id, currentUser.role);
            auditLog('delete_ce', ceNum, currentUser?.username);
            _checkAutoBackup();
          }
          setUndoToast(null);
        }, 10000);
        setUndoToast({
          msg: `CE ${ceNum} deleted.`,
          onUndo: () => {
            undone = true;
            clearTimeout(tid);
            setHistory(snapshot);
            setUndoToast(null);
            showToast('Delete undone.');
          }
        });
      }
    }, confirmDel === e.id ? 'Sure?' : 'Del'), e._draft&&typeof e.id!=='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:2,gridColumn:1,...btn('info',true),fontSize:10,padding:'2px 8px'},onClick:()=>{
      const k='shic:viewDraft:'+Date.now();
      try { localStorage.setItem(k, JSON.stringify(e._draft)); } catch (ex) { showToast('This draft is too large to view here — use Load.', true); return; }
      setViewCE({draftKey:k,ceNum:(e._draft.info&&e._draft.info.ceNum)||e.info?.ceNum||'',draft:true});
    },title:"View this draft here without loading it — your open work is left as it is"},"👁 View"), typeof e.id==='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:2,gridColumn:1,...btn('info',true),fontSize:10,padding:'2px 8px'},onClick:()=>setViewCE({id:e.id,ceNum:e.info?.ceNum||e.ceNum||''}),title:"View the CE here without loading it — your open work is left as it is"},"👁 View"), typeof e.id==='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:3,gridColumn:1,...btn('def',true),fontSize:10,padding:'2px 8px'},onClick:()=>openForPrint(e.id,'ce'),title:"Generate the printable CE in its own tab — this one is left as it is"},"\uD83D\uDDA8 CE"), typeof e.id==='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:3,gridColumn:2,...btn('def',true),fontSize:10,padding:'2px 8px'},onClick:()=>openForPrint(e.id,'detailed'),title:"Export Detailed in its own tab — this one is left as it is"},"\u2B07 xlsx"), typeof e.id==='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:3,gridColumn:3,...btn('def',true),fontSize:10,padding:'2px 8px'},onClick:()=>openForPrint(e.id,'noamt'),title:"Generate CE (no amounts): the printable CE with every amount left blank, in its own tab \u2014 this one is left as it is"},"\uD83D\uDDA8 CE (no amounts)"), (e.data||e.info)&&/*#__PURE__*/React.createElement("button",{style:{gridRow:4,gridColumn:1,...btn('ok',true),fontSize:10,padding:'2px 8px'},onClick:()=>handleClone(e.data||e),title:"Clone with new CE number"},"Clone"), (e.data||e.info)&&/*#__PURE__*/React.createElement("button",{style:{gridRow:4,gridColumn:2,...btn('info',true),fontSize:10,padding:'2px 8px'},onClick:()=>handleRevise(e.data||e),title:"Revision copy (-R1, -R2...)"},"Revise"),
    /* Feature 3: Compare button for revisions */
    (()=>{const cn=(e.info?.ceNum||e.ceNum||'');const isRev=/-R\d+$/i.test(cn);if(!isRev)return null;return/*#__PURE__*/React.createElement("button",{style:{gridRow:4,gridColumn:3,...btn('def',true),fontSize:10,padding:'2px 8px'},title:"Compare with base CE",onClick:()=>{const base=cn.replace(/-R\d+$/i,'').toUpperCase();const baseEntry=history.find(h=>(h.info?.ceNum||h.ceNum||'').toUpperCase()===base);setDiffModal({base:baseEntry||null,rev:e.data||e});}},"⚖ Diff");})()
    )));
  }))))),
  /* Pagination bar */
  (() => {
    const totalPages = Math.ceil(sortedHistory.length / MON_PAGE_SIZE);
    if (totalPages <= 1) return null;
    const start = monPage * MON_PAGE_SIZE + 1;
    const end = Math.min((monPage + 1) * MON_PAGE_SIZE, sortedHistory.length);
    return /*#__PURE__*/React.createElement('div', {
      style: {display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
              background:CARD, borderTop:`1px solid ${BDR}`, borderRadius:'0 0 8px 8px',
              fontSize:11, color:MT}
    },
      /*#__PURE__*/React.createElement('span', null, `Showing ${start}–${end} of ${sortedHistory.length}`),
      /*#__PURE__*/React.createElement('div', {style:{marginLeft:'auto', display:'flex', gap:4}},
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage === 0,
          onClick: () => setMonPage(0)
        }, '«'),
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage === 0,
          onClick: () => setMonPage(p => p - 1)
        }, '‹'),
        ...[...Array(totalPages)].map((_,i) => {
          if (totalPages > 7 && Math.abs(i - monPage) > 2 && i !== 0 && i !== totalPages-1) {
            if (i === 1 && monPage > 3) return /*#__PURE__*/React.createElement('span',{key:i,style:{color:MT,padding:'0 2px'}},'…');
            if (i === totalPages-2 && monPage < totalPages-4) return /*#__PURE__*/React.createElement('span',{key:i,style:{color:MT,padding:'0 2px'}},'…');
            if (Math.abs(i - monPage) > 2) return null;
          }
          return /*#__PURE__*/React.createElement('button', {
            key: i,
            style:{...btn(i===monPage?'acc':'def',true), padding:'2px 8px', fontSize:11, minWidth:28},
            onClick: () => setMonPage(i)
          }, i+1);
        }),
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage >= totalPages-1,
          onClick: () => setMonPage(p => p + 1)
        }, '›'),
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage >= totalPages-1,
          onClick: () => setMonPage(totalPages - 1)
        }, '»')
      )
    );
  })(),
  /* ── Compare bar (floats when 2 CEs selected) ── */
  compareSet.size === 2 && /*#__PURE__*/React.createElement("div", {
    style:{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:500,background:ACC,color:ON_ACC,borderRadius:12,padding:'10px 20px',display:'flex',gap:12,alignItems:'center',boxShadow:'0 4px 20px #0008',fontWeight:700,fontSize:13}
  }, "⚖ 2 CEs selected",
    /*#__PURE__*/React.createElement("button", {
      style:{background:'#000',color:ACC,border:'none',borderRadius:6,padding:'4px 14px',fontWeight:700,cursor:'pointer',fontSize:12},
      onClick: async () => {
        const [idA, idB] = [...compareSet];
        const loadFull = async id => {
          const e = history.find(h => h.id === id);
          if (!e) return null;
          const ceNum = e.info?.ceNum || e.ceNum || '';
          const cached = LS.get('ce_cache:' + ceNum);
          if (cached && cached.tools !== undefined) return cached;
          if (typeof id === 'number' && (USE_SP || getSiteURL())) {
            try { const full = await dbLoadCE(id); if (full) return full; } catch(_e){logSwallowed('App:L7046',_e);}
          }
          return e;
        };
        const [a, b] = await Promise.all([loadFull(idA), loadFull(idB)]);
        setCompareModal({a, b});
      }
    }, "Compare →"),
    /*#__PURE__*/React.createElement("button", {
      style:{background:'transparent',color:ON_ACC,border:`1px solid ${alpha(ON_ACC,'26')}`,borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12},
      onClick: () => setCompareSet(new Set())
    }, "✕")
  ),
  /* ── Compare Modal ── */
  compareModal && (() => {
    const {a, b} = compareModal;
    const ceA = a?.info?.ceNum || 'CE A';
    const ceB = b?.info?.ceNum || 'CE B';
    const calcSections = ce => {
      if (!ce) return {};
      /* That CE's multipliers, not the open one's: comparing two estimates
         must price each at what it was quoted at. */
      const _r = ceRates(ce);
      const mpT = (ce.mp||[]).reduce((s,r)=>s+N(r.pax)*N(r.days)*N(r.rate)*ceShiftMult(_r,r.shift)+N(r.pax)*N(r.days)*N(r.otHours)*(N(r.rate)/8)*ceOtMult(_r)+(ceIncentiveOn(ce.ceType)?N(r.pax)*N(r.days)*N(r.perDiem):0),0);
      const toolT = (ce.tools||[]).reduce((s,r)=>s+N(r.qty)*resDays(r)*N(r.cost),0);
      const matT = (ce.mats||[]).reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
      const ppeT = (ce.ppe||[]).reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
      const miscT = Object.values(ce.misc||{}).flat().reduce((s,r)=>s+miscRowCost(r),0);
      const grand = mpT+toolT+matT+ppeT+miscT;
      return {mpT,toolT,matT,ppeT,miscT,grand};
    };
    const sA = calcSections(a), sB = calcSections(b);
    const rows = [['Manpower','mpT'],['Tools & Equipment','toolT'],['Materials','matT'],['PPE','ppeT'],['Miscellaneous','miscT'],['Grand Total','grand']];
    const diffColor = (va,vb) => va===vb ? MT : va>vb ? OK : ERR;
    return /*#__PURE__*/React.createElement("div", {
      style:{position:'fixed',inset:0,zIndex:600,background:'#0009',display:'flex',alignItems:'center',justifyContent:'center'},
      onClick: e => { if(e.target===e.currentTarget) setCompareModal(null); }
    }, /*#__PURE__*/React.createElement("div", {
      style:{background:CARD,border:`1px solid ${BDR}`,borderRadius:12,padding:24,minWidth:560,maxWidth:'90vw',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 40px #0008'}
    },
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}},
        /*#__PURE__*/React.createElement("span", {style:{fontWeight:800,fontSize:15}}, "⚖ CE Comparison"),
        /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),fontSize:11}, onClick:()=>setCompareModal(null)}, "✕ Close")
      ),
      /*#__PURE__*/React.createElement("div", {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}},
        /*#__PURE__*/React.createElement("div", {style:{...CS,padding:'8px 12px'}},
          /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:ACC,fontSize:12}}, ceA),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, a?.info?.client||'—'),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, a?.info?.description||'—')
        ),
        /*#__PURE__*/React.createElement("div", {style:{...CS,padding:'8px 12px'}},
          /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:INFO,fontSize:12}}, ceB),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, b?.info?.client||'—'),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, b?.info?.description||'—')
        )
      ),
      /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
        /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {style:{background:SURF}},
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'left'}}, "Section"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right',color:ACC}}, ceA),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right',color:INFO}}, ceB),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right'}}, "Δ Diff")
        )),
        /*#__PURE__*/React.createElement("tbody", null, rows.map(([label,key]) => {
          const va = sA[key]||0, vb = sB[key]||0, diff = vb-va;
          const isGrand = key==='grand';
          return /*#__PURE__*/React.createElement("tr", {key, style:{borderBottom:`1px solid ${alpha(BDR, '22')}`,background:isGrand?alpha(SURF, '88'):'transparent'}},
            /*#__PURE__*/React.createElement("td", {style:{...TDS,fontWeight:isGrand?700:400}}, label),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:isGrand?ACC:TX}}, '₱'+ph(va)),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:isGrand?INFO:TX}}, '₱'+ph(vb)),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:diffColor(va,vb)}}, diff===0?'—':(diff>0?'+':'')+'₱'+ph(diff))
          );
        }))
      ),
      /*#__PURE__*/React.createElement("div", {style:{marginTop:14,display:'flex',gap:8,justifyContent:'flex-end'}},
        /*#__PURE__*/React.createElement("button", {style:{...btn('acc',true),fontSize:11}, onClick:()=>{handleLoad(a);setCompareModal(null);}}, "Load "+ceA),
        /*#__PURE__*/React.createElement("button", {style:{...btn('info',true)||btn('def',true),fontSize:11,borderColor:alpha(INFO, '55'),color:INFO}, onClick:()=>{handleLoad(b);setCompareModal(null);}}, "Load "+ceB)
      )
    ));
  })()
  );
}
