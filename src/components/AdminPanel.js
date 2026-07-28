function AdminPanel({
  currentUser
}) {
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState('');
  const [section, setSection] = useState('pending');
  const [changePwUser, setChangePwUser] = useState(null);
  const [newPw, setNewPw] = useState('');
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
  const toast2 = msg => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
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
  const approve = async u => {
    await dbUpdateUser(u.id, {
      status: 'approved'
    });
    toast2('Approved ' + u.username);
    load();
  };
  const reject = async u => {
    await dbUpdateUser(u.id, {
      status: 'rejected'
    });
    toast2('Rejected ' + u.username);
    load();
  };
  const disable = async u => {
    await dbUpdateUser(u.id, {
      status: 'disabled'
    });
    toast2('Disabled ' + u.username);
    load();
  };
  const enable = async u => {
    await dbUpdateUser(u.id, {
      status: 'approved'
    });
    toast2('Enabled ' + u.username);
    load();
  };
  const del = async u => {
    if (!confirm('Delete "' + u.username + '"?')) return;
    await dbDeleteUser(u.id);
    toast2('Deleted ' + u.username);
    load();
  };
  const toggleRole = async u => {
    const r = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change "${u.username}" role to ${r}?`)) return;
    await dbUpdateUser(u.id, { role: r });
    auditLog('role_change', `${u.username} → ${r}`, currentUser?.username);
    toast2(u.username + ' is now ' + r);
    load();
  };
  const changePw = async () => {
    if (newPw.length < 6) {
      alert('Min 6 chars.');
      return;
    }
    const h = await hashPassword(newPw);
    await dbUpdateUser(changePwUser.id, {
      hash: h
    });
    setChangePwUser(null);
    setNewPw('');
    toast2('Password updated.');
  };
  const runSetup = async () => {
    setSetupBusy(true);
    setSetupMsg('Running...');
    const r = await dbSetup();
    setSetupMsg(r.ok ? 'OK: ' + r.msg : 'Error: ' + r.msg);
    setSetupBusy(false);
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
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, u.email || '--')), /*#__PURE__*/React.createElement("td", {
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
    const log = LS.get('auditlog') || [];
    const actionColor = {role_change: INFO, delete_ce: ERR, save_ce: OK, xlsx_import: ACC};
    return /*#__PURE__*/React.createElement(React.Fragment, null,
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:10}},
        /*#__PURE__*/React.createElement("span", {style:{fontWeight:700,fontSize:13}}, "Audit Log"),
        /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, log.length + " entries"),
        log.length > 0 && /*#__PURE__*/React.createElement("button", {
          style:{...btn('danger',true),fontSize:11,marginLeft:'auto'},
          onClick:()=>{ if(confirm('Clear audit log?')){LS.set('auditlog',[]);toast2('Audit log cleared.');} }
        }, "Clear Log")
      ),
      log.length === 0
        ? /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:12}}, "No audit events yet.")
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
  ), USE_SP && /*#__PURE__*/React.createElement("div", {
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
