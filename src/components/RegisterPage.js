function RegisterPage({
  onBack
}) {
  const [f, setF] = useState({
    name: '',
    username: '',
    email: '',
    pw: '',
    pw2: ''
  });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const upd = k => e => setF(p => ({
    ...p,
    [k]: e.target.value
  }));
  const go = async e => {
    e.preventDefault();
    if (!f.name.trim() || !f.username.trim() || !f.pw) {
      setErr('Name, username and password required.');
      return;
    }
    if (f.pw !== f.pw2) {
      setErr('Passwords do not match.');
      return;
    }
    if (f.pw.length < 6) {
      setErr('Password must be at least 6 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_.\-]+$/.test(f.username)) {
      setErr('Username: letters, numbers, _ . - only.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const users = await dbGetUsers();
      if (users.find(u => u.username.toLowerCase() === f.username.toLowerCase())) {
        setErr('Username already taken.');
        setBusy(false);
        return;
      }
      const h = await hashPassword(f.pw);
      await dbCreateUser({
        username: f.username.trim(),
        name: f.name.trim(),
        hash: h,
        role: 'user',
        status: 'pending',
        email: f.email.trim(),
        createdAt: new Date().toISOString()
      });
      setDone(true);
    } catch (e) {
      setErr('Registration failed: ' + e.message);
    }
    setBusy(false);
  };
  if (done) return /*#__PURE__*/React.createElement("div", {
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
      maxWidth: 400,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 40,
      marginBottom: 14
    }
  }, "OK!"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 18,
      marginBottom: 8
    }
  }, "Request Submitted"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 13,
      marginBottom: 22,
      lineHeight: 1.6
    }
  }, "Your account is pending admin approval. You will be able to log in once approved."), /*#__PURE__*/React.createElement("button", {
    style: btn('def'),
    onClick: onBack
  }, "Back to Login")));
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
      maxWidth: 420
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: ACC,
      color: '#000',
      fontWeight: 800,
      fontSize: 11,
      padding: '3px 9px',
      borderRadius: 5
    }
  }, "SHIC"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800,
      fontSize: 18
    }
  }, "Request Access")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 12
    }
  }, "An admin will approve your account.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      border: `1px solid ${BDR}`,
      borderRadius: 10,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: go
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1/-1',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Full Name"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: f.name,
    onChange: upd('name'),
    autoFocus: true,
    placeholder: "Your full name"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Username"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: f.username,
    onChange: upd('username'),
    placeholder: "e.g. jdelacruz"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Email (optional)"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: f.email,
    onChange: upd('email'),
    type: "email",
    placeholder: "work email"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Password"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    type: "password",
    value: f.pw,
    onChange: upd('pw'),
    placeholder: "Min. 6 chars"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Confirm Password"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    type: "password",
    value: f.pw2,
    onChange: upd('pw2'),
    placeholder: "Repeat"
  }))), err && /*#__PURE__*/React.createElement("div", {
    style: {
      background: ERR + '18',
      border: `1px solid ${ERR}44`,
      borderRadius: 6,
      padding: '7px 12px',
      color: ERR,
      fontSize: 12,
      marginBottom: 10
    }
  }, err), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      ...btn('acc'),
      width: '100%',
      justifyContent: 'center',
      padding: '10px 0',
      marginBottom: 10
    },
    disabled: busy
  }, busy ? 'Submitting...' : 'Submit Request')), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      fontSize: 12,
      fontFamily: 'inherit'
    }
  }, "Back to Login")))));
}

/* ======================================================
   ADMIN PANEL
   ====================================================== */

/* &#9472;&#9472; Auto-create SP lists on first connect &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; */
async function spCreateList(name, token, digest){
  const su=getSiteURL();
  /* Check if list exists */
  try{
    const r=await fetch(`${su}/_api/web/lists/getbytitle('${name}')`,
      {credentials:'omit',headers:{'Accept':'application/json;odata=nometadata','Authorization':'Bearer '+token}});
    if(r.ok)return false; /* already exists */
  }catch(e){}
  /* Create list */
  const r=await fetch(`${su}/_api/web/lists`,{
    method:'POST',credentials:'omit',
    headers:{'Accept':'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata',
             'X-RequestDigest':digest,'Authorization':'Bearer '+token},
    body:JSON.stringify({'__metadata':{'type':'SP.List'},'BaseTemplate':100,'Title':name,'Description':'SHIC Cost Estimator - auto-created'})
  });
  if(!r.ok){const t=await r.text();throw new Error('Create list '+name+': '+r.status+' '+t.slice(0,100));}
  return true; /* created */
}

async function spAddField(listName, fieldName, fieldType, token, digest){
  const su=getSiteURL();
  /* fieldType: 2=text, 3=note, 9=number */
  const body={'__metadata':{'type':'SP.Field'},'FieldTypeKind':fieldType,'Title':fieldName};
  if(fieldType===3)body.NumberOfLines=100; /* multi-line */
  const r=await fetch(`${su}/_api/web/lists/getbytitle('${listName}')/fields`,{
    method:'POST',credentials:'omit',
    headers:{'Accept':'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata',
             'X-RequestDigest':digest,'Authorization':'Bearer '+token},
    body:JSON.stringify(body)
  });
  /* Ignore 'field already exists' errors */
  if(!r.ok){const t=await r.text();if(!t.includes('already exists')&&!t.includes('duplicate'))console.warn('addField',fieldName,r.status);}
}

async function autoSetupSP(progressCb){
  const tok=await getSPToken();
  if(!tok)throw new Error('Not authenticated');
  const{digest}=await spDigest();
  const pfx=spList('').replace(/_$/,''); /* get prefix without suffix */

  const lists={
    [spList('Users')]:    [[2,'shicName'],[3,'shicHash'],[2,'shicRole'],[2,'shicStatus'],[2,'shicEmail']],
    [spList('CEs')]:      [[2,'shicType'],[2,'shicClient'],[3,'shicDesc'],[9,'shicTotal'],[2,'shicSavedBy'],[2,'shicSavedAt'],[3,'shicScope'],[3,'shicNotes'],[3,'shicApprovers'],[3,'shicMob'],[3,'shicDemob'],[3,'shicMisc']],
    [spList('CE_MP')]:    [[9,'shicCEId'],[2,'shicRole'],[9,'shicRate'],[2,'shicShift'],[9,'shicDays'],[9,'shicQty']],
    [spList('CE_Resources')]:[[9,'shicCEId'],[2,'shicTab'],[2,'shicDesc'],[9,'shicQty'],[2,'shicUOM'],[9,'shicCost'],[9,'shicDays']],
    [spList('CE_Documents')]:[[9,'shicCEId'],[2,'shicFileName'],[2,'shicFileType'],[3,'shicFileData']],
    [spList('Monitoring')]:  [[9,'shicCEId'],[3,'shicMonData']],
    [spList('Masterlist')]:  [[3,'shicData']],
    [spList('SowLib')]:      [[3,'shicData']],
    [spList('Companies')]:   [[3,'shicData']],
    [spList('Drafts')]:      [[2,'shicSavedBy'],[3,'shicData']]
  };

  const names=Object.keys(lists);
  let created=0,skipped=0;
  for(let i=0;i<names.length;i++){
    const name=names[i];
    const fields=lists[name];
    progressCb&&progressCb({step:'list',msg:'Setting up '+name+'...',progress:(i/names.length)});
    try{
      const wasCreated=await spCreateList(name,tok,digest);
      if(wasCreated){
        /* Add columns */
        for(const[type,fname]of fields){
          await spAddField(name,fname,type,tok,digest);
          /* Small delay to avoid SP throttling */
          await new Promise(r=>setTimeout(r,200));
        }
        created++;
      }else{skipped++;}
    }catch(e){console.warn('Setup list',name,e.message);}
  }
  progressCb&&progressCb({step:'done',msg:'Done! '+created+' lists created, '+skipped+' already existed.',progress:1});
  return{created,skipped};
}
