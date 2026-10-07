/* The Miscellaneous tab: the per-category lines (accommodation, transportation, requirements, admin cost, third party, insurances).

   Moved out of App.js unchanged. Invoked as MiscTab({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function MiscTab(ctx) {
  const {
    ceType,
    masterlist,
    misc,
    miscT,
    mp,
    setMisc,
    setPicker,
    showToast,
    syncMealRates,
    syncMealRows
  } = ctx;
  return React.createElement("div", null, (MISC_DEF[ceType] || MISC_DEF.onsite).map(([miscKey, label]) => {
    const rows = Array.isArray(misc[miscKey]) ? misc[miscKey] : [];
    const catTotal = rows.reduce((s, r) => s + miscRowCost(r), 0);
    const addItem = () => setMisc(p => ({
      ...p,
      [miscKey]: [...(Array.isArray(p[miscKey]) ? p[miscKey] : []), mkMiscRow()]
    }));
    const updItem = (id, field, val) => setMisc(p => ({
      ...p,
      [miscKey]: (p[miscKey] || []).map(r => r.id === id ? {
        ...r,
        [field]: val
      } : r)
    }));
    const delItem = id => setMisc(p => ({
      ...p,
      [miscKey]: (p[miscKey] || []).filter(r => r.id !== id)
    }));
    return /*#__PURE__*/React.createElement("div", {
      key: miscKey,
      style: {
        ...CS,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: rows.length > 0 ? 12 : 0,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        flex: 1
      }
    }, label), catTotal > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        ...MONO,
        color: ACC,
        fontWeight: 700,
        fontSize: 12
      }
    }, "P", ph(catTotal)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => setPicker({
        type: 'vehicles',
        onSelect: item => setMisc(p => ({
          ...p,
          [miscKey]: [...(Array.isArray(p[miscKey]) ? p[miscKey] : []), {
            id: uid(),
            desc: item.desc,
            qty: 1,
            uom: item.uom,
            cost: item.cost || item.rate || 0
          }]
        }))
      })
    }, "From Masterlist"), miscKey === 'accommodation' && /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      title: 'Meal allowance per category (PM, admin, skilled manpower): pax from the crew, days from the shifts. Stays in sync with the Manpower.',
      onClick: () => { if (!consolidateCrew(mp).length) { showToast('No manpower yet.', true); return; } setMisc(p => ({ ...p, accommodation: syncMealRows(Array.isArray(p.accommodation) ? p.accommodation : [], true, 'cost', true) })); }
    }, "🍽 Food allowance from crew"), miscKey === 'accommodation' && rows.some(r => r.kind === 'meal') && /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      title: 'Set every meal allowance line on this CE (mobilization, demobilization, accommodation) to the current Masterlist rate',
      onClick: syncMealRates
    }, "↺ Sync meal rates"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: addItem
    }, "+ Add"))), rows.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '10px 0',
        color: MT,
        fontSize: 11,
        border: `1px dashed ${BDR}`,
        borderRadius: 5
      }
    }, "No items. Click \"+ Add\" or pick from Masterlist."), rows.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Description', 'Qty', 'UOM', 'Days', 'Unit Cost (P)', 'Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, _ix) => {
      const tot = miscRowCost(r);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, r.auto && /*#__PURE__*/React.createElement("span", { title: 'Counted from the crew -- follows the Manpower', style: { float: 'right', marginTop: 6, fontSize: 9, fontWeight: 700, color: OK, border: '1px solid ' + alpha(OK, '66'), borderRadius: 4, padding: '0 4px' } }, "CREW"), /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 195
        },
        list: 'mc_' + miscKey,
        value: r.desc || '',
        onChange: e => {
          const dv = e.target.value;
          const f = (masterlist.vehicles || []).find(vml => vml.desc === dv);
          updItem(r.id, 'desc', dv);
          if (f) {
            updItem(r.id, 'cost', f.cost || f.rate || 0);
            updItem(r.id, 'uom', f.uom);
          }
        },
        placeholder: "Item description..."
      }), Array.isArray(r.parts) && r.parts.length > 0 && /*#__PURE__*/React.createElement("div", {
        style: { marginTop: 4, fontSize: 10, color: MT, lineHeight: 1.5 }
      }, r.parts.map((p, j) => /*#__PURE__*/React.createElement("div", { key: j, style: { display: 'flex', gap: 8 } },
        /*#__PURE__*/React.createElement("span", { style: { flex: 1, paddingLeft: 10 } }, "\u2013 " + p.label),
        /*#__PURE__*/React.createElement("span", { style: MONO }, N(p.qty) + " pax \u00d7 " + N(p.days) + (N(p.days) === 1 ? " day" : " days"))))),
      _ix === 0 && /*#__PURE__*/React.createElement("datalist", {
        id: 'mc_' + miscKey
      }, (masterlist.vehicles || []).map(mlItem => /*#__PURE__*/React.createElement("option", {
        key: mlItem.id,
        value: mlItem.desc
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, Array.isArray(r.parts) && r.parts.length ? /*#__PURE__*/React.createElement("span", { style: { ...MONO, paddingLeft: 8 }, title: 'The crew in this category -- counted from the Manpower' }, N(r.qty)) : /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 58
        },
        min: 1, intOnly: true,
        value: r.qty || 1,
        onCommit: v => updItem(r.id, 'qty', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 72
        },
        value: uomCase(r.uom || 'Lot'),
        onChange: e => updItem(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Lot'))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, Array.isArray(r.parts) && r.parts.length ? /*#__PURE__*/React.createElement("span", { style: { ...MONO, paddingLeft: 8 }, title: 'Pax-days / crew, like DAYS on Benefits & Others. The total is charged on the sub-items below the description, not on this rounded figure.' }, N(r.days), " *") : /*#__PURE__*/React.createElement(NumBox, {
        style: { ...INP, ...MONO, width: 58 },
        min: 1,
        value: r.days || 1,
        onCommit: v => updItem(r.id, 'days', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 96
        },
        min: 0,
        value: r.cost || 0,
        onCommit: v => updItem(r.id, 'cost', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          ...MONO,
          color: tot > 0 ? ACC : MT,
          fontWeight: 700,
          textAlign: 'right',
          minWidth: 94
        }
      }, "P", ph(tot)), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => delItem(r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    })))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      background: alpha(ACC, '08'),
      borderColor: alpha(ACC, '44'),
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: ACC,
      fontWeight: 700,
      fontSize: 14
    }
  }, "Miscellaneous Total: ", /*#__PURE__*/React.createElement("span", {
    style: MONO
  }, "P", ph(miscT))))));
}
