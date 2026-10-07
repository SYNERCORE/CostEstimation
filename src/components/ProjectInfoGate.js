/* What a CE has to be before it can be estimated: who issues it, who it is for, what kind of project it
   is, which discipline, and what it is for. Shown in front of Project Info when a CE is
   started (or opened without them), and held until all five are in and Continue is
   pressed -- not closed by the last field being filled, or typing the first letter of the
   description would dismiss it.

   It only edits through the callbacks it is given; the same four values live on Project
   Info and in the top bar, so nothing is stored here. */
function ProjectInfoGate({ missing, companies, companyId, client, ceType, ceTypes, projType, description, onCompany, onClient, onType, onDiscipline, onDescription, onCancel, onContinue }) {
  const h = React.createElement;
  const L = (label, req, bad, el) => h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: MT } },
    h('span', null, label, req ? h('span', { style: { color: ERR } }, ' *') : null), el);
  const sel = (bad, value, onChange, blank, opts) => h('select', {
    style: { ...INP, ...(bad ? { borderColor: ERR } : {}) }, value, onChange: e => onChange(e.target.value)
  }, h('option', { value: '', disabled: true }, blank), opts.map(o => h('option', { key: o.v, value: o.v }, o.t)));
  const noCo = companyId == null || companyId === '';
  const done = !missing.length;
  return h('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Start this CE',
    style: { position: 'fixed', inset: 0, background: '#000b', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  },
    h('div', { style: { background: 'var(--bg-card, #14232b)', border: '1px solid ' + BDR, borderRadius: 10, width: 'min(640px,100%)', maxHeight: '92vh', overflowY: 'auto', padding: 20, color: TX } },
      h('div', { style: { fontWeight: 800, fontSize: 15 } }, 'Start this Cost Estimate'),
      h('div', { style: { color: MT, fontSize: 11, marginTop: 4, lineHeight: 1.5 } },
        'These five decide the CE number prefix, the rates that apply and the printed form, so the estimate opens only once they are filled in. The rest of Project Info comes next.'),
      h('div', { style: { marginTop: 14 } }, L('Issuing Company', true, noCo, sel(noCo, noCo ? '' : String(companyId), onCompany, '— Select issuing company —',
        (companies || []).map(c => ({ v: String(c.id), t: c.name + (c.sub ? ' — ' + c.sub : '') }))))),
      h('div', { style: { marginTop: 12 } }, L('Client Name', true, !String(client || '').trim(),
        h('input', { style: { ...INP, ...(String(client || '').trim() ? {} : { borderColor: ERR }) }, value: client || '', placeholder: 'Who the estimate is for', onChange: e => onClient(e.target.value) }))),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 12 } },
        L('Project Type', true, !ceType, sel(!ceType, ceType || '', onType, '— Select project type —', (ceTypes || []).map(c => ({ v: c.k, t: c.label })))),
        L('Discipline', true, !projType, sel(!projType, projType || '', onDiscipline, '— Select discipline —',
          ['Electrical', 'Mechanical', 'Civil', 'General'].map(x => ({ v: x, t: x }))))),
      h('div', { style: { marginTop: 12 } }, L('Project Description / Scope Summary', true, !String(description || '').trim(),
        h('textarea', { style: { ...INP, height: 78, resize: 'vertical', ...(String(description || '').trim() ? {} : { borderColor: ERR }) },
          value: description || '', placeholder: 'What the client is asking for, in a line or two', onChange: e => onDescription(e.target.value) }))),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 16 } },
        h('div', { style: { flex: 1, fontSize: 11, color: done ? OK : ERR, fontWeight: 600 } }, done ? 'All five filled in.' : 'Still needed: ' + missing.join(', ') + '.'),
        h('button', { style: btn('def'), onClick: onCancel, title: 'Go back to My Work' }, 'Cancel'),
        h('button', { style: btn('acc'), disabled: !done, onClick: onContinue }, 'Continue to Project Info'))));
}
