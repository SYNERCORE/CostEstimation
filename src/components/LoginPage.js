function LoginPage({
  onLogin,
  onRegister
}) {
  const [un, setUn] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const go = async e => {
    e.preventDefault();
    if (!un.trim() || !pw.trim()) {
      setErr('Enter username and password.');
      return;
    }
    const locked = checkLoginRate(un);
    if (locked && locked.until > Date.now()) {
      const mins = Math.ceil((locked.until - Date.now()) / 60000);
      setErr(`Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const users = await dbGetUsers();
      const u = users.find(x => x && x.username && x.username.toLowerCase() === un.toLowerCase().trim());
      if (!u) {
        recordLoginFail(un);
        setErr('Account not found.');
        setBusy(false);
        return;
      }
      const ok = await verifyPassword(pw, u.hash);
      if (!ok) {
        const d = recordLoginFail(un);
        const rem = 5 - (d.count || 0);
        setErr(rem > 0 ? `Incorrect password. ${rem} attempt${rem !== 1 ? 's' : ''} remaining.` : 'Account locked for 15 minutes.');
        setBusy(false);
        return;
      }
      clearLoginRate(un);
      /* Remember THIS user locally so they can sign in offline next time.
         dbGetUsers reads SharePoint and never cached anything, so a browser
         that had only ever authenticated online fell back to a local store
         holding nobody, and offline login simply failed with "Account not
         found" -- on an app whose whole point is working offline.

         Only the account that actually signed in on this machine is stored,
         not the whole user table: caching every hash on every device would
         spread credentials far wider than the SharePoint-only setup does. The
         hash is already a PBKDF2 digest and this mirrors what a local-only
         install has always kept. */
      try {
        const cached = (LS.get('users') || []).filter(x => x && x.username && x.username.toLowerCase() !== u.username.toLowerCase());
        LS.set('users', [...cached, { id: u.id, username: u.username, name: u.name || '', hash: u.hash, role: u.role || 'user', status: u.status, email: u.email || '' }]);
      } catch (e) { console.warn('offline sign-in not enabled for this account:', e && e.message); }
      // Migrate legacy SHA-256 hash to PBKDF2 on successful login
      if (u.hash && !u.hash.startsWith('pbkdf2:')) {
        const newHash = await hashPassword(pw);
        await dbUpdateUser(u.id, { hash: newHash }).catch(() => {});
      }
      if (u.status === 'pending') {
        setErr('Account pending admin approval.');
        setBusy(false);
        return;
      }
      if (u.status !== 'approved') {
        setErr('Access denied. Contact admin.');
        setBusy(false);
        return;
      }
      session.set({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role
      });
      onLogin({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role
      });
    } catch (e) {
      setErr('Login error: ' + e.message);
    }
    setBusy(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fadein",
    style: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: BG,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 380
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: ACC,
      color: '#000',
      fontWeight: 800,
      fontSize: 12,
      padding: '4px 10px',
      borderRadius: 5
    }
  }, "SHIC"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800,
      fontSize: 20,
      letterSpacing: '-0.02em'
    }
  }, "Cost Estimator")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 12
    }
  }, "Sign in to your account")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      border: `1px solid ${BDR}`,
      borderRadius: 10,
      padding: 26
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: go
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Username"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: un,
    onChange: e => setUn(e.target.value),
    autoFocus: true,
    autoComplete: "username",
    placeholder: "your username"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Password"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    type: "password",
    value: pw,
    onChange: e => setPw(e.target.value),
    autoComplete: "current-password",
    placeholder: "password"
  })), err && /*#__PURE__*/React.createElement("div", {
    style: {
      background: ERR + '18',
      border: `1px solid ${ERR}44`,
      borderRadius: 6,
      padding: '7px 12px',
      color: ERR,
      fontSize: 12,
      marginBottom: 12
    }
  }, err), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      ...btn('acc'),
      width: '100%',
      justifyContent: 'center',
      padding: '10px 0',
      fontSize: 14,
      marginBottom: 12
    },
    disabled: busy
  }, busy ? 'Signing in...' : 'Sign In')), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 12
    }
  }, "No account? "), /*#__PURE__*/React.createElement("button", {
    onClick: onRegister,
    style: {
      background: 'none',
      border: 'none',
      color: INFO,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      fontFamily: 'inherit'
    }
  }, "Request Access")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowReset(p => !p),
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      fontSize: 11,
      fontFamily: 'inherit',
      textDecoration: 'underline'
    }
  }, "Forgot password / Reset admin")), showReset && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: '10px 12px',
      background: INFO + '11',
      border: `1px solid ${INFO}33`,
      borderRadius: 7,
      fontSize: 11,
      lineHeight: 1.8
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: TX
    }
  }, "Admin access reset:"), /*#__PURE__*/React.createElement("br", null), "Default username: ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: INFO,
      fontFamily: "'JetBrains Mono',monospace"
    }
  }, "admin"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT
    }
  }, "Contact your system administrator to retrieve the default password, or use the reset button below."), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("hr", {
    style: {
      border: 'none',
      borderTop: `1px solid ${BDR}`,
      margin: '6px 0'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 10
    }
  }, "If still failing, click below to reset all local user data:"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('danger', true),
      marginTop: 6,
      fontSize: 11
    },
    onClick: () => {
      /* Only account/auth state. The previous filter matched k.startsWith('shic'),
         which also deleted shic:history, shic:masterlist, shic:ce_cache:* and
         drafts — i.e. every locally cached CE. On a browser that had never
         connected to SharePoint that was unrecoverable, and the dialog did not
         say so. This now names exactly what goes and what stays. */
      const AUTH_KEYS = ['shic:users', 'shic:session', 'sy3:users', 'sy3:session'];
      const doomed = Object.keys(localStorage).filter(k =>
        AUTH_KEYS.includes(k) || /^(shic|sy3):(users|session|auth)/.test(k));
      let ceCount = 0;
      try { ceCount = (JSON.parse(localStorage.getItem('shic:history') || '[]') || []).length; } catch (_e) {}
      const NL = String.fromCharCode(10);
      if (confirm(
        'Reset local accounts?' + NL + NL +
        'Removes ' + doomed.length + ' locally stored account/session entr' + (doomed.length === 1 ? 'y' : 'ies') +
        ' and recreates the default admin.' + NL + NL +
        'KEPT: your ' + ceCount + ' cached CE(s), masterlist, scope library and drafts.' + NL +
        'KEPT: SharePoint connection settings.' + NL + NL +
        'Click OK to confirm.')) {
        doomed.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
        location.reload();
      }
    }
  }, "\uD83D\uDDD1 Reset User Data & Reload"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 14,
      color: MT,
      fontSize: 10
    }
  }, USE_SP ? 'SharePoint: ' + SITE_URL : 'Offline mode - data in this browser only')));
}
