/* Every masterlist consumer indexes the four sections directly
   (masterlist.manpower.slice(...)), so a cached or SharePoint-supplied value
   that is missing one -- or is an array, or of the wrong shape -- crashes the
   whole app at render. Backfill missing sections from DEFAULT_ML and return
   null for anything unusable, so callers can fall back cleanly.

   Deliberately defined HERE, next to its call sites, rather than in helpers.js:
   App.js and helpers.js are separate cache entries, and a partially-updated
   service-worker cache that pairs a new App.js with an old helpers.js would
   white-screen the app on a missing helper. */
/* Returns the URL only if it is an ordinary web link, otherwise ''. Used for
   any href built from data the app did not author — a javascript: or data: URL
   in an href executes in this origin when clicked, which would hand over the
   session and the whole local CE archive. Lives here rather than helpers.js so
   it cannot go missing from a partially-updated service worker cache while its
   call sites are already live. */
function safeHttpUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  try {
    const parsed = new URL(s, window.location.href);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
  } catch (_e) { return ''; }
}
function mlShape(ml) {
  if (!ml || typeof ml !== 'object' || Array.isArray(ml)) return null;
  const secs = ['manpower', 'tools', 'mats', 'ppe'];
  if (!secs.some(k => Array.isArray(ml[k]) && ml[k].length)) return null;
  const out = { ...ml };
  secs.forEach(k => { if (!Array.isArray(out[k])) out[k] = (typeof DEFAULT_ML !== 'undefined' && Array.isArray(DEFAULT_ML[k])) ? DEFAULT_ML[k] : []; });
  return out;
}

function App({
  currentUser,
  onLogout
}) {
  const [ceType, setCeType] = useState("onsite");
  const [tab, setTab] = useState("info");
  const [info, setInfo] = useState({
    ...BLANK_INFO
  });
  const [mp, setMp] = useState([mkMP()]);
  const [tools, setTools] = useState([mkRes()]);
  const [mats, setMats] = useState([mkRes()]);
  const [ppe, setPpe] = useState([mkRes()]);
  const [misc, setMisc] = useState({
    ...BLANK_MISC
  });
  const [mobVehicles, setMobVehicles] = useState([]);
  const [demobVehicles, setDemobVehicles] = useState([]);
  const [scope, setScope] = useState('');
  const [notes, setNotes] = useState([]); /* [{id,seq,text}] */
  const mkNote = () => ({
    id: uid(),
    seq: notes.length + 1,
    text: ''
  });
  const [sowItems, setSowItems] = useState([]); /* [{id,type:'main'|'sub',text}] */
  /* SOW Breakdown view state */
  const [sbCollapsed, setSbCollapsed] = useState({}); /* {taskId:true} */
  const [sbSel, setSbSel] = useState({});             /* bulk-assign selection, {selKey:descriptor} */
  const [sbSearch, setSbSearch] = useState('');
  const [addMode, setAddMode] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null); /* true=add to existing CE, false=replace */
  const DRAFT_KEY = 'shic_draft';
  const [approvers, setApprovers] = useState([{
    role: 'Prepared By',
    name: '',
    title: 'Cost Estimator'
  }, {
    role: 'Checked By',
    name: 'Kenneth Mendoza',
    title: 'Cost Supervisor'
  }, {
    role: 'Noted By',
    name: 'Mr. Jhuniel Ubana',
    title: 'TSG Head'
  }, {
    role: 'Noted By',
    name: 'Mr. Fernando Bautista',
    title: 'Operations Director'
  }, {
    role: 'Approved By',
    name: 'Mr. Warren Maralit',
    title: 'Director of Sales and Technical'
  }]);
  ;
  const [aiLoad, setAiLoad] = useState(false);
  const [margin, setMargin] = useState(0);
  const [addlCosts, setAddlCosts] = useState([]); /* [{id,desc,amount}] — additional costs after misc (delivery, per-item, etc.) */
  const [toast, setToast] = useState('');
  const [signatures, setSignatures] = useState({});
  const [sigModal, setSigModal] = useState(null);
  const [diffModal, setDiffModal] = useState(null);
  const [aiSuggest, setAiSuggest] = useState(null);
  const [printPreviewWin, setPrintPreviewWin] = useState(null);
  const [toastErr, setToastErr] = useState(false);
  const [undoToast, setUndoToast] = useState(null);
  /* Render the cached masterlist immediately. This used to be DEFAULT_ML, so
     until SharePoint answered every user saw the 295 built-in rows instead of
     their own rates — and offline, forever.

     Everything downstream does masterlist.manpower.slice(...) and friends
     unguarded, so a cached value of the wrong shape would now take down the
     whole app at first render — a risk that did not exist while the cache was
     ignored. mlShape backfills any missing section from DEFAULT_ML and rejects
     anything that is not a usable object. */
  const [masterlist, setMasterlist] = useState(() => mlShape(LS.get('masterlist')) || DEFAULT_ML);
  const [history, setHistory] = useState([]);
  const [histBusy, setHistBusy] = useState(false);
  const [monData, setMonData] = useState({});
  const [customStatuses, setCustomStatuses] = useState(() => {
    try {
      const v = localStorage.getItem('shic:statuses');
      return v ? JSON.parse(v) : [];
    } catch {
      return [];
    }
  });
  const allStatuses = useMemo(() => [...DEFAULT_STATUS_OPTIONS, ...customStatuses], [customStatuses]);
  const addStatus = s => {
    if (!s.trim() || allStatuses.includes(s.trim())) return;
    const n = [...customStatuses, s.trim()];
    setCustomStatuses(n);
    try {
      localStorage.setItem('shic:statuses', JSON.stringify(n));
    } catch {}
  };
  const removeStatus = s => {
    const n = customStatuses.filter(x => x !== s);
    setCustomStatuses(n);
    try {
      localStorage.setItem('shic:statuses', JSON.stringify(n));
    } catch {}
  };
  const MON_KEY = 'shic:monitoring';
  const loadMonData = async () => {
    /* Always fetch from SP first; only fall back to localStorage if SP is unreachable */
    setSyncStatus({monitoring:'saving'});
    /* Show the cached monitoring table straight away; the SP result below
       replaces it wholesale once it lands. */
    try {
      const v = localStorage.getItem(MON_KEY);
      if (v) setMonData(JSON.parse(v));
    } catch (_e) {}
    try {
      /* Clear stale cache before every fetch so deleted SP items are not reused */
      Object.keys(_monSpIdCache).forEach(k => delete _monSpIdCache[k]);
      const r = await dbGetMon();
      if (r && r.parseFailed) {
        /* Items exist in SharePoint but none had readable shicMonData — almost
           always a missing/unpopulated column, not an empty list. Keep whatever
           is cached locally and say what is wrong; this used to delete the
           user's monitoring table and report 'synced'. */
        setSyncStatus({monitoring:'error', sp:'connected'});
        showToast('SharePoint returned ' + r.itemCount + ' monitoring row(s) with no readable data — check the shicMonData column. Showing local copy.', true);
      } else if (r && r.empty && r.definitive) {
        /* The list really is empty. Still do not delete the local copy silently:
           show it, flag it as local-only, and leave discarding to the user. */
        const localCount = Object.keys(monData || {}).length;
        setSyncStatus({monitoring:'local', lastSyncAt: new Date().toISOString(), sp:'connected'});
        if (localCount) showToast('SharePoint monitoring list is empty — showing ' + localCount + ' local row(s). Use Push Local Data to upload them.', true);
      } else if (r && r.data && Object.keys(r.data).length > 0) {
        setMonData(r.data);
        setMonSpIds(new Set(Object.keys(_monSpIdCache)));
        try { localStorage.setItem(MON_KEY, JSON.stringify(r.data)); } catch (e) { console.warn('monitoring not cached locally:', e && e.message); }
        setSyncStatus({monitoring:'synced', lastSyncAt: new Date().toISOString(), sp: 'connected'});
        if (r.legacy) {
          dbSaveMonAll(r.data, []).catch(() => {});
        }
      } else {
        /* SP unreachable — fall back to localStorage so user isn't left with nothing */
        try {
          const v = localStorage.getItem(MON_KEY);
          if (v) setMonData(JSON.parse(v));
        } catch {}
        setSyncStatus({monitoring:'local'});
      }
    } catch {
      /* SP error — fall back to localStorage */
      try {
        const v = localStorage.getItem(MON_KEY);
        if (v) setMonData(JSON.parse(v));
      } catch {}
      setSyncStatus({monitoring:'error'});
    }
  };
  const updateMon = (ceId, field, val) => setMonData(prev => {
    const extra = {};
    if (field === 'status' && ['Approved','Issued','For Review','On Hold','Cancelled'].includes(val)) {
      extra.statusChangedAt = new Date().toISOString();
      extra.statusChangedBy = currentUser?.name || currentUser?.username || '';
    }
    const n = {
      ...prev,
      [ceId]: {
        ...prev[ceId],
        [field]: val,
        ...extra
      }
    };
    try {
      localStorage.setItem(MON_KEY, JSON.stringify(n));
      /* Save only the one changed CE entry, not the whole blob */
      const h = history.find(x => String(x.id) === String(ceId));
      const ceNum = h?.info?.ceNum || h?.ceNum || String(ceId);
      dbSaveMonEntry(ceId, ceNum, n[ceId]).then(ok=>{ if(ok) setSyncStatus({lastSyncAt:new Date().toISOString(),sp:'connected',dirty:false}); }).catch(()=>{});
    } catch {}
    return n;
  });
  const mlSaveTimer = React.useRef(null);
  const [picker, setPicker] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [docBusy, setDocBusy] = useState(false);
  const [docPreview, setDocPreview] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [sowLib, setSowLib] = useState(() => {
    try {
      const s = localStorage.getItem('sy3:sowlib');
      return s ? JSON.parse(s) : window.SOW_LIBRARY;
    } catch {
      return window.SOW_LIBRARY;
    }
  });
  const [companies, setCompanies] = useState(() => getCompanies());
  /* Re-sync when admin panel saves, and load from SP on startup */
  useEffect(() => {
    const onStorage = () => setCompanies(getCompanies());
    window.addEventListener('shic:companies:updated', onStorage);
    if (USE_SP || getSiteURL()) {
      dbGetCompanies().then(list => {
        if (list && list.length) { saveCompanies(list); setCompanies(list); }
      }).catch(() => {});
    }
    return () => window.removeEventListener('shic:companies:updated', onStorage);
  }, []);
  /* One writer for the scope-library cache. The key is the raw 'sy3:sowlib'
     (no shic: prefix) that this component has always read; db.js's non-SP
     branch wrote LS 'sy3:sowlib', which lands at 'shic:sy3:sowlib' — a key
     nothing ever read. */
  const cacheSowLib = lib => {
    try { localStorage.setItem('sy3:sowlib', JSON.stringify(lib)); } catch (e) { console.warn('scope library not cached locally:', e && e.message); }
    try { refPut('sowlib', lib, (USE_SP || getSiteURL()) ? 'sharepoint' : 'local'); } catch (_e) {}
  };
  const loadSowLib = async () => {
    try {
      const lib = await dbGetSowLib();
      if (lib && lib.length) {
        setSowLib(lib);
        cacheSowLib(lib);
        setSyncStatus({sowlib:'synced', lastSyncAt: new Date().toISOString()});
      } else setSyncStatus({sowlib:'local'});
    } catch (e) { console.warn('Scope library load failed:', e.message); setSyncStatus({sowlib:'error'}); }
  };
  const saveSowLib = lib => {
    setSowLib(lib);
    cacheSowLib(lib);
    if (USE_SP || getSiteURL()) dbSaveSowLib(lib).catch(()=>{});
  };
  useEffect(() => {
    if (!(USE_SP || getSiteURL())) return;
    /* Same as the masterlist: cache the SharePoint copy so the Scope Library is
       populated offline, not just on browsers that happened to edit it. */
    loadSowLib();
  }, []);
  const [sowSearch, setSowSearch] = useState('');
  const [sowCat, setSowCat] = useState('All');
  const [sowSel, setSowSel] = useState({}); /* {id:qty} */
  const [sowEdit, setSowEdit] = useState(null); /* service being edited in Scope Library tab */
  const [collapsedShifts, setCollapsedShifts] = useState({
    regular_day: false,
    regular_night: true,
    sunday_day: true,
    sunday_night: true,
    holiday_day: true,
    holiday_night: true
  });
  const toggleShift = key => setCollapsedShifts(p => ({
    ...p,
    [key]: !p[key]
  }));
  const [copyMenu, setCopyMenu] = useState(null); /* {fromShift, anchorEl} */
  const fileRef = useRef(null);
  const _lastAutoSig = useRef(null); /* skips no-op auto-saves */
  /* Scoped to this account: the window now outlives the tab, so a colleague
     signing in on the same browser must not inherit the bypass. */
  const [bulkOn, setBulkOn] = useState(() => bulkMode.on(currentUser?.username));
  useEffect(() => {
    /* Poll as well as listen: the window expires on a timer, so the banner
       has to disappear on its own without another user action. */
    const h = () => setBulkOn(bulkMode.on(currentUser?.username));
    window.addEventListener('shic:bulk:changed', h);
    const t = setInterval(h, 5000); /* short, so the banner clears promptly when the window expires */
    return () => { window.removeEventListener('shic:bulk:changed', h); clearInterval(t); };
  }, []);
  const _live = useRef(null);       /* current state for the auto-save timer */
  /* The owner holds every admin power on top of being unmanageable by them. */
  const isAdmin = hasAdminPowers(currentUser.role);
  const isOwner = isOwnerRole(currentUser.role);
  const cfg = CE_CFG[ceType] || CE_CFG.onsite || {};
  const TABS = [...CE_TABS, ...(isAdmin ? [{
    id: 'admin',
    label: 'Users'
  }] : [])];
  useEffect(() => {
    setTimeout(async()=>{const info=await checkForUpdate();if(info.available)setUpdateInfo(info);},3000);
    const onKey=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();try{handleSave();}catch(ex){}}if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();try{handleNew();}catch(ex){}}};
    window.addEventListener('keydown',onKey);
    const onUnload=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',onUnload);
    /* Auto-save only when the CE actually changed. It used to save and toast
       every 3 minutes regardless, so an idle tab interrupted the user twice an
       hour to report writing an identical draft. */
    /* Read live state through a ref. This effect has [] deps, so anything
       captured directly here is frozen at the first render -- the timer was
       calling that first saveDraft, which serialises the INITIAL blank CE and
       writes it under the initial CE number, overwriting the real draft every
       3 minutes. */
    let _cleanupReconnect = null;
    const autoTimer=setInterval(()=>{
      try{
        const live=_live.current;
        if(!live||!live.hasUnsavedWork||!live.hasUnsavedWork())return;
        if(live.sig===_lastAutoSig.current)return;
        _lastAutoSig.current=live.sig;
        live.saveDraft&&live.saveDraft();
        setSyncStatus({lastDraftSaveAt:new Date().toISOString()});
        showToast('Draft auto-saved.');
      }catch(ex){console.warn('auto-save skipped:',ex.message);}
    },180000);
    const histTimer=setInterval(()=>{if(USE_SP||getSiteURL())loadHist();},5*60*1000);
    (async () => {
      /* Do NOT await this. It was the single blocking gate at startup: offline,
         the fetch sat there until the network timed out and history/monitoring
         never even began loading. The cached masterlist is already on screen
         (see the useState initialiser), so this only ever refreshes it. */
      loadML();
      /* Trim the per-CE cache on open; it is the bulk of local storage use and
         nothing pruned it before, so it only ever grew. */
      try { const n = LS.pruneCeCache(60); if (n) console.info('Pruned ' + n + ' cached CE(s) from local storage.'); } catch (_e) {}
      loadHist();
      loadMonData();
      /* Move the CE archive out of localStorage. Deliberately AFTER loadHist so
         reconciliation can reuse a warm SharePoint result, and fire-and-forget
         so it can never delay the UI. It defers itself when offline. */
      dbMigrateToIDB(currentUser.username, isAdmin).then(r => {
        if (r && r.moved) showToast('Moved ' + r.moved + ' CE(s) to offline storage, freeing ' + Math.round((r.freedBytes||0)/1024) + ' KB.');
      }).catch(ex => console.warn('CE archive migration skipped:', ex.message));
      /* Notify admin of pending registrations */
      if(isAdmin){try{const all=await dbGetUsers();const pCount=all.filter(u=>u.status==='pending').length;if(pCount>0)setTimeout(()=>showToast(`👤 ${pCount} user${pCount>1?'s':''} awaiting approval — check Admin Panel → Users`),1500);}catch(_){}};
      /* Sync when the connection returns. Until now nothing did this: CEs
         saved offline stayed local until someone found the admin push button.
         Debounced, because 'online' can fire several times as an adapter
         settles, and it re-pulls reference data afterwards so the tabs reflect
         what other people changed while this browser was away. */
      let _reconnectTimer = null;
      const onReconnect = () => {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = setTimeout(async () => {
          try {
            const r = await dbPushLocalCEs();
            if (r && r.pushed) showToast('Back online — uploaded ' + r.pushed + ' CE(s) saved offline.');
            if (r && r.failed) showToast(r.failed + ' offline CE(s) could not be uploaded; they are still saved here.', true);
          } catch (ex) { console.warn('reconnect push failed:', ex.message); }
          /* Audit entries written during the outage exist only here until this
             runs. Separate try: a failed CE upload must not strand the log. */
          try {
            const a = await dbPushAuditLog();
            if (a && a.pushed) console.info('audit log: uploaded ' + a.pushed + ' entr(y/ies) recorded offline.');
          } catch (ex) { console.warn('reconnect audit push failed:', ex.message); }
          try { if (window._shicFullRefresh) await window._shicFullRefresh(); } catch (_e) {}
        }, 2000);
      };
      window.addEventListener('shic-online', onReconnect);
      _cleanupReconnect = () => { window.removeEventListener('shic-online', onReconnect); clearTimeout(_reconnectTimer); };
      /* Also catch the case where the app STARTS online with a backlog — an
         'online' event never fires when the connection was already there. */
      if (navigator.onLine !== false) {
        setTimeout(() => { dbPushLocalCEs().then(r => {
          if (r && r.pushed) showToast('Uploaded ' + r.pushed + ' CE(s) that were saved offline.');
        }).catch(() => {}); }, 6000);
        setTimeout(() => { dbPushAuditLog().catch(() => {}); }, 8000);
      }
      /* Expose a global full-refresh so SyncStatusBar can trigger it */
      window._shicFullRefresh = async () => {
        Object.keys(_monSpIdCache).forEach(k => delete _monSpIdCache[k]);
        /* All four, not two. The Refresh button optimistically marks masterlist,
           monitoring AND drafts as 'saving', so anything not resolved here stays
           amber forever. The finally downgrades whatever is still in-flight. */
        try {
          await Promise.all([loadHist(), loadMonData(), loadML(), loadSowLib()]);
        } finally {
          const st = getSyncStatus(), fix = {};
          ['masterlist','monitoring','drafts','sowlib'].forEach(k => { if (st[k] === 'saving') fix[k] = 'local'; });
          if (Object.keys(fix).length) setSyncStatus(fix);
        }
      };
      /* Feature 7: load shared draft from URL ?draft= param */
      try {
        const urlDraft = new URLSearchParams(window.location.search).get('draft');
        if (urlDraft) {
          const d = JSON.parse(atob(urlDraft));
          if (d && d.info) {
            setTimeout(() => { try { applyDraftData(d); showToast('Shared draft loaded from link!'); } catch(e){} }, 800);
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      } catch(e) { console.warn('Draft URL parse failed:', e.message); }
    })();
    return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('beforeunload',onUnload);clearInterval(autoTimer);clearInterval(histTimer);if(_cleanupReconnect)_cleanupReconnect();};
  }, []);
  /* Refreshes the masterlist in the background. Mirrors the SharePoint copy
     locally so a browser that never edited the masterlist itself still has it
     offline — previously only dbSaveML wrote that cache. */
  const loadML = async () => {
    try {
      const ml = mlShape(await dbGetML());
      if (ml) {
        setMasterlist(ml);
        try { LS.set('masterlist', ml); } catch (e) { console.warn('masterlist not cached locally:', e && e.message); }
        try { refPut('masterlist', ml, (USE_SP || getSiteURL()) ? 'sharepoint' : 'local'); } catch (_e) {}
        setSyncStatus({masterlist:'synced', lastSyncAt: new Date().toISOString(), sp:'connected'});
      } else setSyncStatus({masterlist:'local'});
    } catch (ex) { console.warn('Masterlist load failed:', ex.message); setSyncStatus({masterlist:'error', sp:'error'}); }
  };
  const loadHist = async () => {
    setHistBusy(true);
    /* Paint the cached history immediately, then refresh from SharePoint in the
       background. Fetching 800+ CEs takes seconds, and blocking the first render
       on it made opening the app feel like it had hung. */
    try {
      const cached = LS.get('history') || [];
      if (cached.length) setHistory(isAdmin ? cached : cached.filter(h => h.savedBy === currentUser.username));
    } catch (_e) {}
    try {
      const spAvail = !!(USE_SP || getSiteURL());
      const h = await dbGetHistory(currentUser.username, isAdmin);
      /* Keep LS in sync with SP so fallback is never stale. Only ever write a
         NON-empty result. The old code purged the cache whenever SharePoint
         returned zero rows, which was wrong twice over: a failed/trimmed query
         looks identical to an empty one, and non-admins query with
         `shicSavedBy eq '<user>'` — so zero rows means "none of MINE", not
         "none at all". A brand-new estimator wiped the shared cache. */
      let effective = h;
      if (spAvail && h && h.length > 0) {
        try { LS.set('history', h); } catch (e) { console.warn('history not cached locally:', e && e.message); }
      } else if (spAvail && h && h.length === 0) {
        /* Keep showing the cached list rather than blanking the UI. */
        try { effective = LS.get('history') || []; } catch (_e) { effective = []; }
        setSyncStatus({ sp: 'connected' });
      }
      setHistory(effective);
      try{window.shicHistory=effective.map(function(e){return Object.assign({},e.data||{},e);});}catch(_e){}
      spLoadMLImports().then(function(imports){
        if(imports&&imports.length){
          window.shicHistory=(window.shicHistory||[]).concat(imports);
        }
      }).catch(function(){});
    } catch (e) {
      /* SP completely unreachable — show whatever is in LS */
      console.warn('loadHist error, using local cache:', e.message);
      try {
        const cached = LS.get('history') || [];
        const u = currentUser.username;
        setHistory(isAdmin ? cached : cached.filter(h => h.savedBy === u));
      } catch (_e) {}
    }
    setHistBusy(false);
  };
  const saveML = async ml => {
    setMasterlist(ml);
    try{window.shicMasterlist=ml;}catch(_e){}
    setSyncStatus({masterlist:'saving', dirty:true});
    try {
      await dbSaveML(ml);
      auditLog('masterlist_save', Object.keys(ml||{}).map(k=>k+':'+((ml[k]||[]).length)).join(' '), currentUser?.username);
      setSyncStatus({masterlist:'synced', lastSyncAt: new Date().toISOString(), sp:'connected', dirty:false});
    } catch (e) {
      setSyncStatus({masterlist:'error'});
      showToast('Masterlist save failed: ' + e.message, true);
    }
  };
  const showToast = (msg, err = false) => {
    setToast(msg);
    setToastErr(err);
    setTimeout(() => setToast(''), 3200);
    window._shicToast = showToast;
  };
  window._shicToast = showToast;
  const prov = getProvider();
  const provInfo = PROVIDERS[prov];
  const mpSub = useMemo(() => mp.reduce((s, r) => {
    if (!r.role) return s; /* blank starter row is not a cost */
    const mult = SHIFTS[r.shift]?.mult || 1;
    const reg = N(r.pax) * N(r.days) * N(r.rate) * mult;
    const ot = N(r.pax) * N(r.days) * (N(r.otHours || 0) / 8) * N(r.rate) * 1.25 * mult;
    return s + reg + ot;
  }, 0), [mp]);
  const calcBen = r => {
    const mult = SHIFTS[r.shift]?.mult || 1;
    const pax = N(r.pax),
      days = N(r.days),
      rate = N(r.rate) * mult;
    const thirteenth = rate / 12 * days * pax;
    const sss = rate * 0.25 * 0.75 * days * pax / 26;
    const hdmf = rate * 0.16 * days * pax / 26 * 2;
    const sil = rate * days * pax * 5 / 12 / 26 + pax * 30;
    const perdiem = N(r.perDiem || 0) * days * pax;
    return {
      thirteenth,
      sss,
      hdmf,
      sil,
      perdiem,
      total: thirteenth + sss + hdmf + sil + perdiem
    };
  };
  const ben = mp.reduce((s, r) => s + (r.role ? calcBen(r).total : 0), 0),
    mpTot = mpSub + ben;
  /* Tools & Equipment can be charged per day (crane, welding machine, ...).
     `days` is optional and defaults to 1, so any row that never sets it costs
     exactly qty x cost and existing CEs keep their totals. */
  const resDays = r => (r.days === undefined || r.days === null || r.days === '') ? 1 : (N(r.days) || 0);
  const toolsT = useMemo(() => tools.reduce((s, r) => s + N(r.qty) * resDays(r) * N(r.cost), 0), [tools]);
  const matsT = useMemo(() => mats.reduce((s, r) => s + N(r.qty) * N(r.cost), 0), [mats]);
  const ppeT = useMemo(() => ppe.reduce((s, r) => s + N(r.qty) * N(r.cost), 0), [ppe]);
  const miscT = useMemo(() => (MISC_DEF[ceType] || MISC_DEF['onsite']).reduce((s, [k]) => {
    const arr = Array.isArray(misc[k]) ? misc[k] : [];
    return s + arr.reduce((t, r) => t + N(r.qty) * N(r.cost), 0);
  }, 0), [misc, ceType]);
  const mobVehiclesT = useMemo(() => mobVehicles.reduce((s, r) => s + N(r.qty) * N(r.days) * N(r.rate), 0), [mobVehicles]);
  const demobVehiclesT = useMemo(() => demobVehicles.reduce((s, r) => s + N(r.qty) * N(r.days) * N(r.rate), 0), [demobVehicles]);
  const mobSubT = mobVehiclesT;
  const demobSubT = demobVehiclesT;
  const mobT = cfg.mobDemob ? mobSubT + demobSubT : 0;
  const grand = mobT + mpTot + toolsT + matsT + ppeT + miscT;
  const unitP = grand / (N(info.qty) || 1);
  /* ── Highlighted costs ──────────────────────────────────────────────────
     Callouts of money that is ALREADY counted in the sections above (e.g. a
     client wants "DELIVERY TO PAGBILAO" or "THIRD PARTY COST" shown on its
     own line). They are never added to `grand` -- doing so would double-count.
     A row either links to a CE figure via `src` (amount stays in sync when the
     underlying cost is edited) or carries a manually typed amount. */
  const hlSources = useMemo(() => {
    const o = [];
    o.push({ k: 'calc:unit', g: 'Computed', l: 'Unit Price (Total / Qty)', v: unitP });
    o.push({ k: 'calc:grand', g: 'Computed', l: 'Grand Total', v: grand });
    if (cfg.mobDemob) {
      o.push({ k: 'sec:mob', g: 'Sections', l: 'Mobilization', v: mobSubT });
      o.push({ k: 'sec:demob', g: 'Sections', l: 'Demobilization', v: demobSubT });
    }
    o.push({ k: 'sec:mp', g: 'Sections', l: 'Manpower Cost', v: mpTot });
    o.push({ k: 'sec:tools', g: 'Sections', l: 'Tools & Equipment', v: toolsT });
    o.push({ k: 'sec:mats', g: 'Sections', l: 'Materials & Consumables', v: matsT });
    o.push({ k: 'sec:ppe', g: 'Sections', l: 'PPE', v: ppeT });
    o.push({ k: 'sec:misc', g: 'Sections', l: 'Miscellaneous', v: miscT });
    (MISC_DEF[ceType] || MISC_DEF['onsite']).forEach(([key, lbl]) => {
      const nm = lbl.replace(/^[A-Z]\.\d+\s*/, '');
      const arr = Array.isArray(misc[key]) ? misc[key] : [];
      o.push({ k: 'miscCat:' + key, g: 'Misc Categories', l: nm, v: arr.reduce((s, r) => s + N(r.qty) * N(r.cost), 0) });
      arr.forEach((r, i) => {
        if (!r.desc) return;
        o.push({ k: 'miscRow:' + key + ':' + (r.id || i), g: 'Misc Line Items', l: nm + ' → ' + r.desc, v: N(r.qty) * N(r.cost) });
      });
    });
    return o;
  }, [unitP, grand, mobSubT, demobSubT, mpTot, toolsT, matsT, ppeT, miscT, misc, ceType, cfg.mobDemob]);
  /* Resolve a highlighted row to its current amount / label. */
  const hlAmt = r => (r.src && r.src !== 'manual') ? N((hlSources.find(o => o.k === r.src) || {}).v) : N(r.amount);
  const hlLabel = r => r.label || r.desc || '';
  const hlRows = (addlCosts || []).filter(r => hlLabel(r));
  const addRow = (set, t) => set(p => [...p, t === 'mp' ? mkMP() : mkRes()]);
  const updRow = (set, id, k, v) => set(p => p.map(r => r.id === id ? {
    ...r,
    [k]: v
  } : r));
  const delRow = (set, id) => set(p => p.filter(r => r.id !== id));

  /* ── SOW Breakdown ────────────────────────────────────────────────────────
     Resource rows stay the single source of truth for cost (totals are still
     computed from mp/tools/mats/ppe/misc exactly as before). The breakdown adds
     an optional `taskId` to each row pointing at a Scope of Work item, so a
     task and the resources it needs stay aligned -- delete the task and its
     resources go with it. Rows with no taskId are simply "Unassigned", which is
     what every pre-existing CE looks like. */
  const _mkResRow = (item, taskId) => ({ ...mkRes(), desc: item ? item.desc : '', uom: item ? item.uom : 'Lot', cost: item ? item.cost : 0, taskId: taskId || '' });
  const RES_TABS = [
    { key: 'mp', label: 'Manpower', set: setMp, rows: mp, qtyKey: 'pax', nameKey: 'role', costKey: 'rate', ml: 'manpower',
      mk: (item, taskId) => ({ ...mkMP(), role: item ? item.role : '', rate: item ? item.rate : 0, perDiem: item ? (item.perDiem || 0) : 0, taskId: taskId || '' }) },
    { key: 'tools', label: 'Tools & Equipment', set: setTools, rows: tools, qtyKey: 'qty', nameKey: 'desc', costKey: 'cost', ml: 'tools', mk: _mkResRow },
    { key: 'mats', label: 'Consumables', set: setMats, rows: mats, qtyKey: 'qty', nameKey: 'desc', costKey: 'cost', ml: 'materials', mk: _mkResRow },
    { key: 'ppe', label: 'PPE', set: setPpe, rows: ppe, qtyKey: 'qty', nameKey: 'desc', costKey: 'cost', ml: 'ppe', mk: _mkResRow },
  ];
  /* Numbered label for a scope item, matching the Scope of Work tab (1, 1.1, 2...). */
  const sowLabels = useMemo(() => {
    const out = {};
    let mc = 0, sc = 0;
    (sowItems || []).forEach(it => {
      if (it.type === 'main') { mc++; sc = 0; out[it.id] = String(mc); }
      else { sc++; out[it.id] = mc + '.' + sc; }
    });
    return out;
  }, [sowItems]);
  /* Miscellaneous is an object of category arrays rather than one flat array,
     so it needs its own accessors -- but it participates in the breakdown just
     like the other blocks (their Excel sheet has a MISCELLANEOUS column too). */
  const miscCats = (MISC_DEF[ceType] || MISC_DEF['onsite']).map(([k, lbl]) => ({ k, label: lbl.replace(/^[A-Z]\.\d+\s*/, '') }));
  const miscFlat = () => miscCats.reduce((acc, c) => acc.concat((Array.isArray(misc[c.k]) ? misc[c.k] : []).map(r => ({ ...r, _cat: c.k, _catLabel: c.label }))), []);
  const miscUpd = (cat, id, key, val) => setMisc(p => ({ ...p, [cat]: (p[cat] || []).map(r => r.id === id ? { ...r, [key]: val } : r) }));
  const miscDel = (cat, id) => setMisc(p => ({ ...p, [cat]: (p[cat] || []).filter(r => r.id !== id) }));
  const miscAdd = (cat, taskId, item) => setMisc(p => ({ ...p, [cat]: [...(p[cat] || []), { ...mkMiscRow(), desc: item ? item.desc : '', uom: item ? item.uom : 'Lot', cost: item ? item.cost : 0, taskId: taskId || '' }] }));
  const miscClearTask = taskId => setMisc(p => { const n = { ...p }; Object.keys(n).forEach(k => { if (Array.isArray(n[k])) n[k] = n[k].filter(r => r.taskId !== taskId); }); return n; });
  const taskResCount = id => RES_TABS.reduce((s, t) => s + t.rows.filter(r => r.taskId === id).length, 0)
    + miscFlat().filter(r => r.taskId === id).length;
  /* Cost of a single row, using the same formulas that drive the section totals
     so a per-task subtotal can never disagree with the Grand Total. */
  const rowCost = (kind, r) => {
    if (kind === 'tools') return N(r.qty) * resDays(r) * N(r.cost);
    if (kind !== 'mp') return N(r.qty) * N(r.cost);
    if (!r.role) return 0; /* blank row: no role, no cost (calcBen SIL adds pax*30) */
    const mult = SHIFTS[r.shift]?.mult || 1;
    const reg = N(r.pax) * N(r.days) * N(r.rate) * mult;
    const ot = N(r.pax) * N(r.days) * (N(r.otHours || 0) / 8) * N(r.rate) * 1.25 * mult;
    return reg + ot + calcBen(r).total;
  };
  const taskCost = id => RES_TABS.reduce((s, t) => s + t.rows.filter(r => r.taskId === id).reduce((a, r) => a + rowCost(t.key, r), 0), 0)
    + miscFlat().filter(r => r.taskId === id).reduce((a, r) => a + rowCost('misc', r), 0);
  /* A main task owns the consecutive sub-tasks that follow it in the flat list. */
  const sowTaskGroup = item => {
    const list = sowItems || [];
    const i = list.findIndex(s => s.id === item.id);
    if (i < 0 || item.type !== 'main') return [item.id];
    const ids = [item.id];
    for (let j = i + 1; j < list.length && list[j].type === 'sub'; j++) ids.push(list[j].id);
    return ids;
  };
  /* A main task's own resources are usually only part of the story -- the work
     is costed on its sub-tasks. Rolled-up figures let the parent card answer
     "what does this whole scope step cost?" without expanding it. For a
     sub-task (or a main task with no subs) the roll-up is just its own. */
  const taskCostRollup = item => sowTaskGroup(item).reduce((s, id) => s + taskCost(id), 0);
  const taskResCountRollup = item => sowTaskGroup(item).reduce((s, id) => s + taskResCount(id), 0);
  const sowUnassignedCount = (() => {
    const valid = new Set((sowItems || []).map(s => s.id));
    const bad = r => !r.taskId || !valid.has(r.taskId);
    return RES_TABS.reduce((s, t) => s + t.rows.filter(r => r[t.nameKey] && bad(r)).length, 0)
      + miscFlat().filter(r => r.desc && bad(r)).length;
  })();
  /* Delete a scope task and, with confirmation, the resources assigned to it. */
  const deleteSowTask = item => {
    const ids = sowTaskGroup(item);
    const subs = ids.length - 1;
    const n = ids.reduce((s, id) => s + taskResCount(id), 0);
    if ((n > 0 || subs > 0) && !confirm('Delete this scope task' +
      (subs > 0 ? ' and its ' + subs + ' sub-task' + (subs === 1 ? '' : 's') : '') +
      (n > 0 ? ', plus the ' + n + ' resource row' + (n === 1 ? '' : 's') + ' assigned to ' + (subs > 0 ? 'them' : 'it') : '') +
      '?' + (n > 0 ? '\n\nThe resources will be removed from the Manpower / Tools / Consumables / PPE / Miscellaneous tabs too, so the totals will change.' : '') +
      '\n\nYou can undo this for 10 seconds.')) return;
    const snap = { sow: [...sowItems], mp: [...mp], tools: [...tools], mats: [...mats], ppe: [...ppe], misc: JSON.parse(JSON.stringify(misc)) };
    setSowItems(p => p.filter(s => !ids.includes(s.id)));
    if (n > 0) { RES_TABS.forEach(t => t.set(p => p.filter(r => !ids.includes(r.taskId)))); ids.forEach(id => miscClearTask(id)); }
    if (n > 0 || subs > 0) {
      const tid = setTimeout(() => setUndoToast(null), 10000);
      setUndoToast({
        msg: (ids.length > 1 ? ids.length + ' scope tasks' : 'Scope task') + (n > 0 ? ' and ' + n + ' resource row' + (n === 1 ? '' : 's') : '') + ' deleted.',
        onUndo: () => {
          clearTimeout(tid);
          setSowItems(snap.sow); setMp(snap.mp); setTools(snap.tools); setMats(snap.mats); setPpe(snap.ppe); setMisc(snap.misc);
          setUndoToast(null);
          showToast('Delete undone.');
        }
      });
    }
  };

  /* ---- Document reading ---- */
  const readDoc = async file => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      const lib = window.pdfjsLib;
      if (lib) lib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
      const ab = await file.arrayBuffer();
      const pdf = await lib.getDocument({
        data: ab
      }).promise;
      let t = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
        const pg = await pdf.getPage(i);
        const c = await pg.getTextContent();
        t += c.items.map(x => x.str).join(' ') + '\n';
      }
      return t.trim();
    } else if (ext === 'docx') {
      const ab = await file.arrayBuffer();
      return (await mammoth.extractRawText({
        arrayBuffer: ab
      })).value.trim();
    } else if (ext === 'xlsx' || ext === 'xls') {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      return wb.SheetNames.map(n => '[' + n + ']\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n');
    } else if (['txt', 'csv', 'md'].includes(ext)) {
      return await file.text();
    }
    throw new Error('Unsupported file type: .' + ext + '. Use PDF, DOCX, XLSX or TXT.');
  };
  const handleDocUpload = async file => {
    if (!file) return;
    setDocBusy(true);
    try {
      const text = await readDoc(file);
      let spUrl = null;
      if (USE_SP) {
        const ab = await file.arrayBuffer();
        spUrl = await spUploadDoc(file.name, ab);
      }
      setDocFile({
        name: file.name,
        size: file.size,
        text,
        spUrl,
        uploadedAt: new Date().toISOString()
      });
      showToast('"' + file.name + '" loaded. Click Extract Info to auto-fill fields.');
    } catch (e) {
      showToast(e.message, true);
    }
    setDocBusy(false);
  };
  const extractDocInfo = async () => {
    if (!docFile?.text) return;
    setDocBusy(true);
    try {
      const preview = docFile.text.slice(0, 10000);
      const mlRoles = masterlist.manpower.map(r => r.role + ':P' + r.rate).join(', ');
      const tlList = masterlist.tools.slice(0, 30).map(r => r.desc).join(', ');
      const mtList = masterlist.materials.slice(0, 30).map(r => r.desc).join(', ');
      const prompt = ['You are a cost estimation assistant for Synergy3 Corp, a Philippine mechanical/electrical contractor.', '\nExtract ALL project data from the document below and return ONLY valid JSON.\n', '\nDOCUMENT:\n---\n', preview, '\n---\n\n', 'Available manpower roles: ', mlRoles, '\nAvailable tools: ', tlList, '\nAvailable materials: ', mtList, '\n\nRespond ONLY with valid JSON matching this schema exactly (no markdown, no extra text):\n', '{"client":"","location":"","description":"","material":"","qty":"1","days":"","projType":"mechanical","attention":"","endUser":"",', '"manpower":[{"role":"","pax":1,"days":1,"shift":"regular_day","rate":0}],', '"tools":[{"desc":"","qty":1,"uom":"Lot","cost":0}],', '"materials":[{"desc":"","qty":1,"uom":"Lot","cost":0}],', '"ppe":[{"desc":"","qty":1,"uom":"Pcs","cost":0}],', '"sow":[{"type":"main","text":""},{"type":"sub","text":""}],', '"notes":""}', '\n\nRules:', '\n- projType: "electrical" or "mechanical" only', '\n- description: 1-2 sentence scope summary', '\n- manpower: extract all roles mentioned; use available roles list for rate matching', '\n- tools: extract all equipment and tools mentioned', '\n- materials: extract all materials, consumables, spare parts mentioned', '\n- ppe: extract all PPE items mentioned', '\n- sow: convert the scope of work into structured items. type="main" for numbered steps, type="sub" for lettered sub-steps', '\n- notes: any disclaimers, assumptions, special conditions', '\n- Use empty arrays [] if section not found. Empty string "" if field not found.'].join('');
      const raw = await callAI(prompt, 2500);
      const ex = JSON.parse(raw.replace(/```json|```/g, '').trim());
      /* Apply project info */
      const infoFields = ['client', 'location', 'description', 'material', 'qty', 'days', 'projType', 'attention', 'endUser'];
      const infoUpdate = Object.fromEntries(infoFields.map(k => [k, ex[k] || '']).filter(([, v]) => v));
      if (Object.keys(infoUpdate).length) setInfo(p => ({
        ...p,
        ...infoUpdate
      }));
      /* Apply resources */
      if (ex.manpower?.length) setMp(ex.manpower.map(r => ({
        ...r,
        id: uid(),
        otHours: 0,
        perDiem: 0
      })));
      if (ex.tools?.length) setTools(ex.tools.map(r => ({
        ...r,
        id: uid()
      })));
      if (ex.materials?.length) setMats(ex.materials.map(r => ({
        ...r,
        id: uid()
      })));
      if (ex.ppe?.length) setPpe(ex.ppe.map(r => ({
        ...r,
        id: uid()
      })));
      /* Apply Scope of Work */
      if (ex.sow?.length) setSowItems(ex.sow.map(s => ({
        ...s,
        id: uid()
      })));
      /* Apply notes */
      if (ex.notes) setNotes(p => [...p, {
        id: uid(),
        seq: p.length + 1,
        text: ex.notes
      }]);
      const filled = [];
      if (ex.manpower?.length) filled.push(ex.manpower.length + ' manpower');
      if (ex.tools?.length) filled.push(ex.tools.length + ' tools');
      if (ex.materials?.length) filled.push(ex.materials.length + ' materials');
      if (ex.ppe?.length) filled.push(ex.ppe.length + ' PPE');
      if (ex.sow?.length) filled.push(ex.sow.length + ' scope items');
      showToast('Extracted: ' + filled.join(', ') + '. Review all tabs.');
    } catch (e) {
      showToast('Extraction failed: ' + e.message, true);
    }
    setDocBusy(false);
  };

  /* ---- AI scope generator ---- */
  const handleAI = async () => {
    if (!scope.trim()) return;
    setAiLoad(true);
    const rlist = masterlist.manpower.map(r => r.role + ':P' + r.rate).join(', ');
    const tlList = masterlist.tools.slice(0, 30).map(r => r.desc).join(', ');
    const mtList = masterlist.materials.slice(0, 30).map(r => r.desc).join(', ');
    try {
      const prompt = ['Philippine contractor Synergy3 Corp. CE Type: ', ceType.toUpperCase(), '.\nScope description: ', scope, '\n\nAvailable manpower roles & rates: ', rlist, '\nAvailable tools: ', tlList, '\nAvailable materials: ', mtList, '\n\nRespond ONLY in valid JSON (no markdown):\n', '{"manpower":[{"role":"","pax":1,"days":1,"shift":"regular_day","rate":0}],', '"tools":[{"desc":"","qty":1,"uom":"Lot","cost":0}],', '"materials":[{"desc":"","qty":1,"uom":"Lot","cost":0}],', '"ppe":[{"desc":"","qty":1,"uom":"Pcs","cost":0}],', '"sow":[{"type":"main","text":""},{"type":"sub","text":""}]}', '\nShifts: regular_day,regular_night,sunday_day,sunday_night,holiday_day,holiday_night.', '\nBased on the scope description, generate:', '\n- Realistic manpower roles with appropriate pax, days, and rates from available list', '\n- Required tools and equipment', '\n- Necessary materials and consumables', '\n- Required PPE', '\n- Detailed Scope of Work items (main numbered steps and lettered sub-steps)'].join('');
      const raw = await callAI(prompt, 2000);
      const p = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (p.manpower?.length) setMp(p.manpower.map(r => ({
        ...r,
        id: uid(),
        otHours: 0,
        perDiem: 0
      })));
      if (p.tools?.length) setTools(p.tools.map(r => ({
        ...r,
        id: uid()
      })));
      if (p.materials?.length) setMats(p.materials.map(r => ({
        ...r,
        id: uid()
      })));
      if (p.ppe?.length) setPpe(p.ppe.map(r => ({
        ...r,
        id: uid()
      })));
      if (p.sow?.length) setSowItems(p.sow.map(s => ({
        ...s,
        id: uid()
      })));
      setTab('manpower');
      const filled = [];
      if (p.manpower?.length) filled.push(p.manpower.length + ' manpower');
      if (p.tools?.length) filled.push(p.tools.length + ' tools');
      if (p.sow?.length) filled.push(p.sow.length + ' SOW items');
      showToast('Generated: ' + filled.join(', ') + '. Review all tabs.');
    } catch (e) {
      showToast('AI failed: ' + e.message, true);
    }
    setAiLoad(false);
  };
  const mkEntry = (revSuffix = '') => {
    const revNum = revSuffix ? info.ceNum.trim() + '-' + revSuffix : info.ceNum.trim();
    return {
      ceType,
      info: {
        ...info,
        ceNum: revNum
      },
      mp: [...mp],
      tools: [...tools],
      mats: [...mats],
      ppe: [...ppe],
      misc: {
        ...misc
      },
      addlCosts: [...addlCosts],
      notes: [...notes],
      sowItems: [...sowItems],
      approvers: [...approvers],
      mobVehicles: [...mobVehicles],
      demobVehicles: [...demobVehicles],
      grand,
      unitP,
      savedBy: currentUser.username,
      savedAt: new Date().toISOString(),
      docRef: docFile ? {
        name: docFile.name,
        spUrl: docFile.spUrl || null
      } : null
    };
  };
  const [sharedDrafts, setSharedDrafts] = React.useState([]);
  const [draftsOpen, setDraftsOpen] = React.useState(false);

  /* \u2500\u2500 apply a draft data object into CE state \u2500\u2500 */
  const applyDraftData = d => {
    setCeType(d.ceType || 'onsite');
    setInfo({
      ...BLANK_INFO,
      ...d.info
    });
    /* Loading regenerates every row id, scope tasks included. Remap each
       resource row's taskId through the same mapping, or every SOW Breakdown
       assignment would silently orphan on load. */
    const _sowMap = {};
    const _sow = (d.sowItems || []).map(s => { const nid = uid(); _sowMap[s.id] = nid; return { ...s, id: nid }; });
    const _rt = r => ({ ...r, id: uid(), taskId: (r.taskId && _sowMap[r.taskId]) || '' });
    const _mp=(d.mp||[]).map(_rt);setMp(_mp);try{window.shicCurrentMp=_mp;}catch(_e){}
    const _tools=(d.tools||[]).map(_rt);setTools(_tools);try{window.shicCurrentTools=_tools;}catch(_e){}
    const _mats=(d.mats||[]).map(_rt);setMats(_mats);try{window.shicCurrentMats=_mats;}catch(_e){}
    setPpe((d.ppe || []).map(_rt));
    const rawMisc = d.misc || {};
    const migratedMisc = {};
    MISC_DEF[d.ceType || 'onsite']?.forEach(([k]) => {
      migratedMisc[k] = Array.isArray(rawMisc[k]) ? rawMisc[k].map(_rt) : N(rawMisc[k]) > 0 ? [{
        id: uid(),
        desc: 'Lump sum',
        qty: 1,
        uom: 'Lot',
        cost: N(rawMisc[k])
      }] : [];
    });
    setMisc({
      ...BLANK_MISC,
      ...migratedMisc
    });
    setNotes(JSON.parse(JSON.stringify(d.notes || [])).map((n, i) => ({
      ...n,
      id: uid(),
      seq: n.seq || i + 1
    })));
    setSowItems(_sow);
    if (d.approvers) setApprovers(d.approvers);
    setMobVehicles((d.mobVehicles || []).map(r => ({
      ...r,
      id: uid()
    })));
    setDemobVehicles((d.demobVehicles || []).map(r => ({
      ...r,
      id: uid()
    })));
    setScope(d.scope || '');
    setAddlCosts((d.addlCosts || []).map(r => ({...r, id: r.id || uid()})));
    setMargin(d.margin || 0);
    setTab('info');
  };

  /* \u2500\u2500 Save draft \u2014 local + SharePoint shared \u2500\u2500 */
  const saveDraft = async () => {
    const draftId = 'draft_' + (info.ceNum || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + currentUser.username;
    const d = {
      draftId,
      ceType,
      info: {
        ...info
      },
      mp: [...mp],
      tools: [...tools],
      mats: [...mats],
      ppe: [...ppe],
      misc: {
        ...misc
      },
      addlCosts: [...addlCosts],
      notes: [...notes],
      sowItems: [...sowItems],
      approvers: [...approvers],
      mobVehicles: [...mobVehicles],
      demobVehicles: [...demobVehicles],
      scope,
      savedBy: currentUser.username,
      savedByName: currentUser.name || currentUser.username,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (e) {}
    setSyncStatus({dirty: true});
    try {
      const ok = await dbSaveDraft(d);
      if (ok) {
        setSyncStatus({lastSyncAt: new Date().toISOString(), sp: 'connected', dirty: false});
        showToast('Draft saved and shared with team via SharePoint.');
      } else {
        showToast('Draft saved locally (SharePoint unavailable).');
      }
    } catch (e) {
      showToast('Draft saved locally.');
    }
  };

  /* \u2500\u2500 Load shared drafts list from SharePoint \u2500\u2500 */
  const loadSharedDrafts = async () => {
    setSyncStatus({drafts:'saving'});
    try {
      const list = await dbGetDrafts();
      setSharedDrafts(list);
      setSyncStatus({drafts:'synced', lastSyncAt: new Date().toISOString(), sp:'connected'});
      if (list.length === 0) showToast('No shared drafts found.');
    } catch (e) {
      setSharedDrafts([]);
      setSyncStatus({drafts:'error'});
    }
  };

  /* \u2500\u2500 Delete a shared draft \u2500\u2500 */
  const deleteDraft = async draftId => {
    try {
      await dbDeleteDraft(draftId);
    } catch (e) {}
    try {
      const loc = localStorage.getItem(DRAFT_KEY);
      if (loc && JSON.parse(loc).draftId === draftId) localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
    setSharedDrafts(p => p.filter(d => d.draftId !== draftId));
    showToast('Draft deleted.');
  };

  /* \u2500\u2500 Resume a draft \u2500\u2500 */
  const resumeDraft = d => {
    if (confirm('Resume draft by ' + d.savedByName + '? This will replace your current unsaved work.')) {
      applyDraftData(d);
      setDraftsOpen(false);
      const age = Math.round((Date.now() - new Date(d.savedAt).getTime()) / 60000);
      showToast('Resumed draft (saved ' + age + ' min ago by ' + d.savedByName + ').');
    }
  };

  /* \u2500\u2500 Local draft helpers \u2500\u2500 */
  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        showToast('No local draft found.', true);
        return;
      }
      const d = JSON.parse(raw);
      applyDraftData(d);
      const age = Math.round((Date.now() - new Date(d.savedAt).getTime()) / 60000);
      showToast('Draft loaded (saved ' + age + ' min ago).');
    } catch (e) {
      showToast('Failed to load draft: ' + e.message, true);
    }
  };
  const hasDraft = () => {
    try {
      return !!localStorage.getItem(DRAFT_KEY);
    } catch {
      return false;
    }
  };
  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };
  const handleSave = async () => {
    let _overwrote = null; /* set when bulk mode lets a save replace an existing CE */
    const ceNum = (info.ceNum || '').trim().toUpperCase();
    if (ceNum !== (info.ceNum || '').trim()) setInfo(p => ({...p, ceNum}));
    if (!ceNum) {
      showToast('CE Number is required.', true);
      return;
    }
    if (!/^[A-Z0-9\-_\/\.]{2,30}$/.test(ceNum)) {
      showToast('CE Number must be 2–30 characters, letters/numbers/dashes only.', true);
      return;
    }
    if (!(info.client || '').trim()) {
      showToast('Client name is required.', true);
      return;
    }
    const badCost = [...(mp||[]), ...(tools||[]), ...(mats||[]), ...(ppe||[])].find(r => Number(r.cost||r.rate||0) < 0);
    if (badCost) {
      showToast('All cost/rate values must be zero or positive.', true);
      return;
    }
    if (!confirmZeroCost('Save anyway?')) return;
    const dup = await dbFindCEByNum(ceNum).catch(() => null);
    if (dup && !dup._imported) {
      /* Bulk upload mode lets an admin load historical CEs whose numbers already
         exist. Saving then UPDATES that CE rather than adding a second one, so
         say which one is being replaced instead of failing silently. */
      if (!(isAdmin && bulkMode.on(currentUser?.username))) {
        showToast('CE Number "' + ceNum + '" already exists in history (saved ' + new Date(dup.savedAt).toLocaleDateString() + '). Use a unique CE Number.', true);
        return;
      }
      /* Recorded rather than toasted here: the success toast fires moments later
         and would replace it, leaving no trace that a CE was replaced. */
      _overwrote = new Date(dup.savedAt).toLocaleDateString();
      auditLog('bulk_overwrite', ceNum + ' (was saved ' + _overwrote + ')', currentUser?.username);
    }
    try {
      await spWithRetry(() => dbSaveHistory(mkEntry()));
      auditLog('save_ce', ceNum, currentUser?.username);
      _checkAutoBackup();
      clearDraft();
      await loadHist();
      showToast(_overwrote
        ? 'Saved — REPLACED existing CE ' + ceNum + ' (previously saved ' + _overwrote + ').'
        : 'Saved! CE ' + ceNum + ' added to history.');
    } catch (e) {
      showToast('Save failed: ' + e.message, true);
    }
  };
  const handleSaveRevision = async () => {
    const ceNum = (info.ceNum || '').trim();
    if (!ceNum) {
      showToast('Please enter a CE Number before saving a revision.', true);
      return;
    }
    const allHist = await dbGetHistory(null, true).catch(() => []);
    /* Find highest existing revision for this CE number */
    const base = ceNum.toUpperCase().replace(/-R\d+$/, '');
    const revEntries = allHist.filter(h => {
      const n = (h.info?.ceNum || '').toUpperCase().replace(/-R\d+$/, '');
      return n === base;
    });
    let nextRev = 1;
    revEntries.forEach(h => {
      const m = (h.info?.ceNum || '').match(/-R(\d+)$/i);
      if (m) nextRev = Math.max(nextRev, parseInt(m[1]) + 1);
    });
    const revLabel = 'R' + nextRev;
    const revCeNum = base + '-' + revLabel;
    /* Check uniqueness */
    const dup = allHist.find(h => (h.info?.ceNum || '').toUpperCase() === revCeNum);
    if (dup) {
      showToast(revCeNum + ' already exists in history.', true);
      return;
    }
    try {
      await dbSaveHistory(mkEntry(revLabel));
      setInfo(p => ({
        ...p,
        ceNum: revCeNum
      }));
      await loadHist();
      loadMonData();
      showToast('Revision saved as ' + revCeNum + '.');
    } catch (e) {
      showToast('Save failed: ' + e.message, true);
    }
  };
  const hasUnsavedWork = () => {
    const hasInfo = !!(info.ceNum && info.ceNum !== BLANK_INFO.ceNum) || !!(info.client) || !!(info.description);
    /* `r.pax` defaults to 1 on the blank starter row, so testing it made a
       brand-new CE look dirty and prompted "unsaved work will be replaced"
       before anything had been typed. */
    const hasRows = mp.some(r=>r.role) || tools.some(r=>r.desc) || mats.some(r=>r.desc) || ppe.some(r=>r.desc);
    return hasInfo || hasRows;
  };
  const handleLoad = async e => {
    if (hasUnsavedWork() && !confirm('Load this CE? Your current unsaved work will be replaced.\n\nTip: save a draft first (Ctrl+S or the Save Draft button) if you need to keep it.')) return;
    let d = e.data || e;
    // SP history items have numeric id but no tools — fetch full CE before applying
    if (d.tools === undefined) {
      // Try SP first, fall back to local full-data cache
      if (typeof d.id === 'number' && (USE_SP || getSiteURL())) {
        try { const full = await dbLoadCE(d.id); if (full) d = full; } catch(ex) { console.warn('handleLoad dbLoadCE:', ex.message); }
      }
      // Still no tools — try the local cache written by dbSaveHistory
      if (d.tools === undefined) {
        try { const cached = LS.get('ce_cache:' + (d.info?.ceNum || d.ceNum)); if (cached) d = cached; } catch(_) {}
      }
    } else {
      // We have full data from SP — compare with local cache and use whichever is newer
      try {
        const cached = LS.get('ce_cache:' + (d.info?.ceNum || d.ceNum));
        if (cached && cached.savedAt && d.savedAt && cached.savedAt > d.savedAt) d = cached;
      } catch(_) {}
    }
    setCeType(d.ceType);
    setInfo({
      ...BLANK_INFO,
      ...d.info
    });
    /* Loading regenerates every row id, scope tasks included. Remap each
       resource row's taskId through the same mapping, or every SOW Breakdown
       assignment would silently orphan on load. */
    const _sowMap = {};
    const _sow = (d.sowItems || []).map(s => { const nid = uid(); _sowMap[s.id] = nid; return { ...s, id: nid }; });
    const _rt = r => ({ ...r, id: uid(), taskId: (r.taskId && _sowMap[r.taskId]) || '' });
    const _mp=(d.mp||[]).map(_rt);setMp(_mp);try{window.shicCurrentMp=_mp;}catch(_e){}
    const _tools=(d.tools||[]).map(_rt);setTools(_tools);try{window.shicCurrentTools=_tools;}catch(_e){}
    const _mats=(d.mats||[]).map(_rt);setMats(_mats);try{window.shicCurrentMats=_mats;}catch(_e){}
    setPpe((d.ppe || []).map(_rt));
    /* migrate old numeric misc to arrays */
    const rawMisc = d.misc || {};
    const migratedMisc = {};
    MISC_DEF[d.ceType || 'onsite']?.forEach(([k]) => {
      migratedMisc[k] = Array.isArray(rawMisc[k]) ? rawMisc[k].map(_rt) : N(rawMisc[k]) > 0 ? [{
        id: uid(),
        desc: 'Lump sum',
        qty: 1,
        uom: 'Lot',
        cost: N(rawMisc[k])
      }] : [];
    });
    setMisc({
      ...BLANK_MISC,
      ...migratedMisc
    });
    setSowItems(_sow);
    if (d.approvers) setApprovers(JSON.parse(JSON.stringify(d.approvers)));
    setNotes(JSON.parse(JSON.stringify(d.notes || [])).map((n, i) => ({
      ...n,
      id: uid(),
      seq: n.seq || i + 1
    })));
    setMobVehicles((d.mobVehicles || []).map(r => ({
      ...r,
      id: uid()
    })));
    setDemobVehicles((d.demobVehicles || []).map(r => ({
      ...r,
      id: uid()
    })));
    setAddlCosts((d.addlCosts || []).map(r => ({...r, id: r.id || uid()})));
    setMargin(d.margin || 0);
    setDocFile(d.docRef ? {
      name: d.docRef.name,
      spUrl: d.docRef.spUrl,
      text: '',
      size: 0
    } : null);
    setDocPreview(false);
    setTab('info');
    showToast('Loaded: ' + (d.info?.ceNum || ''));
  };
  const handleClone = (e) => {
    const d = e.data || e;
    handleLoad({...d, info: {...(d.info || {}), ceNum: nextCeNum(history), date: new Date().toISOString().slice(0,10)}});
    showToast('Cloned — assigned new CE number.');
  };
  const handleRevise = (e) => {
    const d = e.data || e;
    const base = (d.info?.ceNum || '').replace(/-R\d+$/i, '');
    let maxR = 0;
    (history || []).forEach(h => {
      const n = (h.info?.ceNum || '');
      if (n.replace(/-R\d+$/i,'').toUpperCase() === base.toUpperCase()) {
        const m = n.match(/-R(\d+)$/i);
        if (m) maxR = Math.max(maxR, parseInt(m[1]));
      }
    });
    const newCeNum = base + '-R' + (maxR + 1);
    handleLoad({...d, info: {...(d.info || {}), ceNum: newCeNum, date: new Date().toISOString().slice(0,10)}});
    showToast('Revision ' + newCeNum + ' loaded — review & save when ready.');
  };
  const handleNew = () => {
    setCeType('onsite');
    setInfo({
      ...BLANK_INFO,
      ceNum: nextCeNum(history),
      date: new Date().toISOString().slice(0, 10)
    });
    setMp([mkMP()]);
    setTools([mkRes()]);
    setMats([mkRes()]);
    setPpe([mkRes()]);
    setMisc({
      ...BLANK_MISC
    });
    setNotes([]);
    setSowItems([]);
    setMobVehicles([]);
    setDemobVehicles([]);
    setScope('');
    setApprovers([{
      role: 'Prepared By',
      name: '',
      title: 'Cost Estimator'
    }, {
      role: 'Checked By',
      name: 'Kenneth Mendoza',
      title: 'Cost Supervisor'
    }, {
      role: 'Noted By',
      name: 'Mr. Jhuniel Ubana',
      title: 'TSG Head'
    }, {
      role: 'Noted By',
      name: 'Mr. Fernando Bautista',
      title: 'Operations Director'
    }, {
      role: 'Approved By',
      name: 'Mr. Warren Maralit',
      title: 'Director of Sales and Technical'
    }]);
    setAddlCosts([]);
    setMargin(0);
    setDocFile(null);
    setDocPreview(false);
    setTab('info');
    showToast('New CE started.');
  };
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const cl = ceType === 'onsite' ? 'Onsite' : ceType === 'shopworks' ? 'Shopwork' : 'Supply';
    const s1 = [['COST ESTIMATE SUMMARY', '', '', '', '', '', '', '', '', '', '', 'Document No.:', cfg.docNo], ['', '', '', '', '', '', '', '', '', '', '', 'Revision No.:', '0'], ['PROJECT TYPE:', '', '', '', info.projType === 'electrical' ? 'TRUE' : 'FALSE', 'Electrical ' + cl, '', info.projType === 'mechanical' ? 'TRUE' : 'FALSE', 'Mechanical ' + cl], ['PROJECT DESCRIPTION:', info.description, '', '', '', '', '', '', '', '', 'DATE:', info.date], ['CE NUMBER:', info.ceNum], ['CLIENT:', info.client, '', '', '', '', '', '', '', '', '', '', '', 'CE:', info.ceNum], ['LOCATION:', info.location, '', '', '', '', '', 'MATERIAL:', info.material], ['ATTENTION:', info.attention, '', '', '', '', '', 'QTY:', info.qty, '', '', 'STATUS:', info.status], ['END USER:', info.endUser, '', '', '', '', '', 'DAYS:', info.days], [], ['ITEM', 'DESCRIPTION', '', '', '', '', '', '', '', '', 'TOTAL COST'], ...(cfg.mobDemob ? [['', 'MOBILIZATION', '', '', '', '', '', '', '', '', N(mobSubT)], ['', 'DEMOBILIZATION', '', '', '', '', '', '', '', '', N(demobSubT)]] : []), ['A.', 'MANPOWER COST', '', '', '', '', '', '', '', '', mpTot], [ceType === 'supply' ? 'B.' : 'D.', 'TOOLS AND EQUIPMENT', '', '', '', '', '', '', '', '', toolsT], [ceType === 'supply' ? 'B.' : 'E.', 'MATERIALS AND CONSUMABLES', '', '', '', '', '', '', '', '', matsT], [ceType === 'supply' ? 'C.' : 'F.', 'PERSONAL PROTECTIVE EQUIPMENT', '', '', '', '', '', '', '', '', ppeT], [ceType === 'supply' ? 'D.' : ceType === 'onsite' ? 'G.' : 'E.', 'MISCELLANEOUS', '', '', '', '', '', '', '', '', miscT], [], ['TOTAL AMOUNT:', '', '', '', '', '', '', '', '', '', grand], [], ['UNIT PRICE:', '', '', '', '', '', '', '', '', '', unitP], ...(margin !== 0 ? [['MARGIN:', '', '', '', '', '', '', '', '', '', (margin > 0 ? '+' : '') + margin + '%'], ['SELLING PRICE:', '', '', '', '', '', '', '', '', '', grand * (1 + margin / 100)]] : []), ...(hlRows.length ? [[], ['HIGHLIGHTED COSTS (already included above):'], ...hlRows.map(r => ['', hlLabel(r).toUpperCase(), '', '', '', '', '', '', '', '', hlAmt(r)])] : []), [], ['NOTE:'], ['1. CE covers ' + ceType + ' work for ' + info.description], ['2. Additional scope not in original SOW is excluded.'], ['3. Lead time assumes no interruptions or hold points.'], [], ['Prepared By:', '', '', '', 'Checked By:', '', '', 'Noted By:', '', '', '', 'Approved By:'], ['', '', '', '', 'Mr. Jhuniel Ubana', '', '', 'Mr. Fernando Bautista', '', '', '', 'Mr. Warren Maralit'], ['Cost Estimator', '', '', '', 'TSG - Head', '', '', 'Operations Director', '', '', '', 'Dir. Sales & Technical'], [], ['Reviewed By:', '', '', '', '', '', '', cfg.hasConc ? 'Concurred By:' : ''], ['Kenneth Mendoza', '', '', '', '', '', '', cfg.hasConc ? 'RADIM ASAULA' : ''], ['Cost Supervisor', '', '', '', '', '', '', cfg.hasConc ? 'FS MANAGER' : '']];
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!cols'] = [{
      wch: 8
    }, {
      wch: 36
    }, ...Array(9).fill({
      wch: 6
    }), {
      wch: 18
    }];
    XLSX.utils.book_append_sheet(wb, ws1, 'CE SUMMARY');
    const s2 = [['RESOURCES'], [], ['TOOLS (BOTE)'], ['Desc', 'Qty', 'Days', 'UOM', 'Unit Cost', 'Total'], ...tools.map(r => [r.desc, N(r.qty), resDays(r), r.uom, N(r.cost), N(r.qty) * resDays(r) * N(r.cost)]), ['', '', '', '', 'TOTAL:', toolsT], [], ['MATERIALS (BOCM)'], ['Desc', 'Qty', 'UOM', 'Unit Cost', 'Total'], ...mats.map(r => [r.desc, N(r.qty), r.uom, N(r.cost), N(r.qty) * N(r.cost)]), ['', '', '', 'TOTAL:', matsT], [], ['PPE'], ['Desc', 'Qty', 'UOM', 'Unit Cost', 'Total'], ...ppe.map(r => [r.desc, N(r.qty), r.uom, N(r.cost), N(r.qty) * N(r.cost)]), ['', '', '', 'TOTAL:', ppeT]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), 'Resources');
    const s3 = [['MANPOWER COST'], [], ...(cfg.mobDemob ? [['MOBILIZATION'], ...(mobVehicles.length ? [['Vehicles:'], ['Description', 'Qty', 'Days', 'Rate', 'Total'], ...mobVehicles.map(v => [v.desc, N(v.qty), N(v.days), N(v.rate), N(v.qty) * N(v.days) * N(v.rate)]), ['', '', '', 'Mobilization Total:', mobVehiclesT]] : []), ['Mobilization Total:', mobSubT], [], ['DEMOBILIZATION'], ...(demobVehicles.length ? [['Vehicles:'], ['Description', 'Qty', 'Days', 'Rate', 'Total'], ...demobVehicles.map(v => [v.desc, N(v.qty), N(v.days), N(v.rate), N(v.qty) * N(v.days) * N(v.rate)]), ['', '', '', 'Demobilization Total:', demobVehiclesT]] : []), ['Demobilization Total:', demobSubT], []] : []), ['Role', 'PAX', 'Days', 'Shift', 'Mult', 'Day Rate', 'Total'], ...mp.map(r => {
      const sh = SHIFTS[r.shift];
      return [r.role, N(r.pax), N(r.days), sh?.label, sh?.mult, N(r.rate), N(r.pax) * N(r.days) * N(r.rate) * (sh?.mult || 1)];
    }), ['', '', '', '', '', 'Subtotal:', mpSub], ['Benefits 20%:', '', '', '', '', '', ben], ['', '', '', '', '', 'TOTAL:', mpTot]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), 'Manpower Cost');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['MISCELLANEOUS'], [], ...(MISC_DEF[ceType] || MISC_DEF.onsite).map(([k, l]) => [l, N(misc[k])]), [], ['TOTAL:', miscT]]), 'MISC.');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SUMMARY'], ['Grand Total:', grand], ['Unit Price (qty=' + info.qty + '):', unitP]]), 'Summary');
    XLSX.writeFile(wb, info.ceNum + '_' + ceType + '.xlsx');
    showToast('Excel exported - 5 sheets!');
  };

  /* ---- Scope Builder (Project Info tab - multi-select) ---- */
  const ScopeBuilder = () => {
    const cats = ['All', ...[...new Set(sowLib.map(s => s.cat))].sort()];
    const filtered = sowLib.filter(s => {
      const matchCat = sowCat === 'All' || s.cat === sowCat;
      const q = sowSearch.toLowerCase();
      const matchQ = !q || s.title.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q) || (s.scope[0] || '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
    const selCount = Object.keys(sowSel).length;
    const totalQty = Object.values(sowSel).reduce((a, b) => a + b, 0);
    const toggleSel = id => {
      setSowSel(p => {
        const n = {
          ...p
        };
        if (n[id]) delete n[id];else n[id] = 1;
        return n;
      });
    };
    const setQty = (id, q) => setSowSel(p => ({
      ...p,
      [id]: Math.max(1, Math.min(20, q))
    }));
    const clearSel = () => setSowSel({});
    const selectAll = () => {
      const m = {};
      filtered.forEach(s => m[s.id] = sowSel[s.id] || 1);
      setSowSel(m);
    };
    const findRate = role => {
      const m = (masterlist?.manpower || []).find(r => r.role.toUpperCase() === role.toUpperCase());
      return m ? m.rate : 0;
    };
    const findPerDiem = role => {
      const m = (masterlist?.manpower || []).find(r => r.role.toUpperCase() === role.toUpperCase());
      return m ? m.perDiem || 0 : 0;
    };
    const findToolCost = desc => {
      const t = (masterlist?.tools || []).find(r => r.desc.toUpperCase() === desc.toUpperCase());
      return t ? t.cost : 0;
    };
    const findMatCost = desc => {
      const m = (masterlist?.materials || []).find(r => r.desc.toUpperCase() === desc.toUpperCase());
      return m ? m.cost : 0;
    };
    const findPpeCost = desc => {
      const p = (masterlist?.ppe || []).find(r => r.desc.toUpperCase() === desc.toUpperCase());
      return p ? p.cost : 0;
    };
    const applySelected = () => {
      const selected = sowLib.filter(s => sowSel[s.id]);
      if (!selected.length) {
        showToast('Select at least one service first.', true);
        return;
      }

      /* Accumulate all items, then merge duplicates by name */
      const mpMap = {},
        toolMap = {},
        matMap = {},
        ppeMap = {};
      const scopeParts = [];
      selected.forEach(svc => {
        const qty = sowSel[svc.id] || 1;
        scopeParts.push('[x' + qty + '] ' + svc.title + ': ' + ((svc.scope||[])[0] || ''));
        for (let i = 0; i < qty; i++) {
          /* Helper: resolve item \u2014 accepts string or {name,qty} */
          const resolve = item => typeof item === 'string' ? {name: item, qty: 1} : {name: item.name||'', qty: item.qty||1};
          /* Manpower: merge by role \u2014 add pax (multiplied by item qty) */
          svc.mp.forEach(raw => {
            const {name: role, qty: iq} = resolve(raw);
            if (!role) return;
            const key = role.toUpperCase().trim();
            if (mpMap[key]) {
              mpMap[key].pax += iq;
            } else {
              mpMap[key] = {
                id: uid(),
                role,
                pax: iq,
                days: N(info.days) || 1,
                shift: 'regular_day',
                rate: findRate(role),
                otHours: 0,
                perDiem: findPerDiem(role)
              };
            }
          });
          /* Tools: merge by description \u2014 add qty */
          svc.tools.forEach(raw => {
            const {name: desc, qty: iq} = resolve(raw);
            if (!desc) return;
            const key = desc.toUpperCase().trim();
            if (toolMap[key]) {
              toolMap[key].qty += iq;
            } else {
              toolMap[key] = {
                id: uid(),
                desc,
                qty: iq,
                uom: 'Lot',
                cost: findToolCost(desc)
              };
            }
          });
          /* Materials: merge by description \u2014 add qty */
          svc.mats.forEach(raw => {
            const {name: desc, qty: iq} = resolve(raw);
            if (!desc) return;
            const key = desc.toUpperCase().trim();
            if (matMap[key]) {
              matMap[key].qty += iq;
            } else {
              matMap[key] = {
                id: uid(),
                desc,
                qty: iq,
                uom: 'Lot',
                cost: findMatCost(desc)
              };
            }
          });
          /* PPE: merge by description \u2014 add qty */
          svc.ppe.forEach(raw => {
            const {name: desc, qty: iq} = resolve(raw);
            if (!desc) return;
            const key = desc.toUpperCase().trim();
            if (ppeMap[key]) {
              ppeMap[key].qty += iq;
            } else {
              ppeMap[key] = {
                id: uid(),
                desc,
                qty: iq,
                uom: 'Pcs',
                cost: findPpeCost(desc)
              };
            }
          });
        }
      });
      const newMp = Object.values(mpMap);
      const newTools = Object.values(toolMap);
      const newMats = Object.values(matMap);
      const newPpe = Object.values(ppeMap);
      if (addMode) {
        /* ADD mode: merge into existing, skip duplicates */
        setMp(prev => {
          const ex = new Set(prev.map(x => x.role.toUpperCase()));
          return [...prev, ...newMp.filter(r => !ex.has(r.role.toUpperCase()))];
        });
        setTools(prev => {
          const ex = new Set(prev.map(x => x.desc.toUpperCase()));
          return [...prev, ...newTools.filter(r => !ex.has(r.desc.toUpperCase()))];
        });
        setMats(prev => {
          const ex = new Set(prev.map(x => x.desc.toUpperCase()));
          return [...prev, ...newMats.filter(r => !ex.has(r.desc.toUpperCase()))];
        });
        setPpe(prev => {
          const ex = new Set(prev.map(x => x.desc.toUpperCase()));
          return [...prev, ...newPpe.filter(r => !ex.has(r.desc.toUpperCase()))];
        });
      } else {
        if (newMp.length > 0) setMp(newMp);
        if (newTools.length > 0) setTools(newTools);
        if (newMats.length > 0) setMats(newMats);
        if (newPpe.length > 0) setPpe(newPpe);
      }
      setScope(scopeParts.join('\n\n'));
      /* Build SOW items from service scope descriptions */
      const newSow = [];
      selected.forEach(svc => {
        const qty = sowSel[svc.id] || 1;
        const title = (qty > 1 ? 'x' + qty + ' ' : '') + svc.title;
        newSow.push({
          id: uid(),
          type: 'main',
          text: title
        });
        (svc.scope || []).forEach(line => {
          if (line.trim()) newSow.push({
            id: uid(),
            type: 'sub',
            text: line.trim()
          });
        });
      });
      if (newSow.length) setSowItems(addMode ? prev => [...prev, ...newSow] : newSow);
      if (!addMode) setInfo(p => ({
        ...p,
        description: selected.map(s => sowSel[s.id] > 1 ? 'x' + sowSel[s.id] + ' ' + s.title : s.title).join('; ')
      }));
      setSowSel({});
      setTab('manpower');
      const dupeNote = newMp.length < selected.reduce((t, s) => t + (s.mp || []).length * (sowSel[s.id] || 1), 0) ? ' (duplicates merged)' : '';
      showToast((addMode ? 'Added' : 'Applied') + ' ' + selCount + ' service(s)' + dupeNote + '. Resources and SOW ' + (addMode ? 'merged' : 'populated') + '.');
    };
    const CatBadge = ({
      cat
    }) => {
      const colors = {
        'On-Site Services': '#58A6FF',
        'Turbine Repair': '#F85149',
        'Valve Repair': '#A78BFA',
        'Fabrication': '#3FB950',
        'Ndt - Level 2': '#F0A429',
        'Ndt \u2013 Level 2': '#F0A429',
        'Boiler Protection': '#EC4899',
        'Rebabbitting': '#FBBF24',
        'Materials & Spare Parts': '#34D399',
        'Rental \u2013 Machinery & Tools': '#818CF8',
        'Hard Surfacing & Pulverizer': '#FB923C',
        'Manpower Supply & Tech Support': '#6EE7B7',
        'Long Term Service Contracts': '#A5B4FC',
        'Precision Machining & Fabrication': '#67E8F9'
      };
      const c = colors[cat] || '#7D8590';
      return /*#__PURE__*/React.createElement("span", {
        style: {
          background: c + '22',
          color: c,
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: 3,
          whiteSpace: 'nowrap'
        }
      }, cat);
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: '#A78BFA44'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        color: '#A78BFA'
      }
    }, "Service Scope Builder"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, "-- Select one or more services, set quantity, then apply. Works offline."), /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('def', true),
        marginLeft: 'auto',
        fontSize: 10
      },
      onClick: () => setTab('scopelib')
    }, "Edit Library")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginBottom: 8,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        flex: 1,
        minWidth: 150
      },
      placeholder: "Search service...",
      value: sowSearch,
      onChange: e => setSowSearch(e.target.value)
    }), /*#__PURE__*/React.createElement("select", {
      style: {
        ...INP,
        width: 200
      },
      value: sowCat,
      onChange: e => setSowCat(e.target.value)
    }, cats.map(c => /*#__PURE__*/React.createElement("option", {
      key: c
    }, c))), (sowSearch || sowCat !== 'All') && /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        setSowSearch('');
        setSowCat('All');
      }
    }, "Clear"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: selectAll,
      title: "Select all visible"
    }, "Select All"), selCount > 0 && /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: clearSel
    }, "Clear (", selCount, ")")), /*#__PURE__*/React.createElement("div", {
      style: {
        maxHeight: 240,
        overflowY: 'auto',
        border: `1px solid ${BDR}`,
        borderRadius: 6,
        marginBottom: 8
      }
    }, filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 20,
        textAlign: 'center',
        color: MT,
        fontSize: 12
      }
    }, "No matching services."), filtered.map(svc => {
      const isSel = !!sowSel[svc.id];
      const qty = sowSel[svc.id] || 1;
      return /*#__PURE__*/React.createElement("div", {
        key: svc.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          borderBottom: `1px solid ${BDR}22`,
          background: isSel ? '#A78BFA12' : 'transparent',
          transition: 'background .1s'
        }
      }, /*#__PURE__*/React.createElement("input", {
        type: "checkbox",
        checked: isSel,
        onChange: () => toggleSel(svc.id),
        style: {
          width: 15,
          height: 15,
          cursor: 'pointer',
          flexShrink: 0,
          accentColor: '#A78BFA'
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0,
          cursor: 'pointer'
        },
        onClick: () => toggleSel(svc.id)
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          ...MONO,
          color: MT,
          fontSize: 10,
          flexShrink: 0
        }
      }, "SY3-", String(svc.id).padStart(2, '0')), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600,
          fontSize: 12
        }
      }, svc.title), /*#__PURE__*/React.createElement(CatBadge, {
        cat: svc.cat
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          color: MT,
          fontSize: 10,
          marginTop: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }
      }, (svc.scope||[])[0] || '')), isSel && /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          color: MT,
          fontSize: 10
        }
      }, "x"), /*#__PURE__*/React.createElement("button", {
        style: {
          ...btn('def', true),
          padding: '1px 7px',
          fontSize: 13
        },
        onClick: e => {
          e.stopPropagation();
          setQty(svc.id, qty - 1);
        }
      }, "-"), /*#__PURE__*/React.createElement("span", {
        style: {
          ...MONO,
          fontSize: 12,
          fontWeight: 700,
          minWidth: 18,
          textAlign: 'center'
        }
      }, qty), /*#__PURE__*/React.createElement("button", {
        style: {
          ...btn('def', true),
          padding: '1px 7px',
          fontSize: 13
        },
        onClick: e => {
          e.stopPropagation();
          setQty(svc.id, qty + 1);
        }
      }, "+")));
    })), selCount > 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 12px',
        background: SURF,
        borderRadius: 6,
        border: `1px solid ${'#A78BFA'}44`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        color: '#A78BFA'
      }
    }, selCount, " service", selCount !== 1 ? 's' : '', " selected -- ", totalQty, " total application", totalQty !== 1 ? 's' : ''), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 11,
        marginTop: 2
      }
    }, sowLib.filter(s => sowSel[s.id]).map(s => `${s.title}${sowSel[s.id] > 1 ? ' x' + sowSel[s.id] : ''}`).join(' + '))), /*#__PURE__*/React.createElement("button", {
      style: btn('acc'),
      onClick: applySelected
    }, addMode ? 'Add to CE' : 'Apply to CE')) : /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 11,
        textAlign: 'center',
        padding: '6px 0'
      }
    }, sowLib.length, " services in library. Check boxes to select, set quantity with +/- then click Apply. Rates auto-matched from Masterlist."));
  };

  /* ---- Masterlist editor ---- */
  const MlEditor = () => {
    const [mlTab, setMlTab] = useState('manpower');
    const [mlQ, setMlQ] = useState('');
    const [mlPage, setMlPage] = useState(0);
    const [mlQuickAdd, setMlQuickAdd] = useState('');
    const mlQuickAddRef = React.useRef(null);
    const colK = {
      manpower: ['category', 'role', 'rate', 'perDiem', 'uom'],
      tools: ['category', 'desc', 'cost', 'uom'],
      materials: ['category', 'desc', 'cost', 'uom'],
      ppe: ['category', 'desc', 'cost', 'uom'],
      vehicles: ['category', 'desc', 'rate', 'uom']
    };
    const colL = {
      manpower: ['Item Code', 'Category', 'Role / Position', 'Day Rate (P)', 'Per Diem (P/Day)', 'UOM'],
      tools: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM'],
      materials: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM'],
      ppe: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM'],
      vehicles: ['Item Code', 'Category', 'Description', 'Rate (P)', 'UOM']
    };
    const downloadMLTemplate = tab => {
      const colMap = {
        manpower: ['code', 'category', 'role', 'rate', 'perDiem', 'uom'],
        tools: ['code', 'category', 'desc', 'cost', 'uom'],
        materials: ['code', 'category', 'desc', 'cost', 'uom'],
        ppe: ['code', 'category', 'desc', 'cost', 'uom'],
        vehicles: ['code', 'category', 'desc', 'rate', 'uom']
      };
      const headers = colMap[tab] || colMap.manpower;
      const rows = (masterlist[tab] || []).map(r => headers.map(h => r[h] !== undefined ? r[h] : ''));
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'SY3_Masterlist_' + tab + '_template.xlsx');
    };
    const importMLExcel = async (file, tab) => {
      try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, {
          type: 'array'
        });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {
          defval: ''
        });
        if (!rows.length) {
          showToast('No data found in file.', true);
          return;
        }
        const fieldMap = {
          manpower: {
            name: 'role',
            cost: 'rate'
          },
          tools: {
            name: 'desc',
            cost: 'cost'
          },
          materials: {
            name: 'desc',
            cost: 'cost'
          },
          ppe: {
            name: 'desc',
            cost: 'cost'
          },
          vehicles: {
            name: 'desc',
            cost: 'rate'
          }
        };
        const fm = fieldMap[tab] || fieldMap.tools;
        const newItems = rows.map((r, i) => {
          const item = {
            id: uid(),
            code: String(r.code || r.Code || '').trim() || 'SHIC-' + tab.toUpperCase().slice(0, 2) + '-' + (900 + i).toString().padStart(3, '0'),
            category: String(r.category || r.Category || 'General').trim(),
            [fm.name]: String(r[fm.name] || r.role || r.desc || r.description || '').trim(),
            [fm.cost]: parseFloat(r[fm.cost] || r.rate || r.cost || 0) || 0,
            uom: String(r.uom || r.UOM || 'Day').trim()
          };
          /* Manpower-specific: read perDiem column */
          if (tab === 'manpower') {
            item.perDiem = parseFloat(r.perDiem || r.perdiem || r['Per Diem'] || r['per diem'] || r['PER DIEM'] || r['Per Diem (P/Day)'] || 0) || 0;
          }
          return item;
        }).filter(item => item[fm.name]);
        if (!newItems.length) {
          showToast('No valid rows found. Check column headers.', true);
          return;
        }
        setMasterlist(p => {
          const existing = p[tab] || [];
          const existingNames = new Set(existing.map(x => (x[fm.name] || '').toUpperCase().trim()));
          const toAdd = newItems.filter(x => !existingNames.has((x[fm.name] || '').toUpperCase().trim()));
          const toUpdate = newItems.filter(x => existingNames.has((x[fm.name] || '').toUpperCase().trim()));
          const merged = existing.map(x => {
            const match = toUpdate.find(u => (u[fm.name] || '').toUpperCase().trim() === (x[fm.name] || '').toUpperCase().trim());
            return match ? {
              ...x,
              ...match,
              id: x.id
            } : x;
          });
          showToast(toAdd.length + ' added, ' + toUpdate.length + ' updated in ' + tab + '.');
          return {
            ...p,
            [tab]: [...merged, ...toAdd]
          };
        });
      } catch (err) {
        showToast('Import failed: ' + err.message, true);
      }
    };
    const catOpts = {
      manpower: ['Electrical', 'Mechanical', 'Civil', 'General'],
      tools: ['Electrical', 'Mechanical', 'General'],
      materials: ['Electrical', 'Mechanical', 'Civil', 'General'],
      ppe: ['General', 'Welding', 'Electrical', 'Mechanical'],
      vehicles: ['Transport', 'Fuel', 'Allowance', 'Meals', 'Travel', 'Accommodation', 'Personnel', 'Equipment Rental', 'Permit / Fee', 'Miscellaneous']
    };
    const filtered = (masterlist[mlTab] || []).filter(r => !mlQ || (r.role || r.desc || '').toLowerCase().includes(mlQ.toLowerCase()) || r.category.toLowerCase().includes(mlQ.toLowerCase()));
    const updML = (id, k, v) => {
      const next = { ...masterlist, [mlTab]: masterlist[mlTab].map(r => r.id === id ? { ...r, [k]: v } : r) };
      setMasterlist(next);
      try { window.shicMasterlist = next; } catch (_e) {}
      setSyncStatus(s => ({ ...s, dirty: true }));
      if (mlSaveTimer.current) clearTimeout(mlSaveTimer.current);
      mlSaveTimer.current = setTimeout(async () => {
        setSyncStatus({ masterlist: 'saving', dirty: true });
        try {
          await dbSaveML(next);
          setSyncStatus({ masterlist: 'synced', lastSyncAt: new Date().toISOString(), sp: 'connected', dirty: false });
        } catch (e) {
          setSyncStatus({ masterlist: 'error' });
          showToast('Masterlist save failed: ' + e.message, true);
        }
      }, 800);
    };
    const pfxMap = {
      manpower: 'MP',
      tools: 'TL',
      materials: 'MT',
      ppe: 'PP',
      vehicles: 'VH'
    };
    const nextCode = tab => {
      const pfx = 'SHIC-' + pfxMap[tab] + '-';
      const items = masterlist[tab] || [];
      const nums = items.map(r => {
        const m = (r.code || '').match(/-(\d+)$/);
        return m ? parseInt(m[1]) : 0;
      });
      const n = Math.max(0, ...nums) + 1;
      return pfx + String(n).padStart(3, '0');
    };
    const ML_PAGE_SIZE = 20;
    const addML = (nameVal) => {
      const newItem = {
        id: uid(),
        code: nextCode(mlTab),
        category: 'General',
        ...(mlTab === 'manpower' ? {
          role: nameVal || '',
          rate: 0,
          uom: 'Day'
        } : mlTab === 'vehicles' ? {
          desc: nameVal || '',
          rate: 0,
          uom: 'Day'
        } : {
          desc: nameVal || '',
          cost: 0,
          uom: 'Lot'
        })
      };
      saveML({ ...masterlist, [mlTab]: [newItem, ...(masterlist[mlTab] || [])] });
      setMlPage(0);
    };
    const handleQuickAdd = () => {
      const name = mlQuickAdd.trim();
      addML(name);
      setMlQuickAdd('');
      setTimeout(() => mlQuickAddRef.current?.focus(), 0);
    };
    const delML = id => saveML({
      ...masterlist,
      [mlTab]: (masterlist[mlTab] || []).filter(r => r.id !== id)
    });
    const [escPct, setEscPct] = useState('');
    const applyEscalation = () => {
      const pct = parseFloat(escPct);
      if (isNaN(pct) || pct === 0) { showToast('Enter a non-zero %', true); return; }
      const costKey = (mlTab === 'manpower' || mlTab === 'vehicles') ? 'rate' : 'cost';
      const count = (masterlist[mlTab] || []).length;
      if (!window.confirm('Apply ' + (pct > 0 ? '+' : '') + pct + '% to all ' + count + ' ' + mlTab + ' rates?')) return;
      saveML({...masterlist, [mlTab]: (masterlist[mlTab] || []).map(r => ({...r, [costKey]: Math.round(N(r[costKey]) * (1 + pct / 100))}))});
      showToast('Applied ' + (pct > 0 ? '+' : '') + pct + '% to ' + count + ' ' + mlTab + ' items.');
      setEscPct('');
    };
    const ks = colK[mlTab],
      ls = colL[mlTab];
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: INFO + '44'
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
        fontWeight: 700,
        marginRight: 4
      }
    }, "Masterlist Rate Card"), ['manpower', 'tools', 'materials', 'ppe', 'vehicles'].map(t => /*#__PURE__*/React.createElement("button", {
      key: t,
      onClick: () => { setMlTab(t); setMlPage(0); setMlQ(''); },
      style: {
        ...btn(mlTab === t ? 'acc' : 'def', true),
        textTransform: 'capitalize'
      }
    }, {
      manpower: 'Manpower',
      tools: 'Tools',
      materials: 'Materials',
      ppe: 'PPE',
      vehicles: 'Miscellaneous'
    }[t])), /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        width: 150,
        marginLeft: 'auto'
      },
      placeholder: "Search...",
      value: mlQ,
      onChange: e => { setMlQ(e.target.value); setMlPage(0); }
    }))), /*#__PURE__*/React.createElement("div", {
      style: CS
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        flexWrap: 'wrap',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, (masterlist[mlTab] || []).length, " items \u2022 ", USE_SP ? 'SharePoint' : 'browser'), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        saveML({
          ...masterlist,
          [mlTab]: DEFAULT_ML[mlTab].map(r => ({
            ...r,
            id: uid()
          }))
        });
        showToast('Reset to defaults.');
      }
    }, "Reset Defaults"), /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => downloadMLTemplate(mlTab)
    }, "Download Template"), /*#__PURE__*/React.createElement("button", {
      style: btn('danger', true),
      onClick: () => {
        if (confirm('Clear all ' + colL[mlTab][2].toLowerCase() + ' items in the ' + mlTab + ' list? This cannot be undone.')) {
          saveML({
            ...masterlist,
            [mlTab]: []
          });
          showToast('Cleared ' + mlTab + ' list.');
        }
      }
    }, "Clear List"), /*#__PURE__*/React.createElement("label", {
      style: {
        ...btn('def', true),
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }
    }, "Upload Excel", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: ".xlsx,.xls",
      style: {
        display: 'none'
      },
      onChange: e => {
        const f = e.target.files[0];
        if (f) {
          importMLExcel(f, mlTab);
        }
        e.target.value = '';
      }
    })), /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      onClick: () => addML('')
    }, "+ Add Item"), /*#__PURE__*/React.createElement("input", {
      ref: mlQuickAddRef,
      style: {...INP, width:180, fontSize:12},
      type: "text",
      placeholder: "Quick add name, press Enter",
      value: mlQuickAdd,
      onChange: e => setMlQuickAdd(e.target.value),
      onKeyDown: e => { if (e.key === 'Enter') handleQuickAdd(); }
    }), /*#__PURE__*/React.createElement("div", {
      style: {display:'flex', alignItems:'center', gap:4, marginLeft:8, borderLeft:`1px solid ${BDR}`, paddingLeft:8}
    }, /*#__PURE__*/React.createElement("input", {
      style: {...INP, width:70, fontSize:11},
      type: "number",
      placeholder: "% e.g. 5",
      value: escPct,
      onChange: e => setEscPct(e.target.value),
      title: "Enter a percentage to apply to all rates in this tab (positive = increase, negative = decrease)"
    }), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: applyEscalation,
      title: "Apply % adjustment to all rates in current tab"
    }, "Apply %")))), /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, [...ls, ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, filtered.slice(mlPage * ML_PAGE_SIZE, (mlPage + 1) * ML_PAGE_SIZE).map(r => {
      const nameKey = mlTab === 'manpower' ? 'role' : 'desc';
      const costKey = mlTab === 'tools' || mlTab === 'materials' || mlTab === 'ppe' ? 'cost' : 'rate';
      const nameVal = r[nameKey] || '';
      const costVal = r[costKey] || 0;
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 108,
          fontSize: 11
        },
        value: r.code || '',
        onChange: e => updML(r.id, 'code', e.target.value),
        placeholder: "SHIC-XX-000"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 130
        },
        value: r.category || '',
        onChange: e => updML(r.id, 'category', e.target.value)
      }, catOpts[mlTab].map(c => /*#__PURE__*/React.createElement("option", {
        key: c
      }, c)))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 175
        },
        value: nameVal,
        onChange: e => updML(r.id, nameKey, e.target.value),
        placeholder: mlTab === 'manpower' ? 'Role / position' : 'Item description'
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 92
        },
        type: "number",
        min: 0,
        value: costVal,
        onChange: e => updML(r.id, costKey, parseFloat(e.target.value) || 0)
      })), mlTab === 'manpower' && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 80
        },
        type: "number",
        min: 0,
        value: r.perDiem || 0,
        onChange: e => updML(r.id, 'perDiem', parseFloat(e.target.value) || 0),
        placeholder: "0"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 68
        },
        value: r.uom || 'Day',
        onChange: e => updML(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Day'))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => delML(r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    }))), (() => {
      const totalPages = Math.ceil(filtered.length / ML_PAGE_SIZE);
      if (totalPages <= 1) return null;
      const start = mlPage * ML_PAGE_SIZE + 1;
      const end = Math.min((mlPage + 1) * ML_PAGE_SIZE, filtered.length);
      return /*#__PURE__*/React.createElement("div", {
        style: {display:'flex', alignItems:'center', gap:8, marginTop:8, justifyContent:'center', fontSize:12, color:MT}
      },
        /*#__PURE__*/React.createElement("button", {
          style: {...btn('def', true), padding:'2px 10px', fontSize:11},
          disabled: mlPage === 0,
          onClick: () => setMlPage(p => p - 1)
        }, "← Prev"),
        `Page ${mlPage + 1} of ${totalPages}  (${start}–${end} of ${filtered.length})`,
        /*#__PURE__*/React.createElement("button", {
          style: {...btn('def', true), padding:'2px 10px', fontSize:11},
          disabled: mlPage >= totalPages - 1,
          onClick: () => setMlPage(p => p + 1)
        }, "Next →")
      );
    })())));
  };
  const STATUS_COLOR_MAP = {
    'Pending': '#6B7280',
    'Ongoing': '#F59E0B',
    'For site insp.': '#8B5CF6',
    'For Approval': '#3B82F6',
    'Waiting in...': '#EC4899',
    'Approved': '#10B981',
    'Cancelled': '#EF4444',
    'On Hold': '#F97316',
    'Submitted': '#06B6D4'
  };
  const getStatusColor = s => STATUS_COLOR_MAP[s] || ACC;
  const [newStatusInput, setNewStatusInput] = useState('');
  const [monSearch, setMonSearch] = useState('');
  const [monStatusFilter, setMonStatusFilter] = useState(new Set());
  const [monTypeFilter, setMonTypeFilter] = useState('all');
  const [compareSet, setCompareSet] = useState(new Set()); // CE comparison: max 2 ids
  const [compareModal, setCompareModal] = useState(null); // {a, b} loaded CE data // 'all' | 'onsite' | 'shopworks' | 'supply'
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [monSpIds, setMonSpIds] = useState(new Set());
  const [monSortCol, setMonSortCol] = useState('savedAt');
  const [monSortDir, setMonSortDir] = useState('desc');
  const [showStatusMgr, setShowStatusMgr] = useState(false);
  const [monPage, setMonPage] = useState(0);
  const MON_PAGE_SIZE = 20;
  const [editingRow, setEditingRow] = React.useState(null);
  const [attachPanel, setAttachPanel] = React.useState(null); // ceId or null
  const [attachList, setAttachList] = React.useState([]);
  const [attachBusy, setAttachBusy] = React.useState(false);
  const monTopScrollRef = React.useRef(null);
  const monTableWrapRef = React.useRef(null);

  const openAttachPanel = async (ceId) => {
    setAttachPanel(ceId); setAttachList([]); setAttachBusy(true);
    try {
      const spId = _monSpIdCache[ceId];
      if (!spId) { setAttachBusy(false); return; }
      const files = await spGetAttachments(spList('Monitoring'), spId);
      setAttachList(files);
    } catch(e) { showToast('Could not load attachments: ' + e.message, true); }
    setAttachBusy(false);
  };

  const handleAttachUpload = async (ceId, ceNum, files) => {
    if (!files.length) return;
    setAttachBusy(true);
    try {
      let spId = _monSpIdCache[ceId];
      if (!spId) {
        // Ensure monitoring record exists first
        await dbSaveMonEntry(ceId, ceNum, monData[ceId] || {});
        spId = _monSpIdCache[ceId];
      }
      if (!spId) throw new Error('Could not create monitoring record');
      for (const file of Array.from(files)) {
        const buf = await file.arrayBuffer();
        await spAddAttachment(spList('Monitoring'), spId, file.name, buf);
      }
      const updated = await spGetAttachments(spList('Monitoring'), spId);
      setAttachList(updated);
      showToast(`${files.length} file(s) uploaded.`);
    } catch(e) { showToast('Upload failed: ' + e.message, true); }
    setAttachBusy(false);
  };

  const handleAttachDelete = async (ceId, fileName) => {
    setAttachBusy(true);
    try {
      const spId = _monSpIdCache[ceId];
      if (!spId) throw new Error('No SP record');
      await spDeleteAttachment(spList('Monitoring'), spId, fileName);
      setAttachList(p => p.filter(f => f.FileName !== fileName));
      showToast('Attachment deleted.');
    } catch(e) { showToast('Delete failed: ' + e.message, true); }
    setAttachBusy(false);
  };
  const sortedHistory = useMemo(() => {
    const filtered = history.filter(e => {
      const m = monData[e.id] || {};
      if (monStatusFilter.size > 0) {
        const s = m.status || '';
        if (!monStatusFilter.has(s)) return false;
      }
      if (monTypeFilter !== 'all' && (e.ceType || 'onsite') !== monTypeFilter) return false;
      if (!monSearch) return true;
      const q = monSearch.toLowerCase();
      return (e.info?.ceNum || '').toLowerCase().includes(q) || (e.info?.client || '').toLowerCase().includes(q) || (e.info?.description || '').toLowerCase().includes(q) || (m.customer || '').toLowerCase().includes(q) || (m.receivedBy || '').toLowerCase().includes(q) || (m.remarks || '').toLowerCase().includes(q);
    });
    return [...filtered].sort((a, b) => {
      const ma = monData[a.id] || {},
        mb = monData[b.id] || {};
      let va, vb;
      if (monSortCol === 'ceNum') {
        va = a.info?.ceNum || '';
        vb = b.info?.ceNum || '';
      } else if (monSortCol === 'grand') {
        va = a.grand || 0;
        vb = b.grand || 0;
      } else if (monSortCol === 'deadline') {
        va = ma.deadline || '';
        vb = mb.deadline || '';
      } else if (monSortCol === 'status') {
        va = ma.status || '';
        vb = mb.status || '';
      } else {
        va = a.savedAt || '';
        vb = b.savedAt || '';
      }
      if (va < vb) return monSortDir === 'asc' ? -1 : 1;
      if (va > vb) return monSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [history, monData, monSearch, monStatusFilter, monTypeFilter, monSortCol, monSortDir]);
  const toggleSort = col => {
    if (monSortCol === col) setMonSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setMonSortCol(col);
      setMonSortDir('asc');
    }
  };
  const SortIcon = ({
    col
  }) => /*#__PURE__*/React.createElement("span", {
    style: {
      color: monSortCol === col ? ACC : BDR,
      fontSize: 9,
      marginLeft: 3
    }
  }, monSortCol === col ? monSortDir === 'asc' ? '\u25b2' : '\u25bc' : '\u21c5');
  /* ── Import full SHIC CE Excel files (BOTE/BOCM/PPE/MISC sheets) ── */
  const [ceImportProgress, setCeImportProgress] = React.useState(null);
  const importShicCeFiles = async (files) => {
    const list = Array.from(files);
    if (!list.length) return;
    setCeImportProgress({done: 0, total: list.length, errors: []});
    let done = 0, errors = [];
    for (const file of list) {
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, {type:'array', cellDates:true});
        const getSheet = name => {
          // Try exact name first, then case-insensitive match
          if (wb.Sheets[name]) return XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, defval:null});
          const key = Object.keys(wb.Sheets).find(k => k.toUpperCase() === name.toUpperCase());
          return key ? XLSX.utils.sheet_to_json(wb.Sheets[key], {header:1, defval:null}) : [];
        };
        // ── CE SUMMARY ──
        // Column map (0-indexed) based on SHIC CE template:
        // row[5]: {1:'PROJECT DECRIPTION:', 11:'DATE:', 12:date}
        // row[6]: {1:description}
        // row[7]: {11:CE_number}
        // row[4]: {1:'PROJECT TYPE:', 5:electrical_checkbox, 8:mechanical_checkbox}
        // row[8]: {1:'CLIENT NAME:', 3:client}
        // row[9]: {1:'CLIENT LOCATION:', 3:location, 11:material}
        // row[10]: {1:'ATTENTION:', 3:attention, 11:qty}
        // row[11]: {1:'END USER:', 3:endUser, 11:days}
        const sum = getSheet('CE SUMMARY');
        let ceNum='', description='', client='', location='', dateVal=null,
            projType='Mechanical', attention='', endUser='', material='', qty='', days='';
        for (let i=0; i<Math.min(16, sum.length); i++) {
          const row = sum[i]||[];
          // CE Number — look for pattern like SY3-CE-2026-0479 in any column
          for (let c=0; c<row.length; c++) {
            if (row[c] && String(row[c]).match(/\w+-CE-\d{4}-\d+/i)) { ceNum = String(row[c]).trim(); break; }
          }
          const r1 = String(row[1]||'').toUpperCase();
          if (r1.includes('PROJECT TYPE')) {
            // Electrical checkbox at col 5, Mechanical at col 8
            if (row[8]===true || row[8]==='TRUE') projType='Mechanical';
            else if (row[5]===true || row[5]==='TRUE') projType='Electrical';
          }
          if (r1.includes('PROJECT DESC') || r1.includes('PROJECT DECRIPTION')) {
            // Date is at col 12 on this row; description is on the NEXT row col 1
            const dv = row[12];
            if (dv instanceof Date) dateVal = dv;
            else if (typeof dv==='number' && dv>40000) dateVal = new Date((dv-25569)*86400000);
            const nr = sum[i+1]||[]; description = String(nr[1]||'').trim();
          }
          if (r1.includes('CLIENT NAME')) client = String(row[3]||'').trim();
          if (r1.includes('CLIENT LOCATION')) { location=String(row[3]||'').trim(); material=String(row[11]||'').trim(); }
          if (r1.includes('ATTENTION')) { attention=String(row[3]||'').trim(); qty=String(row[11]||'').trim(); }
          if (r1.includes('END USER')) { endUser=String(row[3]||'').trim(); days=String(row[11]||'').trim(); }
        }
        // ── Resource sheet parser — auto-detects header row and column positions ──
        const parseRes = (sheetName) => {
          const rows = getSheet(sheetName);
          const items=[]; let hdr=false, qI=-1, uI=-1, cI=-1;
          for (const row of rows) {
            if (!row) continue;
            if (!hdr) {
              const s = row.map(v=>String(v||'').toUpperCase()).join('|');
              if ((s.includes('ITEM NO') || s.includes('ITEM\nNO') || s.includes('NO.')) && s.includes('DESCRIPTION')) {
                row.forEach((v,i)=>{
                  const t=String(v||'').toUpperCase().trim();
                  if (t==='QTY') qI=i;
                  if (t==='UOM') uI=i;
                  if (t==='UNIT PRICE' || t.includes('UNIT PRICE')) cI=i;
                });
                hdr=true; continue;
              }
            }
            if (!hdr) continue;
            // Data row: col 1 = item number, col 2 = description
            const _itemNo = row[1]; const _itemNoN = Number(_itemNo);
            if (_itemNo != null && _itemNo !== '' && !isNaN(_itemNoN) && _itemNoN > 0 && row[2]) {
              const desc=String(row[2]).trim();
              if (!desc || desc.toUpperCase()==='N/A') continue;
              const qVal = qI>=0 ? Number(row[qI]) : 1;
              const uVal = uI>=0 ? String(row[uI]||'Lot') : 'Lot';
              const cVal = cI>=0 ? Number(row[cI]) : 0;
              items.push({id:uid(), desc, qty:qVal||1, uom:uVal.replace(/\/S$/i,'').trim(), cost:cVal||0});
            }
          }
          console.log('[CE Import]', sheetName, '→', items.length, 'items');
          return items;
        };
        // ── MISC parser ──
        const parseMisc = () => {
          const m={accommodation:[],transportation:[],requirements:[],adminCost:[],thirdParty:[],insurance:[],allowance:[]};
          const SM={ACCOMODATION:'accommodation',ACCOMMODATION:'accommodation',TRANSPORTATION:'transportation',REQUIREMENTS:'requirements','ADMIN COST':'adminCost','THIRD PARTY SERVICES':'thirdParty','THIRD PARTY':'thirdParty',INSURANCES:'insurance',INSURANCE:'insurance',ALLOWANCE:'allowance'};
          let sec=null;
          for (const row of getSheet('MISC.')) {
            if (!row) continue;
            if (row[2] && typeof row[2]==='string' && /^[A-Z]\.$/.test(row[2].trim())) {
              sec=SM[String(row[3]||'').toUpperCase().trim()]||null; continue;
            }
            if (sec && typeof row[2]==='number' && row[2]>0 && row[3]) {
              const cost=Number(row[10])||Number(row[11])||0;
              if (cost>0) m[sec].push({id:uid(), desc:String(row[3]).trim(), qty:Number(row[7])||1, uom:String(row[8]||'Lot').replace(/\/S$/i,'').trim(), cost});
            }
          }
          return m;
        };
        // Detect sheet role from header content (first 3 non-empty rows) as fallback to sheet name
        const detectSheetRole = (sheetKey) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetKey], {header:1, defval:null});
          for (let i=0; i<Math.min(3,rows.length); i++) {
            const txt = (rows[i]||[]).map(v=>String(v||'').toUpperCase()).join(' ');
            if (txt.includes('PERSONAL PROTECTIVE') || txt.includes('PPE')) return 'ppe';
            if (txt.includes('BILL OF TOOLS') || txt.includes('TOOLS & EQUIP') || txt.includes('TOOLS AND EQUIP') || txt.match(/\bBOTE\b/)) return 'tools';
            if (txt.includes('BILL OF CONSUMABLE') || txt.includes('MATERIALS') || txt.match(/\bBOCM\b/)) return 'mats';
            if (txt.includes('MISCELLANEOUS')) return 'misc';
            if (txt.includes('BILL OF LABOR') || txt.match(/\bBOL\b/)) return 'manpower';
          }
          return null;
        };
        // Build role→sheetKey map: prefer exact name match, fallback to header detection
        const roleMap = {manpower:null, tools:null, mats:null, ppe:null, misc:null};
        const nameRoles = {'BOL':'manpower','BOTE':'tools','BOCM':'mats','PPE':'ppe','MISC':'misc','MISC.':'misc'};
        for (const key of Object.keys(wb.Sheets)) {
          const up = key.toUpperCase().replace('.','');
          for (const [n,r] of Object.entries(nameRoles)) { if (up===n.replace('.','') && !roleMap[r]) { roleMap[r]=key; break; } }
        }
        // Fill remaining roles via header detection
        for (const key of Object.keys(wb.Sheets)) {
          const role = detectSheetRole(key);
          if (role && !roleMap[role]) roleMap[role]=key;
        }
        const missingRoles = Object.entries(roleMap).filter(([,v])=>!v).map(([k])=>k);
        if (missingRoles.length) showToast(`Warning: could not find sheets for: ${missingRoles.join(', ')} in ${file.name}`, true);
        // Override getSheet to use detected keys
        const getSheetByRole = role => roleMap[role] ? XLSX.utils.sheet_to_json(wb.Sheets[roleMap[role]], {header:1, defval:null}) : [];
        const parseResByRole = role => {
          const rows = getSheetByRole(role);
          const items=[]; let hdr=false, nI=-1, dI=-1, qI=-1, uI=-1, cI=-1;
          for (const row of rows) {
            if (!row) continue;
            if (!hdr) {
              const s = row.map(v=>String(v||'').toUpperCase()).join('|');
              if ((s.includes('ITEM NO') || s.includes('ITEM\nNO')) && s.includes('DESCRIPTION')) {
                row.forEach((v,i)=>{
                  const t=String(v||'').toUpperCase().trim();
                  if(t.includes('ITEM NO') || t==='ITEM\nNO.') nI=i;
                  if(t==='DESCRIPTION') dI=i;
                  if(t==='QTY') qI=i;
                  if(t==='UOM') uI=i;
                  if(t==='UNIT PRICE'||t.includes('UNIT PRICE')) cI=i;
                });
                hdr=true; continue;
              }
            }
            if (!hdr) continue;
            const _itemNo = nI>=0 ? row[nI] : (row[1]??row[2]);
            const _itemNoN = Number(_itemNo);
            if (_itemNo!=null && _itemNo!=='' && !isNaN(_itemNoN) && _itemNoN>0) {
              const desc = String(dI>=0 ? (row[dI]||'') : (row[2]||row[3]||'')).trim();
              if (!desc || desc.toUpperCase()==='N/A') continue;
              items.push({id:uid(), desc, qty:qI>=0?Number(row[qI])||1:1, uom:uI>=0?String(row[uI]||'Lot').replace(/\/S$/i,'').trim():'Lot', cost:cI>=0?Number(row[cI])||0:0});
            }
          }
          console.log('[CE Import]', role, '→', items.length, 'items (sheet:', roleMap[role]||'not found', ')');
          return items;
        };
        const parseMiscByRole = () => {
          const m={accommodation:[],transportation:[],requirements:[],adminCost:[],thirdParty:[],insurance:[],allowance:[]};
          const SM={ACCOMODATION:'accommodation',ACCOMMODATION:'accommodation',TRANSPORTATION:'transportation',REQUIREMENTS:'requirements','ADMIN COST':'adminCost','THIRD PARTY SERVICES':'thirdParty','THIRD PARTY':'thirdParty',INSURANCES:'insurance',INSURANCE:'insurance',ALLOWANCE:'allowance'};
          let sec=null;
          for (const row of getSheetByRole('misc')) {
            if (!row) continue;
            const sxIdx = row.findIndex(v => v && typeof v==='string' && /^[A-Z]\.$/.test(String(v).trim()));
            if (sxIdx >= 0) { sec=SM[String(row[sxIdx+1]||'').toUpperCase().trim()]||null; continue; }
            if (sec && typeof row[2]==='number' && row[2]>0 && row[3]) {
              const cost=Number(row[10])||Number(row[11])||0;
              if (cost>0) m[sec].push({id:uid(), desc:String(row[3]).trim(), qty:Number(row[7])||1, uom:String(row[8]||'Lot').replace(/\/S$/i,'').trim(), cost});
            }
          }
          return m;
        };
        // ── BOL (Bill of Labor) parser ──
        const parseBOL = () => {
          const rows = getSheetByRole('manpower');
          const mp = []; let shift = 'regular_day'; let skipSection = false;
          // Fixed col positions from SHIC BOL template (0-indexed):
          // col2=item#, col3=role, col4=pax, col6=days, col7=rate/day, col9=OT hrs/day
          let nI=2, rI=3, pI=4, dI=6, wtI=7, otI=9;
          const shiftKey = (txt) => {
            const t = String(txt||'').toUpperCase();
            const night = t.includes('NIGHT');
            if (t.includes('LEGAL HOLIDAY')) return night ? 'holiday_night' : 'holiday_day';
            if (t.includes('SUNDAY') || t.includes('NON-WORKING')) return night ? 'sunday_night' : 'sunday_day';
            if (t.includes('DAY SHIFT') || t.includes('NIGHT SHIFT')) return night ? 'regular_night' : 'regular_day';
            if (t.includes('REGULAR DAY')) return 'regular_day';
            if (t.includes('REGULAR NIGHT')) return 'regular_night';
            return null;
          };
          for (const row of rows) {
            if (!row) continue;
            // Auto-detect column positions from header row
            if (nI === 2 && row.some(v => String(v||'').toUpperCase().includes('MANPOWER LOADING'))) {
              row.forEach((v,i) => {
                const t = String(v||'').toUpperCase().trim();
                if (t === 'ITEM' || t.startsWith('ITEM NO')) nI = i;
                else if (t === 'MANPOWER LOADING') rI = i;
                else if (t === 'QTY') pI = i;
                else if (t === 'NO. OF DAYS' || t === 'NO OF DAYS') dI = i;
                else if (t === 'RATE PER DAY') wtI = i;
                else if (t.startsWith('OT HRS')) otI = i;
              });
              continue;
            }
            // Section header: look for C.x label anywhere in row (handles merged cells)
            const cxCell = row.find(v => /^C\.\d+$/i.test(String(v||'').trim()));
            if (cxCell !== undefined) {
              const label = row.map(v=>String(v||'')).join(' ');
              if (label.toUpperCase().includes('BENEFITS')) { skipSection = true; continue; }
              const k = shiftKey(label);
              if (k) { shift = k; skipSection = false; }
              continue;
            }
            if (skipSection) continue;
            // Data row
            const itemNo = Number(row[nI]);
            const pax = Number(row[pI]);
            if (!isFinite(itemNo) || itemNo <= 0 || !isFinite(pax) || pax <= 0) continue;
            const role = String(row[rI]||'').trim(); if (!role) continue;
            const daysCnt = Number(row[dI]) || 1;
            const rate = Number(row[wtI]) || 0;
            const otPerDay = Number(row[otI]) || 0;
            /* The sheet's OT HRS column is per day, and so is otHours now -- it used to
               be multiplied out to a total here. */
            mp.push({id:uid(), role, pax, days:daysCnt, otHours:otPerDay, shift, rate, perDiem:0});
          }
          console.log('[CE Import] BOL →', mp.length, 'manpower rows');
          return mp;
        };
        const tools=parseResByRole('tools'), mats=parseResByRole('mats'), ppe=parseResByRole('ppe'), misc=parseMiscByRole(), mpRows=parseBOL();
        const dateStr = dateVal ? dateVal.toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
        const fallbackCeNum = file.name.replace(/\.xlsx?$/i,'').slice(0,30);
        // Derive CE type from project type field (Electrical=onsite, Mechanical=shopworks default)
        const importedCeType = projType==='Electrical' ? 'onsite' : 'shopworks';
        // Compute provisional grand total from parsed rows
        const mpGrand = mpRows.reduce((s,r)=>s+N(r.pax)*N(r.days)*N(r.rate)*(SHIFTS[r.shift]?.mult||1),0);
        const provisionalGrand = mpGrand + tools.reduce((s,r)=>s+N(r.qty)*resDays(r)*N(r.cost),0) + [...mats,...ppe].reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
        console.log('[CE Import] Parsed:', {ceNum, description, client, ceType:importedCeType, mp:mpRows.length, tools:tools.length, mats:mats.length, ppe:ppe.length, grand:provisionalGrand});
        const entry = {
          ceType:importedCeType,
          info:{ceNum:ceNum||fallbackCeNum, date:dateStr, client, location, attention:attention||'SALES DEPARTMENT', endUser:endUser||'C/O SALES', projType, description, dept:'', status:'Submitted', material, qty, days, companyId:null},
          mp:mpRows, tools, mats, ppe, misc,
          notes:[], sowItems:[], approvers:[], mobVehicles:[], demobVehicles:[],
          grand:Math.round(provisionalGrand), unitP:0, savedBy:currentUser?.username||'import',
          savedAt:new Date(dateStr).toISOString(), _imported:true
        };
        const effCeNum = ceNum || fallbackCeNum;
        const dupIdx = history.findIndex(h => (h.info?.ceNum || h.ceNum) === effCeNum);
        if (dupIdx >= 0) {
          const confirmed = window.confirm(`CE ${effCeNum} already exists in history. Overwrite it?`);
          if (!confirmed) { errors.push(file.name + ': skipped (duplicate)'); setCeImportProgress({done, total:list.length, errors}); continue; }
        }
        await dbSaveHistory(entry);
        done++;
        showToast(`Imported ${effCeNum} — ${mpRows.length} manpower, ${tools.length} tools, ${mats.length} materials, ${ppe.length} PPE.`);
      } catch(ex) { console.error('[CE Import] Error:', ex); errors.push(file.name + ': ' + ex.message); }
      setCeImportProgress({done, total:list.length, errors});
    }
    await loadHist();
    if (errors.length) showToast(`Imported ${done}/${list.length} CE files. ${errors.length} failed: ${errors[0]}`, true);
    else if (list.length > 1) showToast(`Imported ${done} CE files successfully.`);
    setTimeout(()=>setCeImportProgress(null), 3000);
  };

  /* ── Import monitoring from Excel (CE Tracking spreadsheet) ── */
  const [importProgress, setImportProgress] = React.useState(null); // null | {done,total}
  const importMonitoringXLSX = async (file) => {
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, {type:'array', cellDates:true});
      let ws = null;
      for (const name of wb.SheetNames) {
        const s = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(s);
        if (csv.includes('CE No.')) { ws = s; break; }
      }
      if (!ws) ws = wb.Sheets[wb.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false, dateNF:'yyyy-mm-dd'});
      let headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => c && String(c).trim() === 'CE No.'));
      if (headerIdx < 0) headerIdx = 2;
      const headers = rows[headerIdx].map(h => h ? String(h).trim() : '');
      const col = n => headers.findIndex(h => h.toLowerCase().replace(/\s+/g,'').includes(n.toLowerCase().replace(/\s+/g,'')));

      // Column indices — robust to files with or without CE Date
      const iCeNum=col('CENo'), iCeName=col('CEName'), iComp=col('CompanyDesignation'),
            iDisc=headers.findIndex(h => { const c=h.toLowerCase().replace(/\s+/g,''); return c==='designation'||c==='discipline'; }), iClient=col('Customer'),
            iTitle=col('JobTitle'), iRecvDate=col('DateRecieved'), iDeadline=col('Deadline'),
            iSubmDate=col('DateSubmitted');
      // Status column header is blank in Google Sheets export — fallback to position after Date Submitted
      const iStatus = col('Column12') >= 0 ? col('Column12') : col('Status') >= 0 ? col('Status') : (iSubmDate >= 0 ? iSubmDate + 1 : -1);
      // Received By and Remarks may also shift if status header was blank
      const iRecvBy   = col('RecievedBy') > iStatus ? col('RecievedBy') : (iStatus >= 0 ? iStatus + 1 : -1);
      const iRemarks  = col('Remarks')    > iStatus ? col('Remarks')    : (iStatus >= 0 ? iStatus + 2 : -1);
      const iStanding = col('Standing');
      // CE Date optional — fall back to Date Received
      const iDate = col('CEDate') >= 0 ? col('CEDate') : iRecvDate;

      const statusMap = {
        'done':'Submitted', 'submitted':'Submitted',
        'ongoing':'Ongoing',
        'pending':'Pending',
        'for site insp':'For site insp.',
        'for approval':'For Approval',
        'waiting':'Waiting in...', 'waiting in':'Waiting in...',
        'on hold':'On Hold', 'onhold':'On Hold',
        'cancelled':'Cancelled',
        'sourcing':'Sourcing',
        'no quote':'No Quote',
        'no access':'No Access',
        'approved':'Approved',
      };

      const dataRows = rows.slice(headerIdx + 1).filter(r =>
        r && r[iCeNum] && String(r[iCeNum]).trim().match(/CE-\d{4}-\d+/i));
      if (!dataRows.length) { showToast('No CE rows found in the file.', true); return; }

      const existing = await dbGetHistory(null, true).catch(() => []);
      // Map ceNum → history entry for existing CEs
      const existingMap = {};
      existing.forEach(h => {
        const k = (h.info?.ceNum||h.ceNum||'').toUpperCase().trim();
        if (k) existingMap[k] = h;
      });

      const parseDate = v => {
        if (!v) return '';
        try {
          const d = new Date(v);
          if (isNaN(d.getTime())) return '';
          const y = d.getFullYear();
          if (y < 2000 || y > 2100) return '';
          return d.toISOString().slice(0,10);
        } catch { return ''; }
      };

      const toInsert = [];   // new CEs to create
      const monByCeNum = {}; // monitoring data keyed by ceNum (both new + existing)
      let updated = 0;

      for (const r of dataRows) {
        const ceNum = String(r[iCeNum]||'').trim().toUpperCase();
        if (!ceNum) continue;

        const rawStatus = String(r[iStatus]||'').trim();
        const rawLower = rawStatus.toLowerCase();
        // Try map first; if no match use the raw value as-is so nothing is lost
        const appStatus = Object.entries(statusMap).find(([k]) => rawLower.startsWith(k))?.[1] || rawStatus || 'Pending';
        const estimatorName = String(r[iCeName]||'').trim();

        monByCeNum[ceNum] = {
          status: appStatus,
          standing: String(r[iStanding]||'').trim(),
          deadline: parseDate(r[iDeadline]),
          dateSubmitted: parseDate(r[iSubmDate]),
          dateReceived: parseDate(r[iRecvDate]),
          receivedBy: String(r[iRecvBy]||'').trim(),
          remarks: String(r[iRemarks]||'').trim(),
          preparedBy: estimatorName,
          ceeName: estimatorName,
          designation: String(r[iDisc]||'').trim(),
        };

        if (existingMap[ceNum]) {
          updated++;
        } else {
          toInsert.push({
            ceType: 'onsite',
            info: {
              ceNum,
              client: String(r[iClient]||'').trim(),
              description: String(r[iTitle]||'').trim(),
              company: String(r[iComp]||'').trim(),
              discipline: String(r[iDisc]||'').trim(),
            },
            mp:[], tools:[], mats:[], ppe:[], misc:{}, notes:[], sowItems:[],
            approvers:[], mobVehicles:[], demobVehicles:[],
            grand:0, unitP:0,
            savedBy: estimatorName,
            savedAt: parseDate(r[iDate]) ? new Date(parseDate(r[iDate])).toISOString() : new Date().toISOString(),
            _imported: true,
          });
        }
      }

      const total = toInsert.length + updated;
      if (!total) { showToast('No valid CE rows found in the file.', true); return; }

      // Preview confirmation before applying
      const preview = [
        `Found ${total} CE row(s) in the file:`,
        `  • ${toInsert.length} new CE(s) to create`,
        `  • ${updated} existing CE(s) to update`,
        '',
        toInsert.length > 0
          ? 'New: ' + toInsert.slice(0,5).map(e => e.info.ceNum).join(', ') + (toInsert.length > 5 ? ` +${toInsert.length-5} more` : '')
          : '',
        '',
        'Proceed with import?'
      ].filter(Boolean).join('\n');
      if (!confirm(preview)) return;

      // Batch insert new CEs — 5 at a time to avoid SP throttling
      const BATCH = 5;
      setImportProgress({done:0, total});
      let imported = 0;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        await Promise.all(chunk.map(e => spWithRetry(() => dbSaveHistory(e)).catch(()=>{})));
        imported += chunk.length;
        setImportProgress({done: imported, total});
        if (i + BATCH < toInsert.length) await new Promise(res => setTimeout(res, 300));
      }

      // Reload history to get real IDs, apply monitoring data to all matched CEs
      const fresh = await dbGetHistory(null, true).catch(() => []);
      const merged = {...monData};
      for (const h of fresh) {
        const key = (h.info?.ceNum || h.ceNum || '').toUpperCase().trim();
        if (monByCeNum[key]) merged[h.id] = monByCeNum[key];
      }
      setMonData(merged);
      try { localStorage.setItem(MON_KEY, JSON.stringify(merged)); } catch {}
      await dbSaveMonAll(merged, fresh).catch(()=>{});
      setHistory(fresh);
      setImportProgress(null);
      auditLog('xlsx_import', `${imported} CEs added, ${updated} updated`, currentUser?.username);
      showToast(`Import complete: ${imported} CEs added, ${updated} monitoring records updated.`);
    } catch(e) {
      setImportProgress(null);
      showToast('Import failed: ' + e.message, true);
      console.error('importMonitoringXLSX', e);
    }
  };

  const HistPanel = () => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: INFO + '44',
      marginBottom: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      position: 'sticky',
      top: 88,
      zIndex: 40
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
      fontWeight: 700,
      fontSize: 13
    }
  }, "CE Monitoring"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, sortedHistory.length, " estimates", isAdmin ? ' (all users)' : ''), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      width: 200,
      fontSize: 11,
      marginLeft: 8
    },
    placeholder: "Search CE#, client, customer...",
    autoFocus: true,
    value: monSearch,
    onChange: e => { setMonSearch(e.target.value); setMonPage(0); }
  }), /*#__PURE__*/React.createElement("div", {
    style: {position: 'relative', display: 'inline-block'}
  }, /*#__PURE__*/React.createElement("button", {
    style: {...btn(monStatusFilter.size > 0 ? 'acc' : 'def', true), minWidth: 90},
    onClick: () => { setShowStatusFilter(p => !p); setShowStatusMgr(false); }
  }, "▼ Status", monStatusFilter.size > 0 ? ` (${monStatusFilter.size})` : ''),
  showStatusFilter && /*#__PURE__*/React.createElement("div", {
    style: {position:'absolute', top:'110%', left:0, zIndex:200, background:SURF, border:`1px solid ${BDR}`, borderRadius:8, padding:8, minWidth:160, boxShadow:'0 4px 16px #0006'}
  }, /*#__PURE__*/React.createElement("div", {style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}},
    /*#__PURE__*/React.createElement("span", {style:{fontSize:11, fontWeight:700, color:MT}}, "Filter by Status"),
    monStatusFilter.size > 0 && /*#__PURE__*/React.createElement("button", {
      style:{...btn('danger',true), fontSize:10, padding:'1px 6px'},
      onClick: () => { setMonStatusFilter(new Set()); setMonPage(0); }
    }, "Clear")
  ),
  allStatuses.map(s =>
    /*#__PURE__*/React.createElement("label", {
      key: s,
      style: {display:'flex', alignItems:'center', gap:8, padding:'4px 2px', cursor:'pointer', fontSize:12}
    },
    /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: monStatusFilter.has(s),
      onChange: () => {
        setMonStatusFilter(prev => {
          const next = new Set(prev);
          next.has(s) ? next.delete(s) : next.add(s);
          return next;
        });
        setMonPage(0);
      }
    }),
    /*#__PURE__*/React.createElement("span", {
      style: {
        display:'inline-block', width:8, height:8, borderRadius:'50%',
        background: STATUS_COLOR_MAP[s] || ACC, flexShrink:0
      }
    }),
    s)
  ))),
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize:11, width:120},
    value: monTypeFilter,
    onChange: e => { setMonTypeFilter(e.target.value); setMonPage(0); },
    title: "Filter by CE type"
  },
    /*#__PURE__*/React.createElement("option", {value:'all'}, "All Types"),
    /*#__PURE__*/React.createElement("option", {value:'onsite'}, "Onsite"),
    /*#__PURE__*/React.createElement("option", {value:'shopworks'}, "Shopworks"),
    /*#__PURE__*/React.createElement("option", {value:'supply'}, "Supply")
  ),
  (monSearch || monStatusFilter.size > 0 || monTypeFilter !== 'all') && /*#__PURE__*/React.createElement("button", {
    style: {...btn('danger', true), fontSize:10},
    title: "Clear all filters",
    onClick: () => { setMonSearch(''); setMonStatusFilter(new Set()); setMonTypeFilter('all'); setMonPage(0); }
  }, "\u2715 Clear Filters"),
  /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setShowStatusMgr(p => !p),
    title: "Manage status options"
  }, "\u2699 Status"), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => {
      loadHist();
      loadMonData();
      /* Move the CE archive out of localStorage. Deliberately AFTER loadHist so
         reconciliation can reuse a warm SharePoint result, and fire-and-forget
         so it can never delay the UI. It defers itself when offline. */
      dbMigrateToIDB(currentUser.username, isAdmin).then(r => {
        if (r && r.moved) showToast('Moved ' + r.moved + ' CE(s) to offline storage, freeing ' + Math.round((r.freedBytes||0)/1024) + ' KB.');
      }).catch(ex => console.warn('CE archive migration skipped:', ex.message));
    }
  }, "\u21BB Refresh"), /*#__PURE__*/React.createElement("button", {
    title: "Download a blank Excel template with the correct column headers for bulk import",
    style: btn('def', true),
    onClick: () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['CE No.','CE Name','Company Designation','Discipline','Customer','Job Title','Date Recieved','Deadline','Date Submitted','Status','Recieved By','Remarks'],
        ['CE-2826-0001','Juan Dela Cruz','SHIC','Mechanical','Sample Client Inc.','PUMP OVERHAUL AND REPAIR','2026-01-15','2026-01-22','2026-01-21','Submitted','Kenneth Mendoza',''],
      ]);
      ws['!cols'] = [120,120,120,100,140,200,110,110,110,90,120,140].map(w=>({wch:Math.round(w/7)}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CE Monitoring');
      XLSX.writeFile(wb, 'SHIC_CE_Import_Template.xlsx');
    }
  }, "\u2193 Template"), /*#__PURE__*/React.createElement("label", {
    title: "Import CE Tracking spreadsheet (.xlsx)",
    style: {...btn('def', true), cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4}
  }, importProgress ? `Importing\u2026 ${importProgress.done}/${importProgress.total}` : "\u2B06 Import xlsx", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".xlsx",
    style: {display:'none'},
    disabled: !!importProgress,
    onChange: e => { if(e.target.files[0]) { importMonitoringXLSX(e.target.files[0]); e.target.value=''; } }
  })), /*#__PURE__*/React.createElement("label", {
    title: "Import one or multiple SHIC CE Excel files (reads BOTE, BOCM, PPE, MISC sheets)",
    style: {...btn('info', true), cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4}
  }, ceImportProgress ? `\u21BB Importing ${ceImportProgress.done}/${ceImportProgress.total}\u2026` : "\u2B06 Import CE File(s)", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".xlsx,.xls",
    multiple: true,
    style: {display:'none'},
    disabled: !!ceImportProgress,
    onChange: e => { if(e.target.files.length) { importShicCeFiles(e.target.files); e.target.value=''; } }
  })), importProgress && /*#__PURE__*/React.createElement("div", {
    style: {display:'flex', alignItems:'center', gap:6, fontSize:10, color:ACC}
  }, /*#__PURE__*/React.createElement("div", {
    style: {width:80, height:4, background:BDR, borderRadius:4, overflow:'hidden'}
  }, /*#__PURE__*/React.createElement("div", {
    style: {width:`${Math.round(importProgress.done/importProgress.total*100)}%`,
            height:'100%', background:ACC, borderRadius:4, transition:'width .2s'}
  })), `${Math.round(importProgress.done/importProgress.total*100)}%`), /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: handleSave
  }, "+ Save Current CE"))), showStatusMgr && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      padding: 10,
      background: SURF,
      borderRadius: 7,
      border: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 11,
      marginBottom: 8,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    }
  }, "Status Options"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 5,
      marginBottom: 8
    }
  }, allStatuses.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: getStatusColor(s) + '22',
      color: getStatusColor(s),
      border: `1px solid ${getStatusColor(s)}44`,
      borderRadius: 12,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 700
    }
  }, s, !DEFAULT_STATUS_OPTIONS.includes(s) && /*#__PURE__*/React.createElement("button", {
    onClick: () => removeStatus(s),
    style: {
      background: 'none',
      border: 'none',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 11,
      padding: '0 2px',
      lineHeight: 1
    }
  }, "\xD7")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      flex: 1,
      fontSize: 11
    },
    value: newStatusInput,
    onChange: e => setNewStatusInput(e.target.value),
    placeholder: "Add custom status...",
    onKeyDown: e => {
      if (e.key === 'Enter') {
        addStatus(newStatusInput);
        setNewStatusInput('');
      }
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: btn('acc', true),
    onClick: () => {
      addStatus(newStatusInput);
      setNewStatusInput('');
    }
  }, "+ Add")))), histBusy && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      textAlign: 'center',
      padding: 28,
      color: MT,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0
    }
  }, "Loading..."), !histBusy && sortedHistory.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      textAlign: 'center',
      padding: 36,
      color: MT,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0
    }
  }, "No saved estimates yet. Save a CE to start monitoring."), !histBusy && sortedHistory.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null,
  /*#__PURE__*/React.createElement("div", {
    ref: monTopScrollRef,
    style: {overflowX: 'auto', overflowY: 'hidden', height: 13, background: SURF, border: `1px solid ${BDR}`, borderTop: 'none', borderBottom: 'none'},
    onScroll: e => { if(monTableWrapRef.current && monTableWrapRef.current.scrollLeft !== e.target.scrollLeft) monTableWrapRef.current.scrollLeft = e.target.scrollLeft; }
  }, /*#__PURE__*/React.createElement("div", {style: {minWidth: 1470, height: 1}})),
  /*#__PURE__*/React.createElement("div", {
    ref: monTableWrapRef,
    onScroll: e => { if(monTopScrollRef.current && monTopScrollRef.current.scrollLeft !== e.target.scrollLeft) monTopScrollRef.current.scrollLeft = e.target.scrollLeft; },
    style: {
      overflowX: 'auto',
      overflowY: 'auto',
      maxHeight: 'calc(100vh - 200px)',
      background: CARD,
      borderRadius: 8,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      border: `1px solid ${BDR}`,
      borderTop: 'none'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 11,
      minWidth: 1470
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: SURF,
      position: 'sticky',
      top: 0,
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement("th", {style:{...THS,width:28,padding:'6px 4px',fontSize:10,textAlign:'center'}, title:"Select to compare (max 2)"}, "⚖"), [['ceeName', 'Estimator', 80], ['companyDesig', 'Co.', 60], ['ceNum', 'CE No.', 120], ['designation', 'Discipline', 90], ['customer', 'Customer', 100], ['jobTitle', 'Job Title', 180], ['grand', 'Total (₱)', 110], ['dateRecv', 'Date Recv.', 95], ['deadline', 'Deadline', 95], ['deadlineDays', 'Days Left', 65], ['dateSubmitted', 'Date Submitted', 105], ['status', 'Status', 120], ['receivedBy', 'Received By', 100], ['remarks', 'Remarks', 140]].map(([col, label, w]) => /*#__PURE__*/React.createElement("th", {
    key: col,
    onClick: () => ['ceNum', 'deadline', 'status', 'grand'].includes(col) && toggleSort(col),
    style: {
      ...THS,
      width: w,
      minWidth: w,
      padding: '6px 8px',
      fontSize: 10,
      whiteSpace: 'nowrap',
      cursor: ['ceNum', 'deadline', 'status', 'grand'].includes(col) ? 'pointer' : 'default',
      userSelect: 'none'
    }
  }, label, ['ceNum', 'deadline', 'status', 'grand'].includes(col) && /*#__PURE__*/React.createElement(SortIcon, {
    col: col
  }))), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      width: 80,
      minWidth: 80,
      padding: '6px 8px',
      fontSize: 10,
      /* Matches the pinned body cells below, so the header stays aligned with
         its column while the table scrolls sideways. */
      position: 'sticky',
      right: 0,
      zIndex: 3,
      background: SURF,
      borderLeft: `1px solid ${BDR}`
    }
  }, "Actions"))),/*#__PURE__*/React.createElement("tbody", null, sortedHistory.slice(monPage * MON_PAGE_SIZE, (monPage + 1) * MON_PAGE_SIZE).map((e, rowIdx) => {
    /* The 16 columns total ~1570px, so on any normal screen Actions sits past
       the right edge and the row has to be scrolled sideways to reach it —
       which is why people reported the buttons as missing rather than
       off-screen. Pinning the column keeps Edit/Attach/Del reachable at any
       scroll position. Needs an opaque background: the row's own is
       semi-transparent on alternate rows, and cells would scroll visibly
       underneath it. */
    const stickyBg = rowIdx % 2 === 0 ? CARD : SURF;
    const m = monData[e.id] || {};
    const ceNum = e.info?.ceNum || e.ceNum || '';
    const jobTitle = e.info?.description || '';
    const dateRecv = e.savedAt ? new Date(e.savedAt).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) : '';
    /* Deadline countdown */
    const deadlineDate = m.deadline ? new Date(m.deadline) : null;
    const deadlineDays = deadlineDate ? Math.round((deadlineDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
    const daysColor = deadlineDays === null ? MT : deadlineDays < 0 ? ERR : deadlineDays <= 7 ? '#F59E0B' : OK;
    const statusColor = getStatusColor(m.status || '');
    const trBg = rowIdx % 2 === 0 ? 'transparent' : SURF + '88';
    return /*#__PURE__*/React.createElement("tr", {
      key: e.id,
      style: {
        background: trBg,
        borderBottom: `1px solid ${BDR}22`
      }
    }, /*#__PURE__*/React.createElement("td", {style:{...TDS,padding:'4px',textAlign:'center'}},
      /*#__PURE__*/React.createElement("input", {
        type:"checkbox",
        title: compareSet.has(e.id) ? "Remove from comparison" : compareSet.size >= 2 ? "Deselect another first" : "Add to comparison",
        checked: compareSet.has(e.id),
        disabled: !compareSet.has(e.id) && compareSet.size >= 2,
        onChange: () => setCompareSet(prev => {
          const next = new Set(prev);
          next.has(e.id) ? next.delete(e.id) : next.add(e.id);
          return next;
        })
      })
    ), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%',
        fontWeight: 700,
        color: CE_CFG[e.ceType]?.color || ACC
      },
      key: e.id + 'ceeName',
      defaultValue: m.ceeName || m.preparedBy || e.savedBy || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.ceeName || m.preparedBy || e.savedBy || '')) updateMon(e.id, 'ceeName', ev.target.value);
      },
      placeholder: "Estimator"
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,fontWeight:700,color:CE_CFG[e.ceType]?.color||ACC}}, m.ceeName||m.preparedBy||e.savedBy||'—'), /*#__PURE__*/React.createElement("span", {
      title: monSpIds.has(String(e.id)) ? 'Synced with SharePoint' : 'Local only — no SP record yet',
      style: {fontSize:9, marginLeft:3, color: monSpIds.has(String(e.id)) ? OK : BDR, cursor:'default'}
    }, monSpIds.has(String(e.id)) ? '☁' : '○')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("select", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'companyDesig',
      defaultValue: m.companyDesig || 'SHIC',
      onChange: ev => { updateMon(e.id, 'companyDesig', ev.target.value); }
    }, ['SHIC', 'SY3', 'ACE', 'MCR', 'EMN', 'SDB', 'RML', 'MFS', 'JAVV', 'Other'].map(o => /*#__PURE__*/React.createElement("option", {
      key: o
    }, o))) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, m.companyDesig||'SHIC')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        ...MONO,
        fontSize: 10,
        whiteSpace: 'nowrap'
      }
    }, ceNum), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'designation',
      defaultValue: m.designation || m.discipline || e.info?.discipline || e.info?.projType || '',
      onBlur: ev => {
        const cur = m.designation || m.discipline || e.info?.discipline || e.info?.projType || '';
        if (ev.target.value !== String(cur)) updateMon(e.id, 'designation', ev.target.value);
      }
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, m.designation || m.discipline || e.info?.discipline || e.info?.projType || '')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'customer',
      defaultValue: m.customer || e.info?.client || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.customer || e.info?.client || '')) updateMon(e.id, 'customer', ev.target.value);
      },
      placeholder: e.info?.client
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, m.customer||e.info?.client||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        maxWidth: 200
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'jobTitle',
      defaultValue: m.jobTitle || jobTitle,
      onBlur: ev => {
        if (ev.target.value !== String(m.jobTitle || jobTitle)) updateMon(e.id, 'jobTitle', ev.target.value);
      },
      placeholder: jobTitle
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,whiteSpace:'normal',wordBreak:'break-word',display:'block',maxWidth:180}}, m.jobTitle||jobTitle||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        whiteSpace: 'nowrap',
        textAlign: 'right',
        fontWeight: 600,
        fontSize: 11,
        color: e.grand ? OK : MT
      }
    }, e.grand ? '₱' + Number(e.grand).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        whiteSpace: 'nowrap',
        color: MT,
        fontSize: 10
      }
    }, m.dateRecv || dateRecv), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      type: "date",
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 10,
        width: '100%',
        ...MONO
      },
      key: e.id + 'deadline',
      defaultValue: m.deadline || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.deadline || '')) updateMon(e.id, 'deadline', ev.target.value);
      }
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:10,...MONO,color:daysColor}}, m.deadline ? new Date(m.deadline+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : '—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        textAlign: 'center',
        ...MONO,
        fontWeight: 700,
        color: daysColor
      }
    }, deadlineDays === null ? '\u2014' : deadlineDays < 0 ? `${Math.abs(deadlineDays)}d OD` : `${deadlineDays}d`), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      type: "date",
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 10,
        width: '100%',
        ...MONO
      },
      key: e.id + 'dateSubmitted',
      defaultValue: m.dateSubmitted || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.dateSubmitted || '')) updateMon(e.id, 'dateSubmitted', ev.target.value);
      }
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:10,...MONO}}, m.dateSubmitted ? new Date(m.dateSubmitted+'T00:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : '—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("select", {
      style: {
        ...INP,
        border: 'none',
        background: statusColor + '22',
        color: statusColor,
        fontWeight: 700,
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 12,
        width: '100%'
      },
      key: e.id + 'status',
      defaultValue: m.status || '',
      onChange: ev => { updateMon(e.id, 'status', ev.target.value); }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "\u2014"), allStatuses.map(s => /*#__PURE__*/React.createElement("option", {
      key: s,
      value: s
    }, s))) : /*#__PURE__*/React.createElement("div", null,
      /*#__PURE__*/React.createElement("span", {style:{display:'inline-block',background:statusColor+'22',color:statusColor,fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:12,whiteSpace:'nowrap'}}, m.status||'\u2014'),
      m.statusChangedAt && /*#__PURE__*/React.createElement("div", {style:{fontSize:9,color:MT,marginTop:2,lineHeight:1.3},title:'Changed by '+(m.statusChangedBy||'unknown')}, new Date(m.statusChangedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}), m.statusChangedBy?' \u00b7 '+m.statusChangedBy.split(' ')[0]:'')
    )), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px'
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'receivedBy',
      defaultValue: m.receivedBy || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.receivedBy || '')) updateMon(e.id, 'receivedBy', ev.target.value);
      },
      placeholder: "Name..."
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, m.receivedBy||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        maxWidth: 160
      }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        border: 'none',
        background: 'transparent',
        padding: '2px 4px',
        fontSize: 11,
        width: '100%'
      },
      key: e.id + 'remarks',
      defaultValue: m.remarks || '',
      onBlur: ev => {
        if (ev.target.value !== String(m.remarks || '')) updateMon(e.id, 'remarks', ev.target.value);
      },
      placeholder: "Notes..."
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT}}, m.remarks||'—')), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        position: 'sticky',
        right: 0,
        zIndex: 2,
        background: stickyBg,
        borderLeft: `1px solid ${BDR}`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {...btn(editingRow === e.id ? 'ok' : 'def', true), fontSize: 10, padding: '2px 8px'},
      onClick: () => setEditingRow(editingRow === e.id ? null : e.id)
    }, editingRow === e.id ? '✓ Done' : '✎ Edit'), /*#__PURE__*/React.createElement("button", {
      style: {...btn(attachPanel === e.id ? 'acc' : 'def', true), fontSize: 10, padding: '2px 8px'},
      title: "Attachments (Drawings, TOR, etc.)",
      onClick: () => { if (attachPanel === e.id) { setAttachPanel(null); } else { openAttachPanel(e.id); } }
    }, '📎', monSpIds.has(String(e.id)) && attachList.length > 0 && attachPanel === e.id ? ` ${attachList.length}` : ''), (e.data || e.info) && /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('acc', true),
        fontSize: 10,
        padding: '2px 8px'
      },
      onClick: () => handleLoad(e.data || e)
    }, "Load"), (isAdmin || e.savedBy === currentUser.username) && /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('danger', true),
        fontSize: 10,
        padding: '2px 8px'
      },
      onClick: async () => {
        if (confirmDel !== e.id) {
          setConfirmDel(e.id);
          return;
        }
        setConfirmDel(null);
        const ceNum = e.info?.ceNum || e.ceNum || String(e.id);
        const snapshot = [...history];
        setHistory(prev => prev.filter(h => h.id !== e.id));
        let undone = false;
        const tid = setTimeout(async () => {
          if (!undone) {
            await dbDeleteHistory(e.id);
            auditLog('delete_ce', ceNum, currentUser?.username);
            _checkAutoBackup();
          }
          setUndoToast(null);
        }, 10000);
        setUndoToast({
          msg: `CE ${ceNum} deleted.`,
          onUndo: () => {
            undone = true;
            clearTimeout(tid);
            setHistory(snapshot);
            setUndoToast(null);
            showToast('Delete undone.');
          }
        });
      }
    }, confirmDel === e.id ? 'Sure?' : 'Del'), (e.data||e.info)&&/*#__PURE__*/React.createElement("button",{style:{...btn('ok',true),fontSize:10,padding:'2px 8px'},onClick:()=>handleClone(e.data||e),title:"Clone with new CE number"},"Clone"), (e.data||e.info)&&/*#__PURE__*/React.createElement("button",{style:{...btn('info',true),fontSize:10,padding:'2px 8px'},onClick:()=>handleRevise(e.data||e),title:"Revision copy (-R1, -R2...)"},"Revise"),
    /* Feature 3: Compare button for revisions */
    (()=>{const cn=(e.info?.ceNum||e.ceNum||'');const isRev=/-R\d+$/i.test(cn);if(!isRev)return null;return/*#__PURE__*/React.createElement("button",{style:{...btn('def',true),fontSize:10,padding:'2px 8px'},title:"Compare with base CE",onClick:()=>{const base=cn.replace(/-R\d+$/i,'').toUpperCase();const baseEntry=history.find(h=>(h.info?.ceNum||h.ceNum||'').toUpperCase()===base);setDiffModal({base:baseEntry||null,rev:e.data||e});}},"⚖ Diff");})()
    )));
  }))))),
  /* Pagination bar */
  (() => {
    const totalPages = Math.ceil(sortedHistory.length / MON_PAGE_SIZE);
    if (totalPages <= 1) return null;
    const start = monPage * MON_PAGE_SIZE + 1;
    const end = Math.min((monPage + 1) * MON_PAGE_SIZE, sortedHistory.length);
    return /*#__PURE__*/React.createElement('div', {
      style: {display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
              background:CARD, borderTop:`1px solid ${BDR}`, borderRadius:'0 0 8px 8px',
              fontSize:11, color:MT}
    },
      /*#__PURE__*/React.createElement('span', null, `Showing ${start}–${end} of ${sortedHistory.length}`),
      /*#__PURE__*/React.createElement('div', {style:{marginLeft:'auto', display:'flex', gap:4}},
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage === 0,
          onClick: () => setMonPage(0)
        }, '«'),
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage === 0,
          onClick: () => setMonPage(p => p - 1)
        }, '‹'),
        ...[...Array(totalPages)].map((_,i) => {
          if (totalPages > 7 && Math.abs(i - monPage) > 2 && i !== 0 && i !== totalPages-1) {
            if (i === 1 && monPage > 3) return /*#__PURE__*/React.createElement('span',{key:i,style:{color:MT,padding:'0 2px'}},'…');
            if (i === totalPages-2 && monPage < totalPages-4) return /*#__PURE__*/React.createElement('span',{key:i,style:{color:MT,padding:'0 2px'}},'…');
            if (Math.abs(i - monPage) > 2) return null;
          }
          return /*#__PURE__*/React.createElement('button', {
            key: i,
            style:{...btn(i===monPage?'acc':'def',true), padding:'2px 8px', fontSize:11, minWidth:28},
            onClick: () => setMonPage(i)
          }, i+1);
        }),
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage >= totalPages-1,
          onClick: () => setMonPage(p => p + 1)
        }, '›'),
        /*#__PURE__*/React.createElement('button', {
          style:{...btn('def',true), padding:'2px 10px', fontSize:11},
          disabled: monPage >= totalPages-1,
          onClick: () => setMonPage(totalPages - 1)
        }, '»')
      )
    );
  })(),
  /* ── Compare bar (floats when 2 CEs selected) ── */
  compareSet.size === 2 && /*#__PURE__*/React.createElement("div", {
    style:{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:500,background:ACC,color:'#000',borderRadius:12,padding:'10px 20px',display:'flex',gap:12,alignItems:'center',boxShadow:'0 4px 20px #0008',fontWeight:700,fontSize:13}
  }, "⚖ 2 CEs selected",
    /*#__PURE__*/React.createElement("button", {
      style:{background:'#000',color:ACC,border:'none',borderRadius:6,padding:'4px 14px',fontWeight:700,cursor:'pointer',fontSize:12},
      onClick: async () => {
        const [idA, idB] = [...compareSet];
        const loadFull = async id => {
          const e = history.find(h => h.id === id);
          if (!e) return null;
          const ceNum = e.info?.ceNum || e.ceNum || '';
          const cached = LS.get('ce_cache:' + ceNum);
          if (cached && cached.tools !== undefined) return cached;
          if (typeof id === 'number' && (USE_SP || getSiteURL())) {
            try { const full = await dbLoadCE(id); if (full) return full; } catch {}
          }
          return e;
        };
        const [a, b] = await Promise.all([loadFull(idA), loadFull(idB)]);
        setCompareModal({a, b});
      }
    }, "Compare →"),
    /*#__PURE__*/React.createElement("button", {
      style:{background:'transparent',color:'#000',border:'1px solid #0004',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12},
      onClick: () => setCompareSet(new Set())
    }, "✕")
  ),
  /* ── Compare Modal ── */
  compareModal && (() => {
    const {a, b} = compareModal;
    const ceA = a?.info?.ceNum || 'CE A';
    const ceB = b?.info?.ceNum || 'CE B';
    const calcSections = ce => {
      if (!ce) return {};
      const mpT = (ce.mp||[]).reduce((s,r)=>s+N(r.pax)*N(r.days)*N(r.rate)*(SHIFTS[r.shift]?.mult||1)+N(r.pax)*N(r.days)*N(r.otHours)*(N(r.rate)/8)*1.25+N(r.pax)*N(r.days)*N(r.perDiem),0);
      const toolT = (ce.tools||[]).reduce((s,r)=>s+N(r.qty)*resDays(r)*N(r.cost),0);
      const matT = (ce.mats||[]).reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
      const ppeT = (ce.ppe||[]).reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
      const miscT = Object.values(ce.misc||{}).flat().reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
      const grand = mpT+toolT+matT+ppeT+miscT;
      return {mpT,toolT,matT,ppeT,miscT,grand};
    };
    const sA = calcSections(a), sB = calcSections(b);
    const rows = [['Manpower','mpT'],['Tools & Equipment','toolT'],['Materials','matT'],['PPE','ppeT'],['Miscellaneous','miscT'],['Grand Total','grand']];
    const diffColor = (va,vb) => va===vb ? MT : va>vb ? OK : ERR;
    return /*#__PURE__*/React.createElement("div", {
      style:{position:'fixed',inset:0,zIndex:600,background:'#0009',display:'flex',alignItems:'center',justifyContent:'center'},
      onClick: e => { if(e.target===e.currentTarget) setCompareModal(null); }
    }, /*#__PURE__*/React.createElement("div", {
      style:{background:CARD,border:`1px solid ${BDR}`,borderRadius:12,padding:24,minWidth:560,maxWidth:'90vw',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 40px #0008'}
    },
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}},
        /*#__PURE__*/React.createElement("span", {style:{fontWeight:800,fontSize:15}}, "⚖ CE Comparison"),
        /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),fontSize:11}, onClick:()=>setCompareModal(null)}, "✕ Close")
      ),
      /*#__PURE__*/React.createElement("div", {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}},
        /*#__PURE__*/React.createElement("div", {style:{...CS,padding:'8px 12px'}},
          /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:ACC,fontSize:12}}, ceA),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, a?.info?.client||'—'),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, a?.info?.description||'—')
        ),
        /*#__PURE__*/React.createElement("div", {style:{...CS,padding:'8px 12px'}},
          /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:INFO,fontSize:12}}, ceB),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, b?.info?.client||'—'),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT}}, b?.info?.description||'—')
        )
      ),
      /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
        /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {style:{background:SURF}},
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'left'}}, "Section"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right',color:ACC}}, ceA),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right',color:INFO}}, ceB),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right'}}, "Δ Diff")
        )),
        /*#__PURE__*/React.createElement("tbody", null, rows.map(([label,key]) => {
          const va = sA[key]||0, vb = sB[key]||0, diff = vb-va;
          const isGrand = key==='grand';
          return /*#__PURE__*/React.createElement("tr", {key, style:{borderBottom:`1px solid ${BDR}22`,background:isGrand?SURF+'88':'transparent'}},
            /*#__PURE__*/React.createElement("td", {style:{...TDS,fontWeight:isGrand?700:400}}, label),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:isGrand?ACC:TX}}, '₱'+ph(va)),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:isGrand?INFO:TX}}, '₱'+ph(vb)),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:diffColor(va,vb)}}, diff===0?'—':(diff>0?'+':'')+'₱'+ph(diff))
          );
        }))
      ),
      /*#__PURE__*/React.createElement("div", {style:{marginTop:14,display:'flex',gap:8,justifyContent:'flex-end'}},
        /*#__PURE__*/React.createElement("button", {style:{...btn('acc',true),fontSize:11}, onClick:()=>{handleLoad(a);setCompareModal(null);}}, "Load "+ceA),
        /*#__PURE__*/React.createElement("button", {style:{...btn('info',true)||btn('def',true),fontSize:11,borderColor:INFO+'55',color:INFO}, onClick:()=>{handleLoad(b);setCompareModal(null);}}, "Load "+ceB)
      )
    ));
  })()
  );
  /* ---- Scope Library Editor (Scope Library tab) ---- */
  const ScopeLibraryEditor = () => {
    const [libSearch, setLibSearch] = useState('');
    const [libCat, setLibCat] = useState('All');
    const [editSvc, setEditSvc] = useState(null);
    const [editDraft, setEditDraft] = useState(null);
    const [resTab, setResTab] = useState('mp');
    const [showSpWiz, setShowSpWiz] = useState(false);
    const [spWizLog, setSpWizLog] = useState('');
    const [spWizBusy, setSpWizBusy] = useState(false);
    const spConnected = !!(USE_SP || getSiteURL());
    const spPublish = async () => {
      setSpWizBusy(true);
      setSpWizLog('Publishing scope library to SharePoint…');
      try {
        const ok = await dbSaveSowLib(sowLib);
        setSpWizLog(ok ? '✅ Published successfully! All users will see the updated library.' : '⚠️ Saved to local storage only (SP not connected).');
      } catch(e) { setSpWizLog('❌ Error: ' + e.message); }
      setSpWizBusy(false);
    };
    const spPull = async () => {
      setSpWizBusy(true);
      setSpWizLog('Loading scope library from SharePoint…');
      try {
        const lib = await dbGetSowLib();
        if (lib && lib.length) { setSowLib(lib); cacheSowLib(lib); setSpWizLog('✅ Loaded ' + lib.length + ' services from SharePoint.'); }
        else setSpWizLog('⚠️ No data found on SharePoint yet. Publish first.');
      } catch(e) { setSpWizLog('❌ Error: ' + e.message); }
      setSpWizBusy(false);
    };
    const spSetupList = async () => {
      setSpWizBusy(true);
      setSpWizLog('Creating SharePoint list…');
      try {
        const tok = await getSPToken({ interactive: true });
        if (!tok) throw new Error('Not authenticated. Log in first.');
        const {digest} = await spDigest();
        const wasCreated = await spCreateList(spList('SowLib'), tok, digest);
        if (wasCreated) {
          await spAddField(spList('SowLib'), 'shicData', 3, tok, digest);
          setSpWizLog('✅ List "' + spList('SowLib') + '" created. You can now Publish.');
        } else {
          setSpWizLog('✅ List already exists. You can Publish.');
        }
      } catch(e) { setSpWizLog('❌ ' + e.message); }
      setSpWizBusy(false);
    };
    const cats = ['All', ...[...new Set(sowLib.map(s => s.cat))].sort()];
    const filtered = sowLib.filter(s => {
      const matchCat = libCat === 'All' || s.cat === libCat;
      const q = libSearch.toLowerCase();
      return matchCat && (!q || s.title.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q));
    });

    /* Normalise a resource list: accept string[] or {code,cat,name,cost,uom}[] */
    const normalise = (arr, type) => {
      const a = Array.isArray(arr) ? arr : arr || [];
      return a.map(r => {
        if (typeof r === 'string') {
          const ml = (type === 'mp' ? masterlist.manpower : type === 'tools' ? masterlist.tools : type === 'mats' ? masterlist.materials : masterlist.ppe) || [];
          const match = ml.find(m => (m.role || m.desc || '').toUpperCase() === r.toUpperCase());
          return {
            id: uid(),
            code: match ? match.code || '' : '',
            cat: match ? match.category || 'General' : 'General',
            name: r,
            qty: 1,
            cost: match ? match.rate || match.cost || 0 : 0,
            uom: match ? match.uom || 'Lot' : 'Lot'
          };
        }
        return {
          id: uid(),
          code: r.code || '',
          cat: r.cat || 'General',
          name: r.name || r.role || r.desc || '',
          qty: r.qty || 1,
          cost: r.cost || r.rate || 0,
          uom: r.uom || 'Lot'
        };
      });
    };
    const serialise = rows => rows.map(r => r.name ? {name: r.name, qty: r.qty || 1} : null).filter(Boolean);
    const startEdit = svc => {
      setEditSvc(svc);
      setEditDraft({
        ...svc,
        scope: [...svc.scope],
        mp: normalise(svc.mp, 'mp'),
        tools: normalise(svc.tools, 'tools'),
        mats: normalise(svc.mats, 'mats'),
        ppe: normalise(svc.ppe, 'ppe')
      });
      setResTab('mp');
    };
    const cancelEdit = () => {
      setEditSvc(null);
      setEditDraft(null);
    };
    const saveEdit = () => {
      const saved = {
        ...editDraft,
        scope: (editDraft.scopeRows || editDraft.scope.map((t, i) => ({
          type: i === 0 ? 'main' : 'sub',
          text: t
        }))).map(r => r.text).filter(Boolean),
        scopeRows: undefined,
        mp: serialise(editDraft.mp),
        tools: serialise(editDraft.tools),
        mats: serialise(editDraft.mats),
        ppe: serialise(editDraft.ppe)
      };
      delete saved.scopeRows;
      saveSowLib(sowLib.map(s => s.id === saved.id ? saved : s));
      setEditSvc(null);
      setEditDraft(null);
      showToast('Service updated.');
    };
    const delSvc = id => {
      if (!confirm('Delete this service?')) return;
      saveSowLib(sowLib.filter(s => s.id !== id));
      showToast('Deleted.');
    };
    const addSvc = () => {
      const blank = {
        id: uid(),
        cat: 'On-Site Services',
        title: 'New Service',
        scope: ['Describe the scope here.'],
        mp: [],
        tools: [],
        mats: [],
        ppe: []
      };
      saveSowLib([...sowLib, blank]);
      startEdit(blank);
      showToast('New service added.');
    };
    const resetLib = () => {
      if (!confirm('Reset to defaults? All custom changes will be lost.')) return;
      saveSowLib(window.SOW_LIBRARY);
      showToast('Library reset to defaults.');
    };
    const allCats = [...new Set(sowLib.map(s => s.cat))].sort();

    /* Resource table for one type (mp/tools/mats/ppe) */
    const ResEditor = ({
      rows,
      setRows,
      type
    }) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      const mlMap = {
        mp: masterlist.manpower,
        tools: masterlist.tools,
        mats: masterlist.materials,
        ppe: masterlist.ppe
      };
      const mlItems = mlMap[type] || [];
      const catOpts = type === 'mp' ? ['Electrical', 'Mechanical', 'Civil', 'General'] : type === 'ppe' ? ['General', 'Welding', 'Electrical', 'Mechanical'] : ['Electrical', 'Mechanical', 'Civil', 'General'];
      const [newRowId, setNewRowId] = useState(null);
      const newRowNameRef = useRef(null);
      useEffect(() => {
        if (newRowId && newRowNameRef.current) {
          newRowNameRef.current.focus();
          setNewRowId(null);
        }
      }, [newRowId]);
      const addRow = () => {
        const newId = uid();
        setNewRowId(newId);
        setRows([...safeRows, {
          id: newId,
          code: '',
          cat: 'General',
          name: '',
          qty: 1,
          cost: 0,
          uom: type === 'mp' ? 'Day' : 'Lot'
        }]);
      };
      const upd = (id, k, v) => setRows(safeRows.map(r => r.id === id ? {
        ...r,
        [k]: v
      } : r));
      const del = id => setRows(safeRows.filter(r => r.id !== id));
      const autoFill = (id, name) => {
        const m = mlItems.find(x => (x.role || x.desc || '').toUpperCase() === name.toUpperCase());
        if (m) setRows(safeRows.map(r => r.id === id ? {
          ...r,
          name,
          code: m.code || r.code,
          cat: m.category || r.cat,
          cost: m.rate || m.cost || r.cost,
          uom: m.uom || r.uom
        } : r));else setRows(safeRows.map(r => r.id === id ? {
          ...r,
          name
        } : r));
      };
      return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 8
        }
      }, /*#__PURE__*/React.createElement("button", {
        style: btn('def', true),
        onClick: addRow
      }, "+ Add Row")), safeRows.length === 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: 'center',
          padding: '14px 0',
          color: MT,
          fontSize: 12,
          border: `1px dashed ${BDR}`,
          borderRadius: 6
        }
      }, "No items. Click \"+ Add Row\"."), safeRows.length > 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          overflowX: 'auto'
        }
      }, /*#__PURE__*/React.createElement("table", {
        style: {
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 11
        }
      }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Item Code', 'Category', 'Role / Description', 'Qty', 'Cost (PHP)', 'UOM', ''].map(h => /*#__PURE__*/React.createElement("th", {
        key: h,
        style: {
          ...THS,
          fontSize: 9
        }
      }, h)))), /*#__PURE__*/React.createElement("tbody", null, safeRows.map(r => /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 100,
          fontSize: 10
        },
        value: r.code || '',
        placeholder: "SHIC-XX-000",
        onChange: e => upd(r.id, 'code', e.target.value)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 110
        },
        value: r.cat || 'General',
        onChange: e => upd(r.id, 'cat', e.target.value)
      }, catOpts.map(c => /*#__PURE__*/React.createElement("option", {
        key: c
      }, c)))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 170
        },
        ref: r.id === newRowId ? newRowNameRef : undefined,
        list: 'slr' + r.id,
        value: r.name || '',
        onChange: e => autoFill(r.id, e.target.value),
        placeholder: type === 'mp' ? 'Role / position...' : 'Item description...'
      }), /*#__PURE__*/React.createElement("datalist", {
        id: 'slr' + r.id
      }, mlItems.map(m => /*#__PURE__*/React.createElement("option", {
        key: m.id,
        value: m.role || m.desc
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {...INP, ...MONO, width: 52},
        type: "number", min: 1,
        value: r.qty || 1,
        onChange: e => upd(r.id, 'qty', Math.max(1, parseInt(e.target.value) || 1)),
        title: "Quantity of this item per service application"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 90
        },
        type: "number",
        min: 0,
        value: r.cost || 0,
        onChange: e => upd(r.id, 'cost', parseFloat(e.target.value) || 0)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 68
        },
        value: r.uom || 'Day',
        onChange: e => upd(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Day'))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => del(r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x"))))))));
    };
    const SpWizModal = () => showSpWiz && /*#__PURE__*/React.createElement("div", {
      style: {position:'fixed',inset:0,background:'#000a',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}
    }, /*#__PURE__*/React.createElement("div", {
      style: {background:BG,border:`1px solid ${BDR}`,borderRadius:10,padding:28,width:440,maxWidth:'95vw',boxShadow:'0 8px 40px #0008'}
    }, /*#__PURE__*/React.createElement("div", {
      style: {fontWeight:700,fontSize:15,marginBottom:4,color:'#A78BFA'}
    }, "☁ SharePoint Sync — Scope Library"),
    /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:18}},
      spConnected
        ? 'Connected to: ' + getSiteURL()
        : 'SharePoint not configured. Set your Site URL in Admin → Settings first.'
    ),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexDirection:'column',gap:10,marginBottom:16}},
      /*#__PURE__*/React.createElement("div", {style:{background:'#A78BFA11',border:'1px solid #A78BFA33',borderRadius:7,padding:12}},
        /*#__PURE__*/React.createElement("div", {style:{fontWeight:600,fontSize:12,marginBottom:4}}, "Step 1 — Create List (first time only)"),
        /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:8}}, 'Creates the "' + spList('SowLib') + '" list in SharePoint with the required column. Skip if already set up.'),
        /*#__PURE__*/React.createElement("button", {
          style:btn('def',true), onClick: spSetupList, disabled: spWizBusy || !spConnected
        }, spWizBusy ? '…' : 'Create SP List')
      ),
      /*#__PURE__*/React.createElement("div", {style:{background:'#22c55e11',border:'1px solid #22c55e33',borderRadius:7,padding:12}},
        /*#__PURE__*/React.createElement("div", {style:{fontWeight:600,fontSize:12,marginBottom:4}}, "Step 2 — Publish to SharePoint"),
        /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:8}}, 'Saves your current scope library (' + sowLib.length + ' services) to SharePoint so all users can access it.'),
        /*#__PURE__*/React.createElement("button", {
          style:btn('ok',true), onClick: spPublish, disabled: spWizBusy || !spConnected
        }, spWizBusy ? 'Publishing…' : '↑ Publish to SharePoint')
      ),
      /*#__PURE__*/React.createElement("div", {style:{background:'#3b82f611',border:'1px solid #3b82f633',borderRadius:7,padding:12}},
        /*#__PURE__*/React.createElement("div", {style:{fontWeight:600,fontSize:12,marginBottom:4}}, "Step 3 — Load from SharePoint"),
        /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:8}}, 'Fetches the latest shared library from SharePoint and replaces your local copy.'),
        /*#__PURE__*/React.createElement("button", {
          style:btn('info',true), onClick: spPull, disabled: spWizBusy || !spConnected
        }, spWizBusy ? 'Loading…' : '↓ Load from SharePoint')
      )
    ),
    spWizLog && /*#__PURE__*/React.createElement("div", {
      style: {background:'#ffffff0a',border:`1px solid ${BDR}`,borderRadius:6,padding:'8px 12px',fontSize:12,marginBottom:14,whiteSpace:'pre-wrap'}
    }, spWizLog),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',justifyContent:'flex-end'}},
      /*#__PURE__*/React.createElement("button", {style:btn('def',true), onClick:()=>setShowSpWiz(false)}, "Close")
    )));
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SpWizModal, null), /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: '#A78BFA44'
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
    }, "Scope Library"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, sowLib.length, " services"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        marginLeft: 'auto',
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        /* Export Scope Library to Excel */
        const rows = sowLib.flatMap(svc => {
          const base = {
            ID: svc.id,
            Category: svc.cat,
            Title: svc.title
          };
          /* scope rows */
          const scopeArr = svc.scope || [];
          let mc = 0,
            sc = 0;
          const scopeRows = scopeArr.map(t => {
            const isMain = !t.match(/^[a-z]\./i) || mc === 0;
            if (isMain) {
              mc++;
              sc = 0;
            } else sc++;
            return {
              ...base,
              ScopeType: isMain ? 'main' : 'sub',
              ScopeText: t,
              MP: '',
              Tools: '',
              Materials: '',
              PPE: ''
            };
          });
          if (!scopeRows.length) scopeRows.push({
            ...base,
            ScopeType: '',
            ScopeText: ''
          });
          /* first row gets resource lists */
          if (scopeRows[0]) {
            scopeRows[0].MP = (svc.mp || []).join(' | ');
            scopeRows[0].Tools = (svc.tools || []).join(' | ');
            scopeRows[0].Materials = (svc.mats || []).join(' | ');
            scopeRows[0].PPE = (svc.ppe || []).join(' | ');
          }
          return scopeRows;
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Scope Library');
        XLSX.writeFile(wb, 'SY3_ScopeLibrary.xlsx');
        showToast('Exported ' + sowLib.length + ' services to Excel.');
      }
    }, "Export Library (XLS)"), /*#__PURE__*/React.createElement("button", {
      style: {...btn(spConnected ? 'ok' : 'def', true), position: 'relative'},
      onClick: () => { setSpWizLog(''); setShowSpWiz(true); },
      title: spConnected ? 'SharePoint connected — sync scope library' : 'SharePoint not configured'
    }, (spConnected ? '☁ ' : '○ ') + "SharePoint Sync"), /*#__PURE__*/React.createElement("label", {
      style: {
        ...btn('info', true),
        cursor: 'pointer'
      }
    }, "Import Library (XLS)", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: ".xlsx,.xls,.csv",
      style: {
        display: 'none'
      },
      onChange: async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, {
            type: 'array'
          });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, {
            defval: ''
          });
          /* Group rows by ID */
          const map = {};
          rows.forEach(r => {
            const id = Number(r.ID) || r.ID;
            if (!map[id]) {
              map[id] = {
                id,
                cat: r.Category || 'General',
                title: r.Title || '',
                scope: [],
                mp: [],
                tools: [],
                mats: [],
                ppe: []
              };
            }
            if (r.ScopeText) map[id].scope.push(r.ScopeText);
            if (r.MP) map[id].mp = [...new Set((r.MP + '').split('|').map(x => x.trim()).filter(Boolean))];
            if (r.Tools) map[id].tools = [...new Set((r.Tools + '').split('|').map(x => x.trim()).filter(Boolean))];
            if (r.Materials) map[id].mats = [...new Set((r.Materials + '').split('|').map(x => x.trim()).filter(Boolean))];
            if (r.PPE) map[id].ppe = [...new Set((r.PPE + '').split('|').map(x => x.trim()).filter(Boolean))];
          });
          const parsed = Object.values(map).filter(s => s.title);
          if (!parsed.length) {
            showToast('No valid services found in file.', true);
            return;
          }
          if (confirm('Import ' + parsed.length + ' services? This will replace the current library.')) {
            saveSowLib(parsed);
            showToast('Imported ' + parsed.length + ' services.');
          }
        } catch (err) {
          showToast('Import failed: ' + err.message, true);
        }
        e.target.value = '';
      }
    })), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: resetLib
    }, "Reset Defaults"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      onClick: addSvc
    }, "+ Add Service"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 10,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        flex: 1,
        minWidth: 140
      },
      placeholder: "Search...",
      value: libSearch,
      onChange: e => setLibSearch(e.target.value)
    }), /*#__PURE__*/React.createElement("select", {
      style: {
        ...INP,
        width: 200
      },
      value: libCat,
      onChange: e => setLibCat(e.target.value)
    }, cats.map(c => /*#__PURE__*/React.createElement("option", {
      key: c
    }, c))), (libSearch || libCat !== 'All') && /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        setLibSearch('');
        setLibCat('All');
      }
    }, "Clear"))), editDraft && /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: '#A78BFA88',
        background: '#A78BFA08'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        marginBottom: 12,
        fontSize: 13,
        color: '#A78BFA'
      }
    }, "Editing: ", editSvc.title), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "Title"), /*#__PURE__*/React.createElement("input", {
      style: INP,
      value: editDraft.title,
      onChange: e => setEditDraft(p => ({
        ...p,
        title: e.target.value
      }))
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "Category"), /*#__PURE__*/React.createElement("input", {
      style: INP,
      list: "sowcats",
      value: editDraft.cat,
      onChange: e => setEditDraft(p => ({
        ...p,
        cat: e.target.value
      }))
    }), /*#__PURE__*/React.createElement("datalist", {
      id: "sowcats"
    }, allCats.map(c => /*#__PURE__*/React.createElement("option", {
      key: c,
      value: c
    }))))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "Scope Description", /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontWeight: 400,
        marginLeft: 8,
        fontSize: 10
      }
    }, "\u2014 structured as main steps and sub-steps")), (() => {
      let mc = 0,
        sc = 0;
      const scopeRows = editDraft.scopeRows || editDraft.scope.map((t, i) => ({
        id: String(i),
        type: i === 0 || !t.match(/^[a-z]\./i) ? 'main' : 'sub',
        text: t
      }));
      const setRows = fn => setEditDraft(p => {
        const nr = fn(p.scopeRows || p.scope.map((t, i) => ({
          id: String(i),
          type: i === 0 ? 'main' : 'sub',
          text: t
        })));
        return {
          ...p,
          scopeRows: nr,
          scope: nr.map(r => r.text)
        };
      });
      return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          gap: 5,
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("button", {
        style: btn('def', true),
        onClick: () => setRows(p => [...p, {
          id: uid(),
          type: 'main',
          text: ''
        }])
      }, "+ Main"), /*#__PURE__*/React.createElement("button", {
        style: btn('info', true),
        onClick: () => setRows(p => [...p, {
          id: uid(),
          type: 'sub',
          text: ''
        }])
      }, "+ Sub-step")), scopeRows.map((item, idx) => {
        if (item.type === 'main') {
          mc++;
          sc = 0;
        } else {
          sc++;
        }
        const lbl = item.type === 'main' ? mc + '.' : String.fromCharCode(96 + sc) + '.';
        return /*#__PURE__*/React.createElement("div", {
          key: item.id,
          style: {
            display: 'flex',
            gap: 6,
            marginBottom: 5,
            paddingLeft: item.type === 'main' ? 0 : 16,
            alignItems: 'flex-start'
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            ...MONO,
            fontSize: 11,
            color: item.type === 'main' ? TX : MT,
            fontWeight: item.type === 'main' ? 700 : 400,
            minWidth: 20,
            paddingTop: 5
          }
        }, lbl), /*#__PURE__*/React.createElement("input", {
          style: {
            ...INP,
            flex: 1,
            fontWeight: item.type === 'main' ? 600 : 400
          },
          value: item.text,
          onChange: e => setRows(p => p.map(r => r.id === item.id ? {
            ...r,
            text: e.target.value
          } : r)),
          placeholder: item.type === 'main' ? 'Main scope step...' : 'Sub-step detail...'
        }), /*#__PURE__*/React.createElement("button", {
          onClick: () => setRows(p => p.filter(r => r.id !== item.id)),
          style: {
            background: 'none',
            border: 'none',
            color: ERR,
            cursor: 'pointer',
            fontSize: 13,
            padding: '2px 4px',
            flexShrink: 0
          }
        }, "x"));
      }));
    })()), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 4,
        marginBottom: 10,
        borderBottom: `1px solid ${BDR}`,
        paddingBottom: 8
      }
    }, [['mp', 'Manpower', editDraft.mp.length], ['tools', 'Tools & Equipment', editDraft.tools.length], ['mats', 'Materials', editDraft.mats.length], ['ppe', 'PPE', editDraft.ppe.length]].map(([tabId, tabLabel, tabCount]) => /*#__PURE__*/React.createElement("button", {
      key: tabId,
      onClick: () => setResTab(tabId),
      style: {
        ...btn(resTab === tabId ? 'acc' : 'def', true),
        fontSize: 11
      }
    }, tabLabel, tabCount > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 4,
        background: '#0003',
        borderRadius: 3,
        padding: '0 5px',
        fontSize: 10
      }
    }, tabCount)))), resTab === 'mp' && /*#__PURE__*/React.createElement(ResEditor, {
      rows: editDraft.mp,
      setRows: r => setEditDraft(p => ({
        ...p,
        mp: r
      })),
      type: "mp"
    }), resTab === 'tools' && /*#__PURE__*/React.createElement(ResEditor, {
      rows: editDraft.tools,
      setRows: r => setEditDraft(p => ({
        ...p,
        tools: r
      })),
      type: "tools"
    }), resTab === 'mats' && /*#__PURE__*/React.createElement(ResEditor, {
      rows: editDraft.mats,
      setRows: r => setEditDraft(p => ({
        ...p,
        mats: r
      })),
      type: "mats"
    }), resTab === 'ppe' && /*#__PURE__*/React.createElement(ResEditor, {
      rows: editDraft.ppe,
      setRows: r => setEditDraft(p => ({
        ...p,
        ppe: r
      })),
      type: "ppe"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def'),
      onClick: cancelEdit
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc'),
      onClick: saveEdit
    }, "Save Service"), /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('danger', true),
        marginLeft: 'auto'
      },
      onClick: () => {
        delSvc(editDraft.id);
        cancelEdit();
      }
    }, "Delete Service"))), /*#__PURE__*/React.createElement("div", {
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
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
      style: {
        ...THS,
        width: 70
      }
    }, "SY3 ID"), /*#__PURE__*/React.createElement("th", {
      style: THS
    }, "Title"), /*#__PURE__*/React.createElement("th", {
      style: THS
    }, "Category"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...THS,
        width: 90
      }
    }, "Resources"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...THS,
        width: 60,
        textAlign: 'right'
      }
    }, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(svc => /*#__PURE__*/React.createElement("tr", {
      key: svc.id,
      style: {
        background: editSvc && editSvc.id === svc.id ? '#A78BFA0A' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        ...MONO,
        fontSize: 10,
        color: MT
      }
    }, "SY3-", String(svc.id).padStart(2, '0')), /*#__PURE__*/React.createElement("td", {
      style: TDS
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600
      }
    }, svc.title), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 10,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 320
      }
    }, ((svc.scope||[])[0] || '').slice(0, 90), ((svc.scope||[])[0] || '').length > 90 ? '...' : '')), /*#__PURE__*/React.createElement("td", {
      style: TDS
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#A78BFA',
        fontSize: 11
      }
    }, svc.cat)), /*#__PURE__*/React.createElement("td", {
      style: TDS
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 10,
        lineHeight: 1.7
      }
    }, "MP:", (svc.mp || []).length, " TL:", (svc.tools || []).length, /*#__PURE__*/React.createElement("br", null), "MT:", (svc.mats || []).length, " PP:", (svc.ppe || []).length)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => editSvc && editSvc.id === svc.id ? cancelEdit() : startEdit(svc)
    }, editSvc && editSvc.id === svc.id ? 'Close' : 'Edit'))))))), filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: 28,
        color: MT
      }
    }, "No services match. Clear the filter.")));
  };

  /* ---- Picker modal ---- */
  const Picker = () => {
    if (!picker) return null;
    const [q, setQ] = useState('');
    const [sel, setSel] = useState({}); /* {id: item} for multi-select */
    const items = (masterlist[picker.type] || []).filter(r => !q || (r.role || r.desc || '').toLowerCase().includes(q.toLowerCase()) || r.category.toLowerCase().includes(q.toLowerCase()));
    const selCount = Object.keys(sel).length;
    const toggleItem = item => {
      setSel(p => {
        const n = {
          ...p
        };
        if (n[item.id]) delete n[item.id];else n[item.id] = item;
        return n;
      });
    };
    const applySelected = () => {
      Object.values(sel).forEach(item => picker.onSelect(item));
      setPicker(null);
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'fixed',
        inset: 0,
        background: '#000c',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      },
      onClick: e => e.target === e.currentTarget && setPicker(null)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: CARD,
        border: `1px solid ${BDR}`,
        borderRadius: 12,
        width: 520,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 40px #0007'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '13px 16px',
        borderBottom: `1px solid ${BDR}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        flex: 1,
        textTransform: 'capitalize'
      }
    }, "Masterlist - ", picker.type), selCount > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        background: ACC + '22',
        color: ACC,
        borderRadius: 12,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 700
      }
    }, selCount, " selected"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setPicker(null),
      style: {
        background: 'none',
        border: 'none',
        color: MT,
        cursor: 'pointer',
        fontSize: 18,
        lineHeight: 1,
        padding: '0 4px'
      }
    }, "x")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '9px 16px',
        borderBottom: `1px solid ${BDR}`,
        display: 'flex',
        gap: 8,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("input", {
      style: {
        ...INP,
        flex: 1
      },
      placeholder: "Search...",
      value: q,
      autoFocus: true,
      onChange: e => setQ(e.target.value)
    }), items.length > 0 && /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => {
        const allSelected = items.every(i => sel[i.id]);
        if (allSelected) {
          const n = {
            ...sel
          };
          items.forEach(i => delete n[i.id]);
          setSel(n);
        } else {
          const n = {
            ...sel
          };
          items.forEach(i => {
            n[i.id] = i;
          });
          setSel(n);
        }
      }
    }, items.every(i => sel[i.id]) ? 'Deselect All' : 'Select All')), /*#__PURE__*/React.createElement("div", {
      style: {
        overflowY: 'auto',
        flex: 1
      }
    }, items.map(item => {
      const name = item.role || item.desc,
        cost = item.rate || item.cost;
      const isSelected = !!sel[item.id];
      return /*#__PURE__*/React.createElement("div", {
        key: item.id,
        onClick: () => toggleItem(item),
        style: {
          padding: '10px 16px',
          cursor: 'pointer',
          borderBottom: `1px solid ${BDR}22`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: isSelected ? ACC + '15' : 'transparent',
          borderLeft: isSelected ? `3px solid ${ACC}` : '3px solid transparent'
        },
        onMouseEnter: e => e.currentTarget.style.background = isSelected ? ACC + '22' : SURF,
        onMouseLeave: e => e.currentTarget.style.background = isSelected ? ACC + '15' : 'transparent'
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `2px solid ${isSelected ? ACC : BDR}`,
          background: isSelected ? ACC : 'transparent',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
      }, isSelected && /*#__PURE__*/React.createElement("span", {
        style: {
          color: '#000',
          fontSize: 10,
          fontWeight: 900,
          lineHeight: 1
        }
      }, "\u2713")), /*#__PURE__*/React.createElement("div", null, item.code && /*#__PURE__*/React.createElement("div", {
        style: {
          ...MONO,
          fontSize: 9,
          color: MT,
          marginBottom: 1
        }
      }, item.code), /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 600,
          fontSize: 12
        }
      }, name), /*#__PURE__*/React.createElement("div", {
        style: {
          color: MT,
          fontSize: 11
        }
      }, item.category, " - ", item.uom))), /*#__PURE__*/React.createElement("div", {
        style: {
          ...MONO,
          color: ACC,
          fontWeight: 700
        }
      }, "P", (cost || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })));
    }), items.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 28,
        textAlign: 'center',
        color: MT
      }
    }, "No items found.")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '10px 16px',
        borderTop: `1px solid ${BDR}`,
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end',
        alignItems: 'center'
      }
    }, selCount > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontSize: 11,
        color: MT
      }
    }, selCount, " item", selCount !== 1 ? 's' : '', " selected"), /*#__PURE__*/React.createElement("button", {
      style: btn('def'),
      onClick: () => setPicker(null)
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc'),
      disabled: selCount === 0,
      onClick: applySelected
    }, "Add ", selCount > 0 ? selCount + ' Item' + (selCount !== 1 ? 's' : '') : 'Selected'))));
  };

  /* ResTab — defined in src/components/ResTab.js */
  const summaryRows = [...(cfg.mobDemob ? [['Mobilization Expenses', mobSubT], ['Demobilization Expenses', demobSubT]] : []), ['A.  Manpower Cost', mpTot], [(ceType === 'supply' ? 'B.' : 'D.') + '  Tools & Equipment', toolsT], [(ceType === 'supply' ? 'B.' : 'E.') + '  Materials & Consumables', matsT], [(ceType === 'supply' ? 'C.' : 'F.') + '  PPE', ppeT], [(ceType === 'supply' ? 'D.' : ceType === 'onsite' ? 'G.' : 'E.') + '  Miscellaneous', miscT]];
  const handleGenerateCE = () => {
    const fmt = (n, d = 2) => 'P' + N(n).toLocaleString('en-PH', {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
    const ph2 = n => N(n).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const allCos = getCompanies();
    const coInfo = allCos.find(c => String(c.id) === String(info.companyId)) || allCos[0] || {};
    const pageStyle = `
      @page{size:A4 portrait;margin:8mm 10mm}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:8pt;color:#000;margin:0;padding:0}
      table{width:100%;border-collapse:collapse}
      td,th{border:1px solid #555;padding:1.5px 4px;font-size:7.5pt;vertical-align:middle}
      .nb td,.nb th{border:none} .bdr td,.bdr th{border:1px solid #999}
      .page{padding:0;margin-bottom:4mm}
      .page-break{page-break-before:always;padding-top:0}
      h2{font-size:10pt;text-align:center;margin:2px 0;font-weight:bold}
      .sec{background:#222;color:#fff;font-weight:bold;text-align:center;padding:3px;font-size:8pt}
      .sub{background:#eee;font-weight:bold;font-size:7.5pt;padding:2px 4px}
      .r{text-align:right} .c{text-align:center} .b{font-weight:bold}
      .tot{background:#f5f5f5;font-weight:bold}
      .sig td{border:none;text-align:center;padding:0 6px;vertical-align:bottom}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    `;
    const co = {
      name:    coInfo.name    || 'SYNERCORE',
      sub:     coInfo.sub     || 'HEAVY INDUSTRIES CORP.',
      doc:     coInfo.docNo   || coInfo.doc || 'SHIC-F-TSG025',
      revNo:   coInfo.revNo   || '0',
      revDate: coInfo.revDate || '',
      logo:    coInfo.logo    || '',
      color:   coInfo.color   || '#cc0000'
    };
    const logoCell = co.logo
      ? `<img src="${esc(co.logo)}" style="max-width:70px;max-height:36px;object-fit:contain">`
      : `<div style="font-weight:900;font-size:10pt;color:${esc(co.color)};line-height:1.1">${esc(co.name)}<br><span style="font-size:6pt">${esc(co.sub)}</span></div>`;

    const docHdr = title => `<table style="border:1px solid #000;margin-bottom:4px;font-size:7.5pt"><tr>
      <td style="border:none;width:75px;padding:2px">${logoCell}</td>
      <td style="border:none;text-align:center"><h2>COST ESTIMATE SUMMARY</h2></td>
      <td style="border:none;width:150px;font-size:7pt">
        <table class="nb"><tr><td style="border:none;width:80px">Document No.:</td><td style="border:none">${esc(co.doc)}</td></tr>
        <tr><td style="border:none">Revision No.:</td><td style="border:none">${esc(co.revNo)}</td></tr>
        <tr><td style="border:none">Revision Date:</td><td style="border:none">${esc(co.revDate)}</td></tr></table>
      </td></tr>
      <tr><td colspan="3" style="text-align:center;background:#000;color:#fff;font-weight:bold;font-size:9pt;padding:3px;border:1px solid #000">${title}</td></tr>
      <tr><td colspan="3" style="border:none;text-align:right;font-size:7.5pt;padding:1px 4px"><b>CE No.:</b>&nbsp;${esc(info.ceNum || '')}&nbsp;&nbsp;<b>CE TYPE:</b>&nbsp;${ceType.toUpperCase()}&nbsp;&nbsp;<b>DATE:</b>&nbsp;${esc(info.date||'')}</td></tr>
    </table>`;

    const infoTable = `<table class="bdr" style="margin-bottom:5px;font-size:7.5pt">
      <tr><td class="b" style="width:110px">PROJECT DESCRIPTION:</td><td colspan="3" class="b c">${esc(info.description||'')}</td></tr>
      <tr><td class="b">CLIENT NAME:</td><td>${esc(info.client||'')}</td><td class="b" style="width:90px">CLIENT LOCATION:</td><td>${esc(info.location||'')}</td></tr>
      <tr><td class="b">ATTENTION:</td><td>${esc(info.attention||'SALES DEPARTMENT')}</td><td class="b">QUANTITY:</td><td>${esc(info.qty||1)} LOT</td></tr>
      <tr><td class="b">END USER:</td><td>${esc(info.endUser||'C/O SALES')}</td><td class="b">NO. OF DAYS:</td><td>${esc(info.days||'')} DAYS</td></tr>
    </table>`;

    /* Cost summary &#8212; skip zero rows */
    const miscItems = [
      {l:'G.1 Accommodation',v:N(misc.accommodation)},{l:'G.2 Transportation',v:N(misc.transport)},
      {l:'G.3 Requirements',v:N(misc.requirements)},{l:'G.4 Admin Cost',v:N(misc.adminCost)},
      {l:'G.5 Third Party',v:N(misc.thirdParty)},{l:'G.6 Insurances',v:N(misc.insurance)}
    ];
    const miscActive = miscItems.filter(x=>x.v>0);
    const miscLetter = ceType==='supply'?'D.':ceType==='onsite'?'G.':'E.';
    const mpLetter   = 'A.';
    const toolLetter = ceType==='supply'?'B.':ceType==='onsite'?'B.':'B.';
    const matLetter  = ceType==='supply'?'C.':'C.';
    const ppeLetter  = ceType==='supply'?'C.':'D.';
    const mobLetter  = ceType==='supply'?'E.':'F.';
    const costRows = [
      {l:mpLetter+'  MANPOWER COST',               v:mpTot,   always:true},
      {l:toolLetter+' TOOLS AND EQUIPMENTS',        v:toolsT,  always:false},
      {l:matLetter+' MATERIALS AND CONSUMABLES',    v:matsT,   always:false},
      {l:ppeLetter+' PERSONAL PROTECTIVE EQUIPMENT',v:ppeT,    always:false},
      ...(miscActive.length ? [{l:miscLetter+' MISCELLANEOUS', v:miscT, always:false, sub:miscActive}] : []),
      {l:mobLetter+' MOBILIZATION/DEMOBILIZATION',  v:mobT,    always:false},
    ].filter(r=>r.always||r.v>0||r.sub);

    const costTable = `<table style="margin-bottom:5px">
      <tr style="background:#333;color:#fff"><th class="c" style="width:40px">ITEM</th><th>DESCRIPTION</th><th class="r" style="width:110px">TOTAL COST</th></tr>
      ${costRows.map(r=>`<tr${r.sub?'':''}>
        <td class="c b">${r.l.split(' ')[0]}</td>
        <td class="b">${r.l.split(' ').slice(1).join(' ')}</td>
        <td class="r">${fmt(r.v)}</td>
      </tr>${r.sub?r.sub.map(s=>`<tr><td class="c" style="font-size:7pt">${s.l.split(' ')[0]}</td><td style="padding-left:16px;font-size:7pt">${s.l.split(' ').slice(1).join(' ')}</td><td class="r" style="font-size:7pt">${fmt(s.v)}</td></tr>`).join(''):''}
      `).join('')}
      <tr class="tot"><td colspan="2" class="b r" style="font-size:9pt">TOTAL AMOUNT:</td><td class="r b" style="font-size:9pt">${fmt(grand)}</td></tr>
      <tr class="tot"><td colspan="2" class="b r">UNIT PRICE (qty ${N(info.qty)||1}):</td><td class="r b">${fmt(unitP)}</td></tr>
      ${margin !== 0 ? `<tr class="tot" style="background:#e8f5e9"><td colspan="2" class="b r">SELLING PRICE (${margin > 0 ? '+' : ''}${margin}% margin):</td><td class="r b">${fmt(grand*(1+margin/100))}</td></tr>` : ''}
      ${hlRows.length ? hlRows.map(r=>`<tr class="tot"><td colspan="2" class="b r">${esc(hlLabel(r).toUpperCase())}:</td><td class="r b">${fmt(hlAmt(r))}</td></tr>`).join('') : ''}
    </table>`;

    /* Breakdown notes written on the SOW Breakdown tab print with the CE notes,
       after the manually written ones, each labelled with its scope number. */
    const sowNotes = (sowItems || []).filter(s => String(s.note || '').trim());
    const notesList = (notes.length || sowNotes.length) ? `<div style="margin-top:4px"><b>NOTE:</b><ol style="margin:1px 0 0 14px;padding:0;font-size:7.5pt">${notes.map(n=>`<li>${esc(n.text)}</li>`).join('')}${sowNotes.map(s=>`<li><b>Scope ${esc(sowLabels[s.id]||'')}</b> &#8212; ${esc(String(s.note).trim())}</li>`).join('')}</ol></div>` : '';
    const sigBlock = `<table style="width:100%;border-collapse:collapse;margin-top:20px;table-layout:fixed" class="sig">
      <tr>${approvers.map(a=>`<td style="border:1px solid #000;padding:4px 8px;font-size:8pt;font-weight:bold;vertical-align:top"><b>${esc(a.role)}:</b></td>`).join('')}</tr>
      <tr>${approvers.map((a,i)=>{const sigImg=signatures[a.id||i]?`<img src="${signatures[a.id||i]}" style="height:36px;max-width:100%;display:block;margin:0 auto 2px"/>`:'';return`<td style="border:1px solid #000;padding:4px 8px;vertical-align:bottom"><div style="min-height:46px;text-align:center">${sigImg}</div><div style="border-top:1px solid #000;padding-top:3px;text-align:center"><b style="font-size:8pt">${esc(a.name||'')}</b><br><span style="font-size:7.5pt">${esc(a.title||a.role||'')}</span></div></td>`;}).join('')}</tr>
    </table>`;

    /* Manpower &#8212; skip zero-rate rows */
    const mpActive = mp.filter(r=>N(r.rate)>0||N(r.pax)>0);
    const shiftKeys = [...new Set(mpActive.map(r=>r.shift||'straight'))];
    const shiftRows = shiftKeys.map(sk=>{
      const rows=mpActive.filter(r=>(r.shift||'straight')===sk);
      if(!rows.length)return'';
      const info2=SHIFTS[sk];const mult=info2?.mult||1;
      const subA=rows.reduce((s,r)=>s+N(r.pax)*N(r.days)*N(r.rate)*mult,0);
      const subB=rows.reduce((s,r)=>s+N(r.pax)*N(r.days)*(N(r.otHours)/8)*N(r.rate)*1.25*mult,0);
      return`<div class="sub">${info2?.label||sk.toUpperCase()}</div>
      <table><tr style="background:#eee"><th class="c" style="width:28px">ITEM</th><th>MANPOWER LOADING</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:30px">UOM</th><th class="c" style="width:36px">DAYS</th><th class="r" style="width:60px">RATE/DAY</th><th class="r" style="width:70px">SUBTOTAL</th><th class="c" style="width:30px">AOT</th><th class="r" style="width:55px">RATE OT</th><th class="r" style="width:70px">TOTAL</th></tr>
      ${rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.role||'')}</td><td class="c">${esc(r.pax||1)}</td><td class="c">pax</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.rate)}</td><td class="r">${fmt(N(r.pax)*N(r.days)*N(r.rate)*mult)}</td>${/* AOT is the ACCUMULATED overtime on the printed form: the reader multiplies
      this column by RATE OT. otHours is now per day, so the total is what
      belongs here -- printing the per-day figure would understate the row
      against its own TOTAL column. */''}<td class="c">${esc(N(r.otHours)*N(r.days)||0)}</td><td class="r">${fmt(N(r.rate)/8*1.25*mult)}</td><td class="r b">${fmt(N(r.pax)*N(r.days)*N(r.rate)*mult+N(r.pax)*N(r.days)*(N(r.otHours)/8)*N(r.rate)*1.25*mult)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="9" class="r b">SUB TOTAL:</td><td class="r b">${fmt(subA+subB)}</td></tr></table>`;
    }).join('');

    /* Benefits &#8212; only active rows */
    const benRows=mpActive.filter(r=>N(r.monthlyRate)>0||(r.benefits&&Object.values(r.benefits).some(v=>N(v)>0)));
    const benPage=benRows.length?`<div class="page page-break">${docHdr('BILL OF LABOR')}
      <div class="sec">C.7 &nbsp;BENEFITS AND OTHERS</div>
      <table><tr style="background:#eee"><th class="c">ITEM</th><th>MANPOWER LOADING</th><th class="c">QTY</th><th class="c">UOM</th><th class="c">TOTAL DAYS</th><th class="r">MONTHLY RATE</th><th class="r">13TH PAY</th><th class="r">SSS</th><th class="r">HDMF&amp;PHIC</th><th class="r">SIL&amp;ECC</th><th class="r">TOTAL</th></tr>
      ${benRows.map((r,i)=>{const b=r.benefits||{};const tot=N(b.thirteenth)+N(b.sss)+N(b.hdmf)+N(b.sil);return`<tr><td class="c">${i+1}</td><td>${esc(r.role||'')}</td><td class="c">${esc(r.pax||1)}</td><td class="c">pax</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.monthlyRate||0)}</td><td class="r">${fmt(b.thirteenth||0)}</td><td class="r">${fmt(b.sss||0)}</td><td class="r">${fmt(b.hdmf||0)}</td><td class="r">${fmt(b.sil||0)}</td><td class="r b">${fmt(tot)}</td></tr>`;}).join('')}
      <tr class="tot"><td colspan="10" class="r b">BENEFITS &amp; OTHERS SUB TOTAL:</td><td class="r b">${fmt(benRows.reduce((s,r)=>{const b=r.benefits||{};return s+N(b.thirteenth)+N(b.sss)+N(b.hdmf)+N(b.sil);},0))}</td></tr>
      <tr class="tot"><td colspan="10" class="r b">TOTAL MANPOWER COST (C.1-C.7):</td><td class="r b">${fmt(mpTot)}</td></tr></table></div>` : '';

    /* Tools &#8212; skip zero rows */
    const toolsActive=tools.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const toolsPage=toolsActive.length?`<div class="page page-break">${docHdr('BILL OF TOOLS AND EQUIPMENT')}
      <div class="sec">BILL OF TOOLS AND EQUIPMENT</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:35px">UOM</th><th class="c" style="width:35px">DAYS</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${toolsActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="c">${resDays(r)}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.cost)*resDays(r))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="6" class="r b">TOTAL:</td><td class="r b">${fmt(toolsT)}</td></tr></table></div>` : '';

    /* Materials &#8212; skip zero rows */
    const matsActive=mats.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const matsPage=matsActive.length?`<div class="page page-break">${docHdr('BILL OF MATERIALS AND CONSUMABLES')}
      <div class="sec">BILL OF MATERIALS AND CONSUMABLES</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${matsActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.cost))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r b">TOTAL:</td><td class="r b">${fmt(matsT)}</td></tr></table></div>` : '';

    /* PPE &#8212; skip zero rows */
    const ppeActive=ppe.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const ppePage=ppeActive.length?`<div class="page page-break">${docHdr('PERSONAL PROTECTIVE EQUIPMENTS')}
      <div class="sec">PERSONAL PROTECTIVE EQUIPMENTS</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${ppeActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.cost))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4" class="r b">TOTAL:</td><td class="r b">${fmt(ppeT)}</td></tr></table></div>` : '';

    const sowPage=sowItems.length?`<div class="page page-break">${docHdr('SCOPE OF WORK')}<div style="font-size:8pt;line-height:1.6">${(()=>{let mc=0,sc=0;return sowItems.map(it=>{if(it.type==='main'){mc++;sc=0;return`<div style="margin-top:4px"><b>${mc}. ${esc(it.text)}</b></div>`;}else{sc++;return`<div style="margin-left:14px">${mc}.${sc} ${esc(it.text)}</div>`;}}).join('');})()}</div></div>`:'';

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CE ${esc(info.ceNum||'')}<\/title><style>${pageStyle}<\/style><\/head><body>
      <div class="page">
        ${docHdr('COST ESTIMATE SUMMARY')}
        ${infoTable}
        ${costTable}
        ${notesList}
        ${sigBlock}
      </div>
      ${mpActive.length?`<div class="page page-break">${docHdr('BILL OF LABOR')}<div class="sec">MANPOWER COST</div>${shiftRows}<div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">TOTAL MANPOWER COST: ${fmt(mpTot)}</div></div>`:''}
      ${benPage}${toolsPage}${matsPage}${ppePage}${sowPage}
    <\/body><\/html>`;
    const w=window.open('','_blank');
    w.document.write(fullHtml);
    w.document.close();
    setTimeout(() => w.print(), 800);
    window.__lastCEHtml = fullHtml;
  };
  /* Feature 1: Print Preview (no auto-print) */
  const handlePrintPreview = () => {
    window.__lastCEHtml = null;
    handleGenerateCE();
    setTimeout(() => {
      const html = window.__lastCEHtml;
      if (!html) return;
      const previewHtml = html.replace('</body>', `<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;z-index:9999;font-family:sans-serif;font-size:13px"><b>👁 CE Preview</b><button onclick="window.print()" style="background:#F0A429;color:#000;border:none;padding:5px 14px;border-radius:4px;font-weight:700;cursor:pointer">🖨 Print</button><button onclick="window.close()" style="background:#333;color:#fff;border:1px solid #555;padding:5px 14px;border-radius:4px;cursor:pointer">✕ Close</button><span style="margin-left:auto;color:#aaa;font-size:11px">Use Ctrl+P to print</span></div></body>`);
      const w = window.open('','_blank');
      w.document.write(previewHtml.replace('@page{', '@page{ margin-top:20mm;'));
      w.document.close();
    }, 900);
  };
  /* Named line items that carry no cost. They look like real scope on the CE but
     contribute nothing to the total, so they are almost always an oversight.
     Shared by Save and Generate CE -- previously only Generate CE checked, so a
     CE with P0 items could be saved and circulated with no warning. */
  const collectZeroCost = () => {
    const out = [];
    mp.forEach(r => { if (!N(r.rate) && (r.role || r.desc)) out.push('Manpower: ' + (r.role || r.desc)); });
    tools.forEach(r => { if (!N(r.cost) && r.desc) out.push('Tool: ' + r.desc); });
    mats.forEach(r => { if (!N(r.cost) && r.desc) out.push('Material: ' + r.desc); });
    ppe.forEach(r => { if (!N(r.cost) && r.desc) out.push('PPE: ' + r.desc); });
    miscCats.forEach(c => (Array.isArray(misc[c.k]) ? misc[c.k] : []).forEach(r => {
      if (!N(r.cost) && r.desc) out.push(c.label + ': ' + r.desc);
    }));
    return out;
  };
  /* Returns false if the user cancels. */
  const confirmZeroCost = action => {
    const z = collectZeroCost();
    if (!z.length) return true;
    const preview = z.slice(0, 10).join('\n') + (z.length > 10 ? '\n... and ' + (z.length - 10) + ' more' : '');
    return window.confirm(z.length + ' item(s) have ₱0 cost and will not contribute to the total:\n\n' + preview + '\n\n' + action);
  };
  const handleGenerateCEWithCheck = () => {
    if (!confirmZeroCost('Proceed with generating CE?')) return;
    handleGenerateCE();
  };
  const handleExportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const aoa = (rows) => XLSX.utils.aoa_to_sheet(rows);
    const shiftLabel = {regular_day:'Regular Day',regular_night:'Regular Night',sunday:'Sunday',holiday:'Holiday'};
    const shiftMult = {regular_day:1,regular_night:1.25,sunday:1.3,holiday:2};
    /* Summary */
    const sumRows = [
      ['SHIC COST ESTIMATE'],[''],
      ['CE Number:', info.ceNum], ['Date:', info.date], ['Client:', info.client||''], ['Location:', info.location||''], ['Description:', info.description||''],
      [''],['SECTION','AMOUNT (₱)'],
      ...summaryRows.map(([l,v])=>[l, v]),
      [''],['GRAND TOTAL (Cost)', grand],
      ['Margin %', margin+'%'],
      ['SELLING PRICE', grand*(1+margin/100)]
    ];
    XLSX.utils.book_append_sheet(wb, aoa(sumRows), 'Summary');
    /* Manpower */
    if (mp.filter(r=>r.role||r.desc).length) {
      const mpRows = [['Role','Pax','Days','OT Hrs/Day','Shift','Rate (₱/Day)','Per Diem (₱)','Total (₱)'],
        ...mp.filter(r=>r.role||r.desc).map(r=>{
          const sm=shiftMult[r.shift]||1;
          const base=N(r.pax)*N(r.days)*N(r.rate)*sm;
          const ot=N(r.pax)*N(r.days)*N(r.otHours)*(N(r.rate)/8)*1.25;
          const pd=N(r.pax)*N(r.days)*N(r.perDiem);
          return[r.role||r.desc,N(r.pax),N(r.days),N(r.otHours),shiftLabel[r.shift]||r.shift,N(r.rate),N(r.perDiem),base+ot+pd];
        })];
      XLSX.utils.book_append_sheet(wb, aoa(mpRows), 'Manpower');
    }
    /* Tools */
    if (tools.filter(r=>r.desc).length) {
      const tRows=[['Description','Qty','Days','UOM','Cost (₱)','Total (₱)'],...tools.filter(r=>r.desc).map(r=>[r.desc,N(r.qty),resDays(r),r.uom,N(r.cost),N(r.qty)*resDays(r)*N(r.cost)])];
      XLSX.utils.book_append_sheet(wb, aoa(tRows), 'Tools');
    }
    /* Materials */
    if (mats.filter(r=>r.desc).length) {
      const mRows=[['Description','Qty','UOM','Cost (₱)','Total (₱)'],...mats.filter(r=>r.desc).map(r=>[r.desc,N(r.qty),r.uom,N(r.cost),N(r.qty)*N(r.cost)])];
      XLSX.utils.book_append_sheet(wb, aoa(mRows), 'Materials');
    }
    /* PPE */
    if (ppe.filter(r=>r.desc).length) {
      const pRows=[['Description','Qty','UOM','Cost (₱)','Total (₱)'],...ppe.filter(r=>r.desc).map(r=>[r.desc,N(r.qty),r.uom,N(r.cost),N(r.qty)*N(r.cost)])];
      XLSX.utils.book_append_sheet(wb, aoa(pRows), 'PPE');
    }
    XLSX.writeFile(wb, (info.ceNum||'CE') + '_' + (info.client||'export').replace(/[^a-z0-9]/gi,'_') + '.xlsx');
    showToast('Exported to Excel.');
  };
  const [showDraftBanner, setShowDraftBanner] = React.useState(() => hasDraft());
  /* Refreshed on every render so the auto-save timer never works from a
     stale closure. */
  _live.current = {
    saveDraft, hasUnsavedWork,
    sig: JSON.stringify([info, mp, tools, mats, ppe, misc, sowItems, notes, addlCosts, margin, mobVehicles, demobVehicles])
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: BG,
      color: TX,
      minHeight: '100vh',
      fontSize: 13
    },
    onClick: () => copyMenu && setCopyMenu(null)
  }, /*#__PURE__*/React.createElement(SignInBanner, null), /*#__PURE__*/React.createElement(SyncStatusBar, null),
  bulkOn && isAdmin && /*#__PURE__*/React.createElement("div", {
    style: { background: ERR + '22', borderBottom: `1px solid ${ERR}55`, padding: '6px 16px',
             display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }
  },
    /*#__PURE__*/React.createElement("span", { style: { fontWeight: 700, color: ERR } }, "⚠ BULK UPLOAD MODE"),
    /*#__PURE__*/React.createElement("span", { style: { color: MT } },
      "Duplicate CE-number checking is OFF. Saving a CE number that already exists will OVERWRITE it."),
    /* A week-long window is easy to forget about, and "5d 2h left" reads like
       there is plenty of time rather than like it has been running unattended
       since Monday. Say how long it has actually been open once that passes a
       day, and say it in the same red as the warning. */
    bulkMode.isStale() && /*#__PURE__*/React.createElement("span", { style: { color: ERR, fontWeight: 700 } },
      "Open for " + bulkMode.openForText() + " — still meant to be on?"),
    /*#__PURE__*/React.createElement("span", { style: { color: MT, marginLeft: 'auto' } },
      bulkMode.timeLeftText() + " left"),
    /*#__PURE__*/React.createElement("button", {
      style: { ...btn('danger', true), fontSize: 11 },
      onClick: () => { bulkMode.disable(); setBulkOn(false); showToast('Bulk upload mode off — duplicate protection restored.'); }
    }, "Turn off now")
  ), updateInfo?.available && /*#__PURE__*/React.createElement("div", {
    style: {
      background: updateInfo.urgent ? ERR + '22' : '#22C55E22',
      borderBottom: `1px solid ${updateInfo.urgent ? ERR : OK}44`,
      padding: '8px 16px',
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: updateInfo.urgent ? ERR : OK
    }
  }, updateInfo.urgent ? '\U0001f6a8 Critical' : '\U0001f195 Update', " v", updateInfo.version, " available (you have v", APP_VERSION, ")"), updateInfo.notes && /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "\u2014 ", updateInfo.notes), safeHttpUrl(updateInfo.downloadUrl) && /*#__PURE__*/React.createElement("a", {
    /* The whole banner comes from a JSON document fetched off the network, so
       downloadUrl is remote input rendered straight into an href. React does
       not block a javascript: URL there \u2014 one click would run it in the app's
       origin, with the session and every cached CE in reach. Only http(s)
       survives the check. */
    href: safeHttpUrl(updateInfo.downloadUrl),
    target: "_blank",
    rel: "noopener noreferrer",
    style: {
      ...btn('acc', true),
      fontSize: 11,
      textDecoration: 'none',
      marginLeft: 8
    }
  }, "\u2B07 Download"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      marginLeft: 'auto'
    },
    onClick: () => setUpdateInfo(null)
  }, "\u2715")), showDraftBanner && hasDraft() && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#8B5CF622',
      borderBottom: '1px solid #8B5CF644',
      padding: '7px 16px',
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#A78BFA',
      fontWeight: 700
    }
  }, "\u2B07 Local draft found"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT
    }
  }, "You have a local draft CE."), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      borderColor: '#8B5CF655',
      color: '#A78BFA',
      fontSize: 11
    },
    onClick: () => {
      loadDraft();
      setShowDraftBanner(false);
    }
  }, "Resume"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      fontSize: 11,
      marginLeft: 'auto'
    },
    onClick: () => {
      clearDraft();
      setShowDraftBanner(false);
    }
  }, "Dismiss")), draftsOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#000c',
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    onClick: e => e.target === e.currentTarget && setDraftsOpen(false)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      border: `1px solid ${'#8B5CF644'}`,
      borderRadius: 12,
      width: 600,
      maxHeight: '78vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 40px #0008'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px',
      borderBottom: `1px solid ${BDR}`,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: '#A78BFA'
    }
  }, "\uD83D\uDCCB Shared Drafts"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11,
      flex: 1
    }
  }, 'Shared via SharePoint'), /*#__PURE__*/React.createElement("button", {
    onClick: () => loadSharedDrafts(),
    style: btn('def', true),
    title: "Refresh"
  }, "\u21BB"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDraftsOpen(false),
    style: {
      background: 'none',
      border: 'none',
      color: MT,
      cursor: 'pointer',
      fontSize: 18,
      padding: '0 4px'
    }
  }, "x")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: 'auto',
      flex: 1,
      padding: 12
    }
  }, sharedDrafts.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      textAlign: 'center',
      color: MT
    }
  }, "No shared drafts found."), sharedDrafts.map(d => {
    const age = Math.round((Date.now() - new Date(d.savedAt).getTime()) / 60000);
    const ageStr = age < 60 ? age + 'm ago' : age < 1440 ? Math.round(age / 60) + 'h ago' : Math.round(age / 1440) + 'd ago';
    const isOwn = d.savedBy === currentUser.username;
    return /*#__PURE__*/React.createElement("div", {
      key: d.draftId,
      style: {
        padding: '12px 14px',
        background: SURF,
        borderRadius: 8,
        marginBottom: 8,
        border: `1px solid ${BDR}`,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 13
      }
    }, d.info?.ceNum || '(No CE#)'), /*#__PURE__*/React.createElement("span", {
      style: {
        background: isOwn ? '#8B5CF622' : '#F0A42922',
        color: isOwn ? '#A78BFA' : ACC,
        borderRadius: 10,
        padding: '1px 8px',
        fontSize: 10,
        fontWeight: 700
      }
    }, isOwn ? 'You' : d.savedByName), /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 10,
        marginLeft: 'auto'
      }
    }, ageStr)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, d.info?.description || d.info?.client || 'No description'), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 10,
        marginTop: 3
      }
    }, d.ceType?.toUpperCase(), " \xB7 ", (d.mp || []).length, " manpower \xB7 ", (d.tools || []).length, " tools \xB7 ", (d.mats || []).length, " materials")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('acc', true),
        fontSize: 11
      },
      onClick: () => resumeDraft(d)
    }, "Resume"), (isOwn || isAdmin) && /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('danger', true),
        fontSize: 11
      },
      onClick: () => deleteDraft(d.draftId)
    }, "Delete")));
  })))), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      background: CARD,
      border: `1px solid ${toastErr ? ERR : BDR}`,
      borderRadius: 8,
      padding: '9px 18px',
      zIndex: 999,
      color: TX,
      fontSize: 13,
      boxShadow: '0 4px 24px #0009',
      pointerEvents: 'none'
    }
  }, toast), undoToast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: CARD, border: `1px solid ${BDR}`, borderRadius: 8,
      padding: '10px 18px', zIndex: 1000, color: TX, fontSize: 13,
      boxShadow: '0 4px 24px #0009', display: 'flex', alignItems: 'center', gap: 12
    }
  }, undoToast.msg, /*#__PURE__*/React.createElement("button", {
    onClick: undoToast.onUndo,
    style: { ...btn('warn', true), fontSize: 12, padding: '3px 10px' }
  }, "Undo")), /*#__PURE__*/React.createElement(Picker, null), showApiKey && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#000c',
      zIndex: 400,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      border: `1px solid ${BDR}`,
      borderRadius: 12,
      padding: 22,
      maxWidth: 520,
      width: '95%',
      maxHeight: '92vh',
      overflowY: 'auto',
      boxShadow: '0 8px 40px #0009'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 4
    }
  }, "AI Provider & Key"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 12,
      marginBottom: 14,
      lineHeight: 1.6
    }
  }, "Select a provider and paste your API key.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: OK,
      fontWeight: 700
    }
  }, "Gemini, Groq and Kimi"), " have free tiers - no credit card needed."), /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Select Provider"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 6,
      marginBottom: 14
    }
  }, Object.entries(PROVIDERS).map(([id, p]) => {
    const sel = apiKeyInput.startsWith('__p__') ? apiKeyInput.split('|')[0].slice(5) : getProvider();
    const isSel = sel === id;
    return /*#__PURE__*/React.createElement("div", {
      key: id,
      onClick: () => setApiKeyInput('__p__' + id + '|'),
      style: {
        border: isSel ? `2px solid ${p.bc}` : `1px solid ${BDR}`,
        borderRadius: 7,
        padding: '7px 8px',
        cursor: 'pointer',
        background: isSel ? p.bc + '18' : SURF,
        transition: 'all .12s'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1.3
      }
    }, p.label), /*#__PURE__*/React.createElement("span", {
      style: {
        background: p.bc + '33',
        color: p.bc,
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 3,
        flexShrink: 0,
        whiteSpace: 'nowrap'
      }
    }, p.badge)), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 9,
        lineHeight: 1.3
      }
    }, p.note));
  })), (() => {
    const selProv = apiKeyInput.startsWith('__p__') ? apiKeyInput.split('|')[0].slice(5) : getProvider();
    const pInfo = PROVIDERS[selProv] || PROVIDERS.gemini;
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      style: LBL
    }, "API Key for ", pInfo.label), /*#__PURE__*/React.createElement("input", {
      id: "newApiKey",
      style: {
        ...INP,
        ...MONO,
        fontSize: 11,
        marginBottom: 6
      },
      type: "password",
      defaultValue: getProvider() === selProv ? getApiKey() : '',
      placeholder: pInfo.ph,
      autoFocus: true
    }), selProv === 'copilot' && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: {
        ...LBL,
        marginTop: 8
      }
    }, "Azure OpenAI Endpoint URL"), /*#__PURE__*/React.createElement("input", {
      id: "azureEndpt",
      style: {
        ...INP,
        fontSize: 11
      },
      type: "text",
      defaultValue: getAzureEndpoint(),
      placeholder: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOY"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 10,
        marginBottom: 14,
        lineHeight: 1.5
      }
    }, selProv === 'gemini' && /*#__PURE__*/React.createElement("span", null, "Free key (no card): ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "aistudio.google.com"), " - sign in with Google, click \"Create API key\""), selProv === 'groq' && /*#__PURE__*/React.createElement("span", null, "Free key (no card): ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "console.groq.com"), " - sign up free, go to API Keys"), selProv === 'kimi' && /*#__PURE__*/React.createElement("span", null, "Free key (no card): ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "platform.moonshot.cn"), " - register, create API key"), selProv === 'openai' && /*#__PURE__*/React.createElement("span", null, "Get key: ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "platform.openai.com"), " - comes with $5 credit"), selProv === 'copilot' && /*#__PURE__*/React.createElement("span", null, "Requires ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "Azure OpenAI Service"), " resource + deployment. Enter endpoint URL above and your Azure API key below."), selProv === 'anthropic' && /*#__PURE__*/React.createElement("span", null, "Get key: ", /*#__PURE__*/React.createElement("a", {
      href: pInfo.url,
      target: "_blank",
      style: {
        color: INFO
      }
    }, "console.anthropic.com"), " - pay-per-use, no monthly fee")), /*#__PURE__*/React.createElement("label", {
      style: {display:'flex', alignItems:'center', gap:7, marginBottom:14, cursor:'pointer', userSelect:'none'}
    }, /*#__PURE__*/React.createElement("span", {style:{fontSize:11, color:MT}},
      "🔒 Key is session-only — cleared automatically when the tab closes"
    )), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def'),
      onClick: () => {
        setShowApiKey(false);
        setApiKeyInput('');
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc'),
      onClick: () => {
        const selP = apiKeyInput.startsWith('__p__') ? apiKeyInput.split('|')[0].slice(5) : getProvider();
        const newKey = (document.getElementById('newApiKey')?.value || '').trim();
        if (!newKey) {
          alert('Please enter an API key.');
          return;
        }
        if (selP === 'copilot') {
          const ep = (document.getElementById('azureEndpt')?.value || '').trim();
          if (!ep) {
            alert('Enter your Azure OpenAI endpoint URL.');
            return;
          }
          setAzureEndpoint(ep);
        }
        setProvider(selP);
        setApiKey(newKey);
        showToast((PROVIDERS[selP]?.label || selP) + ' key saved! (session only — clears on tab close)');
        setShowApiKey(false);
        setApiKeyInput('');
      }
    }, "Save & Use"), getApiKey() && /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('danger', true),
        marginLeft: 'auto'
      },
      onClick: () => {
        sessionStorage.removeItem('sy3:apikey');
        localStorage.removeItem('sy3:apikey');
        localStorage.removeItem('sy3:rememberkey');
        localStorage.removeItem('sy3:provider');
        localStorage.removeItem('sy3:azureEndpoint');
        showToast('AI config cleared.');
        setShowApiKey(false);
      }
    }, "Clear")));
  })())), /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      borderBottom: `1px solid ${BDR}`,
      display: 'flex',
      alignItems: 'stretch',
      height: 48,
      padding: '0 16px',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      /* Height is fixed (the tab strip sticks at top:48), so scroll rather than
         wrap when the buttons no longer fit. */
      overflowX: 'auto',
      overflowY: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      paddingRight: 14,
      borderRight: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: ACC,
      color: '#000',
      fontWeight: 800,
      fontSize: 10,
      padding: '3px 8px',
      borderRadius: 4,
      letterSpacing: '0.05em'
    }
  }, "SHIC"), /*#__PURE__*/React.createElement("span", {
    className: "shic-hide-tight",
    style: {
      fontWeight: 700,
      fontSize: 14
    }
  }, "Cost Estimator"), /*#__PURE__*/React.createElement("span", {
    className: "shic-hide-narrow",
    style: {
      color: MT,
      fontSize: 10
    }
  }, "v3")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '0 10px',
      borderRight: `1px solid ${BDR}`
    }
  }, Object.entries(CE_CFG).map(([ceKey, ceVal]) => /*#__PURE__*/React.createElement("button", {
    key: ceKey,
    onClick: () => setCeType(ceKey),
    style: {
      background: ceType === ceKey ? ceVal.color + '1A' : 'transparent',
      color: ceType === ceKey ? ceVal.color : MT,
      border: ceType === ceKey ? `1px solid ${ceVal.color}55` : '1px solid transparent',
      borderRadius: 5,
      padding: '5px 10px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontWeight: ceType === ceKey ? 700 : 400,
      fontSize: 11,
      transition: 'all .12s'
    }
  }, ceKey === 'shopworks' ? 'ShopWorks' : ceKey.charAt(0).toUpperCase() + ceKey.slice(1)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '0 10px',
      borderRight: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: handleNew,
    title: "New CE (Ctrl+N)"
  }, "+ New"), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: handleSave,
    title: "Save CE (Ctrl+S)"
  }, "Save"), /*#__PURE__*/React.createElement("span", {
    className: "shic-hide-narrow",
    title: "Keyboard shortcuts: Ctrl+S = Save  •  Ctrl+N = New CE",
    style: {fontSize:9, color:BDR, cursor:'default', userSelect:'none', letterSpacing:.3}
  }, "Ctrl+S / Ctrl+N"), /*#__PURE__*/React.createElement("button", {
    style: btn('acc', true),
    onClick: handleExport,
    title: "CE template — the standard SY3 Cost Estimate Summary layout"
  }, "Export CE"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      fontSize: 10,
      borderColor: getApiKey() && provInfo ? provInfo.bc + '88' : ERR + '88',
      color: getApiKey() && provInfo ? provInfo.bc : ERR
    },
    onClick: () => {
      setApiKeyInput('');
      setShowApiKey(true);
    },
    title: getApiKey() && provInfo ? provInfo.label + ' active' : 'No AI key - click to set'
  }, getApiKey() && provInfo ? 'AI: ' + provInfo.badge : 'Set AI Key')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginLeft: 'auto',
      paddingLeft: 12,
      borderLeft: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "shic-hide-narrow",
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 12
    }
  }, currentUser.name || currentUser.username), /*#__PURE__*/React.createElement("div", {
    style: {
      color: isAdmin ? ACC : MT,
      fontSize: 9,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, currentUser.role)), /*#__PURE__*/React.createElement(OnlinePill,null), /*#__PURE__*/React.createElement(ChangePasswordModal,{currentUser}), /*#__PURE__*/React.createElement("button", {
    onClick: onLogout,
    style: btn('danger', true)
  }, "Sign Out"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: CARD,
      borderBottom: `1px solid ${BDR}`,
      display: 'flex',
      padding: '0 16px',
      overflowX: 'auto',
      position: 'sticky',
      top: 48,
      zIndex: 49
    }
  }, TABS.map(t => {
    /* Count only rows the user actually filled in. mkMP() defaults pax to 1, so
       `r.role||r.pax` counted the blank starter row and every new CE showed a
       phantom "1" on the Manpower tab. */
    const tabCounts = {manpower: mp.filter(r=>r.role).length, tools: tools.filter(r=>r.desc).length, materials: mats.filter(r=>r.desc).length, ppe: ppe.filter(r=>r.desc).length, sowbreak: sowUnassignedCount};
    const cnt = tabCounts[t.id];
    return /*#__PURE__*/React.createElement("button", {
      key: t.id,
      onClick: () => setTab(t.id),
      style: {
        background: 'none',
        border: 'none',
        borderBottom: tab === t.id ? `2px solid ${ACC}` : '2px solid transparent',
        color: tab === t.id ? ACC : MT,
        padding: '9px 13px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: tab === t.id ? 700 : 400,
        fontSize: 12,
        whiteSpace: 'nowrap',
        transition: 'all .12s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, t.label, cnt > 0 && /*#__PURE__*/React.createElement("span", {
      title: t.id === 'sowbreak'
        ? cnt + ' resource row' + (cnt === 1 ? '' : 's') + ' not yet assigned to a scope task'
        : cnt + ' item' + (cnt === 1 ? '' : 's'),
      style: {
        background: tab === t.id ? ACC : ACC+'44',
        color: tab === t.id ? '#000' : ACC,
        fontSize: 9,
        fontWeight: 700,
        borderRadius: 8,
        padding: '1px 5px',
        lineHeight: 1.4
      }
    }, cnt));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 16,
      minWidth: 0
    }
  }, tab === 'admin' && isAdmin && /*#__PURE__*/React.createElement(AdminPanel, {
    currentUser: currentUser
  }), tab === 'sow' && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: INFO + '44'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13
    }
  }, "Scope of Work"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginTop: 2
    }
  }, "Main scope items are numbered (1,2,3...), sub-scope items are lettered (a,b,c...).")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setSowItems(p => [...p, {
      id: uid(),
      type: 'main',
      text: ''
    }])
  }, "+ Main Item"), /*#__PURE__*/React.createElement("button", {
    style: btn('info', true),
    onClick: () => setSowItems(p => [...p, {
      id: uid(),
      type: 'sub',
      text: ''
    }])
  }, "+ Sub Item"), sowItems.length > 0 && /*#__PURE__*/React.createElement("button", {
    style: btn('danger', true),
    onClick: () => {
      if (confirm('Clear all scope items?\n\nResources stay in their tabs and keep their costs, but they will all become Unassigned in the SOW Breakdown.')) {
        setSowItems([]);
        /* Drop the now-dangling task links so every row shows up as Unassigned
           rather than pointing at a task that no longer exists. */
        RES_TABS.forEach(t => t.set(p => p.map(r => r.taskId ? { ...r, taskId: '' } : r)));
        setMisc(p => { const n = { ...p }; Object.keys(n).forEach(k => { if (Array.isArray(n[k])) n[k] = n[k].map(r => r.taskId ? { ...r, taskId: '' } : r); }); return n; });
      }
    }
  }, "Clear All"))), sowItems.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '28px 0',
      color: MT,
      fontSize: 12,
      border: `1px dashed ${BDR}`,
      borderRadius: 6
    }
  }, "No items yet. Click \"+ Main Item\" to start adding scope steps."), sowItems.length > 0 && /*#__PURE__*/React.createElement("div", null, (() => {
    let mainCount = 0,
      subCount = 0,
      lastType = null;
    return sowItems.map((item, idx) => {
      if (item.type === 'main') {
        mainCount++;
        subCount = 0;
      } else {
        subCount++;
      }
      const label = item.type === 'main' ? String(mainCount) + '.' : String.fromCharCode(96 + subCount) + '.';
      const isMain = item.type === 'main';
      return /*#__PURE__*/React.createElement("div", {
        key: item.id,
        style: {
          display: 'flex',
          gap: 8,
          marginBottom: 8,
          alignItems: 'flex-start',
          paddingLeft: isMain ? 0 : 24
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          ...MONO,
          color: isMain ? TX : MT,
          fontWeight: isMain ? 700 : 400,
          fontSize: isMain ? 13 : 12,
          minWidth: 28,
          paddingTop: 7,
          flexShrink: 0,
          textAlign: 'right'
        }
      }, label), /*#__PURE__*/React.createElement("textarea", {
        style: {
          ...INP,
          flex: 1,
          height: isMain ? 44 : 38,
          resize: 'vertical',
          fontSize: isMain ? 13 : 12,
          fontWeight: isMain ? 600 : 400,
          background: isMain ? SURF : BG + '88',
          borderColor: isMain ? BDR + '88' : BDR + '44'
        },
        value: item.text,
        onChange: e => setSowItems(p => p.map(s => s.id === item.id ? {
          ...s,
          text: e.target.value
        } : s)),
        placeholder: isMain ? 'Main scope step...' : 'Sub-step detail...'
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("button", {
        title: "Move up",
        disabled: idx === 0,
        style: btn('def', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
          return a;
        })
      }, "^"), /*#__PURE__*/React.createElement("button", {
        title: "Move down",
        disabled: idx === sowItems.length - 1,
        style: btn('def', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]];
          return a;
        })
      }, "v"), item.type === 'main' && /*#__PURE__*/React.createElement("button", {
        title: "Add sub-item below",
        style: btn('info', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          a.splice(idx + 1, 0, {
            id: uid(),
            type: 'sub',
            text: ''
          });
          return a;
        })
      }, "+"), /*#__PURE__*/React.createElement("button", {
        title: "Delete",
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 4px'
        },
        onClick: () => deleteSowTask(item)
      }, "x")));
    });
  })()))),

/* ── SOW Breakdown: assign resources per scope task ── */
tab === 'sowbreak' && (() => {
  const UOMS = UOM_OPTIONS;
  const named = t => t.rows.filter(r => r[t.nameKey]);
  const _miscNamed = miscFlat().filter(r => r.desc);
  /* A row counts as unassigned if it has no task OR points at a task that no
     longer exists -- otherwise a dangling link would hide the row from both the
     task cards and the Unassigned list, making it uneditable here. */
  const validTaskIds = new Set((sowItems || []).map(s => s.id));
  const isUnassigned = r => !r.taskId || !validTaskIds.has(r.taskId);
  const totalNamed = RES_TABS.reduce((s, t) => s + named(t).length, 0) + _miscNamed.length;
  const assignedNamed = totalNamed - (RES_TABS.reduce((s, t) => s + named(t).filter(isUnassigned).length, 0) + _miscNamed.filter(isUnassigned).length);

  /* Add a row already tagged with this task. */
  const addTo = (t, taskId, fromML) => {
    if (fromML) setPicker({ type: t.ml, onSelect: item => t.set(p => [...p, t.mk(item, taskId)]) });
    else t.set(p => [...p, t.mk(null, taskId)]);
  };

  /* Copy every resource of another task onto this one. */
  const copyFrom = (srcId, dstId) => {
    RES_TABS.forEach(t => t.set(p => {
      const clones = p.filter(r => r.taskId === srcId).map(r => ({ ...r, id: uid(), taskId: dstId }));
      return clones.length ? [...p, ...clones] : p;
    }));
    setMisc(p => {
      const n = { ...p };
      Object.keys(n).forEach(k => {
        if (!Array.isArray(n[k])) return;
        const clones = n[k].filter(r => r.taskId === srcId).map(r => ({ ...r, id: uid(), taskId: dstId }));
        if (clones.length) n[k] = [...n[k], ...clones];
      });
      return n;
    });
    showToast('Resources copied.');
  };

  /* Shared cell renderers so every group lines up in the same columns. */
  const numCell = (val, onChange, title, w) => /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: w || 58 } },
    /*#__PURE__*/React.createElement("input", {
      style: { ...INP, ...MONO, width: (w || 58) - 8, fontSize: 11, padding: '2px 4px', textAlign: 'right' },
      type: 'number', min: 0, step: 'any', value: val === 0 ? '' : val, title: title, placeholder: '0',
      onChange: onChange
    }));
  const hdr = cols => /*#__PURE__*/React.createElement("thead", null,
    /*#__PURE__*/React.createElement("tr", null, cols.map((c, i) => /*#__PURE__*/React.createElement("th", {
      key: i,
      style: { ...THS, textAlign: i === 0 ? 'left' : 'right', width: c[1] || undefined, fontSize: 9, padding: '2px 4px', paddingLeft: i === 0 ? 128 : 4 }
    }, c[0]))));

  /* One resource group (Manpower / Tools / Consumables / PPE) inside a task card. */
  const group = (t, taskId) => {
    const rows = t.rows.filter(r => r.taskId === taskId);
    if (!rows.length) return null;
    const isMp = t.key === 'mp';
    const hasDays = isMp || t.key === 'tools'; /* tools are charged qty x days x cost */
    return /*#__PURE__*/React.createElement("div", { key: t.key, style: { marginBottom: 6 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', minWidth: 128 } }, t.label),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(t, taskId, true) }, "+ Masterlist"),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(t, taskId, false) }, "+ Blank"),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 10, color: MT }, title: t.label + " subtotal for this task" },
          "₱" + ph(rows.reduce((a, r) => a + rowCost(t.key, r), 0)))
      ),
      /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 2 } },
        hdr([['Item description'], [isMp ? 'Pax' : 'Qty', 58], ...(hasDays ? [['Days', 56]] : []), ...(isMp ? [] : [['UOM', 66]]), [isMp ? 'Rate' : 'Unit cost', 92], ['Cost', 92], ['', 56]]),
        /*#__PURE__*/React.createElement("tbody", null, rows.map(r =>
          /*#__PURE__*/React.createElement("tr", { key: r.id },
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, paddingLeft: 128 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' },
                value: r[t.nameKey] || '', placeholder: "Item description...",
                onChange: e => updRow(t.set, r.id, t.nameKey, e.target.value)
              })
            ),
            numCell(r[t.qtyKey] || 0, e => updRow(t.set, r.id, t.qtyKey, N(e.target.value)), isMp ? 'PAX' : 'QTY', 58),
            /* Store the raw value like the resource tabs do, so a cleared field
               is treated as 1 by resDays rather than zeroing the row. */
            hasDays && numCell(r.days === undefined || r.days === null ? 1 : r.days,
              e => updRow(t.set, r.id, 'days', e.target.value),
              isMp ? 'Number of days' : 'Days charged (1 = one-off)', 56),
            !isMp && /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 66 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: 58, fontSize: 10, padding: '2px 4px' },
                value: r.uom || '', list: "shic-uom-list", placeholder: "UOM",
                onChange: e => updRow(t.set, r.id, 'uom', e.target.value)
              })
            ),
            numCell(r[t.costKey] || 0, e => updRow(t.set, r.id, t.costKey, N(e.target.value)), isMp ? 'Daily rate' : 'Cost per unit', 92),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, width: 92, textAlign: 'right', color: MT, fontSize: 10 }, title: "Row cost (recomputed)" }, "₱" + ph(rowCost(t.key, r))),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 56, textAlign: 'right' } },
              /*#__PURE__*/React.createElement("button", {
                title: "Unassign from this task (keeps the row in the " + t.label + " tab)",
                style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 12, padding: '0 3px' },
                onClick: () => updRow(t.set, r.id, 'taskId', '')
              }, "↩"),
              /*#__PURE__*/React.createElement("button", {
                title: "Delete this row entirely",
                style: { background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 13, padding: '0 3px' },
                onClick: () => delRow(t.set, r.id)
              }, "×")
            )
          )
        ))
      )
    );
  };

  /* Miscellaneous group -- same columns, but spans the misc categories. */
  const miscGroup = taskId => {
    const rows = miscFlat().filter(r => r.taskId === taskId);
    if (!rows.length) return null;
    return /*#__PURE__*/React.createElement("div", { key: 'misc', style: { marginBottom: 6 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', minWidth: 128 } }, "Miscellaneous"),
        /*#__PURE__*/React.createElement("select", {
          style: { ...INP, width: 150, fontSize: 10, padding: '2px 4px' }, value: '',
          onChange: e => { if (e.target.value) miscAdd(e.target.value, taskId, null); }
        },
          /*#__PURE__*/React.createElement("option", { value: '' }, "+ add to category..."),
          miscCats.map(c => /*#__PURE__*/React.createElement("option", { key: c.k, value: c.k }, c.label))
        ),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 10, color: MT }, title: "Miscellaneous subtotal for this task" },
          "₱" + ph(rows.reduce((a, r) => a + rowCost('misc', r), 0)))
      ),
      /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 2 } },
        hdr([['Item description'], ['Qty', 58], ['UOM', 66], ['Unit cost', 92], ['Cost', 92], ['', 56]]),
        /*#__PURE__*/React.createElement("tbody", null, rows.map(r =>
          /*#__PURE__*/React.createElement("tr", { key: r.id },
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, paddingLeft: 128 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' },
                value: r.desc || '', placeholder: r._catLabel + " item...",
                onChange: e => miscUpd(r._cat, r.id, 'desc', e.target.value)
              })
            ),
            numCell(r.qty || 0, e => miscUpd(r._cat, r.id, 'qty', N(e.target.value)), 'QTY', 58),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 66 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: 58, fontSize: 10, padding: '2px 4px' },
                value: r.uom || '', list: "shic-uom-list", placeholder: "UOM",
                onChange: e => miscUpd(r._cat, r.id, 'uom', e.target.value)
              })
            ),
            numCell(r.cost || 0, e => miscUpd(r._cat, r.id, 'cost', N(e.target.value)), 'Cost per unit', 92),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, width: 92, textAlign: 'right', color: MT, fontSize: 10 } }, "₱" + ph(rowCost('misc', r))),
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 56, textAlign: 'right' } },
              /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, color: MT, marginRight: 4 }, title: "Miscellaneous category" }, r._catLabel),
              /*#__PURE__*/React.createElement("button", {
                title: "Unassign from this task (keeps the row in the Miscellaneous tab)",
                style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 12, padding: '0 3px' },
                onClick: () => miscUpd(r._cat, r.id, 'taskId', '')
              }, "↩"),
              /*#__PURE__*/React.createElement("button", {
                title: "Delete this row entirely",
                style: { background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 13, padding: '0 3px' },
                onClick: () => miscDel(r._cat, r.id)
              }, "×")
            )
          )
        ))
      )
    );
  };

  /* Empty groups collapse into one "Add:" line so a task card stays compact. */
  const addLine = taskId => {
    const emptyTabs = RES_TABS.filter(t => !t.rows.some(r => r.taskId === taskId));
    const miscEmpty = !miscFlat().some(r => r.taskId === taskId);
    if (!emptyTabs.length && !miscEmpty) return null;
    return /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 4, paddingTop: 5, borderTop: `1px dashed ${BDR}` } },
      /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: MT, minWidth: 30 } }, "Add:"),
      /* Adds a blank row so the group appears immediately -- from there the
         group header offers "+ Masterlist" too. Going straight to the picker
         here would strand the user if they cancelled it. */
      emptyTabs.map(t => /*#__PURE__*/React.createElement("button", {
        key: t.key, style: { ...btn('def', true), fontSize: 10 },
        title: "Add a " + t.label + " row to this task",
        onClick: () => addTo(t, taskId, false)
      }, "+ " + t.label)),
      miscEmpty && /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 140, fontSize: 10, padding: '2px 4px' }, value: '',
        onChange: e => { if (e.target.value) miscAdd(e.target.value, taskId, null); }
      },
        /*#__PURE__*/React.createElement("option", { value: '' }, "+ Miscellaneous..."),
        miscCats.map(c => /*#__PURE__*/React.createElement("option", { key: c.k, value: c.k }, c.label))
      )
    );
  };

  /* ── Bulk assign ── */
  const selKey = (kind, key, id) => kind + ':' + key + ':' + id;
  const selCount = Object.keys(sbSel).length;
  const toggleSel = (kind, key, id, on) => setSbSel(p => {
    const n = { ...p }, k = selKey(kind, key, id);
    if (on) n[k] = { kind, key, id }; else delete n[k];
    return n;
  });
  const bulkAssign = taskId => {
    Object.values(sbSel).forEach(d => {
      if (d.kind === 'res') { const t = RES_TABS.find(x => x.key === d.key); if (t) updRow(t.set, d.id, 'taskId', taskId); }
      else miscUpd(d.key, d.id, 'taskId', taskId);
    });
    showToast(selCount + ' row' + (selCount === 1 ? '' : 's') + ' assigned.');
    setSbSel({});
  };

  const q = sbSearch.trim().toLowerCase();
  const matches = txt => !q || String(txt || '').toLowerCase().includes(q);
  const unassigned = RES_TABS.map(t => ({ t, rows: t.rows.filter(r => isUnassigned(r) && r[t.nameKey] && matches(r[t.nameKey])) })).filter(x => x.rows.length);
  const unassignedMisc = miscFlat().filter(r => isUnassigned(r) && r.desc && matches(r.desc));
  const shownUnassigned = unassigned.reduce((s, x) => s + x.rows.length, 0) + unassignedMisc.length;
  const allShown = [].concat(
    ...unassigned.map(x => x.rows.map(r => ({ kind: 'res', key: x.t.key, id: r.id }))),
    unassignedMisc.map(r => ({ kind: 'misc', key: r._cat, id: r.id }))
  );
  const allSelected = shownUnassigned > 0 && allShown.every(d => sbSel[selKey(d.kind, d.key, d.id)]);

  const taskOptions = (sowItems || []).map(it => /*#__PURE__*/React.createElement("option", { key: it.id, value: it.id }, (sowLabels[it.id] || '') + "  " + (it.text || '(untitled)').slice(0, 60)));

  /* One row in the Unassigned list. */
  const unRow = (d, name, qty, uom, onAssign) => /*#__PURE__*/React.createElement("tr", { key: d.id },
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 26, textAlign: 'center' } },
      /*#__PURE__*/React.createElement("input", {
        type: 'checkbox', checked: !!sbSel[selKey(d.kind, d.key, d.id)],
        onChange: e => toggleSel(d.kind, d.key, d.id, e.target.checked)
      })
    ),
    /*#__PURE__*/React.createElement("td", { style: TDS }, name),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, width: 58, textAlign: 'right', color: MT } }, qty || ''),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 66, color: MT, fontSize: 10 } }, uom || ''),
    /*#__PURE__*/React.createElement("td", { style: { ...TDS, width: 230 } },
      /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' }, value: '',
        onChange: e => { if (e.target.value) onAssign(e.target.value); }
      }, /*#__PURE__*/React.createElement("option", { value: '' }, "— assign to task —"), taskOptions)
    )
  );

  return /*#__PURE__*/React.createElement("div", null,
    /* Shared UOM suggestions for every input in this tab */
    /*#__PURE__*/React.createElement("datalist", { id: "shic-uom-list" }, UOMS.map(u => /*#__PURE__*/React.createElement("option", { key: u, value: u }))),

    /* Intro / status */
    /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: INFO + '44', marginBottom: 10 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("div", { style: { minWidth: 240, flex: 1 } },
          /*#__PURE__*/React.createElement("div", { style: { fontWeight: 700, fontSize: 13 } }, "SOW Breakdown"),
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 11, marginTop: 2 } },
            "Assign the manpower, tools, consumables, PPE and miscellaneous items each scope task needs. Edits here change the resource tabs directly — this is the same data, grouped by task.")
        ),
        (sowItems || []).length > 1 && /*#__PURE__*/React.createElement("button", {
          style: { ...btn('def', true), fontSize: 10 },
          onClick: () => {
            const allOpen = (sowItems || []).every(it => !sbCollapsed[it.id]);
            const n = {};
            if (allOpen) (sowItems || []).forEach(it => { n[it.id] = true; });
            setSbCollapsed(n);
          }
        }, (sowItems || []).every(it => !sbCollapsed[it.id]) ? "Collapse all" : "Expand all"),
        /*#__PURE__*/React.createElement("div", { style: { textAlign: 'right' } },
          /*#__PURE__*/React.createElement("div", { style: { ...MONO, fontSize: 15, fontWeight: 700, color: assignedNamed === totalNamed && totalNamed > 0 ? OK : ACC } }, assignedNamed + " / " + totalNamed),
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 10 } }, "resources assigned")
        )
      )
    ),

    /* No scope yet */
    (sowItems || []).length === 0 && /*#__PURE__*/React.createElement("div", { style: { ...CS, textAlign: 'center', color: MT, fontSize: 12 } },
      /*#__PURE__*/React.createElement("div", { style: { marginBottom: 8 } }, "No scope tasks yet — add them in the Scope of Work tab first."),
      /*#__PURE__*/React.createElement("button", { style: btn('acc', true), onClick: () => setTab('sow') }, "Go to Scope of Work")
    ),

    /* One card per scope task */
    (sowItems || []).map(it => {
      const n = taskResCount(it.id);
      const cost = taskCost(it.id);
      const grp = sowTaskGroup(it);
      const hasSubs = grp.length > 1;
      const rollN = hasSubs ? taskResCountRollup(it) : n;
      const rollCost = hasSubs ? taskCostRollup(it) : cost;
      const open = !sbCollapsed[it.id];
      const others = (sowItems || []).filter(o => o.id !== it.id && taskResCount(o.id) > 0);
      return /*#__PURE__*/React.createElement("div", {
        key: it.id,
        style: { ...CS, marginBottom: 8, borderColor: rollN ? OK + '33' : BDR, marginLeft: it.type === 'sub' ? 18 : 0, padding: open ? undefined : '8px 12px' }
      },
        /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: open ? 8 : 0 } },
          /*#__PURE__*/React.createElement("button", {
            title: open ? "Collapse" : "Expand",
            style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11, padding: 0, width: 14 },
            onClick: () => setSbCollapsed(p => ({ ...p, [it.id]: open }))
          }, open ? "▾" : "▸"),
          /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: ACC, fontWeight: 700, fontSize: 12 } }, sowLabels[it.id] || ''),
          /*#__PURE__*/React.createElement("span", {
            style: { fontWeight: it.type === 'main' ? 700 : 400, fontSize: it.type === 'main' ? 12 : 11.5, cursor: 'pointer' },
            onClick: () => setSbCollapsed(p => ({ ...p, [it.id]: open }))
          }, it.text || /*#__PURE__*/React.createElement("i", { style: { color: MT } }, "(untitled task)")),
          /*#__PURE__*/React.createElement("span", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 } },
            /* Collapsed cards hide the note, so flag that one exists. */
            String(it.note || '').trim() && /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: INFO }, title: String(it.note).trim() }, "📝"),
            rollCost > 0 && /*#__PURE__*/React.createElement("span", { style: { ...MONO, fontSize: 11, fontWeight: 700, color: ACC },
              title: hasSubs ? "Total cost of this task and its " + (grp.length - 1) + " sub-task" + (grp.length === 2 ? '' : 's')
                             : "Total cost of the resources assigned to this task" }, "₱" + ph(rollCost)),
            /* When a parent carries resources of its own, show them separately so
               the rolled-up figure above is never mistaken for its own line items. */
            hasSubs && cost > 0 && /*#__PURE__*/React.createElement("span", { style: { ...MONO, fontSize: 10, color: MT }, title: "Charged directly to this task, before its sub-tasks" }, "(own ₱" + ph(cost) + ")"),
            /*#__PURE__*/React.createElement("span", {
              style: { fontSize: 10, color: rollN ? OK : MT, background: (rollN ? OK : MT) + '18', borderRadius: 8, padding: '1px 7px', whiteSpace: 'nowrap' },
              title: hasSubs ? "Resource rows on this task and its sub-tasks" : undefined
            }, rollN ? rollN + " resource" + (rollN === 1 ? '' : 's') + (hasSubs ? " incl. sub-tasks" : '') : "no resources"),
            open && others.length > 0 && /*#__PURE__*/React.createElement("select", {
              style: { ...INP, width: 132, fontSize: 10, padding: '2px 4px' }, value: '',
              title: "Copy all resources from another task into this one",
              onChange: e => { if (e.target.value) copyFrom(e.target.value, it.id); }
            },
              /*#__PURE__*/React.createElement("option", { value: '' }, "copy from..."),
              others.map(o => /*#__PURE__*/React.createElement("option", { key: o.id, value: o.id }, (sowLabels[o.id] || '') + "  " + (o.text || '(untitled)').slice(0, 40)))
            )
          )
        ),
        open && RES_TABS.map(t => group(t, it.id)),
        open && miscGroup(it.id),
        open && addLine(it.id),

        /* Why this task is broken down the way it is. Kept on the scope item
           itself so it travels with the task -- copy, reorder and delete all
           carry it -- and printed with the CE notes so the reviewer sees the
           reasoning next to the number it explains. */
        open && /*#__PURE__*/React.createElement("div", { style: { marginTop: 10, borderTop: `1px solid ${BDR}`, paddingTop: 8 } },
          /*#__PURE__*/React.createElement("div", { style: { ...LBL, marginBottom: 4 } }, "Breakdown note"),
          /*#__PURE__*/React.createElement("textarea", {
            style: { ...INP, height: 46, resize: 'vertical', fontSize: 11.5 },
            value: it.note || '',
            placeholder: "How this task was costed — assumptions, crew mix, why the quantities are what they are...",
            onChange: e => { const v = e.target.value; setSowItems(p => p.map(s => s.id === it.id ? { ...s, note: v } : s)); }
          }),
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 10, marginTop: 3 } },
            "Appears in Notes / Remarks and on the printed CE, labelled ", /*#__PURE__*/React.createElement("b", null, "Scope " + (sowLabels[it.id] || '')), ".")
        )
      );
    }),

    /* Unassigned rows — existing CEs start here, and this is how you file them */
    (sowUnassignedCount > 0) && /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: '#F59E0B44', marginTop: 12 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 } },
        /*#__PURE__*/React.createElement("div", { style: { fontWeight: 700, fontSize: 12 } }, "Unassigned resources"),
        /*#__PURE__*/React.createElement("input", {
          style: { ...INP, width: 190, fontSize: 11, padding: '3px 8px', marginLeft: 'auto' },
          value: sbSearch, placeholder: "Filter by description...",
          onChange: e => setSbSearch(e.target.value)
        }),
        sbSearch && /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => setSbSearch('') }, "✕")
      ),
      /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 11, marginBottom: 8 } },
        "These are costed in the totals but not linked to a scope task. Tick several and assign them in one go — they will then be removed together with that task."),

      /* Bulk bar */
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, padding: '6px 8px', background: SURF, borderRadius: 6 } },
        /*#__PURE__*/React.createElement("label", { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', userSelect: 'none' } },
          /*#__PURE__*/React.createElement("input", {
            type: 'checkbox', checked: allSelected,
            onChange: e => setSbSel(() => {
              if (!e.target.checked) return {};
              const n = {};
              allShown.forEach(d => { n[selKey(d.kind, d.key, d.id)] = d; });
              return n;
            })
          }),
          "Select all" + (sbSearch ? " shown (" + shownUnassigned + ")" : "")
        ),
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: selCount ? ACC : MT, fontWeight: selCount ? 700 : 400 } }, selCount + " selected"),
        /*#__PURE__*/React.createElement("select", {
          style: { ...INP, width: 230, fontSize: 11, padding: '2px 6px', marginLeft: 'auto', opacity: selCount ? 1 : .5 },
          value: '', disabled: !selCount,
          onChange: e => { if (e.target.value) bulkAssign(e.target.value); }
        }, /*#__PURE__*/React.createElement("option", { value: '' }, selCount ? "— assign " + selCount + " selected to... —" : "— select rows first —"), taskOptions),
        selCount > 0 && /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => setSbSel({}) }, "Clear")
      ),

      shownUnassigned === 0 && /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 11, fontStyle: 'italic' } }, "Nothing matches \"" + sbSearch + "\"."),

      unassigned.map(({ t, rows }) => /*#__PURE__*/React.createElement("div", { key: t.key, style: { marginBottom: 8 } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 } }, t.label + " (" + rows.length + ")"),
        /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
          /*#__PURE__*/React.createElement("tbody", null, rows.map(r =>
            unRow({ kind: 'res', key: t.key, id: r.id }, r[t.nameKey], N(r[t.qtyKey]), t.key === 'mp' ? 'PAX/S' : r.uom,
              v => updRow(t.set, r.id, 'taskId', v))
          ))
        )
      )),

      unassignedMisc.length > 0 && /*#__PURE__*/React.createElement("div", { style: { marginBottom: 8 } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 } }, "Miscellaneous (" + unassignedMisc.length + ")"),
        /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
          /*#__PURE__*/React.createElement("tbody", null, unassignedMisc.map(r =>
            unRow({ kind: 'misc', key: r._cat, id: r.id }, r.desc, N(r.qty), r.uom,
              v => miscUpd(r._cat, r.id, 'taskId', v))
          ))
        )
      )
    )
  );
})(),
tab === 'scopelib' && /*#__PURE__*/React.createElement(ScopeLibraryEditor, null),
tab === 'masterlist' && /*#__PURE__*/React.createElement(MlEditor, null),
tab === 'history' && /*#__PURE__*/React.createElement(HistPanel, null),

/* ── Attachment Panel Modal ── */
attachPanel && /*#__PURE__*/React.createElement("div", {
  style:{position:'fixed',inset:0,background:'#000b',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'},
  onClick:()=>setAttachPanel(null)
}, /*#__PURE__*/React.createElement("div", {
  style:{background:CARD,border:`1px solid ${BDR}`,borderRadius:10,padding:24,minWidth:420,maxWidth:560,maxHeight:'80vh',overflowY:'auto'},
  onClick:e=>e.stopPropagation()
},
  /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}},
    /*#__PURE__*/React.createElement("div", null,
      /*#__PURE__*/React.createElement("b", {style:{fontSize:14}}, "📎 Attachments"),
      /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT,marginLeft:8}},
        (()=>{ const e=sortedHistory.find(x=>x.id===attachPanel); return e?.info?.ceNum||''; })()
      )
    ),
    /*#__PURE__*/React.createElement("button", {style:btn('def',true), onClick:()=>setAttachPanel(null)}, "✕ Close")
  ),
  !monSpIds.has(String(attachPanel)) && /*#__PURE__*/React.createElement("div", {
    style:{background:ERR+'22',border:`1px solid ${ERR}44`,borderRadius:6,padding:'10px 14px',fontSize:12,color:ERR,marginBottom:12}
  }, "⚠ This CE has no SharePoint monitoring record yet. Fill in any monitoring field (e.g. Status) and save first to enable attachments."),
  monSpIds.has(String(attachPanel)) && /*#__PURE__*/React.createElement("div", null,
    /*#__PURE__*/React.createElement("label", {
      style:{...btn('info',true),cursor:'pointer',marginBottom:12,display:'inline-flex',alignItems:'center',gap:6}
    }, attachBusy ? '⏳ Uploading…' : '⬆ Upload Files',
      /*#__PURE__*/React.createElement("input", {
        type:'file', multiple:true, style:{display:'none'},
        disabled:attachBusy,
        onChange: e => {
          const ceId = attachPanel;
          const ceNum = (sortedHistory.find(x=>x.id===ceId)?.info?.ceNum)||'';
          handleAttachUpload(ceId, ceNum, e.target.files);
          e.target.value='';
        }
      })
    ),
    attachBusy && /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT,marginLeft:8}}, "Please wait…"),
    attachList.length === 0 && !attachBusy && /*#__PURE__*/React.createElement("div", {
      style:{textAlign:'center',padding:'20px 0',color:MT,fontSize:12,border:`1px dashed ${BDR}`,borderRadius:6}
    }, "No attachments yet. Upload drawings, TOR, or other documents."),
    attachList.length > 0 && /*#__PURE__*/React.createElement("div", {style:{marginTop:8,display:'flex',flexDirection:'column',gap:6}},
      attachList.map(f => /*#__PURE__*/React.createElement("div", {
        key:f.FileName,
        style:{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:SURF,borderRadius:6,border:`1px solid ${BDR}`}
      },
        /*#__PURE__*/React.createElement("span", {style:{fontSize:18,flexShrink:0}},
          f.FileName.match(/\.(pdf)$/i) ? '📄' :
          f.FileName.match(/\.(dwg|dxf|dwf)$/i) ? '📐' :
          f.FileName.match(/\.(xlsx?|csv)$/i) ? '📊' :
          f.FileName.match(/\.(docx?|txt)$/i) ? '📝' :
          f.FileName.match(/\.(jpe?g|png|gif|webp)$/i) ? '🖼' : '📎'
        ),
        /*#__PURE__*/React.createElement("a", {
          href: f.ServerRelativeUrl,
          target:'_blank', rel:'noopener noreferrer',
          style:{flex:1,fontSize:12,color:INFO,wordBreak:'break-all',textDecoration:'none'}
        }, f.FileName),
        /*#__PURE__*/React.createElement("button", {
          style:{...btn('danger',true),fontSize:10,padding:'2px 6px',flexShrink:0},
          disabled:attachBusy,
          onClick:()=>handleAttachDelete(attachPanel, f.FileName)
        }, "✕")
      ))
    )
  )
)),

/* ── Feature 3: Revision Diff Modal ── */
diffModal && /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'},onClick:()=>setDiffModal(null)},
  /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:24,minWidth:480,maxWidth:640,maxHeight:'80vh',overflowY:'auto'},onClick:e=>e.stopPropagation()},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}},
      /*#__PURE__*/React.createElement("b", null, "⚖ Revision Comparison"),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setDiffModal(null)}, "✕ Close")),
    diffModal.base ? /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
      /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null,
        /*#__PURE__*/React.createElement("th", {style:THS}, "Section"),
        /*#__PURE__*/React.createElement("th", {style:{...THS,color:INFO}}, "Base: "+diffModal.base.info?.ceNum),
        /*#__PURE__*/React.createElement("th", {style:{...THS,color:ACC}}, "Revision: "+diffModal.rev.info?.ceNum),
        /*#__PURE__*/React.createElement("th", {style:THS}, "Δ Change"))),
      /*#__PURE__*/React.createElement("tbody", null, [
        ['Manpower','mpTot'],['Tools','toolsT'],['Materials','matsT'],['PPE','ppeT'],['Misc','miscT'],['Grand Total','grand']
      ].map(([label, key]) => {
        const bv = N(diffModal.base[key]||0), rv = N(diffModal.rev[key]||0), delta = rv - bv;
        return /*#__PURE__*/React.createElement("tr", {key:label},
          /*#__PURE__*/React.createElement("td", {style:TDS}, label),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right'}}, "P"+ph(bv)),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right'}}, "P"+ph(rv)),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:delta>0?ERR:delta<0?OK:MT}},
            (delta>=0?'+':'')+ph(delta)));
      }))) :
      /*#__PURE__*/React.createElement("div", {style:{color:MT,padding:16,textAlign:'center'}}, "No base CE found to compare against.")),
  ),

/* ── Feature 11: E-Signature Modal ── */
sigModal && /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000b',zIndex:3100,display:'flex',alignItems:'center',justifyContent:'center'},onClick:()=>setSigModal(null)},
  /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid #A78BFA',borderRadius:10,padding:20,width:460},onClick:e=>e.stopPropagation()},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}},
      /*#__PURE__*/React.createElement("b", null, "✍ Signature — ", sigModal.name||sigModal.role),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setSigModal(null)}, "✕")),
    /*#__PURE__*/React.createElement("div", {style:{background:'#fff',borderRadius:6,marginBottom:10,overflow:'hidden',border:'1px solid #ccc'}},
      /*#__PURE__*/React.createElement("canvas", {
        id:'sigCanvas', width:420, height:140, style:{display:'block',cursor:'crosshair'},
        ref: el => {
          if(!el||el.__sigReady) return; el.__sigReady=true;
          const ctx=el.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,420,140);
          ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
          let drawing=false;
          const pos=e=>{const r=el.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};};
          el.onmousedown=el.ontouchstart=e=>{e.preventDefault();drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);};
          el.onmousemove=el.ontouchmove=e=>{e.preventDefault();if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();};
          el.onmouseup=el.ontouchend=()=>{drawing=false;};
          if(signatures[sigModal.id]){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0);img.src=signatures[sigModal.id];}
        }
      })),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8}},
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>{const el=document.getElementById('sigCanvas');const ctx=el.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,420,140);}}, "🗑 Clear"),
      /*#__PURE__*/React.createElement("button", {style:{...btn('ok'),flex:1},onClick:()=>{
        const el=document.getElementById('sigCanvas');
        setSignatures(p=>({...p,[sigModal.id]:el.toDataURL('image/png')}));
        setSigModal(null); showToast('Signature saved.');
      }}, "💾 Save Signature")))),

/* ── Feature 9: Dashboard Tab ── */
tab === 'dashboard' && (() => {
  const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();
  const monthHist = history.filter(h => { const d=new Date(h.savedAt||h.createdAt||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; });
  const totalThis = monthHist.reduce((s,h)=>s+N(h.grand||0),0);
  const avgVal = history.length ? history.reduce((s,h)=>s+N(h.grand||0),0)/history.length : 0;
  const statuses = history.map(h=>(monData[h.id]||{}).status||'Draft');
  const statusCount = statuses.reduce((m,s)=>{m[s]=(m[s]||0)+1;return m;},{});
  const clients = {}; history.forEach(h=>{const c=h.info?.client||h.client||'Unknown';clients[c]=(clients[c]||{count:0,total:0});clients[c].count++;clients[c].total+=N(h.grand||0);});
  const top5 = Object.entries(clients).sort((a,b)=>b[1].total-a[1].total).slice(0,5);
  const prefixMap = {}; history.forEach(h=>{const cn=(h.info?.ceNum||'').toUpperCase();const pfx=cn.split('-CE-')[0]||'?';prefixMap[pfx]=(prefixMap[pfx]||{count:0,total:0});prefixMap[pfx].count++;prefixMap[pfx].total+=N(h.grand||0);});
  const months=[]; for(let i=5;i>=0;i--){const d=new Date(thisYear,thisMonth-i,1);months.push({label:d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2),month:d.getMonth(),year:d.getFullYear()});}
  const monthTotals = months.map(m=>({...m,total:history.filter(h=>{const d=new Date(h.savedAt||0);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).reduce((s,h)=>s+N(h.grand||0),0)}));
  const maxBar = Math.max(...monthTotals.map(m=>m.total),1);
  const kpiCard = (label,value,color) => /*#__PURE__*/React.createElement("div",{style:{background:SURF,border:'1px solid '+BDR,borderRadius:8,padding:'14px 18px',flex:1,minWidth:140}},
    /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:4}},label),
    /*#__PURE__*/React.createElement("div",{style:{fontSize:20,fontWeight:800,color:color||TX,...MONO}},value));
  return /*#__PURE__*/React.createElement("div",{style:{padding:'0 0 24px'}},
    /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:15,marginBottom:16,color:ACC}}, "📊 Dashboard"),
    /* KPI row */
    /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}},
      kpiCard('CEs This Month', monthHist.length, INFO),
      kpiCard('Value This Month', '₱'+ph(totalThis), OK),
      kpiCard('Avg CE Value', '₱'+ph(avgVal), ACC),
      kpiCard('Total CEs', history.length, MT)),
    /* Monthly trend */
    /*#__PURE__*/React.createElement("div",{style:{...CS,marginBottom:16}},
      /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:12,fontSize:12}}, "📈 Monthly Trend (Last 6 Months)"),
      /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:8,alignItems:'flex-end',height:80}},
        monthTotals.map(m => {
          const pct = maxBar>0?(m.total/maxBar):0;
          return /*#__PURE__*/React.createElement("div",{key:m.label,style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}},
            /*#__PURE__*/React.createElement("div",{style:{fontSize:9,color:MT,...MONO}}, m.total>0?'₱'+ph(m.total):'—'),
            /*#__PURE__*/React.createElement("div",{style:{width:'100%',background:ACC+(m.total>0?'cc':'22'),borderRadius:'3px 3px 0 0',height:Math.max(4,pct*60)+'px',transition:'height .3s'}}),
            /*#__PURE__*/React.createElement("div",{style:{fontSize:9,color:MT,whiteSpace:'nowrap'}},m.label));
        }))),
    /* Bottom row: by company + by status + top clients */
    /*#__PURE__*/React.createElement("div",{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,flexWrap:'wrap'}},
      /* By company */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏢 By Company Prefix"),
        Object.entries(prefixMap).map(([pfx,d])=>/*#__PURE__*/React.createElement("div",{key:pfx,style:{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}},
          /*#__PURE__*/React.createElement("span",{style:{color:INFO,fontWeight:600}},pfx),
          /*#__PURE__*/React.createElement("span",{style:{color:MT}},d.count,' CE · '),
          /*#__PURE__*/React.createElement("span",{style:{...MONO,fontSize:11}}, '₱'+ph(d.total))))),
      /* By status */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏷 By Status"),
        Object.entries(statusCount).sort((a,b)=>b[1]-a[1]).map(([s,c])=>/*#__PURE__*/React.createElement("div",{key:s,style:{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}},
          /*#__PURE__*/React.createElement("span",null,s),
          /*#__PURE__*/React.createElement("span",{style:{background:ACC+'33',color:ACC,borderRadius:4,padding:'0 6px',fontWeight:700}},c)))),
      /* Top clients */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏆 Top 5 Clients"),
        top5.map(([name,d],i)=>/*#__PURE__*/React.createElement("div",{key:name,style:{marginBottom:6,fontSize:11}},
          /*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between'}},
            /*#__PURE__*/React.createElement("span",{style:{color:i===0?ACC:TX}}, (i+1)+'. '+name),
            /*#__PURE__*/React.createElement("span",{style:{color:MT}},d.count,' CE')),
          /*#__PURE__*/React.createElement("div",{style:{...MONO,fontSize:10,color:OK}},'₱'+ph(d.total)))))));
})(), tab === 'info' && /*#__PURE__*/React.createElement("div", null, companies.length === 0 && /*#__PURE__*/React.createElement("div", {style: {margin: '0 0 14px 0', padding: '12px 16px', background: '#F8514920', border: '1px solid #F85149', borderRadius: 8, color: ERR, fontSize: 12, fontWeight: 600}}, "⚠ No companies configured. Go to the Admin → Users tab and set up at least one company before creating a CE."), /*#__PURE__*/React.createElement("div", {
    style: CS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 14,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: MT
    }
  }, "Project Details"), /*#__PURE__*/React.createElement("div", {
    style: {marginBottom: 16, padding: '12px 14px', background: '#A78BFA11', borderRadius: 8, border: '2px solid #A78BFA44', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'}
  }, /*#__PURE__*/React.createElement("div", {style: {flex: 1, minWidth: 200}},
    /*#__PURE__*/React.createElement("label", {style: {...LBL, color: '#A78BFA', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em'}}, "🏢 Issuing Company"),
    /*#__PURE__*/React.createElement("select", {
      style: INP,
      value: info.companyId != null ? info.companyId : (companies[0]||{}).id || '',
      onChange: e => {
        const rawId = e.target.value === '' ? null : (isNaN(e.target.value) ? e.target.value : Number(e.target.value));
        const selCo = companies.find(c => String(c.id) === String(rawId)) || companies[0];
        setInfo(p => {
          const pfx = ((selCo?.cePrefix || 'SHIC') + '-CE-').toUpperCase();
          const isDefault = !p.ceNum || p.ceNum.toUpperCase().startsWith(pfx) || /^[A-Z0-9]+-CE-\d{4}-\d+$/i.test(p.ceNum);
          const newCeNum = isDefault ? nextCeNumForCompany(history, selCo) : p.ceNum;
          return {...p, companyId: rawId, ceNum: newCeNum};
        });
      }
    }, companies.map(c => /*#__PURE__*/React.createElement("option", {key: c.id, value: c.id}, c.name + (c.sub ? ' — ' + c.sub : ''))))
  ), (() => {
    const selCo = companies.find(c => String(c.id) === String(info.companyId != null ? info.companyId : (companies[0]||{}).id)) || companies[0] || {};
    return /*#__PURE__*/React.createElement("div", {style: {display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}},
      selCo.logo && /*#__PURE__*/React.createElement("img", {src: selCo.logo, style: {maxWidth: 64, maxHeight: 32, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 3, border: `1px solid ${BDR}`}}),
      /*#__PURE__*/React.createElement("div", {style: {fontSize: 11, color: MT, lineHeight: 1.5}},
        /*#__PURE__*/React.createElement("div", null, "CE Prefix: ", /*#__PURE__*/React.createElement("b", {style: {color: TX}}, selCo.cePrefix || 'SHIC'), " → ", /*#__PURE__*/React.createElement("b", {style: {color: '#A78BFA'}}, (selCo.cePrefix||'SHIC')+'-CE-'+new Date().getFullYear()+'-XXXX')),
        /*#__PURE__*/React.createElement("div", null, "Doc No: ", /*#__PURE__*/React.createElement("b", {style: {color: TX}}, selCo.docNo || '—'), "  Rev: ", /*#__PURE__*/React.createElement("b", {style: {color: TX}}, selCo.revNo || '0'))
      )
    );
  })()), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "CE Number"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.ceNum,
    onChange: e => setInfo(p => ({
      ...p,
      ceNum: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Date"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      colorScheme: 'dark'
    },
    type: "date",
    value: info.date,
    onChange: e => setInfo(p => ({
      ...p,
      date: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Client Name"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.client,
    onChange: e => setInfo(p => ({
      ...p,
      client: e.target.value
    })),
    placeholder: "Client name"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Client Location"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.location,
    onChange: e => setInfo(p => ({
      ...p,
      location: e.target.value
    })),
    placeholder: "Site location"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Project Description / Scope Summary"), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...INP,
      height: 66,
      resize: 'vertical'
    },
    value: info.description,
    onChange: e => setInfo(p => ({
      ...p,
      description: e.target.value
    })),
    placeholder: "Brief scope description..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Discipline"), /*#__PURE__*/React.createElement("select", {
    style: INP,
    value: info.projType,
    onChange: e => setInfo(p => ({
      ...p,
      projType: e.target.value
    }))
  }, /*#__PURE__*/React.createElement("option", {
    value: "Electrical"
  }, "Electrical"), /*#__PURE__*/React.createElement("option", {
    value: "Mechanical"
  }, "Mechanical"), /*#__PURE__*/React.createElement("option", {
    value: "Civil"
  }, "Civil"), /*#__PURE__*/React.createElement("option", {
    value: "General"
  }, "General"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Department"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.dept,
    onChange: e => setInfo(p => ({
      ...p,
      dept: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Status"), /*#__PURE__*/React.createElement("select", {
    style: INP,
    value: info.status,
    onChange: e => setInfo(p => ({
      ...p,
      status: e.target.value
    }))
  }, ['FOR REVIEW', 'APPROVED', 'REJECTED', 'REVISED', 'DRAFT'].map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Material"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.material,
    onChange: e => setInfo(p => ({
      ...p,
      material: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Quantity (for unit price)"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      ...MONO
    },
    type: "number",
    min: 1,
    value: info.qty,
    onChange: e => setInfo(p => ({
      ...p,
      qty: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "No. of Days"), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      ...MONO
    },
    type: "number",
    min: 1,
    value: info.days,
    onChange: e => setInfo(p => ({
      ...p,
      days: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "Attention"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.attention,
    onChange: e => setInfo(p => ({
      ...p,
      attention: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "End User"), /*#__PURE__*/React.createElement("input", {
    style: INP,
    value: info.endUser,
    onChange: e => setInfo(p => ({
      ...p,
      endUser: e.target.value
    }))
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: INFO + '44'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 12,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: INFO
    }
  }, "Client Document"), !docFile ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: `2px dashed ${BDR}`,
      borderRadius: 8,
      padding: '26px 20px',
      textAlign: 'center',
      cursor: 'pointer',
      background: SURF
    },
    onClick: () => fileRef.current?.click(),
    onDragOver: e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = INFO;
    },
    onDragLeave: e => e.currentTarget.style.borderColor = BDR,
    onDrop: e => {
      e.preventDefault();
      e.currentTarget.style.borderColor = BDR;
      const f = e.dataTransfer.files[0];
      if (f) handleDocUpload(f);
    }
  }, docBusy ? /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "spin",
    style: {
      fontSize: 20
    }
  }, "+"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 8
    }
  }, "Reading document...")) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 26,
      marginBottom: 8
    }
  }, "Docs"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: TX,
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 4
    }
  }, "Drop file here or click to browse"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "PDF - Word (.docx) - Excel (.xlsx) - Text (.txt)"))) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 12px',
      background: SURF,
      borderRadius: 8,
      border: `1px solid ${BDR}`,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 13,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, docFile.name), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      marginTop: 2
    }
  }, docFile.size > 0 ? Math.round(docFile.size / 1024) + ' KB - ' : '', docFile.text ? docFile.text.split(/\s+/).filter(Boolean).length.toLocaleString() + ' words' : 'reference only', docFile.spUrl && /*#__PURE__*/React.createElement(React.Fragment, null, " - ", /*#__PURE__*/React.createElement("a", {
    href: SITE_URL + docFile.spUrl,
    target: "_blank",
    style: {
      color: INFO,
      textDecoration: 'none'
    }
  }, "SharePoint link")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5,
      flexShrink: 0
    }
  }, docFile.text && /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setDocPreview(p => !p)
  }, docPreview ? 'Hide' : 'Preview'), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => fileRef.current?.click()
  }, "Replace"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: ERR,
      cursor: 'pointer',
      fontSize: 16,
      padding: '1px 5px'
    },
    onClick: () => {
      setDocFile(null);
      setDocPreview(false);
    }
  }, "x"))), docPreview && docFile.text && /*#__PURE__*/React.createElement("div", {
    style: {
      background: SURF,
      border: `1px solid ${BDR}`,
      borderRadius: 6,
      padding: 10,
      maxHeight: 150,
      overflowY: 'auto',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("pre", {
    style: {
      color: MT,
      fontSize: 10,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
      ...MONO
    }
  }, docFile.text.slice(0, 3000), docFile.text.length > 3000 ? '\n...[truncated]' : '')), docFile.text && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, !getApiKey() && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      background: ERR + '15',
      border: `1px solid ${ERR}44`,
      borderRadius: 6,
      padding: '7px 12px',
      color: ERR,
      fontSize: 11
    }
  }, "No AI key. Click \"Set AI Key\" in the top bar - Gemini, Groq & Kimi are free."), /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: extractDocInfo,
    disabled: docBusy || !getApiKey()
  }, docBusy ? 'Extracting...' : 'Extract Info with AI'), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "Auto-fills client, location, scope and more"))), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: ".pdf,.docx,.xlsx,.xls,.txt,.csv",
    style: {
      display: 'none'
    },
    onChange: e => {
      const f = e.target.files[0];
      if (f) handleDocUpload(f);
      e.target.value = '';
    }
  })), /*#__PURE__*/React.createElement(ScopeBuilder, null), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: ACC + '55'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 6
    }
  }, "AI Scope Assistant"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 10,
      lineHeight: 1.5
    }
  }, "Describe the scope - AI populates all line items (Manpower, Tools, Materials, PPE) using your Masterlist rates."), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...INP,
      height: 72,
      resize: 'vertical',
      marginBottom: 10
    },
    value: scope,
    onChange: e => setScope(e.target.value),
    placeholder: 'e.g. "Install 2 LV switchboards and 300m cable run. 10-day ' + ceType + ' job."'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, !getApiKey() && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      background: ERR + '15',
      border: `1px solid ${ERR}44`,
      borderRadius: 6,
      padding: '7px 12px',
      color: ERR,
      fontSize: 11
    }
  }, "No AI key. Click \"Set AI Key\" - Gemini, Groq & Kimi are free (no credit card)."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: handleAI,
    disabled: aiLoad || !scope.trim() || !getApiKey()
  }, aiLoad ? 'Generating...' : 'Generate with AI'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 3,
      background: SURF,
      borderRadius: 6,
      padding: '2px 3px',
      border: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn(addMode ? 'def' : 'info', true),
      fontSize: 10,
      padding: '2px 8px'
    },
    onClick: () => setAddMode(false),
    title: "Overwrite existing resources"
  }, "Replace"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn(addMode ? 'info' : 'def', true),
      fontSize: 10,
      padding: '2px 8px'
    },
    onClick: () => setAddMode(true),
    title: "Add to existing without overwriting"
  }, "Add"))), aiLoad && /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "Calling ", provInfo?.label || 'AI', "...")))), tab === 'manpower' && /*#__PURE__*/React.createElement("div", null, cfg.mobDemob && (() => {
    /* Shared expense line-item table */
    const ExpenseTable = ({
      rows,
      setRows,
      idPfx,
      color
    }) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, "Add each charge as a separate line item."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => setPicker({
        type: 'vehicles',
        onSelect: item => setRows(p => [...p, {
          id: uid(),
          desc: item.desc,
          qty: 1,
          days: 1,
          rate: item.rate,
          uom: item.uom
        }])
      })
    }, "From Masterlist"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: () => setRows(p => [...p, {
        id: uid(),
        desc: '',
        qty: 1,
        days: 1,
        rate: 0,
        uom: 'Day'
      }])
    }, "+ Add Item"))), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '12px 0',
        color: MT,
        fontSize: 12,
        border: `1px dashed ${BDR}`,
        borderRadius: 6
      }
    }, "No items yet. Click \"+ Add Item\" or pick from Masterlist.") : /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Description', 'Qty', 'Days', 'Rate (P)', 'Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => {
      const tot = N(r.qty) * N(r.days) * N(r.rate);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 200
        },
        list: idPfx + r.id,
        value: r.desc,
        onChange: e => {
          const dv = e.target.value;
          const f = (masterlist.vehicles || []).find(vml => vml.desc === dv);
          setRows(p => p.map(xr => xr.id === r.id ? {
            ...xr,
            desc: dv,
            ...(f ? {
              rate: f.rate,
              uom: f.uom
            } : {})
          } : xr));
        },
        placeholder: "e.g. Driver, Meals, Plane Ticket, Diesel..."
      }), /*#__PURE__*/React.createElement("datalist", {
        id: idPfx + r.id
      }, (masterlist.vehicles || []).map(mlItem => /*#__PURE__*/React.createElement("option", {
        key: mlItem.id,
        value: mlItem.desc
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 52
        },
        type: "number",
        min: 1,
        value: r.qty,
        onChange: e => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          qty: e.target.value
        } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 52
        },
        type: "number",
        min: 1,
        value: r.days,
        onChange: e => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          days: e.target.value
        } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 96
        },
        type: "number",
        min: 0,
        value: r.rate,
        onChange: e => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          rate: e.target.value
        } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          ...MONO,
          color: tot > 0 ? color || ACC : MT,
          fontWeight: 700,
          textAlign: 'right',
          minWidth: 100
        }
      }, "P", ph(tot)), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => setRows(p => p.filter(xr => xr.id !== r.id)),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    })))), rows.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${BDR}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: color || ACC,
        fontWeight: 700,
        fontSize: 12
      }
    }, "Total: ", /*#__PURE__*/React.createElement("span", {
      style: MONO
    }, "P", ph(rows.reduce((s, r) => s + N(r.qty) * N(r.days) * N(r.rate), 0))))));
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: INFO + '44'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        marginBottom: 12,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color: INFO
      }
    }, "Mobilization Expenses"), /*#__PURE__*/React.createElement(ExpenseTable, {
      rows: mobVehicles,
      setRows: setMobVehicles,
      idPfx: "mv",
      color: INFO
    }), mobVehiclesT > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 10,
        borderTop: `1px solid ${INFO}44`,
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: INFO,
        fontWeight: 700,
        fontSize: 13
      }
    }, "Mobilization Total: ", /*#__PURE__*/React.createElement("span", {
      style: MONO
    }, "P", ph(mobVehiclesT))))), /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: ACC + '44'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        marginBottom: 12,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color: ACC
      }
    }, "Demobilization Expenses"), /*#__PURE__*/React.createElement(ExpenseTable, {
      rows: demobVehicles,
      setRows: setDemobVehicles,
      idPfx: "dv",
      color: ACC
    }), demobVehiclesT > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 10,
        borderTop: `1px solid ${ACC}44`,
        paddingTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: ACC,
        fontWeight: 700,
        fontSize: 13
      }
    }, "Demobilization Total: ", /*#__PURE__*/React.createElement("span", {
      style: MONO
    }, "P", ph(demobVehiclesT))))), mobT > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        ...CS,
        borderColor: OK + '44',
        background: OK + '08'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        color: OK
      }
    }, "Mob + Demob Total"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 11,
        marginTop: 2
      }
    }, "Mobilization: P", ph(mobSubT), " + Demobilization: P", ph(demobSubT))), /*#__PURE__*/React.createElement("div", {
      style: {
        ...MONO,
        fontWeight: 800,
        fontSize: 16,
        color: OK
      }
    }, "P", ph(mobT)))));
  })(), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: INFO + '44',
      marginBottom: 8
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
      fontWeight: 700,
      flex: 1
    }
  }, "Manpower Entries"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, "Rows are grouped by shift type. Add under the shift you need."))), Object.entries(SHIFTS).map(([shiftKey, shiftInfo]) => {
    const rows = mp.filter(r => r.shift === shiftKey);
    const shiftSub = rows.reduce((s, r) => s + N(r.pax) * N(r.days) * N(r.rate) * (shiftInfo.mult || 1), 0);
    /* Head count = total PAX across rows that actually name a role. A blank
       starter row defaults to pax 1, so counting rows reported "1 worker" on an
       empty CE, and a row of 3 electricians only counted as one. */
    const shiftWorkers = rows.reduce((s, r) => s + (r.role ? N(r.pax) : 0), 0);
    const collapsed = !!collapsedShifts[shiftKey];
    const addFromML = () => setPicker({
      type: 'manpower',
      onSelect: item => setMp(p => [...p, {
        id: uid(),
        role: item.role,
        pax: 1,
        days: 1,
        otHours: 0,
        shift: shiftKey,
        rate: item.rate,
        perDiem: item.perDiem || 0
      }])
    });
    const addRow = () => setMp(p => [...p, {
      id: uid(),
      role: '',
      pax: 1,
      days: 1,
      shift: shiftKey,
      rate: 0
    }]);
    const shiftColor = shiftKey.startsWith('regular') ? INFO : shiftKey.startsWith('sunday') ? '#A78BFA' : ERR;
    return /*#__PURE__*/React.createElement("div", {
      key: shiftKey,
      style: {
        ...CS,
        borderColor: rows.length > 0 ? shiftColor + '55' : BDR,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        userSelect: 'none'
      },
      onClick: () => toggleShift(shiftKey)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: rows.length > 0 ? shiftColor : BDR,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 13
      }
    }, shiftInfo.label), /*#__PURE__*/React.createElement("span", {
      style: {
        background: shiftColor + '22',
        color: shiftColor,
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 3
      }
    }, shiftInfo.mult, "x"), shiftWorkers > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, shiftWorkers, " worker", shiftWorkers !== 1 ? 's' : ''))), shiftSub > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        ...MONO,
        color: shiftColor,
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0
      }
    }, "P", ph(shiftSub)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5,
        flexShrink: 0,
        position: 'relative'
      },
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: addFromML
    }, "ML"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: addRow
    }, "+ Add"), /*#__PURE__*/React.createElement("button", {
      style: btn('ok', true),
      title: "Update all rates in this shift to current masterlist rates",
      onClick: () => {
        let updated = 0;
        setMp(p => p.map(r => {
          if (r.shift !== shiftKey) return r;
          const f = masterlist.manpower.find(m => m.role && r.role && m.role.toUpperCase() === r.role.toUpperCase());
          if (!f) return r;
          updated++;
          return {...r, rate: f.rate, perDiem: f.perDiem !== undefined ? f.perDiem : r.perDiem};
        }));
        showToast(updated ? `Updated ${updated} rate(s) from masterlist.` : 'No matching roles found in masterlist.', !updated);
      }
    }, "↺ Sync Rates"), /*#__PURE__*/React.createElement("label", {
      style: {...btn('def', true), cursor: 'pointer'},
      title: "Import from Excel — columns: Role, PAX, Days, Rate"
    }, "📥 XLS", /*#__PURE__*/React.createElement("input", {
      type: "file", accept: ".xlsx,.xls", style: {display: 'none'},
      onChange: ev => {
        const file = ev.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = e2 => {
          try {
            const wb = XLSX.read(new Uint8Array(e2.target.result), {type: 'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows2 = XLSX.utils.sheet_to_json(ws, {defval: ''});
            const imported = rows2.map(r => ({
              id: uid(), shift: shiftKey,
              role: String(r['Role'] || r['ROLE'] || r['role'] || '').trim(),
              pax: Math.max(1, parseInt(r['PAX'] || r['pax'] || r['Pax'] || 1) || 1),
              days: Math.max(1, parseInt(r['Days'] || r['DAYS'] || r['days'] || N(info.days) || 1) || 1),
              rate: parseFloat(r['Rate'] || r['RATE'] || r['rate'] || 0) || 0,
              otHours: 0, perDiem: 0
            })).filter(r => r.role);
            if (!imported.length) { showToast('No valid rows. Columns needed: Role, PAX, Days, Rate', true); return; }
            setMp(p => [...p, ...imported]);
            showToast('Imported ' + imported.length + ' manpower rows.');
          } catch(ex) { showToast('Excel parse failed: ' + ex.message, true); }
        };
        reader.readAsArrayBuffer(file);
        ev.target.value = '';
      }
    })), rows.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      title: "Copy this shift's rows to another shift",
      onClick: () => setCopyMenu(copyMenu === shiftKey ? null : shiftKey)
    }, "Copy to..."), copyMenu === shiftKey && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        right: 0,
        top: '110%',
        background: CARD,
        border: `1px solid ${BDR}`,
        borderRadius: 8,
        zIndex: 200,
        minWidth: 200,
        boxShadow: '0 4px 20px #0008',
        padding: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
        padding: '0 4px'
      }
    }, "Copy to shift:"), Object.entries(SHIFTS).filter(([sk]) => sk !== shiftKey).map(([sk, sv]) => /*#__PURE__*/React.createElement("button", {
      key: sk,
      style: {
        ...btn('def', true),
        width: '100%',
        justifyContent: 'flex-start',
        marginBottom: 3,
        fontSize: 11,
        textAlign: 'left'
      },
      onClick: () => {
        const copied = rows.map(r => ({
          ...r,
          id: uid(),
          shift: sk,
          otHours: r.otHours || 0
        }));
        setMp(prev => {
          const existing = prev.filter(r => r.shift === sk);
          const existingRoles = new Set(existing.map(r => r.role.toUpperCase().trim()));
          const toAdd = copied.filter(r => !existingRoles.has(r.role.toUpperCase().trim()));
          return [...prev, ...toAdd];
        });
        setCollapsedShifts(p => ({
          ...p,
          [sk]: false
        }));
        setCopyMenu(null);
        showToast('Copied ' + copied.length + ' rows to ' + sv.label + (copied.length < rows.length ? ' (skipped duplicates)' : '') + '.');
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: sk.startsWith('regular') ? INFO : sk.startsWith('sunday') ? '#A78BFA' : ERR,
        marginRight: 7
      }
    }), sv.label, " (", sv.mult, "x)")), /*#__PURE__*/React.createElement("button", {
      style: {
        ...btn('def', true),
        width: '100%',
        marginTop: 4,
        fontSize: 10,
        color: MT
      },
      onClick: () => setCopyMenu(null)
    }, "Cancel")))), /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 14,
        flexShrink: 0,
        marginLeft: 2
      }
    }, collapsed ? '\u25b8' : '\u25be')), !collapsed && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12
      }
    }, rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '14px 0',
        color: MT,
        fontSize: 12,
        border: `1px dashed ${BDR}`,
        borderRadius: 6
      }
    }, "No workers under this shift. Click \"+ Add\" or \"ML\" above.") : /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Role / Position', 'PAX', 'Days', 'OT Hrs/Day', 'Day Rate (P)', 'Row Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => {
      const regAmt = N(r.pax) * N(r.days) * N(r.rate) * shiftInfo.mult;
      const otAmt = N(r.pax) * N(r.days) * (N(r.otHours || 0) / 8) * N(r.rate) * 1.25 * shiftInfo.mult;
      const tot = regAmt + otAmt;
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          width: 180
        },
        list: 'rl' + r.id,
        value: r.role,
        onChange: e => {
          const ro = e.target.value;
          const f = masterlist.manpower.find(m => m.role === ro);
          updRow(setMp, r.id, 'role', ro);
          if (f) updRow(setMp, r.id, 'rate', f.rate);
        },
        placeholder: "Role name..."
      }), /*#__PURE__*/React.createElement("datalist", {
        id: 'rl' + r.id
      }, masterlist.manpower.map(m => /*#__PURE__*/React.createElement("option", {
        key: m.id,
        value: m.role
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 50
        },
        type: "number",
        min: 1,
        value: r.pax,
        onChange: e => updRow(setMp, r.id, 'pax', Math.max(1, parseInt(e.target.value) || 1))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 50
        },
        type: "number",
        min: 1,
        value: r.days,
        onChange: e => updRow(setMp, r.id, 'days', Math.max(1, parseInt(e.target.value) || 1))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 58,
          borderColor: N(r.otHours) > 0 ? ACC + '88' : BDR
        },
        type: "number",
        min: 0,
        step: 0.5,
        value: r.otHours || 0,
        onChange: e => updRow(setMp, r.id, 'otHours', Math.max(0, parseFloat(e.target.value) || 0)),
        title: "Overtime hours PER DAY, charged at 1.25x the hourly rate (day rate / 8) for every day in the Days column. 3 hrs over 10 days = 30 OT hours."
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 90
        },
        type: "number",
        min: 0,
        value: r.rate,
        onChange: e => updRow(setMp, r.id, 'rate', Math.max(0, parseFloat(e.target.value) || 0))
      }),
      /* Feature 12: AI rate hint from history */
      (() => {
        if (!r.role || !history.length) return null;
        const roleUpper = r.role.toUpperCase();
        const rates = history.flatMap(h => (h.mp||[]).filter(m=>(m.role||'').toUpperCase()===roleUpper&&N(m.rate)>0).map(m=>N(m.rate)));
        if (!rates.length) return null;
        const avg = rates.reduce((a,b)=>a+b,0)/rates.length;
        return /*#__PURE__*/React.createElement("div",{style:{fontSize:9,color:MT,marginTop:2,whiteSpace:'nowrap'}},
          "Avg: ₱"+ph(avg)+" ("+rates.length+" CE"+(rates.length>1?"s":"")+")"
        );
      })()
      ), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          ...MONO,
          color: tot > 0 ? shiftColor : MT,
          fontWeight: 700,
          textAlign: 'right',
          minWidth: 110
        }
      }, "P", ph(tot), N(r.otHours) > 0 && /*#__PURE__*/React.createElement("span", {
        style: {
          color: ACC,
          fontSize: 9,
          display: 'block',
          fontWeight: 400
        }
      }, "OT: P", ph(N(r.pax) * N(r.days) * (N(r.otHours) / 8) * N(r.rate) * 1.25 * (shiftInfo.mult || 1)))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => delRow(setMp, r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    })))), shiftSub > 0 && rows.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 8,
        paddingTop: 8,
        borderTop: `1px solid ${BDR}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: MT,
        fontSize: 11
      }
    }, "Subtotal (", shiftInfo.mult, "x multiplier): "), /*#__PURE__*/React.createElement("span", {
      style: {
        ...MONO,
        color: shiftColor,
        fontWeight: 700
      }
    }, "P", ph(shiftSub)))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: ACC + '55',
      background: ACC + '08'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 24,
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 2
    }
  }, "C.1\\u2013C.4 Subtotal"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 700,
      fontSize: 14
    }
  }, "P", ph(mpSub))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 11,
      marginBottom: 2
    }
  }, "C.5 Benefits & Others (20%)"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 700,
      fontSize: 14
    }
  }, "P", ph(ben))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      borderLeft: `1px solid ${BDR}`,
      paddingLeft: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: ACC,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Manpower Total"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 800,
      fontSize: 18,
      color: ACC
    }
  }, "P", ph(mpTot)))))), mp.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: ACC + '44',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 12,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: ACC
    }
  }, "C.7 Benefits & Others"), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: SURF
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      width: 28,
      textAlign: 'center'
    }
  }, "#"), /*#__PURE__*/React.createElement("th", {
    style: THS
  }, "Manpower Loading"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'center',
      width: 40
    }
  }, "Qty"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'center',
      width: 36
    }
  }, "UOM"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'center',
      width: 46
    }
  }, "Days"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 100
    }
  }, "Monthly Rate"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 90
    }
  }, "13th Pay"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 80
    }
  }, "SSS"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 100
    }
  }, "HDMF & PHIC"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 90
    }
  }, "SIL & ECC"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 90
    }
  }, "Per Diem"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 100,
      background: ACC + '22',
      color: ACC
    }
  }, "Total"))), /*#__PURE__*/React.createElement("tbody", null, (() => {
    /* Group mp rows by role, merging same role across all shifts */
    const grouped = {};
    mp.forEach(r => {
      const key = r.role.trim().toUpperCase();
      const mult = SHIFTS[r.shift]?.mult || 1;
      const rate = N(r.rate) * mult;
      const pax = N(r.pax);
      const days = N(r.days);
      const mlItem = masterlist.manpower.find(m => m.role.toUpperCase() === key);
      const perDiemRate = mlItem ? N(mlItem.perDiem || 0) : 0;
      if (!grouped[key]) {
        grouped[key] = {
          role: r.role,
          pax,
          days,
          rate,
          perDiemRate,
          entries: [{
            rate,
            pax,
            days,
            mult,
            perDiemRate
          }]
        };
      } else {
        grouped[key].pax += pax;
        grouped[key].days = Math.max(grouped[key].days, days);
        /* Use weighted avg rate */
        grouped[key].entries.push({
          rate,
          pax,
          days,
          mult,
          perDiemRate
        });
      }
    });
    return Object.values(grouped).map((g, rowIdx) => {
      /* Calculate benefits per entry then sum */
      let thirteenth = 0,
        sss = 0,
        hdmf = 0,
        sil = 0,
        perdiem = 0,
        totalMonthly = 0;
      g.entries.forEach(e => {
        thirteenth += e.rate / 12 * e.days * e.pax;
        sss += e.rate * 0.25 * 0.75 * e.days * e.pax / 26;
        hdmf += e.rate * 0.16 * e.days * e.pax / 26 * 2;
        sil += e.rate * e.days * e.pax * 5 / 12 / 26 + e.pax * 30;
        perdiem += e.perDiemRate * e.days * e.pax;
        totalMonthly += e.rate * 26 * e.pax;
      });
      const rowTot = thirteenth + sss + hdmf + sil + perdiem;
      const totalPax = g.entries.reduce((s, e) => s + e.pax, 0);
      const maxDays = Math.max(...g.entries.map(e => e.days));
      return /*#__PURE__*/React.createElement("tr", {
        key: g.role,
        style: {
          background: rowIdx % 2 === 0 ? 'transparent' : SURF + '88'
        }
      }, /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'center',
          color: MT,
          fontSize: 10
        }
      }, rowIdx + 1), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 600,
          fontSize: 12
        }
      }, g.role || '--'), g.entries.length > 1 && /*#__PURE__*/React.createElement("div", {
        style: {
          color: MT,
          fontSize: 9
        }
      }, g.entries.length, " shifts combined")), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'center',
          ...MONO
        }
      }, totalPax), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'center',
          color: MT
        }
      }, "pax"), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'center',
          ...MONO
        }
      }, maxDays), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'right',
          ...MONO,
          color: MT
        }
      }, "P", ph(totalMonthly / totalPax)), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'right',
          ...MONO
        }
      }, "P", ph(thirteenth)), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'right',
          ...MONO
        }
      }, "P", ph(sss)), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'right',
          ...MONO
        }
      }, "P", ph(hdmf)), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'right',
          ...MONO
        }
      }, "P", ph(sil)), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'right',
          ...MONO,
          color: perdiem > 0 ? TX : MT
        }
      }, "P", ph(perdiem)), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          textAlign: 'right',
          ...MONO,
          color: ACC,
          fontWeight: 700,
          background: ACC + '0A'
        }
      }, "P", ph(rowTot)));
    });
  })()), /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: ACC + '14',
      borderTop: `2px solid ${ACC}44`,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 11,
    style: {
      ...TDS,
      textAlign: 'right',
      color: ACC
    }
  }, "Benefits & Others Sub-Total:"), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right',
      ...MONO,
      color: ACC,
      fontWeight: 800,
      fontSize: 12
    }
  }, "P", ph(ben)))))))), tab === 'tools' && /*#__PURE__*/React.createElement(ResTab, {
    rows: tools,
    set: setTools,
    total: toolsT,
    label: "Tools & Equipment (BOTE)",
    mlType: "tools",
    showDays: true,
    masterlist, showToast, setPicker
  }), tab === 'materials' && /*#__PURE__*/React.createElement(ResTab, {
    rows: mats,
    set: setMats,
    total: matsT,
    label: "Materials & Consumables (BOCM)",
    mlType: "materials",
    masterlist, showToast, setPicker
  }), tab === 'ppe' && /*#__PURE__*/React.createElement(ResTab, {
    rows: ppe,
    set: setPpe,
    total: ppeT,
    label: "Personal Protective Equipment (PPE)",
    mlType: "ppe",
    masterlist, showToast, setPicker
  }), tab === 'misc' && /*#__PURE__*/React.createElement("div", null, (MISC_DEF[ceType] || MISC_DEF.onsite).map(([miscKey, label]) => {
    const rows = Array.isArray(misc[miscKey]) ? misc[miscKey] : [];
    const catTotal = rows.reduce((s, r) => s + N(r.qty) * N(r.cost), 0);
    const addItem = () => setMisc(p => ({
      ...p,
      [miscKey]: [...(Array.isArray(p[miscKey]) ? p[miscKey] : []), mkMiscRow()]
    }));
    const updItem = (id, field, val) => setMisc(p => ({
      ...p,
      [miscKey]: (p[miscKey] || []).map(r => r.id === id ? {
        ...r,
        [field]: val
      } : r)
    }));
    const delItem = id => setMisc(p => ({
      ...p,
      [miscKey]: (p[miscKey] || []).filter(r => r.id !== id)
    }));
    return /*#__PURE__*/React.createElement("div", {
      key: miscKey,
      style: {
        ...CS,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: rows.length > 0 ? 12 : 0,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        flex: 1
      }
    }, label), catTotal > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        ...MONO,
        color: ACC,
        fontWeight: 700,
        fontSize: 12
      }
    }, "P", ph(catTotal)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => setPicker({
        type: 'vehicles',
        onSelect: item => setMisc(p => ({
          ...p,
          [miscKey]: [...(Array.isArray(p[miscKey]) ? p[miscKey] : []), {
            id: uid(),
            desc: item.desc,
            qty: 1,
            uom: item.uom,
            cost: item.cost || item.rate || 0
          }]
        }))
      })
    }, "From Masterlist"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      onClick: addItem
    }, "+ Add"))), rows.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '10px 0',
        color: MT,
        fontSize: 11,
        border: `1px dashed ${BDR}`,
        borderRadius: 5
      }
    }, "No items. Click \"+ Add\" or pick from Masterlist."), rows.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: 'auto'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Description', 'Qty', 'UOM', 'Unit Cost (P)', 'Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => {
      const tot = N(r.qty) * N(r.cost);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          minWidth: 195
        },
        list: 'mc' + miscKey + r.id,
        value: r.desc || '',
        onChange: e => {
          const dv = e.target.value;
          const f = (masterlist.vehicles || []).find(vml => vml.desc === dv);
          updItem(r.id, 'desc', dv);
          if (f) {
            updItem(r.id, 'cost', f.cost || f.rate || 0);
            updItem(r.id, 'uom', f.uom);
          }
        },
        placeholder: "Item description..."
      }), /*#__PURE__*/React.createElement("datalist", {
        id: 'mc' + miscKey + r.id
      }, (masterlist.vehicles || []).map(mlItem => /*#__PURE__*/React.createElement("option", {
        key: mlItem.id,
        value: mlItem.desc
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 58
        },
        type: "number",
        min: 0,
        value: r.qty || 1,
        onChange: e => updItem(r.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 72
        },
        value: r.uom || 'Lot',
        onChange: e => updItem(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Lot'))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("input", {
        style: {
          ...INP,
          ...MONO,
          width: 96
        },
        type: "number",
        min: 0,
        value: r.cost || 0,
        onChange: e => updItem(r.id, 'cost', Math.max(0, parseFloat(e.target.value) || 0))
      })), /*#__PURE__*/React.createElement("td", {
        style: {
          ...TDS,
          ...MONO,
          color: tot > 0 ? ACC : MT,
          fontWeight: 700,
          textAlign: 'right',
          minWidth: 94
        }
      }, "P", ph(tot)), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => delItem(r.id),
        style: {
          background: 'none',
          border: 'none',
          color: ERR,
          cursor: 'pointer',
          fontSize: 15,
          padding: '1px 5px'
        }
      }, "x")));
    })))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      background: ACC + '08',
      borderColor: ACC + '44',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: ACC,
      fontWeight: 700,
      fontSize: 14
    }
  }, "Miscellaneous Total: ", /*#__PURE__*/React.createElement("span", {
    style: MONO
  }, "P", ph(miscT)))))), tab === 'summary' && /*#__PURE__*/React.createElement("div", null,
  /* ── Pre-flight check ── one place listing everything worth fixing before a CE
     goes out. Read-only: it never changes data, it only points at problems. */
  (() => {
    const issues = [];
    const add = (sev, msg, tabId, hint) => issues.push({ sev, msg, tabId, hint });

    /* Blocking-ish: the numbers are wrong or missing */
    if (grand <= 0) add('err', 'Grand total is ₱0.00 — nothing is costed yet.', 'manpower');
    const zero = collectZeroCost();
    if (zero.length) add('err', zero.length + ' line item' + (zero.length === 1 ? '' : 's') + ' priced at ₱0.00',
      'manpower', zero.slice(0, 6).join(' · ') + (zero.length > 6 ? ' · …' : ''));
    if (!(info.description || '').trim()) add('err', 'No project description / scope summary.', 'info');
    if (!(info.client || '').trim()) add('err', 'No client name.', 'info');

    /* Worth a look, not necessarily wrong */
    if (!(sowItems || []).length) add('warn', 'No Scope of Work items.', 'sow');
    else if (sowUnassignedCount > 0) add('warn', sowUnassignedCount + ' resource row' + (sowUnassignedCount === 1 ? '' : 's') + ' not assigned to a scope task.', 'sowbreak');
    if (N(margin) === 0) add('warn', 'Margin is 0% — the selling price equals cost.', 'summary');
    if (!N(info.qty)) add('warn', 'Quantity is blank, so the unit price falls back to 1.', 'info');
    const dangling = (addlCosts || []).filter(r => r.src && r.src !== 'manual' && !hlSources.some(o => o.k === r.src));
    if (dangling.length) add('err', dangling.length + ' highlighted cost' + (dangling.length === 1 ? '' : 's') + ' point at a cost that no longer exists.', 'summary');
    if (!(approvers || []).some(a => (a.name || '').trim())) add('warn', 'No approvers named.', 'summary');

    const errs = issues.filter(i => i.sev === 'err').length;
    const warns = issues.length - errs;
    const clean = issues.length === 0;

    return /*#__PURE__*/React.createElement("div", {
      style: { ...CS, marginBottom: 10, borderColor: clean ? OK + '55' : errs ? ERR + '55' : '#F59E0B55' }
    },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("span", { style: { fontWeight: 700, fontSize: 12 } }, clean ? "✓ CE looks complete" : "Check CE"),
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: MT } },
          clean
            ? "No issues found."
            : (errs ? errs + " to fix" : "") + (errs && warns ? " · " : "") + (warns ? warns + " to review" : "")),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: grand > 0 ? ACC : MT } }, "₱" + ph(grand))
      ),
      !clean && /*#__PURE__*/React.createElement("div", { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 } },
        issues.map((i, n) => /*#__PURE__*/React.createElement("div", {
          key: n,
          style: { display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 11, padding: '3px 0', borderTop: n ? `1px solid ${BDR}` : 'none' }
        },
          /*#__PURE__*/React.createElement("span", { style: { color: i.sev === 'err' ? ERR : '#F59E0B', fontWeight: 700, width: 12, flexShrink: 0 } }, i.sev === 'err' ? "!" : "?"),
          /*#__PURE__*/React.createElement("span", { style: { flex: 1, minWidth: 160 } },
            i.msg,
            i.hint && /*#__PURE__*/React.createElement("span", { style: { color: MT, display: 'block', fontSize: 10, marginTop: 1 } }, i.hint)
          ),
          i.tabId && i.tabId !== 'summary' && /*#__PURE__*/React.createElement("button", {
            style: { ...btn('def', true), fontSize: 10, flexShrink: 0 },
            onClick: () => setTab(i.tabId)
          }, "Go →")
        ))
      )
    );
  })(),
  /* Feature 12: AI Cost Suggestion banner */
  /*#__PURE__*/React.createElement("div", {style:{marginBottom:12,display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}},
    /*#__PURE__*/React.createElement("button", {
      style:{...btn('def',true),borderColor:'#A78BFA55',color:'#A78BFA'},
      onClick:()=>{
        const similar = history.filter(h=>h.ceType===ceType&&h.grand>0);
        if(similar.length<2){showToast('Not enough history to suggest (need 2+ similar CEs).',true);setAiSuggest(null);return;}
        const vals={grand:[],mp:[],tools:[],mats:[],ppe:[]};
        similar.forEach(h=>{vals.grand.push(N(h.grand||0));vals.mp.push(N(h.mpTot||0));vals.tools.push(N(h.toolsT||0));vals.mats.push(N(h.matsT||0));vals.ppe.push(N(h.ppeT||0));});
        const avg=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
        setAiSuggest({n:similar.length,grand:avg(vals.grand),mp:avg(vals.mp),tools:avg(vals.tools),mats:avg(vals.mats),ppe:avg(vals.ppe)});
      }
    }, "💡 AI Suggest"),
    aiSuggest && /*#__PURE__*/React.createElement("div", {style:{flex:1,background:'#A78BFA11',border:'1px solid #A78BFA44',borderRadius:8,padding:'10px 14px',fontSize:11}},
      /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:'#A78BFA',marginBottom:6}}, "💡 Based on "+aiSuggest.n+" similar "+ceType+" CEs:"),
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:16,flexWrap:'wrap'}},
        [['Grand Total','grand',ACC],['Manpower','mp',INFO],['Tools','tools',OK],['Materials','mats','#F0A429'],['PPE','ppe',ERR]].map(([label,key,color])=>
          /*#__PURE__*/React.createElement("div", {key:key},
            /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10}}, label),
            /*#__PURE__*/React.createElement("div", {style:{color:color,fontWeight:700,...MONO}}, "₱"+ph(aiSuggest[key]*0.8)+" – ₱"+ph(aiSuggest[key]*1.2))
          )
        )),
      /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginTop:6}}, "Typical range ±20%. Your current grand total: ",
        /*#__PURE__*/React.createElement("b", {style:{color:grand<aiSuggest.grand*0.8?ERR:grand>aiSuggest.grand*1.2?ERR:OK}}, "₱"+ph(grand)),
        grand>0&&(grand<aiSuggest.grand*0.8||grand>aiSuggest.grand*1.2)?" — outside typical range ⚠":" — within typical range ✓"),
      /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),fontSize:9,marginTop:6},onClick:()=>setAiSuggest(null)}, "✕ Dismiss")
    )),
  /* Highlighted Costs card — callouts of costs already counted in the CE */
  /*#__PURE__*/React.createElement("div", {style:{...CS, borderColor:'#F59E0B44', marginBottom:10}},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("span", {style:{fontWeight:700,fontSize:12}}, "Highlighted Costs"),
      /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, "— Break out a cost the client wants called out (delivery, pickup, third party, cost per unit...)"),
      /*#__PURE__*/React.createElement("button", {
        style:{...btn('ok',true),marginLeft:'auto'},
        onClick:()=>setAddlCosts(p=>[...p,{id:uid(),label:'',src:'',amount:0}])
      }, "+ Add Row")
    ),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginBottom:8,fontStyle:'italic'}},
      "These are already included in the Grand Total — they are shown separately on the CE, never added on top."),
    addlCosts.length === 0 && /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:11,fontStyle:'italic',padding:'6px 0'}}, "No highlighted costs. Click \"+ Add Row\" to call out a delivery charge, third party cost, unit price, etc."),
    addlCosts.length > 0 && /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
      /*#__PURE__*/React.createElement("thead", null,
        /*#__PURE__*/React.createElement("tr", null,
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'left'}}, "Label shown on CE"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'left',width:230}}, "Take amount from"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,textAlign:'right',width:150}}, "Amount (₱)"),
          /*#__PURE__*/React.createElement("th", {style:{...THS,width:40}})
        )
      ),
      /*#__PURE__*/React.createElement("tbody", null, addlCosts.map(r=>{
        const linked = r.src && r.src !== 'manual';
        const missing = linked && !hlSources.some(o=>o.k===r.src);
        return /*#__PURE__*/React.createElement("tr", {key:r.id},
          /*#__PURE__*/React.createElement("td", {style:TDS},
            /*#__PURE__*/React.createElement("input", {
              style:{...INP,width:'100%'},
              value:hlLabel(r),
              placeholder:"e.g. Delivery to Pagbilao, Unit Price per Set...",
              onChange:e=>setAddlCosts(p=>p.map(x=>x.id===r.id?{...x,label:e.target.value,desc:undefined}:x))
            })
          ),
          /*#__PURE__*/React.createElement("td", {style:TDS},
            /*#__PURE__*/React.createElement("select", {
              style:{...INP,width:'100%',fontSize:11},
              value:r.src||'manual',
              onChange:e=>{
                const src = e.target.value;
                setAddlCosts(p=>p.map(x=>{
                  if (x.id!==r.id) return x;
                  const hit = hlSources.find(o=>o.k===src);
                  /* Prefill an empty label with the source name for convenience. */
                  return {...x, src, label: (hlLabel(x) || (hit ? hit.l : '')), desc: undefined};
                }));
              }
            },
              /*#__PURE__*/React.createElement("option", {value:'manual'}, "— type amount manually —"),
              ['Computed','Sections','Misc Categories','Misc Line Items'].map(g=>{
                const inGroup = hlSources.filter(o=>o.g===g);
                if (!inGroup.length) return null;
                return /*#__PURE__*/React.createElement("optgroup", {key:g,label:g},
                  inGroup.map(o=>/*#__PURE__*/React.createElement("option", {key:o.k,value:o.k}, o.l + '  (₱' + ph(o.v) + ')'))
                );
              }),
              /* Keep a stale link selectable so the row is not silently rewritten. */
              missing && /*#__PURE__*/React.createElement("option", {value:r.src}, "⚠ linked cost no longer exists")
            )
          ),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,textAlign:'right'}},
            linked
              ? /*#__PURE__*/React.createElement("span", {
                  style:{...MONO,fontSize:12,color:missing?ERR:OK},
                  title: missing ? 'The linked cost was removed from the CE — pick another source or switch to manual.' : 'Linked — updates automatically when this cost changes'
                }, missing ? '⚠ —' : '₱' + ph(hlAmt(r)))
              : /*#__PURE__*/React.createElement("input", {
                  style:{...INP,...MONO,width:140,textAlign:'right'},
                  type:'number',min:0,step:0.01,
                  value:r.amount||'',
                  placeholder:"0.00",
                  onChange:e=>setAddlCosts(p=>p.map(x=>x.id===r.id?{...x,amount:N(e.target.value)}:x))
                })
          ),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,textAlign:'center'}},
            /*#__PURE__*/React.createElement("button", {
              style:{...btn('danger',true),padding:'2px 8px',fontSize:11},
              onClick:()=>setAddlCosts(p=>p.filter(x=>x.id!==r.id))
            }, "✕")
          )
        );
      }))
    )
  ),
  /*#__PURE__*/React.createElement("div", {
    style: CS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 11,
      border: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      width: 110,
      background: SURF
    }
  }, "PROJECT TYPE:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 3,
    style: TDS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center'
    }
  }, Object.entries(CE_CFG).map(([ceKey, ceVal]) => /*#__PURE__*/React.createElement("label", {
    key: ceKey,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "ceTypeSummary",
    checked: ceType === ceKey,
    onChange: () => setCeType(ceKey),
    style: {
      accentColor: ceVal.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: ceType === ceKey ? ceVal.color : MT,
      fontWeight: ceType === ceKey ? 700 : 400
    }
  }, ceKey.toUpperCase()))))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      width: 60,
      background: SURF
    }
  }, "DATE:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11
    },
    type: "date",
    value: info.date || '',
    onChange: e => setInfo(p => ({
      ...p,
      date: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF,
      width: 140,
      whiteSpace: 'nowrap'
    }
  }, "PROJECT DESCRIPTION:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 5,
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      fontWeight: 600,
      width: '100%'
    },
    value: info.description || '',
    onChange: e => setInfo(p => ({
      ...p,
      description: e.target.value
    })),
    placeholder: "Enter project description..."
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "CE NUMBER:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 5,
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      fontWeight: 700
    },
    value: info.ceNum || '',
    onChange: e => setInfo(p => ({
      ...p,
      ceNum: e.target.value
    })),
    placeholder: "e.g. SY3-CE-2026-0001"
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "CLIENT NAME:"), /*#__PURE__*/React.createElement("td", {
    colSpan: 5,
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      width: '100%'
    },
    value: info.client || '',
    onChange: e => setInfo(p => ({
      ...p,
      client: e.target.value
    })),
    placeholder: "Client name..."
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "CLIENT LOCATION:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      width: '100%'
    },
    value: info.location || '',
    onChange: e => setInfo(p => ({
      ...p,
      location: e.target.value
    })),
    placeholder: "Location..."
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "MATERIAL:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11
    },
    value: info.material || '',
    onChange: e => setInfo(p => ({
      ...p,
      material: e.target.value
    })),
    placeholder: "N/A"
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "NO. OF DAYS:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      ...MONO,
      width: 60
    },
    type: "number",
    min: 1,
    value: info.days || '',
    onChange: e => setInfo(p => ({
      ...p,
      days: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "ATTENTION:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      width: '100%'
    },
    value: info.attention || 'SALES DEPARTMENT',
    onChange: e => setInfo(p => ({
      ...p,
      attention: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "QUANTITY:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11,
      ...MONO,
      width: 60
    },
    type: "number",
    min: 1,
    value: info.qty || 1,
    onChange: e => setInfo(p => ({
      ...p,
      qty: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 700,
      background: SURF
    }
  }, "END USER:"), /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      border: 'none',
      background: 'transparent',
      padding: '1px 4px',
      fontSize: 11
    },
    value: info.endUser || 'C/O SALES',
    onChange: e => setInfo(p => ({
      ...p,
      endUser: e.target.value
    }))
  })))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      /* Wrap instead of overflowing once the action buttons no longer fit. */
      flexWrap: 'wrap',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 800,
      fontSize: 16,
      letterSpacing: '-0.02em',
      color: cfg.color,
      /* Never break the CE number across lines. */
      whiteSpace: 'nowrap'
    }
  }, info.ceNum || '(No CE Number)'), docFile && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 4,
      background: INFO + '18',
      border: `1px solid ${INFO}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 10,
      color: INFO
    }
  }, "Doc: ", docFile.name, docFile.spUrl && /*#__PURE__*/React.createElement("a", {
    href: SITE_URL + docFile.spUrl,
    target: "_blank",
    style: {
      color: INFO,
      marginLeft: 4
    }
  }, "View"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def'),
    onClick: handleSave
  }, "Save"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def'),
      background: INFO + '22',
      borderColor: INFO + '55',
      color: INFO
    },
    onClick: handleSaveRevision,
    title: 'Save as ' + ((info.ceNum || 'CE') + '-Rn revision')
  }, "\u21BB Revise"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def'),
      background: '#8B5CF622',
      borderColor: '#8B5CF655',
      color: '#A78BFA'
    },
    onClick: saveDraft,
    title: "Save draft \u2014 shared with team via SharePoint"
  }, "\u2B07 Draft"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def'),
      background: '#8B5CF611',
      borderColor: '#8B5CF644',
      color: '#A78BFA',
      position: 'relative'
    },
    onClick: () => {
      loadSharedDrafts();
      setDraftsOpen(true);
    },
    title: "View all shared drafts"
  }, "\uD83D\uDCCB Drafts", sharedDrafts.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -4,
      right: -4,
      background: '#8B5CF6',
      color: '#fff',
      borderRadius: '50%',
      width: 14,
      height: 14,
      fontSize: 9,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700
    }
  }, sharedDrafts.length)), /*#__PURE__*/React.createElement("button", {
    style: btn('info'),
    onClick: handleGenerateCEWithCheck
  }, "🖨 Generate CE"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#58A6FF55', color: INFO},
    onClick: handlePrintPreview,
    title: "Preview CE before printing"
  }, "👁 Preview"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#3FB95055', color: OK},
    onClick: () => {
      try {
        const d = {info, ceType, mp, tools, mats, ppe, misc, notes, approvers, sowItems, mobVehicles, demobVehicles};
        const url = window.location.href.split('?')[0] + '?draft=' + btoa(JSON.stringify(d));
        navigator.clipboard.writeText(url).then(() => showToast('🔗 Share link copied to clipboard!')).catch(() => { prompt('Copy this link:', url); });
      } catch(e) { showToast('Failed to generate share link.', true); }
    },
    title: "Copy shareable link to this draft"
  }, "🔗 Share"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#A371F755', color: '#A371F7'},
    title: "Open email client to notify approvers",
    onClick: () => {
      const subject = encodeURIComponent(`[CE FOR APPROVAL] ${info.ceNum} — ${info.client || info.description || ''}`);
      const approverNames = approvers.map(a => `${a.role}: ${a.name}${a.title ? ' (' + a.title + ')' : ''}`).join('\n');
      const sectionLines = summaryRows.map(([l,v]) => `  ${l.padEnd(30)} ₱${ph(v)}`).join('\n');
      const body = encodeURIComponent(
        `Good day,\n\nKindly review and approve the attached Cost Estimate:\n\n` +
        `CE No.:      ${info.ceNum}\n` +
        `Client:      ${info.client || '—'}\n` +
        `Description: ${info.description || '—'}\n` +
        `Date:        ${info.date || '—'}\n\n` +
        `COST SUMMARY\n${'─'.repeat(46)}\n${sectionLines}\n${'─'.repeat(46)}\n` +
        `  ${'GRAND TOTAL'.padEnd(30)} ₱${ph(grand)}\n\n` +
        `Approvers:\n${approverNames}\n\n` +
        `Thank you.`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    }
  }, "📧 Notify"), /*#__PURE__*/React.createElement("button", {
    style: btn('ok'),
    onClick: handleExportXLSX,
    title: "Detailed workbook — one sheet per section with every line item"
  }, "Export Detailed"), /*#__PURE__*/React.createElement("button", {
    style: btn('acc'),
    onClick: handleExport,
    title: "CE template — the standard SY3 Cost Estimate Summary layout"
  }, "Export CE Template"))), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: THS
  }, "Item"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right'
    }
  }, "Amount (P)"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 60
    }
  }, "Share"))), /*#__PURE__*/React.createElement("tbody", null, summaryRows.map(([label, val]) => /*#__PURE__*/React.createElement("tr", {
    key: label
  }, /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, label), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      ...MONO,
      textAlign: 'right',
      color: val > 0 ? TX : MT
    }
  }, ph(val)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right',
      color: MT,
      fontSize: 11
    }
  }, grand > 0 ? (val / grand * 100).toFixed(1) + '%' : '--')))), /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: ACC + '14',
      borderTop: `2px solid ${ACC}55`
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 800,
      color: ACC,
      paddingTop: 12,
      paddingBottom: 12
    }
  }, "TOTAL AMOUNT"), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      ...MONO,
      textAlign: 'right',
      fontSize: 16,
      fontWeight: 800,
      color: ACC,
      paddingTop: 12,
      paddingBottom: 12
    }
  }, "P", ph(grand)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right',
      color: MT,
      paddingTop: 12
    }
  }, "100%")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      color: MT
    }
  }, "Unit Price (qty ", info.qty || 1, ")"), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      ...MONO,
      textAlign: 'right',
      color: INFO
    }
  }, "P", ph(unitP)), /*#__PURE__*/React.createElement("td", {
    style: TDS
  })), /*#__PURE__*/React.createElement("tr", {
    style: {background: OK+'10', borderTop: `2px solid ${OK}44`}
  }, /*#__PURE__*/React.createElement("td", {
    style: {...TDS, fontWeight:800, color: OK, paddingTop:10, paddingBottom:10}
  }, "SELLING PRICE"), /*#__PURE__*/React.createElement("td", {
    style: {...TDS, ...MONO, textAlign:'right', fontSize:15, fontWeight:800, color: OK, paddingTop:10, paddingBottom:10}
  }, "P", ph(grand * (1 + margin / 100))), /*#__PURE__*/React.createElement("td", {
    style: {...TDS, textAlign:'right', color: MT, fontSize:11, paddingTop:10, whiteSpace:'nowrap'}
  }, /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}},
    /*#__PURE__*/React.createElement("input", {
      type: 'number',
      min: -50, max: 200, step: 0.5,
      value: margin,
      onChange: e => setMargin(Number(e.target.value)||0),
      title: 'Margin % (positive = markup, negative = discount)',
      style: {...INP, width:62, fontSize:11, textAlign:'right', padding:'2px 6px'}
    }),
    /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, "% margin")
  )))))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: INFO + '44'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 12
    }
  }, "Notes / Remarks"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, notes.length, " note", notes.length !== 1 ? 's' : ''), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      marginLeft: 'auto'
    },
    onClick: () => setNotes(p => [...p, mkNote()])
  }, "+ Add Note")), notes.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '14px 0',
      color: MT,
      fontSize: 12,
      border: `1px dashed ${BDR}`,
      borderRadius: 6
    }
  }, "No notes yet. Click \"+ Add Note\" to add remarks, instructions, or disclaimers."), notes.length > 0 && notes.map((note, idx) => /*#__PURE__*/React.createElement("div", {
    key: note.id,
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      background: ACC + '22',
      color: ACC,
      fontWeight: 700,
      fontSize: 11,
      minWidth: 26,
      height: 26,
      borderRadius: 5,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1
    }
  }, note.seq), /*#__PURE__*/React.createElement("textarea", {
    style: {
      ...INP,
      flex: 1,
      height: 60,
      resize: 'vertical',
      fontSize: 12
    },
    value: note.text,
    onChange: e => setNotes(p => p.map(n => n.id === note.id ? {
      ...n,
      text: e.target.value
    } : n)),
    placeholder: 'Note ' + note.seq + '...'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    title: "Move up",
    disabled: idx === 0,
    onClick: () => setNotes(p => {
      const a = [...p];
      [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
      return a.map((n, i) => ({
        ...n,
        seq: i + 1
      }));
    })
  }, "^"), /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    title: "Move down",
    disabled: idx === notes.length - 1,
    onClick: () => setNotes(p => {
      const a = [...p];
      [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]];
      return a.map((n, i) => ({
        ...n,
        seq: i + 1
      }));
    })
  }, "v"), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: ERR,
      cursor: 'pointer',
      fontSize: 15,
      padding: '1px 4px'
    },
    onClick: () => setNotes(p => p.filter(n => n.id !== note.id).map((n, i) => ({
      ...n,
      seq: i + 1
    })))
  }, "x"))))),

  /* Breakdown notes live on the scope items, so they are shown here read-only
     rather than copied -- one place to edit, and no chance of the two drifting.
     They print with the notes above. */
  (() => {
    const sn = (sowItems || []).filter(s => String(s.note || '').trim());
    if (!sn.length) return null;
    return /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: INFO + '44' } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("span", { style: { fontWeight: 700, fontSize: 12 } }, "From the SOW Breakdown"),
        /*#__PURE__*/React.createElement("span", { style: { color: MT, fontSize: 11 } }, sn.length + " breakdown note" + (sn.length === 1 ? '' : 's') + " — these print with the notes above"),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), marginLeft: 'auto' }, onClick: () => setTab('sowbreak') }, "Edit in SOW Breakdown")
      ),
      sn.map(s => /*#__PURE__*/React.createElement("div", { key: s.id, style: { display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' } },
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: ACC, fontWeight: 700, fontSize: 11, minWidth: 34, paddingTop: 1 } }, sowLabels[s.id] || ''),
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 11.5, whiteSpace: 'pre-wrap', flex: 1 } },
          /*#__PURE__*/React.createElement("div", { style: { color: MT, fontSize: 10, marginBottom: 1 } }, s.text || '(untitled task)'),
          String(s.note).trim())
      ))
    );
  })(),

  /*#__PURE__*/React.createElement("div", {
    style: CS
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 12,
      fontSize: 11,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Signatories"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(approvers.length, 4)},1fr)`,
      gap: 8,
      marginBottom: 8
    }
  }, approvers.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: SURF,
      borderRadius: 6,
      padding: '10px 8px',
      border: `1px solid ${BDR}`,
      textAlign: 'center',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      textAlign: 'center',
      fontSize: 9,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: MT,
      background: 'transparent',
      border: 'none',
      borderBottom: `1px dashed ${BDR}44`,
      borderRadius: 0,
      padding: '2px 4px',
      marginBottom: 8,
      width: '100%'
    },
    value: a.role,
    placeholder: "Role...",
    onChange: e => setApprovers(p => p.map((x, j) => j === i ? {
      ...x,
      role: e.target.value
    } : x))
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 6,
      background: 'transparent',
      border: 'none',
      borderBottom: `1px solid ${BDR}`,
      borderRadius: 0,
      paddingBottom: 14,
      width: '100%'
    },
    value: a.name,
    placeholder: "Name...",
    onChange: e => setApprovers(p => p.map((x, j) => j === i ? {
      ...x,
      name: e.target.value
    } : x))
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      textAlign: 'center',
      fontSize: 11,
      color: MT,
      background: 'transparent',
      border: 'none',
      borderRadius: 0,
      width: '100%'
    },
    value: a.title,
    placeholder: "Title / Position...",
    onChange: e => setApprovers(p => p.map((x, j) => j === i ? {
      ...x,
      title: e.target.value
    } : x))
  }),
  /* Feature 11: signature thumbnail + sign button */
  signatures[a.id||i] && /*#__PURE__*/React.createElement("div",{style:{margin:'4px 0'}},
    /*#__PURE__*/React.createElement("img",{src:signatures[a.id||i],style:{width:'100%',height:36,objectFit:'contain',background:'#fff',borderRadius:3,border:'1px solid '+BDR}})),
  /*#__PURE__*/React.createElement("button",{
    style:{...btn(signatures[a.id||i]?'ok':'def',true),fontSize:9,padding:'2px 6px',width:'100%',marginTop:4},
    onClick:()=>setSigModal({...a,id:a.id||i})
  }, signatures[a.id||i]?'✅ Re-sign':'✍ Sign'),
  approvers.length > 1 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setApprovers(p => p.filter((_, j) => j !== i)),
    style: {
      position: 'absolute',
      top: 2,
      right: 3,
      background: 'none',
      border: 'none',
      color: ERR,
      cursor: 'pointer',
      fontSize: 11,
      lineHeight: 1,
      padding: '1px 3px',
      opacity: 0.5
    },
    title: "Remove"
  }, "x")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      justifyContent: 'flex-end',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn('def', true),
    onClick: () => setApprovers(p => [...p, {
      role: 'Noted By',
      name: '',
      title: ''
    }])
  }, "+ Add Signatory"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 184,
      flexShrink: 0,
      padding: '14px 12px',
      borderLeft: `1px solid ${BDR}`,
      background: CARD,
      position: 'sticky',
      top: 96,
      alignSelf: 'flex-start',
      height: 'calc(100vh - 96px)',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      marginBottom: 8
    }
  }, "Live Totals"), [...(cfg.mobDemob ? [['Mobilization', mobSubT], ['Demobilization', demobSubT]] : []), ['Manpower', mpTot], ['Tools', toolsT], ['Materials', matsT], ['PPE', ppeT], ['Misc.', miscT]].map(([lbl, val]) => /*#__PURE__*/React.createElement("div", {
    key: lbl,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11
    }
  }, lbl), /*#__PURE__*/React.createElement("span", {
    style: {
      ...MONO,
      fontSize: 11,
      color: val > 0 ? TX : MT
    }
  }, "P", ph(val)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${BDR}`,
      marginTop: 6,
      paddingTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      marginBottom: 2
    }
  }, "GRAND TOTAL"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 800,
      fontSize: 15,
      color: ACC
    }
  }, "P", ph(grand)), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontSize: 10,
      color: MT,
      marginTop: 2
    }
  }, "Unit: P", ph(unitP))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      borderTop: `1px solid ${BDR}`,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      marginBottom: 5,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "Quick Rates"), masterlist.manpower.slice(0, 5).map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 10,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1,
      paddingRight: 3
    }
  }, r.role.split(' ')[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      ...MONO,
      fontSize: 10,
      color: TX
    }
  }, "P", r.rate))), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 9,
      marginTop: 4,
      lineHeight: 1.5
    }
  }, "Night x1.25 - Sun x1.3", /*#__PURE__*/React.createElement("br", null), "Holiday x2.0 - Benefits +20%")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      borderTop: `1px solid ${BDR}`,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "AI Provider"), getApiKey() && provInfo ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: provInfo.bc
    }
  }, provInfo.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: MT,
      marginTop: 1
    }
  }, provInfo.badge)) : /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: ERR
    }
  }, "Not configured"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      width: '100%',
      justifyContent: 'center',
      fontSize: 10,
      marginTop: 5
    },
    onClick: () => {
      setApiKeyInput('');
      setShowApiKey(true);
    }
  }, "Change Provider")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      borderTop: `1px solid ${BDR}`,
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: MT,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.07em'
    }
  }, "History"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontSize: 14,
      fontWeight: 700,
      color: INFO
    }
  }, history.length), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      marginBottom: 5
    }
  }, "saved estimates"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def', true),
      width: '100%',
      justifyContent: 'center',
      fontSize: 10
    },
    onClick: () => setTab('history')
  }, "View All")))));
}
class AppBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(e) {
    return {
      error: e
    };
  }
  render() {
    if (this.state.error) {
      return /*#__PURE__*/React.createElement("div", {
        style: {
          background: '#0D1117',
          color: '#F85149',
          padding: 40,
          fontFamily: 'monospace',
          minHeight: '100vh'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 800,
          fontSize: 18,
          marginBottom: 16
        }
      }, "SY3 Runtime Error"), /*#__PURE__*/React.createElement("pre", {
        style: {
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          marginBottom: 16
        }
      }, this.state.error.message), /*#__PURE__*/React.createElement("pre", {
        style: {
          fontSize: 10,
          color: '#7D8590',
          whiteSpace: 'pre-wrap'
        }
      }, this.state.error.stack));
    }
    return this.props.children;
  }
}
