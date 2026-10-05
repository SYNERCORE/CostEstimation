/* The Cost Estimation team's review of a logged request, and the requestor's
   update of one that came back.

   mode 'review' : the estimators go through items 1-13 as the requestor left
                   them, change what they must, and decide item 14:
                     proceed -> accepted (it gets its CE number)
                     secure  -> returned to the requestor, to fill what is missing
                     decline -> rejected, with the reason on record
   mode 'update' : the requestor adds what was missing and sends it back.

   It only collects; the caller writes. onDone receives
   { items, otherRemarks, recommendation, declineReason, note }. */
/* One or several estimators in one value: "Ana Cruz, Ben Reyes". Stored as that single string, so every
   place that already reads an Estimator keeps working; ceeMatches is how "Assigned to me" finds a share. */
function ceeNames(v) { return String(v || '').split(/[,;]/).map(x => x.trim()).filter(Boolean); }
function ceeMatches(me, v) { const set = ceeNames(v).map(x => x.toUpperCase()); return set.some(x => me.indexOf(x) >= 0); }
function NamePicker({ value, users, onChange, disabled, placeholder, listId, autoFocus, onEnter }) {
  const names = ceeNames(value);
  const [typed, setTyped] = React.useState('');
  const known = (users || []).map(u => u.name || u.username);
  const add = raw => {
    const v = String(raw || '').trim();
    if (!v || names.some(n => n.toUpperCase() === v.toUpperCase())) { setTyped(''); return; }
    onChange(names.concat(v).join(', ')); setTyped('');
  };
  const drop = n => onChange(names.filter(x => x !== n).join(', '));
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 5 } },
    names.length > 0 && React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } },
      names.map(n => React.createElement('span', { key: n, style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '2px 4px 2px 9px', borderRadius: 12, background: alpha(ACC, '22'), border: '1px solid ' + alpha(ACC, '55'), color: TX } },
        n, !disabled && React.createElement('button', { type: 'button', title: 'Remove ' + n, onClick: () => drop(n), style: { border: 'none', background: 'transparent', color: MT, cursor: 'pointer', fontSize: 12, padding: '0 4px' } }, '\u2715')))),
    React.createElement('input', { style: INP, list: listId, value: typed, disabled, autoFocus, placeholder: names.length ? 'Add another estimator' : (placeholder || 'Estimator'),
      onChange: e => { const v = e.target.value; if (known.some(k => k === v)) add(v); else setTyped(v); },
      onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); if (typed.trim()) add(typed); else if (onEnter) onEnter(); } },
      onBlur: () => { if (typed.trim()) add(typed); } }),
    React.createElement('datalist', { id: listId }, known.filter(k => !names.some(n => n.toUpperCase() === k.toUpperCase())).map(k => React.createElement('option', { key: k, value: k }))));
}

function RceReviewModal({ rce, mode, title, busy, users, assignee, facts, loadFiles, onClose, onDone }) {
  const R = rce || {};
  const [items, setItems] = React.useState(R.items || {});
  const [otherRemarks, setOtherRemarks] = React.useState(R.otherRemarks || '');
  const [rec, setRec] = React.useState(mode === 'review' ? (R.recommendation || '') : (R.recommendation || ''));
  const [reason, setReason] = React.useState(R.declineReason || '');
  const [note, setNote] = React.useState('');
  const [est, setEst] = React.useState(assignee || '');
  const [errs, setErrs] = React.useState([]);
  const review = mode === 'review';
  /* The papers that came with the request, listed so they can be opened while the checklist is being judged. */
  const [files, setFiles] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    if (!loadFiles) return undefined;
    Promise.resolve(loadFiles()).then(f => { if (live) setFiles(f || []); }).catch(e => { if (live) setFiles({ err: (e && e.message) || String(e) }); });
    return () => { live = false; };
  }, []);
  const setItem = (n, patch) => setItems(p => ({ ...p, [n]: { ...(p[n] || {}), ...patch } }));
  const noCount = RCE_ITEMS.filter(i => (items[i.n] || {}).v === 'no').length;
  const blank = RCE_ITEMS.filter(i => !(items[i.n] || {}).v).length;
  const L = (label, el) => React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: MT } }, label, el);

  const submit = () => {
    const bad = [];
    if (review && !rec) bad.push('item 14: choose Proceed, Secure complete reference data first, or Decline');
    if (review && rec === 'proceed' && !String(est).trim()) bad.push('an estimator to assign it to');
    if (review && rec === 'decline' && !String(reason).trim()) bad.push('the reason for declining');
    if (review && rec === 'secure' && !noCount && !String(note).trim()) bad.push('what the requestor must supply (mark the missing items No, or write a note)');
    if (bad.length) { setErrs(bad); return; }
    setErrs([]);
    onDone({ items, otherRemarks, recommendation: rec, declineReason: String(reason).trim(), note: String(note).trim(), assignee: String(est).trim() });
  };

  const sect = (t, n) => React.createElement('div', { style: { marginTop: 14, marginBottom: 8, borderTop: '1px solid ' + BDR, paddingTop: 10 } },
    React.createElement('div', { style: { fontWeight: 700, fontSize: 11, letterSpacing: '.5px', color: TX } }, t),
    n && React.createElement('div', { style: { color: MT, fontSize: 10, marginTop: 2 } }, n));

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, background: '#000b', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    onClick: () => { if (!busy) onClose(); }
  },
    React.createElement('div', {
      onClick: e => e.stopPropagation(),
      style: { background: 'var(--bg-card, #14232b)', border: '1px solid ' + BDR, borderRadius: 10, width: 'min(760px,100%)', maxHeight: '92vh', overflowY: 'auto', padding: 18, color: TX }
    },
      React.createElement('div', { style: { fontWeight: 800, fontSize: 14 } }, title),
      React.createElement('div', { style: { color: MT, fontSize: 11, marginTop: 3 } },
        review
          ? 'Check what was sent against items 1-13, then decide item 14. Your answers replace the requestor\'s prefill.'
          : 'This request came back. Fill what was missing, then send it back to Cost Estimation.'),
      !review && R.reviewNote && React.createElement('div', { style: { marginTop: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid ' + ACC, fontSize: 11.5 } },
        React.createElement('b', null, 'Cost Estimation says: '), R.reviewNote),

      /* What the request says, before the checklist asks whether it said enough. */
      facts && facts.length > 0 && React.createElement('div', { style: { marginTop: 12, border: '1px solid ' + BDR, borderRadius: 7, padding: '8px 10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '4px 14px' } },
        facts.map(([k, v]) => React.createElement('div', { key: k, style: { fontSize: 11.5, minWidth: 0 } },
          React.createElement('span', { style: { color: MT } }, k + ': '), React.createElement('span', { style: { color: TX, wordBreak: 'break-word' } }, v)))),
      loadFiles && React.createElement('div', { style: { marginTop: 8, border: '1px solid ' + BDR, borderRadius: 7, padding: '8px 10px', fontSize: 11.5 } },
        React.createElement('b', null, '📎 Attachments'),
        files === null ? React.createElement('span', { style: { color: MT, marginLeft: 8 } }, 'Loading...')
          : files.err ? React.createElement('span', { style: { color: ERR, marginLeft: 8 } }, 'Could not read them: ' + files.err)
          : !files.length ? React.createElement('span', { style: { color: MT, marginLeft: 8 } }, 'None came with this request yet.')
          : React.createElement('div', { style: { marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 } },
              files.map(f => React.createElement('a', { key: f.FileName, href: spAbsUrl(f.ServerRelativeUrl), target: '_blank', rel: 'noopener noreferrer', style: { color: INFO, wordBreak: 'break-all', textDecoration: 'none' } }, f.FileName)))),

      sect('COMPLETE?', blank ? blank + ' of ' + RCE_ITEMS.length + ' not answered yet.' : noCount ? noCount + ' marked No.' : 'All answered.'),
      React.createElement('div', { style: { border: '1px solid ' + BDR, borderRadius: 7, overflow: 'hidden' } },
        RCE_ITEMS.map((it, ix) => {
          const cur = items[it.n] || {};
          return React.createElement('div', {
            key: it.n,
            style: { display: 'grid', gridTemplateColumns: '26px 1fr 190px', gap: 8, alignItems: 'center', padding: '6px 9px',
              background: ix % 2 ? 'transparent' : alpha(TX, '06'),
              borderLeft: '3px solid ' + (cur.v === 'yes' ? OK : cur.v === 'no' ? ERR : cur.v === 'na' ? MT : 'transparent') }
          },
            React.createElement('div', { style: { color: MT, fontSize: 10, ...MONO } }, it.n),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 11.5, color: cur.v ? TX : MT } }, it.t),
              React.createElement('div', { style: { display: 'flex', gap: 5, marginTop: 4 } },
                RCE_ANSWERS.map(a => React.createElement('button', {
                  key: a.v, disabled: busy, onClick: () => setItem(it.n, { v: cur.v === a.v ? '' : a.v }),
                  style: { fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid ' + (cur.v === a.v ? 'transparent' : BDR),
                    background: cur.v !== a.v ? 'transparent' : a.v === 'yes' ? OK : a.v === 'no' ? ERR : MT,
                    color: cur.v === a.v ? '#fff' : MT }
                }, a.t)))),
            React.createElement('input', {
              style: { ...INP, fontSize: 10.5, padding: '4px 7px' }, disabled: busy, placeholder: 'Remarks',
              value: cur.r || '', onChange: e => setItem(it.n, { r: e.target.value })
            }));
        })),

      review && sect('14. RECOMMENDATION', 'Proceed accepts the request and gives it its CE number. Secure returns it to the requestor. Decline needs a reason.'),
      review && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 5 } },
        RCE_RECOMMENDATIONS.map(r => React.createElement('button', {
          key: r.v, disabled: busy, onClick: () => setRec(rec === r.v ? '' : r.v),
          style: { textAlign: 'left', fontSize: 11.5, padding: '7px 11px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid ' + (rec === r.v ? 'transparent' : BDR),
            background: rec !== r.v ? 'transparent' : r.v === 'decline' ? ERR : r.v === 'secure' ? ACC : OK,
            color: rec !== r.v ? TX : r.v === 'secure' ? ON_ACC : '#fff', fontWeight: rec === r.v ? 700 : 400 }
        }, r.t))),
      review && rec === 'decline' && React.createElement('div', { style: { marginTop: 10 } },
        L('Reason to decline / no quote *', React.createElement('textarea', {
          style: { ...INP, height: 46, resize: 'vertical' }, value: reason, disabled: busy,
          placeholder: 'Why SHIC is not quoting this one', onChange: e => setReason(e.target.value) }))),

      review && React.createElement('div', { style: { marginTop: 10 } },
        L('Assign to estimator(s)' + (rec === 'proceed' ? ' *' : ''), React.createElement(React.Fragment, null,
          React.createElement(NamePicker, { value: est, users, disabled: busy, listId: 'rev-users', onChange: setEst })))),
      React.createElement('div', { style: { marginTop: 10 } },
        L('Other remarks', React.createElement('textarea', {
          style: { ...INP, height: 40, resize: 'vertical' }, value: otherRemarks, disabled: busy,
          onChange: e => setOtherRemarks(e.target.value) }))),
      React.createElement('div', { style: { marginTop: 10 } },
        L(review ? 'Note to the requestor' + (rec === 'secure' ? ' (what to supply)' : '') : 'Note to Cost Estimation',
          React.createElement('textarea', { style: { ...INP, height: 40, resize: 'vertical' }, value: note, disabled: busy, onChange: e => setNote(e.target.value) }))),

      errs.length > 0 && React.createElement('div', { style: { marginTop: 10, color: ERR, fontSize: 11.5, fontWeight: 600 } }, 'Still needed: ' + errs.join('; ') + '.'),
      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 } },
        React.createElement('button', { style: btn('def'), disabled: busy, onClick: onClose }, 'Cancel'),
        React.createElement('button', { style: btn(review && rec === 'decline' ? 'danger' : 'acc'), disabled: busy, onClick: submit },
          busy ? 'Saving…' : review ? (rec === 'proceed' ? 'Accept the request' : rec === 'secure' ? 'Return to requestor' : rec === 'decline' ? 'Decline the request' : 'Save the review') : 'Send back to Cost Estimation'))));
}
