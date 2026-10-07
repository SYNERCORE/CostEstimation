/* The Project Info tab: issuing company, client and CE details, the attached documents with AI extraction, and the scope-of-work builder.

   Moved out of App.js unchanged. Invoked as InfoTab({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function InfoTab(ctx) {
  const {
    ScopeBuilder,
    addMode,
    aiLoad,
    ceType,
    companies,
    docBusy,
    docFile,
    docFilesOf,
    docPreview,
    docStatus,
    extractDocInfo,
    fileRef,
    handleAI,
    handleDocUpload,
    info,
    monData,
    openCeId,
    openMonStatus,
    pickCompany,
    provInfo,
    qtyUom,
    rceNo,
    removeDoc,
    scope,
    setAddMode,
    setDocFile,
    setDocPreview,
    setDocStatus,
    setInfo,
    setScope,
    updateMon
  } = ctx;
  return React.createElement("div", null,
  /* The checklist Sales filled in, read back where the estimator starts.
     Without this the form would be write-only: thirteen answers collected
     at the front door and never shown to the person they were collected
     for. Read-only here -- it is Sales's record of what they sent, and
     the estimator correcting it would erase what was actually received. */
  (info.rce && /*#__PURE__*/React.createElement(RceChecklistCard, {rce: info.rce})),
  companies.length === 0 && /*#__PURE__*/React.createElement("div", {style: {margin: '0 0 14px 0', padding: '12px 16px', background: '#F8514920', border: '1px solid #F85149', borderRadius: 8, color: ERR, fontSize: 12, fontWeight: 600}}, "⚠ No companies configured. Go to the Admin → Users tab and set up at least one company before creating a CE."), /*#__PURE__*/React.createElement("div", {
    style: CS
  }, secHead("Project Details", MT, null, {size: 11, mb: 14}), /*#__PURE__*/React.createElement("div", {
    style: {marginBottom: 16, padding: '12px 14px', background: '#A78BFA11', borderRadius: 8, border: '2px solid #A78BFA44', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'}
  }, /*#__PURE__*/React.createElement("div", {style: {flex: 1, minWidth: 200}},
    /*#__PURE__*/React.createElement("label", {style: {...LBL, color: 'var(--accent-violet)', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em'}}, "🏢 Issuing Company", /*#__PURE__*/React.createElement("span", { style: { color: ERR } }, " *")),
    /*#__PURE__*/React.createElement("select", {
      style: { ...INP, ...((info.companyId == null || info.companyId === '') ? { borderColor: ERR } : {}) },
      value: info.companyId != null ? info.companyId : '',
      onChange: e => pickCompany(e.target.value)
    }, /*#__PURE__*/React.createElement("option", {value: "", disabled: true}, "— Select issuing company —"), companies.map(c => /*#__PURE__*/React.createElement("option", {key: c.id, value: c.id}, c.name + (c.sub ? ' — ' + c.sub : ''))))
  ), (() => {
    const selCo = companies.find(c => String(c.id) === String(info.companyId != null ? info.companyId : (companies[0]||{}).id)) || companies[0] || {};
    return /*#__PURE__*/React.createElement("div", {style: {display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}},
      selCo.logo && /*#__PURE__*/React.createElement("img", {src: selCo.logo, style: {maxWidth: 64, maxHeight: 32, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 3, border: `1px solid ${BDR}`}}),
      /*#__PURE__*/React.createElement("div", {style: {fontSize: 11, color: MT, lineHeight: 1.5}},
        /*#__PURE__*/React.createElement("div", null, "CE Prefix: ", /*#__PURE__*/React.createElement("b", {style: {color: TX}}, selCo.cePrefix || 'SHIC'), " → ", /*#__PURE__*/React.createElement("b", {style: {color: 'var(--accent-violet)'}}, (selCo.cePrefix||'SHIC')+'-CE-'+new Date().getFullYear()+'-XXXX')),
        /*#__PURE__*/React.createElement("div", null, "Doc No: ", /*#__PURE__*/React.createElement("b", {style: {color: TX}}, selCo.docNo || '—'), "  Rev: ", /*#__PURE__*/React.createElement("b", {style: {color: TX}}, selCo.revNo || '0'))
      )
    );
  })()), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "CE Number"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.ceNum,
    onChange: e => setInfo(p => ({
      ...p,
      ceNum: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Date"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      colorScheme: 'dark'
    },
    type: "date",
    value: info.date,
    onChange: e => setInfo(p => ({
      ...p,
      date: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Client Name"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.client,
    onChange: e => setInfo(p => ({
      ...p,
      client: e.target.value
    })),
    placeholder: "Client name"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Client Location"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.location,
    onChange: e => setInfo(p => ({
      ...p,
      location: e.target.value
    })),
    placeholder: "Site location"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Project Description / Scope Summary", /*#__PURE__*/React.createElement("span", { style: { color: ERR } }, " *")), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...INP,
      height: 66,
      resize: 'vertical',
      ...(String(info.description || '').trim() ? {} : { borderColor: ERR })
    },
    value: info.description,
    onChange: e => setInfo(p => ({
      ...p,
      description: e.target.value
    })),
    placeholder: "Brief scope description..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Discipline", /*#__PURE__*/React.createElement("span", { style: { color: ERR } }, " *")), /*#__PURE__*/React.createElement("select", {
    style: { ...INP, ...(info.projType ? {} : { borderColor: ERR }) },
    title: 'Required before the CE can be saved',
    value: info.projType || '',
    onChange: e => setInfo(p => ({
      ...p,
      projType: e.target.value
    }))
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "— Select discipline —"), /*#__PURE__*/React.createElement("option", {
    value: "Electrical"
  }, "Electrical"), /*#__PURE__*/React.createElement("option", {
    value: "Mechanical"
  }, "Mechanical"), /*#__PURE__*/React.createElement("option", {
    value: "Civil"
  }, "Civil"), /*#__PURE__*/React.createElement("option", {
    value: "General"
  }, "General"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Department"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.dept,
    onChange: e => setInfo(p => ({
      ...p,
      dept: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Status"), /*#__PURE__*/React.createElement("select", {
    style: INP,
    value: docStatus,
    title: openMonStatus
      ? 'Kept in step with the Monitoring status (' + openMonStatus + ')'
      : 'Seeds the Monitoring status when this CE is saved',
    onChange: e => setDocStatus(e.target.value)
  }, CE_DOC_STATUSES.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Material"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.material,
    onChange: e => setInfo(p => ({
      ...p,
      material: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Quantity (for unit price)"), /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 6 } }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      ...MONO,
      flex: 1, minWidth: 0
    },
    type: "number",
    min: 1,
    value: info.qty,
    onChange: e => setInfo(p => ({
      ...p,
      qty: e.target.value
    }))
  }), /* A plain dropdown: a datalist only offered what matched the text
         already in the box, so with LOT in it LOT was the only choice. */
  (() => {
    const QTY_UOMS = ['LOT', 'PCS', 'SET', 'UNIT', 'EA', 'JOB', 'MANDAYS'];
    const cur = qtyUom;
    return /*#__PURE__*/React.createElement("select", {
      className: 'qty-uom',
      style: { ...INP, width: 100 },
      title: "The unit the Quantity is counted in. Prints after it: 3 PCS, 1 LOT.",
      value: cur,
      onChange: async e => {
        let v = e.target.value;
        if (v === '__other') { v = String((await uiPrompt('Unit for the quantity (e.g. METERS, ROLLS)', {placeholder: 'e.g. METERS', required: true, ok: 'Use this unit'})) || '').trim().toUpperCase(); if (!v) return; }
        setInfo(p => ({ ...p, qtyUom: v }));
      }
    }, (QTY_UOMS.includes(cur) ? QTY_UOMS : [...QTY_UOMS, cur]).map(u => /*#__PURE__*/React.createElement("option", { key: u, value: u }, u)),
      /*#__PURE__*/React.createElement("option", { value: '__other' }, "Other…"));
  })())), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "RCE No."), /*#__PURE__*/React.createElement("input", {
    className: 'info-rce',
    style: { ...INP, ...MONO },
    placeholder: "From Sales",
    value: info.rceNo !== undefined ? info.rceNo : rceNo,
    onChange: e => setInfo(p => ({ ...p, rceNo: e.target.value })),
    onBlur: e => { const v = e.target.value.trim(); if (openCeId != null && v !== String((monData[openCeId] || {}).rceNo || '')) updateMon(openCeId, 'rceNo', v); }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "No. of Days"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      ...MONO
    },
    type: "number",
    min: 1,
    value: info.days,
    onChange: e => setInfo(p => ({
      ...p,
      days: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Attention"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.attention,
    onChange: e => setInfo(p => ({
      ...p,
      attention: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "End User"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.endUser,
    onChange: e => setInfo(p => ({
      ...p,
      endUser: e.target.value
    }))
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(INFO, '44')
    }
  }, secHead("Client Document", INFO, null, {size: 11, mb: 12}), !docFile ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: `2px dashed ${BDR}`,
      borderRadius: 8,
      padding: '26px 20px',
      textAlign: 'center',
      cursor: 'pointer',
      background: SURF
    },
    onClick: () => fileRef.current?.click(),
    onDragOver: e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = INFO;
    },
    onDragLeave: e => e.currentTarget.style.borderColor = BDR,
    onDrop: e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = BDR;
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleDocUpload(e.dataTransfer.files, true);
    }
  }, docBusy ? /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "spin",
    style: {
      fontSize: 20
    }
  }, "+"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 8
    }
  }, "Reading document...")) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 26,
      marginBottom: 8
    }
  }, "Docs"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: TX,
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 4
    }
  }, "Drop files here or click to browse — several at once is fine"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "PDF - Word (.docx) - Excel (.xlsx) - Text (.txt)"))) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 12px',
      background: SURF,
      borderRadius: 8,
      border: `1px solid ${BDR}`,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 13,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, docFile.name), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      marginTop: 2
    }
  }, docFile.size > 0 ? Math.round(docFile.size / 1024) + ' KB - ' : '', docFile.text ? docFile.text.split(/\s+/).filter(Boolean).length.toLocaleString() + ' words' : 'reference only', docFile.spUrl && /*#__PURE__*/React.createElement(React.Fragment, null, " - ", /*#__PURE__*/React.createElement("a", {
    href: spAbsUrl(docFile.spUrl),
    target: "_blank",
    style: {
      color: INFO,
      textDecoration: 'none'
    }
  }, "SharePoint link")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5,
      flexShrink: 0
    }
  }, docFile.text && /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setDocPreview(p => !p)
  }, docPreview ? 'Hide' : 'Preview'), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    title: 'Add more documents to this CE',
    onClick: () => fileRef.current?.click()
  }, "＋ Add files"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: ERR,
      cursor: 'pointer',
      fontSize: 16,
      padding: '1px 5px'
    },
    onClick: () => {
      setDocFile(null);
      setDocPreview(false);
    }
  }, "x"))), docFilesOf(docFile).length > 1 && /*#__PURE__*/React.createElement("div", {
    style: {display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10}
  }, docFilesOf(docFile).map(f => /*#__PURE__*/React.createElement("div", {
    key: f.name,
    style: {display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 10px', background: SURF, border: '1px solid ' + BDR, borderRadius: 6}
  }, /*#__PURE__*/React.createElement("span", {style: {flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, '📄 ' + f.name),
    f.size > 0 && /*#__PURE__*/React.createElement("span", {style: {color: MT, fontSize: 10}}, Math.round(f.size / 1024) + ' KB'),
    f.spUrl && /*#__PURE__*/React.createElement("a", {href: spAbsUrl(f.spUrl), target: '_blank', style: {color: INFO, textDecoration: 'none', fontSize: 10}}, 'open'),
    /*#__PURE__*/React.createElement("button", {
      title: 'Remove ' + f.name + ' from this CE',
      style: {background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 13, padding: '0 4px'},
      onClick: () => removeDoc(f.name)
    }, '×')))), docPreview && docFile.text && /*#__PURE__*/React.createElement("div", {
    style: {
      background: SURF,
      border: `1px solid ${BDR}`,
      borderRadius: 6,
      padding: 10,
      maxHeight: 150,
      overflowY: 'auto',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("pre", {
    style: {
      color: MT,
      fontSize: 10,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
      ...MONO
    }
  }, docFile.text.slice(0, 3000), docFile.text.length > 3000 ? '\n...[truncated]' : '')), docFile.text && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, !getApiKey() && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      background: alpha(ERR, '15'),
      border: `1px solid ${alpha(ERR, '44')}`,
      borderRadius: 6,
      padding: '7px 12px',
      color: ERR,
      fontSize: 11
    }
  }, "No AI key. Click \"Set AI Key\" in the top bar - Gemini, Groq & Kimi are free."), /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: extractDocInfo,
    disabled: docBusy || !getApiKey()
  }, docBusy ? 'Extracting...' : 'Extract Info with AI'), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "Auto-fills client, location, scope and more"))), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: ".pdf,.docx,.xlsx,.xls,.txt,.csv",
    multiple: true,
    style: {
      display: 'none'
    },
    onChange: e => {
      if (e.target.files && e.target.files.length) handleDocUpload(e.target.files, true);
      e.target.value = '';
    }
  })), ScopeBuilder(), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(ACC, '55')
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 6
    }
  }, "AI Scope Assistant"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 10,
      lineHeight: 1.5
    }
  }, "Describe the scope - AI populates all line items (Manpower, Tools, Materials, PPE) using your Masterlist rates."), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...INP,
      height: 72,
      resize: 'vertical',
      marginBottom: 10
    },
    value: scope,
    onChange: e => setScope(e.target.value),
    placeholder: 'e.g. "Install 2 LV switchboards and 300m cable run. 10-day ' + ceType + ' job."'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, !getApiKey() && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      background: alpha(ERR, '15'),
      border: `1px solid ${alpha(ERR, '44')}`,
      borderRadius: 6,
      padding: '7px 12px',
      color: ERR,
      fontSize: 11
    }
  }, "No AI key. Click \"Set AI Key\" - Gemini, Groq & Kimi are free (no credit card)."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: handleAI,
    disabled: aiLoad || !scope.trim() || !getApiKey()
  }, aiLoad ? 'Generating...' : 'Generate with AI'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 3,
      background: SURF,
      borderRadius: 6,
      padding: '2px 3px',
      border: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn(addMode ? 'def' : 'info', true),
      fontSize: 10,
      padding: '2px 8px'
    },
    onClick: () => setAddMode(false),
    title: "Overwrite existing resources"
  }, "Replace"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn(addMode ? 'info' : 'def', true),
      fontSize: 10,
      padding: '2px 8px'
    },
    onClick: () => setAddMode(true),
    title: "Add to existing without overwriting"
  }, "Add"))), aiLoad && /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "Calling ", provInfo?.label || 'AI', "..."))));
}
