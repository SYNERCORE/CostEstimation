/* The RCE checklist as Sales filled it in, read back on the CE the request
   became. It is read-only on purpose: it is Sales's record of what was
   actually sent, and an estimator tidying it would erase the one thing it
   is evidence of. What is missing is what the estimator most needs to see,
   so the items answered No are pulled to the top and counted in the header.

   Collapsed by default once everything is in order, and open when it is not:
   a checklist with nothing missing is a reassurance, one with gaps is work. */
function RceChecklistCard({ rce }) {
  const items = (rce && rce.items) || {};
  const rows = RCE_ITEMS.map(i => ({ ...i, ...(items[i.n] || {}) }));
  const missing = rows.filter(r => r.v === 'no');
  const na = rows.filter(r => r.v === 'na');
  const rec = RCE_RECOMMENDATIONS.find(r => r.v === rce.recommendation);
  const [open, setOpen] = React.useState(missing.length > 0 || rce.recommendation !== 'proceed');

  const tone = rce.recommendation === 'decline' ? ERR : rce.recommendation === 'secure' ? ACC : OK;
  const head = missing.length
    ? missing.length + ' of ' + RCE_ITEMS.length + ' did not come with the inquiry'
    : 'Everything asked for came with the inquiry' + (na.length ? ' (' + na.length + ' not applicable)' : '');

  const line = (label, value) => value ? /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 6, fontSize: 11 } },
    /*#__PURE__*/React.createElement("span", { style: { color: MT, minWidth: 104 } }, label),
    /*#__PURE__*/React.createElement("span", { style: { color: TX } }, value)) : null;

  return /*#__PURE__*/React.createElement("div", {
    style: { margin: '0 0 14px 0', border: '1px solid ' + BDR, borderLeft: '3px solid ' + tone, borderRadius: 8, overflow: 'hidden' }
  },
    /*#__PURE__*/React.createElement("div", {
      onClick: () => setOpen(o => !o),
      style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', cursor: 'pointer', background: alpha(TX, '06') }
    },
      /*#__PURE__*/React.createElement("div", { style: { flex: 1 } },
        /*#__PURE__*/React.createElement("div", { style: { fontWeight: 700, fontSize: 12 } }, 'RCE checklist — ' + head),
        /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 10, marginTop: 1 } },
          [rec ? rec.t.replace(/^14\.\d\s+/, '') : 'No recommendation recorded',
            rce.preparedBy ? 'raised by ' + rce.preparedBy : '',
            rce.form || ''].filter(Boolean).join('  ·  '))),
      /*#__PURE__*/React.createElement("span", { style: { color: MT, fontSize: 11 } }, open ? '▾ Hide' : '▸ Show')),

    open && /*#__PURE__*/React.createElement("div", { style: { padding: '11px 13px' } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '3px 16px', marginBottom: 11 } },
        line('Inquiry no.', rce.inquiryNo),
        line('Inquiry type', rce.inquiryType),
        line('Inquiry date', rce.inquiryDate),
        line('Deadline', rce.deadline),
        line('Completion date', rce.completionDate),
        line('Work location', rce.workLocation),
        line('Address', rce.address),
        line('Assigned sales', rce.assignedSales),
        line('Project stage', rce.stage)),

      /* Missing first: it is the reason to read this at all. */
      rows.slice().sort((a, b) => (a.v === 'no' ? 0 : 1) - (b.v === 'no' ? 0 : 1) || a.n - b.n)
        .map(r => /*#__PURE__*/React.createElement("div", {
          key: r.n,
          style: {
            display: 'grid', gridTemplateColumns: '24px 58px 1fr', gap: 8, alignItems: 'baseline',
            padding: '4px 0', borderTop: '1px solid ' + alpha(TX, '0a')
          }
        },
          /*#__PURE__*/React.createElement("span", { style: { color: MT, fontSize: 10, ...MONO } }, r.n),
          /*#__PURE__*/React.createElement("span", {
            style: {
              fontSize: 9.5, fontWeight: 800, letterSpacing: '.3px', textAlign: 'center', borderRadius: 4, padding: '1px 0',
              background: r.v === 'yes' ? alpha(OK, '22') : r.v === 'no' ? alpha(ERR, '22') : alpha(MT, '22'),
              color: r.v === 'yes' ? OK : r.v === 'no' ? ERR : MT
            }
          }, r.v === 'yes' ? 'YES' : r.v === 'no' ? 'NO' : r.v === 'na' ? 'N/A' : '—'),
          /*#__PURE__*/React.createElement("span", null,
            /*#__PURE__*/React.createElement("span", { style: { fontSize: 11.5, color: r.v === 'no' ? TX : MT } }, r.t),
            r.r && /*#__PURE__*/React.createElement("span", { style: { fontSize: 10.5, color: MT, fontStyle: 'italic' } }, '  — ' + r.r)))),

      rce.otherRemarks && /*#__PURE__*/React.createElement("div", { style: { marginTop: 11, fontSize: 11, color: TX } },
        /*#__PURE__*/React.createElement("span", { style: { color: MT } }, 'Other remarks: '), rce.otherRemarks),
      rce.declineReason && /*#__PURE__*/React.createElement("div", { style: { marginTop: 9, fontSize: 11, color: ERR } },
        /*#__PURE__*/React.createElement("span", { style: { color: MT } }, 'Reason to decline: '), rce.declineReason)));
}
