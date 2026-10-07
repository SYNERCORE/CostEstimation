/* The Scope Library tab: the service list, the editor for one service, import/export and the SharePoint wizard.

   Moved out of App.js unchanged. Invoked as ScopeLibraryTab({...}) from the render of App, never as an element: it holds no state or hooks,
   and everything it reads comes in through ctx. */
function ScopeLibraryTab(ctx) {
  const {
    _editDraft,
    _editSvc,
    _libCat,
    _libSearch,
    _resTab,
    _setEditDraft,
    _setEditSvc,
    _setLibCat,
    _setLibSearch,
    _setResTab,
    cacheSowLib,
    masterlist,
    newRowId,
    newRowNameRef,
    saveSowLib,
    setNewRowId,
    setShowSpWiz,
    setSowLib,
    setSpWizBusy,
    setSpWizLog,
    showSpWiz,
    showToast,
    sowLib,
    spWizBusy,
    spWizLog
  } = ctx;

    /* These live on App, not here. ScopeLibraryEditor is a closure created
       fresh on every App render, so React sees a NEW component type each time
       and remounts it -- wiping any state held locally. That is why adding a
       service never opened its editor: startEdit ran, saveSowLib re-rendered
       App, and the remount threw the selection away. Hence "go to the bottom,
       click Edit, come back up". */
    const [libSearch, setLibSearch] = [_libSearch, _setLibSearch];
    const [libCat, setLibCat] = [_libCat, _setLibCat];
    const [editSvc, setEditSvc] = [_editSvc, _setEditSvc];
    const [editDraft, setEditDraft] = [_editDraft, _setEditDraft];
    const [resTab, setResTab] = [_resTab, _setResTab];

    const spConnected = !!(USE_SP || getSiteURL());
    const spPublish = async () => {
      setSpWizBusy(true);
      setSpWizLog('Publishing scope library to SharePoint…');
      try {
        /* dbSaveSowLib answers with {sp, adopted, reason} now, not a boolean --
           a truthy object would have reported every failure as a success. */
        const res = await dbSaveSowLib(sowLib);
        if (res && res.sp) {
          const kept = (res.adopted || []).length;
          if (kept) { const merged = [...res.adopted, ...sowLib]; setSowLib(merged); cacheSowLib(merged); }
          setSpWizLog('✅ Published successfully! All users will see the updated library.' +
            (kept ? ' ' + kept + ' service' + (kept === 1 ? '' : 's') + ' already on the site ' +
              (kept === 1 ? 'was' : 'were') + ' kept and added to your copy.' : ''));
        } else setSpWizLog('⚠️ Saved to local storage only' +
          (res && res.reason ? ' — ' + res.reason : ' (SP not connected)') + '.');
      } catch(e) { setSpWizLog('❌ Error: ' + e.message); }
      setSpWizBusy(false);
    };
    const spPull = async () => {
      setSpWizBusy(true);
      setSpWizLog('Loading scope library from SharePoint…');
      try {
        const lib = await dbGetSowLib();
        if (lib && lib.length) { setSowLib(lib); cacheSowLib(lib); setSpWizLog('✅ Loaded ' + lib.length + ' services from SharePoint.'); }
        else setSpWizLog('⚠️ No data found on SharePoint yet. Publish first.');
      } catch(e) { setSpWizLog('❌ Error: ' + e.message); }
      setSpWizBusy(false);
    };
    const spSetupList = async () => {
      setSpWizBusy(true);
      setSpWizLog('Creating SharePoint list…');
      try {
        const tok = await getSPToken({ interactive: true });
        if (!tok) throw new Error('Not authenticated. Log in first.');
        const {digest} = await spDigest();
        const wasCreated = await spCreateList(spList('SowLib'), tok, digest);
        if (wasCreated) {
          await spAddField(spList('SowLib'), 'shicData', 3, tok, digest);
          setSpWizLog('✅ List "' + spList('SowLib') + '" created. You can now Publish.');
        } else {
          setSpWizLog('✅ List already exists. You can Publish.');
        }
      } catch(e) { setSpWizLog('❌ ' + e.message); }
      setSpWizBusy(false);
    };
    const cats = ['All', ...[...new Set(sowLib.map(s => s.cat))].sort()];
    const filtered = sowLib.filter(s => {
      const matchCat = libCat === 'All' || s.cat === libCat;
      const q = libSearch.toLowerCase();
      return matchCat && (!q || s.title.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q));
    });

    /* Normalise a resource list: accept string[] or {code,cat,name,cost,uom}[] */
    /* A row with no unit of its own: a person is counted in days, PPE in pieces, everything else by the lot. */
    const dfltUom = type => type === 'mp' ? 'Day' : type === 'ppe' ? 'Pcs' : 'Lot';
    const normalise = (arr, type) => {
      const a = Array.isArray(arr) ? arr : arr || [];
      return a.map(r => {
        if (typeof r === 'string') {
          const ml = (type === 'mp' ? masterlist.manpower : type === 'tools' ? masterlist.tools : type === 'mats' ? masterlist.materials : masterlist.ppe) || [];
          const match = ml.find(m => (m.role || m.desc || '').toUpperCase() === r.toUpperCase());
          return {
            id: uid(),
            code: match ? match.code || '' : '',
            cat: match ? match.category || 'General' : 'General',
            name: r,
            qty: 1,
            cost: match ? match.rate || match.cost || 0 : 0,
            uom: match ? match.uom || dfltUom(type) : dfltUom(type)
          };
        }
        return {
          id: uid(),
          code: r.code || '',
          cat: r.cat || 'General',
          name: r.name || r.role || r.desc || '',
          qty: r.qty || 1,
          cost: r.cost || r.rate || 0,
          uom: r.uom || dfltUom(type),
          /* Blank means "on site for the whole project", which is what every
             service written before this did -- apply stamped the project's day
             count onto every row. A number means this role is only needed for
             that many days of its step. */
          days: Number.isFinite(Number(r.days)) && Number(r.days) > 0 ? Number(r.days) : '',
          miscCat: r.miscCat || 'requirements',
          /* Which scope step needs this. Stored as an index into `scope`;
             every service written before this existed has none, so it parks on
             step 1 rather than disappearing. */
          step: Number.isFinite(r.step) ? r.step : 0
        };
      });
    };
    const serialise = (rows, isMisc) => rows.map(r => r.name ? (
      {name: r.name, qty: r.qty || 1, step: Number.isFinite(r.step) ? r.step : 0,
       /* The unit, cost, code and category picked in the editor are kept: they used to be dropped here, so every row came back as Lot at 0. */
       ...(r.uom ? {uom: r.uom} : {}), ...(Number(r.cost) > 0 ? {cost: Number(r.cost)} : {}),
       ...(r.code ? {code: r.code} : {}), ...(r.cat && r.cat !== 'General' && !isMisc ? {cat: r.cat} : {}),
       ...(Number(r.days) > 0 ? {days: Number(r.days)} : {}),
       ...(isMisc ? {miscCat: r.miscCat || 'requirements'} : {})}
    ) : null).filter(Boolean);
    /* Scope rows carry a stable id for the whole edit, and every resource
       points at one by id rather than by position -- otherwise deleting step 1
       would silently move every resource under it to whatever took its place. */
    const mkScopeRows = svc => (svc.scope || []).map((t, i) => ({
      id: 'sr' + i + '_' + uid(),
      type: i === 0 || !String(t).match(/^[a-z]\./i) ? 'main' : 'sub',
      text: t
    }));
    const startEdit = svc => {
      const rows = mkScopeRows(svc);
      const toId = arr => arr.map(r => ({ ...r, step: (rows[r.step] || rows[0] || {}).id || '' }));
      setEditSvc(svc);
      setEditDraft({
        ...svc,
        scope: [...(svc.scope || [])],
        scopeRows: rows,
        mp: toId(normalise(svc.mp, 'mp')),
        tools: toId(normalise(svc.tools, 'tools')),
        mats: toId(normalise(svc.mats, 'mats')),
        ppe: toId(normalise(svc.ppe, 'ppe')),
        misc: toId(normalise(svc.misc, 'mats')).map(r => ({ ...r, cat: r.miscCat }))
      });
      setResTab('mp');
    };
    const cancelEdit = () => {
      setEditSvc(null);
      setEditDraft(null);
    };
    const saveEdit = () => {
      /* Blank steps are dropped on save, so the index a resource points at must
         be its position in the KEPT rows, not in the edited list. */
      const kept = (editDraft.scopeRows || []).filter(r => String(r.text || '').trim());
      const idx = {};
      kept.forEach((r, i) => { idx[r.id] = i; });
      const toIdx = arr => (arr || []).map(r => ({ ...r, step: idx[r.step] !== undefined ? idx[r.step] : 0 }));
      const saved = {
        ...editDraft,
        scope: kept.map(r => r.text),
        mp: serialise(toIdx(editDraft.mp)),
        tools: serialise(toIdx(editDraft.tools)),
        mats: serialise(toIdx(editDraft.mats)),
        ppe: serialise(toIdx(editDraft.ppe)),
        misc: serialise(toIdx(editDraft.misc).map(r => ({ ...r, miscCat: r.cat || 'requirements' })), true)
      };
      delete saved.scopeRows;
      saveSowLib(sowLib.map(s => s.id === saved.id ? saved : s));
      setEditSvc(null);
      setEditDraft(null);
      showToast('Service updated.');
    };
    const delSvc = async id => {
      if (!await uiConfirm('Delete this service?')) return false;
      /* Named, so SharePoint removes this one and leaves alone anything else it
         has that this browser has not seen yet. */
      saveSowLib(sowLib.filter(s => s.id !== id), {deleted: [id]});
      showToast('Deleted.');
      return true;
    };
    const addSvc = () => {
      const blank = {
        id: uid(),
        code: sowLib.reduce((m, s) => Math.max(m, svcNum(s)), 0) + 1,
        cat: 'On-Site Services',
        title: 'New Service',
        scope: ['Describe the scope here.'],
        mp: [],
        tools: [],
        mats: [],
        ppe: [],
        misc: []
      };
      /* At the TOP. It used to be appended, so a new service landed below 131
         others: you scrolled to the bottom to find it, and back up to the
         editor to fill it in, for every single edit. */
      saveSowLib([blank, ...sowLib]);
      startEdit(blank);
      showToast('New service added — it is the first one in the list.');
    };
    /* Merge-on-save left every replaced service in SharePoint alongside the
       one that replaced it, so a library imported over another shows both.
       Loading now keeps one of each, but the extra rows are still on the site
       until something writes over them -- this is that something, on purpose
       and with a count, rather than as a side effect of editing a service. */
    const dedupeLib = async () => {
      const key = s => String(s.cat || '').toUpperCase().trim() + '|' + String(s.title || '').toUpperCase().trim();
      const seen = {};
      const kept = [];
      const droppedIds = [];
      /* Later wins: the newest import is the one worth keeping. */
      [...sowLib].reverse().forEach(s => {
        const k = key(s);
        if (seen[k]) { droppedIds.push(s.id); return; }
        seen[k] = true;
        kept.unshift(s);
      });
      const dropped = droppedIds.length;
      if (!dropped) { showToast('No duplicates — every service is listed once.'); return; }
      if (!await uiConfirm('Remove ' + dropped + ' duplicate service' + (dropped === 1 ? '' : 's') + '?\n\n' +
        kept.length + ' will remain. Where two services share a category and title, the more recently imported one is kept.')) return;
      saveSowLib(kept, {deleted: droppedIds});
      showToast('Removed ' + dropped + ' duplicate' + (dropped === 1 ? '' : 's') + ' — ' + kept.length + ' services remain.');
    };
    const resetLib = async () => {
      if (!await uiConfirm('Reset to defaults? All custom changes will be lost.')) return;
      /* This list and nothing else -- the one caller besides Import-replace
         that genuinely means to rewrite the whole library. */
      saveSowLib(window.SOW_LIBRARY, {replace: true});
      showToast('Library reset to defaults.');
    };
    const allCats = [...new Set(sowLib.map(s => s.cat))].sort();

    /* Resource table for one type (mp/tools/mats/ppe) */
    const ResEditor = ({
      rows,
      setRows,
      type,
      /* When the caller groups rows by scope step it passes the other steps and
         a mover, so a row can be re-filed without deleting and retyping it.
         Every service written before per-step storage has all its resources on
         step 1, and this is how they get where they belong. */
      steps,
      onMoveStep
    }) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      const mlMap = {
        mp: masterlist.manpower,
        tools: masterlist.tools,
        mats: masterlist.materials,
        ppe: masterlist.ppe
      };
      const mlItems = mlMap[type] || [];
      const catOpts = type === 'mp' ? ['Electrical', 'Mechanical', 'Civil', 'General'] : type === 'ppe' ? ['General', 'Welding', 'Electrical', 'Mechanical'] : type === 'tools' ? TOOL_CATEGORIES : type === 'mats' ? MATERIAL_CATEGORIES : ['Electrical', 'Mechanical', 'Civil', 'General'];
      /* Updater form, not a new array built from props: two edits landing in one
         React batch both read the same rendered snapshot, so the second would
         quietly undo the first. Callers that only accept an array still work --
         `apply` falls back to the rows this render was given. */
      const apply = fn => setRows(prev => fn(Array.isArray(prev) ? prev : safeRows));
      const addRow = () => {
        const newId = uid();
        setNewRowId(newId);
        apply(rs => [...rs, {
          id: newId,
          code: '',
          cat: type === 'misc' ? 'requirements' : 'General',
          name: '',
          qty: 1,
          cost: 0,
          uom: type === 'mp' ? 'Day' : 'Lot'
        }]);
      };
      const upd = (id, k, v) => apply(rs => rs.map(r => r.id === id ? {
        ...r,
        [k]: v
      } : r));
      const del = id => apply(rs => rs.filter(r => r.id !== id));
      const autoFill = (id, name) => {
        const m = mlItems.find(x => (x.role || x.desc || '').toUpperCase() === name.toUpperCase());
        /* Same updater rule as upd/del: typing a name that matches the
           masterlist fires this in the same batch as the keystroke itself, and
           the array form put the row back to what it was before the keystroke. */
        if (m) apply(rs => rs.map(r => r.id === id ? {
          ...r,
          name,
          code: m.code || r.code,
          cat: m.category || r.cat,
          cost: m.rate || m.cost || r.cost,
          uom: m.uom || r.uom
        } : r));else apply(rs => rs.map(r => r.id === id ? {
          ...r,
          name
        } : r));
      };
      return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 8
        }
      }, /*#__PURE__*/React.createElement("button", {
        style: btn('def', true),
        onClick: addRow
      }, "+ Add Row")), safeRows.length === 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: 'center',
          padding: '14px 0',
          color: MT,
          fontSize: 12,
          border: `1px dashed ${BDR}`,
          borderRadius: 6
        }
      }, "No items. Click \"+ Add Row\"."), safeRows.length > 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          overflowX: 'auto'
        }
      }, /*#__PURE__*/React.createElement("table", {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 11
        }
      }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Item Code', 'Category', 'Role / Description', type === 'mp' ? 'Pax' : 'Qty', 'Cost (PHP)', 'UOM'].concat(type === 'mp' ? ['Days'] : []).concat(steps && steps.length > 1 ? ['Step'] : []).concat(['']).map(h => /*#__PURE__*/React.createElement("th", {
        key: h,
        style: {
          ...THS,
          fontSize: 9
        }
      }, h)))), /*#__PURE__*/React.createElement("tbody", null, safeRows.map((r, _ix) => /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 100,
          fontSize: 10
        },
        value: r.code || '',
        placeholder: "SHIC-XX-000",
        onChange: e => upd(r.id, 'code', e.target.value)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 110
        },
        /* First alphabetically is not a sensible default. With four
           categories it barely showed; with nineteen, an uncategorised
           material reads as an abrasive. Fall back to General where the
           list has one. */
        value: r.cat || (catOpts.indexOf('General') >= 0 ? 'General' : catOpts[0]),
        onChange: e => upd(r.id, 'cat', e.target.value)
        /* Same as the masterlist: a row carrying a category this list no longer
           offers keeps it rather than showing an empty dropdown. Tools moved off
           Electrical / Mechanical / General, so every older row is in exactly
           that position. */
      }, [...(r.cat && catOpts.indexOf(r.cat) < 0 ? [r.cat] : []), ...catOpts]
        .map(c => /*#__PURE__*/React.createElement("option", {
        key: c
      }, c)))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 170
        },
        ref: r.id === newRowId ? newRowNameRef : undefined,
        list: 'slr_' + type,
        value: r.name || '',
        onChange: e => autoFill(r.id, e.target.value),
        placeholder: type === 'mp' ? 'Role / position...' : 'Item description...'
      }),
      /* One suggestion list per table, not one per row: the options are the
         same list in every line, so a long tab was building the whole
         Masterlist into the page once for each of them -- which is what made
         moving onto a long tab stall. */
      _ix === 0 && /*#__PURE__*/React.createElement("datalist", {
        id: 'slr_' + type
      }, mlItems.map(m => /*#__PURE__*/React.createElement("option", {
        key: m.id,
        value: m.role || m.desc
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {...INP, ...MONO, width: 52},
        min: 1, intOnly: true,
        value: r.qty || 1,
        onCommit: v => upd(r.id, 'qty', v),
        title: "Quantity of this item per service application"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 90
        },
        min: 0,
        value: r.cost || 0,
        onCommit: v => upd(r.id, 'cost', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 68
        },
        value: uomCase(r.uom || 'Day'),
        onChange: e => upd(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Day'))), type === 'mp' && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: { ...INP, ...MONO, width: 62, fontSize: 10 },
        min: 0, allowBlank: true, value: r.days === undefined || r.days === null ? '' : r.days,
        placeholder: "full",
        title: "Days this role is needed for THIS step. Leave blank if they report from day 1 to completion — then the project's No. of Days is used, which is what every service did before this existed.",
        onCommit: v => upd(r.id, 'days', v)
      })), steps && steps.length > 1 && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 74, fontSize: 10 },
        value: r.step || '',
        title: "Move this item to another scope step",
        onChange: e => onMoveStep && onMoveStep(r, e.target.value)
      }, steps.map(st => /*#__PURE__*/React.createElement("option", { key: st.id, value: st.id }, st.label)))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => del(r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x"))))))));
    };
    /* Called, not rendered as a component -- see ExpenseTable -- so the
       site URL can be typed in one go. */
    const SpWizModal = () => showSpWiz && /*#__PURE__*/React.createElement("div", {
      style: {position:'fixed',inset:0,background:'#000a',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}
    }, /*#__PURE__*/React.createElement("div", {
      style: {background:BG,border:`1px solid ${BDR}`,borderRadius:10,padding:28,width:440,maxWidth:'95vw',boxShadow:'0 8px 40px #0008'}
    }, /*#__PURE__*/React.createElement("div", {
      style: {fontWeight:700,fontSize:15,marginBottom:4,color:'var(--accent-violet)'}
    }, "☁ SharePoint Sync — Scope Library"),
    /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:18}},
      spConnected
        ? 'Connected to: ' + getSiteURL()
        : 'SharePoint not configured. Set your Site URL in Admin → Settings first.'
    ),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexDirection:'column',gap:10,marginBottom:16}},
      /*#__PURE__*/React.createElement("div", {style:{background:'#A78BFA11',border:'1px solid #A78BFA33',borderRadius:7,padding:12}},
        /*#__PURE__*/React.createElement("div", {style:{fontWeight:600,fontSize:12,marginBottom:4}}, "Step 1 — Create List (first time only)"),
        /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:8}}, 'Creates the "' + spList('SowLib') + '" list in SharePoint with the required column. Skip if already set up.'),
        /*#__PURE__*/React.createElement("button", {
          style:btn('def',true), onClick: spSetupList, disabled: spWizBusy || !spConnected
        }, spWizBusy ? '…' : 'Create SP List')
      ),
      /*#__PURE__*/React.createElement("div", {style:{background:'#22c55e11',border:'1px solid #22c55e33',borderRadius:7,padding:12}},
        /*#__PURE__*/React.createElement("div", {style:{fontWeight:600,fontSize:12,marginBottom:4}}, "Step 2 — Publish to SharePoint"),
        /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:8}}, 'Saves your current scope library (' + sowLib.length + ' services) to SharePoint so all users can access it.'),
        /*#__PURE__*/React.createElement("button", {
          style:btn('ok',true), onClick: spPublish, disabled: spWizBusy || !spConnected
        }, spWizBusy ? 'Publishing…' : '↑ Publish to SharePoint')
      ),
      /*#__PURE__*/React.createElement("div", {style:{background:'#3b82f611',border:'1px solid #3b82f633',borderRadius:7,padding:12}},
        /*#__PURE__*/React.createElement("div", {style:{fontWeight:600,fontSize:12,marginBottom:4}}, "Step 3 — Load from SharePoint"),
        /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:8}}, 'Fetches the latest shared library from SharePoint and replaces your local copy.'),
        /*#__PURE__*/React.createElement("button", {
          style:btn('info',true), onClick: spPull, disabled: spWizBusy || !spConnected
        }, spWizBusy ? 'Loading…' : '↓ Load from SharePoint')
      )
    ),
    spWizLog && /*#__PURE__*/React.createElement("div", {
      style: {background:'#ffffff0a',border:`1px solid ${BDR}`,borderRadius:6,padding:'8px 12px',fontSize:12,marginBottom:14,whiteSpace:'pre-wrap'}
    }, spWizLog),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',justifyContent:'flex-end'}},
      /*#__PURE__*/React.createElement("button", {style:btn('def',true), onClick:()=>setShowSpWiz(false)}, "Close")
    )));
    /* Resources hang off a SCOPE STEP, the same way a SOW Breakdown task owns
       its rows -- that is what lets an applied service arrive already filed
       against 1.1 rather than in one flat "Unassigned" pile. The names match
       the Breakdown's, including Consumables, which the library used to call
       Materials while the rest of the app called it something else again. */
    const LIB_RES_TYPES = [['mp', 'Manpower'], ['tools', 'Tools & Equipment'], ['mats', 'Consumables'], ['ppe', 'PPE'], ['misc', 'Miscellaneous']];
    /* "1.", "a.", "2." -- the same numbering the scope list above shows, so the
       dropdown reads like the steps it points at. */
    const stepLabels = () => {
      let mc = 0, sc = 0;
      return ((editDraft && editDraft.scopeRows) || []).map(r => {
        if (r.type === 'main') { mc++; sc = 0; } else { sc++; }
        return { id: r.id, label: (r.type === 'main' ? mc + '.' : mc + '.' + String.fromCharCode(96 + sc)) };
      });
    };
    const stepRowsOf = (type, stepId) => ((editDraft && editDraft[type]) || []).filter(r => r.step === stepId);
    /* Every write re-stamps the step, so a row added by ResEditor -- which knows
       nothing about steps -- lands on the right one. */
    const setStepRows = (type, stepId, rows) => setEditDraft(p => {
      /* `rows` may be an updater. ResEditor builds the next array from the props
         it was rendered with, so two edits landing in one React batch would see
         the same stale snapshot and the second would undo the first. */
      const cur = ((p && p[type]) || []);
      const next = typeof rows === 'function' ? rows(cur.filter(r => r.step === stepId)) : rows;
      return { ...p, [type]: [...cur.filter(r => r.step !== stepId), ...next.map(r => ({ ...r, step: stepId }))] };
    });
    const addFirstRow = (type, stepId) => setStepRows(type, stepId, [...stepRowsOf(type, stepId), {
      id: uid(), code: '', cat: type === 'misc' ? 'requirements' : 'General', name: '', qty: 1, cost: 0,
      uom: type === 'mp' ? 'Day' : 'Lot'
    }]);
    const stepResources = stepId => {
      const used = LIB_RES_TYPES.filter(([t]) => stepRowsOf(t, stepId).length);
      const empty = LIB_RES_TYPES.filter(([t]) => !stepRowsOf(t, stepId).length);
      return /*#__PURE__*/React.createElement("div", { style: { marginLeft: 22, marginTop: 4, marginBottom: 8 } },
        used.map(([t, label]) => /*#__PURE__*/React.createElement("div", { key: t, style: { marginBottom: 8 } },
          /*#__PURE__*/React.createElement("div", { style: { ...LBL, marginBottom: 3 } }, label),
          ResEditor({
            rows: stepRowsOf(t, stepId),
            setRows: rows => setStepRows(t, stepId, rows),
            type: t,
            steps: stepLabels(),
            onMoveStep: (row, toId) => setEditDraft(p => ({
              ...p,
              [t]: ((p && p[t]) || []).map(x => x.id === row.id ? { ...x, step: toId } : x)
            }))
          })
        )),
        empty.length > 0 && /*#__PURE__*/React.createElement("div", {
          style: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }
        },
          /*#__PURE__*/React.createElement("span", { style: { color: MT, fontSize: 10 } }, "Add:"),
          empty.map(([t, label]) => /*#__PURE__*/React.createElement("button", {
            key: t, style: { ...btn('def', true), fontSize: 10 },
            onClick: () => addFirstRow(t, stepId)
          }, "+ " + label))
        )
      );
    };
    /* The whole edit form, rendered inside whichever card is open. Kept as a
       plain function rather than a component so React does not remount it on
       every keystroke and steal the focus out of the field being typed in. */
    const editorBody = () => /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: '#A78BFA88',
        background: '#A78BFA08'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        marginBottom: 12,
        fontSize: 13,
        color: 'var(--accent-violet)'
      }
    }, "Editing: ", editSvc.title), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "Title"), /*#__PURE__*/React.createElement("input", {
      style: INP,
      value: editDraft.title,
      onChange: e => setEditDraft(p => ({
        ...p,
        title: e.target.value
      }))
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "Category"), /*#__PURE__*/React.createElement("input", {
      style: INP,
      list: "sowcats",
      value: editDraft.cat,
      onChange: e => setEditDraft(p => ({
        ...p,
        cat: e.target.value
      }))
    }), /*#__PURE__*/React.createElement("datalist", {
      id: "sowcats"
    }, allCats.map(c => /*#__PURE__*/React.createElement("option", {
      key: c,
      value: c
    }))))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "Scope Description", /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontWeight: 400,
        marginLeft: 8,
        fontSize: 10
      }
    }, "\u2014 structured as main steps and sub-steps")), (() => {
      let mc = 0,
        sc = 0;
      const scopeRows = editDraft.scopeRows || editDraft.scope.map((t, i) => ({
        id: String(i),
        type: i === 0 || !t.match(/^[a-z]\./i) ? 'main' : 'sub',
        text: t
      }));
      const setRows = fn => setEditDraft(p => {
        const nr = fn(p.scopeRows || p.scope.map((t, i) => ({
          id: String(i),
          type: i === 0 ? 'main' : 'sub',
          text: t
        })));
        return {
          ...p,
          scopeRows: nr,
          scope: nr.map(r => r.text)
        };
      });
      return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          gap: 5,
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("button", {
        style: btn('def', true),
        onClick: () => setRows(p => [...p, {
          id: uid(),
          type: 'main',
          text: ''
        }])
      }, "+ Main"), /*#__PURE__*/React.createElement("button", {
        style: btn('info', true),
        onClick: () => setRows(p => [...p, {
          id: uid(),
          type: 'sub',
          text: ''
        }])
      }, "+ Sub-step")), scopeRows.map((item, idx) => {
        if (item.type === 'main') {
          mc++;
          sc = 0;
        } else {
          sc++;
        }
        const lbl = item.type === 'main' ? mc + '.' : String.fromCharCode(96 + sc) + '.';
        return /*#__PURE__*/React.createElement("div", {
          key: item.id,
          style: { marginBottom: 6, paddingLeft: item.type === 'main' ? 0 : 16 }
        }, /*#__PURE__*/React.createElement("div", {
          style: { display: 'flex', gap: 6, marginBottom: 3, alignItems: 'flex-start' }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            ...MONO,
            fontSize: 11,
            color: item.type === 'main' ? TX : MT,
            fontWeight: item.type === 'main' ? 700 : 400,
            minWidth: 20,
            paddingTop: 5
          }
        }, lbl), /*#__PURE__*/React.createElement("input", {
          style: {
            ...INP,
            flex: 1,
            fontWeight: item.type === 'main' ? 600 : 400
          },
          value: item.text,
          onChange: e => setRows(p => p.map(r => r.id === item.id ? {
            ...r,
            text: e.target.value
          } : r)),
          placeholder: item.type === 'main' ? 'Main scope step...' : 'Sub-step detail...'
        }),
        /* Steps could only be appended and never moved, so a method written in
           the wrong order had to be retyped. Resources point at a step by id,
           not by position, so inserting or moving one keeps everything filed
           where it was. */
        /*#__PURE__*/React.createElement("button", {
          title: "Move up",
          disabled: idx === 0,
          style: {...btn('def', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
            return a;
          })
        }, "^"), /*#__PURE__*/React.createElement("button", {
          title: "Move down",
          disabled: idx === scopeRows.length - 1,
          style: {...btn('def', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]];
            return a;
          })
        }, "v"), /*#__PURE__*/React.createElement("button", {
          title: "Insert a main step below this one",
          style: {...btn('def', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            a.splice(idx + 1, 0, {id: uid(), type: 'main', text: ''});
            return a;
          })
        }, "+1"), /*#__PURE__*/React.createElement("button", {
          title: "Insert a sub-step below this one",
          style: {...btn('info', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            a.splice(idx + 1, 0, {id: uid(), type: 'sub', text: ''});
            return a;
          })
        }, "+a"), /*#__PURE__*/React.createElement("button", {
          onClick: () => setRows(p => p.filter(r => r.id !== item.id)),
          style: {
            background: 'none',
            border: 'none',
            color: ERR,
            cursor: 'pointer',
            fontSize: 13,
            padding: '2px 4px',
            flexShrink: 0
          }
        }, "x")), stepResources(item.id));
      }));
    })()),
    /* The four resource tabs used to sit here, one flat list per type for the
       whole service. They are now rendered under the scope step that needs
       them, above. */
    /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def'),
      onClick: cancelEdit
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc'),
      onClick: saveEdit
    }, "Save Service"), /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('danger', true),
        marginLeft: 'auto'
      },
      onClick: async () => {
        /* The editor closes only once the service is really gone: Cancel on the dialog leaves it open. */
        if (await delSvc(editDraft.id)) cancelEdit();
      }
    }, "Delete Service")));
    return /*#__PURE__*/React.createElement("div", null, SpWizModal(), /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: '#A78BFA44'
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
        fontWeight: 700
      }
    }, "Scope Library"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, sowLib.length, " services"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        marginLeft: 'auto',
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        /* Export Scope Library to Excel */
        /* One row per scope step, and each resource written on the row of the
           step that needs it.

           Two faults this replaces. Every resource went on the FIRST row, so
           the step a resource belongs to -- the thing the library exists to
           record -- was destroyed by its own export. And a resource stored as
           {name, qty, step} went through join(), which is why the file came
           out full of "[object Object]" where the resources should have been. */
        const resName = it => (typeof it === 'string' ? it : (it && it.name) || '').trim();
        const resQty = it => (typeof it === 'string' ? 1 : Number(it && it.qty) || 1);
        const resStep = it => (typeof it === 'string' ? 0 : (Number.isFinite(it && it.step) ? it.step : 0));
        const resCell = (list, step) => (list || [])
          .filter(it => resName(it) && resStep(it) === step)
          .map(it => resName(it) + (resQty(it) > 1 ? ' x' + resQty(it) : ''))
          .join(' | ');
        const rows = sowLib.flatMap(svc => {
          const base = {
            ID: svc.id,
            Category: svc.cat,
            Title: svc.title
          };
          const scopeArr = (svc.scope || []).length ? svc.scope : [''];
          return scopeArr.map((t, i) => ({
            ...base,
            /* A step lettered a. / b. / c. belongs under the numbered step
               above it; anything else is a step in its own right. */
            ScopeType: SUBSTEP_RE.test(String(t)) ? 'sub' : 'main',
            ScopeText: t,
            MP: resCell(svc.mp, i),
            Tools: resCell(svc.tools, i),
            Materials: resCell(svc.mats, i),
            PPE: resCell(svc.ppe, i),
            /* Miscellaneous had no column at all, so every accommodation,
               permit and admin line a service carried was dropped by its own
               export -- silently, since nothing said the column was missing. */
            Misc: resCell(svc.misc, i)
          }));
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Scope Library');
        XLSX.writeFile(wb, 'SY3_ScopeLibrary.xlsx');
        showToast('Exported ' + sowLib.length + ' services to Excel.');
      }
    }, "Export Library (XLS)"), /*#__PURE__*/React.createElement("button", {
      style: {...btn(spConnected ? 'ok' : 'def', true), position: 'relative'},
      onClick: () => { setSpWizLog(''); setShowSpWiz(true); },
      title: spConnected ? 'SharePoint connected — sync scope library' : 'SharePoint not configured'
    }, (spConnected ? '☁ ' : '○ ') + "SharePoint Sync"), /*#__PURE__*/React.createElement("label", {
      style: {
        ...btn('info', true),
        cursor: 'pointer'
      }
    }, "Import Library (XLS)", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: ".xlsx,.xls,.csv",
      style: {
        display: 'none'
      },
      onChange: async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, {
            type: 'array'
          });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, {
            defval: ''
          });
          /* Group rows by ID, keeping every resource against the step it was
             written on.

             The whole resource list used to be overwritten from whichever row
             carried one, as plain strings. So a library where each resource
             sits on its own step came back with all of them attached to the
             service as a whole, and every one landed in "Unassigned" -- a round
             trip through Excel quietly undid the filing the library exists for. */
          const map = {};
          const stepOf = {};
          /* "CHAIN BLOCK 5T x2" -> {name: 'CHAIN BLOCK 5T', qty: 2}. The suffix
             is read only when it is a trailing quantity, so a tool genuinely
             named "... X2" keeps its name. */
          const parseRes = (txt, step) => (txt + '').split('|').map(x => x.trim()).filter(Boolean)
            .map(x => {
              /* A SPACE before the x is required. Without it "BORING BAR MX2"
                 reads as "BORING BAR M" x2 -- a tool renamed by its own
                 quantity parser. */
              const m = x.match(/^(.*?)\s+[x×]\s*(\d+)$/i);
              const name = (m ? m[1] : x).trim();
              return { name: name, qty: m ? Number(m[2]) : 1, step: step };
            })
            .filter(x => x.name);
          rows.forEach(r => {
            const id = Number(r.ID) || r.ID;
            if (!map[id]) {
              map[id] = {
                id,
                cat: r.Category || 'General',
                title: r.Title || '',
                scope: [],
                mp: [],
                tools: [],
                mats: [],
                ppe: [],
                misc: []
              };
              stepOf[id] = 0;
            }
            /* The step index is the row's position within its own service,
               which is exactly how applyServices reads svc.scope. Resources on
               a row are filed against the step that row carries. */
            const step = stepOf[id];
            if (r.ScopeText !== undefined && r.ScopeText !== null && String(r.ScopeText).trim() !== '') {
              map[id].scope.push(String(r.ScopeText));
              stepOf[id] = step + 1;
            }
            [['MP', 'mp'], ['Tools', 'tools'], ['Materials', 'mats'], ['PPE', 'ppe'], ['Misc', 'misc']].forEach(pair => {
              if (r[pair[0]]) map[id][pair[1]] = map[id][pair[1]].concat(parseRes(r[pair[0]], step));
            });
          });
          const parsed = Object.values(map).filter(s => s.title);
          if (!parsed.length) {
            showToast('No valid services found in file.', true);
            return;
          }
          /* Import used to replace the whole library, which is right for a
             rebuilt library and badly wrong for everything else: uploading one
             new service deleted the other sixty-eight. Merging is the common
             case and the safe one, so it is the default; replacing is still
             reachable, but it now says what it will delete first. */
          const byId = {};
          sowLib.forEach(s => { byId[String(s.id)] = true; });
          const fresh = parsed.filter(s => !byId[String(s.id)]).length;
          const upd = parsed.length - fresh;
          const rest = sowLib.length - upd;
          const summary = 'Import ' + parsed.length + ' service' + (parsed.length === 1 ? '' : 's') + '?\n\n' +
            '  ' + fresh + ' new\n' +
            '  ' + upd + ' will update a service you already have\n\n';
          if (await uiConfirm(summary + 'Merge keeps your other ' + rest + ' service' + (rest === 1 ? '' : 's') + '. "Other options" lets you replace the whole library instead.',
                      {ok: 'Merge', cancel: 'Other options\u2026', danger: false})) {
            const merged = sowLib.map(s => {
              const hit = parsed.find(p => String(p.id) === String(s.id));
              return hit || s;
            }).concat(parsed.filter(s => !byId[String(s.id)]));
            saveSowLib(merged);
            showToast('Imported ' + parsed.length + ' \u2014 ' + merged.length + ' services in the library.');
          } else if (rest > 0 && await uiConfirm('Replace the ENTIRE library with these ' + parsed.length + ' services?\n\n' +
                     rest + ' service' + (rest === 1 ? '' : 's') + ' not in this file will be DELETED, here and in SharePoint.\n\n' +
                     'Export a backup first if you are not sure.', {ok: 'Replace the library', cancel: 'Keep my library', danger: true})) {
            saveSowLib(parsed, {replace: true});
            showToast('Library replaced \u2014 ' + parsed.length + ' services.');
          }
        } catch (err) {
          showToast('Import failed: ' + err.message, true);
        }
        e.target.value = '';
      }
    })), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      title: "Keep one of each service where a category and title appear twice",
      onClick: dedupeLib
    }, "Remove duplicates"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: resetLib
    }, "Reset Defaults"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      onClick: addSvc
    }, "+ Add Service"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 10,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        flex: 1,
        minWidth: 140
      },
      placeholder: "Search...",
      value: libSearch,
      onChange: e => setLibSearch(e.target.value)
    }), /*#__PURE__*/React.createElement("select", {
      style: {
        ...INP,
        width: 200
      },
      value: libCat,
      onChange: e => setLibCat(e.target.value)
    }, cats.map(c => /*#__PURE__*/React.createElement("option", {
      key: c
    }, c))), (libSearch || libCat !== 'All') && /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        setLibSearch('');
        setLibCat('All');
      }
    }, "Clear"))),
    /* One card per service, collapsed by default and edited IN PLACE. The
       editor used to be a fixed panel above a 131-row table: adding a service
       appended it to the bottom, so every edit meant scrolling to the end of
       the list to press Edit and back to the top to type. Same shape as a SOW
       Breakdown task, because it is the same idea. */
    /*#__PURE__*/React.createElement("div", null,
      filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
        style: { ...CS, textAlign: 'center', padding: 28, color: MT }
      }, "No services match. Clear the filter."),
      filtered.map(svc => {
        const open = !!(editSvc && editSvc.id === svc.id);
        const counts = ['MP:' + (svc.mp || []).length, 'TL:' + (svc.tools || []).length,
                        'CN:' + (svc.mats || []).length, 'PP:' + (svc.ppe || []).length]
                       .concat((svc.misc || []).length ? ['MS:' + (svc.misc || []).length] : []).join(' ');
        const toggle = () => open ? cancelEdit() : startEdit(svc);
        return /*#__PURE__*/React.createElement("div", {
          key: svc.id,
          style: { ...CS, marginBottom: 8, borderColor: open ? '#A78BFA88' : BDR,
                   background: open ? '#A78BFA08' : CARD, padding: open ? 16 : '9px 14px' }
        },
          /*#__PURE__*/React.createElement("div", {
            style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: open ? 12 : 0 }
          },
            /*#__PURE__*/React.createElement("button", {
              title: open ? 'Close' : 'Edit', onClick: toggle,
              style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11, padding: 0, width: 14 }
            }, open ? "▾" : "▸"),
            /*#__PURE__*/React.createElement("span", { style: { ...MONO, fontSize: 10, color: MT, minWidth: 54 } },
              /* The seeded services are numbered; one you just added has a uid,
                 and padStart printed all 36 characters of it across the row. */
              svcCode(svc)),
            /*#__PURE__*/React.createElement("div", { style: { minWidth: 200, flex: 1, cursor: 'pointer' }, onClick: toggle },
              /*#__PURE__*/React.createElement("div", { style: { fontWeight: 600, fontSize: 12 } },
                svc.title || /*#__PURE__*/React.createElement("i", { style: { color: MT } }, "(untitled service)")),
              !open && /*#__PURE__*/React.createElement("div", {
                style: { color: MT, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }
              }, ((svc.scope || [])[0] || '').slice(0, 90) + (((svc.scope || [])[0] || '').length > 90 ? '...' : ''))),
            /*#__PURE__*/React.createElement("span", { style: { color: 'var(--accent-violet)', fontSize: 11 } }, svc.cat),
            /*#__PURE__*/React.createElement("span", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 } },
              /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: MT, fontSize: 10 } }, counts),
              /*#__PURE__*/React.createElement("button", { style: btn('info', true), onClick: toggle }, open ? 'Close' : 'Edit')
            )
          ),
          open && editDraft && editorBody()
        );
      })
    ));
}
