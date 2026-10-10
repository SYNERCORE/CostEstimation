// Resource table component for Tools / Materials / PPE tabs
// Globals used: React, useState, useRef, useEffect, CS, btn, INP, THS, TDS, N, uid, mkRes, XLSX
const ResTab = ({
  rows,
  set,
  total,
  label,
  onCalc, /* Materials only: opens the quantity calculators */
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
  /* The Masterlist is looked up once per row for the + Masterlist mark and
     again for the re-price arrow. Scanning the whole list for each of those,
     on every render, is rows x items of work per keystroke -- which is what
     made a long tab stutter as you typed. Index it once instead, keeping the
     FIRST entry for a description so the answer is the one .find gave. */
  const _mlIndex = React.useMemo(() => {
    const ix = new Map();
    (masterlist[mlType] || []).forEach(it => {
      const d = String(it.desc || '').trim().toUpperCase();
      if (d && !ix.has(d)) ix.set(d, it);
    });
    return ix;
  }, [masterlist, mlType]);
  const _mlKey = r => String((r && r.desc) || '').trim().toUpperCase();
  /* One datalist serves every row: the suggestions are the same list in each
     of them, so building it per row put the whole Masterlist into the page
     once for every line on the tab. */
  const _dlId = 'dl_' + mlType;
  const _mlHas = r => { const d = _mlKey(r); return !d || _mlIndex.has(d); };
  const _newRows = addToML ? rows.filter(r => !_mlHas(r)) : [];
  /* Import reads any Description + Qty list and prices it off the Masterlist
     for THIS tab -- nothing in it was ever specific to tools, only its
     wording was. Materials and PPE arrive as the same kind of list, so they
     get the same reader, saying what they are. */
  const _noun = { tools: 'tool', materials: 'material', ppe: 'PPE' }[mlType] || 'item';
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
    /* Which heading the row prints under on the Electrical summary sheet. A
       word, not a figure, so it cannot go through the same filter. An item
       with no group set leaves the field off: the row is a common tool by
       default either way, and not writing it keeps the default meaningful. */
    if (it.group) out.group = String(it.group);
    return out;
  };
  /* One row, re-priced from the Masterlist.
     ======================================
     Sync Rates does the whole CE at once, which is the wrong tool when a
     tab carries 671 rows and two of them have just been corrected on the
     Masterlist. Everything else on the CE was quoted at a price, and
     re-pricing it wholesale to fix two rows changes figures nobody asked
     about.

     Matched on the description, upper-cased and trimmed, which is the same
     key the whole-tab sync and the importer use -- three different ways of
     finding the same item would eventually disagree about which item it is. */
  const _mlFind = r => { const d = _mlKey(r); return d ? (_mlIndex.get(d) || null) : null; };
  const _money = v => 'P' + N(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const syncRow = async r => {
    const m = _mlFind(r);
    if (!m) {
      showToast('"' + (String(r.desc || '').trim() || 'This row') + '" is not on the Masterlist, so there is no rate to take. Add it with the + Masterlist button first.', true);
      return;
    }
    const extra = _srcFields(m);
    /* The tier figures count as a change too: a Tier 1 row whose rate happens
       to match still prices from them, so a row can need the sync while its
       cost column looks right. */
    const moved = N(m.cost) !== N(r.cost) ||
      Object.keys(extra).some(k => k !== 'group' && N(extra[k]) !== N(r[k]));
    if (!moved) { showToast('"' + r.desc + '" already matches the Masterlist.'); return; }
    /* Confirmed, because this is a price on a CE that may already be quoted,
       and the button sits beside the one that deletes the row. One line, so
       refreshing a handful of rows stays quick. */
    if (!await uiConfirm('Re-price "' + r.desc + '" from the Masterlist?' + String.fromCharCode(10, 10) +
      '   ' + _money(r.cost) + '   ->   ' + _money(m.cost) + String.fromCharCode(10, 10) +
      'Nothing else on this tab is touched. Nothing is saved until you press Save.')) return;
    set(p => p.map(x => x.id === r.id
      /* The grouping is the CE's own if it has one: re-pricing is what was
         asked for, re-grouping was not. */
      ? { ...x, cost: m.cost, ...extra, ...(x.group ? { group: x.group } : {}) }
      : x));
    showToast('"' + r.desc + '" re-priced: ' + _money(r.cost) + ' -> ' + _money(m.cost) + '.');
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
    /* Tier 4 needs only the unit price, and needs it on the row -- an entry
       with a price but no service life derives no annual cost at all, so it
       must not be asked through toolTierRates. */
    if (t === 4) return showDays && N(r.unitPrice) <= 0;
    if (!showDays || (t !== 1 && t !== 3)) return false;
    const rates = toolTierRates(r);
    if (!rates) return true;
    return t === 1 && rates.tier1 === null;
  };
  const [_rtNewId, _rtSetNewId] = useState(null);
  /* Import list: the rows read from a supplier's kit list, waiting to be
     checked before they go on the CE. null when nothing is being imported. */
  const [imp, setImp] = useState(null);
  /* Find a row in a list too long to read. 671 tools on one CE cannot be
     checked by scrolling, and the browser's own Ctrl+F finds only what is
     painted -- a row's description lives in an <input>, whose value the page
     search does not see at all. */
  const [q, setQ] = useState('');
  /* Every word has to be somewhere in the row, in any order and any case, so
     "cord 12/3" finds "Cord, Extension, M-F Plug, 12/3". Matching the whole
     phrase would find nothing, because nobody types a description the way a
     supplier wrote it. The code and the unit are searched too: a part number
     is often the only thing anyone is sure of. */
  const _terms = String(q).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const _hit = r => !_terms.length ||
    _terms.every(t => (String(r.desc || '') + ' ' + String(r.uom || '') + ' ' + String(r.code || '') + ' ' +
      String((r.src && r.src.code) || '')).toLowerCase().indexOf(t) >= 0);
  /* Only the rows near the screen are drawn. A tab with hundreds of rows put
     thousands of inputs in the page and every keystroke re-rendered them all.
     The rest are two spacer rows of the height they would have taken, so the
     scrollbar and the page length stay true. Short lists are drawn whole. */
  const _list = rows.map((r, _ix) => ({ r, _ix })).filter(x => _hit(x.r));
  const _VMIN = 60, _OVER = 12;
  const _tbRef = useRef(null);
  /* The suggestion list is the whole Masterlist -- thousands of <option>s.
     Built on every visit to the tab it was most of what switching tabs cost,
     and nobody needs it until they click into a description. So it is built
     on the first focus, and then kept (same element, so React skips it). */
  const [_dlOn, _setDlOn] = useState(false);
  const _dlEl = React.useMemo(() => _dlOn ? React.createElement("datalist", { id: _dlId },
    (masterlist[mlType] || []).map(x => React.createElement("option", { key: x.id, value: x.desc }))) : null,
    [_dlOn, masterlist, mlType]);
  /* Rows are NOT all one height: one with "+ Add to Masterlist" under its description is taller than one already on the Masterlist.
     Taking the first row's height for every row drifted by hundreds of pixels on a long list, so the drawn window and the two spacers
     landed away from the screen and the table went blank, with a stray row at the bottom, until the page was nudged. Every drawn row is
     now measured and remembered by id; the window and the spacers are sums of real heights, and a row never drawn yet counts as the
     average of those measured. */
  const _rowH = useRef(44);
  const _hMap = useRef({});
  const _hCount = useRef(0);
  const _listRef = useRef(_list); _listRef.current = _list;
  const _kickRef = useRef(null);
  const [_wv, _setWv] = useState({ a: 0, b: _VMIN, v: 0 });
  const _virt = _list.length > _VMIN;
  const _hOf = id => _hMap.current[id] || _rowH.current;
  useEffect(() => {
    if (!_virt) { _kickRef.current = null; return; }
    let raf = 0;
    const calc = () => {
      raf = 0;
      const tb = _tbRef.current; if (!tb) return;
      let sum = 0, cnt = 0;
      tb.querySelectorAll('tr[data-vr]').forEach(tr => {
        const hh = tr.offsetHeight, id = tr.getAttribute('data-rid');
        if (hh > 10) { if (_hMap.current[id] === undefined) _hCount.current++; _hMap.current[id] = hh; sum += hh; cnt++; }
      });
      if (cnt) _rowH.current = sum / cnt;
      const list = _listRef.current, vh = window.innerHeight || 800;
      /* tb's top is where the first row of the whole list starts: the top spacer is inside it. */
      let y = tb.getBoundingClientRect().top, first = -1, last = list.length;
      for (let i = 0; i < list.length; i++) {
        const hh = _hOf(list[i].r.id);
        if (first < 0 && y + hh > 0) first = i;
        if (y >= vh) { last = i; break; }
        y += hh;
      }
      if (first < 0) first = Math.max(0, list.length - 1);
      first = Math.max(0, first - _OVER); last = Math.min(list.length, last + _OVER);
      const v = _hCount.current;
      _setWv(p => (p.a === first && p.b === last && p.v === v) ? p : { a: first, b: Math.max(last, first + 1), v });
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(calc); };
    _kickRef.current = kick;
    calc();
    window.addEventListener('scroll', kick, true);
    window.addEventListener('resize', kick);
    return () => { _kickRef.current = null; window.removeEventListener('scroll', kick, true); window.removeEventListener('resize', kick); if (raf) cancelAnimationFrame(raf); };
  }, [_virt, _list.length]);
  /* After every draw, in case a row changed height (the Add to Masterlist line goes once it is added) or the filter changed the list. */
  useEffect(() => { if (_kickRef.current) _kickRef.current(); });
  let _from = 0, _to = _list.length;
  if (_virt) {
    _from = Math.min(_wv.a, Math.max(0, _list.length - 1)); _to = Math.min(_wv.b, _list.length);
    /* A row just added stays drawn so it can take focus. */
    const ni = _list.findIndex(x => x.r.id === _rtNewId);
    if (ni >= 0) { if (ni < _from) _from = ni; if (ni >= _to) _to = ni + 1; }
  }
  const _hSum = (a, b) => { let t = 0; for (let i = a; i < b; i++) t += _hOf(_list[i].r.id); return t; };
  const _vis = {
    items: _list.slice(_from, _to),
    top: _from > 0 ? React.createElement("tr", { key: '_vt', "aria-hidden": true, style: { height: _hSum(0, _from) } }, React.createElement("td", { colSpan: 30, style: { padding: 0, border: 0 } })) : null,
    bot: _to < _list.length ? React.createElement("tr", { key: '_vb', "aria-hidden": true, style: { height: _hSum(_to, _list.length) } }, React.createElement("td", { colSpan: 30, style: { padding: 0, border: 0 } })) : null
  };
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
      if (!list.length) { showToast('No ' + _noun + ' rows found in ' + file.name + '. The list needs a Description and a Qty column, or numbered lines ending in a quantity and unit.', true); return; }
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
      /* The Masterlist is the rate we stand behind, so it wins wherever the
         item is on it. Where it is not, the file's own unit price is better
         than P0 -- a 216-line consumables list none of which is on the
         Masterlist used to import entirely unpriced, and every rate had to be
         typed back in by hand from the same file it came from. */
      return { ...mkRes(), id: uid(), desc: r.desc.trim(), qty: N(r.qty) || 1, uom: (m && m.uom) || r.uom || 'Pc',
        cost: m ? (m.cost !== undefined ? m.cost : (m.rate || 0)) : (N(r.price) > 0 ? N(r.price) : 0),
        ...(showDays ? { tier } : {}), ..._srcFields(m) };
    })]);
    const priced = pick.filter(r => mlFind(r.desc)).length;
    const fromFile = pick.filter(r => !mlFind(r.desc) && N(r.price) > 0).length;
    const none = pick.length - priced - fromFile;
    showToast(pick.length + ' ' + _noun + ' row(s) added from ' + imp.name + '. ' + priced + ' priced from the Masterlist' +
      (fromFile ? ', ' + fromFile + ' from the file' : '') +
      (none ? ', ' + none + ' at P0 -- type their rate, or add them to the Masterlist.' : '.'), none > 0);
    setImp(null);
  };
  /* Out to Excel and back again.
     =============================
     A 672-row list is quicker to edit in Excel than in a browser table, and
     sales already live there. The columns written are exactly the ones
     Import XLS reads, so the file that comes out is the file that goes back
     in -- including Tier and Days, without which a round trip would silently
     reset every tool to the default tier and one day.

     Rates survive because Import XLS takes the file's Unit Cost and does not
     consult the Masterlist. That is the opposite of Import list, which is
     reading someone else's list and should be priced from ours. */
  const _rtCols = () => ['Description', 'Qty', 'UOM', 'Unit Cost', ...(showDays ? ['Tier', 'Days', 'Group'] : []), 'Code'];
  const exportXls = () => {
    if (!rows.length) { showToast('There is nothing on this tab to export.', true); return; }
    const head = _rtCols().map(h => ({ v: h, s: 'th' }));
    const body = rows.map(r => [
      String(r.desc || ''), N(r.qty) || 0, String(r.uom || ''), N(r.cost) || 0,
      ...(showDays ? [N(r.tier) || 2, rowDays(r), String(r.group || '')] : []),
      String((r.src && r.src.code) || r.code || '')
    ]);
    const name = (mlType === 'tools' ? 'BOTE' : mlType === 'materials' ? 'BOCM' : 'PPE');
    try {
      SHICXlsx.download(name + '_for_editing.xlsx',
        [{ name: name, cols: [46, 8, 10, 12, ...(showDays ? [7, 8, 12] : []), 16], rows: [head, ...body] }]);
      showToast(rows.length + ' row(s) exported. Edit in Excel, then bring it back with Import XLS.');
    } catch (ex) { showToast('Export failed: ' + ex.message, true); }
  };
  const _rtDescRef = useRef(null);
  /* The sideways scrollbar belongs to the table, so on a long list it sits at the very bottom. A second bar, pinned to the bottom of the
     window while the table is on screen, is kept in step with it: either one moves the table. It is drawn only when the table is wider
     than its box. */
  const _wrapRef = useRef(null), _barRef = useRef(null);
  const [_sw, _setSw] = useState(0);
  useEffect(() => {
    const w = _wrapRef.current;
    if (!w) return;
    const measure = () => _setSw(w.scrollWidth > w.clientWidth + 1 ? w.scrollWidth : 0);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(w);
    const t = w.querySelector('table');
    if (t) ro.observe(t);
    return () => ro.disconnect();
  }, [rows.length, showDays, showPower]);
  useEffect(() => {
    if (_rtNewId && _rtDescRef.current) { _rtDescRef.current.focus(); _rtSetNewId(null); }
  }, [_rtNewId]);
  return /*#__PURE__*/React.createElement("div", {
  style: CS
}, /*#__PURE__*/React.createElement("div", {
  /* Stays under the tab strip while a long list scrolls past, so From Masterlist, Combine, Add and the rest are always within reach. The
     negative margin and matching padding stretch it over the card's own padding, so rows do not show through at its edges. */
  className: 'res-sticky',
  style: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'sticky',
    top: 'var(--y-body)',
    zIndex: 40,
    background: 'var(--bg-surface-card)',
    margin: '-16px -16px 12px',
    padding: '16px 16px 8px',
    borderRadius: '10px 10px 0 0',
    borderBottom: '1px solid ' + BDR,
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
  /* The row of controls has grown past what one line holds, and Import XLS
     was clipped off the right edge on a laptop with no scrollbar to reach
     it -- the button was not merely off-screen, it was unreachable. It wraps
     now: a two-line toolbar is better than a control nobody can press. */
  style: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    rowGap: 6,
    alignItems: 'center'
  }
}, onCalc && /*#__PURE__*/React.createElement("button", {
  style: { ...btn('def', true), color: 'var(--brand-accent)', borderColor: 'color-mix(in srgb, var(--brand-accent) 45%, transparent)', background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)' },
  onClick: onCalc,
  title: 'Work out how much to buy for babbitt, painting or welding, and add it here'
}, "\uD83E\uDDEE Calculators"), /*#__PURE__*/React.createElement("button", {
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
  title: "Read a " + _noun + " list (PDF, Excel, CSV) into rows. You check them before they are added.",
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
}, [[1, 'Tier 1 - per project'], [2, 'Tier 2 - per day'], [3, 'Tier 3 - per hour used'], [4, 'Tier 4 - full price']]
  .map(([v, l]) => /*#__PURE__*/React.createElement("option", {key: v, value: v}, l)))),
/*#__PURE__*/React.createElement("button", {
  style: btn('info', true),
  title: showDays
    ? "Combine repeated items into what you actually mobilise: the largest quantity any task needs, for the total number of days"
    : "Add the quantities together — a consumable used on two tasks is bought once, for the total",
  onClick: async () => {
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
    if (!await uiConfirm('Combine ' + plan.length + ' item' + (plan.length === 1 ? '' : 's') + '?' + NL + NL + preview +
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
}, "+ Add"), /*#__PURE__*/React.createElement("button", {
  style: btn('def', true),
  onClick: exportXls,
  title: "Write this tab to an Excel file with the same columns Import XLS reads, so it can be edited there and brought back"
}, "📤 Export XLS"), /*#__PURE__*/React.createElement("label", {
  style: {...btn('def', true), cursor: 'pointer'},
  title: "Import from Excel — columns: Description, Qty, UOM, Unit Cost" + (showDays ? ", Tier, Days" : "")
}, "📥 Import XLS", /*#__PURE__*/React.createElement("input", {
  type: "file", accept: ".xlsx,.xls", style: {display: 'none'},
  onChange: e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), {type: 'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        /* Not `rows`: that is the tab's own rows, and shadowing it here made
           the confirm below report the file's row count as the tab's. */
        const sheetRows = XLSX.utils.sheet_to_json(ws, {defval: ''});
        const _pick = (r, ...names) => { for (const n of names) if (r[n] !== undefined && r[n] !== '') return r[n]; return undefined; };
        const imported = sheetRows.map(r => {
          /* Tier and Days come back only if the file carries them. A supplier's
             sheet has neither, and a row given tier 0 or 0 days would cost
             nothing at all -- so an absent column leaves the row on the tab's
             own defaults rather than on zero. */
          const t = _pick(r, 'Tier', 'TIER', 'tier');
          const d = _pick(r, 'Days', 'DAYS', 'days');
          return {
            ...mkRes(), id: uid(),
            desc: String(_pick(r, 'Description', 'DESCRIPTION', 'desc') || '').trim(),
            qty: Math.max(1, parseInt(_pick(r, 'Qty', 'QTY', 'qty') || 1) || 1),
            uom: String(_pick(r, 'UOM', 'uom') || 'Lot').trim(),
            cost: parseFloat(_pick(r, 'Unit Cost', 'UNIT COST', 'cost') || 0) || 0,
            ...(showDays ? {
              tier: N(t) > 0 ? N(t) : (N(defaultTier) || 2),
              ...(N(d) > 0 ? { days: N(d) } : {}),
              /* The summary bucket, by key or by the heading it prints. An
                 absent or unrecognised cell leaves the field off, which reads
                 as the default rather than overwriting a group with a guess. */
              ...(() => {
                const w = String(_pick(r, 'Group', 'GROUP', 'group') || '').trim().toLowerCase();
                const hit = TOOL_GROUPS.find(g => g.k === w || g.t.toLowerCase() === w);
                return hit ? { group: hit.k } : {};
              })()
            } : {})
          };
        }).filter(r => r.desc);
        if (!imported.length) { showToast('No valid rows found. Check columns: Description, Qty, UOM, Unit Cost', true); return; }
        /* Re-importing an edited export is the common case, and appending it
           would silently double the list. Asked rather than assumed: the
           wrong answer either way is a long list to put right by hand. */
        const replace = rows.length > 0 && await uiConfirm(
          'Replace the ' + rows.length + ' row(s) on this tab with the ' + imported.length + ' from ' + file.name + '?' +
          String.fromCharCode(10,10) + 'Replace is right after editing an export; Add keeps what is already here and puts these after it.',
          {ok: 'Replace', cancel: 'Add to existing', danger: false});
        set(p => replace ? imported : [...p, ...imported]);
        showToast(imported.length + ' row(s) ' + (replace ? 'replaced this tab' : 'added') + ' from ' + file.name + '.');
      } catch(ex) { showToast('Excel parse failed: ' + ex.message, true); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }
})))),
/* The count is the point of the box as much as the filtering is: "1 of 671"
   is the answer to "is it on here", and 0 is an answer too. */
rows.length > 0 && /*#__PURE__*/React.createElement("div", {
  style: { display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 8px' }
}, /*#__PURE__*/React.createElement("input", {
  value: q,
  onChange: e => setQ(e.target.value),
  placeholder: 'Find in ' + rows.length + ' row(s) -- description, code or unit',
  style: { ...INP, width: 300, maxWidth: '100%' }
}), q && /*#__PURE__*/React.createElement("button", {
  onClick: () => setQ(''),
  style: { background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 15, padding: '1px 5px' }
}, "x"), q && /*#__PURE__*/React.createElement("span", {
  style: { fontSize: 11, color: _list.length ? 'var(--text-secondary)' : 'var(--status-danger)' }
}, _list.length + ' of ' + rows.length + (_list.length ? '' : ' -- not on this list')),
/* The buttons above act on the whole list, not on what is shown. Saying so is
   cheaper than someone pressing Set all on a filtered view and finding it
   changed 671 rows. */
q && /*#__PURE__*/React.createElement("span", {
  style: { fontSize: 10, color: 'var(--text-secondary)', marginLeft: 'auto' }
}, 'Filtered view. The buttons above still act on all ' + rows.length + '.')),
/*#__PURE__*/React.createElement("div", {
  ref: _wrapRef,
  style: {
    overflowX: 'auto'
  },
  onScroll: e => { if (_barRef.current && _barRef.current.scrollLeft !== e.target.scrollLeft) _barRef.current.scrollLeft = e.target.scrollLeft; },
  onFocusCapture: _dlOn ? undefined : (ev => { if (ev.target && ev.target.tagName === 'INPUT') _setDlOn(true); })
}, _dlEl, /*#__PURE__*/React.createElement("table", {
  style: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12
  }
}, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Description', 'Qty', ...(showDays ? ['Tier', 'Grp', 'Days', 'Hrs'] : []), ...(showPower ? ['kW', 'Run hrs', 'Power (P)'] : []), 'UOM', 'Unit Cost (P)', 'Row Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
  key: h,
  style: THS
}, h)))), /*#__PURE__*/React.createElement("tbody", { ref: _tbRef }, _vis.top, _vis.items.map(({ r, _ix }) => {
  const tot = rowTot(r);
  return /*#__PURE__*/React.createElement("tr", {
    key: r.id, "data-vr": 1, "data-rid": r.id
  }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      minWidth: 190
    },
    ref: r.id === _rtNewId ? _rtDescRef : undefined,
    list: _dlId,
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
  }), addToML && !_mlHas(r) && /*#__PURE__*/React.createElement("button", {
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
    title: "1: flat per project, whatever the duration.  2: per day (the default).  3: per hour actually used.  4: the whole unit price, for a tool this job consumes.",
    onChange: e => set(p => p.map(x => x.id === r.id ? {
      ...x,
      tier: N(e.target.value)
    } : x))
  }, [[1, 'T1'], [2, 'T2'], [3, 'T3'], [4, 'T4']].map(([v, l]) => /*#__PURE__*/React.createElement("option", {
    key: v,
    value: v
  }, l))), tierUnderived(r) && /*#__PURE__*/React.createElement("span", {
    style: {color: ACC, fontSize: 11, marginLeft: 4, cursor: 'help'},
    title: tierOf(r) === 4
      ? "This row has no unit price, so there is no price to charge the project. It is being charged at the daily rate instead. Fill the unit price in on the Masterlist (Tier Pricing Calculator) and press Sync Rates."
      : "This row has no unit price, service life or maintenance figure, so there is no annual cost to share out -- " +
      (tierOf(r) === 1 ? "Tier 1 has nothing to divide between projects" : "Tier 3 has nothing to divide between hours") +
      ". It is being charged at the daily rate instead. Fill those figures in on the Masterlist (Tier Pricing Calculator) and press Sync Rates."
  }, "⚠")), /* Which heading the row prints under on the Electrical summary sheet.
     It arrives from the Masterlist, but a row typed straight onto the CE
     has no masterlist item behind it -- and a row can belong somewhere
     else on this job than it usually does. Abbreviated, because the row is
     already wide: the full heading is in the title and in the option. */
  showDays && /*#__PURE__*/React.createElement("td", { style: TDS },
    /*#__PURE__*/React.createElement("select", {
      style: { ...INP, width: 52, fontSize: 10, padding: "2px 2px", ...(r.group ? {} : { color: MT }) },
      value: r.group || "",
      title: "Which heading this prints under on the Electrical summary sheet: "
        + TOOL_GROUPS.map(g => g.t).join(", ") + ". Unset prints under " + TOOL_GROUPS[0].t + ".",
      onChange: e => set(p => p.map(x => x.id === r.id ? { ...x, group: e.target.value || undefined } : x))
    }, /*#__PURE__*/React.createElement("option", { value: "" }, "—"),
      TOOL_GROUPS.map(g => /*#__PURE__*/React.createElement("option", { key: g.k, value: g.k },
        g.t.split(" ")[0].slice(0, 4))))),
  showDays && /*#__PURE__*/React.createElement("td", {
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
    onClick: () => syncRow(r),
    title: _mlFind(r)
      ? 'Take the current Masterlist rate for "' + r.desc + '" — this row only'
      : 'Not on the Masterlist, so there is no rate to take',
    style: {
      background: 'none',
      border: 'none',
      color: _mlFind(r) ? 'var(--accent-info)' : 'var(--text-muted)',
      cursor: 'pointer',
      fontSize: 13,
      padding: '1px 3px',
      opacity: _mlFind(r) ? 1 : .35
    }
  }, "↻"), /*#__PURE__*/React.createElement("button", {
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
}), _vis.bot))), _sw > 0 && /*#__PURE__*/React.createElement("div", {
  ref: _barRef, className: 'res-hbar',
  title: "Scroll the table sideways",
  style: { position: 'sticky', bottom: 0, zIndex: 35, overflowX: 'auto', overflowY: 'hidden', height: 22, background: 'var(--bg-surface-card)' },
  onScroll: e => { if (_wrapRef.current && _wrapRef.current.scrollLeft !== e.target.scrollLeft) _wrapRef.current.scrollLeft = e.target.scrollLeft; }
}, /*#__PURE__*/React.createElement("div", { style: { width: _sw, height: 1 } })), /*#__PURE__*/React.createElement("div", {
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
  /*#__PURE__*/React.createElement("b", null, "Import " + _noun + " list"),
  /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: 'var(--text-secondary)' } },
    imp.name + ' -- ' + imp.rows.length + ' item(s) read, ' + imp.rows.filter(r => mlFind(r.desc)).length + ' on the Masterlist' +
    (imp.rows.filter(r => !mlFind(r.desc) && N(r.price) > 0).length ? ', ' + imp.rows.filter(r => !mlFind(r.desc) && N(r.price) > 0).length + ' priced by the file' : '') +
    '. Same items are added up. Untick what the job does not need.'),
  /*#__PURE__*/React.createElement("span", { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
    /*#__PURE__*/React.createElement("button", { style: btn('ok', true), onClick: () => setImp(p => ({ ...p, rows: p.rows.map(r => ({ ...r, on: true })) })) }, "All"),
    /*#__PURE__*/React.createElement("button", { style: btn('ok', true), onClick: () => setImp(p => ({ ...p, rows: p.rows.map(r => ({ ...r, on: false })) })) }, "None"))),
/*#__PURE__*/React.createElement("div", { style: { overflow: 'auto', flex: 1, minHeight: 0 } },
/*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse' } },
/*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null,
  ['', 'Description', 'Qty', 'UOM', 'Code', 'Unit rate'].map((h, i) => /*#__PURE__*/React.createElement("th", { key: i, style: { ...THS, position: 'sticky', top: 0, textAlign: i >= 2 ? 'center' : 'left' } }, h)))),
/*#__PURE__*/React.createElement("tbody", null, imp.rows.map(r => {
  const m = mlFind(r.desc);
  const upd = patch => setImp(p => ({ ...p, rows: p.rows.map(x => x.id === r.id ? { ...x, ...patch } : x) }));
  return /*#__PURE__*/React.createElement("tr", { key: r.id, style: { opacity: r.on ? 1 : 0.45 } },
    /*#__PURE__*/React.createElement("td", { style: TDS }, /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: r.on, onChange: e => upd({ on: e.target.checked }) })),
    /*#__PURE__*/React.createElement("td", { style: TDS }, /*#__PURE__*/React.createElement("input", { style: { ...INP, width: '100%', minWidth: 220 }, value: r.desc, onChange: e => upd({ desc: e.target.value }) })),
    /*#__PURE__*/React.createElement("td", { style: TDS }, /*#__PURE__*/React.createElement("input", { style: { ...INP, width: 56, textAlign: 'center' }, type: 'number', min: 0, value: r.qty, onChange: e => upd({ qty: e.target.value }) })),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'center', fontSize: 11 } }, (m && m.uom) || r.uom),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'center', fontSize: 10, color: 'var(--text-secondary)' } }, r.code || ''),
    /* Where the rate comes from is said on the row, because the two are not
       equally trusted: the Masterlist is a rate we have agreed, the file's is
       whatever the supplier wrote on it. */
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'right', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: m ? 'var(--status-success)' : (N(r.price) > 0 ? 'var(--brand-accent)' : 'var(--text-secondary)') } },
      m ? 'P' + N(m.cost !== undefined ? m.cost : m.rate).toLocaleString('en-PH', { minimumFractionDigits: 2 })
        : (N(r.price) > 0
          ? [/*#__PURE__*/React.createElement("span", { key: 'v' }, 'P' + N(r.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })),
             /*#__PURE__*/React.createElement("span", { key: 'l', style: { fontFamily: 'inherit', fontSize: 9, color: 'var(--text-secondary)', marginLeft: 4 } }, 'file')]
          : 'no rate')));
})))),
/*#__PURE__*/React.createElement("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
  /*#__PURE__*/React.createElement("button", { style: btn('def', true), onClick: () => setImp(null) }, "Cancel"),
  /*#__PURE__*/React.createElement("button", {
    style: btn('acc', true),
    disabled: !imp.rows.some(r => r.on),
    onClick: importAdd
  }, "Add " + imp.rows.filter(r => r.on).length + " row(s)")))));
};
