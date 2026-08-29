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

  React.useEffect(() => {
    (async () => {
      try { setPresets(await dbGetCeDefaults() || []); }
      catch (e) { setMsg('Could not load presets: ' + e.message.slice(0, 90)); }
      setLoaded(true);
    })();
  }, []);

  const edit = (i, patch) => { setPresets(p => p.map((x, j) => j === i ? {...x, ...patch} : x)); setDirty(true); };

  const addPreset = () => {
    setPresets(p => [...p, {
      id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6),
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
      notes: (p.notes || []).map(t => String(t).trim()).filter(Boolean),
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

  const row = (i, p) => React.createElement('div', {
    key: p.id || i,
    style: {border: '1px solid ' + BDR, borderRadius: 8, padding: 12, marginBottom: 10, background: SURF}
  },
    React.createElement('div', {style: {display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10}},
      React.createElement('div', {style: {flex: 1}},
        React.createElement('label', {style: LBL}, 'CE Type'),
        sel(p.ceType || CE_DEFAULT_ANY, e => edit(i, {ceType: e.target.value}),
          [[CE_DEFAULT_ANY, 'Any type'], ['onsite', 'Onsite'], ['shopworks', 'ShopWorks'], ['supply', 'Supply']])),
      React.createElement('div', {style: {flex: 1}},
        React.createElement('label', {style: LBL}, 'Discipline'),
        sel(p.discipline || CE_DEFAULT_ANY, e => edit(i, {discipline: e.target.value}),
          [[CE_DEFAULT_ANY, 'Any discipline'], ...CE_DISCIPLINES.map(d => [d, d])])),
      React.createElement('button', {
        style: {...btn('danger', true), fontSize: 10, padding: '4px 10px'},
        onClick: () => { setPresets(x => x.filter((_, j) => j !== i)); setDirty(true); }
      }, 'Remove')
    ),

    React.createElement('label', {style: LBL}, 'Notes'),
    (p.notes || []).map((t, ni) => React.createElement('div', {key: ni, style: {display: 'flex', gap: 6, marginBottom: 4}},
      React.createElement('span', {style: {color: MT, fontSize: 11, width: 16, paddingTop: 6}}, (ni + 1) + '.'),
      React.createElement('input', {
        style: {...INP, fontSize: 11, padding: '4px 8px'},
        value: t,
        placeholder: 'e.g. Any additional scope not stated is not included in this CE.',
        onChange: e => edit(i, {notes: p.notes.map((x, j) => j === ni ? e.target.value : x)})
      }),
      React.createElement('button', {
        style: {...btn('def', true), fontSize: 10, padding: '2px 8px'},
        onClick: () => edit(i, {notes: p.notes.filter((_, j) => j !== ni)})
      }, '×')
    )),
    React.createElement('button', {
      style: {...btn('def', true), fontSize: 10, padding: '3px 10px', marginBottom: 10},
      onClick: () => edit(i, {notes: [...(p.notes || []), '']})
    }, '+ Note'),

    React.createElement('label', {style: LBL}, 'Signatories'),
    React.createElement('div', {style: {display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 5, marginBottom: 4}},
      ['Role', 'Name', 'Title', ''].map(h => React.createElement('span', {key: h, style: {fontSize: 9, color: MT, letterSpacing: .4}}, h.toUpperCase()))),
    (p.approvers || []).map((a, ai) => React.createElement('div', {
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
    React.createElement('button', {
      style: {...btn('def', true), fontSize: 10, padding: '3px 10px'},
      onClick: () => edit(i, {approvers: [...(p.approvers || []), {role: '', name: '', title: ''}]})
    }, '+ Signatory')
  );

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
    presets.map((p, i) => row(i, p)),

    React.createElement('div', {style: {display: 'flex', gap: 8, alignItems: 'center', marginTop: 8}},
      React.createElement('button', {style: btn('def'), onClick: addPreset, disabled: busy}, '+ Add preset'),
      React.createElement('button', {style: btn('acc'), onClick: save, disabled: busy || !dirty},
        busy ? 'Saving...' : dirty ? 'Save presets' : 'Saved'),
      msg && React.createElement('span', {style: {fontSize: 11, color: /fail|only/i.test(msg) ? ERR : OK}}, msg)
    )
  );
}
