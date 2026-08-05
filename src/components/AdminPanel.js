function AdminPanel({
  currentUser
}) {
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState('');
  const [section, setSection] = useState('pending');
  const [changePwUser, setChangePwUser] = useState(null);
  const [auditEntries, setAuditEntries] = useState(null); /* null=not loaded yet */
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditListMissing, setAuditListMissing] = useState(false);
  const [newPw, setNewPw] = useState('');
  /* Saved-total recompute: null = not scanned, else {checked, diffs:[], skipped} */
  const [recalc, setRecalc] = useState(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  /* Offline storage report: how much is held locally and how much of it exists
     ONLY here (never uploaded), which is the number that actually matters. */
  const [storage, setStorage] = useState(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [editEmail, setEditEmail] = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const loadStorage = async () => {
    setStorageBusy(true);
    try { setStorage(await storageReport()); }
    catch (e) { setToast('Storage report failed: ' + e.message); }
    setStorageBusy(false);
  };
  useEffect(() => { loadStorage(); }, []);
  /* Manual counterpart to the automatic reconnect sync, for when someone wants
     to be certain the local-only CEs have left this machine before wiping it. */
  const pushLocal = async () => {
    setStorageBusy(true);
    try {
      const r = await dbPushLocalCEs({ requireOnline: false });
      if (r.skipped === 'not-configured') setToast('SharePoint is not configured, so there is nowhere to upload to.');
      else if (!r.pushed && !r.failed) setToast('Nothing to upload — every CE is already in SharePoint.');
      else setToast('Uploaded ' + r.pushed + ' CE(s)' + (r.failed ? '; ' + r.failed + ' failed and are still saved here.' : '.'));
      if (r.errors && r.errors.length) console.warn('push errors:', r.errors);
      await loadStorage();
    } catch (e) { setToast('Upload failed: ' + e.message); }
    setStorageBusy(false);
  };
  const saveEmail = async u => {
    const value = (editEmail.value || '').trim();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setToast('That does not look like an email address.'); return; }
    if (value === (u.email || '')) { setEditEmail(null); return; }
    setEmailBusy(true);
    const done = await userAction('update the email for ' + u.username, async () => {
      await dbUpdateUser(u.id, { email: value });
      auditLog('user_email_change', u.username + ' → ' + (value || '(cleared)'), currentUser?.username);
      toast2('Email updated for ' + u.username);
      load();
    });
    if (done) setEditEmail(null);
    setEmailBusy(false);
  };
  const pushAudit = async () => {
    setStorageBusy(true);
    try {
      const r = await dbPushAuditLog();
      if (r.skipped === 'not-configured') setToast('SharePoint is not configured, so there is nowhere to upload to.');
      else if (r.failed) setToast('Uploaded ' + r.pushed + '; ' + r.failed + ' still pending — they are kept here.');
      else setToast('Uploaded ' + r.pushed + ' audit entr' + (r.pushed === 1 ? 'y' : 'ies') + '.');
      await loadStorage();
    } catch (e) { setToast('Audit upload failed: ' + e.message); }
    setStorageBusy(false);
  };
  const exportArchive = async () => {
    try {
      const all = await ceAll();
      if (!all.length) { setToast('Nothing in the offline archive to export.'); return; }
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'shic-ce-archive-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      setToast('Exported ' + all.length + ' full CE(s).');
    } catch (e) { setToast('Export failed: ' + e.message); }
  };
  const [bulkOn, setBulkOn] = useState(() => bulkMode.on(currentUser?.username));
  const [bulkMins, setBulkMins] = useState(60);
  const [setupMsg, setSetupMsg] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    name: '',
    password: '',
    role: 'user'
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState('');
  /* Errors explain what did not happen and why, so 3s is not long enough to
     read one. Hold those longer. */
  const toast2 = (msg, isError) => {
    setToast(msg);
    setTimeout(() => setToast(''), isError ? 9000 : 3000);
  };
  const load = async () => {
    setBusy(true);
    try {
      setUsers(await dbGetUsers());
    } catch (e) {
      toast2('Load error: ' + e.message);
    }
    setBusy(false);
  };
  useEffect(() => {
    load();
  }, []);
  const pending = users.filter(u => u.status === 'pending'),
    active = users.filter(u => u.status === 'approved'),
    others = users.filter(u => u.status === 'rejected' || u.status === 'disabled');
  /* Account changes live in the SharePoint Users list, so none of them can be
     queued offline -- everyone else reads that list. These used to report
     success unconditionally; now the write can fail, and a silent no-op would
     be worse than the false success it replaced. Say what did not happen. */
  const userAction = async (verb, fn) => {
    try { await fn(); return true; }
    catch (e) {
      const offline = navigator.onLine === false ||
        /not signed in|auth token|Failed to fetch|NetworkError/i.test(e.message || '');
      toast2(offline
        ? `Could not ${verb} — no connection to SharePoint. Account changes apply for everyone, so they cannot be made offline. Try again once reconnected.`
        : `Could not ${verb}: ${e.message}`, true);
      return false;
    }
  };
  const setStatus = (u, status, verb, past) => userAction(verb + ' ' + u.username, async () => {
    await dbUpdateUser(u.id, { status });
    toast2(past + ' ' + u.username);
    load();
  });
  const approve = async u => {
    if (await setStatus(u, 'approved', 'approve', 'Approved'))
      auditLog('user_approve', u.username, currentUser?.username);
  };
  const reject = u => setStatus(u, 'rejected', 'reject', 'Rejected');
  const disable = u => setStatus(u, 'disabled', 'disable', 'Disabled');
  const enable = u => setStatus(u, 'approved', 'enable', 'Enabled');
  const del = async u => {
    if (!confirm('Delete "' + u.username + '"?')) return;
    await userAction('delete ' + u.username, async () => {
      await dbDeleteUser(u.id);
      auditLog('user_delete', u.username + ' (role: ' + (u.role||'user') + ')', currentUser?.username);
      toast2('Deleted ' + u.username);
      load();
    });
  };
  const toggleRole = async u => {
    const r = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change "${u.username}" role to ${r}?`)) return;
    await userAction('change the role of ' + u.username, async () => {
      await dbUpdateUser(u.id, { role: r });
      auditLog('role_change', `${u.username} → ${r}`, currentUser?.username);
      toast2(u.username + ' is now ' + r);
      load();
    });
  };
  const changePw = async () => {
    if (newPw.length < 6) {
      alert('Min 6 chars.');
      return;
    }
    const h = await hashPassword(newPw);
    /* Only clear the form once the new hash is actually stored. Reporting
       "Password updated" on a failed write would leave the account on its old
       password with nobody aware of it. */
    await userAction('update the password for ' + changePwUser.username, async () => {
      await dbUpdateUser(changePwUser.id, { hash: h });
      setChangePwUser(null);
      setNewPw('');
      toast2('Password updated.');
    });
  };
  const runSetup = async () => {
    setSetupBusy(true);
    setSetupMsg('Running...');
    try {
      /* Was calling dbSetup(), which does not exist anywhere -- this button threw
         a ReferenceError instead of doing anything. autoSetupSP is the real
         implementation, shared with the Connect & Auto-Setup panel. */
      const r = await autoSetupSP(p => setSetupMsg(p.msg));
      auditLog('sp_setup', r.created + ' list(s), ' + (r.added||0) + ' column(s)' + (r.denied ? ' — permission denied' : ''), currentUser?.username);
      let msg = r.created + ' list(s) created, ' + r.skipped + ' already existed, ' + (r.added || 0) + ' column(s) added.';
      if (r.errors && r.errors.length) msg += ' ⚠ ' + r.errors.length + ' problem(s): ' + r.errors.slice(0, 2).join(' | ');
      setSetupMsg(msg);
    } catch (e) {
      setSetupMsg('Error: ' + (e.message || e));
    }
    setSetupBusy(false);
  };
  /* ── Recompute saved CE totals ───────────────────────────────────────────
     Older CEs were saved with a P30-per-blank-manpower-row inflation (calcBen's
     SIL charges pax*30 even at rate 0, and the blank starter row counted). This
     recomputes each saved CE from its own stored rows with computeCEGrand and
     reports the differences. Scanning never writes -- Apply is a separate step. */
  const scanTotals = async () => {
    setRecalcBusy(true);
    setRecalc(null);
    try {
      const list = await dbGetHistory(null, true);
      const diffs = [];
      let checked = 0, skipped = 0;
      for (const h of (list || [])) {
        const ceNum = (h.info && h.info.ceNum) || h.ceNum || '';
        /* SP history rows carry only summary fields -- fetch the full CE so we
           recompute from real line items and never from a partial object. */
        let full = h;
        if (full.tools === undefined) {
          if (typeof h.id === 'number') { try { full = (await dbLoadCE(h.id)) || h; } catch (_) { full = h; } }
          if (full.tools === undefined) { try { full = LS.get('ce_cache:' + ceNum) || full; } catch (_) {} }
        }
        if (full.tools === undefined && full.mp === undefined) { skipped++; continue; }
        checked++;
        const was = Math.round(N(h.grand) * 100) / 100;
        const now = Math.round(computeCEGrand(full) * 100) / 100;
        if (Math.abs(was - now) >= 0.01) diffs.push({ ceNum, id: h.id, was, now, delta: now - was });
      }
      diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      setRecalc({ checked, skipped, diffs });
    } catch (e) {
      setToast('Scan failed: ' + (e.message || e));
    }
    setRecalcBusy(false);
  };
  const applyTotals = async () => {
    if (!recalc || !recalc.diffs.length) return;
    const net = recalc.diffs.reduce((s, d) => s + d.delta, 0);
    if (!window.confirm('Update the stored total of ' + recalc.diffs.length + ' CE' + (recalc.diffs.length === 1 ? '' : 's') +
      '?\n\nNet change: ' + (net >= 0 ? '+' : '') + net.toFixed(2) +
      '\n\nOnly the total is rewritten — line items are untouched. This cannot be undone from here.')) return;
    setRecalcBusy(true);
    let ok = 0, failed = 0;
    for (const d of recalc.diffs) {
      try { await dbUpdateCETotal(d.ceNum, d.id, d.now); ok++; }
      catch (_) { failed++; }
    }
    setToast(ok + ' total' + (ok === 1 ? '' : 's') + ' updated' + (failed ? ', ' + failed + ' failed' : '') + '.');
    setRecalcBusy(false);
    scanTotals();
  };
  /* Bulk upload mode: temporarily lifts the duplicate CE-number guard so
     historical CEs can be loaded. Time-boxed and bound to this account --
     see bulkMode in db.js. */
  const BULK_CHOICES = [[15, '15 minutes'], [60, '1 hour'], [240, '4 hours'],
                        [1440, '1 day'], [4320, '3 days'], [10080, '1 week']];
  const bulkLabel = m => (BULK_CHOICES.find(c => c[0] === m) || [m, m + ' minutes'])[1];
  const toggleBulk = () => {
    if (bulkOn) {
      bulkMode.disable();
      setBulkOn(false);
      auditLog('bulk_mode_off', '', currentUser?.username);
      toast2('Bulk upload mode off — duplicate protection restored.');
      return;
    }
    const label = bulkLabel(bulkMins);
    const long = bulkMins >= 1440;
    if (!window.confirm(
      'Turn OFF duplicate CE-number protection for ' + label + '?' + String.fromCharCode(10, 10) +
      'While it is off, saving a CE whose number already exists will OVERWRITE that CE — including one saved by someone else. Every replacement is recorded in the audit log.' + String.fromCharCode(10, 10) +
      /* The old wording promised it ends when the tab closes. That stopped
         being true when the window moved to localStorage to allow multi-day
         imports, and a stale promise here is worse than no promise. */
      'It switches back on automatically when the time is up. Closing the tab or the browser no longer ends it.' + String.fromCharCode(10, 10) +
      'It applies only to you (' + (currentUser?.username || 'this account') + ') on this device.' +
      (long ? String.fromCharCode(10, 10) + 'That is a long window to leave duplicate protection off. Turn it back on as soon as the import is done.' : ''))) return;
    const mins = bulkMode.enable(bulkMins, currentUser?.username);
    setBulkOn(true);
    auditLog('bulk_mode_on', bulkLabel(mins) + ' (until ' + new Date(Date.now() + mins * 60000).toLocaleString() + ')', currentUser?.username);
    toast2('Bulk upload mode ON for ' + label + '.');
  };
  const SBadge = ({
    s
  }) => {
    const m = {
      approved: {
        bg: OK + '22',
        c: OK,
        t: 'Approved'
      },
      pending: {
        bg: ACC + '22',
        c: ACC,
        t: 'Pending'
      },
      rejected: {
        bg: ERR + '22',
        c: ERR,
        t: 'Rejected'
      },
      disabled: {
        bg: MT + '22',
        c: MT,
        t: 'Disabled'
      }
    }[s] || {
      bg: MT + '22',
      c: MT,
      t: s
    };
    return /*#__PURE__*/React.createElement("span", {
      style: {
        background: m.bg,
        color: m.c,
        borderRadius: 4,
        padding: '2px 7px',
        fontSize: 10,
        fontWeight: 700
      }
    }, m.t);
  };
  const URow = ({
    u
  }) => /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600
    }
  }, u.name || u.username), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      ...MONO
    }
  }, u.username)), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, editEmail && editEmail.id === u.id
    /* There was no way to change an email at all — the cell only ever
       displayed one, so an account created with the wrong address stayed
       wrong. Editing happens in place; Enter saves, Escape cancels. */
    ? /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 4, alignItems: 'center' } },
        /*#__PURE__*/React.createElement("input", {
          style: { ...INP, fontSize: 11, padding: '3px 6px', width: 180 },
          value: editEmail.value, autoFocus: true, type: 'email',
          placeholder: 'name@company.com',
          onChange: e => setEditEmail({ id: u.id, value: e.target.value }),
          onKeyDown: e => { if (e.key === 'Enter') saveEmail(u); if (e.key === 'Escape') setEditEmail(null); }
        }),
        /*#__PURE__*/React.createElement("button", { style: btn('ok', true), onClick: () => saveEmail(u), disabled: emailBusy }, emailBusy ? '…' : 'Save'),
        /*#__PURE__*/React.createElement("button", { style: btn('ghost', true), onClick: () => setEditEmail(null) }, 'Cancel'))
    : /*#__PURE__*/React.createElement("span", {
        style: { color: MT, fontSize: 11, cursor: 'pointer', borderBottom: `1px dashed ${BDR}` },
        title: 'Click to edit this email',
        onClick: () => setEditEmail({ id: u.id, value: u.email || '' })
      }, u.email || '-- set email')), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: u.role === 'admin' ? ACC : MT,
      fontWeight: u.role === 'admin' ? 700 : 400,
      fontSize: 11
    }
  }, u.role)), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement(SBadge, {
    s: u.status
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      justifyContent: 'flex-end',
      flexWrap: 'wrap'
    }
  }, u.status === 'pending' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    style: btn('ok', true),
    onClick: () => approve(u)
  }, "Approve"), /*#__PURE__*/React.createElement("button", {
    style: btn('danger', true),
    onClick: () => reject(u)
  }, "Reject")), u.status === 'approved' && u.username !== currentUser.username && /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => disable(u)
  }, "Disable"), (u.status === 'rejected' || u.status === 'disabled') && /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => enable(u)
  }, "Enable"), u.username !== currentUser.username && /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => toggleRole(u)
  }, u.role === 'admin' ? '->User' : '->Admin'), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => {
      setChangePwUser(u);
      setNewPw('');
    }
  }, "Pwd"), u.username !== currentUser.username && /*#__PURE__*/React.createElement("button", {
    style: btn('danger', true),
    onClick: () => del(u)
  }, "Del"))));
  const handleCreate = async () => {
    const {
      username,
      name,
      password,
      role
    } = createForm;
    if (!username.trim() || !name.trim() || !password.trim()) {
      setCreateErr('All fields are required.');
      return;
    }
    if (password.length < 6) {
      setCreateErr('Password must be at least 6 characters.');
      return;
    }
    setCreateBusy(true);
    setCreateErr('');
    try {
      const all = await dbGetUsers();
      if (all.find(u => u.username.toLowerCase() === username.toLowerCase().trim())) {
        setCreateErr('Username already exists.');
        setCreateBusy(false);
        return;
      }
      const h = await hashPassword(password);
      await dbCreateUser({
        username: username.trim(),
        name: name.trim(),
        hash: h,
        role,
        status: 'approved'
      });
      await load();
      setCreateForm({
        username: '',
        name: '',
        password: '',
        role: 'user'
      });
      setShowCreate(false);
      toast2('User "' + username.trim() + '" created successfully.');
    } catch (e) {
      setCreateErr('Error: ' + e.message);
    }
    setCreateBusy(false);
  };
  return /*#__PURE__*/React.createElement("div", null, toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      background: CARD,
      border: `1px solid ${BDR}`,
      borderRadius: 8,
      padding: '10px 20px',
      zIndex: 999,
      color: TX,
      fontSize: 13,
      boxShadow: '0 4px 24px #0009',
      pointerEvents: 'none'
    }
  }, toast), changePwUser && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#000c',
      zIndex: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      border: `1px solid ${BDR}`,
      borderRadius: 12,
      padding: 26,
      maxWidth: 340,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 4
    }
  }, "Change Password"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 12,
      marginBottom: 14
    }
  }, "for ", changePwUser.name || changePwUser.username), /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "New Password"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      marginBottom: 14
    },
    type: "password",
    value: newPw,
    autoFocus: true,
    onChange: e => setNewPw(e.target.value),
    placeholder: "Min. 6 characters"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def'),
    onClick: () => setChangePwUser(null)
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: changePw
  }, "Update")))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: ACC + '44'
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
      fontWeight: 700
    }
  }, "User Management"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      marginLeft: 8
    }
  }, [['pending', 'Pending', pending.length], ['users', 'All Users', active.length + others.length], ['audit', 'Audit Log', 0]].map(([secId, secLabel, secCount]) => /*#__PURE__*/React.createElement("button", {
    key: secId,
    onClick: () => setSection(secId),
    style: btn(section === secId ? 'acc' : 'def', true)
  }, secLabel, secCount > 0 && ' (' + secCount + ')')), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('acc', true),
      marginLeft: 'auto'
    },
    onClick: () => {
      setShowCreate(p => !p);
      setCreateErr('');
      setCreateForm({
        username: '',
        name: '',
        password: '',
        role: 'user'
      });
    }
  }, showCreate ? 'Cancel' : '+ Create User')), showCreate && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: ACC + '55',
      background: ACC + '06',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 14,
      fontSize: 13
    }
  }, "Create New User Account"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Full Name"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: createForm.name,
    onChange: e => setCreateForm(p => ({
      ...p,
      name: e.target.value
    })),
    placeholder: "e.g. Juan dela Cruz"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Username"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: createForm.username,
    onChange: e => setCreateForm(p => ({
      ...p,
      username: e.target.value
    })),
    placeholder: "e.g. jdelacruz"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Password"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    type: "password",
    value: createForm.password,
    onChange: e => setCreateForm(p => ({
      ...p,
      password: e.target.value
    })),
    placeholder: "Min. 6 characters"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Role"), /*#__PURE__*/React.createElement("select", {
    style: INP,
    value: createForm.role,
    onChange: e => setCreateForm(p => ({
      ...p,
      role: e.target.value
    }))
  }, /*#__PURE__*/React.createElement("option", {
    value: "user"
  }, "User"), /*#__PURE__*/React.createElement("option", {
    value: "admin"
  }, "Admin")))), createErr && /*#__PURE__*/React.createElement("div", {
    style: {
      color: ERR,
      fontSize: 12,
      marginBottom: 10,
      padding: '6px 10px',
      background: ERR + '11',
      borderRadius: 5
    }
  }, createErr), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def'),
    onClick: () => {
      setShowCreate(false);
      setCreateErr('');
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: handleCreate,
    disabled: createBusy
  }, createBusy ? 'Creating...' : 'Create Account'))), pending.length > 0 && section !== 'pending' && /*#__PURE__*/React.createElement("span", {
    style: {
      color: ACC,
      fontSize: 11,
      fontWeight: 700
    }
  }, pending.length, " pending!"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      marginLeft: 'auto'
    },
    onClick: load
  }, busy ? '...' : 'Refresh'))), busy && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      textAlign: 'center',
      color: MT,
      padding: 32
    }
  }, "Loading..."), !busy && section === 'pending' && /*#__PURE__*/React.createElement("div", null, pending.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      textAlign: 'center',
      padding: 36,
      color: MT
    }
  }, "No pending approvals."), pending.map(u => /*#__PURE__*/React.createElement("div", {
    key: u.id,
    style: {
      ...CS,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      borderColor: ACC + '44'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: ACC + '33',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      fontSize: 14,
      color: ACC,
      flexShrink: 0
    }
  }, (u.name || u.username).charAt(0).toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700
    }
  }, u.name || u.username), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      ...MONO
    }
  }, u.username, u.email ? ' - ' + u.email : ''), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      marginTop: 2
    }
  }, u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) : '')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('ok'),
    onClick: () => approve(u)
  }, "Approve"), /*#__PURE__*/React.createElement("button", {
    style: btn('danger'),
    onClick: () => reject(u)
  }, "Reject"))))), !busy && section === 'users' && /*#__PURE__*/React.createElement("div", {
    style: CS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      ...THS,
      textAlign: h === 'Actions' ? 'right' : 'left'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, [...active, ...others].map(u => /*#__PURE__*/React.createElement(URow, {
    key: u.id,
    u: u
  })))))), !busy && section === 'audit' && /*#__PURE__*/React.createElement("div", {style: CS}, (()=>{
    const log = auditEntries !== null ? auditEntries : (LS.get('auditlog') || []);
    const spConnected = !!getSiteURL();
    const actionColor = {role_change: INFO, delete_ce: ERR, save_ce: OK, xlsx_import: ACC, change_password: INFO};
    return /*#__PURE__*/React.createElement(React.Fragment, null,
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}},
        /*#__PURE__*/React.createElement("span", {style:{fontWeight:700,fontSize:13}}, "Audit Log"),
        /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, log.length + " entries" + (spConnected && auditEntries !== null ? ' (SharePoint)' : ' (this browser)')),
        spConnected && /*#__PURE__*/React.createElement("button", {
          style:{...btn('def',true),fontSize:11},
          disabled:auditBusy,
          onClick:async()=>{setAuditBusy(true);setAuditListMissing(false);try{const r=await dbGetAuditLog(500);setAuditEntries(r);}catch(e){const msg=e.message||'';const missing=msg.includes('does not exist')||msg.includes('404')||msg.includes('list')||msg.includes('AuditLog');if(missing){setAuditListMissing(true);}else{toast2('Load error: '+msg);}}setAuditBusy(false);}
        }, auditBusy ? 'Loading…' : (auditEntries===null ? '☁ Load from SharePoint' : '↻ Refresh')),
        !spConnected && log.length > 0 && /*#__PURE__*/React.createElement("button", {
          style:{...btn('danger',true),fontSize:11,marginLeft:'auto'},
          onClick:()=>{ if(confirm('Clear local audit log?')){LS.set('auditlog',[]);setAuditEntries([]);toast2('Local audit log cleared.');} }
        }, "Clear Local Log")
      ),
      auditListMissing && /*#__PURE__*/React.createElement("div", {style:{color:'#F59E0B',fontSize:12,padding:'8px 10px',background:'#F59E0B11',border:'1px solid #F59E0B44',borderRadius:6,marginBottom:8}},
        '⚠ The AuditLog SharePoint list doesn\'t exist yet. Go to the SharePoint Setup section below and click "Setup SharePoint" to create it, then reload this tab.'
      ),
      log.length === 0
        ? /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:12}}, auditListMissing ? '' : auditEntries===null && spConnected ? 'Click "Load from SharePoint" to see the full team audit log.' : 'No audit events yet.')
        : /*#__PURE__*/React.createElement("div", {style:{overflowX:'auto'}},
            /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:11}},
              /*#__PURE__*/React.createElement("thead", null,
                /*#__PURE__*/React.createElement("tr", null,
                  ['Time','Action','Detail','User'].map(h=>/*#__PURE__*/React.createElement("th",{key:h,style:{textAlign:'left',padding:'4px 8px',color:MT,borderBottom:'1px solid '+BDR}},h))
                )
              ),
              /*#__PURE__*/React.createElement("tbody", null, log.map((e,i)=>
                /*#__PURE__*/React.createElement("tr",{key:i,style:{borderBottom:'1px solid '+BDR+'44'}},
                  /*#__PURE__*/React.createElement("td",{style:{padding:'4px 8px',color:MT,whiteSpace:'nowrap'}},new Date(e.ts).toLocaleString()),
                  /*#__PURE__*/React.createElement("td",{style:{padding:'4px 8px'}},
                    /*#__PURE__*/React.createElement("span",{style:{padding:'1px 6px',borderRadius:4,fontSize:10,background:(actionColor[e.action]||MT)+'22',color:actionColor[e.action]||MT,fontWeight:600}},e.action)
                  ),
                  /*#__PURE__*/React.createElement("td",{style:{padding:'4px 8px'}},e.detail||'—'),
                  /*#__PURE__*/React.createElement("td",{style:{padding:'4px 8px',color:MT}},e.user||'—')
                )
              ))
            )
          )
    );
  })()), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      marginTop: 8,
      borderColor: '#F05032' + '44',
      background: '#F05032' + '06'
    }
  }, /*#__PURE__*/React.createElement(CompanyDBPanel, null), /*#__PURE__*/React.createElement('hr',{style:{border:'none',borderTop:'1px solid '+BDR,margin:'16px 0'}}), React.createElement(FbSetupPanel, null),
  /*#__PURE__*/React.createElement('hr',{style:{border:'none',borderTop:'1px solid '+BDR,margin:'16px 0'}}),
  React.createElement(LocalToSPSync, null)
  ),
  /* Not gated on USE_SP: these work on local data too, and USE_SP is a const
     captured at script load, so it is false whenever SharePoint was configured
     after the page loaded. That single flag was hiding Bulk CE Upload, the
     total recompute AND SharePoint Setup from admins who did have SharePoint
     working -- the rest of the codebase tests (USE_SP || getSiteURL()) for
     exactly this reason. */
  /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      marginTop: 8,
      borderColor: INFO + '33'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 6,
      fontSize: 11,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Bulk CE Upload"), /*#__PURE__*/React.createElement("div", {
    style: { color: MT, fontSize: 11, marginBottom: 8, lineHeight: 1.5 }
  }, "Saving is normally blocked when a CE number already exists. Turn that off temporarily to load historical CEs. While it is off, saving a CE number that already exists ", /*#__PURE__*/React.createElement("b", { style: { color: ERR } }, "overwrites"), " that CE. It restores itself when the time runs out or the tab is closed."),
  /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
    /*#__PURE__*/React.createElement("button", {
      style: bulkOn ? btn('danger') : btn('def'), onClick: toggleBulk
    }, bulkOn ? 'Turn protection back ON' : 'Turn protection OFF'),
    !bulkOn && /*#__PURE__*/React.createElement("label", { style: { fontSize: 11, color: MT, display: 'flex', alignItems: 'center', gap: 6 } },
      "for",
      /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 118, fontSize: 11, padding: '3px 6px' },
        value: bulkMins,
        onChange: e => setBulkMins(Number(e.target.value) || 60)
      }, BULK_CHOICES.map(([m, label]) => /*#__PURE__*/React.createElement("option", { key: m, value: m }, label)))
    ),
    bulkOn && /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 11, color: ERR, fontWeight: 700 }
    }, "OFF — " + bulkMode.timeLeftText() + " remaining"),
    /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: MT } },
      bulkOn ? 'Duplicate CE numbers are being accepted.' : 'Duplicate CE numbers are blocked (normal).')
  ),
  /*#__PURE__*/React.createElement("div", { style: { borderTop: `1px solid ${BDR}`, margin: '14px 0 10px' } }),
  /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 6,
      fontSize: 11,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Offline Storage"), /*#__PURE__*/React.createElement("div", {
    style: { color: MT, fontSize: 11, marginBottom: 8, lineHeight: 1.5 }
  }, "Cost estimates are kept in this browser so the app works without a connection. \"Local only\" are CEs that exist nowhere else — they have not reached SharePoint, so they are never deleted by cleanup and are the ones worth exporting."),
  /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 8 } },
    storage && [
      ['CEs offline', storage.ceCount],
      ['Local only', storage.byState.local, storage.byState.local > 0],
      ['Not yet reconciled', storage.byState.unknown],
      /* Audit entries written during an outage live only here until they
         upload, so they belong next to the other local-only counts. */
      ['Audit entries to upload', auditPendingCount(), auditPendingCount() > 0],
      ['Browser storage', storage.usage != null
        ? Math.round(storage.usage / 1048576) + ' MB of ' + Math.round((storage.quota || 0) / 1048576) + ' MB'
        : Math.round(storage.lsBytes / 1024) + ' KB (estimated)'],
      ['Store', storage.idb ? 'IndexedDB' : 'localStorage fallback', !storage.idb]
    ].map(([label, val, warn], i) => /*#__PURE__*/React.createElement("div", { key: i },
      /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, color: MT, textTransform: 'uppercase', letterSpacing: '0.06em' } }, label),
      /*#__PURE__*/React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: warn ? '#F59E0B' : TX } }, String(val))
    ))
  ),
  storage && /*#__PURE__*/React.createElement("div", { style: { fontSize: 11, color: MT, marginBottom: 8 } },
    ['masterlist', 'sowlib', 'monitoring'].map(k => (storage.refs[k]
      ? k + ' synced ' + new Date(storage.refs[k].syncedAt).toLocaleString()
      : k + ' not cached yet')).join(' · ')),
  /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
    /*#__PURE__*/React.createElement("button", { style: btn('info'), onClick: exportArchive }, 'Export full backup'),
    storage && storage.byState.local > 0 && /*#__PURE__*/React.createElement("button", {
      style: btn('acc'), onClick: pushLocal, disabled: storageBusy
    }, 'Upload ' + storage.byState.local + ' local-only CE' + (storage.byState.local === 1 ? '' : 's')),
    auditPendingCount() > 0 && /*#__PURE__*/React.createElement("button", {
      style: btn('acc'), onClick: pushAudit, disabled: storageBusy
    }, 'Upload ' + auditPendingCount() + ' audit entr' + (auditPendingCount() === 1 ? 'y' : 'ies')),
    /*#__PURE__*/React.createElement("button", { style: btn('ghost'), onClick: loadStorage, disabled: storageBusy }, storageBusy ? 'Checking...' : 'Refresh')
  ),
  /*#__PURE__*/React.createElement("div", { style: { borderTop: `1px solid ${BDR}`, margin: '14px 0 10px' } }),
  /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 6,
      fontSize: 11,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Recalculate Saved CE Totals"), /*#__PURE__*/React.createElement("div", {
    style: { color: MT, fontSize: 11, marginBottom: 8, lineHeight: 1.5 }
  }, "CEs saved before the blank-row fix carry an extra ₱30 per empty manpower row, because the SIL benefit charges ₱30 per head even at a ₱0 rate. This recomputes each saved CE from its own line items. Scanning changes nothing — you see the differences first, and only the stored total is rewritten."),
  /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
    /*#__PURE__*/React.createElement("button", {
      style: btn('info'), onClick: scanTotals, disabled: recalcBusy
    }, recalcBusy ? 'Working...' : 'Scan saved CEs'),
    recalc && recalc.diffs.length > 0 && /*#__PURE__*/React.createElement("button", {
      style: btn('acc'), onClick: applyTotals, disabled: recalcBusy
    }, 'Apply ' + recalc.diffs.length + ' correction' + (recalc.diffs.length === 1 ? '' : 's')),
    recalc && /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: MT } },
      recalc.checked + ' checked' +
      (recalc.skipped ? ' · ' + recalc.skipped + ' skipped (no line items stored)' : '') +
      ' · ' + (recalc.diffs.length ? recalc.diffs.length + ' differ' : 'all totals already correct'))
  ),
  recalc && recalc.diffs.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: { marginTop: 10, maxHeight: 260, overflowY: 'auto', border: `1px solid ${BDR}`, borderRadius: 6 }
  }, /*#__PURE__*/React.createElement("table", {
    style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 }
  },
    /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null,
      ['CE Number', 'Stored', 'Recomputed', 'Change'].map((h, i) => /*#__PURE__*/React.createElement("th", {
        key: h,
        style: { ...THS, textAlign: i ? 'right' : 'left', position: 'sticky', top: 0, background: SURF }
      }, h)))),
    /*#__PURE__*/React.createElement("tbody", null, recalc.diffs.map(d => /*#__PURE__*/React.createElement("tr", { key: d.ceNum },
      /*#__PURE__*/React.createElement("td", { style: TDS }, d.ceNum || '(no CE number)'),
      /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'right', color: MT } }, '₱' + ph(d.was)),
      /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'right', fontWeight: 700 } }, '₱' + ph(d.now)),
      /*#__PURE__*/React.createElement("td", {
        style: { ...TDS, textAlign: 'right', color: d.delta < 0 ? OK : ERR, fontWeight: 700 }
      }, (d.delta >= 0 ? '+' : '') + ph(d.delta))
    )))
  )),
  ), (USE_SP || getSiteURL()) && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      marginTop: 8,
      borderColor: INFO + '33'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 6,
      fontSize: 11,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "SharePoint Setup"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 8
    }
  }, "First-time setup: creates SY3_Users, SY3_History, SY3_ML lists. Requires site owner permissions."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('info'),
    onClick: runSetup,
    disabled: setupBusy
  }, setupBusy ? 'Running...' : 'Run First-time Setup'), setupMsg && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: setupMsg.startsWith('OK') ? OK : ERR
    }
  }, setupMsg))));
}

/* ======================================================
   MAIN APP
   ====================================================== */
