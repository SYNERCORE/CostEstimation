/* The Manpower tab: crew rows by shift, mobilization and demobilization, benefits and the wage totals.

   Moved out of App.js unchanged. Invoked as ManpowerTab({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function ManpowerTab(ctx) {
  const {
    _mobTabs,
    _weight,
    ben,
    benefitRows,
    benefitsT,
    cfg,
    collapsedShifts,
    copyMenu,
    delRow,
    demobSubT,
    demobVehicles,
    demobVehiclesT,
    history,
    incOn,
    info,
    masterlist,
    mobCopy,
    mobSubT,
    mobVehicles,
    mobVehiclesT,
    mp,
    mpSub,
    mpTot,
    mpWage,
    mpWageParts,
    rowCost,
    rowShares,
    rr,
    setCollapsedShifts,
    setCopyMenu,
    setDemobVehicles,
    setMobCopy,
    setMobVehicles,
    setMp,
    setPicker,
    setRates,
    showToast,
    sowItems,
    sowLabels,
    syncCrewRows,
    syncMealRates,
    syncMealRows,
    toggleShift,
    updRow
  } = ctx;
  return React.createElement("div", null, cfg.mobDemob && (() => {
    /* Shared expense line-item table.

       NOT a component: declared inside render, its function identity is new
       on every keystroke, so React threw the whole table away and built it
       again -- taking the focused input with it. That is why a rate had to be
       clicked once per character. It is called as a plain function instead,
       so the inputs are part of this render's own tree and keep their focus. */
    /* Manpower charged to mobilization / demobilization: travel days, the
       crew's first-day induction. Lives in the same list as the expenses,
       marked kind 'mp'; the expense table below filters these out. */
    const MobMpTable = ({ rows: all, setRows, idPfx, color }) => {
      const rows = all.filter(r => r.kind === 'mp');
      const otM = ceOtMult(rr);
      const upd = (id, patch) => setRows(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
      const E = React.createElement;
      const num = (r, k, w, min) => E("td", { style: TDS }, E(NumBox, { style: { ...INP, ...MONO, width: w }, min, value: r[k], onCommit: v => upd(r.id, { [k]: v }) }));
      return E("div", { style: { marginBottom: 14 } },
        E("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
          E("span", { style: { fontSize: 11, fontWeight: 700, color: color || ACC, letterSpacing: .5 } }, "MANPOWER"),
          E("div", { style: { display: 'flex', gap: 6 } },
            E("button", { style: btn('acc', true), title: 'One line per role from the Manpower in the SOW Breakdown -- the most pax on any day shift plus any night shift. It stays in sync as the crew changes; days and OT hours are yours to set.',
              onClick: () => { if (!consolidateCrew(mp).length) { showToast('No manpower in the SOW Breakdown yet.', true); return; } setRows(p => syncMealRows(syncCrewRows(p, true), true, 'rate', false)); } }, rows.some(r => r.auto) ? "⟳ Re-sync crew from SOW" : "⟳ Crew from SOW Breakdown"),
            all.some(r => r.kind === 'meal') && E("button", { style: btn('info', true), title: 'Set every meal allowance line on this CE (mobilization, demobilization, accommodation) to the current Masterlist rate', onClick: syncMealRates }, "↺ Sync meal rates"),
            E("button", { style: btn('def', true), onClick: () => setRows(p => [...p, { id: uid(), kind: 'mp', desc: '', qty: 1, days: 1, rate: 0, otHours: 0 }]) }, "+ Add Manpower"))),
        rows.length === 0 ? E("div", { style: { textAlign: 'center', padding: '10px 0', color: MT, fontSize: 12, border: '1px dashed ' + BDR, borderRadius: 6 } }, "No manpower charged to this stage.") :
        E("div", { style: { overflowX: 'auto' } }, E("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
          E("thead", null, E("tr", null, ['#', 'Manpower loading', 'Pax', 'Days', 'Rate/day (P)', 'OT hrs/day', 'Rate OT/hr', 'Total', ''].map(h => E("th", { key: h, style: THS }, h)))),
          E("tbody", null, rows.map((r, _ix) => {
            const tot = mobRowCost(r, rr);
            return E("tr", { key: r.id }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), 
              r.auto ? E("td", { style: TDS }, E("span", { style: { fontSize: 12 } }, r.desc), E("span", { title: 'Linked to the SOW Breakdown crew', style: { marginLeft: 6, fontSize: 9, fontWeight: 700, color: OK, border: '1px solid ' + alpha(OK, '66'), borderRadius: 4, padding: '0 4px' } }, "SOW")) :
              E("td", { style: TDS },
                E("input", { style: { ...INP, minWidth: 200 }, list: idPfx, value: r.desc, placeholder: "e.g. Supervisor, Welder...",
                  onChange: e => { const dv = e.target.value; const f = (masterlist.manpower || []).find(m => m.role === dv); upd(r.id, { desc: dv, ...(f ? { rate: f.rate } : {}) }); } }),
                _ix === 0 && E("datalist", { id: idPfx }, (masterlist.manpower || []).map(m => E("option", { key: m.id || m.role, value: m.role })))),
              r.auto ? E("td", { style: TDS }, E(NumBox, { style: { ...INP, ...MONO, width: 52, ...(r.paxSet ? { borderColor: ACC } : {}) }, min: 0, value: r.qty,
                title: r.paxSet ? 'Set by hand -- the crew count is no longer applied. Clear it to follow the SOW Breakdown again.' : 'From the SOW Breakdown crew. Type to override.',
                onCommit: v => upd(r.id, { qty: v, paxSet: true }) }),
                r.paxSet && E("button", { title: 'Follow the SOW Breakdown crew again', style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11 },
                  onClick: () => { const c = consolidateCrew(mp).find(x => x.role.toUpperCase() === String(r.desc || '').toUpperCase()); upd(r.id, { paxSet: false, qty: c ? c.pax : r.qty }); } }, "↺")) : num(r, 'qty', 52, 1), num(r, 'days', 52, 1),
              r.auto ? E("td", { style: TDS }, E(NumBox, { style: { ...INP, ...MONO, width: 96, ...(r.rateSet ? { borderColor: ACC } : {}) }, min: 0, value: r.rate,
                title: r.rateSet ? 'Set by hand -- the Manpower day rate is no longer applied. Clear it to follow the Manpower again.' : 'From the Manpower day rate. Type to override.',
                onCommit: v => upd(r.id, { rate: v, rateSet: true }) }),
                r.rateSet && E("button", { title: 'Follow the Manpower day rate again', style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11 },
                  onClick: () => { const c = consolidateCrew(mp).find(x => x.role.toUpperCase() === String(r.desc || '').toUpperCase()); upd(r.id, { rateSet: false, rate: c ? c.rate : r.rate }); } }, "↺")) : num(r, 'rate', 96, 0), num(r, 'otHours', 52, 0),
              E("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'right' } }, "P", ph(N(r.rate) / 8 * otM)),
              E("td", { style: { ...TDS, ...MONO, color: tot > 0 ? color || ACC : MT, fontWeight: 700, textAlign: 'right', minWidth: 100 } }, "P", ph(tot)),
              E("td", { style: TDS }, E("button", { onClick: () => setRows(p => p.filter(x => x.id !== r.id)), style: { background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 15, padding: '1px 5px' } }, "x")));
          }))),
          E("div", { style: { textAlign: 'right', marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + BDR, color: color || ACC, fontWeight: 700, fontSize: 12 } },
            "Sub total: ", E("span", { style: MONO }, rows.reduce((s, r) => s + N(r.qty), 0) + " pax · P" + ph(rows.reduce((s, r) => s + mobRowCost(r, rr), 0))))));
    };
    const ExpenseTable = ({
      rows,
      setRows,
      idPfx,
      color
    }) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, "Add each charge as a separate line item."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => setPicker({
        type: 'vehicles',
        onSelect: item => setRows(p => [...p, {
          id: uid(),
          desc: item.desc,
          qty: 1,
          days: 1,
          rate: item.rate,
          uom: item.uom
        }])
      })
    }, "From Masterlist"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => setRows(p => [...p, {
        id: uid(),
        desc: '',
        qty: 1,
        days: 1,
        rate: 0,
        uom: 'Day'
      }])
    }, "+ Add Item"))), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '12px 0',
        color: MT,
        fontSize: 12,
        border: `1px dashed ${BDR}`,
        borderRadius: 6
      }
    }, "No items yet. Click \"+ Add Item\" or pick from Masterlist.") : /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Description', 'Qty', 'Days', 'Rate (P)', 'Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, _ix) => {
      const tot = N(r.qty) * N(r.days) * N(r.rate);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 200
        },
        list: idPfx,
        value: r.desc,
        onChange: e => {
          const dv = e.target.value;
          const f = (masterlist.vehicles || []).find(vml => vml.desc === dv);
          setRows(p => p.map(xr => xr.id === r.id ? {
            ...xr,
            desc: dv,
            ...(f ? {
              rate: f.rate,
              uom: f.uom
            } : {})
          } : xr));
        },
        placeholder: "e.g. Driver, Meals, Plane Ticket, Diesel..."
      }), _ix === 0 && /*#__PURE__*/React.createElement("datalist", {
        id: idPfx
      }, (masterlist.vehicles || []).map(mlItem => /*#__PURE__*/React.createElement("option", {
        key: mlItem.id,
        value: mlItem.desc
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 52
        },
        min: 1,
        value: r.qty,
        onCommit: v => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          qty: v
        } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 52
        },
        min: 1,
        value: r.days,
        onCommit: v => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          days: v
        } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 96
        },
        min: 0,
        value: r.rate,
        onCommit: v => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          rate: v
        } : xr))
      }),
      /*#__PURE__*/React.createElement(RateHistory, {
        kind: 'vehicles',
        name: r.desc,
        onPick: v => setRows(p => p.map(xr => xr.id === r.id ? { ...xr, rate: v } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          ...MONO,
          color: tot > 0 ? color || ACC : MT,
          fontWeight: 700,
          textAlign: 'right',
          minWidth: 100
        }
      }, "P", ph(tot)), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => setRows(p => p.filter(xr => xr.id !== r.id)),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    })))), rows.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${BDR}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: color || ACC,
        fontWeight: 700,
        fontSize: 12
      }
    }, "Total: ", /*#__PURE__*/React.createElement("span", {
      style: MONO
    }, "P", ph(rows.reduce((s, r) => s + N(r.qty) * N(r.days) * N(r.rate), 0))))));
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: alpha(INFO, '44')
      }
    }, secHead("Mobilization Expenses", INFO, "Manpower and each charge as separate line items", {size: 11, mb: 12}), MobMpTable({
      rows: mobVehicles,
      setRows: setMobVehicles,
      idPfx: "mm",
      color: INFO
    }), ExpenseTable({
      rows: mobVehicles.filter(r => r.kind !== 'mp'),
      setRows: setMobVehicles,
      idPfx: "mv",
      color: INFO
    }), mobVehiclesT > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 10,
        borderTop: `1px solid ${alpha(INFO, '44')}`,
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: INFO,
        fontWeight: 700,
        fontSize: 13
      }
    }, "Mobilization Total: ", /*#__PURE__*/React.createElement("span", {
      style: MONO
    }, "P", ph(mobVehiclesT))))), /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: alpha(ACC, '44')
      }
    }, secHead("Demobilization Expenses", ACC, "Manpower and each charge as separate line items", {size: 11, mb: 12}), MobMpTable({
      rows: demobVehicles,
      setRows: setDemobVehicles,
      idPfx: "dm",
      color: ACC
    }), (() => {
      /* Most demobilization charges repeat the mobilization ones. Food
         allowance and the crew linked to the SOW are left out: both are
         counted from the Manpower on their own. "(MOB)" becomes "(DEMOB)". */
      const src = mobVehicles.filter(r => r.kind !== 'meal' && !(r.kind === 'mp' && r.auto));
      if (!src.length) return null;
      const ren = d => String(d || '').replace(/\(MOB\)/gi, '(DEMOB)').replace(/\bMOBILIZATION\b/gi, 'DEMOBILIZATION');
      const have = new Set(demobVehicles.map(r => String(r.desc || '').trim().toUpperCase()));
      const dup = r => have.has(ren(r.desc).trim().toUpperCase());
      if (!mobCopy) return /*#__PURE__*/React.createElement("div", { style: { display: 'flex', justifyContent: 'flex-end', margin: '4px 0 10px' } },
        /*#__PURE__*/React.createElement("button", {
          style: btn('info', true),
          title: 'Copy some or all mobilization items here. Food allowance and the SOW crew are not copied -- they come from the Manpower.',
          onClick: () => setMobCopy(new Set(src.filter(r => !dup(r)).map(r => r.id)))
        }, "\u29c9 Copy from Mobilization"));
      const all = src.every(r => mobCopy.has(r.id));
      return /*#__PURE__*/React.createElement("div", { style: { border: '1px solid ' + alpha(ACC, '44'), borderRadius: 8, padding: 10, margin: '4px 0 12px', background: alpha(ACC, '08') } },
        /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
          /*#__PURE__*/React.createElement("b", { style: { fontSize: 12, color: ACC } }, "Copy from Mobilization"),
          /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: MT } }, "Food allowance and the SOW crew are counted from the Manpower, so they are not listed."),
          /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), marginLeft: 'auto', fontSize: 10, padding: '2px 8px' },
            onClick: () => setMobCopy(all ? new Set() : new Set(src.map(r => r.id))) }, all ? "None" : "All")),
        src.map((r, i) => /*#__PURE__*/React.createElement("label", { key: r.id, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '2px 0', cursor: 'pointer' } },
          /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: mobCopy.has(r.id),
            onChange: () => setMobCopy(p => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }) }),
          /*#__PURE__*/React.createElement("span", { style: { color: MT, width: 18 } }, i + 1),
          /*#__PURE__*/React.createElement("span", { style: { flex: 1 } }, ren(r.desc) || '(no description)', r.kind === 'mp' ? ' \u00b7 manpower' : ''),
          dup(r) && /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: ACC } }, "already in demob"),
          /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: MT } }, N(r.qty) + " \u00d7 " + (N(r.days) || 1) + "d \u00d7 " + ph(N(r.rate))))),
        /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 } },
          /*#__PURE__*/React.createElement("button", { style: btn('def', true), onClick: () => setMobCopy(null) }, "Cancel"),
          /*#__PURE__*/React.createElement("button", { style: btn('acc', true), disabled: !mobCopy.size,
            onClick: () => {
              const pick = src.filter(r => mobCopy.has(r.id)).map(r => ({ ...r, id: uid(), desc: ren(r.desc) }));
              setDemobVehicles(p => [...p, ...pick]);
              setMobCopy(null);
              showToast(pick.length + ' item(s) copied to Demobilization.');
            } }, "Copy " + mobCopy.size + " item(s)")));
    })(), ExpenseTable({
      rows: demobVehicles.filter(r => r.kind !== 'mp'),
      setRows: setDemobVehicles,
      idPfx: "dv",
      color: ACC
    }), demobVehiclesT > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 10,
        borderTop: `1px solid ${alpha(ACC, '44')}`,
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: ACC,
        fontWeight: 700,
        fontSize: 13
      }
    }, "Demobilization Total: ", /*#__PURE__*/React.createElement("span", {
      style: MONO
    }, "P", ph(demobVehiclesT))))), _mobTabs > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: alpha(OK, '44'),
        background: alpha(OK, '08')
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        color: OK
      }
    }, "Mob + Demob Total"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 11,
        marginTop: 2
      }
    }, "Mobilization: P", ph(mobSubT), " + Demobilization: P", ph(demobSubT))), /*#__PURE__*/React.createElement("div", {
      style: {
        ...MONO,
        fontWeight: 800,
        fontSize: 16,
        color: OK
      }
    }, "P", ph(_mobTabs)))));
  })(), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(INFO, '44'),
      marginBottom: 8
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
      flex: 1
    }
  }, "Manpower Entries"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "Rows are grouped by shift type. Add under the shift you need."),
  /* The OT factor sits with the shift multipliers because it is one: the two
     compound on every overtime hour, and having one editable while the other
     stayed a constant would have been the more confusing half-measure. */
  /*#__PURE__*/React.createElement("span", {
    style: {display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 10, color: MT}
  }, "OT rate", /*#__PURE__*/React.createElement("input", {
    key: 'otm' + ceOtMult(rr),
    defaultValue: ceOtMult(rr),
    type: "number", min: "0", step: "0.05",
    title: "What an overtime hour costs, as a multiple of the hourly rate (day rate / 8). Default "
      + stdRates().otMult + "×. It compounds with the shift multiplier, so a night OT hour is "
      + (ceOtMult(rr) * ceShiftMult(rr, 'regular_night')).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
      + "× the hourly rate.",
    style: {
      ...INP, ...MONO, width: 54, padding: '2px 4px', fontSize: 10, fontWeight: 700,
      textAlign: 'right', color: ceOtMult(rr) === stdRates().otMult ? TX : ACC
    },
    onBlur: ev => {
      const v = parseFloat(ev.target.value);
      setRates(p => {
        const n = {...p};
        if (!isFinite(v) || v <= 0 || v === OT_MULT_DEFAULT) delete n.otMult; else n.otMult = v;
        return n;
      });
    }
  }), "×"))), Object.entries(SHIFTS).map(([shiftKey, shiftInfo]) => {
    const rows = mp.filter(r => r.shift === shiftKey);
    const shiftMult = ceShiftMult(rr, shiftKey);
    /* Overtime included -- see mpWage. Left out, this disagreed with the row
       totals printed directly above it and with the C.1–C.4 subtotal below. */
    const shiftSub = rows.reduce((s, r) => s + mpWage(r), 0);
    /* Head count = total PAX across rows that actually name a role. A blank
       starter row defaults to pax 1, so counting rows reported "1 worker" on an
       empty CE, and a row of 3 electricians only counted as one. */
    const shiftWorkers = rows.reduce((s, r) => s + (r.role ? N(r.pax) : 0), 0);
    const collapsed = !!collapsedShifts[shiftKey];
    const addFromML = () => setPicker({
      type: 'manpower',
      onSelect: item => setMp(p => [...p, {
        id: uid(),
        role: item.role,
        pax: 1,
        days: 1,
        otHours: 0,
        shift: shiftKey,
        rate: item.rate,
        perDiem: item.perDiem || 0
      }])
    });
    const addRow = () => setMp(p => [...p, {
      id: uid(),
      role: '',
      pax: 1,
      days: 1,
      shift: shiftKey,
      rate: 0
    }]);
    const shiftColor = shiftKey.startsWith('regular') ? INFO : shiftKey.startsWith('sunday') ? 'var(--accent-violet)' : ERR;
    return /*#__PURE__*/React.createElement("div", {
      key: shiftKey,
      style: {
        ...CS,
        padding: collapsed ? '10px 14px' : 16,
        borderColor: rows.length > 0 ? alpha(shiftColor, '55') : BDR,
        /* A shift carrying people is ringed rather than only tinted: on the
           light canvas a tint alone is nearly invisible against the card. */
        boxShadow: rows.length > 0
          ? '0 0 0 1px ' + alpha(shiftColor, '33') + ', var(--card-shadow)'
          : 'var(--card-shadow)',
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        userSelect: 'none'
      },
      onClick: () => toggleShift(shiftKey)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: rows.length > 0 ? shiftColor : BDR,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 13
      }
    }, shiftInfo.label),
    /* The pill is the field. The statutory figures are the defaults, not the
       law of the app -- DOLE changes, and a CE agreed at a negotiated rate is
       a real thing. Edited here it is stored on THIS CE, so nothing already
       saved reprices.

       Uncontrolled with an onBlur: keystroke state would recost every row in
       the tab on each digit, and "1." is not a multiplier. */
    /*#__PURE__*/React.createElement("span", {
      onClick: e => e.stopPropagation(),
      style: {
        display: 'inline-flex', alignItems: 'center', gap: 1,
        background: alpha(shiftColor, '22'),
        color: shiftColor,
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 5px 1px 7px',
        borderRadius: 3
      }
    }, /*#__PURE__*/React.createElement("input", {
      key: 'sm' + shiftKey + shiftMult,
      defaultValue: shiftMult,
      type: "number", min: "0", step: "0.05",
      title: "Multiplier for this shift on this CE. Company standard " + stdRates().shiftMults[shiftKey] + "\u00d7."
        + (shiftMult !== stdRates().shiftMults[shiftKey] ? " Differs from the standard." : ""),
      style: {
        ...INP, ...MONO, width: 42, padding: 0, border: 'none', background: 'transparent',
        color: 'inherit', fontSize: 10, fontWeight: 700, textAlign: 'right'
      },
      onBlur: ev => {
        const v = parseFloat(ev.target.value);
        setRates(p => {
          const m = {...(p.shiftMults || {})};
          /* Back to the statutory figure rather than storing a copy of it, so
             a CE only carries what actually differs. */
          if (!isFinite(v) || v <= 0 || v === shiftInfo.mult) delete m[shiftKey];
          else m[shiftKey] = v;
          return {...p, shiftMults: m};
        });
      }
    }), "\u00d7",
    shiftMult !== stdRates().shiftMults[shiftKey] && /*#__PURE__*/React.createElement("span", {
      title: "Company standard is " + stdRates().shiftMults[shiftKey] + "\u00d7",
      style: {marginLeft: 3, opacity: .75}
    }, "\u25cf"),
    rows.length > 0 ? " Multiplier" : ""),
    /* The head count and the subtotal are stated even at zero. Hidden, an
       empty shift and a shift nobody has opened look identical, and the row
       silently changes shape the moment the first person is added. */
    /*#__PURE__*/React.createElement("span", {
      style: {
        color: shiftWorkers > 0 ? MT : 'var(--text-muted)',
        fontSize: 11
      }
    }, shiftWorkers, " worker", shiftWorkers !== 1 ? 's' : ''))), /*#__PURE__*/React.createElement("span", {
      style: {
        ...MONO,
        color: shiftSub > 0 ? shiftColor : 'var(--text-muted)',
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0
      }
    }, "\u20b1", ph(shiftSub)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5,
        flexShrink: 0,
        position: 'relative'
      },
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: addFromML
    }, "ML"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: addRow
    }, "+ Add"), /*#__PURE__*/React.createElement("button", {
      style: btn('ok', true),
      title: "Update all rates in this shift to current masterlist rates",
      onClick: () => {
        let updated = 0;
        setMp(p => p.map(r => {
          if (r.shift !== shiftKey) return r;
          const f = masterlist.manpower.find(m => m.role && r.role && m.role.toUpperCase() === r.role.toUpperCase());
          if (!f) return r;
          updated++;
          return {...r, rate: f.rate, perDiem: f.perDiem !== undefined ? f.perDiem : r.perDiem};
        }));
        showToast(updated ? `Updated ${updated} rate(s) from masterlist.` : 'No matching roles found in masterlist.', !updated);
      }
    }, "↺ Sync Rates"),
    /* Consolidates the crew the way the estimate is actually priced: MAX of the
       pax and the SUM of the days. One electrician on task 1 and three on task
       2 is three electricians mobilised for both durations -- they are on site
       and paid whether or not every task needs all of them. The total goes UP,
       and that is the point; adding the rows up understates what the job costs.

       OT hours per day and the incentive are per-day RATES, so the peak is carried
       across the whole duration for the same reason the pax is.

       The row keeps what each task originally asked for, so SOW Breakdown still
       lists it under both and splits its cost between them in proportion. */
    /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      title: "Combine rows for the same role into the crew you actually mobilise: the largest PAX any task needs, for the total number of days",
      onClick: async () => {
        const key = r => [String(r.role || '').trim().toUpperCase(), N(r.rate)].join('|');
        const rows = mp.filter(r => r.shift === shiftKey && r.role);
        const groups = {};
        rows.forEach(r => { (groups[key(r)] = groups[key(r)] || []).push(r); });
        const dupes = Object.values(groups).filter(g => g.length > 1);
        if (!dupes.length) { showToast('No repeated roles in this shift — nothing to consolidate.', true); return; }
        const before = rows.reduce((a, r) => a + rowCost('mp', r), 0);
        const plan = dupes.map(g => {
          const pax = Math.max(...g.map(r => N(r.pax)));
          const days = g.reduce((a, r) => a + N(r.days), 0);
          return { g, pax, days, role: g[0].role };
        });
        const preview = plan.map(p2 =>
          '  ' + p2.role + ':  ' + p2.g.map(r => N(r.pax) + ' pax x ' + N(r.days) + 'd').join('  +  ') +
          '   ->   ' + p2.pax + ' pax x ' + p2.days + ' days').join('\n');
        if (!await uiConfirm('Consolidate ' + plan.length + ' role' + (plan.length === 1 ? '' : 's') +
          ' into the crew you mobilise?\n\n' + preview +
          '\n\nThe largest PAX any task needs, kept for the total number of days. ' +
          'This normally COSTS MORE than the rows added up, because the crew is on site for the whole duration.' +
          '\n\nSOW Breakdown will still show each role under every task it serves, with the cost split between them.')) return;
        const drop = new Set(), patch = {};
        plan.forEach(p2 => {
          const keep = p2.g[0];
          /* Record what each task asked for BEFORE the merge, so the breakdown
             can split the consolidated cost back out in proportion. */
          const shares = p2.g.flatMap(r => (rowShares(r) || [{ taskId: r.taskId || '', weight: _weight('mp', r) }]));
          patch[keep.id] = {
            pax: p2.pax, days: p2.days,
            otHours: Math.max(...p2.g.map(r => N(r.otHours || 0))),
            perDiem: Math.max(...p2.g.map(r => N(r.perDiem || 0))),
            shares: shares.filter(x => x.taskId)
          };
          p2.g.slice(1).forEach(r => drop.add(r.id));
        });
        setMp(p2 => p2.filter(r => !drop.has(r.id)).map(r => patch[r.id] ? { ...r, ...patch[r.id] } : r));
        const after = plan.reduce((a, p2) => a + p2.pax * p2.days * N(p2.g[0].rate) * shiftMult, 0)
          + rows.filter(r => !dupes.flat().includes(r)).reduce((a, r) => a + rowCost('mp', r), 0);
        showToast('Consolidated ' + plan.length + ' role' + (plan.length === 1 ? '' : 's') + '. ' +
          (after > before ? 'The manpower cost rose — the crew is now costed for the whole duration.' : 'Totals updated.'));
      }
    }, "⇊ Consolidate crew"), /*#__PURE__*/React.createElement("label", {
      style: {...btn('def', true), cursor: 'pointer'},
      title: "Import from Excel — columns: Role, PAX, Days, Rate"
    }, "📥 XLS", /*#__PURE__*/React.createElement("input", {
      type: "file", accept: ".xlsx,.xls", style: {display: 'none'},
      onChange: ev => {
        const file = ev.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = e2 => {
          try {
            const wb = XLSX.read(new Uint8Array(e2.target.result), {type: 'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows2 = XLSX.utils.sheet_to_json(ws, {defval: ''});
            const imported = rows2.map(r => ({
              id: uid(), shift: shiftKey,
              role: String(r['Role'] || r['ROLE'] || r['role'] || '').trim(),
              pax: Math.max(1, parseInt(r['PAX'] || r['pax'] || r['Pax'] || 1) || 1),
              days: Math.max(1, parseInt(r['Days'] || r['DAYS'] || r['days'] || N(info.days) || 1) || 1),
              rate: parseFloat(r['Rate'] || r['RATE'] || r['rate'] || 0) || 0,
              otHours: 0, perDiem: 0
            })).filter(r => r.role);
            if (!imported.length) { showToast('No valid rows. Columns needed: Role, PAX, Days, Rate', true); return; }
            setMp(p => [...p, ...imported]);
            showToast('Imported ' + imported.length + ' manpower rows.');
          } catch(ex) { showToast('Excel parse failed: ' + ex.message, true); }
        };
        reader.readAsArrayBuffer(file);
        ev.target.value = '';
      }
    })), rows.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      title: "Copy this shift's rows to another shift",
      onClick: () => setCopyMenu(copyMenu === shiftKey ? null : shiftKey)
    }, "Copy to..."), copyMenu === shiftKey && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        right: 0,
        top: '110%',
        background: CARD,
        border: `1px solid ${BDR}`,
        borderRadius: 8,
        zIndex: 200,
        minWidth: 200,
        boxShadow: '0 4px 20px #0008',
        padding: 8
      }
    }, /*#__PURE__*/React.createElement("div", {style: {color: MT, fontSize: 10, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em'}}, "Copy to shift:"), Object.entries(SHIFTS).filter(([sk]) => sk !== shiftKey).map(([sk, sv]) => /*#__PURE__*/React.createElement("button", {
      key: sk,
      style: {
        ...btn('def', true),
        width: '100%',
        justifyContent: 'flex-start',
        marginBottom: 3,
        fontSize: 11,
        textAlign: 'left'
      },
      onClick: () => {
        const copied = rows.map(r => ({
          ...r,
          id: uid(),
          shift: sk,
          otHours: r.otHours || 0
        }));
        setMp(prev => {
          const existing = prev.filter(r => r.shift === sk);
          const existingRoles = new Set(existing.map(r => r.role.toUpperCase().trim()));
          const toAdd = copied.filter(r => !existingRoles.has(r.role.toUpperCase().trim()));
          return [...prev, ...toAdd];
        });
        setCollapsedShifts(p => ({
          ...p,
          [sk]: false
        }));
        setCopyMenu(null);
        showToast('Copied ' + copied.length + ' rows to ' + sv.label + (copied.length < rows.length ? ' (skipped duplicates)' : '') + '.');
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: sk.startsWith('regular') ? INFO : sk.startsWith('sunday') ? 'var(--accent-violet)' : ERR,
        marginRight: 7
      }
    }), sv.label, " (", sv.mult, "x)")), /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('def', true),
        width: '100%',
        marginTop: 4,
        fontSize: 10,
        color: MT
      },
      onClick: () => setCopyMenu(null)
    }, "Cancel")))), /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 14,
        flexShrink: 0,
        marginLeft: 2
      }
    }, collapsed ? '\u25b8' : '\u25be')), !collapsed && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12
      }
    }, rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '14px 0',
        color: MT,
        fontSize: 12,
        border: `1px dashed ${BDR}`,
        borderRadius: 6
      }
    }, "No workers under this shift. Click \"+ Add\" or \"ML\" above.") : /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Role / Position', 'PAX', 'Days', 'OT Hrs/Day', 'Day Rate (P)'].concat((sowItems || []).length ? ['Scope Task'] : []).concat(['Row Total', '']).map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, _ix) => {
      const {reg: regAmt, ot: otAmt, total: tot} = mpWageParts(r);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          width: 180
        },
        list: 'rl',
        value: r.role,
        onChange: e => {
          const ro = e.target.value;
          /* The Masterlist is where a role's figures come from -- its day rate
             AND its incentive. Only the rate was being copied, so a role typed
             here arrived with no incentive at all: the C.7 line read P0.00
             against a Masterlist that says P200, and the CE charged the P0.
             The ML button and Sync Rates always copied both; this path was the
             one that did not.

             Matched case-insensitively, the way Sync Rates matches it, so a
             role typed in lower case finds its entry too.

             Copied onto the row rather than read from the list on the fly:
             what a CE charges has to be settled when it is quoted, or editing
             the Masterlist next month silently reprices every estimate already
             sent out. Sync Rates is how a row is deliberately brought back up
             to date. */
          const f = masterlist.manpower.find(m => m.role && m.role.toUpperCase() === ro.toUpperCase());
          setMp(p => p.map(x => x.id === r.id ? {
            ...x,
            role: ro,
            ...(f ? {rate: f.rate, perDiem: f.perDiem !== undefined ? f.perDiem : x.perDiem} : {})
          } : x));
        },
        placeholder: "Role name..."
      }), _ix === 0 && /*#__PURE__*/React.createElement("datalist", {
        id: 'rl'
      }, masterlist.manpower.map(m => /*#__PURE__*/React.createElement("option", {
        key: m.id,
        value: m.role
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 50
        },
        min: 1,
        intOnly: true,
        value: r.pax,
        onCommit: v => updRow(setMp, r.id, 'pax', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 50
        },
        min: 1,
        intOnly: true,
        value: r.days,
        onCommit: v => updRow(setMp, r.id, 'days', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 58,
          borderColor: N(r.otHours) > 0 ? alpha(ACC, '88') : BDR
        },
        min: 0,
        step: 0.5,
        value: r.otHours || 0,
        onCommit: v => updRow(setMp, r.id, 'otHours', v),
        title: "Overtime hours PER DAY, charged at " + ceOtMult(rr) + "× the hourly rate (day rate / 8) for every day in the Days column. 3 hrs over 10 days = 30 OT hours."
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 90
        },
        min: 0,
        value: r.rate,
        onCommit: v => updRow(setMp, r.id, 'rate', v)
      }),
      /*#__PURE__*/React.createElement(RateHistory, {
        kind: 'mp',
        name: r.role,
        onPick: v => updRow(setMp, r.id, 'rate', v)
      }),
      /* The average stays: it answers "is this rate normal" at a glance, which
         is a different question from "what exactly did we charge, and when".
         The clock beside it answers that one. */
      (() => {
        if (!r.role || !history.length) return null;
        const roleUpper = r.role.toUpperCase();
        const rates = history.flatMap(h => (h.mp||[]).filter(m=>(m.role||'').toUpperCase()===roleUpper&&N(m.rate)>0).map(m=>N(m.rate)));
        if (!rates.length) return null;
        const avg = rates.reduce((a,b)=>a+b,0)/rates.length;
        return /*#__PURE__*/React.createElement("div",{style:{fontSize:9,color:MT,marginTop:2,whiteSpace:'nowrap'}},
          "Avg: ₱"+ph(avg)+" ("+rates.length+" CE"+(rates.length>1?"s":"")+")"
        );
      })()
      ),
      /* Which scope task this row belongs to. Two rows for the same role are
         normal once tasks own their resources -- one crew on 1.1, another on
         1.2 -- but with nothing on screen saying so the tab just looked like it
         had failed to merge them. */
      (sowItems || []).length > 0 && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 150, fontSize: 10, padding: '3px 4px' },
        value: r.taskId || '',
        title: "The scope task this row is costed under. Change it here or in SOW Breakdown.",
        onChange: e => updRow(setMp, r.id, 'taskId', e.target.value)
      },
        /*#__PURE__*/React.createElement("option", { value: '' }, "— unassigned —"),
        (sowItems || []).map(it => /*#__PURE__*/React.createElement("option", { key: it.id, value: it.id },
          (sowLabels[it.id] || '') + '  ' + (it.text || '(untitled)').slice(0, 28)))
      )), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          ...MONO,
          color: tot > 0 ? shiftColor : MT,
          fontWeight: 700,
          textAlign: 'right',
          minWidth: 110
        }
      }, "P", ph(tot), N(r.otHours) > 0 && /*#__PURE__*/React.createElement("span", {
        style: {
          color: ACC,
          fontSize: 9,
          display: 'block',
          fontWeight: 400
        }
      }, "OT: \u20b1", ph(N(r.pax) * N(r.days) * (N(r.otHours) / 8) * N(r.rate) * ceOtMult(rr) * shiftMult))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => delRow(setMp, r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    })), /* SUB TOTAL for the shift, as the printed CE shows it: headcount under
       PAX, cost under Row Total. */
    rows.length > 0 && /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", {
      style: { borderTop: '2px solid ' + BDR }
    }, /*#__PURE__*/React.createElement("td", {
      colSpan: 2,
      style: { ...TDS, textAlign: 'right', fontWeight: 700, fontSize: 11, color: MT }
    }, "SUB TOTAL ", /*#__PURE__*/React.createElement("span", {
      title: "This shift's multiplier on this CE -- already applied to the total",
      style: { ...MONO, color: shiftColor }
    }, "(\u00d7" + shiftMult + ")"), ":"), /*#__PURE__*/React.createElement("td", {
      style: { ...TDS, ...MONO, fontWeight: 700, color: shiftColor, paddingLeft: 12 }
    }, rows.reduce((t, r) => t + (String(r.role || '').trim() ? N(r.pax) : 0), 0), " pax"), /*#__PURE__*/React.createElement("td", {
      colSpan: (sowItems || []).length ? 4 : 3,
      style: TDS
    }), /*#__PURE__*/React.createElement("td", {
      style: { ...TDS, ...MONO, fontWeight: 700, color: shiftColor, textAlign: 'right' }
    }, "₱", ph(shiftSub)), /*#__PURE__*/React.createElement("td", {
      style: TDS
    })))))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(ACC, '55'),
      background: alpha(ACC, '08')
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 24,
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 2
    }
  }, "C.1\u2013C.4 Subtotal"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 700,
      fontSize: 14
    }
  }, "P", ph(mpSub))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 2
    }
  }, "C.5 Benefits & Others (20%)"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 700,
      fontSize: 14
    }
  }, "P", ph(ben))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      borderLeft: `1px solid ${BDR}`,
      paddingLeft: 24
    }
  }, secHead("Manpower Total", ACC, null, {size: 11, mb: 2}), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 800,
      fontSize: 18,
      color: ACC
    }
  }, "P", ph(mpTot)))))), mp.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(ACC, '44'),
      marginTop: 8
    }
  }, secHead("C.7 Benefits & Others", ACC, "Standard Philippine mandated formula", {size: 12, mb: 12}), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: SURF
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      width: 28,
      textAlign: 'center'
    }
  }, "#"), /*#__PURE__*/React.createElement("th", {
    style: THS
  }, "Manpower Loading"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'center',
      width: 40
    }
  }, "Qty"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'center',
      width: 36
    }
  }, "UOM"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'center',
      width: 46
    }
  }, "Days"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 100
    }
  }, "Monthly Rate"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 90
    }
  }, "13th Pay"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 80
    }
  }, "SSS"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 100
    }
  }, "HDMF & PHIC"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 90
    }
  }, "SIL"), /*#__PURE__*/React.createElement("th", {
    style: { ...THS, textAlign: 'right', width: 70 },
    title: rr.eccRule === 'month' ? 'ECC: P30 per person per month, shared across the shifts they work' : 'ECC: P30 per person on each shift entry'
  }, "ECC"), incOn && /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 90
    }
  }, cfg.incentive === 'site' ? /*#__PURE__*/React.createElement("span", {
    title: "Shop + Site: counted only on rows assigned to Site scope items (SOW Breakdown). Shop days earn none."
  }, "Incentive (site) ⓘ") : "Incentive"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 100,
      background: alpha(ACC, '22'),
      color: ACC
    }
  }, "Total"))), /*#__PURE__*/React.createElement("tbody", null, (() => {
    /* Straight off benefitRows -- the same rows the printed CE and both
       exports use, computed by calcBen.

       This block used to recompute all five benefits itself, and took the
       incentive from the MASTERLIST entry for the role rather than from the
       row. So a role the list gives a P200 incentive showed INCENTIVE P200 and
       a row total of P307.27, while C.5, the sub-total under this very table,
       the manpower total and the CE itself all charged P107.27. The screen
       was showing P200 that nothing was billing. The row is the source of
       truth for cost everywhere else in this app, so it is here too -- and
       the incentive is now editable on the row, below, rather than being
       whatever the masterlist happens to say today. */
    return benefitRows.map((g, rowIdx) => {
      const cell = (v, extra) => /*#__PURE__*/React.createElement("td", {
        style: {...TDS, textAlign: 'right', ...MONO, ...(extra || {})}
      }, "P", ph(v));
      /* Editing a merged line writes the rate to every shift entry for that
         role -- the line is one role, however many shifts it was split over,
         and an incentive that differed between them could not be shown here. */
      const setIncentive = v => setMp(p => p.map(x =>
        String(x.role || '').trim().toUpperCase() === String(g.role).trim().toUpperCase()
          ? {...x, perDiem: v} : x));
      const rowIncentive = (() => {
        const mine = mp.filter(x => String(x.role || '').trim().toUpperCase() === String(g.role).trim().toUpperCase());
        const first = mine.length ? N(mine[0].perDiem || 0) : 0;
        return mine.every(x => N(x.perDiem || 0) === first) ? first : null;   /* null = mixed */
      })();
      /* Null when the role is not in the Masterlist at all -- which is not the
         same as a role the Masterlist prices at zero, and must not read as a
         disagreement worth flagging. */
      const mlIncentive = (() => {
        const m = (masterlist.manpower || []).find(x => x.role &&
          x.role.trim().toUpperCase() === String(g.role).trim().toUpperCase());
        return m ? N(m.perDiem || 0) : null;
      })();
      /* One line per shift, under the role that subtotals them.

         A role split over a regular day, a Sunday and a holiday used to be a
         single line, and two columns cannot honestly summarise three different
         day types: the pax read as a crew, the days as one shift's length, and
         the P30 ECC inside SIL & ECC -- charged once per shift entry -- was
         invisible. The role line is now a SUBTOTAL, and each shift is shown
         underneath with its own figures, exactly as calcBen computed them. */
      const kids = (g.shiftDays || []).length > 1 ? g.shiftDays.map((x, i) =>
        /*#__PURE__*/React.createElement("tr", {
          key: g.role + ':' + x.shift + ':' + i,
          style: {background: alpha(SURF, '55'), fontSize: 11}
        },
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT, fontSize: 10}},
            (rowIdx + 1) + '.' + (i + 1)),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, paddingLeft: 22, color: MT}},
            "↳ " + ((SHIFTS[x.shift] || {}).label || x.shift)),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', ...MONO, color: MT}}, x.pax),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT}}, "pax"),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', ...MONO, color: MT}}, x.days),
          cell(x.monthlyRate, {color: MT}), cell(x.thirteenth, {color: MT}), cell(x.sss, {color: MT}),
          cell(x.hdmf, {color: MT}),
          /*#__PURE__*/React.createElement("td", {
            style: {...TDS, textAlign: 'right', ...MONO, color: MT},
            /* The flat ECC is charged once per shift entry, so a role on three
               day types carries it three times. Said out loud on the line it
               happens, rather than buried in a subtotal. */
            title: 'Service incentive leave, 5 days a year'
          }, "P", ph(x.sil - x.ecc)),
          /*#__PURE__*/React.createElement("td", {
            style: {...TDS, textAlign: 'right', ...MONO, color: MT},
            title: rr.eccRule === 'month' ? 'This shift\u2019s share of P30 per person per month' : 'P30 per person, charged once on each shift entry -- the rule this CE was quoted on'
          }, "P", ph(x.ecc)),
          incOn && cell(x.perdiem, {color: MT}),
          cell(x.total, {color: MT})
        )) : [];
      const head = /*#__PURE__*/React.createElement("tr", {
        key: g.role,
        style: {background: rowIdx % 2 === 0 ? 'transparent' : alpha(SURF, '88')}
      },
        /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT, fontSize: 10}}, rowIdx + 1),
        /*#__PURE__*/React.createElement("td", {style: TDS},
          /*#__PURE__*/React.createElement("div", {style: {fontWeight: 600, fontSize: 12}}, g.role || '--'),
          kids.length ? /*#__PURE__*/React.createElement("div", {style: {fontSize: 10, color: MT}},
            "subtotal of " + kids.length + " shift entries" +
            (g.paxDay && g.paxNight ? "  ·  " + g.paxDay + " day + " + g.paxNight + " night" : "")) : null),
        /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', ...MONO}}, g.pax),
        /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT}}, "pax"),
        /*#__PURE__*/React.createElement("td", {
          style: {...TDS, textAlign: 'center', ...MONO},
          title: g.daysVary
            ? 'One line for ' + g.shiftDays.length + ' shift rows. QTY is ' + g.paxDay + ' on days + ' +
              g.paxNight + ' on nights -- the same person works the regular, Sunday and holiday DAYS, but ' +
              'nobody works a day and that night. QTY x DAYS is the ' + ph(g.manDays) +
              ' man-days the benefits are charged on. ' +
              g.shiftDays.map(x => (SHIFTS[x.shift] || {label: x.shift}).label + ': ' + x.pax + ' x ' + x.days + 'd').join(', ')
            : undefined
        }, g.days, g.daysVary ? ' *' : ''),
        cell(g.monthlyRate, {color: MT}),
        cell(g.thirteenth), cell(g.sss), cell(g.hdmf), cell(g.sil - (g.ecc || 0)), cell(g.ecc || 0),
        incOn && /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'right'}},
          rowIncentive === null
            ? /*#__PURE__*/React.createElement("span", {
                style: {...MONO, color: MT, fontSize: 11},
                title: "This role carries different incentives on different shifts. Edit them on the shift rows above."
              }, "P" + ph(g.perdiem) + " *")
            : /*#__PURE__*/React.createElement("div", {style: {display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end'}},
                /* What the Masterlist says for this role, when the row does not
                   say the same. A CE quoted last month keeps the figure it was
                   quoted at -- the list must never reprice it on its own -- but
                   the estimator has to be able to SEE that the two differ, and
                   take the new one deliberately. Same idea as Sync Rates, for
                   one figure on one line. */
                mlIncentive !== null && mlIncentive !== rowIncentive && /*#__PURE__*/React.createElement("button", {
                  style: {...btn('info', true), fontSize: 9, padding: '1px 5px'},
                  title: "The Masterlist has P" + ph(mlIncentive) + " per day for " + g.role +
                         ". Click to use it on this CE. Sync Rates does the same for the whole shift.",
                  onClick: () => setIncentive(mlIncentive)
                }, "ML P" + ph(mlIncentive)),
                /*#__PURE__*/React.createElement(NumBox, {
                  style: {...INP, ...MONO, width: 84, textAlign: 'right', fontSize: 11},
                  min: 0, value: rowIncentive, placeholder: "0",
                  title: "Incentive PER DAY, per person, charged as part of C.5 Benefits & Others. It comes from the Masterlist when the role is picked or typed, and Sync Rates brings it up to date. Typed here, it applies to this CE only.",
                  onCommit: setIncentive
                }))),
        cell(g.total, {color: ACC, fontWeight: 700, background: alpha(ACC, '0A')})
      );
      return kids.length ? [head, ...kids] : head;
    });
  })()), /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: alpha(ACC, '14'),
      borderTop: `2px solid ${alpha(ACC, '44')}`,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 2,
    style: { ...TDS, textAlign: 'right', color: ACC, fontSize: 11 }
  }, "Total manpower:"), /*#__PURE__*/React.createElement("td", {
    /* The headcount the rows above carry -- each role's day plus night crew. */
    style: { ...TDS, ...MONO, color: ACC, textAlign: 'center' }
  }, benefitRows.reduce((t, r) => t + N(r.pax), 0), " pax"), /*#__PURE__*/React.createElement("td", {
    colSpan: incOn ? 9 : 8,
    style: {
      ...TDS,
      textAlign: 'right',
      color: ACC
    }
  }, "Benefits & Others Sub-Total:"), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right',
      ...MONO,
      color: ACC,
      fontWeight: 800,
      fontSize: 12
    }
    /* The sum of the rows above it, so this footer can never report a figure
       the table it sits under does not add up to. Equal to `ben` -- the one
       the CE is costed on -- and tools/test-manpower-totals.js keeps it so. */
  }, "P", ph(benefitsT))))))));
}
