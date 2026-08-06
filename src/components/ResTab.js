// Resource table component for Tools / Materials / PPE tabs
// Globals used: React, useState, useRef, useEffect, CS, btn, INP, THS, TDS, N, uid, mkRes, XLSX
const ResTab = ({
  rows,
  set,
  total,
  label,
  mlType,
  masterlist,
  showToast,
  setPicker,
  showDays /* Tools only: equipment can be charged per day (qty x days x cost) */
}) => {
  /* Days is optional per row and defaults to 1, so a row that never sets it
     costs exactly qty x cost -- existing CEs are unaffected. */
  const rowDays = r => (r.days === undefined || r.days === '' || r.days === null) ? 1 : (N(r.days) || 0);
  const rowTot = r => N(r.qty) * (showDays ? rowDays(r) : 1) * N(r.cost);
  const [_rtNewId, _rtSetNewId] = useState(null);
  const _rtDescRef = useRef(null);
  useEffect(() => {
    if (_rtNewId && _rtDescRef.current) { _rtDescRef.current.focus(); _rtSetNewId(null); }
  }, [_rtNewId]);
  return /*#__PURE__*/React.createElement("div", {
  style: CS
}, /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    fontWeight: 700
  }
}, label), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    gap: 6
  }
}, /*#__PURE__*/React.createElement("button", {
  style: btn('info', true),
  onClick: () => setPicker({
    type: mlType,
    onSelect: item => set(p => [...p, {
      id: uid(),
      desc: item.desc,
      qty: 1,
      uom: item.uom,
      cost: item.cost
    }])
  })
}, "From Masterlist"), /*#__PURE__*/React.createElement("button", {
  style: btn('ok', true),
  title: "Update all costs to current masterlist rates",
  onClick: () => {
    const mlItems = masterlist[mlType] || [];
    let updated = 0;
    set(p => p.map(r => {
      const f = mlItems.find(m => m.desc && r.desc && m.desc.toUpperCase() === r.desc.toUpperCase());
      if (!f) return r;
      updated++;
      return {...r, cost: f.cost !== undefined ? f.cost : (f.rate !== undefined ? f.rate : r.cost)};
    }));
    showToast(updated ? `Updated ${updated} rate(s) from masterlist.` : 'No matching items found in masterlist.', !updated);
  }
}, "↺ Sync Rates"), /*#__PURE__*/React.createElement("button", {
  style: btn('def', true),
  onClick: () => { const nid = uid(); _rtSetNewId(nid); set(p => [...p, {...mkRes(), id: nid}]); }
}, "+ Add"), /*#__PURE__*/React.createElement("label", {
  style: {...btn('def', true), cursor: 'pointer'},
  title: "Import from Excel — columns: Description, Qty, UOM, Unit Cost"
}, "📥 Import XLS", /*#__PURE__*/React.createElement("input", {
  type: "file", accept: ".xlsx,.xls", style: {display: 'none'},
  onChange: e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), {type: 'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {defval: ''});
        const imported = rows.map(r => ({
          id: uid(),
          desc: String(r['Description'] || r['DESCRIPTION'] || r['desc'] || '').trim(),
          qty: Math.max(1, parseInt(r['Qty'] || r['QTY'] || r['qty'] || 1) || 1),
          uom: String(r['UOM'] || r['uom'] || 'Lot').trim(),
          cost: parseFloat(r['Unit Cost'] || r['UNIT COST'] || r['cost'] || 0) || 0
        })).filter(r => r.desc);
        if (!imported.length) { showToast('No valid rows found. Check columns: Description, Qty, UOM, Unit Cost', true); return; }
        set(p => [...p, ...imported]);
        showToast('Imported ' + imported.length + ' rows from Excel.');
      } catch(ex) { showToast('Excel parse failed: ' + ex.message, true); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }
})))), /*#__PURE__*/React.createElement("div", {
  style: {
    overflowX: 'auto'
  }
}, /*#__PURE__*/React.createElement("table", {
  style: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12
  }
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Description', 'Qty', ...(showDays ? ['Days'] : []), 'UOM', 'Unit Cost (P)', 'Row Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
  key: h,
  style: THS
}, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => {
  const tot = rowTot(r);
  return /*#__PURE__*/React.createElement("tr", {
    key: r.id
  }, /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      minWidth: 190
    },
    ref: r.id === _rtNewId ? _rtDescRef : undefined,
    list: 'dl_' + mlType + '_' + r.id,
    value: r.desc,
    onChange: e => {
      const d = e.target.value;
      const f = (masterlist[mlType] || []).find(x => x.desc === d);
      set(p => p.map(x => x.id === r.id ? {
        ...x,
        desc: d,
        ...(f ? {
          cost: f.cost,
          uom: f.uom
        } : {})
      } : x));
    },
    placeholder: "Item description..."
  }), /*#__PURE__*/React.createElement("datalist", {id: 'dl_' + mlType + '_' + r.id},
    (masterlist[mlType] || []).map(x => /*#__PURE__*/React.createElement("option", {key: x.id, value: x.desc}))
  )), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      fontFamily: "'JetBrains Mono',monospace",
      width: 60
    },
    type: "number",
    min: 0,
    value: r.qty,
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      qty: e.target.value
    } : x))
  })), showDays && /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      fontFamily: "'JetBrains Mono',monospace",
      width: 60
    },
    type: "number",
    min: 0,
    value: r.days === undefined || r.days === null ? 1 : r.days,
    title: "Number of days this item is charged for. Leave at 1 for a one-off charge.",
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      days: e.target.value
    } : x))
  })), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("select", {
    style: {
      ...INP,
      width: 74
    },
    value: r.uom,
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      uom: e.target.value
    } : x))
  }, uomOptionEls(r.uom))), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      fontFamily: "'JetBrains Mono',monospace",
      width: 96
    },
    type: "number",
    min: 0,
    value: r.cost,
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      cost: e.target.value
    } : x))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontFamily: "'JetBrains Mono',monospace",
      color: tot > 0 ? '#F0A429' : '#7D8590',
      fontWeight: 700,
      textAlign: 'right',
      minWidth: 96
    }
  }, "P", tot.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => set(p => p.filter(x => x.id !== r.id)),
    style: {
      background: 'none',
      border: 'none',
      color: '#F85149',
      cursor: 'pointer',
      fontSize: 15,
      padding: '1px 5px'
    }
  }, "x")));
})))), /*#__PURE__*/React.createElement("div", {
  style: {
    marginTop: 10,
    borderTop: `1px solid ${'#21262D'}`,
    paddingTop: 10,
    textAlign: 'right'
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    color: '#F0A429',
    fontWeight: 700,
    fontSize: 13
  }
}, "Total: ", /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: "'JetBrains Mono',monospace"
  }
}, "P", total.toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})))));
};
