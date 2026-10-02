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
function RceReviewModal({ rce, mode, title, busy, onClose, onDone }) {
  const R = rce || {};
  const [items, setItems] = React.useState(R.items || {});
  const [otherRemarks, setOtherRemarks] = React.useState(R.otherRemarks || '');
  const [rec, setRec] = React.useState(mode === 'review' ? (R.recommendation || '') : (R.recommendation || ''));
  const [reason, setReason] = React.useState(R.declineReason || '');
  const [note, setNote] = React.useState('');
  const [errs, setErrs] = React.useState([]);
  const review = mode === 'review';
  const setItem = (n, patch) => setItems(p => ({ ...p, [n]: { ...(p[n] || {}), ...patch } }));
  const noCount = RCE_ITEMS.filter(i => (items[i.n] || {}).v === 'no').length;
  const blank = RCE_ITEMS.filter(i => !(items[i.n] || {}).v).length;
  const L = (label, el) => React.createElement('label', { style: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: MT } }, label, el);

  const submit = () => {
    const bad = [];
    if (review && !rec) bad.push('item 14: choose Proceed, Secure complete reference data first, or Decline');
    if (review && rec === 'decline' && !String(reason).trim()) bad.push('the reason for declining');
    if (review && rec === 'secure' && !noCount && !String(note).trim()) bad.push('what the requestor must supply (mark the missing items No, or write a note)');
    if (bad.length) { setErrs(bad); return; }
    setErrs([]);
    onDone({ items, otherRemarks, recommendation: rec, declineReason: String(reason).trim(), note: String(note).trim() });
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
