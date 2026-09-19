function OnlinePill(){const[on,setOn]=React.useState(navigator.onLine);const[q,setQ]=React.useState(0);React.useEffect(()=>{const a=()=>setOn(true),b=()=>setOn(false);window.addEventListener('shic-online',a);window.addEventListener('shic-offline',b);/* Was _spQueue.length, which nothing ever pushed to -- the count was permanently 0 while real work sat unsynced. Count the CEs actually waiting to upload. */const poll=()=>{try{dbPendingCount().then(n=>setQ(n)).catch(()=>{});}catch(_e){}};poll();const t=setInterval(poll,10000);return()=>{window.removeEventListener('shic-online',a);window.removeEventListener('shic-offline',b);clearInterval(t);};},[]);const c=on?OK:'var(--status-warning)';return React.createElement('span',{title:on?(q?q+' CE(s) saved here not yet uploaded':'Connected — everything uploaded'):(q?'Offline — '+q+' CE(s) waiting to upload':'Offline'),style:{display:'flex',alignItems:'center',gap:4,fontSize:10,padding:'2px 8px',borderRadius:10,background:alpha(c, '22'),color:c,border:'1px solid '+alpha(c, '44'),cursor:'default',userSelect:'none',flexShrink:0}},React.createElement('span',{style:{width:6,height:6,borderRadius:'50%',background:c,display:'inline-block'}}),on?(q?q+' to upload':'Online'):'Offline');}
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
      padding: '8px 14px', background: alpha(ERR, '18'), borderBottom: '1px solid ' + alpha(ERR, '44'), color: ERR, fontSize: 12 }
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
  /* The top-bar button alone was mostly overlooked, so people worked for hours
     believing they were saving to SharePoint. Say it once, in the middle of the
     screen, each time the connection is lost -- then leave the button. */
  const [pop, setPop] = React.useState(null);
  const [off, setOff] = React.useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  React.useEffect(() => {
    const o = () => { setOff(true); setPop('offline'); }, b = () => { setOff(false); setPop(p => p === 'offline' ? null : p); };
    window.addEventListener('offline', o); window.addEventListener('online', b);
    if (navigator.onLine === false) setPop('offline');
    return () => { window.removeEventListener('offline', o); window.removeEventListener('online', b); };
  }, []);
  const _needRef = React.useRef(false);
  React.useEffect(() => { if (need && !_needRef.current && !off) setPop('signin'); if (!need && pop === 'signin') setPop(null); _needRef.current = need; }, [need, off]);
  const doSignIn = async () => {
    setBusy(true);
    try {
      if (await spSignIn()) {
        setNeed(false); setPop(null);
        if (window._shicFullRefresh) await window._shicFullRefresh();
        if (window._shicToast) window._shicToast('Signed back in — refreshing your data.');
      }
    } catch (e) { if (window._shicToast) window._shicToast('Sign-in failed: ' + (e.message || e), true); }
    setBusy(false);
  };
  const dialog = pop && React.createElement('div', {
      role: 'alertdialog', 'aria-modal': true,
      style: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
    React.createElement('div', { style: { background: CARD, color: TX, border: '1px solid ' + BDR, borderRadius: 12, padding: 22, maxWidth: 420, width: '100%', boxShadow: '0 12px 40px rgba(0,0,0,.4)' } },
      React.createElement('div', { style: { fontSize: 30, marginBottom: 6 } }, pop === 'offline' ? '📴' : '🔒'),
      React.createElement('div', { style: { fontSize: 16, fontWeight: 700, marginBottom: 8 } },
        pop === 'offline' ? 'You are offline' : 'You are not signed in to SharePoint'),
      React.createElement('div', { style: { fontSize: 13, color: MT, lineHeight: 1.5, marginBottom: 16 } },
        pop === 'offline'
          ? 'This device has no internet connection. You can keep working: anything you save stays on this device and uploads when you are back online. Other people will not see it until then, and you will not see their latest changes.'
          : 'Your Microsoft session has expired. Until you sign in, what you save stays on this device only — approvers and teammates cannot see it, and you are not seeing their latest changes.'),
      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' } },
        React.createElement('button', { style: btn('def'), onClick: () => setPop(null) }, pop === 'offline' ? 'OK, work offline' : 'Later'),
        pop === 'signin' && React.createElement('button', { style: btn('acc'), disabled: busy, onClick: doSignIn }, busy ? 'Opening Microsoft sign-in…' : 'Sign in to Microsoft'))));
  if (!need) return dialog || null;
  /* A button in the top bar, not a banner above it. The banner sat over the
     sticky header and scrolled away with the page, so an expired session was
     easy to miss the moment anyone scrolled down to work. */
  return React.createElement(React.Fragment, null, dialog, React.createElement('button', {
      title: 'SharePoint session expired. Saved work is kept on this device and will upload once you sign in again.',
      style: { ...btn('acc', true), fontSize: 10, whiteSpace: 'nowrap' }, disabled: busy,
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
    }, busy ? 'Opening Microsoft sign-in…' : '⚠ Sign in to Microsoft'));
}
function SyncStatusBar() {
  const [sync, setSync] = React.useState(() => getSyncStatus());
  React.useEffect(() => {
    const h = () => setSync({...getSyncStatus()});
    window.addEventListener('shic:sync:updated', h);
    return () => window.removeEventListener('shic:sync:updated', h);
  }, []);

  const spColor = sync.sp === 'connected' ? OK : sync.sp === 'error' ? ERR : 'var(--status-warning)';
  const spLabel = sync.sp === 'connected' ? '✓ SP' : sync.sp === 'error' ? '✗ SP Error' : '○ SP';

  const lastSync = sync.lastSyncAt ? (() => {
    const mins = Math.round((Date.now() - new Date(sync.lastSyncAt)) / 60000);
    return mins < 1 ? 'just now' : mins < 60 ? mins + 'm ago' : Math.round(mins/60) + 'h ago';
  })() : 'never';

  /* Every state is spelled out and drawn at full strength. Anything not
     synced used to be the border colour at 40% opacity -- unreadable, and
     'local' (this device only) looked the same as 'not loaded yet'. */
  const WARN = 'var(--status-warning)';
  const STATES = {
    synced:  {c: OK,   i: '✓', t: '',                  tip: 'In step with SharePoint.'},
    saving:  {c: WARN, i: '↻', t: ' syncing…',         tip: 'Talking to SharePoint now.'},
    local:   {c: WARN, i: '⚠', t: ' — this device only', tip: 'SharePoint did not return it, so you are seeing the copy saved in this browser. Others may see something different. Press ⟳ to retry.'},
    error:   {c: ERR,  i: '✗', t: ' — sync failed',     tip: 'SharePoint refused or could not be reached. Press ⟳ to retry.'},
    unknown: {c: MT,   i: '○', t: ' — not loaded',      tip: 'Not fetched yet in this session.'}
  };
  const st = s => STATES[s] || STATES.unknown;

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
             background:alpha(spColor, '22'),color:spColor,border:'1px solid '+alpha(spColor, '44'),fontWeight:700}
    }, spLabel),

    /* divider */
    React.createElement('span', {style:{color:BDR}}, '|'),

    /* per-entity pills */
    ...entities.map(({key, label}) => {
      const x = st(sync[key] || 'unknown');
      return React.createElement('span', {
        key,
        title: label + ': ' + x.tip,
        style:{display:'flex',alignItems:'center',gap:3,color:x.c,fontWeight:x.t?700:400,
               ...(x.t ? {padding:'1px 6px',borderRadius:8,background:alpha(x.c, '1A'),border:'1px solid '+alpha(x.c, '55')} : {})}
      }, x.i, ' ', label, x.t);
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
    sync.dirty && React.createElement('span', {style:{color:'var(--status-warning)',fontWeight:700}}, '● Unsaved'),

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
      background: 'var(--bg-canvas)',
      gap: 10,
      color: 'var(--text-secondary)',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--brand-accent)',
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












/* WHAT WE CHARGED LAST TIME.
   ==========================
   The rate history existed, but only for manpower (SHIC_ML.suggestRates reads
   ce.mp and nothing else) and only inside the ML Insights panel -- you had to
   know to go and ask. Tools, consumables, PPE and miscellaneous had no lookup
   at all, which is why a warehouse item with no price had nowhere to get one
   from even though the company had bought it a dozen times.

   This reads every resource type out of the same history, and the button that
   uses it sits on the row, where the rate is actually being typed. */

/* window.shicHistory is saved CEs PLUS anything scraped out of OneDrive or a
   local folder by the file analyser. A scraped spreadsheet row is not a rate
   this company issued to a client, so it is labelled and never silently mixed
   in with one that is. */
function shicRateUses(kind, name, limit) {
  var hist = (typeof window !== 'undefined' && window.shicHistory) || [];
  var want = String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!want) return [];
  /* Not a straight kind-to-key mapping, and it must not be treated as one.
     A saved CE's `misc` is an object of totals, not line items -- the
     mobilisation and demobilisation rows live in their own arrays, and both
     tables are the same editor, so both are searched. */
  var lists = {
    mp: ['mp'], tools: ['tools'], mats: ['mats'], ppe: ['ppe'],
    vehicles: ['mobVehicles', 'demobVehicles']
  }[kind];
  if (!lists) return [];
  var out = [];
  hist.forEach(function (ce) {
    var info = ce.info || {};
    lists.forEach(function (k) {
      (ce[k] || []).forEach(function (r) {
        var nm = String(r.role || r.desc || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        if (nm !== want) return;
        var v = Number(r.rate !== undefined && r.rate !== '' && r.rate !== null ? r.rate : r.cost);
        if (!isFinite(v) || v <= 0) return;
        out.push({
          rate: v,
          qty: Number(r.qty) || 0,
          ceNum: info.ceNum || ce.ceNum || '',
          client: info.client || '',
          when: ce.savedAt || info.date || '',
          /* A CE this company saved has a savedAt and a CE number. A row the
             file analyser lifted out of a spreadsheet has neither, and must
             not be read as a rate anybody approved. */
          issued: !!(ce.savedAt && (info.ceNum || ce.ceNum))
        });
      });
    });
  });
  out.sort(function (a, b) {
    var da = Date.parse(a.when) || 0, db = Date.parse(b.when) || 0;
    if (db !== da) return db - da;
    return String(b.ceNum).localeCompare(String(a.ceNum));
  });
  return out.slice(0, limit || 10);
}

/* A clock beside the rate. Dim when this item has never been costed before,
   so the absence of history is itself visible -- an item nobody has bought is
   worth a second look before it goes out at a made-up price. */
function RateHistory(props) {
  var kind = props.kind, name = props.name, onPick = props.onPick;
  var _o = React.useState(false), open = _o[0], setOpen = _o[1];
  var uses = React.useMemo(function () {
    return open ? shicRateUses(kind, name, 10) : [];
  }, [open, kind, name]);
  var has = React.useMemo(function () {
    return !!name && shicRateUses(kind, name, 1).length > 0;
  }, [kind, name]);
  React.useEffect(function () {
    if (!open) return;
    var close = function () { setOpen(false); };
    /* Next tick: the click that opened this is still travelling. */
    var t = setTimeout(function () { window.addEventListener('click', close); }, 0);
    return function () { clearTimeout(t); window.removeEventListener('click', close); };
  }, [open]);
  if (!name) return null;
  var money = function (n) {
    return 'P' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var day = function (w) {
    var d = new Date(w);
    return isNaN(d) ? '' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  /* The headline range is drawn from issued CEs alone where there are any.
     A figure lifted out of an analysed spreadsheet is flagged amber in the
     list precisely because it is not a rate anybody approved -- letting it set
     the top of "P40.00 to P999.00" would put it back into the summary with all
     that doubt stripped off. Where every row is imported, the range says so
     rather than pretending there is nothing to show. */
  var issued = uses.filter(function (u) { return u.issued; });
  var basis = issued.length ? issued : uses;
  var rates = basis.map(function (u) { return u.rate; });
  var lo = rates.length ? Math.min.apply(null, rates) : 0;
  var hi = rates.length ? Math.max.apply(null, rates) : 0;
  return React.createElement('span', { style: { position: 'relative', display: 'inline-block' } },
    React.createElement('button', {
      type: 'button',
      title: has ? 'What we charged for this before' : 'Never costed before',
      onClick: function (e) { e.stopPropagation(); setOpen(!open); },
      style: {
        background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
        fontSize: 12, lineHeight: 1, opacity: has ? 1 : 0.28,
        color: has ? 'var(--brand-accent)' : 'var(--text-secondary)'
      }
    }, '⏱'),
    open ? React.createElement('div', {
      onClick: function (e) { e.stopPropagation(); },
      style: {
        position: 'absolute', top: 18, right: 0, zIndex: 500, width: 320,
        background: 'var(--bg-surface)', border: '1px solid #30363D', borderRadius: 8,
        boxShadow: '0 8px 28px #000a', padding: 10, textAlign: 'left',
        fontWeight: 400, color: 'var(--text-primary)'
      }
    },
      React.createElement('div', { style: { fontSize: 11, fontWeight: 700, marginBottom: 2 } }, name),
      uses.length ? React.createElement('div', { style: { fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 } },
        basis.length + (uses.length === 10 ? '+ uses' : ' use' + (basis.length === 1 ? '' : 's')) +
        (issued.length ? '' : ' (imported, none issued)') +
        (lo === hi ? ' · ' + money(lo) + ' every time' : ' · ' + money(lo) + ' to ' + money(hi))
      ) : React.createElement('div', { style: { fontSize: 10, color: 'var(--status-warning)', marginBottom: 2 } },
        'Never costed before. Nothing to compare against.'),
      uses.map(function (u, i) {
        return React.createElement('div', {
          key: i,
          onClick: function () { if (onPick) { onPick(u.rate); setOpen(false); } },
          title: onPick ? 'Use ' + money(u.rate) : '',
          style: {
            display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline',
            padding: '4px 6px', borderRadius: 5, cursor: onPick ? 'pointer' : 'default',
            background: i % 2 ? 'var(--bg-canvas)' : 'transparent'
          }
        },
          React.createElement('span', { style: { fontSize: 10, color: 'var(--text-secondary)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            React.createElement('span', { style: { color: u.issued ? 'var(--text-primary)' : 'var(--status-warning)' } },
              u.issued ? (u.ceNum || '(no CE number)') : 'imported file'),
            u.client ? ' · ' + u.client : '',
            u.when ? ' · ' + day(u.when) : ''),
          React.createElement('span', { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--brand-accent)', fontWeight: 700 } }, money(u.rate))
        );
      }),
      uses.some(function (u) { return !u.issued; }) ? React.createElement('div', {
        style: { fontSize: 9, color: 'var(--status-warning)', marginTop: 6, borderTop: '1px solid #30363D', paddingTop: 5 }
      }, 'Amber rows came from an analysed spreadsheet, not a CE this company issued.') : null
    ) : null
  );
}


/* EXECUTIVE LIGHT / DARK SLATE.
   =============================
   The switcher writes data-theme on <html>, which is the only thing that has
   to change: every colour constant reads a CSS variable, and index.html
   redefines the whole set under [data-theme="light"].

   The choice is stored, and index.html applies it inline before any script
   runs -- reading it here instead would show a light-mode user a dark flash
   on every load.

   A segmented pair rather than a single toggle: with one button there is no
   way to see which mode you are in without knowing what the icon means. */
const SHIC_PALETTES = [
  { id: '', base: 'dark', label: 'Dark Slate', sw: ['#060e20', '#172036', '#f59e0b'] },
  { id: '', base: 'light', label: 'Executive Light', sw: ['#dfe4eb', '#f1f3f6', '#d97706'] },
  { id: 'ocean', base: 'dark', label: 'Ocean', sw: ['#04161f', '#103342', '#2dd4bf'] },
  { id: 'forest', base: 'dark', label: 'Forest', sw: ['#07130c', '#173121', '#a3e635'] },
  { id: 'nebula', base: 'dark', label: 'Nebula', sw: ['#0d0a1f', '#231c4d', '#e879f9'] },
  { id: 'graphite', base: 'dark', label: 'Graphite', sw: ['#111113', '#27272a', '#fb923c'] },
  { id: 'sunset', base: 'light', label: 'Sunset', sw: ['#f0dccf', '#fbf1ea', '#c2410c'] },
  { id: 'lavender', base: 'light', label: 'Lavender', sw: ['#e1dcf1', '#f3f0fa', '#6d28d9'] },
  { id: 'sakura', base: 'light', label: 'Sakura', sw: ['#f0dbe2', '#fbf1f4', '#be185d'] },
  { id: 'mint', base: 'light', label: 'Mint', sw: ['#d7eae1', '#eff7f3', '#047857'] }
];
const SHIC_WALLPAPERS = [
  { label: 'Aurora', css: 'linear-gradient(135deg,#0f766e 0%,#4338ca 50%,#9d174d 100%)' },
  { label: 'Sunrise', css: 'linear-gradient(160deg,#fde68a 0%,#fb923c 45%,#db2777 100%)' },
  { label: 'Deep sea', css: 'radial-gradient(circle at 20% 20%,#0ea5e9 0%,#0c4a6e 45%,#020617 100%)' },
  { label: 'Meadow', css: 'linear-gradient(135deg,#bbf7d0 0%,#4ade80 40%,#166534 100%)' },
  { label: 'Dusk', css: 'linear-gradient(180deg,#1e1b4b 0%,#7c3aed 55%,#f472b6 100%)' },
  { label: 'Sand', css: 'linear-gradient(135deg,#fef3c7 0%,#e7c9a0 50%,#a16207 100%)' }
];
function ThemeSwitch() {
  const read = () => {
    try { const r = document.documentElement; return { base: r.getAttribute('data-theme') === 'light' ? 'light' : 'dark', pal: r.getAttribute('data-palette') || '' }; }
    catch (_e) { return { base: 'dark', pal: '' }; }
  };
  const _s = React.useState(read), cur = _s[0], setCur = _s[1];
  const _o = React.useState(null), open = _o[0], setOpen = _o[1];
  const _w = React.useState(() => { try { return localStorage.getItem('shic:wallpaper') || ''; } catch (_e) { return ''; } }), wp = _w[0], setWp = _w[1];
  const _d = React.useState(() => { try { return parseInt(localStorage.getItem('shic:wpdim') || '35', 10); } catch (_e) { return 35; } }), dim = _d[0], setDim = _d[1];
  const _m = React.useState(''), msg = _m[0], setMsg = _m[1];
  const pick = (t, pal) => {
    setCur({ base: t, pal: pal || '' });
    try {
      const r = document.documentElement;
      r.setAttribute('data-theme', t);
      localStorage.setItem('shic:theme', t);
      if (pal) { r.setAttribute('data-palette', pal); localStorage.setItem('shic:palette', pal); }
      else { r.removeAttribute('data-palette'); localStorage.removeItem('shic:palette'); }
      /* The browser chrome and the address bar follow the canvas.
         Literal hex, never a variable: <meta name="theme-color"> is read by the
         browser chrome, which has no stylesheet to resolve var() against. */
      const meta = document.querySelector('meta[name="theme-color"]');
      const p = SHIC_PALETTES.find(x => x.id === (pal || '') && x.base === t);
      if (meta) meta.setAttribute('content', pal && p ? p.sw[0] : (t === 'light' ? '#dfe4eb' : '#060e20'));
      window.dispatchEvent(new Event('shic:theme'));
    } catch (_e) {}
  };
  const applyWp = (css, d) => {
    try {
      const r = document.documentElement;
      if (css) { r.setAttribute('data-wp', '1'); r.style.setProperty('--wp-img', css); r.style.setProperty('--wp-dim', String(d / 100)); localStorage.setItem('shic:wallpaper', css); }
      else { r.removeAttribute('data-wp'); r.style.removeProperty('--wp-img'); localStorage.removeItem('shic:wallpaper'); }
      localStorage.setItem('shic:wpdim', String(d));
      setMsg('');
    } catch (_e) { setMsg('This picture is too large for the browser to keep. Try a smaller one.'); }
  };
  const setWallpaper = css => { setWp(css); applyWp(css, dim); };
  /* A phone photo is several MB; shrunk to screen size and saved as JPEG it
     fits comfortably in the browser's storage. */
  const upload = f => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { setMsg('Pick an image file.'); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1920 / img.width, 1200 / img.height);
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        setWallpaper('url("' + c.toDataURL('image/jpeg', 0.8) + '")');
      };
      img.onerror = () => setMsg('That file could not be read as an image.');
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  const dot = c => React.createElement('span', { key: c, style: { width: 12, height: 12, borderRadius: '50%', background: c, border: '1px solid rgba(128,128,128,.4)', display: 'inline-block' } });
  const card = p => {
    const on = cur.base === p.base && cur.pal === p.id;
    return React.createElement('button', {
      key: p.label, type: 'button', onClick: () => pick(p.base, p.id), title: p.label,
      style: { cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start', padding: '7px 8px', borderRadius: 8, fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
        background: p.sw[0], color: p.base === 'light' ? '#0f172a' : '#ffffff', border: on ? '2px solid ' + p.sw[2] : '1px solid rgba(128,128,128,.35)' }
    }, React.createElement('span', { style: { display: 'flex', gap: 3 } }, p.sw.map(dot)), (on ? '✓ ' : '') + p.label);
  };
  const cur0 = SHIC_PALETTES.find(p => p.base === cur.base && p.id === cur.pal) || SHIC_PALETTES[0];
  return React.createElement('div', { style: { position: 'relative', flexShrink: 0 } },
    React.createElement('button', {
      type: 'button', title: 'Theme and background',
      /* Fixed to the button's position on screen: the top bar clips anything
         hanging below it, so an absolutely placed panel showed as a thin line. */
      onClick: e => { const r = e.currentTarget.getBoundingClientRect(); setOpen(v => v ? null : { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }); },
      style: { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
        background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }
    }, '🎨', React.createElement('span', { style: { display: 'flex', gap: 2 } }, cur0.sw.map(dot))),
    open && React.createElement('div', { style: { position: 'fixed', inset: 0, zIndex: 3050 }, onClick: () => setOpen(null) }),
    open && React.createElement('div', {
      style: { position: 'fixed', right: open.right, top: open.top, zIndex: 3060, width: 340, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - ' + (open.top + 8) + 'px)', overflowY: 'auto', padding: 14, borderRadius: 10,
        background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', boxShadow: '0 12px 32px rgba(0,0,0,.35)', color: 'var(--text-primary)' }
    },
      React.createElement('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 8 } }, 'Theme'),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 14 } }, SHIC_PALETTES.map(card)),
      React.createElement('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 8 } }, 'Background'),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 8 } },
        React.createElement('button', { type: 'button', onClick: () => setWallpaper(''), title: 'No picture — plain theme colour',
          style: { cursor: 'pointer', height: 40, borderRadius: 6, fontSize: 10, fontFamily: 'inherit', background: 'var(--bg-canvas)', color: 'var(--text-secondary)', border: !wp ? '2px solid var(--brand-accent)' : '1px solid var(--border-subtle)' } }, 'None'),
        SHIC_WALLPAPERS.map(x => React.createElement('button', { key: x.label, type: 'button', title: x.label, onClick: () => setWallpaper(x.css),
          style: { cursor: 'pointer', height: 40, borderRadius: 6, background: x.css, border: wp === x.css ? '2px solid var(--brand-accent)' : '1px solid var(--border-subtle)' } })),
        React.createElement('label', { title: 'Use your own picture', style: { cursor: 'pointer', height: 40, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600,
          background: /^url/.test(wp) ? wp + ' center/cover' : 'var(--bg-surface-elevated)', color: /^url/.test(wp) ? '#fff' : 'var(--text-secondary)', textShadow: /^url/.test(wp) ? '0 1px 2px #000' : 'none',
          border: /^url/.test(wp) ? '2px solid var(--brand-accent)' : '1px dashed var(--border-strong)' } }, '⬆ Photo',
          React.createElement('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; upload(f); } }))),
      wp && React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' } }, 'Soften',
        React.createElement('input', { type: 'range', min: 0, max: 85, step: 5, value: dim, style: { flex: 1 },
          onChange: e => { const d = parseInt(e.target.value, 10); setDim(d); applyWp(wp, d); } }), dim + '%'),
      msg && React.createElement('div', { style: { fontSize: 11, color: 'var(--status-danger)', marginTop: 6 } }, msg),
      React.createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 8 } }, 'Saved in this browser. Printed CEs and exports are not affected.')));
}

/* THE ENTERPRISE STATUS BARS, at module scope.
   Declared inside App they would take a new identity on every render and be
   remounted -- and they hold hooks, so React would lose their subscription
   each time. check-remounting-editors.js enforces this from the other side. */
/* ENTERPRISE STATUS BAR (mockup, top row).
   Reports state the app already holds -- the build, whether SharePoint is
   connected, who is signed in. It reads; it does not decide. */
function StatusBar({ currentUser }) {
  /* Read through the getter, and re-read when the app says it moved. The
     status is module state in db.js, not React state -- naming it directly
     is a ReferenceError, and polling it would never repaint. */
  const _s = React.useState(() => getSyncStatus()), sync = _s[0], setSync = _s[1];
  React.useEffect(() => {
    const f = () => setSync({...getSyncStatus()});
    window.addEventListener('shic:sync:updated', f);
    return () => window.removeEventListener('shic:sync:updated', f);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
  style: {
    height: 'var(--h-status)', display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 16px', fontSize: 10, letterSpacing: '.04em',
    background: 'var(--bg-surface-elevated)',
    borderBottom: `1px solid ${BDR}`, color: MT,
    position: 'sticky', top: 0, zIndex: 51, whiteSpace: 'nowrap', overflow: 'hidden'
  }
},
  /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800, color: ACC, letterSpacing: '.08em',
      border: `1px solid ${alpha(ACC, '55')}`, borderRadius: 4, padding: '1px 6px'
    }
  }, "SYNERCORE CE"),
  /*#__PURE__*/React.createElement("span", {style: {...MONO, color: 'var(--text-muted)'}},
    "v" + (typeof APP_BUILD === 'undefined' ? '?' : APP_BUILD) + " Enterprise"),
  /*#__PURE__*/React.createElement("span", {style: {color: 'var(--text-muted)'}}, "|"),
  /*#__PURE__*/React.createElement("span", {
    style: {display: 'inline-flex', alignItems: 'center', gap: 5}
  },
    /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
        background: sync.sp === 'connected' ? OK : sync.masterlist === 'error' ? ERR : MT
      }
    }),
    /*#__PURE__*/React.createElement("span", {style: MONO},
      "DB: " + (sync.sp === 'connected' ? 'Realtime Sync' : 'Local only'))),
  /*#__PURE__*/React.createElement("span", {style: {marginLeft: 'auto', ...MONO, color: 'var(--text-muted)'}},
    currentUser.username ? currentUser.username + " / " + String(currentUser.role || '').toUpperCase() : ''));
}

/* FOOTER STATUS BAR (mockup, bottom row). */
function FooterBar() {
  const _s = React.useState(() => getSyncStatus()), sync = _s[0], setSync = _s[1];
  React.useEffect(() => {
    const f = () => setSync({...getSyncStatus()});
    window.addEventListener('shic:sync:updated', f);
    return () => window.removeEventListener('shic:sync:updated', f);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '7px 16px', fontSize: 10, color: MT, letterSpacing: '.04em',
    background: 'var(--bg-surface-elevated)', borderTop: `1px solid ${BDR}`
  }
},
  /*#__PURE__*/React.createElement("span", {style: {display: 'inline-flex', alignItems: 'center', gap: 5}},
    /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
        background: sync.sp === 'connected' ? OK : MT
      }
    }),
    "Database: " + (sync.sp === 'connected' ? 'SharePoint (synced)' : 'This browser only')),
  /*#__PURE__*/React.createElement("span", {style: {...MONO, color: 'var(--text-muted)'}},
    "Engine build " + (typeof APP_BUILD === 'undefined' ? '?' : APP_BUILD)),
  /*#__PURE__*/React.createElement("span", {style: {marginLeft: 'auto', ...MONO, color: 'var(--text-muted)'}},
    "Keyboard: Ctrl+S save"));
}

window.SHIC_ML=(function(){
  function tokenize(txt){return(txt||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);}
  function cosineSim(a,b){var ta=tokenize(a),tb=tokenize(b);if(!ta.length||!tb.length)return 0;var all=[].concat(ta,tb).filter(function(v,i,s){return s.indexOf(v)===i;});var va=all.map(function(w){return ta.filter(function(x){return x===w;}).length;});var vb=all.map(function(w){return tb.filter(function(x){return x===w;}).length;});var dot=va.reduce(function(s,v,i){return s+v*vb[i];},0);var magA=Math.sqrt(va.reduce(function(s,v){return s+v*v;},0));var magB=Math.sqrt(vb.reduce(function(s,v){return s+v*v;},0));return(magA&&magB)?dot/(magA*magB):0;}
  function suggestRates(role){var hist=window.shicHistory||[];var rates=[];hist.forEach(function(ce){(ce.mp||[]).forEach(function(r){if(r.role&&r.rate&&cosineSim(r.role,role)>0.6)rates.push({rate:Number(r.rate),role:r.role,ceNum:(ce.info&&ce.info.ceNum)||'',savedAt:ce.savedAt||''});});});if(!rates.length)return null;rates.sort(function(a,b){return new Date(b.savedAt)-new Date(a.savedAt);});var avg=Math.round(rates.reduce(function(s,r){return s+r.rate;},0)/rates.length);return{avg:avg,latest:rates[0].rate,min:Math.min.apply(null,rates.map(function(r){return r.rate;})),max:Math.max.apply(null,rates.map(function(r){return r.rate;})),count:rates.length,samples:rates.slice(0,3)};}
  function predictCost(scope){var hist=window.shicHistory||[];var similar=[];hist.forEach(function(ce){var desc=(ce.info&&ce.info.description)||(ce.info&&ce.info.ceNum)||'';var sim=cosineSim(desc,scope);if(sim>0.1&&ce.grand>0)similar.push({sim:sim,grand:Number(ce.grand),ceNum:(ce.info&&ce.info.ceNum)||''});});if(!similar.length)return null;similar.sort(function(a,b){return b.sim-a.sim;});var top=similar.slice(0,5);var wtSum=top.reduce(function(s,e){return s+e.sim;},0);var predicted=Math.round(top.reduce(function(s,e){return s+e.grand*e.sim;},0)/wtSum);return{predicted:predicted,confidence:Math.min(Math.round(top[0].sim*100),95),topMatches:top.slice(0,3),count:similar.length};}
  function matchScope(scope,limit){var hist=window.shicHistory||[];var matches=[];hist.forEach(function(ce){var desc=(ce.info&&ce.info.description)||'';var sim=cosineSim(desc,scope);if(sim>0.1)matches.push({sim:sim,ceNum:(ce.info&&ce.info.ceNum)||'',client:(ce.info&&ce.info.client)||'',description:desc,grand:ce.grand||0,mp:(ce.mp||[]).map(function(r){return r.role;}).filter(Boolean)});});matches.sort(function(a,b){return b.sim-a.sim;});return matches.slice(0,limit||5);}
  function detectAnomalies(mp,tools,mats,ml){var anomalies=[];var master=ml||window.shicMasterlist||{};(mp||[]).forEach(function(r){if(!r.rate)return;var ref=(master.manpower||[]).find(function(m){return cosineSim(m.role,r.role)>0.7;});if(ref&&ref.rate){var ratio=Number(r.rate)/Number(ref.rate);if(ratio>1.5)anomalies.push({type:'rate_high',item:r.role,value:r.rate,expected:ref.rate,ratio:Math.round(ratio*100)+'%',tab:'manpower'});else if(ratio<0.5)anomalies.push({type:'rate_low',item:r.role,value:r.rate,expected:ref.rate,ratio:Math.round(ratio*100)+'%',tab:'manpower'});}});return anomalies;}
  return{suggestRates:suggestRates,predictCost:predictCost,matchScope:matchScope,detectAnomalies:detectAnomalies,cosineSim:cosineSim};
})();











