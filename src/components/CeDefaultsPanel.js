/* Default notes and signatories, per CE type and discipline.

   The signatory roster and the notes were hardcoded in App.js -- in the
   initial state AND again in handleNew -- so every CE started with the same
   five names whoever was estimating and whatever kind of job it was. Anything
   else had to be retyped on every estimate, which is how a CE goes out naming
   someone who never saw it.

   Presets are shared through SharePoint, so setting one here sets it for
   everybody. */
function CeDefaultsPanel() {
  const [presets, setPresets] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  /* Which presets are open. All start folded: a roster of seven signatories makes each preset a screen tall, and
     several of them are a very long page. A preset that is added or copied opens, since that is what is being edited. */
  const [openIds, setOpenIds] = React.useState(() => new Set());
  const keyOf = (p, i) => p.id || ('#' + i);
  const setOpen = (k, on) => setOpenIds(prev => { const n = new Set(prev); if (on) n.add(k); else n.delete(k); return n; });

  React.useEffect(() => {
    (async () => {
      try { setPresets(await dbGetCeDefaults() || []); }
      catch (e) { setMsg('Could not load presets: ' + e.message.slice(0, 90)); }
      setLoaded(true);
    })();
  }, []);

  const edit = (i, patch) => { setPresets(p => p.map((x, j) => j === i ? {...x, ...patch} : x)); setDirty(true); };

  const addPreset = () => {
    const nid = 'd' + Date.now() + Math.random().toString(36).slice(2, 6);
    setOpen(nid, true);
    setPresets(p => [...p, {
      id: nid,
      ceType: CE_DEFAULT_ANY,
      discipline: CE_DEFAULT_ANY,
      notes: [],
      /* Seeded from whatever is already configured, so the first preset is a
         starting point rather than an empty form. */
      approvers: presets.length ? JSON.parse(JSON.stringify(presets[presets.length - 1].approvers || [])) : [
        {role: 'Prepared By', name: '', title: 'Cost Estimator'},
        {role: 'Checked By', name: '', title: 'Cost Supervisor'},
        {role: 'Noted By', name: '', title: 'Operations Director'},
        {role: 'Approved By', name: '', title: 'Director of Sales and Technical'}
      ]
    }]);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true); setMsg('');
    /* Empty notes and nameless signatories are noise on a printed CE, and a
       preset full of them silently fills every new estimate with blanks. */
    const clean = presets.map(p => ({
      ...p,
      /* A plain note saves as the bare string it has always been; only a
         flagged one becomes an object. So a preset nobody flags is written
         byte for byte as it was, and an older build still reads it. */
      notes: (p.notes || []).map(t => {
        const txt = ceNoteText(t).trim();
        return ceNoteImp(t) ? {t: txt, imp: true} : txt;
      }).filter(n => (typeof n === 'string' ? n : n.t)),
      approvers: (p.approvers || []).filter(a => (a.role || '').trim() || (a.name || '').trim() || (a.title || '').trim())
    }));
    try {
      const ok = await dbSaveCeDefaults(clean);
      setPresets(clean);
      setDirty(false);
      setMsg(ok ? 'Saved — every user gets these on their next new CE.' : 'Saved to this browser only — SharePoint did not accept it.');
    } catch (e) { setMsg('Save failed: ' + e.message.slice(0, 120)); }
    setBusy(false);
  };

  const sel = (value, onChange, opts) => React.createElement('select', {
    style: {...INP, fontSize: 11, padding: '4px 6px'}, value, onChange
  }, opts.map(([v, l]) => React.createElement('option', {key: v, value: v}, l)));

  const nameOf = v => v === CE_DEFAULT_ANY ? 'Any' : ({onsite: 'Onsite', shopworks: 'ShopWorks', shopsite: 'Shop + Site', supply: 'Supply'}[v] || v);
  const row = (i, p) => { const k = keyOf(p, i), open = openIds.has(k); return React.createElement('div', {
    key: k,
    style: {border: '1px solid ' + BDR, borderRadius: 8, padding: 12, marginBottom: 10, background: SURF}
  },
    /* The folded view: which pairing it is for, and how much is in it, with the buttons that act on the whole preset. */
    React.createElement('div', {style: {display: 'flex', gap: 8, alignItems: 'center', marginBottom: open ? 10 : 0}},
      React.createElement('button', {
        type: 'button', 'aria-expanded': open, title: open ? 'Fold this preset' : 'Open this preset',
        style: {...btn('def', true), fontSize: 11, padding: '3px 9px', minWidth: 28},
        onClick: () => setOpen(k, !open)
      }, open ? '\u25BE' : '\u25B8'),
      React.createElement('div', {style: {flex: 1, minWidth: 0, cursor: 'pointer'}, onClick: () => setOpen(k, !open)},
        React.createElement('b', {style: {fontSize: 12}}, nameOf(p.ceType || CE_DEFAULT_ANY) + ' \u00B7 ' + nameOf(p.discipline || CE_DEFAULT_ANY)),
        React.createElement('span', {style: {color: MT, fontSize: 11, marginLeft: 10}},
          (n => n + (n === 1 ? ' note' : ' notes'))((p.notes || []).filter(t => String(t || '').trim()).length) + ' \u00B7 ' + (n => n + (n === 1 ? ' signatory' : ' signatories'))((p.approvers || []).length) +
          ((p.approvers || []).filter(a => a.name).length ? ' \u00B7 ' + (p.approvers || []).filter(a => a.name).map(a => a.name.replace(/^(Mr|Ms|Mrs|Engr|Dr)\.?\s+/i, '')).slice(0, 3).join(', ') + ((p.approvers || []).filter(a => a.name).length > 3 ? '\u2026' : '') : ''))),
      React.createElement('button', {
        style: {...btn('def', true), fontSize: 10, padding: '4px 10px'},
        title: 'Copy this preset, then change the type or discipline',
        onClick: () => {
          const copy = JSON.parse(JSON.stringify(p));
          copy.id = 'd' + Date.now() + Math.random().toString(36).slice(2, 6);
          setOpen(copy.id, true);
          setPresets(x => [...x.slice(0, i + 1), copy, ...x.slice(i + 1)]);
          setDirty(true);
        }
      }, 'Duplicate'),
      React.createElement('button', {
        style: {...btn('danger', true), fontSize: 10, padding: '4px 10px'},
        onClick: () => { setPresets(x => x.filter((_, j) => j !== i)); setDirty(true); }
      }, 'Remove')
    ),
    open && React.createElement('div', {style: {display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10}},
      React.createElement('div', {style: {flex: 1}},
        React.createElement('label', {style: LBL}, 'CE Type'),
        sel(p.ceType || CE_DEFAULT_ANY, e => edit(i, {ceType: e.target.value}),
          [[CE_DEFAULT_ANY, 'Any type'], ['onsite', 'Onsite'], ['shopworks', 'ShopWorks'], ['shopsite', 'Shop + Site'], ['supply', 'Supply']])),
      React.createElement('div', {style: {flex: 1}},
        React.createElement('label', {style: LBL}, 'Discipline'),
        sel(p.discipline || CE_DEFAULT_ANY, e => edit(i, {discipline: e.target.value}),
          [[CE_DEFAULT_ANY, 'Any discipline'], ...CE_DISCIPLINES.map(d => [d, d])]))
    ),

    open && React.createElement('label', {style: LBL}, 'Notes'),
    open && (p.notes || []).map((t, ni) => React.createElement('div', {key: ni, style: {display: 'flex', gap: 6, marginBottom: 4}},
      React.createElement('span', {style: {color: MT, fontSize: 11, width: 16, paddingTop: 6}}, (ni + 1) + '.'),
      React.createElement('input', {
        style: {...INP, fontSize: 11, padding: '4px 8px',
          ...(ceNoteImp(t) ? {color: ERR, fontWeight: 700, borderColor: alpha(ERR, '77')} : {})},
        value: ceNoteText(t),
        placeholder: 'e.g. Any additional scope not stated is not included in this CE.',
        onChange: e => edit(i, {notes: p.notes.map((x, j) => j === ni
          ? (ceNoteImp(x) ? {t: e.target.value, imp: true} : e.target.value) : x)})
      }),
      /* The warnings sales must not read past are the same on every CE, so
         they are flagged here once rather than re-ticked on each estimate. */
      React.createElement('button', {
        style: ceNoteImp(t)
          ? {...btn('danger', true), fontSize: 10, padding: '2px 8px', fontWeight: 700}
          : {...btn('def', true), fontSize: 10, padding: '2px 8px', opacity: .75},
        title: ceNoteImp(t)
          ? 'Important on every CE this preset fills: bold red. Click to make it ordinary.'
          : 'Mark important on every CE this preset fills: bold red on the CE and the workbook.',
        onClick: () => edit(i, {notes: p.notes.map((x, j) => j === ni
          ? (ceNoteImp(x) ? ceNoteText(x) : {t: ceNoteText(x), imp: true}) : x)})
      }, '❗'),
      React.createElement('button', {
        style: {...btn('def', true), fontSize: 10, padding: '2px 8px'},
        onClick: () => edit(i, {notes: p.notes.filter((_, j) => j !== ni)})
      }, '×')
    )),
    open && React.createElement('button', {
      style: {...btn('def', true), fontSize: 10, padding: '3px 10px', marginBottom: 10},
      onClick: () => edit(i, {notes: [...(p.notes || []), '']})
    }, '+ Note'),

    open && React.createElement('label', {style: LBL}, 'Signatories'),
    open && React.createElement('div', {style: {display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 5, marginBottom: 4}},
      ['Role', 'Name', 'Title', ''].map(h => React.createElement('span', {key: h, style: {fontSize: 9, color: MT, letterSpacing: .4}}, h.toUpperCase()))),
    open && (p.approvers || []).map((a, ai) => React.createElement('div', {
      key: ai, style: {display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 5, marginBottom: 4}
    },
      ['role', 'name', 'title'].map(k => React.createElement('input', {
        key: k,
        style: {...INP, fontSize: 11, padding: '4px 8px'},
        value: a[k] || '',
        placeholder: k === 'role' ? 'Approved By' : k === 'name' ? 'Full name' : 'Job title',
        onChange: e => edit(i, {approvers: p.approvers.map((x, j) => j === ai ? {...x, [k]: e.target.value} : x)})
      })),
      React.createElement('button', {
        style: {...btn('def', true), fontSize: 10, padding: '2px 6px'},
        onClick: () => edit(i, {approvers: p.approvers.filter((_, j) => j !== ai)})
      }, '×')
    )),
    open && React.createElement('button', {
      style: {...btn('def', true), fontSize: 10, padding: '3px 10px'},
      onClick: () => edit(i, {approvers: [...(p.approvers || []), {role: '', name: '', title: ''}]})
    }, '+ Signatory')
  ); };

  return React.createElement('div', null,
    React.createElement('div', {style: {fontWeight: 700, marginBottom: 6, fontSize: 13}}, 'CE Defaults'),
    React.createElement('div', {style: {color: MT, fontSize: 11, marginBottom: 12, lineHeight: 1.6}},
      'Notes and signatories applied to a new CE, chosen by its type and discipline. Shared with everyone. ',
      'The most specific preset wins: Onsite + Mechanical beats Onsite + Any discipline, which beats Any + Mechanical, which beats the catch-all. ',
      'Leave both on "Any" for one roster that covers everything.'),

    !loaded && React.createElement('div', {style: {color: MT, fontSize: 11}}, 'Loading...'),
    loaded && presets.length === 0 && React.createElement('div', {
      style: {color: MT, fontSize: 11, padding: '14px 0', border: '1px dashed ' + BDR, borderRadius: 6, textAlign: 'center', marginBottom: 10}
    }, 'No presets yet. Add one and every new CE will start with it.'),
    presets.length > 1 && React.createElement('div', {style: {display: 'flex', gap: 6, marginBottom: 8}},
      React.createElement('button', {style: {...btn('def', true), fontSize: 10, padding: '3px 10px'}, onClick: () => setOpenIds(new Set(presets.map(keyOf)))}, 'Open all'),
      React.createElement('button', {style: {...btn('def', true), fontSize: 10, padding: '3px 10px'}, onClick: () => setOpenIds(new Set())}, 'Fold all')),
    presets.map((p, i) => row(i, p)),

    React.createElement('div', {style: {display: 'flex', gap: 8, alignItems: 'center', marginTop: 8}},
      React.createElement('button', {style: btn('def'), onClick: addPreset, disabled: busy}, '+ Add preset'),
      React.createElement('button', {style: btn('acc'), onClick: save, disabled: busy || !dirty},
        busy ? 'Saving...' : dirty ? 'Save presets' : 'Saved'),
      msg && React.createElement('span', {style: {fontSize: 11, color: /fail|only/i.test(msg) ? ERR : OK}}, msg)
    )
  );
}
