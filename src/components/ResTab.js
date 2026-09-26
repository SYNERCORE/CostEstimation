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
  showDays, /* Tools only: equipment can be charged per day (qty x days x cost) */
  /* Tools only: the CE's NO. OF DAYS, offered as the duration to charge every
     row for. A CE carries hundreds of tool rows; setting DAYS one row at a
     time is not something anyone will actually do, so the whole column can be
     set at once. */
  ceDays,
  defaultTier, /* Tools only: what a new row starts on */
  setDefaultTier,
  /* Shopworks tools only -- onsite and supply work run on the client's
     supply, so the electricity a tool draws is not ours to bill. The columns
     are shown by showPower (the CE type), NOT by the tariff being non-zero:
     a shop that sets the rate to 0 still needs somewhere to type the kW. */
  showPower,
  kwhRate,
  /* Share of a row's power that is charged (Shop + Site: its shop share). */
  pwrFrac,
  /* Tools only: reads a file to text (the Client Document reader), for
     Import list. */
  readFile,
  setKwhRate,
  /* Puts rows the Masterlist does not have yet into it, so an item met for the
     first time on a CE is there for the next one. */
  addToML
}) => {
  const _mlHas = r => {
    const d = String(r.desc || '').trim().toUpperCase();
    return !d || (masterlist[mlType] || []).some(m => String(m.desc || '').trim().toUpperCase() === d);
  };
  const _newRows = addToML ? rows.filter(r => !_mlHas(r)) : [];
  /* Days is optional per row and defaults to 1, so a row that never sets it
     costs exactly qty x cost -- existing CEs are unaffected. */
  const rowDays = r => (r.days === undefined || r.days === '' || r.days === null) ? 1 : (N(r.days) || 0);
  /* Tools carry a tier; everything else is qty x cost. toolRowCost is the same
     function the grand total, the recompute and both exports use, so the row
     total on screen cannot disagree with the CE it adds up to. */
  /* The figures a tier price is derived from, carried onto the row.

     toolRowCost prices a row from the row itself -- no masterlist is consulted,
     so a CE quoted last month cannot be repriced by an edit to the list today.
     The row therefore has to ARRIVE with what it needs. Only kW was being
     copied, so a Tier 1 row had no annual cost to divide between projects and
     a Tier 3 row none to divide between hours: both fell back to the stored
     daily rate, which is why T1 on a P1,000 tape showed P0.60 instead of
     P36.67. Sync Rates copied them and the other two paths did not, so
     re-syncing a row looked like it fixed a bug of its own. */
  const _srcFields = it => {
    const out = {};
    if (!it) return out;
    ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].forEach(k => {
      if (it[k] !== undefined && it[k] !== '' && N(it[k]) > 0) out[k] = N(it[k]);
    });
    return out;
  };
  const rowPwr = r => showPower ? toolPowerCost(r, kwhRate) * (pwrFrac ? pwrFrac(r) : 1) : 0;
  const rowTot = r => showDays ? toolRowCost(r) + rowPwr(r) : N(r.qty) * N(r.cost);
  const tierOf = r => N(r.tier) || 2;
  /* A Tier 1 or Tier 3 row with nothing to derive from is charged at the daily
     rate instead -- never at zero, because charging nothing for a tool is not
     the safer wrong answer. But it is not the price the tier names, so it says
     so on the row rather than quietly reading as a very cheap tool. */
  const tierUnderived = r => {
    const t = tierOf(r);
    if (!showDays || (t !== 1 && t !== 3)) return false;
    const rates = toolTierRates(r);
    if (!rates) return true;
    return t === 1 && rates.tier1 === null;
  };
  const [_rtNewId, _rtSetNewId] = useState(null);
  /* Import list: the rows read from a supplier's kit list, waiting to be
     checked before they go on the CE. null when nothing is being imported. */
  const [imp, setImp] = useState(null);
  const impRef = useRef(null);
  /* What "Set all" will write. Starts at whatever the rows already agree on,
     so a CE whose tools are all on 30 days opens showing 30 and the button is
     a no-op until the number is changed -- it never proposes a figure the CE
     is not already using. Falls back to the CE's own duration, then to 1. */
  const [bulkDays, setBulkDays] = useState(() => {
    const seen = {};
    (Array.isArray(rows) ? rows : []).forEach(r => { const d = rowDays(r || {}); seen[d] = (seen[d] || 0) + 1; });
    const keys = Object.keys(seen);
    if (keys.length) return keys.sort((a, b) => seen[b] - seen[a])[0];
    return String(N(ceDays) || 1);
  });
  const mlFind = d => (masterlist[mlType] || []).find(m => String(m.desc || '').trim().toUpperCase() === String(d || '').trim().toUpperCase());
  const importFile = async file => {
    if (!file) return;
    try {
      const text = await readFile(file);
      const list = parseToolList(text);
      if (!list.length) { showToast('No tool rows found in ' + file.name + '. The list needs a Description and a Qty column, or numbered lines ending in a quantity and unit.', true); return; }
      setImp({ name: file.name, rows: list.map(it => ({ ...it, id: uid(), on: true })) });
    } catch (e) {
      showToast('Could not read ' + file.name + ': ' + e.message, true);
    }
  };
  const importAdd = () => {
    const pick = imp.rows.filter(r => r.on && String(r.desc).trim());
    const tier = N(defaultTier) || 2;
    set(p => [...p, ...pick.map(r => {
      const m = mlFind(r.desc);
      return { ...mkRes(), id: uid(), desc: r.desc.trim(), qty: N(r.qty) || 1, uom: (m && m.uom) || r.uom || 'Pc',
        cost: m ? (m.cost !== undefined ? m.cost : (m.rate || 0)) : 0, ...(showDays ? { tier } : {}), ..._srcFields(m) };
    })]);
    const priced = pick.filter(r => mlFind(r.desc)).length;
    showToast(pick.length + ' tool row(s) added from ' + imp.name + '. ' + priced + ' priced from the Masterlist' +
      (pick.length > priced ? ', ' + (pick.length - priced) + ' at P0 -- type their rate, or add them to the Masterlist.' : '.'), pick.length > priced);
    setImp(null);
  };
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
}, label),
/* The tariff, on the CE rather than in a constant, for the same reason the
   shift multipliers are: an estimate keeps what it was quoted at when the
   utility puts its rate up. */
showPower && /*#__PURE__*/React.createElement("label", {
  style: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, color: 'var(--text-secondary)'
  },
  title: "Pesos per kilowatt-hour, charged on every tool with a kW rating and running hours. Set it to 0 to bill no power on this CE."
}, "Electricity", /*#__PURE__*/React.createElement("input", {
  style: {
    ...INP,
    fontFamily: "'JetBrains Mono',monospace",
    width: 72
  },
  type: "number",
  min: 0,
  step: "0.01",
  value: kwhRate,
  onChange: e => setKwhRate(e.target.value)
}), "P/kWh"), /*#__PURE__*/React.createElement("div", {
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
      cost: item.cost,
      /* Copied onto the row, not looked up later -- see the kW column. */
      ..._srcFields(item)
    }])
  })
}, "From Masterlist"), readFile && /*#__PURE__*/React.createElement("button", {
  className: 'import-tool-list',
  style: btn('info', true),
  title: "Read a tool or kit list (PDF, Excel, CSV) into rows. You check them before they are added.",
  onClick: () => impRef.current && impRef.current.click()
}, "⇪ Import list"), readFile && /*#__PURE__*/React.createElement("input", {
  ref: impRef, type: 'file', accept: '.pdf,.xlsx,.xls,.csv,.txt,.docx', style: { display: 'none' },
  onChange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; importFile(f); }
}), /*#__PURE__*/React.createElement("button", {
  style: btn('ok', true),
  title: "Update all costs to current masterlist rates",
  onClick: () => {
    const mlItems = masterlist[mlType] || [];
    let updated = 0;
    set(p => p.map(r => {
      const f = mlItems.find(m => m.desc && r.desc && m.desc.toUpperCase() === r.desc.toUpperCase());
      if (!f) return r;
      updated++;
      /* The tier source figures come across with the rate. Without them a
         Tier 1 or Tier 3 row has nothing to derive from and quietly falls back
         to the daily rate. */
      const _src = _srcFields(f);
      return {...r, ..._src, cost: f.cost !== undefined ? f.cost : (f.rate !== undefined ? f.rate : r.cost)};
    }));
    showToast(updated ? `Updated ${updated} rate(s) from masterlist.` : 'No matching items found in masterlist.', !updated);
  }
}, "↺ Sync Rates"), /*#__PURE__*/React.createElement("button", {
  style: btn('ok', true),
  title: "Set each row's unit to the Masterlist item's unit. Costs are not touched.",
  onClick: () => {
    /* Units only: a row keeps its cost, qty and days. Rows not on the
       Masterlist, or whose Masterlist item has no unit, are left alone. */
    const mlItems = masterlist[mlType] || [];
    const find = r => mlItems.find(m => m.desc && r.desc && m.desc.trim().toUpperCase() === r.desc.trim().toUpperCase());
    const n = rows.filter(r => { const m = find(r); return m && m.uom && m.uom !== r.uom; }).length;
    if (n) set(p => p.map(r => { const m = find(r); return m && m.uom && m.uom !== r.uom ? {...r, uom: m.uom} : r; }));
    showToast(n ? n + ' unit(s) updated from the Masterlist.' : 'Units already match the Masterlist.');
  }
}, "↺ Sync UOM"), showDays && /*#__PURE__*/React.createElement("span", {
  style: {display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: MT}
}, "Days:", /*#__PURE__*/React.createElement("input", {
  type: 'number', min: 0, step: 1,
  style: {...INP, width: 54, fontSize: 10, padding: '2px 4px'},
  value: bulkDays,
  title: "The number of days to charge every tool for",
  onChange: e => setBulkDays(e.target.value)
}), /*#__PURE__*/React.createElement("button", {
  style: {...btn('ok', true), fontSize: 10, padding: '2px 8px'},
  disabled: !rows.length || bulkDays === '' || !isFinite(parseFloat(bulkDays)),
  title: rows.length
    ? 'Set DAYS on all ' + rows.length + ' row(s) to ' + bulkDays + '. Quantities, tiers and costs are not touched.'
    : 'No rows to set',
  onClick: () => {
    const d = parseFloat(bulkDays);
    if (!isFinite(d) || d < 0) { showToast('Type a number of days first.', true); return; }
    /* Only the rows that would actually change are counted, so the toast says
       what happened rather than repeating the row count back. */
    const n = rows.filter(r => rowDays(r) !== d).length;
    set(p => p.map(r => ({...r, days: d})));
    showToast(n ? n + ' row(s) set to ' + d + ' day(s).' : 'Every row was already on ' + d + ' day(s).');
  }
}, "Set all"), ceDays > 0 && /*#__PURE__*/React.createElement("button", {
  style: {...btn('def', true), fontSize: 10, padding: '2px 8px'},
  title: "Use the CE's own duration — NO. OF DAYS on Project Info is " + ceDays,
  onClick: () => setBulkDays(String(ceDays))
}, "= CE (" + ceDays + ")")), _newRows.length > 0 && /*#__PURE__*/React.createElement("button", {
  style: btn('acc', true),
  title: 'Add every row not yet on the Masterlist, with its unit and unit cost: ' + _newRows.map(r => r.desc).join(', '),
  onClick: () => addToML(_newRows)
}, "\uff0b Masterlist (" + _newRows.length + ")"), showDays && /*#__PURE__*/React.createElement("span", {
  style: {display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: MT}
}, "New rows:", /*#__PURE__*/React.createElement("select", {
  style: {...INP, width: 168, fontSize: 10, padding: '2px 4px'},
  value: N(defaultTier) || 2,
  title: "How a tool added from here is charged. Rows already on the CE keep the tier they have.",
  onChange: e => setDefaultTier && setDefaultTier(N(e.target.value))
}, [[1, 'Tier 1 - per project'], [2, 'Tier 2 - per day'], [3, 'Tier 3 - per hour used']]
  .map(([v, l]) => /*#__PURE__*/React.createElement("option", {key: v, value: v}, l)))),
/*#__PURE__*/React.createElement("button", {
  style: btn('info', true),
  title: showDays
    ? "Combine repeated items into what you actually mobilise: the largest quantity any task needs, for the total number of days"
    : "Add the quantities together — a consumable used on two tasks is bought once, for the total",
  onClick: () => {
    const NL = String.fromCharCode(10);
    /* Equipment follows the crew rule: one compressor covers both tasks, so you
       hire the largest number any task needs for the whole duration. A
       consumable is used up instead, so its quantities simply add. */
    const groups = {};
    rows.forEach(r => {
      if (!r.desc) return;
      const k = String(r.desc).trim().toUpperCase() + '|' + N(r.cost);
      (groups[k] = groups[k] || []).push(r);
    });
    const dupes = Object.values(groups).filter(g => g.length > 1);
    if (!dupes.length) { showToast('No repeated items — nothing to combine.', true); return; }
    const plan = dupes.map(g => ({
      g,
      qty: showDays ? Math.max(...g.map(r => N(r.qty))) : g.reduce((a, r) => a + N(r.qty), 0),
      days: showDays ? g.reduce((a, r) => a + rowDays(r), 0) : undefined
    }));
    const preview = plan.map(p => '  ' + p.g[0].desc + ':  ' +
      p.g.map(r => N(r.qty) + (showDays ? ' x ' + rowDays(r) + 'd' : ' ' + (r.uom || ''))).join('  +  ') +
      '   ->   ' + p.qty + (showDays ? ' x ' + p.days + ' days' : ' ' + (p.g[0].uom || ''))).join(NL);
    if (!confirm('Combine ' + plan.length + ' item' + (plan.length === 1 ? '' : 's') + '?' + NL + NL + preview +
      (showDays
        ? NL + NL + 'The largest quantity any task needs, kept for the total number of days — this normally costs MORE than the rows added up, because the equipment is on hire for the whole duration.'
        : NL + NL + 'Quantities are added together. The total is unchanged.') +
      NL + NL + 'SOW Breakdown will still show each item under every task it serves.')) return;
    const drop = new Set(), patch = {};
    plan.forEach(p => {
      const keep = p.g[0];
      const shares = p.g.flatMap(r => (Array.isArray(r.shares) && r.shares.length ? r.shares
        : [{ taskId: r.taskId || '', weight: showDays ? N(r.qty) * rowDays(r) : N(r.qty) }]));
      patch[keep.id] = { qty: p.qty, ...(showDays ? { days: p.days } : {}), shares: shares.filter(x => x.taskId) };
      p.g.slice(1).forEach(r => drop.add(r.id));
    });
    set(prev => prev.filter(r => !drop.has(r.id)).map(r => patch[r.id] ? {...r, ...patch[r.id]} : r));
    showToast('Combined ' + plan.length + ' item' + (plan.length === 1 ? '' : 's') + '.' +
      (showDays ? ' The cost rose — the equipment is now charged for the whole duration.' : ' The total is unchanged.'));
  }
}, "⇊ Combine"), /*#__PURE__*/React.createElement("button", {
  style: btn('def', true),
  onClick: () => { const nid = uid(); _rtSetNewId(nid); set(p => [...p, {...mkRes(), id: nid, ...(showDays ? {tier: N(defaultTier) || 2} : {})}]); }
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
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Description', 'Qty', ...(showDays ? ['Tier', 'Days', 'Hrs'] : []), ...(showPower ? ['kW', 'Run hrs', 'Power (P)'] : []), 'UOM', 'Unit Cost (P)', 'Row Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
  key: h,
  style: THS
}, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, _ix) => {
  const tot = rowTot(r);
  return /*#__PURE__*/React.createElement("tr", {
    key: r.id
  }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
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
          uom: f.uom,
          /* Typing the name is the same as picking it, so it brings the same
             figures with it. */
          ..._srcFields(f)
        } : {})
      } : x));
    },
    placeholder: "Item description..."
  }), /*#__PURE__*/React.createElement("datalist", {id: 'dl_' + mlType + '_' + r.id},
    (masterlist[mlType] || []).map(x => /*#__PURE__*/React.createElement("option", {key: x.id, value: x.desc}))
  ), addToML && !_mlHas(r) && /*#__PURE__*/React.createElement("button", {
    style: { background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer', fontSize: 10, color: 'var(--brand-accent)', display: 'block' },
    title: 'Not on the Masterlist yet. Adds it with this unit and unit cost.',
    onClick: () => addToML([r])
  }, "\uff0b Add to Masterlist")), /*#__PURE__*/React.createElement("td", {
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
  }, /*#__PURE__*/React.createElement("select", {
    style: {
      ...INP,
      width: 64
    },
    value: tierOf(r),
    title: "1: flat per project, whatever the duration.  2: per day (the default).  3: per hour actually used.",
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      tier: N(e.target.value)
    } : x))
  }, [[1, 'T1'], [2, 'T2'], [3, 'T3']].map(([v, l]) => /*#__PURE__*/React.createElement("option", {
    key: v,
    value: v
  }, l))), tierUnderived(r) && /*#__PURE__*/React.createElement("span", {
    style: {color: ACC, fontSize: 11, marginLeft: 4, cursor: 'help'},
    title: "This row has no unit price, service life or maintenance figure, so there is no annual cost to share out -- " +
      (tierOf(r) === 1 ? "Tier 1 has nothing to divide between projects" : "Tier 3 has nothing to divide between hours") +
      ". It is being charged at the daily rate instead. Fill those figures in on the Masterlist (Tier Pricing Calculator) and press Sync Rates."
  }, "⚠")), showDays && /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      fontFamily: "'JetBrains Mono',monospace",
      width: 60,
      opacity: tierOf(r) === 2 ? 1 : .35
    },
    type: "number",
    min: 0,
    /* Only Tier 2 is charged by the day. Tier 1 ignores duration and Tier 3
       counts hours, so leaving the field live would invite an edit that
       changes nothing and reads as a bug. */
    disabled: tierOf(r) !== 2,
    value: r.days === undefined || r.days === null ? 1 : r.days,
    title: tierOf(r) === 2
      ? "Number of days this item is charged for. Leave at 1 for a one-off charge."
      : "Days apply to Tier 2 only.",
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      days: e.target.value
    } : x))
  })), showDays && /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      fontFamily: "'JetBrains Mono',monospace",
      width: 60,
      opacity: tierOf(r) === 3 ? 1 : .35
    },
    type: "number",
    min: 0,
    disabled: tierOf(r) !== 3,
    value: r.hours === undefined || r.hours === null ? '' : r.hours,
    placeholder: "0",
    title: tierOf(r) === 3
      ? "Hours the tool is actually used. This is the tier for a short job on expensive equipment."
      : "Hours apply to Tier 3 only.",
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      hours: e.target.value
    } : x))
  })),
  /* Power rating. Comes across from the Masterlist when the item is picked,
     and sits on the row from then on -- a later Masterlist edit must not
     reprice a CE that has already been quoted, the same rule the unit cost
     follows. */
  showPower && /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      fontFamily: "'JetBrains Mono',monospace",
      width: 62
    },
    type: "number",
    min: 0,
    step: "0.1",
    value: r.kw === undefined || r.kw === null ? '' : r.kw,
    placeholder: "0",
    title: "Power rating of the tool in kilowatts. Leave blank for anything that does not draw power.",
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      kw: e.target.value
    } : x))
  })),
  /* Hours the tool actually draws, typed -- not days x 8. A grinder on the
     floor for five days does not run for 120 hours, and costing it as though
     it did quotes more power than the shop consumes. Independent of the tier,
     because a Tier 1 or Tier 2 tool draws power just the same. */
  showPower && /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      fontFamily: "'JetBrains Mono',monospace",
      width: 62
    },
    type: "number",
    min: 0,
    value: r.runHrs === undefined || r.runHrs === null ? '' : r.runHrs,
    placeholder: "0",
    title: "Hours this tool actually runs -- not how long it is on the floor.",
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      runHrs: e.target.value
    } : x))
  })),
  showPower && /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontFamily: "'JetBrains Mono',monospace",
      textAlign: 'right',
      color: rowPwr(r) > 0 ? 'var(--accent-amber)' : 'var(--text-secondary)',
      whiteSpace: 'nowrap'
    },
    title: rowPwr(r) > 0
      ? N(r.qty) + ' x ' + N(r.kw) + ' kW x ' + N(r.runHrs) + ' hrs x P' + N(kwhRate) + '/kWh'
      : 'Set a kW rating and running hours to charge power on this row.'
  }, rowPwr(r) > 0 ? 'P' + rowPwr(r).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) : '--'), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("select", {
    style: {
      ...INP,
      width: 104
    },
    value: uomCase(r.uom),
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
  }),
  /* What we charged for this item before, on the row rather than three clicks
     away in the ML panel. Clicking a past rate adopts it. */
  /*#__PURE__*/React.createElement(RateHistory, {
    kind: mlType === 'materials' ? 'mats' : mlType,
    name: r.desc,
    onPick: v => set(p => p.map(x => x.id === r.id ? { ...x, cost: v } : x))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontFamily: "'JetBrains Mono',monospace",
      color: tot > 0 ? 'var(--brand-accent)' : 'var(--text-secondary)',
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
      color: 'var(--status-danger)',
      cursor: 'pointer',
      fontSize: 15,
      padding: '1px 5px'
    }
  }, "x")));
})))), /*#__PURE__*/React.createElement("div", {
  style: {
    marginTop: 10,
    borderTop: `1px solid ${'var(--border-subtle)'}`,
    paddingTop: 10,
    textAlign: 'right'
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    color: 'var(--brand-accent)',
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
})))), imp && /*#__PURE__*/React.createElement("div", {
  className: 'import-preview',
  style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  onClick: e => { if (e.target === e.currentTarget) setImp(null); }
}, /*#__PURE__*/React.createElement("div", {
  style: { ...CS, background: 'var(--bg-surface)', width: 'min(860px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }
}, /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
  /*#__PURE__*/React.createElement("b", null, "Import tool list"),
  /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: 'var(--text-secondary)' } },
    imp.name + ' -- ' + imp.rows.length + ' item(s) read, ' + imp.rows.filter(r => mlFind(r.desc)).length + ' on the Masterlist. Same items are added up. Untick what the job does not need.'),
  /*#__PURE__*/React.createElement("span", { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
    /*#__PURE__*/React.createElement("button", { style: btn('ok', true), onClick: () => setImp(p => ({ ...p, rows: p.rows.map(r => ({ ...r, on: true })) })) }, "All"),
    /*#__PURE__*/React.createElement("button", { style: btn('ok', true), onClick: () => setImp(p => ({ ...p, rows: p.rows.map(r => ({ ...r, on: false })) })) }, "None"))),
/*#__PURE__*/React.createElement("div", { style: { overflow: 'auto', flex: 1, minHeight: 0 } },
/*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse' } },
/*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null,
  ['', 'Description', 'Qty', 'UOM', 'Code', 'Masterlist rate'].map((h, i) => /*#__PURE__*/React.createElement("th", { key: i, style: { ...THS, position: 'sticky', top: 0, textAlign: i >= 2 ? 'center' : 'left' } }, h)))),
/*#__PURE__*/React.createElement("tbody", null, imp.rows.map(r => {
  const m = mlFind(r.desc);
  const upd = patch => setImp(p => ({ ...p, rows: p.rows.map(x => x.id === r.id ? { ...x, ...patch } : x) }));
  return /*#__PURE__*/React.createElement("tr", { key: r.id, style: { opacity: r.on ? 1 : 0.45 } },
    /*#__PURE__*/React.createElement("td", { style: TDS }, /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: r.on, onChange: e => upd({ on: e.target.checked }) })),
    /*#__PURE__*/React.createElement("td", { style: TDS }, /*#__PURE__*/React.createElement("input", { style: { ...INP, width: '100%', minWidth: 220 }, value: r.desc, onChange: e => upd({ desc: e.target.value }) })),
    /*#__PURE__*/React.createElement("td", { style: TDS }, /*#__PURE__*/React.createElement("input", { style: { ...INP, width: 56, textAlign: 'center' }, type: 'number', min: 0, value: r.qty, onChange: e => upd({ qty: e.target.value }) })),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'center', fontSize: 11 } }, (m && m.uom) || r.uom),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'center', fontSize: 10, color: 'var(--text-secondary)' } }, r.code || ''),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'right', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: m ? 'var(--status-success)' : 'var(--text-secondary)' } },
      m ? 'P' + N(m.cost !== undefined ? m.cost : m.rate).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : 'not on list'));
})))),
/*#__PURE__*/React.createElement("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
  /*#__PURE__*/React.createElement("button", { style: btn('def', true), onClick: () => setImp(null) }, "Cancel"),
  /*#__PURE__*/React.createElement("button", {
    style: btn('acc', true),
    disabled: !imp.rows.some(r => r.on),
    onClick: importAdd
  }, "Add " + imp.rows.filter(r => r.on).length + " row(s)")))));
};
