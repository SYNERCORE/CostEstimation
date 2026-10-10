/* The SOW Breakdown tab: each scope task with the manpower, tools, materials, PPE and miscellaneous charged to it, and what is still unassigned.

   Moved out of App.js unchanged. Invoked as SowBreakdownTab({...}) from the render of App, never as an element: it holds no hooks,
   and everything it reads comes in through ctx. */
function SowBreakdownTab(ctx) {
  const {
    KIT_TYPES,
    RES_TABS,
    ceType,
    delRow,
    kit,
    kitApply,
    kitItems,
    masterlist,
    mats,
    miscAdd,
    miscCats,
    miscDel,
    miscFlat,
    miscUpd,
    mp,
    ppe,
    rowCost,
    rowCostForTask,
    rowServesTask,
    rowShares,
    sbCollapsed,
    sbDlOn,
    sbPick,
    sbSearch,
    sbSel,
    sbShow,
    sbType,
    sbView,
    setKit,
    setMisc,
    setMp,
    setPicker,
    setSbCollapsed,
    setSbDlOn,
    setSbPick,
    setSbSearch,
    setSbSel,
    setSbShow,
    setSbType,
    setSbView,
    setSowItems,
    setTab,
    showToast,
    sowItems,
    sowLabels,
    sowLib,
    sowTaskGroup,
    sowUnassignedCount,
    taskCost,
    taskCostRollup,
    taskResCount,
    taskResCountRollup,
    tools,
    updRow
  } = ctx;
  /* Every open task card draws all of its resource rows. On a CE with several
     hundred that is thousands of inputs, and it is what made this tab -- and
     every click while it was open -- slow. Past 150 resources the cards start
     closed; a card the user has opened or closed keeps what they chose. */
  const _sbBig = ((mp || []).length + (tools || []).length + (mats || []).length + (ppe || []).length) > 150;
  const _sbOpen = id => sbCollapsed[id] === undefined ? !_sbBig : !sbCollapsed[id];
  const UOMS = UOM_OPTIONS;
  /* Split view: a task list beside ONE task's resources, one type at a time. List view is the stacked cards this tab has always had. */
  const split = sbView !== 'list';
  const IND = split ? 6 : 128; /* the resource tables sit under the group label in List view, and flush in Split */
  const named = t => t.rows.filter(r => r[t.nameKey]);
  const _miscNamed = miscFlat().filter(r => r.desc);
  /* A row counts as unassigned if it has no task OR points at a task that no
     longer exists -- otherwise a dangling link would hide the row from both the
     task cards and the Unassigned list, making it uneditable here. */
  const validTaskIds = new Set((sowItems || []).map(s => s.id));
  const isUnassigned = r => !r.taskId || !validTaskIds.has(r.taskId);
  const totalNamed = RES_TABS.reduce((s, t) => s + named(t).length, 0) + _miscNamed.length;
  const assignedNamed = totalNamed - (RES_TABS.reduce((s, t) => s + named(t).filter(isUnassigned).length, 0) + _miscNamed.filter(isUnassigned).length);

  /* Add a row already tagged with this task. */
  const addTo = (t, taskId, fromML) => {
    if (fromML) setPicker({ type: t.ml, onSelect: item => t.set(p => [...p, t.mk(item, taskId)]) });
    else t.set(p => [...p, t.mk(null, taskId)]);
  };

  /* Copy every resource of another task onto this one. */
  const copyFrom = (srcId, dstId) => {
    RES_TABS.forEach(t => t.set(p => {
      const clones = p.filter(r => r.taskId === srcId).map(r => ({ ...r, id: uid(), taskId: dstId }));
      return clones.length ? [...p, ...clones] : p;
    }));
    setMisc(p => {
      const n = { ...p };
      Object.keys(n).forEach(k => {
        if (!Array.isArray(n[k])) return;
        const clones = n[k].filter(r => r.taskId === srcId).map(r => ({ ...r, id: uid(), taskId: dstId }));
        if (clones.length) n[k] = [...n[k], ...clones];
      });
      return n;
    });
    showToast('Resources copied.');
  };

  /* Shared cell renderers so every group lines up in the same columns. */
  const numCell = (val, onChange, title, w) => /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: w || 58 } },
    /*#__PURE__*/React.createElement("input", {
      style: { ...INP, ...MONO, width: (w || 58) - 8, fontSize: 11, padding: '2px 4px', textAlign: 'right' },
      type: 'number', min: 0, step: 'any', value: val === 0 ? '' : val, title: title, placeholder: '0',
      onChange: onChange
    }));
  const hdr = cols => /*#__PURE__*/React.createElement("thead", null,
    /*#__PURE__*/React.createElement("tr", null, cols.map((c, i) => /*#__PURE__*/React.createElement("th", {
      key: i,
      style: { ...THS, textAlign: i === 0 ? 'left' : 'right', width: c[1] || undefined, fontSize: 9, padding: '2px 4px', paddingLeft: i === 0 ? IND : 4 }
    }, c[0]))));

  /* One resource group (Manpower / Tools / Consumables / PPE) inside a task card. */
  const SB_PAGE = 100;
  /* A task holding hundreds of rows draws the first page and says how many it
     is holding back; drawing them all is what made the tab unusable. */
  const _moreRow = (n, lim, k) => n > lim ? /*#__PURE__*/React.createElement("tr", { key: '_more' },
    /*#__PURE__*/React.createElement("td", { colSpan: 8, style: { ...TDS, paddingLeft: IND, color: MT, fontSize: 10.5 } },
      'Showing ' + lim + ' of ' + n + '.  ',
      /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => setSbShow(p => ({ ...p, [k]: lim + SB_PAGE })) }, 'Show ' + Math.min(SB_PAGE, n - lim) + ' more'),
      ' ',
      /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => setSbShow(p => ({ ...p, [k]: n })) }, 'Show all'))) : null;
  const group = (t, taskId) => {
    /* A consolidated row serves several tasks, so it is listed under each of
       them -- carrying the slice of its cost that this task asked for. */
    const rows = t.rows.filter(r => rowServesTask(r, taskId));
    if (!rows.length) return null;
    const isMp = t.key === 'mp';
    const hasDays = isMp || t.key === 'tools'; /* tools are charged qty x days x cost */
    const _lim = sbShow[taskId + '|' + t.key] || SB_PAGE;
    return /*#__PURE__*/React.createElement("div", { key: t.key, style: { marginBottom: 6 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', minWidth: split ? 0 : 128 } }, t.label),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(t, taskId, true) }, "+ Masterlist"),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(t, taskId, false) }, "+ Blank"),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 10, color: MT }, title: t.label + " subtotal for this task" },
          "₱" + ph(rows.reduce((a, r) => a + rowCostForTask(t.key, r, taskId), 0)))
      ),
      sbDlOn && /*#__PURE__*/React.createElement("datalist", { id: 'sb_ml_' + t.ml },
        ((masterlist && masterlist[t.ml]) || []).map(x => /*#__PURE__*/React.createElement("option", { key: x.id, value: x[t.nameKey] || x.desc || x.role || '' }))),
      /*#__PURE__*/React.createElement("table", { onFocusCapture: sbDlOn ? undefined : (() => setSbDlOn(true)), style: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 2 } },
        hdr([['Item description'], [isMp ? 'Pax' : 'Qty', 58], ...(hasDays ? [['Days', 56]] : []), ...(isMp ? [] : [['UOM', 66]]), [isMp ? 'Rate' : 'Unit cost', 92], ['Cost', 92], ['', 56]]),
        /*#__PURE__*/React.createElement("tbody", null, rows.slice(0, _lim).map(r =>
          /*#__PURE__*/React.createElement("tr", { key: r.id },
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, paddingLeft: IND } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' },
                value: r[t.nameKey] || '', placeholder: "Type or pick from the Masterlist...",
                list: 'sb_ml_' + t.ml,
                /* Picking a Masterlist name brings its rate and unit, as on the resource tabs. */
                onChange: e => { const v = e.target.value;
                  const f = ((masterlist && masterlist[t.ml]) || []).find(x => (x[t.nameKey] || x.desc || x.role) === v);
                  t.set(p => p.map(x => x.id !== r.id ? x : {...x, [t.nameKey]: v, ...(f ? {[t.costKey]: N(f[t.costKey] != null ? f[t.costKey] : (f.cost != null ? f.cost : f.rate)), ...(!isMp && f.uom ? {uom: f.uom} : {}),
                    ...['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].reduce((o, k) => { if (N(f[k]) > 0) o[k] = N(f[k]); return o; }, {})} : {})})); }
              }),
              /* One consolidated crew shown under each task it serves. Without
                 this the same row appearing in two places, at two different
                 costs, would look like a duplicate rather than a share. */
              /* The same role is on several shifts; say which one this is. */
              isMp && /*#__PURE__*/React.createElement("div", {
                className: 'sb-shift-tag',
                style: { fontSize: 9.5, color: MT, marginTop: 2 }
              }, (SHIFTS[r.shift || 'regular_day'] || {}).label || r.shift),
              rowShares(r) && /*#__PURE__*/React.createElement("div", {
                style: { fontSize: 9.5, color: INFO, marginTop: 2 },
                title: "One consolidated row costed once and split between the tasks that need it. Editing it here changes it everywhere."
              }, "shared crew across " + rowShares(r).length + " tasks · costed once at ₱" + ph(rowCost(t.key, r)))
            ),
            numCell(r[t.qtyKey] || 0, e => updRow(t.set, r.id, t.qtyKey, N(e.target.value)), isMp ? 'PAX' : 'QTY', 58),
            /* Store the raw value like the resource tabs do, so a cleared field
               is treated as 1 by resDays rather than zeroing the row. */
            hasDays && numCell(r.days === undefined || r.days === null ? 1 : r.days,
              e => updRow(t.set, r.id, 'days', e.target.value),
              isMp ? 'Number of days' : 'Days charged (1 = one-off)', 56),
            !isMp && /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 66 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: 58, fontSize: 10, padding: '2px 4px' },
                value: r.uom || '', list: "shic-uom-list", placeholder: "UOM",
                onChange: e => updRow(t.set, r.id, 'uom', e.target.value)
              })
            ),
            numCell(r[t.costKey] || 0, e => updRow(t.set, r.id, t.costKey, N(e.target.value)), isMp ? 'Daily rate' : 'Cost per unit', 92),
            /*#__PURE__*/React.createElement("td", {
              style: { ...TDS, ...MONO, width: 92, textAlign: 'right', color: MT, fontSize: 10 },
              title: rowShares(r)
                ? "This task's share of a consolidated row costing ₱" + ph(rowCost(t.key, r)) + " in total"
                : "Row cost (recomputed)"
            }, "₱" + ph(rowCostForTask(t.key, r, taskId))),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 56, textAlign: 'right' } },
              /*#__PURE__*/React.createElement("button", {
                title: "Unassign from this task (keeps the row in the " + t.label + " tab)",
                style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 12, padding: '0 3px' },
                onClick: () => updRow(t.set, r.id, 'taskId', '')
              }, "↩"),
              /*#__PURE__*/React.createElement("button", {
                title: "Delete this row entirely",
                style: { background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 13, padding: '0 3px' },
                onClick: () => delRow(t.set, r.id)
              }, "×")
            )
          )
        ), _moreRow(rows.length, _lim, taskId + '|' + t.key))
      )
    );
  };

  /* Miscellaneous group -- same columns, but spans the misc categories. */
  const miscGroup = taskId => {
    const rows = miscFlat().filter(r => rowServesTask(r, taskId));
    if (!rows.length) return null;
    return /*#__PURE__*/React.createElement("div", { key: 'misc', style: { marginBottom: 6 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', minWidth: split ? 0 : 128 } }, "Miscellaneous"),
        /*#__PURE__*/React.createElement("select", {
          style: { ...INP, width: 150, fontSize: 10, padding: '2px 4px' }, value: '',
          onChange: e => { if (e.target.value) miscAdd(e.target.value, taskId, null); }
        },
          /*#__PURE__*/React.createElement("option", { value: '' }, "+ add to category..."),
          miscCats.map(c => /*#__PURE__*/React.createElement("option", { key: c.k, value: c.k }, c.label))
        ),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 10, color: MT }, title: "Miscellaneous subtotal for this task" },
          "₱" + ph(rows.reduce((a, r) => a + rowCost('misc', r), 0)))
      ),
      sbDlOn && /*#__PURE__*/React.createElement("datalist", { id: 'sb_ml_misc' },
        ((masterlist && masterlist.vehicles) || []).map(x => /*#__PURE__*/React.createElement("option", { key: x.id, value: x.desc || '' }))),
      /*#__PURE__*/React.createElement("table", { onFocusCapture: sbDlOn ? undefined : (() => setSbDlOn(true)), style: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 2 } },
        hdr([['Item description'], ['Qty', 58], ['UOM', 66], ['Unit cost', 92], ['Cost', 92], ['', 56]]),
        /*#__PURE__*/React.createElement("tbody", null, rows.map(r =>
          /*#__PURE__*/React.createElement("tr", { key: r.id },
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, paddingLeft: IND } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' },
                value: r.desc || '', placeholder: r._catLabel + " item — type or pick...",
                list: 'sb_ml_misc',
                onChange: e => { const v = e.target.value; const f = ((masterlist && masterlist.vehicles) || []).find(x => x.desc === v);
                  setMisc(p => ({ ...p, [r._cat]: (p[r._cat] || []).map(x => x.id !== r.id ? x : {...x, desc: v, ...(f ? {cost: N(f.cost != null ? f.cost : f.rate), ...(f.uom ? {uom: f.uom} : {})} : {})}) })); }
              })
            ),
            numCell(r.qty || 0, e => miscUpd(r._cat, r.id, 'qty', N(e.target.value)), 'QTY', 58),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 66 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: 58, fontSize: 10, padding: '2px 4px' },
                value: r.uom || '', list: "shic-uom-list", placeholder: "UOM",
                onChange: e => miscUpd(r._cat, r.id, 'uom', e.target.value)
              })
            ),
            numCell(r.cost || 0, e => miscUpd(r._cat, r.id, 'cost', N(e.target.value)), 'Cost per unit', 92),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, width: 92, textAlign: 'right', color: MT, fontSize: 10 } }, "₱" + ph(rowCost('misc', r))),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 56, textAlign: 'right' } },
              /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, color: MT, marginRight: 4 }, title: "Miscellaneous category" }, r._catLabel),
              /*#__PURE__*/React.createElement("button", {
                title: "Unassign from this task (keeps the row in the Miscellaneous tab)",
                style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 12, padding: '0 3px' },
                onClick: () => miscUpd(r._cat, r.id, 'taskId', '')
              }, "↩"),
              /*#__PURE__*/React.createElement("button", {
                title: "Delete this row entirely",
                style: { background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 13, padding: '0 3px' },
                onClick: () => miscDel(r._cat, r.id)
              }, "×")
            )
          )
        ))
      )
    );
  };

  /* Empty groups collapse into one "Add:" line so a task card stays compact. */
  const addLine = taskId => {
    const emptyTabs = RES_TABS.filter(t => !t.rows.some(r => r.taskId === taskId));
    const miscEmpty = !miscFlat().some(r => r.taskId === taskId);
    if (!emptyTabs.length && !miscEmpty) return null;
    return /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 4, paddingTop: 5, borderTop: `1px dashed ${BDR}` } },
      /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: MT, minWidth: 30 } }, "Add:"),
      /* Adds a blank row so the group appears immediately -- from there the
         group header offers "+ Masterlist" too. Going straight to the picker
         here would strand the user if they cancelled it. */
      emptyTabs.map(t => /*#__PURE__*/React.createElement("button", {
        key: t.key, style: { ...btn('def', true), fontSize: 10 },
        title: "Add a " + t.label + " row to this task",
        onClick: () => addTo(t, taskId, false)
      }, "+ " + t.label)),
      miscEmpty && /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 140, fontSize: 10, padding: '2px 4px' }, value: '',
        onChange: e => { if (e.target.value) miscAdd(e.target.value, taskId, null); }
      },
        /*#__PURE__*/React.createElement("option", { value: '' }, "+ Miscellaneous..."),
        miscCats.map(c => /*#__PURE__*/React.createElement("option", { key: c.k, value: c.k }, c.label))
      )
    );
  };

  /* ── Bulk assign ── */
  const selKey = (kind, key, id) => kind + ':' + key + ':' + id;
  const selCount = Object.keys(sbSel).length;
  const toggleSel = (kind, key, id, on) => setSbSel(p => {
    const n = { ...p }, k = selKey(kind, key, id);
    if (on) n[k] = { kind, key, id }; else delete n[k];
    return n;
  });
  const bulkAssign = taskId => {
    Object.values(sbSel).forEach(d => {
      if (d.kind === 'res') { const t = RES_TABS.find(x => x.key === d.key); if (t) updRow(t.set, d.id, 'taskId', taskId); }
      else miscUpd(d.key, d.id, 'taskId', taskId);
    });
    showToast(selCount + ' row' + (selCount === 1 ? '' : 's') + ' assigned.');
    setSbSel({});
  };

  const q = sbSearch.trim().toLowerCase();
  const matches = txt => !q || String(txt || '').toLowerCase().includes(q);
  const unassigned = RES_TABS.map(t => ({ t, rows: t.rows.filter(r => isUnassigned(r) && r[t.nameKey] && matches(r[t.nameKey])) })).filter(x => x.rows.length);
  const unassignedMisc = miscFlat().filter(r => isUnassigned(r) && r.desc && matches(r.desc));
  const shownUnassigned = unassigned.reduce((s, x) => s + x.rows.length, 0) + unassignedMisc.length;
  const allShown = [].concat(
    ...unassigned.map(x => x.rows.map(r => ({ kind: 'res', key: x.t.key, id: r.id }))),
    unassignedMisc.map(r => ({ kind: 'misc', key: r._cat, id: r.id }))
  );
  const allSelected = shownUnassigned > 0 && allShown.every(d => sbSel[selKey(d.kind, d.key, d.id)]);

  const taskOptions = (sowItems || []).map(it => /*#__PURE__*/React.createElement("option", { key: it.id, value: it.id }, (sowLabels[it.id] || '') + "  " + (it.text || '(untitled)').slice(0, 60)));

  /* One row in the Unassigned list. */
  const unRow = (d, name, qty, uom, onAssign) => /*#__PURE__*/React.createElement("tr", { key: d.id },
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 26, textAlign: 'center' } },
      /*#__PURE__*/React.createElement("input", {
        type: 'checkbox', checked: !!sbSel[selKey(d.kind, d.key, d.id)],
        onChange: e => toggleSel(d.kind, d.key, d.id, e.target.checked)
      })
    ),
    /*#__PURE__*/React.createElement("td", { style: TDS }, name),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, width: 58, textAlign: 'right', color: MT } }, qty || ''),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 66, color: MT, fontSize: 10 } }, uom || ''),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 230 } },
      /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' }, value: '',
        onChange: e => { if (e.target.value) onAssign(e.target.value); }
      }, /*#__PURE__*/React.createElement("option", { value: '' }, "— assign to task —"), taskOptions)
    )
  );

  /* One scope task: its header, its resources and its breakdown note. List view stacks one of these per task; Split view draws the selected one. */
  const card = (it, inSplit) => {
      const n = taskResCount(it.id);
      const cost = taskCost(it.id);
      const grp = sowTaskGroup(it);
      const hasSubs = grp.length > 1;
      const rollN = hasSubs ? taskResCountRollup(it) : n;
      const rollCost = hasSubs ? taskCostRollup(it) : cost;
      const open = inSplit ? true : _sbOpen(it.id);
      const others = (sowItems || []).filter(o => o.id !== it.id && taskResCount(o.id) > 0);
      return /*#__PURE__*/React.createElement("div", {
        key: it.id,
        style: { ...CS, marginBottom: 8, borderColor: rollN ? alpha(OK, '33') : BDR, marginLeft: it.type === 'sub' && !inSplit ? 18 : 0, padding: open ? undefined : '8px 12px', ...(inSplit ? { border: 'none', background: 'transparent', padding: 0, marginBottom: 0 } : {}) }
      },
        /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: open ? 8 : 0 } },
          !inSplit && /*#__PURE__*/React.createElement("button", {
            title: open ? "Collapse" : "Expand",
            style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11, padding: 0, width: 14 },
            onClick: () => setSbCollapsed(p => ({ ...p, [it.id]: open }))
          }, open ? "▾" : "▸"),
          /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: ACC, fontWeight: 700, fontSize: 12 } }, sowLabels[it.id] || ''),
          /*#__PURE__*/React.createElement("span", {
            style: { fontWeight: it.type === 'main' ? 700 : 400, fontSize: it.type === 'main' ? 12 : 11.5, cursor: inSplit ? 'default' : 'pointer' },
            onClick: inSplit ? undefined : () => setSbCollapsed(p => ({ ...p, [it.id]: open }))
          }, it.text || /*#__PURE__*/React.createElement("i", { style: { color: MT } }, "(untitled task)")),
          /* The service this item is restated under on the CE's services
             summary. Main items only: a sub-item goes where its parent goes. */
          it.type === 'main' && /*#__PURE__*/React.createElement("input", {
            list: 'svc-groups',
            style: { ...INP, width: 170, fontSize: 10.5, padding: '2px 6px' },
            value: it.group || '',
            placeholder: "Service group…",
            title: "Service group for the Services summary on the CE (e.g. WELDING WORKS). Items with the same group print as one line; sub-items follow their main item.",
            onChange: e => { const v = e.target.value; setSowItems(p => p.map(x => x.id === it.id ? { ...x, group: v } : x)); }
          }),
          /* Shop + Site CEs: where this task is done. Site earns the Incentive;
             Shop is charged the tools' power. Sub-items follow their main item. */
          it.type === 'main' && ceSplitOn(ceType) && /*#__PURE__*/React.createElement("button", {
            className: 'shopsite-toggle',
            style: { ...INP, width: 'auto', fontSize: 10.5, padding: '2px 8px', cursor: 'pointer', fontWeight: 700,
              color: it.work === 'shop' ? INFO : OK, borderColor: it.work === 'shop' ? INFO : OK },
            title: it.work === 'shop'
              ? "Shop work: no Incentive for these days; the tools' power is charged. Click for Site."
              : "Site work: the Incentive is paid for these days; no tool power is charged. Click for Shop.",
            onClick: () => setSowItems(p => p.map(x => x.id === it.id ? { ...x, work: x.work === 'shop' ? 'site' : 'shop' } : x))
          }, it.work === 'shop' ? "🏭 Shop" : "🏗 Site"),
          /*#__PURE__*/React.createElement("span", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 } },
            /* Collapsed cards hide the note, so flag that one exists. */
            String(it.note || '').trim() && /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: INFO }, title: String(it.note).trim() }, "📝"),
            rollCost > 0 && /*#__PURE__*/React.createElement("span", { style: { ...MONO, fontSize: 11, fontWeight: 700, color: ACC },
              title: hasSubs ? "Total cost of this task and its " + (grp.length - 1) + " sub-task" + (grp.length === 2 ? '' : 's')
                             : "Total cost of the resources assigned to this task" }, "₱" + ph(rollCost)),
            /* When a parent carries resources of its own, show them separately so
               the rolled-up figure above is never mistaken for its own line items. */
            hasSubs && cost > 0 && /*#__PURE__*/React.createElement("span", { style: { ...MONO, fontSize: 10, color: MT }, title: "Charged directly to this task, before its sub-tasks" }, "(own ₱" + ph(cost) + ")"),
            /*#__PURE__*/React.createElement("span", {
              style: { fontSize: 10, color: rollN ? OK : MT, background: (rollN ? OK : MT) + '18', borderRadius: 8, padding: '1px 7px', whiteSpace: 'nowrap' },
              title: hasSubs ? "Resource rows on this task and its sub-tasks" : undefined
            }, rollN ? rollN + " resource" + (rollN === 1 ? '' : 's') + (hasSubs ? " incl. sub-tasks" : '') : "no resources"),
            open && /*#__PURE__*/React.createElement("button", {
              className: 'sb-kit-btn', style: { ...btn('def', true), fontSize: 10, color: ACC, borderColor: ACC },
              title: "Fill this task from a Scope Library service: its manpower, tools, consumables, PPE and miscellaneous",
              onClick: () => setKit({ task: it.id, svc: '', q: '', cat: 'All', mult: 1, off: {} })
            }, "Fill from kit"),
            open && others.length > 0 && /*#__PURE__*/React.createElement("select", {
              style: { ...INP, width: 132, fontSize: 10, padding: '2px 4px' }, value: '',
              title: "Copy all resources from another task into this one",
              onChange: e => { if (e.target.value) copyFrom(e.target.value, it.id); }
            },
              /*#__PURE__*/React.createElement("option", { value: '' }, "copy from..."),
              others.map(o => /*#__PURE__*/React.createElement("option", { key: o.id, value: o.id }, (sowLabels[o.id] || '') + "  " + (o.text || '(untitled)').slice(0, 40)))
            )
          )
        ),
        open && (inSplit ? splitBody(it.id) : [RES_TABS.map(t => group(t, it.id)), miscGroup(it.id), addLine(it.id)]),

        /* Why this task is broken down the way it is. Kept on the scope item
           itself so it travels with the task -- copy, reorder and delete all
           carry it -- and printed with the CE notes so the reviewer sees the
           reasoning next to the number it explains. */
        open && /*#__PURE__*/React.createElement("div", { style: { marginTop: 10, borderTop: `1px solid ${BDR}`, paddingTop: 8 } },
          /*#__PURE__*/React.createElement("div", { style: { ...LBL, marginBottom: 4 } }, "Breakdown note"),
          /*#__PURE__*/React.createElement("textarea", {
            style: { ...INP, height: 46, resize: 'vertical', fontSize: 11.5 },
            value: it.note || '',
            placeholder: "How this task was costed — assumptions, crew mix, why the quantities are what they are...",
            onChange: e => { const v = e.target.value; setSowItems(p => p.map(s => s.id === it.id ? { ...s, note: v } : s)); }
          }),
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 10, marginTop: 3 } },
            "Appears in Notes / Remarks and on the printed CE, labelled ", /*#__PURE__*/React.createElement("b", null, "Scope " + (sowLabels[it.id] || '')), ".")
        )
      );
  };

  /* Resources not yet linked to a task, with the bulk-assign bar. A section under the cards in List view; one entry in the task list in Split view. */
  const unPanel = (sowUnassignedCount > 0) && /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: '#F59E0B44', marginTop: 12 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 } },
        /*#__PURE__*/React.createElement("div", { style: { fontWeight: 700, fontSize: 12 } }, "Unassigned resources"),
        /*#__PURE__*/React.createElement("input", {
          style: { ...INP, width: 190, fontSize: 11, padding: '3px 8px', marginLeft: 'auto' },
          value: sbSearch, placeholder: "Filter by description...",
          onChange: e => setSbSearch(e.target.value)
        }),
        sbSearch && /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => setSbSearch('') }, "✕")
      ),
      /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 11, marginBottom: 8 } },
        "These are costed in the totals but not linked to a scope task. Tick several and assign them in one go — they will then be removed together with that task."),

      /* Bulk bar */
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, padding: '6px 8px', background: SURF, borderRadius: 6 } },
        /*#__PURE__*/React.createElement("label", { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', userSelect: 'none' } },
          /*#__PURE__*/React.createElement("input", {
            type: 'checkbox', checked: allSelected,
            onChange: e => setSbSel(() => {
              if (!e.target.checked) return {};
              const n = {};
              allShown.forEach(d => { n[selKey(d.kind, d.key, d.id)] = d; });
              return n;
            })
          }),
          "Select all" + (sbSearch ? " shown (" + shownUnassigned + ")" : "")
        ),
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: selCount ? ACC : MT, fontWeight: selCount ? 700 : 400 } }, selCount + " selected"),
        /*#__PURE__*/React.createElement("select", {
          style: { ...INP, width: 230, fontSize: 11, padding: '2px 6px', marginLeft: 'auto', opacity: selCount ? 1 : .5 },
          value: '', disabled: !selCount,
          onChange: e => { if (e.target.value) bulkAssign(e.target.value); }
        }, /*#__PURE__*/React.createElement("option", { value: '' }, selCount ? "— assign " + selCount + " selected to... —" : "— select rows first —"), taskOptions),
        selCount > 0 && /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => setSbSel({}) }, "Clear")
      ),

      shownUnassigned === 0 && /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 11, fontStyle: 'italic' } }, "Nothing matches \"" + sbSearch + "\"."),

      unassigned.map(({ t, rows }) => /*#__PURE__*/React.createElement("div", { key: t.key, style: { marginBottom: 8 } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 } }, t.label + " (" + rows.length + ")"),
        /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
          /*#__PURE__*/React.createElement("tbody", null, (t.key === 'mp'
            /* Manpower by shift: a day line-up and a night line-up list the
               same roles, and without the shift they read as duplicates. A
               whole shift can be ticked, or filed to a task, at once. */
            ? Object.keys(SHIFTS).concat([...new Set(rows.map(r => r.shift || 'regular_day'))].filter(k => !SHIFTS[k]))
                .map(sk => ({ sk, g: rows.filter(r => (r.shift || 'regular_day') === sk) })).filter(x => x.g.length)
                .reduce((out, { sk, g }) => {
                  const ds = g.map(r => ({ kind: 'res', key: 'mp', id: r.id }));
                  const allOn = ds.every(d => sbSel[selKey(d.kind, d.key, d.id)]);
                  out.push(/*#__PURE__*/React.createElement("tr", { key: 'sh_' + sk, className: 'sb-shift-group' },
                    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'center', background: SURF } },
                      /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: allOn, title: 'Tick every ' + ((SHIFTS[sk] || {}).label || sk) + ' row',
                        onChange: e => setSbSel(p => { const n = { ...p }; ds.forEach(d => { const k = selKey(d.kind, d.key, d.id); if (e.target.checked) n[k] = d; else delete n[k]; }); return n; }) })),
                    /*#__PURE__*/React.createElement("td", { colSpan: 3, style: { ...TDS, background: SURF, fontWeight: 700, fontSize: 10.5, color: INFO } },
                      ((SHIFTS[sk] || {}).label || sk) + ' — ' + g.length + ' row' + (g.length === 1 ? '' : 's') + ', ' + g.reduce((a, r) => a + N(r.pax), 0) + ' pax'),
                    /*#__PURE__*/React.createElement("td", { style: { ...TDS, background: SURF } },
                      /*#__PURE__*/React.createElement("select", {
                        style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' }, value: '',
                        onChange: e => { const v = e.target.value; if (!v) return; const ids = new Set(g.map(r => r.id));
                          setMp(p => p.map(x => ids.has(x.id) ? { ...x, taskId: v } : x));
                          setSbSel(p => { const n = { ...p }; ds.forEach(d => delete n[selKey(d.kind, d.key, d.id)]); return n; }); }
                      }, /*#__PURE__*/React.createElement("option", { value: '' }, "— assign whole shift to —"), taskOptions))));
                  g.forEach(r => out.push(unRow({ kind: 'res', key: t.key, id: r.id }, r[t.nameKey], N(r[t.qtyKey]), 'PAX/S', v => updRow(t.set, r.id, 'taskId', v))));
                  return out;
                }, [])
            : rows.map(r =>
            unRow({ kind: 'res', key: t.key, id: r.id }, r[t.nameKey], N(r[t.qtyKey]), t.key === 'mp' ? 'PAX/S' : r.uom,
              v => updRow(t.set, r.id, 'taskId', v))
          )))
        )
      )),

      unassignedMisc.length > 0 && /*#__PURE__*/React.createElement("div", { style: { marginBottom: 8 } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 } }, "Miscellaneous (" + unassignedMisc.length + ")"),
        /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
          /*#__PURE__*/React.createElement("tbody", null, unassignedMisc.map(r =>
            unRow({ kind: 'misc', key: r._cat, id: r.id }, r.desc, N(r.qty), r.uom,
              v => miscUpd(r._cat, r.id, 'taskId', v))
          ))
        )
      )
    );

  /* ── Split view ── */
  const _items = sowItems || [];
  let pick = sbPick;
  if (pick !== '__un' && !_items.some(x => x.id === pick)) pick = _items[0] ? _items[0].id : '__un';
  if (pick === '__un' && !sowUnassignedCount && _items.length) pick = _items[0].id;
  const typeInfo = taskId => RES_TABS.map(t => {
    const rows = t.rows.filter(r => rowServesTask(r, taskId));
    return { key: t.key, label: t.label, t, n: rows.length, cost: rows.reduce((a, r) => a + rowCostForTask(t.key, r, taskId), 0) };
  }).concat((() => {
    const rows = miscFlat().filter(r => rowServesTask(r, taskId));
    return { key: 'misc', label: 'Miscellaneous', n: rows.length, cost: rows.reduce((a, r) => a + rowCost('misc', r), 0) };
  })());
  /* A type with nothing on this task yet: the add buttons, in place of the old "Add:" line. */
  const emptyType = (cur, taskId) => cur.key === 'misc'
    ? /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', color: MT, fontSize: 11 } }, "No miscellaneous on this task yet.",
        /*#__PURE__*/React.createElement("select", {
          style: { ...INP, width: 150, fontSize: 10, padding: '2px 4px' }, value: '',
          onChange: e => { if (e.target.value) miscAdd(e.target.value, taskId, null); }
        }, /*#__PURE__*/React.createElement("option", { value: '' }, "+ add to category..."), miscCats.map(c => /*#__PURE__*/React.createElement("option", { key: c.k, value: c.k }, c.label))))
    : /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', color: MT, fontSize: 11 } }, "No " + cur.label + " on this task yet.",
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(cur.t, taskId, true) }, "+ Masterlist"),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(cur.t, taskId, false) }, "+ Blank"));
  const splitBody = taskId => {
    const info = typeInfo(taskId);
    const cur = info.find(x => x.key === sbType) || info[0];
    return [
      /*#__PURE__*/React.createElement("div", { key: 'types', style: { display: 'flex', gap: 5, flexWrap: 'wrap', margin: '10px 0 6px' } }, info.map(x => /*#__PURE__*/React.createElement("button", {
        key: x.key, className: 'sb-type', 'data-on': x.key === cur.key ? '1' : '0',
        style: { ...btn('def', true), fontSize: 11, borderRadius: 8, padding: '3px 10px', color: x.key === cur.key ? ACC : MT, borderColor: x.key === cur.key ? ACC : BDR, background: x.key === cur.key ? alpha(ACC, '14') : 'transparent' },
        title: x.label + (x.n ? ' - subtotal ₱' + ph(x.cost) : ' - none yet'),
        onClick: () => setSbType(x.key)
      }, x.label, /*#__PURE__*/React.createElement("span", { style: { marginLeft: 5, fontSize: 10, opacity: .85 } }, x.n ? x.n + ' · ₱' + ph(x.cost) : '0')))),
      /*#__PURE__*/React.createElement("div", { key: 'cur' }, cur.n
        ? (cur.key === 'misc' ? miscGroup(taskId) : group(cur.t, taskId))
        : emptyType(cur, taskId))
    ];
  };
  const railItem = it => {
    const grp = sowTaskGroup(it), hasSubs = grp.length > 1;
    const rn = hasSubs ? taskResCountRollup(it) : taskResCount(it.id), rc = hasSubs ? taskCostRollup(it) : taskCost(it.id);
    const on = pick === it.id;
    return /*#__PURE__*/React.createElement("div", {
      key: it.id, className: 'sb-ri', 'data-on': on ? '1' : '0', onClick: () => setSbPick(it.id),
      style: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', paddingLeft: it.type === 'sub' ? 22 : 10, cursor: 'pointer', lineHeight: 1.3,
        background: on ? alpha(ACC, '18') : 'transparent', boxShadow: on ? 'inset 3px 0 0 ' + ACC : 'none' }
    },
      /*#__PURE__*/React.createElement("span", { style: { width: 8, height: 8, borderRadius: '50%', flex: 'none', background: rn ? OK : BDR } }),
      /*#__PURE__*/React.createElement("span", { style: { flex: 1, minWidth: 0 } },
        /*#__PURE__*/React.createElement("span", { style: { display: 'block', fontSize: 11.5, fontWeight: it.type === 'main' ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, title: it.text || '' },
          /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: ACC, marginRight: 5 } }, sowLabels[it.id] || ''), it.text || /*#__PURE__*/React.createElement("i", { style: { color: MT } }, "(untitled)")),
        /*#__PURE__*/React.createElement("span", { style: { display: 'block', fontSize: 10, color: MT } },
          rn ? '₱' + ph(rc) + ' · ' + rn + (it.type === 'main' && ceSplitOn(ceType) && it.work === 'shop' ? ' · Shop' : '') + (String(it.note || '').trim() ? ' · note' : '') : 'no resources')));
  };
  const splitView = () => /*#__PURE__*/React.createElement("div", { className: 'sb-split' },
    /*#__PURE__*/React.createElement("div", { className: 'sb-rail' },
      sowUnassignedCount > 0 && /*#__PURE__*/React.createElement("div", {
        className: 'sb-ri', 'data-on': pick === '__un' ? '1' : '0', onClick: () => setSbPick('__un'),
        style: { margin: '2px 8px 6px', padding: '6px 9px', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 11.5,
          background: alpha('#F59E0B', '22'), color: '#F59E0B', boxShadow: pick === '__un' ? '0 0 0 1.5px #F59E0B88' : 'none' }
      }, /*#__PURE__*/React.createElement("span", null, "Unassigned"), /*#__PURE__*/React.createElement("span", null, sowUnassignedCount)),
      _items.map(railItem)),
    /* On a narrow window the list becomes this menu. */
    /*#__PURE__*/React.createElement("select", {
      className: 'sb-pick', value: pick, style: { ...INP, width: '100%', fontSize: 11.5, padding: '4px 8px', marginBottom: 8 },
      onChange: e => setSbPick(e.target.value)
    }, sowUnassignedCount > 0 && /*#__PURE__*/React.createElement("option", { value: '__un' }, "Unassigned (" + sowUnassignedCount + ")"),
      _items.map(it => /*#__PURE__*/React.createElement("option", { key: it.id, value: it.id }, (sowLabels[it.id] || '') + "  " + (it.text || '(untitled)').slice(0, 60)))),
    /*#__PURE__*/React.createElement("div", { className: 'sb-pane' },
      pick === '__un' ? unPanel : (() => { const it = _items.find(x => x.id === pick); return it ? card(it, true) : null; })()));


  /* ── Fill from kit: pick a Scope Library service, preview what it brings, tick what to keep, add it to ONE task. ── */
  const kitPanel = () => {
    if (!kit) return null;
    const lib = sowLib || [];
    const svc = kit.svc ? lib.find(s => s.id === kit.svc) : null;
    const cats = ['All', ...[...new Set(lib.map(s => s.cat).filter(Boolean))].sort()];
    const q = String(kit.q || '').trim().toLowerCase();
    const hits = lib.filter(s => (kit.cat === 'All' || s.cat === kit.cat) && (!q || String(s.title || '').toLowerCase().includes(q) || String(s.cat || '').toLowerCase().includes(q)));
    const nRes = s => ['mp', 'tools', 'mats', 'ppe', 'misc'].reduce((a, k) => a + (s[k] || []).filter(r => (typeof r === 'string' ? r : r && (r.name || r.role || r.desc))).length, 0);
    const rows = svc ? kitItems(svc, kit.task, kit.mult) : [];
    const take = rows.filter(x => !x.dup && !kit.off[x.key]);
    const upd = patch => setKit(p => ({ ...p, ...patch }));
    const tog = key => setKit(p => ({ ...p, off: { ...p.off, [key]: !p.off[key] } }));
    const taskIt = (sowItems || []).find(x => x.id === kit.task);
    const chip = on => ({ ...btn('def', true), fontSize: 10, borderRadius: 8, padding: '1px 8px', color: on ? ACC : MT, borderColor: on ? ACC : BDR, background: on ? alpha(ACC, '14') : 'transparent' });
    return /*#__PURE__*/React.createElement("div", {
      className: 'sb-kit', style: { position: 'fixed', inset: 0, background: '#000b', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
      onClick: () => setKit(null)
    }, /*#__PURE__*/React.createElement("div", { style: { ...CS, width: 'min(860px,100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', marginBottom: 0 }, onClick: ev => ev.stopPropagation() },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
        /*#__PURE__*/React.createElement("b", { style: { fontSize: 14 } }, "Fill task " + (sowLabels[kit.task] || '') + " from a kit"),
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: MT, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, taskIt ? taskIt.text : ''),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 11 }, title: "Close", onClick: () => setKit(null) }, "✕")),
      /*#__PURE__*/React.createElement("div", { className: 'sb-kit-body', style: { display: 'flex', gap: 12, flex: 1, minHeight: 0, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("div", { style: { flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '58vh' } },
          /*#__PURE__*/React.createElement("input", { style: { ...INP, width: '100%', fontSize: 12, marginBottom: 6 }, placeholder: "Search the Scope Library...", value: kit.q, onChange: e => upd({ q: e.target.value }) }),
          /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 } }, cats.map(c => /*#__PURE__*/React.createElement("button", { key: c, style: chip(kit.cat === c), onClick: () => upd({ cat: c }) }, c))),
          /*#__PURE__*/React.createElement("div", { style: { overflowY: 'auto', flex: 1 } },
            hits.slice(0, 80).map(s => {
              const on = kit.svc === s.id;
              return /*#__PURE__*/React.createElement("div", { key: s.id, onClick: () => upd({ svc: s.id, off: {} }),
                style: { cursor: 'pointer', border: '1px solid ' + (on ? ACC : BDR), background: on ? alpha(ACC, '14') : 'transparent', borderRadius: 8, padding: '6px 8px', marginBottom: 4 } },
                /*#__PURE__*/React.createElement("div", { style: { fontSize: 12, fontWeight: 700 } }, s.title),
                /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, color: MT } }, (s.cat || '') + ' · ' + (s.scope || []).filter(x => String(x).trim()).length + ' steps · ' + nRes(s) + ' resources'));
            }),
            hits.length > 80 && /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, color: MT, padding: 4 } }, "Showing 80 of " + hits.length + ". Narrow the search."),
            !hits.length && /*#__PURE__*/React.createElement("div", { style: { fontSize: 11, color: MT, padding: 8 } }, lib.length ? "No service matches." : "The Scope Library is empty."))),
        /*#__PURE__*/React.createElement("div", { style: { flex: '1.5 1 320px', minWidth: 0, maxHeight: '58vh', overflowY: 'auto' } },
          !svc ? /*#__PURE__*/React.createElement("div", { style: { fontSize: 11, color: MT, padding: 8 } }, "Pick a service on the left to preview what it will add.")
          : !rows.length ? /*#__PURE__*/React.createElement("div", { style: { fontSize: 11, color: MT, padding: 8 } }, svc.title + " has no resources listed in the Scope Library.")
          : [/*#__PURE__*/React.createElement("div", { key: 'h', style: { fontSize: 11, color: MT, marginBottom: 6 } }, "Preview of what will be added. Untick anything you don't need. Steps are flattened onto this one task."),
            KIT_TYPES.map(([tk, tl]) => {
              const g = rows.filter(x => x.type === tk);
              if (!g.length) return null;
              return /*#__PURE__*/React.createElement("div", { key: tk, style: { border: '1px solid ' + BDR, borderRadius: 8, marginBottom: 8, overflow: 'hidden' } },
                /*#__PURE__*/React.createElement("div", { style: { background: alpha(ACC, '10'), padding: '3px 8px', fontSize: 11, fontWeight: 700 } }, tl + ' (' + g.length + ')'),
                g.map(x => /*#__PURE__*/React.createElement("label", { key: x.key, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', fontSize: 12, cursor: x.dup ? 'default' : 'pointer', opacity: x.dup ? .55 : 1 } },
                  /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: !x.dup && !kit.off[x.key], disabled: x.dup, onChange: () => tog(x.key) }),
                  /*#__PURE__*/React.createElement("span", { style: { flex: 1, minWidth: 0 } }, x.name),
                  x.dup && /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: MT } }, "already on this task"),
                  !x.dup && x.noRate && /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: '#F59E0B' }, title: "Not in the Masterlist, so it arrives with no rate. Set one in the table." }, "no rate"),
                  /*#__PURE__*/React.createElement("span", { style: { ...MONO, fontSize: 11, color: MT } }, x.type === 'mp' ? x.qty + ' pax' + (x.days ? ' · ' + x.days + ' d' : '') : x.qty + (x.uom ? ' ' + x.uom : '')))));
            })])),
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: MT } }, "Quantity"),
        /*#__PURE__*/React.createElement("input", { type: 'number', min: 1, max: 20, style: { ...INP, width: 56, fontSize: 12 }, value: kit.mult, title: "Multiplies every quantity in the kit",
          onChange: e => upd({ mult: Math.max(1, Math.min(20, Math.floor(Number(e.target.value)) || 1)) }) }),
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: MT, flex: 1 } }, svc ? 'Rates from the Masterlist · ' + take.length + ' of ' + rows.length + ' rows will be added' : ''),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 11 }, onClick: () => setKit(null) }, "Cancel"),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('acc', true), fontSize: 11 }, onClick: kitApply }, svc ? 'Add ' + take.length + ' resource' + (take.length === 1 ? '' : 's') + ' to task ' + (sowLabels[kit.task] || '') : 'Add to task'))));
  };

  return /*#__PURE__*/React.createElement("div", null,
    /* Shared UOM suggestions for every input in this tab */
    /*#__PURE__*/React.createElement("datalist", { id: "shic-uom-list" }, UOMS.map(u => /*#__PURE__*/React.createElement("option", { key: u, value: u }))),

    /* Intro / status */
    /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: alpha(INFO, '44'), marginBottom: 10 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("div", { style: { minWidth: 240, flex: 1 } },
          /*#__PURE__*/React.createElement("div", { style: { fontWeight: 700, fontSize: 13 } }, "SOW Breakdown"),
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 11, marginTop: 2 } },
            "Assign the manpower, tools, consumables, PPE and miscellaneous items each scope task needs. Edits here change the resource tabs directly — this is the same data, grouped by task.")
        ),
        /*#__PURE__*/React.createElement("span", { style: { display: 'inline-flex', border: `1px solid ${BDR}`, borderRadius: 8, overflow: 'hidden' } },
          [['split', 'Split'], ['list', 'List']].map(([k, lbl]) => /*#__PURE__*/React.createElement("button", {
            key: k, className: 'sb-view', 'data-on': (split ? 'split' : 'list') === k ? '1' : '0',
            title: k === 'split' ? "A task list beside one task's resources" : "Every task as a stacked card",
            style: { ...btn('def', true), fontSize: 11, border: 'none', borderRadius: 0, background: (split ? 'split' : 'list') === k ? alpha(ACC, '22') : 'transparent', color: (split ? 'split' : 'list') === k ? ACC : MT },
            onClick: () => setSbView(k)
          }, lbl))),
        !split && (sowItems || []).length > 1 && /*#__PURE__*/React.createElement("button", {
          style: { ...btn('def', true), fontSize: 10 },
          onClick: () => {
            const allOpen = (sowItems || []).every(it => _sbOpen(it.id));
            const n = {};
            (sowItems || []).forEach(it => { n[it.id] = allOpen; });
            setSbCollapsed(n);
          }
        }, (sowItems || []).every(it => _sbOpen(it.id)) ? "Collapse all" : "Expand all"),
        /*#__PURE__*/React.createElement("div", { style: { textAlign: 'right' } },
          /*#__PURE__*/React.createElement("div", { style: { ...MONO, fontSize: 15, fontWeight: 700, color: assignedNamed === totalNamed && totalNamed > 0 ? OK : ACC } }, assignedNamed + " / " + totalNamed),
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 10 } }, "resources assigned")
        )
      )
    ),

    /* No scope yet */
    (sowItems || []).length === 0 && /*#__PURE__*/React.createElement("div", { style: { ...CS, textAlign: 'center', color: MT, fontSize: 12 } },
      /*#__PURE__*/React.createElement("div", { style: { marginBottom: 8 } }, "No scope tasks yet — add them in the Scope of Work tab first."),
      /*#__PURE__*/React.createElement("button", { style: btn('acc', true), onClick: () => setTab('sow') }, "Go to Scope of Work")
    ),

    /* Groups already typed on this CE, offered back so one service is not
       spelled three ways and printed as three lines. */
    /*#__PURE__*/React.createElement("datalist", { id: 'svc-groups' },
      [...new Set((sowItems || []).map(x => String(x.group || '').trim()).filter(Boolean))].map(g => /*#__PURE__*/React.createElement("option", { key: g, value: g }))),
    /* One card per scope task */
    !split && (sowItems || []).map(it => card(it, false)),
    split && (sowItems || []).length > 0 && splitView(),
    split && (sowItems || []).length === 0 && unPanel,

    /* Unassigned rows — existing CEs start here, and this is how you file them */
    split ? null : unPanel,
    kitPanel()
  );
}
