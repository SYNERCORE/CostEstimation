/* The END USER line names the Sales Agent the estimate goes through, as "C/O NAME". The names offered are every
   Requestor account plus the extra names an admin keeps for agents who have no account. */
const SALES_AGENTS_KEY = 'sales_agents';
function salesAgentNames(users, extra) {
  const seen = {}, out = [];
  (users || []).filter(u => u && isRequestorRole(u.role) && ['pending', 'disabled', 'rejected'].indexOf(u.status) < 0)
    .map(u => u.name || u.username).concat(extra || []).forEach(n => {
      const t = String(n || '').trim().replace(/\s+/g, ' '), k = t.toUpperCase();
      if (t && !seen[k]) { seen[k] = 1; out.push(t); }
    });
  return out.sort((a, b) => a.localeCompare(b));
}
/* Not trimmed at the end, so a name can be typed with its spaces. */
function endUserFor(name) {
  const s = String(name || '').toUpperCase().replace(/^\s*C\/O\s*/, '');
  return s.trim() ? 'C/O ' + s : '';
}
/* The old default, "C/O SALES", names the department and not an agent. */
function isSalesAgentEndUser(v) {
  const t = String(v || '').trim();
  return !!t && !/^(c\/o\s*)?sales( department)?$/i.test(t);
}
/* No hooks, so it is called as a plain function. With no names listed yet it becomes a text box, so nobody is stuck.
   A value that is not on the list (an older CE, an imported one) stays selected and is not changed by being shown. */
function SalesAgentSelect({ value, agents, onChange, style }) {
  const h = React.createElement, v = value || '', list = agents || [];
  const label = 'End user (sales agent)';
  if (!list.length) return h('input', { style, 'aria-label': label, value: v.replace(/^C\/O /, ''), placeholder: 'Sales agent’s name', onChange: e => onChange(endUserFor(e.target.value)) });
  const opts = list.map(n => ({ v: endUserFor(n), t: n }));
  const hit = opts.find(o => o.v === v.trim().toUpperCase());
  if (v && !hit) opts.unshift({ v, t: v + (isSalesAgentEndUser(v) ? ' (not on the list)' : ' (no agent named)') });
  return h('select', { style, 'aria-label': label, value: hit ? hit.v : v, onChange: e => onChange(e.target.value) },
    h('option', { value: '', disabled: true }, '— Select sales agent —'), opts.map(o => h('option', { key: o.v, value: o.v }, o.t)));
}
/* Users tab: the extra names. Read again before each change, so one admin does not undo another's. */
function SalesAgentsPanel() {
  const h = React.createElement;
  const [names, setNames] = React.useState(null);
  const [accounts, setAccounts] = React.useState([]);
  const [typed, setTyped] = React.useState('');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    dbGetCompanyKey(SALES_AGENTS_KEY).then(x => setNames((x && x.names) || [])).catch(e => logSwallowed('SalesAgentsPanel:names', e));
    dbGetUsers().then(u => setAccounts(salesAgentNames(u, []))).catch(e => logSwallowed('SalesAgentsPanel:users', e));
  }, []);
  const change = async fn => {
    const cur = await dbGetCompanyKey(SALES_AGENTS_KEY);
    const next = salesAgentNames([], fn((cur && cur.names) || names || []));
    setNames(next);
    const shared = await dbSaveCompanyKey(SALES_AGENTS_KEY, { names: next, updatedAt: new Date().toISOString() });
    setNote(shared ? 'Saved for everyone.' : 'Saved in THIS BROWSER only: SharePoint did not take it.');
  };
  const add = () => { const t = typed.trim(); if (!t) return; setTyped(''); change(l => l.concat(t)); };
  return h('div', null,
    h('div', { style: { fontWeight: 700, fontSize: 13 } }, 'Sales Agents (End User list)'),
    h('div', { style: { color: MT, fontSize: 11, margin: '4px 0 8px', lineHeight: 1.5 } },
      'The End User dropdown on a CE lists every Requestor account, plus the names added here for agents without an account. From accounts now: ' + (accounts.join(', ') || 'none') + '.'),
    h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
      (names || []).map(n => h('span', { key: n, style: { display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid ' + BDR, borderRadius: 6, padding: '3px 8px', fontSize: 12 } }, n,
        h('button', { style: { background: 'none', border: 'none', color: ERR, cursor: 'pointer' }, 'aria-label': 'Remove ' + n, onClick: () => change(l => l.filter(x => x !== n)) }, '×')))),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
      h('input', { style: { ...INP, maxWidth: 280 }, value: typed, placeholder: 'Sales agent’s full name', disabled: names === null, onChange: e => setTyped(e.target.value), onKeyDown: e => { if (e.key === 'Enter') add(); } }),
      h('button', { style: btn('acc', true), disabled: names === null || !typed.trim(), onClick: add }, '+ Add agent'),
      note ? h('span', { style: { fontSize: 11, color: MT } }, note) : null));
}

/* What a CE has to be before it can be estimated: who issues it, who it is for, what kind of project it
   is, which discipline, and what it is for. Shown in front of Project Info when a CE is
   started (or opened without them), and held until all five are in and Continue is
   pressed -- not closed by the last field being filled, or typing the first letter of the
   description would dismiss it.

   It only edits through the callbacks it is given; the same four values live on Project
   Info and in the top bar, so nothing is stored here. */
function ProjectInfoGate({ missing, companies, companyId, client, endUser, agents, ceType, ceTypes, projType, description, onCompany, onClient, onEndUser, onType, onDiscipline, onDescription, onCancel, onContinue }) {
  const h = React.createElement;
  /* The red marks and the list of what is missing wait until the person has started filling in, so a fresh form is not already an error. */
  const [touched, setTouched] = React.useState(false);
  const T = fn => v => { setTouched(true); fn(v); };
  const L = (label, req, bad, el) => h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: MT } },
    h('span', null, label, req ? h('span', { style: { color: ERR } }, ' *') : null), el);
  const sel = (bad, value, onChange, blank, opts) => h('select', {
    style: { ...INP, ...(bad && touched ? { borderColor: ERR } : {}) }, value, onChange: e => T(onChange)(e.target.value)
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
        'These six decide the CE number prefix, the rates that apply and the printed form, so the estimate opens only once they are filled in. The rest of Project Info comes next.'),
      h('div', { style: { marginTop: 14 } }, L('Issuing Company', true, noCo, sel(noCo, noCo ? '' : String(companyId), onCompany, '— Select issuing company —',
        (companies || []).map(c => ({ v: String(c.id), t: c.name + (c.sub ? ' — ' + c.sub : '') }))))),
      h('div', { style: { marginTop: 12 } }, L('Client Name', true, !String(client || '').trim(),
        h('input', { style: { ...INP, ...(String(client || '').trim() || !touched ? {} : { borderColor: ERR }) }, value: client || '', placeholder: 'Who the estimate is for', onChange: e => T(onClient)(e.target.value) }))),
      h('div', { style: { marginTop: 12 } }, L('End User (Sales Agent)', true, !String(endUser || '').trim(),
        SalesAgentSelect({ value: endUser, agents, onChange: T(onEndUser), style: { ...INP, ...(String(endUser || '').trim() || !touched ? {} : { borderColor: ERR }) } })),
        (agents || []).length ? null : h('div', { style: { color: MT, fontSize: 10, marginTop: 4 } }, 'No sales agents are listed yet, so type the name. An admin can add the list in the Users tab.')),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 12 } },
        L('Project Type', true, !ceType, sel(!ceType, ceType || '', onType, '— Select project type —', (ceTypes || []).map(c => ({ v: c.k, t: c.label })))),
        L('Discipline', true, !projType, sel(!projType, projType || '', onDiscipline, '— Select discipline —',
          ['Electrical', 'Mechanical', 'Civil', 'General'].map(x => ({ v: x, t: x }))))),
      h('div', { style: { marginTop: 12 } }, L('Project Description / Scope Summary', true, !String(description || '').trim(),
        h('textarea', { style: { ...INP, height: 78, resize: 'vertical', ...(String(description || '').trim() || !touched ? {} : { borderColor: ERR }) },
          value: description || '', placeholder: 'What the client is asking for, in a line or two', onChange: e => T(onDescription)(e.target.value) }))),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 16 } },
        h('div', { style: { flex: '1 1 180px', fontSize: 11, color: done ? OK : touched ? ERR : MT, fontWeight: 600 } }, done ? 'All six filled in.' : touched ? 'Still needed: ' + missing.join(', ') + '.' : 'All six are required.'),
        h('button', { style: btn('def'), onClick: onCancel, title: 'Go back to My Work' }, 'Cancel'),
        h('button', { style: btn('acc'), disabled: !done, onClick: onContinue }, 'Continue to Project Info'))));
}
