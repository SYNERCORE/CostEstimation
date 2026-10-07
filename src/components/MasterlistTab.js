/* The Masterlist tab: the editor (mlist, prices, trends entry points, import/export) and its calculator dialog.

   Moved out of App.js unchanged. Both are invoked from the render of App, never as elements: they hold no hooks, and everything they
   read comes in through ctx. */

function MlCalcModalTab(ctx) {
  const {
    masterlist,
    mlCalc,
    saveML,
    setMlCalc,
    showToast
  } = ctx;

    if (!mlCalc) return null;
    const set = (k, v) => setMlCalc(c => ({...c, [k]: v}));
    const rates = toolTierRates(mlCalc);
    const money = v => (v === null || v === undefined) ? '—' :
      '₱' + Number(v).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const field = (k, label, hint) => React.createElement('div', {style: {flex: 1, minWidth: 130}},
      React.createElement('label', {style: LBL}, label),
      React.createElement('input', {
        style: {...INP, fontSize: 12}, type: 'number', min: 0,
        value: mlCalc[k], placeholder: '0',
        onChange: e => set(k, e.target.value)
      }),
      hint && React.createElement('div', {style: {color: MT, fontSize: 9, marginTop: 2}}, hint));
    const tier = (label, v, note) => React.createElement('div', {
      style: {flex: 1, minWidth: 130, padding: '8px 10px', border: '1px solid ' + BDR, borderRadius: 6, background: SURF}
    },
      React.createElement('div', {style: {fontSize: 9, color: MT, letterSpacing: .4}}, label.toUpperCase()),
      React.createElement('div', {style: {fontSize: 15, fontWeight: 700, marginTop: 2}}, money(v)),
      React.createElement('div', {style: {fontSize: 9, color: MT, marginTop: 2}}, note));

    return React.createElement('div', {
      style: {position: 'fixed', inset: 0, background: '#000A', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 200, padding: 16},
      onClick: e => { if (e.target === e.currentTarget) setMlCalc(null); }
    },
      React.createElement('div', {style: {...CS, maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto'}},
        React.createElement('div', {style: {fontWeight: 700, fontSize: 13, marginBottom: 2}}, 'Tier Pricing Calculator'),
        React.createElement('div', {style: {color: MT, fontSize: 11, marginBottom: 12}}, mlCalc.desc || 'this tool'),

        React.createElement('div', {style: {display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}},
          field('unitPrice', 'Unit Price', 'what it cost to buy'),
          field('serviceLife', 'Service Life (years)', 'over how long it is written off'),
          field('maintPerYear', 'Maintenance per Year', 'often 20% of unit price'),
          field('projectsPerYear', 'Projects per Year', 'Tier 1 only')),

        /* Tier 4 is the unit price itself, so it can be shown from a price
           alone -- a tool with no service life stated derives no annual cost,
           and hiding the one figure the user has just typed reads as the
           calculator refusing to work. */
        (rates || N(mlCalc.unitPrice) > 0) ? React.createElement('div', null,
          React.createElement('div', {style: {color: MT, fontSize: 11, marginBottom: 8}},
            rates ? ['Annual cost to own: ', React.createElement('b', {key: 'a'}, money(rates.annual)),
              '  =  unit price / service life + maintenance per year']
              : 'No service life or yearly maintenance stated, so there is no annual cost to share out — only the price itself.'),
          React.createElement('div', {style: {display: 'flex', gap: 8, flexWrap: 'wrap'}},
            rates && tier('Tier 1 - per project', rates.tier1, 'flat, whatever the duration'),
            rates && tier('Tier 2 - per day', rates.tier2, 'x days on the CE - the default'),
            rates && tier('Tier 3 - per hour', rates.tier3, 'x hours on the CE'),
            /* The one figure here that is not a share of the year: what the
               project pays when it is the job that finishes the tool off. */
            tier('Tier 4 - full price', N(mlCalc.unitPrice) > 0 ? N(mlCalc.unitPrice) : null,
              'the tool is charged out whole')),
          React.createElement('div', {style: {color: MT, fontSize: 10, marginTop: 8, lineHeight: 1.6}},
            'Per day and per hour are CALENDAR time: a tool held on site is unavailable to another project overnight, ',
            'so it is charged for the hours it is held, not the hours it runs.')
        ) : React.createElement('div', {style: {color: MT, fontSize: 11, padding: '14px 0'}},
          'Enter a unit price and service life, or a yearly maintenance figure, and the tiers appear here.'),

        React.createElement('div', {style: {display: 'flex', gap: 8, marginTop: 14, alignItems: 'center'}},
          React.createElement('button', {
            style: btn('acc'),
            /* A price on its own is worth saving: it is all Tier 4 needs, and
               without it the price would have to be typed on every CE row. */
            disabled: !rates && !(N(mlCalc.unitPrice) > 0),
            onClick: () => {
              const next = {...masterlist, tools: (masterlist.tools || []).map(r => r.id === mlCalc.id ? {
                ...r,
                unitPrice: N(mlCalc.unitPrice), serviceLife: N(mlCalc.serviceLife),
                projectsPerYear: N(mlCalc.projectsPerYear), maintPerYear: N(mlCalc.maintPerYear),
                /* No annual cost to derive from leaves the daily rate alone --
                   it may have been typed in by hand, and overwriting it with
                   zero would quietly make the tool free on every other tier. */
                ...(rates ? {cost: Math.round(rates.tier2 * 100) / 100} : {})
              } : r)};
              saveML(next);
              setMlCalc(null);
              showToast(rates
                ? 'Cost set to ' + money(rates.tier2) + ' per day. The figures behind it are saved with the item.'
                : 'Unit price ' + money(N(mlCalc.unitPrice)) + ' saved with the item, for Tier 4. The daily rate is left as it is.');
            }
          }, 'Apply to this item'),
          React.createElement('button', {style: btn('def'), onClick: () => setMlCalc(null)}, 'Cancel'),
          rates && React.createElement('span', {style: {color: MT, fontSize: 10}},
            'Cost becomes the Tier 2 daily rate - what the CE has always priced from.'))
      ));
}

function MlEditorTab(ctx) {
  const {
    ML_HIST_KIND,
    currentUser,
    escPct,
    masterlist,
    mlPage,
    mlQ,
    mlQuickAdd,
    mlQuickAddRef,
    mlSaveTimer,
    mlTab,
    mlTierCols,
    mlToTrash,
    mlTrashItemName,
    openMlTrash,
    saveML,
    setEscPct,
    setMasterlist,
    setMlCalc,
    setMlPage,
    setMlQ,
    setMlQuickAdd,
    setMlTab,
    setMlTrend,
    showToast,
    toggleTierCols
  } = ctx;

    const colK = {
      manpower: ['category', 'role', 'rate', 'perDiem', 'uom'],
      tools: ['category', 'desc', 'cost', 'uom'],
      materials: ['category', 'desc', 'cost', 'uom'],
      ppe: ['category', 'desc', 'cost', 'uom'],
      vehicles: ['category', 'desc', 'rate', 'uom']
    };
  /* The five reference figures, named once. colL is what the TEMPLATE is
     written from and must always carry them; the table's own heading row is
     what hides them. Getting that the wrong way round would hand out a
     template missing five columns whenever somebody had the table collapsed. */
  const TIER_HEADS = ['Unit Price', 'Service Life (Years)', 'Projects per Year', 'Maintenance per Year', 'Power (kW)'];
    const colL = {
      manpower: ['Item Code', 'Category', 'Role / Position', 'Day Rate (P)', 'Incentive (P/Day)', 'UOM', 'Food Allowance'],
      /* The four figures a tier price is derived from ride with the rate. The
         workbook the rates are maintained in has them; without them here, they
         could be typed into the calculator one item at a time and no other
         way. Cost stays where it is so an older template still imports. */
      /* Group is which of the three buckets the Electrical summary sheet
         prints the item under. It sits beside UOM rather than out past the
         tier figures, because it is a property of the item and not part of
         the tier arithmetic. The importer matches on the header name, so an
         older workbook without the column is unaffected by where it sits. */
      tools: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM', 'Group',
        ...TIER_HEADS],
      materials: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM'],
      ppe: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM'],
      vehicles: ['Item Code', 'Category', 'Description', 'Rate (P)', 'UOM']
    };
    const downloadMLTemplate = tab => {
      const colMap = {
        manpower: ['code', 'category', 'role', 'rate', 'perDiem', 'uom', 'mealCat'],
        tools: ['code', 'category', 'desc', 'cost', 'uom', 'group',
          'unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'],
        materials: ['code', 'category', 'desc', 'cost', 'uom'],
        ppe: ['code', 'category', 'desc', 'cost', 'uom'],
        vehicles: ['code', 'category', 'desc', 'rate', 'uom']
      };
      const keys = colMap[tab] || colMap.manpower;
      /* Write the labels the app shows, not the field keys behind them. This
         wrote `perDiem` long after the column was renamed to Incentive
         everywhere else, because the header row came from this map rather than
         from colL a few lines up. importMLExcel reads both spellings, so a
         template downloaded from an older build still imports. */
      const headers = (colL[tab] || colL.manpower);
      /* Food allowance is written as the word the dropdown shows; blank means
         Auto (guessed from the role name) and imports back as blank. */
      const MEAL_WORD = { PM: 'PM', ADMIN: 'Admin', SKILLED: 'Skilled Manpower' };
      const rows = (masterlist[tab] || []).map(r => keys.map(h => h === 'mealCat' ? (MEAL_WORD[r.mealCat] || '') : (r[h] !== undefined ? r[h] : '')));
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'SY3_Masterlist_' + tab + '_template.xlsx');
    };
    const importMLExcel = async (file, tab) => {
      try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, {
          type: 'array'
        });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {
          defval: ''
        });
        if (!rows.length) {
          showToast('No data found in file.', true);
          return;
        }
        const fieldMap = {
          manpower: {
            name: 'role',
            cost: 'rate'
          },
          tools: {
            name: 'desc',
            cost: 'cost'
          },
          materials: {
            name: 'desc',
            cost: 'cost'
          },
          ppe: {
            name: 'desc',
            cost: 'cost'
          },
          vehicles: {
            name: 'desc',
            cost: 'rate'
          }
        };
        const fm = fieldMap[tab] || fieldMap.tools;
        /* A header may be the friendly label the template writes ("Role /
           Position", "Day Rate (P)") or the raw field key older templates used.
           Strip the units in brackets and everything that is not a letter, and
           both land on the same word. */
        const norm = h => String(h).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
        const HEADER_KEY = {
          itemcode: 'code', code: 'code',
          category: 'category',
          roleposition: 'role', role: 'role',
          description: 'desc', desc: 'desc',
          /* The maintained tools workbook heads its name column ITEM, not
             Description, and every row was being dropped for want of a name.
             "Item Code" normalises to itemcode, so this cannot swallow it. */
          item: 'desc', itemdescription: 'desc',
          dayrate: 'rate', rate: 'rate',
          cost: 'cost',
          incentive: 'perDiem', perdiem: 'perDiem',
          foodallowance: 'mealCat', mealallowance: 'mealCat', mealcategory: 'mealCat', mealcat: 'mealCat', foodallowancecategory: 'mealCat',
          uom: 'uom',
          /* Tier source columns, under the names the maintained workbook uses
             as well as the template's own. norm() has already stripped spaces,
             punctuation and case, so one entry covers "Unit Price", "UNIT
             PRICE" and "unit_price". */
          unitprice: 'unitPrice',
          servicelifespan: 'serviceLife', servicelife: 'serviceLife',
          estprojectperyear: 'projectsPerYear', projectsperyear: 'projectsPerYear',
          projectperyear: 'projectsPerYear', noofprojectsperyear: 'projectsPerYear',
          maintenanceperyear: 'maintPerYear', maintperyear: 'maintPerYear',
          /* Power rating, under every heading the shop's sheets use for it. */
          powerkw: 'kw', kw: 'kw', power: 'kw', rating: 'kw', ratingkw: 'kw',
          powerrating: 'kw', powerratingkw: 'kw', kilowatt: 'kw', kilowatts: 'kw',
          /* Which summary bucket the item belongs to. Named as the template
             heads it and as the team's own sheets do. */
          group: 'group', toolgroup: 'group', summarygroup: 'group', type: 'group'
        };
        const rekey = r => {
          const o = {};
          Object.keys(r).forEach(h => {
            const k = HEADER_KEY[norm(h)];
            /* First column wins: a sheet carrying both "Rate" and "Day Rate (P)"
               must not have the later one silently overwrite the earlier. */
            if (k && o[k] === undefined) o[k] = r[h];
          });
          return o;
        };
        const newItems = rows.map((r0, i) => {
          const rk = rekey(r0), r = r0;
          const item = {
            id: uid(),
            code: String(rk.code || r.code || r.Code || '').trim() || 'SHIC-' + tab.toUpperCase().slice(0, 2) + '-' + (900 + i).toString().padStart(3, '0'),
            category: String(rk.category || r.category || r.Category || 'General').trim(),
            [fm.name]: String(rk[fm.name] || r[fm.name] || r.role || r.desc || r.description || '').trim(),
            [fm.cost]: parseFloat(rk[fm.cost] !== undefined && rk[fm.cost] !== '' ? rk[fm.cost] : (r[fm.cost] || r.rate || r.cost || 0)) || 0,
            uom: String(rk.uom || r.uom || r.UOM || 'Day').trim()
          };
          /* Manpower-specific: read the incentive column. It was labelled "Per Diem"
             until the rename, so those headers are still accepted -- every
             masterlist workbook already in circulation carries the old one. */
          if (tab === 'manpower') {
            item.perDiem = parseFloat(rk.perDiem || r.incentive || r.Incentive || r.perDiem || r.perdiem || 0) || 0;
            /* PM / Admin / Skilled, in any case or spelling the sheet uses. A
               blank or unrecognised cell is Auto; a sheet without the column
               leaves the field off entirely. */
            if (rk.mealCat !== undefined) {
              const w = String(rk.mealCat || '').trim().toUpperCase();
              item.mealCat = /^PM$|PROJECT\s*MANAGER/.test(w) ? 'PM' : /ADMIN/.test(w) ? 'ADMIN' : /SKILL/.test(w) ? 'SKILLED' : '';
            }
          }
          /* Only what the sheet actually carried. Writing a 0 for a column the
             workbook does not have would turn "no basis to derive from" into a
             tool that costs nothing to own, and the tiers would read as real
             prices of zero. */
          if (tab === 'tools') {
            ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].forEach(k => {
              if (rk[k] !== undefined && rk[k] !== '') {
                const v = parseFloat(rk[k]);
                if (isFinite(v)) item[k] = v;
              }
            });
            /* The maintained workbook has no Cost column -- it holds the four
               figures and the tier columns worked out from them. Without this
               every imported tool arrives priced at zero. Derive the Tier 2
               daily rate, which is the field the CE prices from. A sheet that
               DOES give a cost keeps it: a typed rate is an override and wins. */
            if (!N(item.cost)) {
              const _r = toolTierRates(item);
              if (_r) item.cost = Math.round(_r.tier2 * 100) / 100;
            }
            /* The bucket, written however the sheet writes it: the key, the
               printed heading, or the word on its own. A cell nobody filled in
               leaves the field off, so the item stays a common tool rather
               than being stamped as one -- the two read the same on the sheet
               but only the second survives a later change of default. */
            if (rk.group !== undefined && String(rk.group).trim() !== '') {
              const w = String(rk.group).trim().toLowerCase();
              const hit = TOOL_GROUPS.find(g => g.k === w || g.t.toLowerCase() === w) ||
                (/equip/.test(w) ? TOOL_GROUPS[1] : /facilit/.test(w) ? TOOL_GROUPS[2] : /common|tool/.test(w) ? TOOL_GROUPS[0] : null);
              if (hit) item.group = hit.k;
            }
          }
          return item;
        }).filter(item => item[fm.name]);
        if (!newItems.length) {
          showToast('No valid rows found. Check column headers.', true);
          return;
        }
        /* saveML, not setMasterlist.

           This used to update React state and nothing else: the uploaded rows
           lived in memory until the tab was closed, while every other action on
           this screen -- add, delete, clear, bulk adjust -- went through saveML
           and persisted. Clear List followed by Upload Excel therefore wrote an
           EMPTY list to SharePoint and kept the upload nowhere, so the list
           came back empty. saveML mirrors locally, writes to SharePoint, and
           now reports if SharePoint refuses. */
        const existing = masterlist[tab] || [];
        const key = x => (x[fm.name] || '').toUpperCase().trim();
        const existingNames = new Set(existing.map(key));
        const toAdd = newItems.filter(x => !existingNames.has(key(x)));
        const toUpdate = newItems.filter(x => existingNames.has(key(x)));
        const merged = existing.map(x => {
          const match = toUpdate.find(u => key(u) === key(x));
          return match ? {...x, ...match, id: x.id} : x;
        });
        await saveML({...masterlist, [tab]: [...merged, ...toAdd]});
        /* Out of the state updater: React may invoke that twice, and a toast
           fired from inside it reports the import happening twice. */
        showToast(toAdd.length + ' added, ' + toUpdate.length + ' updated in ' + tab + '.');
      } catch (err) {
        showToast('Import failed: ' + err.message, true);
      }
    };
    const catOpts = {
      manpower: ['Electrical', 'Mechanical', 'Civil', 'General'],
      tools: TOOL_CATEGORIES,
      materials: MATERIAL_CATEGORIES,
      ppe: ['General', 'Welding', 'Electrical', 'Mechanical'],
      vehicles: ['Transport', 'Fuel', 'Allowance', 'Meals', 'Travel', 'Accommodation', 'Personnel', 'Equipment Rental', 'Permit / Fee', 'Miscellaneous']
    };
    const filtered = (masterlist[mlTab] || []).filter(r => !mlQ || (r.role || r.desc || '').toLowerCase().includes(mlQ.toLowerCase()) || r.category.toLowerCase().includes(mlQ.toLowerCase()));
    /* An item priced at zero is not a cheap item, it is an unpriced one -- and
       a masterlist full of them is how a CE goes out understating its own
       cost. The company has bought most of these before; until now nothing
       read that back.

       Only rates from CEs this company actually issued are used. A figure the
       file analyser lifted out of some spreadsheet is worth showing beside a
       rate for a person to weigh, which the clock does, but it is not worth
       writing into the masterlist unattended. */
    const fillFromHistory = async () => {
      const kind = ML_HIST_KIND[mlTab];
      const key = (mlTab === 'manpower' || mlTab === 'vehicles') ? 'rate' : 'cost';
      const nk = mlTab === 'manpower' ? 'role' : 'desc';
      const list = masterlist[mlTab] || [];
      const blank = list.filter(r => !N(r[key]) && String(r[nk] || '').trim());
      if (!blank.length) {
        showToast('Every item in ' + mlTab + ' already has a price.');
        return;
      }
      const found = [];
      blank.forEach(r => {
        const issued = (typeof shicRateUses === 'function' ? shicRateUses(kind, r[nk], 10) : [])
          .filter(u => u.issued);
        if (issued.length) found.push({ id: r.id, name: r[nk], rate: issued[0].rate, ce: issued[0].ceNum, n: issued.length });
      });
      if (!found.length) {
        showToast(blank.length + ' item(s) have no price, and none of them appear in any saved CE.', true);
        return;
      }
      const sample = found.slice(0, 8)
        .map(f => '  ' + f.name.slice(0, 38) + '  P' + f.rate.toLocaleString('en-PH', { minimumFractionDigits: 2 }) + '  (' + f.ce + ')')
        .join('\n');
      if (!await uiConfirm('Price ' + found.length + ' of ' + blank.length + ' unpriced item(s) from the most recent CE each was charged on?\n\n' +
        sample + (found.length > 8 ? '\n  ... and ' + (found.length - 8) + ' more' : '') +
        '\n\nThe other ' + (blank.length - found.length) + ' appear in no saved CE and are left alone.\n' +
        'Rates read out of analysed spreadsheets are not used.')) return;
      const byId = {};
      found.forEach(f => { byId[f.id] = f.rate; });
      saveML({ ...masterlist, [mlTab]: list.map(r => byId[r.id] !== undefined ? { ...r, [key]: byId[r.id] } : r) });
      showToast('Priced ' + found.length + ' item(s) from CE history. ' + (blank.length - found.length) + ' still unpriced.');
    };
    const updML = (id, k, v) => {
      const next = { ...masterlist, [mlTab]: masterlist[mlTab].map(r => r.id === id ? { ...r, [k]: v } : r) };
      setMasterlist(next);
      try { window.shicMasterlist = next; } catch(_e){logSwallowed('App:L4600',_e);}
      setSyncStatus(s => ({ ...s, dirty: true }));
      if (mlSaveTimer.current) clearTimeout(mlSaveTimer.current);
      mlSaveTimer.current = setTimeout(async () => {
        setSyncStatus({ masterlist: 'saving', dirty: true });
        /* Rounded here and not in the keystroke above: rounding what somebody
           is halfway through typing rewrites the field under the cursor. By
           the time this fires they have stopped, and 1.005 becoming 1.01 is
           what "two decimals" means rather than a surprise. */
        const rounded = mlRound(next);
        setMasterlist(rounded);
        try { window.shicMasterlist = rounded; } catch(_e){logSwallowed('App:L4611',_e);}
        try {
          const res = await dbSaveML(rounded);
          /* The debounced typing path writes straight to db.js, so it has to
             fold in anything a colleague added too -- see saveML. */
          if (res && res.sp && res.merged && res.adopted && Object.keys(res.adopted).length) {
            const kept = mlRound(res.merged);
            setMasterlist(kept);
            try { window.shicMasterlist = kept; } catch(_e){logSwallowed('App:L4619',_e);}
            const n = Object.values(res.adopted).reduce((s, a) => s + a.length, 0);
            showToast(n + ' masterlist item' + (n === 1 ? '' : 's') + ' added by someone else ' +
              (n === 1 ? 'was' : 'were') + ' kept.');
          }
          if (res && res.sp === false) {
            setSyncStatus({ masterlist: 'error', dirty: true });
            showToast('Masterlist saved in this browser only — SharePoint refused it: ' + String(res.reason||'unknown').slice(0,100), true);
          } else {
            setSyncStatus({ masterlist: 'synced', lastSyncAt: new Date().toISOString(), sp: 'connected', dirty: false });
          }
        } catch (e) {
          setSyncStatus({ masterlist: 'error' });
          showToast('Masterlist save failed: ' + e.message, true);
        }
      }, 800);
    };
    const pfxMap = {
      manpower: 'MP',
      tools: 'TL',
      materials: 'MT',
      ppe: 'PP',
      vehicles: 'VH'
    };
    const nextCode = tab => {
      const pfx = 'SHIC-' + pfxMap[tab] + '-';
      const items = masterlist[tab] || [];
      const nums = items.map(r => {
        const m = (r.code || '').match(/-(\d+)$/);
        return m ? parseInt(m[1]) : 0;
      });
      const n = Math.max(0, ...nums) + 1;
      return pfx + String(n).padStart(3, '0');
    };
    const ML_PAGE_SIZE = 20;
    const addML = (nameVal) => {
      const newItem = {
        id: uid(),
        code: nextCode(mlTab),
        category: 'General',
        ...(mlTab === 'manpower' ? {
          role: nameVal || '',
          rate: 0,
          uom: 'Day'
        } : mlTab === 'vehicles' ? {
          desc: nameVal || '',
          rate: 0,
          uom: 'Day'
        } : {
          desc: nameVal || '',
          cost: 0,
          uom: 'Lot'
        })
      };
      saveML({ ...masterlist, [mlTab]: [newItem, ...(masterlist[mlTab] || [])] });
      setMlPage(0);
    };
    const handleQuickAdd = () => {
      const name = mlQuickAdd.trim();
      addML(name);
      setMlQuickAdd('');
      setTimeout(() => mlQuickAddRef.current?.focus(), 0);
    };
    /* Named, so the site removes this one and keeps anything else it has
       that this browser has not seen yet. */
    /* Asked first, and kept in the Trash for 30 days: the red x sits right
       beside the fields people edit, and one stray click used to lose an
       item and its rate with no way back. */
    const delML = async id => {
      const it = (masterlist[mlTab] || []).find(r => r.id === id);
      if (!it) return;
      if (!await uiConfirm('Delete "' + mlTrashItemName(it) + '" from the ' + mlTab + ' list?\n\nIt goes to the Trash and can be restored for 30 days.')) return;
      await mlToTrash(mlTab, [it]);
      saveML({
        ...masterlist,
        [mlTab]: (masterlist[mlTab] || []).filter(r => r.id !== id)
      }, {deleted: {[mlTab]: [id]}});
      auditLog('masterlist_delete', mlTab + ': ' + mlTrashItemName(it), currentUser?.username);
      showToast('Moved to Trash — restore it from 🗑 Trash within 30 days.');
    };
    const applyEscalation = async () => {
      const pct = parseFloat(escPct);
      if (isNaN(pct) || pct === 0) { showToast('Enter a non-zero %', true); return; }
      const costKey = (mlTab === 'manpower' || mlTab === 'vehicles') ? 'rate' : 'cost';
      const count = (masterlist[mlTab] || []).length;
      if (!await uiConfirm('Apply ' + (pct > 0 ? '+' : '') + pct + '% to all ' + count + ' ' + mlTab + ' rates?')) return;
      saveML({...masterlist, [mlTab]: (masterlist[mlTab] || []).map(r => ({...r, [costKey]: Math.round(N(r[costKey]) * (1 + pct / 100))}))});
      showToast('Applied ' + (pct > 0 ? '+' : '') + pct + '% to ' + count + ' ' + mlTab + ' items.');
      setEscPct('');
    };
    const ks = colK[mlTab],
      /* Headings and cells come from one flag, or every column after the first
         hidden one sits under the wrong heading. */
      ls = (mlTab === 'tools' && !mlTierCols)
        ? colL.tools.filter(h => TIER_HEADS.indexOf(h) < 0)
        : colL[mlTab];
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: alpha(INFO, '44')
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
        marginRight: 4
      }
    }, "Masterlist Rate Card"), ['manpower', 'tools', 'materials', 'ppe', 'vehicles'].map(t => /*#__PURE__*/React.createElement("button", {
      key: t,
      onClick: () => { setMlTab(t); setMlPage(0); setMlQ(''); },
      style: {
        ...btn(mlTab === t ? 'acc' : 'def', true),
        textTransform: 'capitalize'
      }
    }, {
      manpower: 'Manpower',
      tools: 'Tools',
      materials: 'Materials',
      ppe: 'PPE',
      vehicles: 'Miscellaneous'
    }[t])), /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        width: 150,
        marginLeft: 'auto'
      },
      placeholder: "Search...",
      value: mlQ,
      onChange: e => { setMlQ(e.target.value); setMlPage(0); }
    }))), /*#__PURE__*/React.createElement("div", {
      style: CS
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        flexWrap: 'wrap',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, (masterlist[mlTab] || []).length, " items \u2022 ", USE_SP ? 'SharePoint' : 'browser'), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        /* This tab, rewritten whole -- one of the two callers that really
           does mean "and nothing else in it". */
        saveML({
          ...masterlist,
          [mlTab]: DEFAULT_ML[mlTab].map(r => ({
            ...r,
            id: uid()
          }))
        }, {replaceTabs: [mlTab]});
        showToast('Reset to defaults.');
      }
    }, "Reset Defaults"), /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => downloadMLTemplate(mlTab)
    }, "Download Template"), /*#__PURE__*/React.createElement("button", {
      style: btn('danger', true),
      onClick: async () => {
        if (await uiConfirm('Clear all ' + colL[mlTab][2].toLowerCase() + ' items in the ' + mlTab + ' list?\n\nThey go to the Trash and can be restored for 30 days.')) {
          mlToTrash(mlTab, masterlist[mlTab] || []);
          saveML({
            ...masterlist,
            [mlTab]: []
          }, {replaceTabs: [mlTab]});
          showToast('Cleared ' + mlTab + ' list.');
        }
      }
    }, "Clear List"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      title: "Deleted items stay here for 30 days and can be restored",
      onClick: openMlTrash
    }, "🗑 Trash"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      title: "Price every item in this tab that has none, using the most recent CE it was actually charged on",
      onClick: fillFromHistory
    }, "Fill missing prices"), /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      title: "Which rates in this list have stopped keeping up with what the CEs actually charge",
      onClick: () => setMlTrend({ tab: mlTab, pick: null })
    }, "Rate Trends"), /*#__PURE__*/React.createElement("label", {
      style: {
        ...btn('def', true),
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }
    }, "Upload Excel", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: ".xlsx,.xls",
      style: {
        display: 'none'
      },
      onChange: e => {
        const f = e.target.files[0];
        if (f) {
          importMLExcel(f, mlTab);
        }
        e.target.value = '';
      }
    })), /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      onClick: () => addML('')
    }, "+ Add Item"), /*#__PURE__*/React.createElement("input", {
      ref: mlQuickAddRef,
      style: {...INP, width:180, fontSize:12},
      type: "text",
      placeholder: "Quick add name, press Enter",
      value: mlQuickAdd,
      onChange: e => setMlQuickAdd(e.target.value),
      onKeyDown: e => { if (e.key === 'Enter') handleQuickAdd(); }
    }), /*#__PURE__*/React.createElement("div", {
      style: {display:'flex', alignItems:'center', gap:4, marginLeft:8, borderLeft:`1px solid ${BDR}`, paddingLeft:8}
    }, /*#__PURE__*/React.createElement("input", {
      style: {...INP, width:70, fontSize:11},
      type: "number",
      placeholder: "% e.g. 5",
      value: escPct,
      onChange: e => setEscPct(e.target.value),
      title: "Enter a percentage to apply to all rates in this tab (positive = increase, negative = decrease)"
    }), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: applyEscalation,
      title: "Apply % adjustment to all rates in current tab"
    }, "Apply %"), mlTab === 'tools' && /*#__PURE__*/React.createElement("button", {
      style: mlTierCols ? btn('info', true) : btn('def', true),
      onClick: toggleTierCols,
      title: mlTierCols
        ? "Hide unit price, service life, projects per year, maintenance per year and power. They stay on the items; the Tier Pricing Calculator still shows and edits them."
        : "Show the five figures a tier price is worked out from, to type them in without opening the calculator."
    }, (mlTierCols ? "▾" : "▸") + " Tier figures")))), /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, [...ls, ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, filtered.slice(mlPage * ML_PAGE_SIZE, (mlPage + 1) * ML_PAGE_SIZE).map(r => {
      const nameKey = mlTab === 'manpower' ? 'role' : 'desc';
      const costKey = mlTab === 'tools' || mlTab === 'materials' || mlTab === 'ppe' ? 'cost' : 'rate';
      const nameVal = r[nameKey] || '';
      const costVal = r[costKey] || 0;
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 108,
          fontSize: 11
        },
        value: r.code || '',
        onChange: e => updML(r.id, 'code', e.target.value),
        placeholder: "SHIC-XX-000"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 130
        },
        value: r.category || '',
        onChange: e => updML(r.id, 'category', e.target.value)
        /* The row's own category first when the list no longer offers it.
           Without this an item filed under a retired category shows an empty
           dropdown, which reads as "no category" when the item has one -- and
           the next edit to any other field would look like it cleared it. */
      }, [...(r.category && catOpts[mlTab].indexOf(r.category) < 0 ? [r.category] : []), ...catOpts[mlTab]]
        .map(c => /*#__PURE__*/React.createElement("option", {
        key: c
      }, c)))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 175
        },
        value: nameVal,
        onChange: e => updML(r.id, nameKey, e.target.value),
        placeholder: mlTab === 'manpower' ? 'Role / position' : 'Item description'
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 92
        },
        min: 0,
        value: costVal,
        onCommit: v => updML(r.id, costKey, v)
      }),
      /* What this item was actually charged at, beside the rate the list
         claims. Maintaining a masterlist without that is guesswork: the list
         says one thing and thirty CEs say another, and nothing showed the
         disagreement. */
      /*#__PURE__*/React.createElement(RateHistory, {
        kind: ML_HIST_KIND[mlTab],
        name: r[nameKey],
        onPick: v => updML(r.id, costKey, v)
      })), mlTab === 'manpower' && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 80
        },
        min: 0,
        value: r.perDiem || 0,
        onCommit: v => updML(r.id, 'perDiem', v),
        placeholder: "0"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 68
        },
        value: uomCase(r.uom || 'Day'),
        onChange: e => updML(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Day'))),
      /* Which meal allowance rate the role is paid: blank = guessed from the
         name. Mobilization, demobilization and accommodation count by it. */
      mlTab === 'manpower' && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 150, ...(r.mealCat ? {} : { color: MT }) },
        value: r.mealCat || '',
        title: r.mealCat ? '' : 'Not set -- counted as ' + ({PM: 'PM', ADMIN: 'Admin', SKILLED: 'Skilled'})[mealCatGuess(r.role)] + ' from the role name',
        onChange: e => updML(r.id, 'mealCat', e.target.value)
      }, /*#__PURE__*/React.createElement("option", { value: '' }, "Auto (" + ({PM: 'PM', ADMIN: 'Admin', SKILLED: 'Skilled'})[mealCatGuess(r.role)] + ")"),
        /*#__PURE__*/React.createElement("option", { value: 'PM' }, "PM"),
        /*#__PURE__*/React.createElement("option", { value: 'ADMIN' }, "Admin"),
        /*#__PURE__*/React.createElement("option", { value: 'SKILLED' }, "Skilled manpower"))),
      /* The four figures a tier price is derived from. They had column headings
         and no cells, so a value entered in the calculator was stored and then
         appeared nowhere -- which reads as the calculator having failed.
         Editable here as well, because typing one number is quicker than
         opening a dialog to change it. */
      ...(mlTab === 'tools'
        ? [/*#__PURE__*/React.createElement("td", { key: 'group', style: TDS },
            /*#__PURE__*/React.createElement("select", {
              style: { ...INP, width: 130, fontSize: 10, ...(r.group ? {} : { color: MT }) },
              value: r.group || '',
              title: r.group ? 'Prints under this heading on the Electrical summary sheet'
                : 'Not set — prints under COMMON TOOLS',
              onChange: e => updML(r.id, 'group', e.target.value)
            }, /*#__PURE__*/React.createElement("option", { value: '' }, "Auto (Common)"),
              TOOL_GROUPS.map(g => /*#__PURE__*/React.createElement("option", { key: g.k, value: g.k }, g.t))))]
        : []),
      ...(mlTab === 'tools' && mlTierCols
        ? ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].map(k =>
            /*#__PURE__*/React.createElement("td", {
              key: k,
              style: TDS
            }, /*#__PURE__*/React.createElement(NumBox, {
              style: {
                ...INP,
                ...MONO,
                width: (k === 'serviceLife' || k === 'kw') ? 74 : 96,
                fontSize: 10
              },
              type: "number",
              min: 0,
              /* Empty, not 0: nothing entered means there is no basis to derive
                 a tier from, and a zero would read as a real figure. */
              value: r[k] === undefined || r[k] === null || r[k] === '' ? '' : r[k],
              placeholder: "—",
              title: {
                unitPrice: 'What the tool cost to buy',
                serviceLife: 'Over how many years it is written off',
                projectsPerYear: 'Projects it is used on in a year — Tier 1 only',
                maintPerYear: 'Yearly maintenance, often 20% of unit price',
                kw: 'Power rating in kilowatts — used to cost electricity on shopworks CEs'
              }[k],
              onCommit: v => updML(r.id, k, v),
              allowBlank: true
            })))
        : []),
      /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, mlTab === 'tools' && /*#__PURE__*/React.createElement("button", {
        onClick: () => setMlCalc({
          id: r.id,
          desc: r.desc || '',
          unitPrice: r.unitPrice || '',
          serviceLife: r.serviceLife || '',
          projectsPerYear: r.projectsPerYear || '',
          maintPerYear: r.maintPerYear || ''
        }),
        title: "Work the tier prices out from unit price, service life and maintenance",
        style: {
          background: 'none',
          border: 'none',
          color: INFO,
          cursor: 'pointer',
          fontSize: 13,
          padding: '1px 5px'
        }
      }, "\uD83D\uDCB2"), /*#__PURE__*/React.createElement("button", {
        onClick: () => delML(r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    }))), (() => {
      const totalPages = Math.ceil(filtered.length / ML_PAGE_SIZE);
      if (totalPages <= 1) return null;
      const start = mlPage * ML_PAGE_SIZE + 1;
      const end = Math.min((mlPage + 1) * ML_PAGE_SIZE, filtered.length);
      return /*#__PURE__*/React.createElement("div", {
        style: {display:'flex', alignItems:'center', gap:8, marginTop:8, justifyContent:'center', fontSize:12, color:MT}
      },
        /*#__PURE__*/React.createElement("button", {
          style: {...btn('def', true), padding:'2px 10px', fontSize:11},
          disabled: mlPage === 0,
          onClick: () => setMlPage(p => p - 1)
        }, "← Prev"),
        `Page ${mlPage + 1} of ${totalPages}  (${start}–${end} of ${filtered.length})`,
        /*#__PURE__*/React.createElement("button", {
          style: {...btn('def', true), padding:'2px 10px', fontSize:11},
          disabled: mlPage >= totalPages - 1,
          onClick: () => setMlPage(p => p + 1)
        }, "Next →")
      );
    })())));
}

