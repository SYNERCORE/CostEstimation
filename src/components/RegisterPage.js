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
      /* Access requests are approved in the SharePoint Users list, so this is
         the one action that genuinely cannot be done offline. Say so, rather
         than showing a raw token/fetch error the person cannot act on. */
      const offline = (USE_SP || getSiteURL()) &&
        (navigator.onLine === false || /not signed in|auth token|Failed to fetch|NetworkError/i.test(e.message || ''));
      setErr(offline
        ? 'Registration needs a connection — access requests are approved centrally and cannot be queued offline. Reconnect and try again.'
        : 'Registration failed: ' + e.message);
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
/* POST to the SharePoint REST API.
   The old code sent an "__metadata" property while declaring
   odata=nometadata, which SharePoint rejects with InvalidClientQueryException --
   that is why list and column creation was failing. nometadata does not want
   __metadata at all. Some older on-prem farms only accept the verbose form, so
   fall back to that on a 400 rather than guessing which one a tenant needs. */
/* The delegated permissions actually carried by the access token, read from its
   "scp" claim. The app asks for <site>/.default, which grants whatever the Azure
   AD app registration was configured with -- NOT what the signed-in user can do.
   So a site owner still gets 403 on schema changes if the registration only has
   AllSites.Write. Showing the real scopes turns that into a five-second answer.
   Only the scope claim is read; the token itself is never displayed or sent. */
function spTokenScopes(tok){
  try{
    const seg=String(tok).split('.')[1];
    if(!seg)return '';
    const p=JSON.parse(atob(seg.replace(/-/g,'+').replace(/_/g,'/')));
    return p.scp || (Array.isArray(p.roles) ? p.roles.join(' ') : '') || '';
  }catch(_){return '';}
}
/* SharePoint wraps the useful text in error.message.value (or odata.error...).
   Truncating the raw JSON hid the actual reason behind boilerplate. */
function spErrText(t){
  try{
    const j=JSON.parse(t);
    const e=j.error||j['odata.error'];
    const v=e&&e.message&&(e.message.value||e.message);
    if(v)return String(v);
  }catch(_){}
  return String(t||'').slice(0,200);
}
async function spRestPost(url, payload, spType, token, digest, verboseExtra, preferVerbose){
  const attempt = async verbose => {
    /* verboseExtra holds properties that only exist on the concrete type, so
       they can only be sent once __metadata names that type. */
    const body = verbose ? {...payload, ...(verboseExtra||{}), __metadata:{type:spType}} : payload;
    const ct = verbose ? 'application/json;odata=verbose' : 'application/json;odata=nometadata';
    const r = await fetch(url,{
      method:'POST',credentials:'omit',
      headers:{'Accept':ct,'Content-Type':ct,'X-RequestDigest':digest,'Authorization':'Bearer '+token},
      body:JSON.stringify(body)
    });
    return {ok:r.ok, status:r.status, text:r.ok ? '' : await r.text()};
  };
  /* Default order is plain-then-verbose. Callers that must land type-specific
     properties (multi-line columns need RichText:false or SharePoint HTML-wraps
     the JSON we store in them) ask for verbose first, keeping plain as the
     fallback for tenants that reject the verbose form. */
  const first = !!preferVerbose;
  let res = await attempt(first);
  if(!res.ok && (res.status === 400 || res.status === 415)) res = await attempt(!first);
  return res;
}
/* Existing field names for a list (lower-cased internal names AND titles), or
   null if the list is missing/unreadable. Lets setup add only what is absent
   instead of POSTing every column and collecting a 400 for each one. */
async function spGetFieldNames(listName, token){
  const su=getSiteURL();
  try{
    const r=await fetch(`${su}/_api/web/lists/getbytitle('${listName}')/fields?$select=InternalName,Title&$top=500`,
      {credentials:'omit',headers:{'Accept':'application/json;odata=nometadata','Authorization':'Bearer '+token}});
    if(!r.ok)return null;
    const j=await r.json();
    const set=new Set();
    (j.value||[]).forEach(f=>{
      if(f.InternalName)set.add(String(f.InternalName).toLowerCase());
      if(f.Title)set.add(String(f.Title).toLowerCase());
    });
    return set;
  }catch(e){return null;}
}
async function spCreateList(name, token, digest){
  const su=getSiteURL();
  /* Check if list exists */
  try{
    const r=await fetch(`${su}/_api/web/lists/getbytitle('${name}')`,
      {credentials:'omit',headers:{'Accept':'application/json;odata=nometadata','Authorization':'Bearer '+token}});
    if(r.ok)return false; /* already exists */
  }catch(e){}
  /* Create list */
  const res=await spRestPost(`${su}/_api/web/lists`,
    {BaseTemplate:100,Title:name,Description:'SHIC Cost Estimator - auto-created'},
    'SP.List',token,digest);
  if(!res.ok)throw new Error('Create list '+name+': '+res.status+' '+spErrText(res.text));
  return true; /* created */
}

/* Returns {ok} or {ok:false, err} so setup can report a real total instead of
   scattering console warnings. A duplicate field is treated as success. */
const SP_FIELD_TYPE={2:'SP.FieldText',3:'SP.FieldMultiLineText',9:'SP.FieldNumber'};
/* Index a column so it can still be filtered once the list passes 5,000 items.

   SharePoint's list view threshold makes a $filter on a NON-INDEXED column
   fail above that size, and reports it as a 500 -- so it reads as an outage
   rather than a limit. The CE line-item lists hold roughly thirty rows per CE,
   so at ~170 CEs they are already over it and every "load this CE" read breaks.
   Nothing in this app ever created an index, so every site reaches that wall.

   The index has to be set with MERGE on the existing field, and only the
   verbose form carries a type, so it goes through the same plain/verbose dance
   as field creation. */
async function spIndexField(listName, fieldName, fieldType, token, digest){
  const su=getSiteURL();
  const url=`${su}/_api/web/lists/getbytitle('${listName}')/fields/getbytitle('${fieldName}')`;
  const attempt=async verbose=>{
    const ct=verbose?'application/json;odata=verbose':'application/json;odata=nometadata';
    const body=verbose?{__metadata:{type:SP_FIELD_TYPE[fieldType]||'SP.Field'},Indexed:true}:{Indexed:true};
    const r=await fetch(url,{
      method:'POST',credentials:'omit',
      headers:{'Accept':ct,'Content-Type':ct,'X-RequestDigest':digest,'Authorization':'Bearer '+token,
               'X-HTTP-Method':'MERGE','IF-MATCH':'*'},
      body:JSON.stringify(body)
    });
    return {ok:r.ok,status:r.status,text:r.ok?'':await r.text()};
  };
  let res=await attempt(true);
  if(!res.ok&&(res.status===400||res.status===415))res=await attempt(false);
  if(res.ok)return{ok:true};
  /* Already indexed reads as success -- re-running setup must stay harmless. */
  if(/already indexed|duplicate/i.test(res.text||''))return{ok:true,existed:true};
  return{ok:false,status:res.status,err:fieldName+' index: '+res.status+' '+spErrText(res.text||'')};
}
async function spAddField(listName, fieldName, fieldType, token, digest){
  const su=getSiteURL();
  /* fieldType: 2=text, 3=note, 9=number */
  const payload={FieldTypeKind:fieldType,Title:fieldName};
  /* NumberOfLines and RichText exist only on SP.FieldMultiLineText. Sending
     them on the plain request makes SharePoint validate against the base
     SP.Field and reject with "The property 'NumberOfLines' does not exist ...
     use property names that are defined by the type" — which is exactly why
     every multi-line column (shicSOW, shicDetail, ...) failed while text and
     number columns succeeded. They now ride only on the verbose attempt, where
     __metadata names the concrete type.
     RichText:false matters: these columns hold JSON, and a rich-text column
     would wrap it in HTML and break the round-trip. */
  const isNote = fieldType===3;
  const verboseExtra = isNote ? {NumberOfLines:20, RichText:false} : null;
  const res=await spRestPost(`${su}/_api/web/lists/getbytitle('${listName}')/fields`,payload,
    SP_FIELD_TYPE[fieldType]||'SP.Field',token,digest,verboseExtra,isNote);
  if(res.ok)return{ok:true};
  const t=res.text||'';
  if(/already exist|duplicate/i.test(t))return{ok:true,existed:true};
  return{ok:false,status:res.status,err:fieldName+': '+res.status+' '+spErrText(t)};
}

async function autoSetupSP(progressCb){
  const tok=await getSPToken({interactive:true});
  if(!tok)throw new Error('Not authenticated');
  const{digest}=await spDigest();
  const pfx=spList('').replace(/_$/,''); /* get prefix without suffix */

  const lists={
    [spList('Users')]:    [[2,'shicName'],[3,'shicHash'],[2,'shicRole'],[2,'shicStatus'],[2,'shicEmail']],
    [spList('CEs')]:      [[2,'shicType'],[2,'shicClient'],[3,'shicDesc'],[9,'shicTotal'],[2,'shicSavedBy'],[2,'shicSavedAt'],[3,'shicScope'],[3,'shicNotes'],[3,'shicApprovers'],[3,'shicMob'],[3,'shicDemob'],[3,'shicMisc'],[3,'shicSOW'],[3,'shicInfo']],
    /* shicPax / shicOTHours / shicPerDiem were added to the manpower payload
       long before they were added here, so no site had the columns and EVERY
       CE_MP insert came back 400 InvalidClientQueryException. The CE header had
       already been written by then, leaving SharePoint holding a CE with a
       total and no manpower behind it. tools/check-sp-schema.js now fails the
       build if a payload and this list ever drift apart again.
       shicQty stays: rows written before shicPax existed keep their pax there. */
    [spList('CE_MP')]:    [[9,'shicCEId'],[2,'shicRole'],[9,'shicRate'],[2,'shicShift'],[9,'shicDays'],[9,'shicQty'],[9,'shicPax'],[9,'shicOTHours'],[9,'shicPerDiem'],[2,'shicTaskId'],[3,'shicShares']],
    [spList('CE_Resources')]:[[9,'shicCEId'],[2,'shicTab'],[2,'shicDesc'],[9,'shicQty'],[2,'shicUOM'],[9,'shicCost'],[9,'shicDays'],[2,'shicTaskId'],[3,'shicShares']],
    [spList('CE_Documents')]:[[9,'shicCEId'],[2,'shicFileName'],[2,'shicFileType'],[3,'shicFileData']],
    [spList('Monitoring')]:  [[9,'shicCEId'],[3,'shicMonData']],
    [spList('Masterlist')]:  [[3,'shicData']],
    [spList('SowLib')]:      [[3,'shicData']],
    [spList('Companies')]:   [[3,'shicData']],
    [spList('Drafts')]:      [[2,'shicSavedBy'],[3,'shicData']],
    [spList('AuditLog')]:   [[2,'shicAction'],[3,'shicDetail'],[2,'shicUser'],[2,'shicTs']],
    /* The document-analysis feature has been reading and writing this list
       since it shipped, on a site where nothing ever created it. */
    [spList('ML_Imports')]: [[3,'shicData']]
  };

  /* Every column the app ever puts in a $filter. These are the only ones the
     view threshold can break, and each of these lists grows without bound. */
  const INDEXED={
    [spList('CEs')]:['Title'],
    [spList('CE_MP')]:['shicCEId'],
    [spList('CE_Resources')]:['shicCEId'],
    [spList('CE_Documents')]:['shicCEId'],
    [spList('Monitoring')]:['shicCEId'],
    [spList('Drafts')]:['Title'],
    [spList('ML_Imports')]:['Title']
  };
  const names=Object.keys(lists);
  let created=0,skipped=0,added=0,indexed=0;
  const errors=[];
  for(let i=0;i<names.length;i++){
    const name=names[i];
    const fields=lists[name];
    progressCb&&progressCb({step:'list',msg:'Setting up '+name+'...',progress:(i/names.length)});
    try{
      const wasCreated=await spCreateList(name,tok,digest);
      if(wasCreated){created++;}else{skipped++;}
      /* Columns are ensured on every run, not just on creation -- that is the
         only way a site set up by an older version ever receives a newly added
         column. Read the existing fields first and add only what is missing, so
         a routine re-run costs one request per list instead of one failing
         request per column. */
      const existing=wasCreated?null:await spGetFieldNames(name,tok);
      const missing=fields.filter(([,fname])=>!existing||!existing.has(fname.toLowerCase()));
      for(const[type,fname]of missing){
        const r=await spAddField(name,fname,type,tok,digest);
        if(r.ok){ if(!r.existed)added++; } else errors.push(name+' / '+r.err);
        /* Small delay to avoid SP throttling */
        await new Promise(r=>setTimeout(r,200));
      }
      /* Indexed on every run, not just when the column is new: sites set up by
         an earlier version have the column but no index, which is precisely
         the state that breaks once they pass 5,000 rows. */
      for(const fname of (INDEXED[name]||[])){
        /* Title is built in, so it is not in the provisioning list and falls to
           the default. It is text -- naming it a number would make the verbose
           attempt fail and leave only the untyped fallback to do the work. */
        const t=(fields.find(([,fn])=>fn===fname)||[])[0]||2;
        const r=await spIndexField(name,fname,t,tok,digest);
        if(r.ok){ if(!r.existed)indexed++; } else errors.push(name+' / '+r.err);
        await new Promise(r=>setTimeout(r,200));
      }
    }catch(e){errors.push(name+': '+e.message);}
  }
  let msg='Done! '+created+' list(s) created, '+skipped+' already existed, '+added+' column(s) added, '+indexed+' column(s) indexed.';
  /* A 403 here is not a bug in the app -- the signed-in account cannot change
     the site's schema. Say so plainly instead of showing raw SharePoint JSON,
     because no amount of retrying will fix it. */
  const denied=errors.some(e=>/403|access is denied|unauthorized/i.test(e));
  if(denied){
    const scopes=spTokenScopes(tok);
    const canManage=/AllSites\.(Manage|FullControl)|Sites\.(Manage|FullControl)\.All/i.test(scopes);
    msg+=' ⚠ SharePoint denied permission to create lists/columns.';
    msg+=canManage
      ? ' The token does carry a manage-level scope ('+scopes+'), so this is a site-level permission or a tenant policy, not the app registration.'
      : ' This is the Azure AD app registration, not your site ownership: the app requests <site>/.default, so the token only carries the permissions granted to the registration'+
        (scopes?' — currently: '+scopes:'')+
        '. Add the SharePoint DELEGATED permission "AllSites.Manage" (or FullControl) to the app registration, grant admin consent, then Sign Out and back in so a new token is issued.';
  }else if(errors.length){
    msg+=' '+errors.length+' problem(s): '+errors.slice(0,3).join(' | ')+(errors.length>3?' ...':'');
  }
  if(errors.length)console.warn('SharePoint setup problems:',errors);
  progressCb&&progressCb({step:'done',msg,progress:1,denied});
  return{created,skipped,added,errors,denied};
}
