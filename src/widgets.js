function OnlinePill(){const[on,setOn]=React.useState(navigator.onLine);const[q,setQ]=React.useState(0);React.useEffect(()=>{const a=()=>setOn(true),b=()=>setOn(false);window.addEventListener('shic-online',a);window.addEventListener('shic-offline',b);/* Was _spQueue.length, which nothing ever pushed to -- the count was permanently 0 while real work sat unsynced. Count the CEs actually waiting to upload. */const poll=()=>{try{dbPendingCount().then(n=>setQ(n)).catch(()=>{});}catch(_e){}};poll();const t=setInterval(poll,10000);return()=>{window.removeEventListener('shic-online',a);window.removeEventListener('shic-offline',b);clearInterval(t);};},[]);const c=on?OK:'#F59E0B';return React.createElement('span',{title:on?(q?q+' CE(s) saved here not yet uploaded':'Connected — everything uploaded'):(q?'Offline — '+q+' CE(s) waiting to upload':'Offline'),style:{display:'flex',alignItems:'center',gap:4,fontSize:10,padding:'2px 8px',borderRadius:10,background:c+'22',color:c,border:'1px solid '+c+'44',cursor:'default',userSelect:'none',flexShrink:0}},React.createElement('span',{style:{width:6,height:6,borderRadius:'50%',background:c,display:'inline-block'}}),on?(q?q+' to upload':'Online'):'Offline');}
/* A SharePoint token lasts about an hour. When the silent refresh fails, every
   list read starts failing while the app still looks online — and because
   background reads deliberately never prompt (an unattended redirect would
   throw away the CE being edited), there was nothing to click and no way back
   in short of a reload. This is that way back. */
/* A permission refusal is NOT a session problem and no amount of signing in
   again will clear it, so it needs its own banner. Without one the app quietly
   drops to the local copy and the person carries on for days, their accounts
   and CEs drifting further from SharePoint, with nothing on screen to explain
   why -- which is what "it only works if you make them an admin" looks like
   from the user's side. */
function SPDeniedBanner() {
  const [hit, setHit] = React.useState(null);
  React.useEffect(() => {
    const on = e => setHit((e && e.detail) || { list: 'a SharePoint list', op: 'use' });
    window.addEventListener('shic-sp-denied', on);
    return () => window.removeEventListener('shic-sp-denied', on);
  }, []);
  if (!hit) return null;
  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 14px', background: ERR + '18', borderBottom: '1px solid ' + ERR + '44', color: ERR, fontSize: 12 }
  },
    React.createElement('span', { style: { fontWeight: 700 } }, 'SharePoint denied access'),
    React.createElement('span', { style: { color: MT } },
      'Your Microsoft account cannot ' + (hit.op === 'read' ? 'read' : 'write to') + ' "' + hit.list +
      '", so this device is working from its own copy and changes are not reaching the team. ' +
      'A site owner needs to give you Contribute on that list — signing in again will not help.'),
    React.createElement('button', {
      style: { ...btn('def', true), marginLeft: 'auto' }, onClick: () => setHit(null)
    }, 'Dismiss')
  );
}
function SignInBanner() {
  const [need, setNeed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const up = () => setNeed(spNeedsSignIn());
    window.addEventListener('shic-auth-required', up);
    window.addEventListener('shic-auth-ok', up);
    up();
    const t = setInterval(up, 5000);
    return () => { window.removeEventListener('shic-auth-required', up); window.removeEventListener('shic-auth-ok', up); clearInterval(t); };
  }, []);
  if (!need) return null;
  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 14px', background: '#F59E0B18', borderBottom: '1px solid #F59E0B44', color: '#F59E0B', fontSize: 12 }
  },
    React.createElement('span', { style: { fontWeight: 700 } }, 'SharePoint session expired'),
    React.createElement('span', { style: { color: MT } },
      'Saved work is kept on this device and will upload once you sign in again.'),
    React.createElement('button', {
      style: { ...btn('acc', true), marginLeft: 'auto' }, disabled: busy,
      onClick: async () => {
        setBusy(true);
        try {
          if (await spSignIn()) {
            setNeed(false);
            if (window._shicFullRefresh) await window._shicFullRefresh();
            if (window._shicToast) window._shicToast('Signed back in — refreshing your data.');
          }
        } catch (e) { if (window._shicToast) window._shicToast('Sign-in failed: ' + (e.message || e), true); }
        setBusy(false);
      }
    }, busy ? 'Opening Microsoft sign-in…' : 'Sign in')
  );
}
function SyncStatusBar() {
  const [sync, setSync] = React.useState(() => getSyncStatus());
  React.useEffect(() => {
    const h = () => setSync({...getSyncStatus()});
    window.addEventListener('shic:sync:updated', h);
    return () => window.removeEventListener('shic:sync:updated', h);
  }, []);

  const spColor = sync.sp === 'connected' ? OK : sync.sp === 'error' ? ERR : '#F59E0B';
  const spLabel = sync.sp === 'connected' ? '✓ SP' : sync.sp === 'error' ? '✗ SP Error' : '○ SP';

  const lastSync = sync.lastSyncAt ? (() => {
    const mins = Math.round((Date.now() - new Date(sync.lastSyncAt)) / 60000);
    return mins < 1 ? 'just now' : mins < 60 ? mins + 'm ago' : Math.round(mins/60) + 'h ago';
  })() : 'never';

  const entityColor = s => s === 'synced' ? OK : s === 'error' ? ERR : s === 'saving' ? '#F59E0B' : BDR;
  const entityIcon  = s => s === 'synced' ? '✓' : s === 'error' ? '✗' : s === 'saving' ? '↻' : '○';

  const entities = [
    {key:'masterlist', label:'Masterlist'},
    {key:'monitoring', label:'Monitoring'},
    {key:'sowlib',     label:'Scope Lib'},
    {key:'drafts',     label:'Drafts'},
  ];

  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '3px 14px',
      background: CARD, borderBottom: `1px solid ${BDR}`,
      fontSize: 10, color: MT, flexWrap: 'wrap'
    }
  },
    /* SP pill */
    React.createElement('span', {
      title: 'SharePoint connection',
      style:{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:10,
             background:spColor+'22',color:spColor,border:'1px solid '+spColor+'44',fontWeight:700}
    }, spLabel),

    /* divider */
    React.createElement('span', {style:{color:BDR}}, '|'),

    /* per-entity pills */
    ...entities.map(({key, label}) => {
      const s = sync[key] || 'unknown';
      const c = entityColor(s);
      return React.createElement('span', {
        key,
        title: label + ': ' + s,
        style:{display:'flex',alignItems:'center',gap:3,color:c,opacity: s==='unknown'?0.4:1}
      }, entityIcon(s), ' ', label);
    }),

    /* divider */
    React.createElement('span', {style:{color:BDR}}, '|'),

    /* last sync */
    React.createElement('span', {title:'Last successful sync'}, '🕐 ' + lastSync),

    /* draft auto-save time */
    sync.lastDraftSaveAt && React.createElement('span', {
      title: 'Last draft auto-save: ' + new Date(sync.lastDraftSaveAt).toLocaleTimeString(),
      style:{color:MT}
    }, '📝 Draft: ' + (() => { const mins=Math.round((Date.now()-new Date(sync.lastDraftSaveAt))/60000); return mins<1?'just now':mins+'m ago'; })()),

    /* dirty */
    sync.dirty && React.createElement('span', {style:{color:'#F59E0B',fontWeight:700}}, '● Unsaved'),

    /* stale */
    sync.stale && React.createElement('span', {style:{color:ERR,fontWeight:700}}, '⚠ Stale'),

    /* refresh */
    React.createElement('button', {
      onClick: async () => {
        setSyncStatus({sp:'unknown', masterlist:'saving', monitoring:'saving', drafts:'saving'});
        try {
          if (window._shicFullRefresh) {
            await window._shicFullRefresh();
          } else {
            /* Fallback if called before app fully initialised */
            const [ml, mon, drafts] = await Promise.all([dbGetML(), dbGetMon(), dbGetDrafts()]);
            setSyncStatus({
              sp: 'connected', lastSyncAt: new Date().toISOString(), dirty: false,
              masterlist: ml ? 'synced' : 'local',
              monitoring: (mon && !mon.empty) ? 'synced' : 'local',
              drafts: drafts && drafts.length >= 0 ? 'synced' : 'local',
            });
          }
          (window._shicToast||console.log)('All data refreshed from SharePoint.');
        } catch(e) {
          setSyncStatus({sp:'error', masterlist:'error', monitoring:'error', drafts:'error'});
          (window._shicToast||console.log)('SharePoint sync failed.', true);
        }
      },
      title: 'Refresh all from SharePoint',
      style:{marginLeft:'auto',background:'none',border:`1px solid ${BDR}`,color:MT,
             borderRadius:6,padding:'2px 8px',cursor:'pointer',fontSize:10,whiteSpace:'nowrap'}
    }, '↻ Refresh')
  );
}
function AuthGate() {
  const [page, setPage] = useState('loading');
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    (async () => {
      const s = session.get();
      if (s) {
        /* The session is plain JSON in sessionStorage, so its `role` is only as
           trustworthy as the browser. Re-read the role (and approval status)
           from the user store before granting the admin UI, so editing the
           session blob no longer unlocks it. SharePoint list permissions remain
           the real boundary for the data itself — this closes the UI gap, it is
           not a substitute for server-side authorisation. */
        let u = s;
        try {
          const all = await dbGetUsers();
          const rec = (all || []).find(x => x && x.username === s.username);
          if (rec) {
            if (rec.status && rec.status !== 'approved') {
              session.clear();
              setPage('login');
              return;
            }
            u = { ...s, role: rec.role, name: rec.name || s.name };
            if (rec.role !== s.role) session.set(u);
          }
        } catch (_e) { /* offline: fall back to the cached session */ }
        setCurrentUser(u);
        setPage('app');
        return;
      }
      await ensureAdmin();
      setPage('login');
    })();
  }, []);
  const doLogin = u => {
    setCurrentUser(u);
    setPage('app');
  };
  const doLogout = () => {
    session.clear();
    setCurrentUser(null);
    setPage('login');
  };
  useEffect(() => {
    if (page !== 'app') return;
    const TIMEOUT = 2 * 60 * 60 * 1000;
    let last = Date.now();
    const reset = () => { last = Date.now(); };
    ['mousemove','keydown','click','touchstart'].forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    const timer = setInterval(() => { if (Date.now() - last > TIMEOUT) doLogout(); }, 60000);
    return () => {
      clearInterval(timer);
      ['mousemove','keydown','click','touchstart'].forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [page]);
  if (page === 'loading') return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0D1117',
      gap: 10,
      color: '#7D8590',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: '#F0A429',
      color: '#000',
      fontWeight: 800,
      padding: '4px 10px',
      borderRadius: 5,
      fontSize: 11
    }
  }, "SHIC"), "Loading...");
  if (page === 'login') return /*#__PURE__*/React.createElement(LoginPage, {
    onLogin: doLogin,
    onRegister: () => setPage('register')
  });
  if (page === 'register') return /*#__PURE__*/React.createElement(RegisterPage, {
    onBack: () => setPage('login')
  });
  if (page === 'app' && currentUser) return /*#__PURE__*/React.createElement(App, {
    currentUser: currentUser,
    onLogout: doLogout
  });
  return null;
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(AppBoundary, null, /*#__PURE__*/React.createElement(AuthGate, null)));











window.SHIC_ML=(function(){
  function tokenize(txt){return(txt||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);}
  function cosineSim(a,b){var ta=tokenize(a),tb=tokenize(b);if(!ta.length||!tb.length)return 0;var all=[].concat(ta,tb).filter(function(v,i,s){return s.indexOf(v)===i;});var va=all.map(function(w){return ta.filter(function(x){return x===w;}).length;});var vb=all.map(function(w){return tb.filter(function(x){return x===w;}).length;});var dot=va.reduce(function(s,v,i){return s+v*vb[i];},0);var magA=Math.sqrt(va.reduce(function(s,v){return s+v*v;},0));var magB=Math.sqrt(vb.reduce(function(s,v){return s+v*v;},0));return(magA&&magB)?dot/(magA*magB):0;}
  function suggestRates(role){var hist=window.shicHistory||[];var rates=[];hist.forEach(function(ce){(ce.mp||[]).forEach(function(r){if(r.role&&r.rate&&cosineSim(r.role,role)>0.6)rates.push({rate:Number(r.rate),role:r.role,ceNum:(ce.info&&ce.info.ceNum)||'',savedAt:ce.savedAt||''});});});if(!rates.length)return null;rates.sort(function(a,b){return new Date(b.savedAt)-new Date(a.savedAt);});var avg=Math.round(rates.reduce(function(s,r){return s+r.rate;},0)/rates.length);return{avg:avg,latest:rates[0].rate,min:Math.min.apply(null,rates.map(function(r){return r.rate;})),max:Math.max.apply(null,rates.map(function(r){return r.rate;})),count:rates.length,samples:rates.slice(0,3)};}
  function predictCost(scope){var hist=window.shicHistory||[];var similar=[];hist.forEach(function(ce){var desc=(ce.info&&ce.info.description)||(ce.info&&ce.info.ceNum)||'';var sim=cosineSim(desc,scope);if(sim>0.1&&ce.grand>0)similar.push({sim:sim,grand:Number(ce.grand),ceNum:(ce.info&&ce.info.ceNum)||''});});if(!similar.length)return null;similar.sort(function(a,b){return b.sim-a.sim;});var top=similar.slice(0,5);var wtSum=top.reduce(function(s,e){return s+e.sim;},0);var predicted=Math.round(top.reduce(function(s,e){return s+e.grand*e.sim;},0)/wtSum);return{predicted:predicted,confidence:Math.min(Math.round(top[0].sim*100),95),topMatches:top.slice(0,3),count:similar.length};}
  function matchScope(scope,limit){var hist=window.shicHistory||[];var matches=[];hist.forEach(function(ce){var desc=(ce.info&&ce.info.description)||'';var sim=cosineSim(desc,scope);if(sim>0.1)matches.push({sim:sim,ceNum:(ce.info&&ce.info.ceNum)||'',client:(ce.info&&ce.info.client)||'',description:desc,grand:ce.grand||0,mp:(ce.mp||[]).map(function(r){return r.role;}).filter(Boolean)});});matches.sort(function(a,b){return b.sim-a.sim;});return matches.slice(0,limit||5);}
  function detectAnomalies(mp,tools,mats,ml){var anomalies=[];var master=ml||window.shicMasterlist||{};(mp||[]).forEach(function(r){if(!r.rate)return;var ref=(master.manpower||[]).find(function(m){return cosineSim(m.role,r.role)>0.7;});if(ref&&ref.rate){var ratio=Number(r.rate)/Number(ref.rate);if(ratio>1.5)anomalies.push({type:'rate_high',item:r.role,value:r.rate,expected:ref.rate,ratio:Math.round(ratio*100)+'%',tab:'manpower'});else if(ratio<0.5)anomalies.push({type:'rate_low',item:r.role,value:r.rate,expected:ref.rate,ratio:Math.round(ratio*100)+'%',tab:'manpower'});}});return anomalies;}
  return{suggestRates:suggestRates,predictCost:predictCost,matchScope:matchScope,detectAnomalies:detectAnomalies,cosineSim:cosineSim};
})();











