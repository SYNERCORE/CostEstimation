/* The Summary tab: the cost roll-up, margin and notes, approval and signature controls, and the export / print / save actions.

   Moved out of App.js unchanged. Invoked as SummaryTab({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function SummaryTab(ctx) {
  const {
    _defaultsUntouched,
    _mobTabs,
    addlCosts,
    aiSuggest,
    applyCeDefaults,
    approvers,
    attachFromSummary,
    apvBar,
    apvLocked,
    apvState,
    apvUsers,
    busyBtn,
    busyOp,
    ceDefaults,
    ceLayoutKey,
    ceType,
    cfg,
    collectZeroCost,
    demobVehicles,
    docFile,
    grand,
    handleExport,
    handleExportXLSX,
    handleGenerateCEWithCheck,
    handlePrintPreview,
    handleSave,
    handleSaveRevision,
    history,
    hlAmt,
    hlKeys,
    hlLabel,
    hlMissing,
    hlPick,
    hlPickQ,
    hlSources,
    info,
    isRequestor,
    loadSharedDrafts,
    margin,
    mats,
    misc,
    mkNote,
    mobVehicles,
    mp,
    notes,
    perJob,
    perJobNames,
    perJobT,
    ppe,
    qtyMulOn,
    qtyN,
    saveDraft,
    servicesSummary,
    setAddlCosts,
    setAiSuggest,
    setApprovers,
    setCeType,
    setDraftsOpen,
    setHlPick,
    setHlPickQ,
    setInfo,
    setMargin,
    setNotes,
    setSigModal,
    setTab,
    setVerifyNotes,
    sharedDrafts,
    showToast,
    showUnitP,
    sowItems,
    sowLabels,
    sowUnassignedCount,
    summaryDot,
    summaryRows,
    syncRatesFromML,
    tools,
    unitP,
    verifyNotes,
    visSigs
  } = ctx;
  return React.createElement("div", null,
  /* ── Pre-flight check ── one place listing everything worth fixing before a CE
     goes out. Read-only: it never changes data, it only points at problems. */
  (() => {
    const issues = [];
    const add = (sev, msg, tabId, hint) => issues.push({ sev, msg, tabId, hint });

    /* Blocking-ish: the numbers are wrong or missing */
    if (grand <= 0) add('err', 'Grand total is ₱0.00 — nothing is costed yet.', 'manpower');
    const zero = collectZeroCost();
    if (zero.length) add('err', zero.length + ' line item' + (zero.length === 1 ? '' : 's') + ' priced at ₱0.00',
      'manpower', zero.slice(0, 6).join(' · ') + (zero.length > 6 ? ' · …' : ''));
    if (!(info.description || '').trim()) add('err', 'No project description / scope summary.', 'info');
    if (!(info.client || '').trim()) add('err', 'No client name.', 'info');

    /* Worth a look, not necessarily wrong */
    if (!(sowItems || []).length) add('warn', 'No Scope of Work items.', 'sow');
    else if (sowUnassignedCount > 0) add('warn', sowUnassignedCount + ' resource row' + (sowUnassignedCount === 1 ? '' : 's') + ' not assigned to a scope task.', 'sowbreak');
    if (N(margin) === 0) add('warn', 'Margin is 0% — the selling price equals cost.', 'summary');
    if (!N(info.qty)) add('warn', 'Quantity is blank, so the unit price falls back to 1.', 'info');
    /* Multiplying by one is what the CE already costs. Worth saying, because
       somebody who chose the mode expects the figures to have moved. */
    if (qtyMulOn && qtyN === 1) add('warn', 'Quantity is 1, so multiplying changes nothing. Set the quantity, or switch back.', 'info');
    if (servicesSummary.offByQtyMode) add('warn', 'The services breakdown does not print while the quantity multiplies — the task costs are per unit and the total is per job.', 'summary');
    /* One deleted line inside a summed callout is the dangerous case: the
       number still looks plausible, it is just short by that line. */
    const dangling = (addlCosts || []).filter(r => hlMissing(r).length);
    if (dangling.length) add('err', dangling.length + ' highlighted cost' + (dangling.length === 1 ? '' : 's') + ' point at a cost that no longer exists.', 'summary');
    if (!(approvers || []).some(a => (a.name || '').trim())) add('warn', 'No approvers named.', 'summary');

    const errs = issues.filter(i => i.sev === 'err').length;
    const warns = issues.length - errs;
    const clean = issues.length === 0;

    return /*#__PURE__*/React.createElement("div", {
      style: { ...CS, marginBottom: 10, borderColor: clean ? alpha(OK, '55') : errs ? alpha(ERR, '55') : '#F59E0B55' }
    },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("span", {
          style: {
            fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
            color: clean ? OK : errs ? ERR : 'var(--status-warning)'
          }
        }, clean ? "✓ CE Audit — complete" : "⚠ CE Audit"),
        /* Counts as chips, in the severity's own colour. The old run-on --
           "2 to fix · 2 to review" -- made the more urgent half the harder
           one to pick out. */
        !clean && errs > 0 && /*#__PURE__*/React.createElement("span", {
          style: {
            background: alpha(ERR, '22'), color: ERR, border: `1px solid ${alpha(ERR, '55')}`,
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10
          }
        }, errs, " item", errs === 1 ? '' : 's', " to fix"),
        !clean && warns > 0 && /*#__PURE__*/React.createElement("span", {
          style: {
            background: alpha('var(--status-warning)', '22'), color: 'var(--status-warning)',
            border: `1px solid ${alpha('var(--status-warning)', '55')}`,
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10
          }
        }, warns, " to review"),
        clean && /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: MT } }, "No issues found."),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: grand > 0 ? ACC : MT } }, "₱" + ph(grand))
      ),
      /* Pills rather than a stacked list. Each finding is a self-contained
         thing to go and fix, and a column of them reads as one long paragraph
         of problems -- which is how the shorter ones got skipped. */
      !clean && /*#__PURE__*/React.createElement("div", { style: { marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 } },
        issues.map((i, n) => {
          const c = i.sev === 'err' ? ERR : 'var(--status-warning)';
          return /*#__PURE__*/React.createElement("div", {
            key: n,
            style: {
              display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 11,
              padding: '6px 10px', borderRadius: 8, flex: '1 1 260px', minWidth: 0,
              background: alpha(c, '11'), border: `1px solid ${alpha(c, '44')}`
            }
          },
            /*#__PURE__*/React.createElement("span", { style: { color: c, fontWeight: 700, flexShrink: 0 } }, i.sev === 'err' ? "●" : "○"),
            /*#__PURE__*/React.createElement("span", { style: { flex: 1, minWidth: 0 } },
              i.msg,
              i.hint && /*#__PURE__*/React.createElement("span", { style: { color: MT, display: 'block', fontSize: 10, marginTop: 1 } }, i.hint)
            ),
            i.tabId && i.tabId !== 'summary' && /*#__PURE__*/React.createElement("button", {
              style: {
                background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                color: c, fontWeight: 700, fontSize: 10, fontFamily: 'inherit', padding: 0
              },
              onClick: () => setTab(i.tabId)
            }, i.sev === 'err' ? "Fix →" : "View →")
          );
        })
      )
    );
  })(),
  /* Feature 12: AI Cost Suggestion banner */
  /*#__PURE__*/React.createElement("div", {style:{marginBottom:12,display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}},
    /*#__PURE__*/React.createElement("button", {
      style:{...btn('def',true),borderColor:'#A78BFA55',color:'var(--accent-violet)'},
      onClick:()=>{
        const similar = history.filter(h=>h.ceType===ceType&&h.grand>0);
        if(similar.length<2){showToast('Not enough history to suggest (need 2+ similar CEs).',true);setAiSuggest(null);return;}
        const vals={grand:[],mp:[],tools:[],mats:[],ppe:[]};
        similar.forEach(h=>{vals.grand.push(N(h.grand||0));vals.mp.push(N(h.mpTot||0));vals.tools.push(N(h.toolsT||0));vals.mats.push(N(h.matsT||0));vals.ppe.push(N(h.ppeT||0));});
        const avg=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
        setAiSuggest({n:similar.length,grand:avg(vals.grand),mp:avg(vals.mp),tools:avg(vals.tools),mats:avg(vals.mats),ppe:avg(vals.ppe)});
      }
    }, "💡 AI Suggest"),
    aiSuggest && /*#__PURE__*/React.createElement("div", {style:{flex:1,background:'#A78BFA11',border:'1px solid #A78BFA44',borderRadius:8,padding:'10px 14px',fontSize:11}},
      /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:'var(--accent-violet)',marginBottom:6}}, "💡 Based on "+aiSuggest.n+" similar "+ceType+" CEs:"),
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:16,flexWrap:'wrap'}},
        [['Grand Total','grand',ACC],['Manpower','mp',INFO],['Tools','tools',OK],['Materials','mats','var(--brand-accent)'],['PPE','ppe',ERR]].map(([label,key,color])=>
          /*#__PURE__*/React.createElement("div", {key:key},
            /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10}}, label),
            /*#__PURE__*/React.createElement("div", {style:{color:color,fontWeight:700,...MONO}}, "₱"+ph(aiSuggest[key]*0.8)+" – ₱"+ph(aiSuggest[key]*1.2))
          )
        )),
      /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginTop:6}}, "Typical range ±20%. Your current grand total: ",
        /*#__PURE__*/React.createElement("b", {style:{color:grand<aiSuggest.grand*0.8?ERR:grand>aiSuggest.grand*1.2?ERR:OK}}, "₱"+ph(grand)),
        grand>0&&(grand<aiSuggest.grand*0.8||grand>aiSuggest.grand*1.2)?" — outside typical range ⚠":" — within typical range ✓"),
      /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),fontSize:9,marginTop:6},onClick:()=>setAiSuggest(null)}, "✕ Dismiss")
    )),
  /* Services summary card -- per CE on/off, with the lines it will print */
  /*#__PURE__*/React.createElement("div", {style:{...CS, marginBottom:10}},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("label", {style:{display:'flex',alignItems:'center',gap:6,fontWeight:700,fontSize:12,cursor:'pointer'}},
        /*#__PURE__*/React.createElement("input", {type:'checkbox', checked:!!info.showServices, onChange:e=>{const v=e.target.checked; setInfo(p=>({...p, showServices:v}));}}),
        "Services summary on this CE"),
      /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, "— restate the total by service (Sand Blasting Works, Welding Works...) under the cost summary")
    ),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginBottom:6,fontStyle:'italic'}},
      "Name each main scope item's service group on the SOW Breakdown tab. Whatever no group carries prints as Other misc. to the project, so the services always add up to the Grand Total."),
    info.showServices && (servicesSummary.lines.length === 0
      ? /*#__PURE__*/React.createElement("div", {style:{color:ACC,fontSize:11}}, "No scope item has a service group yet, so nothing will print. ",
          /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),fontSize:10}, onClick:()=>setTab('sowbreak')}, "Go to SOW Breakdown"))
      : /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
          !servicesSummary.ok && /*#__PURE__*/React.createElement("caption", {style:{captionSide:'bottom',color:ERR,fontSize:11,textAlign:'left',paddingTop:4}},
            "The services add up to more than the Grand Total, so a cost is being counted under two services. The block will not print until that is fixed."),
          /*#__PURE__*/React.createElement("tbody", null,
            servicesSummary.lines.map(l => /*#__PURE__*/React.createElement("tr", {key:l.key},
              /*#__PURE__*/React.createElement("td", {style:{padding:'2px 4px'}}, l.label.toUpperCase(), /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:10}}, "  (scope " + l.items.map(id => sowLabels[id] || '').join(', ') + ")")),
              /*#__PURE__*/React.createElement("td", {style:{...MONO,textAlign:'right',padding:'2px 4px'}}, "₱" + ph(l.v)))),
            /*#__PURE__*/React.createElement("tr", null,
              /*#__PURE__*/React.createElement("td", {style:{padding:'2px 4px',color:MT}}, "OTHER MISC. TO THE PROJECT"),
              /*#__PURE__*/React.createElement("td", {style:{...MONO,textAlign:'right',padding:'2px 4px',color:servicesSummary.ok?TX:ERR}}, "₱" + ph(servicesSummary.other))),
            /*#__PURE__*/React.createElement("tr", {style:{borderTop:'1px solid ' + BDR,fontWeight:700}},
              /*#__PURE__*/React.createElement("td", {style:{padding:'2px 4px'}}, "SERVICES TOTAL AMOUNT"),
              /*#__PURE__*/React.createElement("td", {style:{...MONO,textAlign:'right',padding:'2px 4px'}}, "₱" + ph(servicesSummary.total)))))
    )),
  /* Highlighted Costs card — callouts of costs already counted in the CE */
  /*#__PURE__*/React.createElement("div", {style:{...CS, borderColor:'#F59E0B44', marginBottom:10}},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("span", {style:{fontWeight:700,fontSize:12}}, "Highlighted Costs"),
      /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, "— Break out a cost the client wants called out (delivery, pickup, third party, cost per unit...)"),
      /*#__PURE__*/React.createElement("button", {
        style:{...btn('ok',true),marginLeft:'auto'},
        onClick:()=>setAddlCosts(p=>[...p,{id:uid(),label:'',src:'',amount:0}])
      }, "+ Add Row")
    ),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginBottom:8,fontStyle:'italic'}},
      "These are already included in the Grand Total — they are shown separately on the CE, never added on top. Link one to a whole section, to a single line, or tick several lines to show them as one figure."),
    addlCosts.length === 0 && /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:11,fontStyle:'italic',padding:'6px 0'}}, "No highlighted costs. Click \"+ Add Row\" to call out a delivery charge, third party cost, unit price, etc."),
    addlCosts.length > 0 && /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
      /*#__PURE__*/React.createElement("thead", null,
        /*#__PURE__*/React.createElement("tr", null,
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'left'}}, "Label shown on CE"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'left',width:230}}, "Take amount from"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right',width:150}}, "Amount (₱)"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,width:40}})
        )
      ),
      /*#__PURE__*/React.createElement("tbody", null, addlCosts.map(r=>{
        const keys = hlKeys(r), gone = hlMissing(r), linked = keys.length > 0;
        const open = hlPick === r.id;
        /* Toggling one source in or out. The first pick also names the row, so
           the common case -- call out one line by its own name -- takes a
           single click. `src` is cleared as soon as a list exists so the two
           can never both be live and disagree about what the row points at. */
        const toggle = k => setAddlCosts(p=>p.map(x=>{
          if (x.id!==r.id) return x;
          const cur = hlKeys(x);
          const next = cur.indexOf(k) >= 0 ? cur.filter(v=>v!==k) : [...cur, k];
          const hit = hlSources.find(o=>o.k===k);
          return {...x, srcs: next, src: '', desc: undefined,
                  label: (hlLabel(x) || (next.length===1 && hit ? hit.l : ''))};
        }));
        /* What the closed button says. One source reads as its own name; a sum
           has to say how many lines it is made of, or a deleted line inside it
           would never be noticed. */
        const summary = !linked ? '— type amount manually —'
          : keys.length === 1
            ? (gone.length ? '⚠ linked cost no longer exists'
                           : (hlSources.find(o=>o.k===keys[0])||{}).l)
            : keys.length + ' lines' + (gone.length ? '  ⚠ ' + gone.length + ' missing' : '');
        const groups = [];
        hlSources.forEach(o=>{ if (groups.indexOf(o.g) < 0) groups.push(o.g); });
        const q = hlPickQ.trim().toLowerCase();
        return /*#__PURE__*/React.createElement(React.Fragment, {key:r.id},
        /*#__PURE__*/React.createElement("tr", null,
          /*#__PURE__*/React.createElement("td", {style:TDS},
            /*#__PURE__*/React.createElement("input", {
              style:{...INP,width:'100%'},
              value:hlLabel(r),
              placeholder:"e.g. Delivery to Pagbilao, Unit Price per Set...",
              onChange:e=>setAddlCosts(p=>p.map(x=>x.id===r.id?{...x,label:e.target.value,desc:undefined}:x))
            })
          ),
          /*#__PURE__*/React.createElement("td", {style:TDS},
            /*#__PURE__*/React.createElement("button", {
              style:{...INP,width:'100%',fontSize:11,textAlign:'left',cursor:'pointer',
                     color: gone.length ? ERR : (linked ? OK : MT),
                     borderColor: open ? OK : undefined},
              title: linked ? 'Click to change which costs this adds up' : 'Click to link this to costs already in the CE',
              onClick:()=>{ setHlPick(open?null:r.id); setHlPickQ(''); }
            }, summary + (open ? '  ▾' : '  ▸'))
          ),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,textAlign:'right'}},
            linked
              ? /*#__PURE__*/React.createElement("span", {
                  style:{...MONO,fontSize:12,color:gone.length?ERR:OK},
                  title: gone.length ? 'A cost this points at was removed from the CE — the amount shown is short by it.' : 'Linked — updates automatically when these costs change'
                }, gone.length && keys.length === 1 ? '⚠ —' : '₱' + ph(hlAmt(r)))
              : /*#__PURE__*/React.createElement("input", {
                  style:{...INP,...MONO,width:140,textAlign:'right'},
                  type:'number',min:0,step:0.01,
                  value:r.amount||'',
                  placeholder:"0.00",
                  onChange:e=>setAddlCosts(p=>p.map(x=>x.id===r.id?{...x,amount:N(e.target.value)}:x))
                })
          ),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,textAlign:'center'}},
            /*#__PURE__*/React.createElement("button", {
              style:{...btn('danger',true),padding:'2px 8px',fontSize:11},
              onClick:()=>setAddlCosts(p=>p.filter(x=>x.id!==r.id))
            }, "✕")
          )
        ),
        /* The picker, in a row of its own under the one being edited rather
           than floating over it -- the running subtotal has to stay readable
           beside the CE totals while lines are being ticked. */
        open && /*#__PURE__*/React.createElement("tr", null,
          /*#__PURE__*/React.createElement("td", {colSpan:4, style:{...TDS,padding:0}},
            /*#__PURE__*/React.createElement("div", {style:{border:'1px solid '+alpha(OK,'66'),borderRadius:6,padding:8,margin:'2px 0 8px'}},
              /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}},
                /*#__PURE__*/React.createElement("input", {
                  style:{...INP,flex:'1 1 200px',fontSize:11},
                  value:hlPickQ, autoFocus:true,
                  placeholder:"Filter — type part of a line, role or section name...",
                  onChange:e=>setHlPickQ(e.target.value)
                }),
                /*#__PURE__*/React.createElement("span", {style:{...MONO,fontSize:12,color:OK,fontWeight:700}},
                  keys.length ? (keys.length + (keys.length===1?' line · ₱':' lines · ₱') + ph(hlAmt(r))) : 'nothing picked'),
                keys.length > 0 && /*#__PURE__*/React.createElement("button", {
                  style:{...btn('def',true),fontSize:10},
                  title:"Unlink every source and go back to typing the amount by hand",
                  onClick:()=>setAddlCosts(p=>p.map(x=>x.id===r.id?{...x,srcs:[],src:'',amount:N(hlAmt(x))}:x))
                }, "Type manually instead"),
                /*#__PURE__*/React.createElement("button", {
                  style:{...btn('ok',true),fontSize:10},
                  onClick:()=>setHlPick(null)
                }, "Done")
              ),
              /* A key that no longer matches anything in the CE cannot be
                 offered in the list below, so it is shown here -- otherwise
                 the only way to clear it would be to delete the whole row. */
              gone.map(k=>/*#__PURE__*/React.createElement("div", {key:k,
                style:{fontSize:11,color:ERR,display:'flex',alignItems:'center',gap:6,marginBottom:4}},
                "⚠ a cost this points at was deleted from the CE",
                /*#__PURE__*/React.createElement("button", {style:{...btn('danger',true),fontSize:10,padding:'1px 6px'},
                  onClick:()=>toggle(k)}, "remove it")
              )),
              /*#__PURE__*/React.createElement("div", {style:{maxHeight:260,overflowY:'auto'}},
                groups.map(g=>{
                  const inGroup = hlSources.filter(o=>o.g===g &&
                    (!q || (g + ' ' + o.l).toLowerCase().indexOf(q) >= 0));
                  if (!inGroup.length) return null;
                  return /*#__PURE__*/React.createElement("div", {key:g,style:{marginBottom:6}},
                    /*#__PURE__*/React.createElement("div", {style:{fontSize:10,fontWeight:700,color:MT,textTransform:'uppercase',letterSpacing:.5,padding:'2px 0'}}, g),
                    inGroup.map(o=>{
                      const on = keys.indexOf(o.k) >= 0;
                      return /*#__PURE__*/React.createElement("label", {key:o.k,
                        style:{display:'flex',alignItems:'center',gap:8,fontSize:11,padding:'3px 6px',
                               borderRadius:4,cursor:'pointer',background:on?alpha(OK,'1A'):'transparent'}},
                        /*#__PURE__*/React.createElement("input", {type:'checkbox',checked:on,onChange:()=>toggle(o.k)}),
                        /*#__PURE__*/React.createElement("span", {style:{flex:1}}, o.l),
                        /*#__PURE__*/React.createElement("span", {style:{...MONO,fontSize:11,color:MT}}, '₱' + ph(o.v))
                      );
                    })
                  );
                }),
                q && !hlSources.some(o=>(o.g + ' ' + o.l).toLowerCase().indexOf(q) >= 0) &&
                  /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:11,fontStyle:'italic',padding:'6px 2px'}},
                    'Nothing in this CE matches "' + hlPickQ.trim() + '".')
              )
            )
          )
        )
        );
      }))
    )
  ),
  /*#__PURE__*/React.createElement("div", {
    style: CS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 11,
      border: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      width: 110,
      background: SURF
    }
  }, "PROJECT TYPE:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 3,
    style: TDS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center'
    }
  }, Object.entries(CE_CFG).map(([ceKey, ceVal]) => /*#__PURE__*/React.createElement("label", {
    key: ceKey,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "ceTypeSummary",
    checked: ceType === ceKey,
    onChange: () => setCeType(ceKey),
    style: {
      accentColor: ceVal.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: ceType === ceKey ? ceVal.color : MT,
      fontWeight: ceType === ceKey ? 700 : 400
    }
  }, ceTypeLabel(ceKey).toUpperCase()))))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      width: 60,
      background: SURF
    }
  }, "DATE:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11
    },
    type: "date",
    value: info.date || '',
    onChange: e => setInfo(p => ({
      ...p,
      date: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF,
      width: 140,
      whiteSpace: 'nowrap'
    }
  }, "PROJECT DESCRIPTION:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 5,
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      fontWeight: 600,
      width: '100%'
    },
    value: info.description || '',
    onChange: e => setInfo(p => ({
      ...p,
      description: e.target.value
    })),
    placeholder: "Enter project description..."
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "CE NUMBER:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 5,
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      fontWeight: 700
    },
    value: info.ceNum || '',
    onChange: e => setInfo(p => ({
      ...p,
      ceNum: e.target.value
    })),
    placeholder: "e.g. SY3-CE-2026-0001"
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "CLIENT NAME:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 5,
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      width: '100%'
    },
    value: info.client || '',
    onChange: e => setInfo(p => ({
      ...p,
      client: e.target.value
    })),
    placeholder: "Client name..."
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "CLIENT LOCATION:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      width: '100%'
    },
    value: info.location || '',
    onChange: e => setInfo(p => ({
      ...p,
      location: e.target.value
    })),
    placeholder: "Location..."
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "MATERIAL:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11
    },
    value: info.material || '',
    onChange: e => setInfo(p => ({
      ...p,
      material: e.target.value
    })),
    placeholder: "N/A"
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "NO. OF DAYS:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      ...MONO,
      width: 60
    },
    type: "number",
    min: 1,
    value: info.days || '',
    onChange: e => setInfo(p => ({
      ...p,
      days: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "ATTENTION:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      width: '100%'
    },
    value: info.attention || 'SALES DEPARTMENT',
    onChange: e => setInfo(p => ({
      ...p,
      attention: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "QUANTITY:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      ...MONO,
      width: 60
    },
    type: "number",
    min: 1,
    value: info.qty || 1,
    onChange: e => setInfo(p => ({
      ...p,
      qty: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "END USER:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11
    },
    value: info.endUser || 'C/O SALES',
    onChange: e => setInfo(p => ({
      ...p,
      endUser: e.target.value
    }))
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      /* Wrap instead of overflowing once the action buttons no longer fit. */
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 800,
      fontSize: 16,
      letterSpacing: '-0.02em',
      color: cfg.color,
      /* Never break the CE number across lines. */
      whiteSpace: 'nowrap'
    }
  }, info.ceNum || '(No CE Number)'), docFile && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 4,
      background: alpha(INFO, '18'),
      border: `1px solid ${alpha(INFO, '44')}`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 10,
      color: INFO
    }
  }, "Doc: ", docFile.name, docFile.spUrl && /*#__PURE__*/React.createElement("a", {
    href: spAbsUrl(docFile.spUrl),
    target: "_blank",
    style: {
      color: INFO,
      marginLeft: 4
    }
  }, "View"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'flex-end'
    }
  }, /* Grouped by what they do -- keep, re-price, produce, send -- and each
     explains itself on hover. */
  /*#__PURE__*/React.createElement("div", {
    title: "Saving and drafts",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Keep"), !isRequestor && /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def'),
      background: '#8B5CF611',
      borderColor: '#8B5CF644',
      color: 'var(--accent-violet)',
      position: 'relative'
    },
    onClick: () => {
      loadSharedDrafts();
      setDraftsOpen(true);
    },
    title: "Open the list of unsaved drafts — yours and the team's — and pick one up where it was left."
  }, "\uD83D\uDCCB Resume Work", sharedDrafts.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -4,
      right: -4,
      background: 'var(--accent-violet)',
      color: '#fff',
      borderRadius: '50%',
      width: 14,
      height: 14,
      fontSize: 9,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700
    }
  }, sharedDrafts.length)), /*#__PURE__*/React.createElement("button", {
    style: busyBtn('draft', {
      ...btn('def'),
      background: '#8B5CF622',
      borderColor: '#8B5CF655',
      color: 'var(--accent-violet)'
    }),
    disabled: !!busyOp.draft,
    onClick: saveDraft,
    title: "Park unfinished work as a draft the team can see and pick up. Saving the CE clears it."
  }, busyOp.draft ? "\u2B07 Saving\u2026" : "\u2B07 Draft"), /*#__PURE__*/React.createElement("button", {
    title: "Save this CE and share it with the team (Ctrl+S). A saved CE can be saved again until it is routed for approval; after that, use Revise.",
    style: busyBtn('save', { ...btn('acc'), fontWeight: 800, padding: '6px 18px' }),
    disabled: !!busyOp.save,
    onClick: handleSave
  }, busyOp.save ? "Saving\u2026" : "Save"), /*#__PURE__*/React.createElement("button", {
    title: "Save a copy of this CE as its next revision (-R1, -R2…); the original is kept.",
    style: busyBtn('revise', {
      ...btn('def'),
      background: alpha(INFO, '22'),
      borderColor: alpha(INFO, '55'),
      color: INFO
    }),
    disabled: !!busyOp.revise,
    onClick: handleSaveRevision,
    title: busyOp.revise ? 'Saving the revision\u2026' : 'Save as ' + ((info.ceNum || 'CE') + '-Rn revision')
  }, busyOp.revise ? "\u21BB Saving\u2026" : "\u21BB Revise"), /*#__PURE__*/React.createElement("button", {
    className: 'sum-attach',
    style: { ...btn('def'), borderColor: alpha(INFO, '55'), color: INFO },
    onClick: attachFromSummary,
    title: "Attach drawings, the TOR, a PO or any other file to this CE. They are kept on SharePoint with the saved CE and show under the \uD83D\uDCCE button in CE Monitoring."
  }, "\uD83D\uDCCE Attach files")), /*#__PURE__*/React.createElement("div", {
    title: "Re-pricing from the Masterlist",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Prices"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def'),
      background: alpha(OK, '22'),
      borderColor: alpha(OK, '55'),
      color: OK
    },
    onClick: syncRatesFromML,
    title: "Re-price every matching row from the Masterlist. A saved CE keeps the price it was quoted at until you press this."
  }, "\u21BA Sync Rates")), /*#__PURE__*/React.createElement("div", {
    title: "Print and export",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Output"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#58A6FF55', color: INFO},
    onClick: handlePrintPreview,
    title: "See the printed CE on screen before printing. Nothing is sent to the printer."
  }, "👁 Preview"), /*#__PURE__*/React.createElement("button", {
    title: "Open the official CE form in a print window — print it or save it as PDF. Warns first about ₱0 items.",
    style: btn('info'),
    onClick: handleGenerateCEWithCheck
  }, "🖨 Generate CE"), /*#__PURE__*/React.createElement("button", {
    style: btn('ok'),
    onClick: handleExportXLSX,
    title: "Excel copy of the printed CE, page for page, with every column: OT hours, AOT, each benefit separately."
  }, "Export Detailed"), /*#__PURE__*/React.createElement("button", {
    style: { ...btn('def'), borderColor: alpha(ACC, '66'), color: ACC },
    onClick: handleExport,
    title: "Excel in the SY3 master CE workbook layout (BOL, BOTE, BOCM…): shorter, the same 7 columns on every sheet."
  }, "Export CE Template")), /*#__PURE__*/React.createElement("div", {
    title: "Share with others",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Send"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#3FB95055', color: OK},
    onClick: () => {
      try {
        const d = {info, ceType, mp, tools, mats, ppe, misc, notes, approvers, sowItems, mobVehicles, demobVehicles};
        const url = window.location.href.split('?')[0] + '?draft=' + btoa(JSON.stringify(d));
        navigator.clipboard.writeText(url).then(() => showToast('🔗 Share link copied to clipboard!')).catch(() => { uiPrompt('Copy this link', {value: url, readonly: true, ok: 'Done', cancel: false}); });
      } catch(e) { showToast('Failed to generate share link.', true); }
    },
    title: "Copy a link that opens this CE as it is now in someone else's app. Anyone with the link sees the figures."
  }, "🔗 Share"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#A371F755', color: '#A371F7'},
    title: "Start an email to the approvers with the CE number, client and cost summary filled in.",
    onClick: () => {
      const subject = encodeURIComponent(`[CE FOR APPROVAL] ${info.ceNum} — ${info.client || info.description || ''}`);
      const approverNames = approvers.map(a => `${a.role}: ${a.name}${a.title ? ' (' + a.title + ')' : ''}`).join('\n');
      const sectionLines = summaryRows.map(([l,v]) => `  ${l.padEnd(30)} ₱${ph(v)}`).join('\n');
      const body = encodeURIComponent(
        `Good day,\n\nKindly review and approve the attached Cost Estimate:\n\n` +
        `CE No.:      ${info.ceNum}\n` +
        `Client:      ${info.client || '—'}\n` +
        `Description: ${info.description || '—'}\n` +
        `Date:        ${info.date || '—'}\n\n` +
        `COST SUMMARY\n${'─'.repeat(46)}\n${sectionLines}\n${'─'.repeat(46)}\n` +
        `  ${'GRAND TOTAL'.padEnd(30)} ₱${ph(grand)}\n\n` +
        `Approvers:\n${approverNames}\n\n` +
        `Thank you.`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    }
  }, "📧 Notify")))), /*#__PURE__*/React.createElement("div", {
    style: {display:'flex',alignItems:'center',gap:8,margin:'0 0 10px 0',flexWrap:'wrap'}
  },
    /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT}}, "Summary sheet:"),
    Object.keys(SUMMARY_LAYOUTS).map(k => /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setInfo(p => ({...p, sumFmt: k})),
      title: k === 'elec'
        ? 'Manpower by shift, benefits on their own line, each section’s parts carrying the figures. As SY3-F-ACF-009 reads.'
        : 'One line per section, with Miscellaneous itemised beside it.',
      style: {fontSize:11,fontWeight:700,padding:'4px 12px',borderRadius:6,cursor:'pointer',
        border: '1px solid ' + (ceLayoutKey === k ? 'transparent' : BDR),
        background: ceLayoutKey === k ? ACC : 'transparent',
        color: ceLayoutKey === k ? ON_ACC : MT}
    }, SUMMARY_LAYOUTS[k].label)),
    /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT}},
      info.sumFmt ? "Chosen for this CE." : "Following the discipline — pick one to fix it for this CE.")),
  /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: THS
  }, "Cost Group / Scope Classification"), /*#__PURE__*/React.createElement("th", {
    style: THS
  }, "Internal Verification Notes"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right'
    }
  }, "Computed Cost (₱)"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 74
    }
  }, "% Total Share"))), /*#__PURE__*/React.createElement("tbody", null, summaryRows.map(([label, val]) => /*#__PURE__*/React.createElement("tr", {
    key: label
  }, /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
      marginRight: 8, verticalAlign: 'middle', flexShrink: 0,
      background: val > 0 ? summaryDot(label) : BDR
    }
  }), label), /*#__PURE__*/React.createElement("td", {
    style: {...TDS, width: '38%'}
  },
  /* Typed by whoever built the estimate, for whoever reviews it. Not derived:
     a sentence the app made up about a cost group would read as verification
     on a document that goes to a client, and nothing would have verified it.

     Uncontrolled with an onBlur, like the monitoring cells -- keystroke state
     here would re-render the whole summary on every letter. */
  /*#__PURE__*/React.createElement("input", {
    key: 'vn' + label,
    defaultValue: verifyNotes[label] || '',
    placeholder: '—',
    style: {
      ...INP, background: 'transparent', border: 'none', padding: '2px 0',
      fontSize: 11, color: verifyNotes[label] ? TX : MT
    },
    onBlur: ev => {
      const v = ev.target.value;
      if (v === (verifyNotes[label] || '')) return;
      setVerifyNotes(p => { const n = {...p}; if (v.trim()) n[label] = v; else delete n[label]; return n; });
    }
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      ...MONO,
      textAlign: 'right',
      color: val > 0 ? TX : MT
    }
  }, ph(val)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right',
      color: MT,
      fontSize: 11
    }
  }, grand > 0 ? (val / grand * 100).toFixed(1) + '%' : '--')))), /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: alpha(ACC, '14'),
      borderTop: `2px solid ${alpha(ACC, '55')}`
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 800,
      color: ACC,
      paddingTop: 12,
      paddingBottom: 12
    }
  }, "TOTAL DIRECT PROJECT COST"), /*#__PURE__*/React.createElement("td", {
    /* The notes column has no total. Without a cell for it the amount and the
       share both slide one column left of the figures they belong under. */
    style: TDS
  }), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      ...MONO,
      textAlign: 'right',
      fontSize: 16,
      fontWeight: 800,
      color: ACC,
      paddingTop: 12,
      paddingBottom: 12
    }
  }, "₱", ph(grand)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right',
      color: MT,
      paddingTop: 12
    }
  }, "100%")), showUnitP && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      color: MT
    }
  }, qtyMulOn ? "Cost of one" : "Unit Price", " (qty ", info.qty || 1, perJobT ? (qtyMulOn ? ", excl. once-only costs" : ", excl. per-job costs") : "", ")",
    /* What the quantity DOES, before what it leaves alone. The two settings
       read together because the second only makes sense once the first is
       understood. */
    /*#__PURE__*/React.createElement("div", { style: { marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 } },
      [['divide', 'Job total ÷ quantity', 'The tabs hold the cost of the whole job. The unit price is that total divided by the quantity. This is how every CE has worked.'],
       ['multiply', 'One unit × quantity', 'The tabs hold the cost of ONE of them. The job total is that times the quantity. Ticked costs below stay charged once.']].map(([v, l, t]) =>
        /*#__PURE__*/React.createElement("label", { key: v, title: t,
          style: { display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer', border: '1px solid ' + ((info.qtyMode === 'multiply') === (v === 'multiply') ? ACC : BDR), borderRadius: 10, padding: '1px 8px', color: (info.qtyMode === 'multiply') === (v === 'multiply') ? ACC : MT } },
          /*#__PURE__*/React.createElement("input", { type: 'radio', name: 'shic-qtymode',
            checked: (info.qtyMode === 'multiply') === (v === 'multiply'),
            onChange: () => setInfo(p => ({ ...p, qtyMode: v === 'multiply' ? 'multiply' : undefined })) }), l))),
    /* Which costs do not move with the quantity, whichever way it moves. */
    /*#__PURE__*/React.createElement("div", { style: { marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 } },
      /*#__PURE__*/React.createElement("span", { title: qtyMulOn
        ? 'Ticked costs are the same whatever the quantity, so they are charged once rather than multiplied.'
        : 'Ticked costs are the same whatever the quantity, so they are left out of the unit price and shown on their own line.' },
        qtyMulOn ? "Not multiplied, charged once:" : "Charged once per job:"),
      [...(_mobTabs > 0 ? [['mobdemob', 'Mob/Demob']] : []), ...(MISC_DEF[ceType] || MISC_DEF.onsite)
        .filter(([k]) => (Array.isArray(misc[k]) ? misc[k] : []).some(r => miscRowCost(r) > 0))
        .map(([k, l]) => [k, String(l).replace(/^[A-Z]\.\d+\s*/, '')])].map(([k, l]) =>
        /*#__PURE__*/React.createElement("label", { key: k, style: { display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer', border: '1px solid ' + BDR, borderRadius: 10, padding: '1px 8px', color: perJob.includes(k) ? ACC : MT } },
          /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: perJob.includes(k),
            onChange: e => setInfo(p => { const cur = Array.isArray(p.perJob) ? p.perJob : []; return { ...p, perJob: e.target.checked ? [...cur.filter(x => x !== k), k] : cur.filter(x => x !== k) }; }) }), l)))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      ...MONO,
      textAlign: 'right',
      color: INFO
    }
  }, "P", ph(unitP)), /*#__PURE__*/React.createElement("td", {
    style: TDS
  })), showUnitP && perJobT > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: { ...TDS, color: MT }
  }, "Charged once per job (", perJobNames, ")"), /*#__PURE__*/React.createElement("td", {
    style: { ...TDS, ...MONO, textAlign: 'right', color: ACC }
  }, "P", ph(perJobT)), /*#__PURE__*/React.createElement("td", {
    style: TDS
  })), /*#__PURE__*/React.createElement("tr", {
    style: {background: alpha(OK, '10'), borderTop: `2px solid ${alpha(OK, '44')}`}
  }, /*#__PURE__*/React.createElement("td", {
    style: {...TDS, fontWeight:800, color: OK, paddingTop:10, paddingBottom:10}
  }, "SELLING PRICE"), /*#__PURE__*/React.createElement("td", {
    style: {...TDS, ...MONO, textAlign:'right', fontSize:15, fontWeight:800, color: OK, paddingTop:10, paddingBottom:10}
  }, "P", ph(grand * (1 + margin / 100))), /*#__PURE__*/React.createElement("td", {
    style: {...TDS, textAlign:'right', color: MT, fontSize:11, paddingTop:10, whiteSpace:'nowrap'}
  }, /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}},
    /*#__PURE__*/React.createElement("input", {
      type: 'number',
      min: -50, max: 200, step: 0.5,
      value: margin,
      onChange: e => setMargin(Number(e.target.value)||0),
      title: 'Margin % (positive = markup, negative = discount)',
      style: {...INP, width:62, fontSize:11, textAlign:'right', padding:'2px 6px'}
    }),
    /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, "% margin")
  )))))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(INFO, '44')
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 12
    }
  }, "Notes / Remarks"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, notes.length, " note", notes.length !== 1 ? 's' : ''), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      marginLeft: 'auto'
    },
    onClick: () => setNotes(p => [...p, mkNote()])
  }, "+ Add Note")), notes.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '14px 0',
      color: MT,
      fontSize: 12,
      border: `1px dashed ${BDR}`,
      borderRadius: 6
    }
  }, "No notes yet. Click \"+ Add Note\" to add remarks, instructions, or disclaimers."), notes.length > 0 && notes.map((note, idx) => /*#__PURE__*/React.createElement("div", {
    key: note.id,
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      background: note.imp ? alpha(ERR, '22') : alpha(ACC, '22'),
      color: note.imp ? ERR : ACC,
      fontWeight: 700,
      fontSize: 11,
      minWidth: 26,
      height: 26,
      borderRadius: 5,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1
    }
  }, note.seq), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...INP,
      flex: 1,
      height: 60,
      resize: 'vertical',
      fontSize: 12,
      /* The editor shows what the paper will show. Judging whether a note is
         shouting loudly enough is not something to do by printing it first. */
      ...(note.imp ? {color: ERR, fontWeight: 700, borderColor: alpha(ERR, '77')} : {})
    },
    value: note.text,
    onChange: e => setNotes(p => p.map(n => n.id === note.id ? {
      ...n,
      text: e.target.value
    } : n)),
    placeholder: 'Note ' + note.seq + '...'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: note.imp
      ? {...btn('danger', true), fontWeight: 700}
      : {...btn('def', true), opacity: .75},
    title: note.imp
      ? "Marked important: prints bold red on the CE and the workbook, and as [IMPORTANT] in the text summary. Click to make it an ordinary note."
      : "Mark important, so the sales team cannot read past it: bold red on the CE and the workbook.",
    onClick: () => setNotes(p => p.map(n => n.id === note.id ? {...n, imp: !n.imp} : n))
  }, "❗"), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    title: "Move up",
    disabled: idx === 0,
    onClick: () => setNotes(p => {
      const a = [...p];
      [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
      return a.map((n, i) => ({
        ...n,
        seq: i + 1
      }));
    })
  }, "^"), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    title: "Move down",
    disabled: idx === notes.length - 1,
    onClick: () => setNotes(p => {
      const a = [...p];
      [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]];
      return a.map((n, i) => ({
        ...n,
        seq: i + 1
      }));
    })
  }, "v"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: ERR,
      cursor: 'pointer',
      fontSize: 15,
      padding: '1px 4px'
    },
    onClick: () => setNotes(p => p.filter(n => n.id !== note.id).map((n, i) => ({
      ...n,
      seq: i + 1
    })))
  }, "x"))))),

  /* Breakdown notes live on the scope items, so they are shown here read-only
     rather than copied -- one place to edit, and no chance of the two drifting.
     They print with the notes above. */
  (() => {
    const sn = (sowItems || []).filter(s => String(s.note || '').trim());
    if (!sn.length) return null;
    return /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: alpha(INFO, '44') } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("span", { style: { fontWeight: 700, fontSize: 12 } }, "From the SOW Breakdown"),
        /*#__PURE__*/React.createElement("span", { style: { color: MT, fontSize: 11 } }, sn.length + " breakdown note" + (sn.length === 1 ? '' : 's') + " — these print with the notes above"),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), marginLeft: 'auto' }, onClick: () => setTab('sowbreak') }, "Edit in SOW Breakdown")
      ),
      sn.map(s => /*#__PURE__*/React.createElement("div", { key: s.id, style: { display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' } },
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: ACC, fontWeight: 700, fontSize: 11, minWidth: 34, paddingTop: 1 } }, sowLabels[s.id] || ''),
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 11.5, whiteSpace: 'pre-wrap', flex: 1 } },
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 10, marginBottom: 1 } }, s.text || '(untitled task)'),
          String(s.note).trim())
      ))
    );
  })(),

  /*#__PURE__*/React.createElement("div", {
    style: CS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 12,
      fontSize: 11,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Signatories", ceDefaults.length > 0 && /*#__PURE__*/React.createElement("button", {
    /* The notes and signatories stop following the CE type once anyone edits
       them -- deliberately, so typed names are never thrown away. This puts
       them back when that is what you actually wanted. */
    style: {...btn('def', true), fontSize: 9, padding: '2px 8px', marginLeft: 8, textTransform: 'none', letterSpacing: 0},
    title: 'Replace the notes and signatories with the preset for ' +
      ceTypeLabel(ceType) + ' + ' + (info.projType || 'this discipline') +
      '. Set these up in the Users tab.',
    onClick: async () => {
      if (!_defaultsUntouched() && !await uiConfirm('Replace the current notes and signatories with the preset for this CE type and discipline?\n\nAnything typed here will be lost.')) return;
      showToast(applyCeDefaults(ceType, info.projType, true)
        ? 'Applied the defaults for ' + (info.projType || 'this discipline') + '.'
        : 'No preset matches this CE type and discipline — set one up in the Users tab.', false);
    }
  }, "Apply defaults")), apvBar(), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(approvers.length, 4)},1fr)`,
      gap: 8,
      marginBottom: 8
    }
  }, approvers.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: SURF,
      borderRadius: 6,
      padding: '10px 8px',
      border: `1px solid ${BDR}`,
      textAlign: 'center',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      textAlign: 'center',
      fontSize: 9,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: MT,
      background: 'transparent',
      border: 'none',
      borderBottom: `1px dashed ${alpha(BDR, '44')}`,
      borderRadius: 0,
      padding: '2px 4px',
      marginBottom: 8,
      width: '100%'
    },
    value: a.role,
    placeholder: "Role...",
    onChange: e => setApprovers(p => p.map((x, j) => j === i ? {
      ...x,
      role: e.target.value
    } : x))
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 6,
      background: 'transparent',
      border: 'none',
      borderBottom: `1px solid ${BDR}`,
      borderRadius: 0,
      paddingBottom: 14,
      width: '100%'
    },
    value: a.name,
    placeholder: "Name...",
    onChange: e => setApprovers(p => p.map((x, j) => j === i ? {
      ...x,
      name: e.target.value
    } : x))
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      textAlign: 'center',
      fontSize: 11,
      color: MT,
      background: 'transparent',
      border: 'none',
      borderRadius: 0,
      width: '100%'
    },
    value: a.title,
    placeholder: "Title / Position...",
    onChange: e => setApprovers(p => p.map((x, j) => j === i ? {
      ...x,
      title: e.target.value
    } : x))
  }),
  /* Approval routing: link the line to a user, and the step it signs on. */
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize: 9, width: '100%', marginTop: 4, padding: '2px 4px'},
    disabled: apvLocked, value: a.user || '',
    title: 'Link this line to a user so they approve and sign it in the app',
    onChange: e => { const u = e.target.value, usr = apvUsers.find(x => x.username === u);
      setApprovers(p => p.map((x, j) => j === i ? {...x, user: u, byHand: !u, id: x.id || uid(), name: (!x.name && usr) ? (usr.name || usr.username) : x.name} : x)); }
  }, /*#__PURE__*/React.createElement("option", {value: ''}, '✍ Sign by hand'),
    a.user && !apvUsers.some(x => x.username === a.user) && /*#__PURE__*/React.createElement("option", {value: a.user}, a.user),
    apvUsers.map(x => /*#__PURE__*/React.createElement("option", {key: x.username, value: x.username}, '👤 ' + (x.name || x.username)))),
  a.user && /*#__PURE__*/React.createElement("label", {style: {display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', fontSize: 9, color: MT, marginTop: 4}, title: 'Lines on the same step sign at the same time; the next step opens when they are all signed'}, 'Step',
    /*#__PURE__*/React.createElement("input", {type: 'number', min: 1, disabled: apvLocked, value: a.step || i + 1, style: {...INP, width: 44, fontSize: 10, padding: '1px 4px', textAlign: 'center'},
      onChange: e => setApprovers(p => p.map((x, j) => j === i ? {...x, step: Math.max(1, parseInt(e.target.value, 10) || 1)} : x))})),
  a.user && info.approval && apvState !== 'none' && (() => {
    const l = (info.approval.lines || {})[a.id];
    const w = apvState === 'pending' && apvStatus(approvers, info.approval).waiting.some(x => x.id === a.id);
    return /*#__PURE__*/React.createElement("div", {style: {fontSize: 9, marginTop: 3, fontWeight: 700, color: l ? '#16a34a' : w ? 'var(--accent-cyan)' : MT}},
      l ? '✔ ' + l.byName + ' · ' + apvWhen(l.at) : w ? '⏳ Waiting' : apvState === 'pending' ? 'Step ' + (a.step || i + 1) : '');
  })(),
  /* Feature 11: signature thumbnail + sign button */
  visSigs[a.id||i] && /*#__PURE__*/React.createElement("div",{style:{margin:'4px 0'}},
    /*#__PURE__*/React.createElement("img",{src:visSigs[a.id||i],style:{width:'100%',height:36,objectFit:'contain',background:'#fff',borderRadius:3,border:'1px solid '+BDR}})),
  !a.user && /*#__PURE__*/React.createElement("button",{
    style:{...btn(visSigs[a.id||i]?'ok':'def',true),fontSize:9,padding:'2px 6px',width:'100%',marginTop:4},
    onClick:()=>setSigModal({...a,id:a.id||i})
  }, visSigs[a.id||i]?'✅ Re-sign':'✍ Sign'),
  approvers.length > 1 && !(apvLocked && a.user) && /*#__PURE__*/React.createElement("button", {
    onClick: () => setApprovers(p => p.filter((_, j) => j !== i)),
    style: {
      position: 'absolute',
      top: 2,
      right: 3,
      background: 'none',
      border: 'none',
      color: ERR,
      cursor: 'pointer',
      fontSize: 11,
      lineHeight: 1,
      padding: '1px 3px',
      opacity: 0.5
    },
    title: "Remove"
  }, "x")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      justifyContent: 'flex-end',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setApprovers(p => [...p, {
      role: 'Noted By',
      name: '',
      title: ''
    }])
  }, "+ Add Signatory"))));
}
