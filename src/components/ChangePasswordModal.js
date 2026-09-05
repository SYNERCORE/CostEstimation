function ChangePasswordModal({ currentUser }) {
  const [open, setOpen] = React.useState(false);
  const [curPw, setCurPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');
  const [confirmPw, setConfirmPw] = React.useState('');
  const [err, setErr] = React.useState('');
  const [ok, setOk] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const reset = () => { setCurPw(''); setNewPw(''); setConfirmPw(''); setErr(''); setOk(''); };
  const close = () => { setOpen(false); reset(); };

  const handleSubmit = async e => {
    e.preventDefault();
    setErr(''); setOk('');
    if (!curPw || !newPw || !confirmPw) { setErr('All fields are required.'); return; }
    if (newPw.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setErr('New passwords do not match.'); return; }
    if (newPw === curPw) { setErr('New password must differ from current password.'); return; }
    setBusy(true);
    try {
      const users = await dbGetUsers();
      const me = users.find(u => u.id === currentUser.id || u.username === currentUser.username);
      if (!me) { setErr('Could not load your account. Try again.'); setBusy(false); return; }
      const valid = await verifyPassword(curPw, me.hash);
      if (!valid) { setErr('Current password is incorrect.'); setBusy(false); return; }
      const newHash = await hashPassword(newPw);
      await dbUpdateUser(me.id, { hash: newHash });
      auditLog('change_password', currentUser.username + ' changed their password', currentUser.username);
      setOk('Password changed successfully.');
      reset();
      setTimeout(close, 1800);
    } catch (ex) {
      /* The password lives in the SharePoint Users list. If the write did not
         land, the old password is still the real one — say so, because the
         alternative is the user believing they changed it. */
      const m = ex.message || String(ex);
      const offline = (USE_SP || getSiteURL()) &&
        (navigator.onLine === false || /not signed in|auth token|Failed to fetch|NetworkError/i.test(m));
      setErr(offline
        ? 'Password NOT changed — no connection to SharePoint. Keep using your current password and try again once reconnected.'
        : 'Error: ' + m);
    }
    setBusy(false);
  };

  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      style: { ...btn('def', true), fontSize: 11 },
      onClick: () => { reset(); setOpen(true); },
      title: 'Change your password'
    }, '🔑 Password'),
    open && React.createElement('div', {
      style: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
      },
      onClick: e => { if (e.target === e.currentTarget) close(); }
    },
      React.createElement('div', {
        style: {
          background: CARD, border: '1px solid ' + BDR, borderRadius: 10,
          padding: 24, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.35)'
        }
      },
        React.createElement('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 16 } }, '🔑 Change Password'),
        React.createElement('form', { onSubmit: handleSubmit },
          React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: LBL }, 'Current Password'),
            React.createElement('input', { style: INP, type: 'password', value: curPw, onChange: e => setCurPw(e.target.value), autoFocus: true, autoComplete: 'current-password' })
          ),
          React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: LBL }, 'New Password'),
            React.createElement('input', { style: INP, type: 'password', value: newPw, onChange: e => setNewPw(e.target.value), autoComplete: 'new-password', placeholder: 'Min. 8 characters' })
          ),
          React.createElement('div', { style: { marginBottom: 14 } },
            React.createElement('label', { style: LBL }, 'Confirm New Password'),
            React.createElement('input', { style: INP, type: 'password', value: confirmPw, onChange: e => setConfirmPw(e.target.value), autoComplete: 'new-password' })
          ),
          err && React.createElement('div', { style: { color: ERR, fontSize: 11, marginBottom: 10, padding: '6px 10px', background: alpha(ERR, '18'), borderRadius: 5 } }, err),
          ok  && React.createElement('div', { style: { color: OK,  fontSize: 11, marginBottom: 10, padding: '6px 10px', background: alpha(OK, '18'), borderRadius: 5 } }, ok),
          React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            React.createElement('button', { type: 'button', style: btn('def', true), onClick: close, disabled: busy }, 'Cancel'),
            React.createElement('button', { type: 'submit', style: btn('acc', true), disabled: busy }, busy ? 'Saving…' : 'Change Password')
          )
        )
      )
    )
  );
}
