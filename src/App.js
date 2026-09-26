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
/* A CE number as something sortable: [year, sequence, ...revision].

   The sequence restarts every year -- SY3-CE-2025-0674, then SY3-CE-2026-0001
   -- so on its own it is meaningless, and a plain string sort puts the company
   prefix first, filing every SHIC CE ahead of every SY3 one regardless of when
   either was raised.

   Handles the shapes actually in use: SY3-CE-2025-0674, SHIC-CE-2026-0912CR01,
   SY3-CE-2026-0091A-R1, SY3-CE-2025-0555-R2-R3. The first four-digit run is the
   year, the number after it is the sequence, and anything numeric that follows
   is revision depth -- so a base CE sorts ahead of its own revisions. */
/* A scope line lettered a. / b. / c. is a sub-step of the numbered step above
   it. One definition, so the exporter and the editor cannot disagree on what
   counts as a sub-step. */
const SUBSTEP_RE = /^\s*[a-z][.)]/i;
function ceNumKey(num) {
  const s = String(num || '');
  const m = s.match(/(\d{4})\D+(\d+)/);
  if (!m) return null;
  const rest = s.slice(m.index + m[0].length);
  return [Number(m[1]), Number(m[2]), ...(rest.match(/\d+/g) || []).map(Number)];
}

/* A number box you can actually type in.

   These were plain controlled inputs that re-parsed the text on every
   keystroke -- `value: r.days` against `parseInt(e.target.value) || 1` -- so
   the box was rewritten as it was being typed:

     - the "." in 4.5 was parsed away the instant it was typed, because
       parseFloat('4.') is 4, so a decimal could not be entered at all;
     - clearing the box to type a new figure snapped it straight back to its
       minimum, because parseFloat('') is NaN and the `|| 1` caught it;
     - a min of 1 pushed a half-typed number up before it was finished.

   Which is why a figure had to be entered one character at a time, clicking
   back into the box between each one.

   The text typed is kept in a buffer while the box has focus and is only
   parsed on the way out, so what is typed survives. The model still updates
   on every keystroke from whatever parses so far, so the row total and the
   subtotals move as you type -- the buffer changes what the box SHOWS, not
   when the CE is costed. */
/* `allowBlank` is for the fields where empty is a real answer rather than a
   half-typed one: a tool with no unit price on file is not a tool that cost
   nothing, and a service role with no days of its own runs the whole project.
   Those commit '' instead of falling back to the minimum. */
function NumBox({value, onCommit, min, max, step, intOnly, allowBlank, style, title, placeholder}) {
  const [buf, setBuf] = React.useState(null);
  const clamp = v => {
    if (!isFinite(v)) return null;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  };
  const parse = raw => clamp(intOnly ? parseInt(raw, 10) : parseFloat(raw));
  const shown = buf !== null ? buf
    : (value === '' || value === null || value === undefined) ? '' : String(value);
  return /*#__PURE__*/React.createElement("input", {
    type: "number", min, max, step, style, title, placeholder,
    value: shown,
    onChange: e => {
      const raw = e.target.value;
      setBuf(raw);
      /* An empty box is someone midway through replacing a figure, not a
         request to set it to zero -- unless blank is itself an answer here. */
      if (raw === '') { if (allowBlank) onCommit(''); return; }
      const v = parse(raw);
      if (v !== null) onCommit(v);
    },
    /* Leaving the box is when a half-typed figure has to become a number:
       an empty one falls back to the minimum, "4." settles as 4. */
    onBlur: e => {
      setBuf(null);
      const v = parse(e.target.value);
      if (v !== null) { onCommit(v); return; }
      onCommit(allowBlank ? '' : (min !== undefined ? min : 0));
    }
  });
}

/* ── A CE and its revisions ───────────────────────────────────────────────
   R01 of a CE is not another CE. Counted as one, a job revised twice was
   three rows in the list, three in the CE count, and its value three times
   over in the pipeline -- so the figure the Dashboard reported was overstated
   by every superseded revision on file.

   Revision markers take every shape anyone has typed. The app's own Revise
   button writes -R1, but the numbers in the lists are mostly R01, sometimes
   with a space, and a CE revised off a revision carries both: -R2-R3. The
   family is what is left once they are all stripped, compared with spaces,
   dashes and case removed -- "0912B R01" and "0912BR01" differ by exactly one
   space somebody did or did not type, and they have to land in the same
   family or the whole exercise misses the case it was built for.

   The LAST marker written is the revision in force: -R2-R3 is revision 3. */
const CE_REV_RE = /[\s_.-]*R(\d+)\s*$/i;
function ceFamily(num) {
  let s = String(num || '').trim();
  let rev = null, m;
  while ((m = s.match(CE_REV_RE))) {
    if (rev === null) rev = Number(m[1]);
    s = s.slice(0, m.index);
    if (!s.trim()) break;   /* a number that is nothing BUT a revision marker */
  }
  return {
    key: s.toUpperCase().replace(/[\s_.-]+/g, ''),
    base: s.trim(),
    rev: rev === null ? 0 : rev
  };
}
/* Collapse a list of CEs so each one appears once, at its newest revision.

   `dup` is the case that must not be quietly merged: two entries claiming the
   SAME revision of the same number are not a base and its revision, they are
   a numbering collision -- two different jobs, two different estimators, two
   different amounts. Merging them would hide one of the two and the money with
   it. So a family holding a collision is not collapsed at all; every row stays,
   flagged, for a person to sort out. */
function groupCERevisions(rows, numOf) {
  const fam = {}, order = [];
  rows.forEach((e, i) => {
    const f = ceFamily(numOf(e));
    /* No parseable number is no family: such a row stands alone rather than
       joining every other unnumbered row in one meaningless group. */
    const k = f.key || ('#unnumbered:' + i);
    if (!fam[k]) { fam[k] = []; order.push(k); }
    fam[k].push({e, rev: f.rev});
  });
  const out = [];
  order.forEach(k => {
    const list = fam[k];
    if (list.length === 1) { out.push({head: list[0].e, revs: [], rev: list[0].rev, dup: false}); return; }
    const top = list.reduce((mx, x) => Math.max(mx, x.rev), 0);
    if (list.filter(x => x.rev === top).length > 1) {
      list.forEach(x => out.push({head: x.e, revs: [], rev: x.rev, dup: true}));
      return;
    }
    const sorted = list.slice().sort((a, b) => b.rev - a.rev);
    out.push({head: sorted[0].e, revs: sorted.slice(1).map(x => x.e), rev: sorted[0].rev, dup: false});
  });
  return out;
}

/* Money in the masterlist is held to centavos.

   A tool's daily cost is annualCost / 365, and that divides evenly almost
   never: the list was showing 52.602739726027394 in a field somebody has to
   read a price out of. Rounding only on the way to the screen would leave the
   stored figure ragged, so an export, a CE built from that row, and the list
   itself would disagree in the third decimal -- and pennies compounded across
   a thousand-line CE stop being pennies.

   So it is rounded once, in the shape every path shares, rather than at each
   of the places that read it.

   A blank is left blank. An empty cost means "not priced yet" and a 0 means
   "free", and turning the first into the second is how an unpriced item goes
   out of the door looking deliberate. */
function mlRound(ml) {
  if (!ml || typeof ml !== 'object') return ml;
  const secs = ['manpower', 'tools', 'materials', 'ppe', 'vehicles'];
  const money = ['cost', 'rate', 'perDiem'];
  const out = { ...ml };
  secs.forEach(k => {
    if (!Array.isArray(out[k])) return;
    out[k] = out[k].map(r => {
      if (!r || typeof r !== 'object') return r;
      let hit = null;
      money.forEach(f => {
        if (r[f] === undefined || r[f] === null || r[f] === '') return;
        const v = parseFloat(r[f]);
        if (!isFinite(v)) return;
        const rounded = Math.round(v * 100) / 100;
        if (rounded === r[f]) return;
        (hit = hit || { ...r })[f] = rounded;
      });
      return hit || r;
    });
  });
  return out;
}

function mlShape(ml) {
  if (!ml || typeof ml !== 'object' || Array.isArray(ml)) return null;
  /* 'materials' and 'vehicles', not 'mats'. The wrong name meant a stored
     masterlist never had its materials backfilled -- it got a junk `mats: []`
     instead -- and a list holding ONLY materials or vehicles was rejected as
     empty, falling back to the built-in defaults and hiding the real one. */
  const secs = ['manpower', 'tools', 'materials', 'ppe', 'vehicles'];
  if (!secs.some(k => Array.isArray(ml[k]) && ml[k].length)) return null;
  const out = { ...ml };
  secs.forEach(k => { if (!Array.isArray(out[k])) out[k] = (typeof DEFAULT_ML !== 'undefined' && Array.isArray(DEFAULT_ML[k])) ? DEFAULT_ML[k] : []; });
  /* Rounds a list already stored ragged, so an existing masterlist is tidied
     by opening it rather than only by editing every row. */
  return mlRound(out);
}

/* RATE TRENDS.
   ============
   The clock answers "what did we charge for this" one row at a time. This
   answers the question you cannot ask a row: which of these rates has the
   masterlist stopped keeping up with?

   A list goes stale quietly. Nobody notices a rate that has not moved in two
   years, because nothing anywhere compares it to what the CEs are actually
   charging -- and by the time somebody does, every quote built on it has
   already gone out. The default view is that comparison, worst first.

   It lives out here rather than inside App deliberately. Declared in there it
   would take a fresh function identity on every App render and React would
   remount it each time, recomputing both memos; rendering it as a bare call
   instead would only move the problem, since the call is conditional on the
   masterlist tab and its hooks would come and go from App's own hook
   sequence. check-remounting-editors.js is the guard that says so. */
function MlTrendModal({ mlTrend, setMlTrend, masterlist, ML_HIST_KIND }) {
  /* Every hook runs on every render: the guard for "the view is closed" sits
     BELOW them, not above. An early return that skips a hook changes the hook
     order between renders of the same mounted component. */
  const tab = (mlTrend && mlTrend.tab) || 'materials';
  const pick = (mlTrend && mlTrend.pick) || null;
  const kind = ML_HIST_KIND[tab];
  const key = (tab === 'manpower' || tab === 'vehicles') ? 'rate' : 'cost';
  const nk = tab === 'manpower' ? 'role' : 'desc';
  const money = v => (v === null || v === undefined) ? '—' :
    '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* --- how far the masterlist has drifted from what we actually charge --- */
  const drift = React.useMemo(() => {
    if (!mlTrend) return [];
    /* One pass over the history, not one per row. Asking shicRateUses for
       every item would rescan all 896 CEs two thousand times over, and
       Materials -- the biggest tab -- is the one most likely to be opened. */
    const norm = n => String(n || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const listKey = { mp: 'mp', tools: 'tools', mats: 'mats', ppe: 'ppe' }[kind];
    const keys = listKey ? [listKey] : ['mobVehicles', 'demobVehicles'];
    const idx = {};
    ((typeof window !== 'undefined' && window.shicHistory) || []).forEach(ce => {
      const info = ce.info || {};
      /* Issued CEs only, for the same reason Fill missing prices uses them: a
         figure scraped out of a spreadsheet is not a rate anybody approved,
         and it must not be the thing that tells you your list is wrong. */
      if (!(ce.savedAt && (info.ceNum || ce.ceNum))) return;
      keys.forEach(k => (ce[k] || []).forEach(r => {
        const nm = norm(r.role || r.desc);
        if (!nm) return;
        const v = Number(r.rate !== undefined && r.rate !== '' && r.rate !== null ? r.rate : r.cost);
        if (!isFinite(v) || v <= 0) return;
        (idx[nm] = idx[nm] || []).push({ rate: v, when: ce.savedAt, ceNum: info.ceNum || ce.ceNum || '' });
      }));
    });
    Object.keys(idx).forEach(k => idx[k].sort((a, b) => (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0)));
    const rows = [];
    (masterlist[tab] || []).forEach(r => {
      const nm = String(r[nk] || '').trim();
      if (!nm) return;
      const u = idx[norm(nm)];
      if (!u || !u.length) return;
      const listed = N(r[key]);
      /* An unpriced row is not drifted, it is empty -- Fill missing prices is
         the tool for that, and mixing the two would bury the rates that really
         have moved under six hundred blanks. */
      if (!listed) return;
      const latest = u[0].rate;
      rows.push({ name: nm, listed, latest, uses: u, gap: latest - listed, pct: (latest - listed) / listed });
    });
    rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return rows;
  }, [tab, kind, key, nk, masterlist, !!mlTrend]);

  /* --- one item, by quarter --- */
  const detail = React.useMemo(() => {
    if (!pick) return null;
    const u = (typeof shicRateUses === 'function' ? shicRateUses(kind, pick, 200) : []).filter(x => x.issued);
    const q = {};
    u.forEach(x => {
      const d = new Date(x.when);
      const k = isNaN(d) ? 'undated' : d.getFullYear() + ' Q' + (Math.floor(d.getMonth() / 3) + 1);
      (q[k] = q[k] || []).push(x);
    });
    return Object.keys(q).sort().reverse().map(k => {
      const rs = q[k].map(x => x.rate);
      return {
        q: k, n: rs.length,
        min: Math.min.apply(null, rs), max: Math.max.apply(null, rs),
        avg: rs.reduce((a, b) => a + b, 0) / rs.length,
        rows: q[k]
      };
    });
  }, [pick, kind]);

  const hi = detail && detail.length ? Math.max.apply(null, detail.map(d => d.max)) : 0;
  if (!mlTrend) return null;

  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: '#000A', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 200, padding: 16
    },
    onClick: e => { if (e.target === e.currentTarget) setMlTrend(null); }
  },
    React.createElement('div', { style: { ...CS, maxWidth: 860, width: '100%', maxHeight: '90vh', overflowY: 'auto' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 } },
        React.createElement('span', { style: { fontWeight: 700, fontSize: 13 } }, 'Rate Trends'),
        React.createElement('span', { style: { color: MT, fontSize: 11 } }, tab),
        React.createElement('button', {
          style: { ...btn('def', true), marginLeft: 'auto' },
          onClick: () => setMlTrend(null)
        }, 'Close')),

      pick ? React.createElement('div', null,
        React.createElement('button', {
          style: { ...btn('def', true), marginBottom: 10 },
          onClick: () => setMlTrend({ tab, pick: null })
        }, '← All items'),
        React.createElement('div', { style: { fontWeight: 700, fontSize: 12, marginBottom: 8 } }, pick),
        !detail || !detail.length
          ? React.createElement('div', { style: { color: 'var(--status-warning)', fontSize: 11 } },
            'No issued CE has costed this item.')
          : React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            React.createElement('thead', null, React.createElement('tr', null,
              ['Quarter', 'CEs', 'Low', 'Average', 'High', ''].map(h =>
                React.createElement('th', { key: h, style: { ...THS, textAlign: (h === 'Quarter' || h === '') ? 'left' : 'right' } }, h)))),
            React.createElement('tbody', null, detail.map(d =>
              React.createElement('tr', { key: d.q },
                React.createElement('td', { style: TDS }, d.q),
                React.createElement('td', { style: { ...TDS, textAlign: 'right' } }, d.n),
                React.createElement('td', { style: { ...TDS, ...MONO, textAlign: 'right', color: MT } }, money(d.min)),
                React.createElement('td', { style: { ...TDS, ...MONO, textAlign: 'right', fontWeight: 700, color: ACC } }, money(d.avg)),
                React.createElement('td', { style: { ...TDS, ...MONO, textAlign: 'right', color: MT } }, money(d.max)),
                /* A bar, not a chart. The shape of the movement is the whole
                   question and it does not need axes to be read. */
                React.createElement('td', { style: { ...TDS, width: 180 } },
                  React.createElement('div', {
                    title: d.rows.map(r => (r.ceNum || '?') + ': ' + money(r.rate)).join('\n'),
                    style: {
                      background: alpha(ACC, '33'), height: 8, borderRadius: 4,
                      width: hi ? Math.max(4, Math.round(d.avg / hi * 170)) : 4
                    }
                  }))))))
      ) : React.createElement('div', null,
        React.createElement('div', { style: { color: MT, fontSize: 11, marginBottom: 10 } },
          drift.length
            ? 'Where the masterlist and the most recent CE disagree, furthest first. Click an item for its history by quarter.'
            : 'No item in this tab has both a price and a saved CE to compare it against.'),
        React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          React.createElement('thead', null, React.createElement('tr', null,
            ['Item', 'Masterlist', 'Last charged', 'Difference', 'CEs'].map(h =>
              React.createElement('th', { key: h, style: { ...THS, textAlign: h === 'Item' ? 'left' : 'right' } }, h)))),
          React.createElement('tbody', null, drift.slice(0, 60).map(d => {
            const up = d.gap > 0;
            const flat = Math.abs(d.pct) < 0.005;
            return React.createElement('tr', {
              key: d.name,
              onClick: () => setMlTrend({ tab, pick: d.name }),
              style: { cursor: 'pointer' }
            },
              React.createElement('td', { style: TDS }, d.name),
              React.createElement('td', { style: { ...TDS, ...MONO, textAlign: 'right', color: MT } }, money(d.listed)),
              React.createElement('td', { style: { ...TDS, ...MONO, textAlign: 'right' } }, money(d.latest)),
              React.createElement('td', {
                style: {
                  ...TDS, ...MONO, textAlign: 'right', fontWeight: 700,
                  color: flat ? MT : (up ? 'var(--status-danger)' : 'var(--status-success)')
                }
              }, flat ? 'in step' : (up ? '+' : '') + Math.round(d.pct * 100) + '%'),
              React.createElement('td', { style: { ...TDS, textAlign: 'right', color: MT } }, d.uses.length));
          }))),
        drift.length > 60 ? React.createElement('div', { style: { color: MT, fontSize: 10, marginTop: 8 } },
          'Showing the 60 furthest out of ' + drift.length + '.') : null,
        /* Red is the one that costs money: the list is under what the CEs
           charge, so every quote built on it under-recovers. */
        drift.length ? React.createElement('div', { style: { color: MT, fontSize: 10, marginTop: 8 } },
          'Red means the masterlist is BELOW what was last charged — a quote built on it under-recovers.') : null
      )));
}

function App({
  currentUser,
  onLogout
}) {
  const [ceType, setCeType] = useState("onsite");
  const [tab, setTab] = useState("mywork");
  const [info, setInfo] = useState({
    ...BLANK_INFO
  });
  /* No starter row. Every shift group already has its own empty state, so a
     blank row bought nothing and cost the user a stray "Role name..." line
     on every new CE -- one they had to either fill or delete. */
  const [mp, setMp] = useState([]);
  const [tools, setTools] = useState([mkRes()]);
  const [mats, setMats] = useState([mkRes()]);
  const [ppe, setPpe] = useState([mkRes()]);
  const [misc, setMisc] = useState({
    ...BLANK_MISC
  });
  const [mobVehicles, setMobVehicles] = useState([]);
  /* Copy from Mobilization picker: null when closed, else the ids ticked. */
  const [mobCopy, setMobCopy] = useState(null);
  /* Units written one way on every line, however they arrived -- Masterlist,
     import, Scope Library, typed or an older saved CE. See uomCase. */
  const _uomFix = l => Array.isArray(l) && l.some(r => r && r.uom && r.uom !== uomCase(r.uom))
    ? l.map(r => r && r.uom ? {...r, uom: uomCase(r.uom)} : r) : null;
  const [demobVehicles, setDemobVehicles] = useState([]);
  React.useEffect(() => {
    const t = _uomFix(tools); if (t) setTools(t);
    const m = _uomFix(mats); if (m) setMats(m);
    const p = _uomFix(ppe); if (p) setPpe(p);
    const mv = _uomFix(mobVehicles); if (mv) setMobVehicles(mv);
    const dv = _uomFix(demobVehicles); if (dv) setDemobVehicles(dv);
    const mk = Object.keys(misc || {}).filter(k => _uomFix(misc[k]));
    if (mk.length) setMisc(q => { const n = {...q}; mk.forEach(k => { n[k] = _uomFix(q[k]) || q[k]; }); return n; });
  }, [tools, mats, ppe, misc, mobVehicles, demobVehicles]);
  const [scope, setScope] = useState('');
  const [notes, setNotes] = useState([]); /* [{id,seq,text}] */
  /* Presets configured in the Users tab: notes and signatories per CE type and
     discipline. Shared through SharePoint, so setting one sets it for
     everybody. */
  const [ceDefaults, setCeDefaults] = useState([]);
  /* What the last applied preset put on screen. Changing the CE type or the
     discipline re-applies only while the notes and signatories still match
     this -- otherwise switching Onsite to Supply would throw away signatures
     and notes the estimator had just typed. */
  const _defaultsSig = useRef(JSON.stringify({n: [], a: CE_FALLBACK_APPROVERS}));
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
  const [approvers, setApprovers] = useState(JSON.parse(JSON.stringify(CE_FALLBACK_APPROVERS)));
  ;
  const [aiLoad, setAiLoad] = useState(false);
  const [margin, setMargin] = useState(0);
  /* What the estimator wants a reviewer to know about a cost group --
     "8 certified techs, night differentials included". Keyed on the
     group's label so it survives sections appearing and disappearing:
     mobilisation only exists on onsite CEs, and an index would move
     every note one row up the moment a section went to zero. */
  const [verifyNotes, setVerifyNotes] = useState({});
  /* The multipliers this CE is priced at. Empty means "the statutory
     defaults", which is what every CE written before this carries -- so
     nothing already saved reprices. */
  /* A blank CE starts on the company standard (Admin -> Shift Multipliers). */
  const _initRates = React.useRef(null);
  const [rates, setRates] = useState(() => (_initRates.current = stampRates()));
  /* Resolved once per render and handed to every cost site, so the editor,
     the totals, the print and the exports cannot disagree about what a night
     shift costs. */
  const rr = useMemo(() => ceRates({rates}), [rates]);
  const [addlCosts, setAddlCosts] = useState([]); /* [{id,label,src,srcs,amount}] — callouts of costs already inside the CE */
  /* Which highlighted row has its source picker open, and what has been typed
     into that picker's filter. Editor-only: neither is saved with the CE. */
  const [hlPick, setHlPick] = useState(null);
  const [hlPickQ, setHlPickQ] = useState('');
  const [toast, setToast] = useState('');
  const [signatures, setSignatures] = useState({});
  const [sigModal, setSigModal] = useState(null);
  /* Approval routing: the people a signatory line can be linked to, and a
     request to save once the state set alongside it has landed. */
  const [apvUsers, setApvUsers] = useState([]);
  const [saveReq, setSaveReq] = useState(0);
  /* My Signature: the signed-in user's saved signature, and whether its editor is open. */
  const [mySig, setMySig] = useState('');
  const [mySigOpen, setMySigOpen] = useState(false);
  useEffect(() => { if (currentUser && currentUser.username) dbGetMySig(currentUser.username).then(v => setMySig(v || '')).catch(() => {}); }, [currentUser && currentUser.username]);
  /* Any image, drawn onto a white 420x140 canvas the same shape as the pad. */
  const sigFit = src => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 420; c.height = 140;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 420, 140);
      const k = Math.min(400 / img.width, 130 / img.height);
      const w = img.width * k, h = img.height * k;
      x.drawImage(img, (420 - w) / 2, (140 - h) / 2, w, h);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => rej(new Error('That file is not an image the browser can read.'));
    img.src = src;
  });
  const saveMySig = async img => {
    const ok = await dbSaveMySig(currentUser.username, img);
    setMySig(img);
    showToast(img ? (ok ? 'Signature saved to your account.' : 'Signature saved in this browser only — SharePoint did not accept it.') : 'Saved signature removed.', !ok && (USE_SP || getSiteURL()));
  };
  /* Masterlist Trash: null when closed, else the entries. */
  const [mlTrash, setMlTrash] = useState(null);
  const mlTrashItemName = it => (it && (it.desc || it.role)) || '(unnamed)';
  const mlToTrash = async (tab, items) => {
    const at = new Date().toISOString(), by = currentUser?.name || currentUser?.username || '';
    const r = await dbMLTrashOp({ add: items.map(item => ({ key: uid(), tab, item, at, by })) });
    if (r && r.sp === false && (USE_SP || getSiteURL())) showToast('Moved to Trash in this browser only — SharePoint did not accept it.', true);
  };
  const openMlTrash = () => { setMlTrash([]); dbGetMLTrash().then(l => setMlTrash(l || [])).catch(() => setMlTrash([])); };
  const mlRestore = async entries => {
    const next = {...masterlist};
    let n = 0;
    entries.forEach(e => {
      const cur = next[e.tab] || [];
      const k = String(mlTrashItemName(e.item)).trim().toUpperCase();
      if (cur.some(r => String(mlTrashItemName(r)).trim().toUpperCase() === k)) return;
      next[e.tab] = [{...e.item, id: e.item.id || uid()}, ...cur]; n++;
    });
    if (n) await saveML(next);
    const r = await dbMLTrashOp({ remove: entries.map(e => e.key) });
    setMlTrash(r.list || []);
    auditLog('masterlist_restore', entries.map(e => e.tab + ':' + mlTrashItemName(e.item)).join(', '), currentUser?.username);
    showToast(n === entries.length ? 'Restored ' + n + ' item' + (n === 1 ? '' : 's') + '.' : 'Restored ' + n + '; ' + (entries.length - n) + ' already in the list under the same name.');
  };
  const mlPurge = async entries => {
    if (!confirm('Delete ' + entries.length + ' item' + (entries.length === 1 ? '' : 's') + ' permanently?\n\nThis cannot be undone.')) return;
    const r = await dbMLTrashOp({ remove: entries.map(e => e.key) });
    setMlTrash(r.list || []);
    auditLog('masterlist_purge', entries.map(e => e.tab + ':' + mlTrashItemName(e.item)).join(', '), currentUser?.username);
  };
  /* Bumped when the company feature switches arrive or change, so the
     editor re-reads them. */
  const [featTick, setFeatTick] = useState(0);
  useEffect(() => { const h = () => setFeatTick(n => n + 1); window.addEventListener('shic-features', h); return () => window.removeEventListener('shic-features', h); }, []);
  const [diffModal, setDiffModal] = useState(null);
  /* CE Monitoring -> View: the printable CE of a saved CE, shown in place. */
  const [viewCE, setViewCE] = useState(null);
  /* The CE whose request checklist an approver has opened from the viewer.
     Approvers kept asking what the client actually sent, and the answer --
     the RCE checklist Sales filled in -- was only ever visible to the
     estimator with the CE loaded. Holds a ceId. */
  const [viewRce, setViewRce] = useState(null);
  /* CE Monitoring -> Remarks trail: {id, ceNum} of the CE whose remarks are open. */
  const [remarksPanel, setRemarksPanel] = useState(null);
  const [remarkDraft, setRemarkDraft] = useState('');
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
  /* De-duplicated: a status someone added by hand ("Revised") and then made standard must not show twice. */
  const allStatuses = useMemo(() => [...new Set([...DEFAULT_STATUS_OPTIONS, ...customStatuses])], [customStatuses]);
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
  /* When each CE's row was last changed here. A fetch that was already in
     flight when someone changed a status came back holding the row from
     before it and replaced the table wholesale -- the change was on screen,
     then gone the next time the tab was opened. A row changed since a fetch
     began is kept as this browser has it; the write is on its way to the
     site and the next fetch will carry it. */
  const _monWroteAt = React.useRef({});
  const loadMonData = async () => {
    const _fetchAt = Date.now();
    const _keepMine = incoming => {
      const mine = _monWroteAt.current, out = {...incoming};
      let kept = 0;
      Object.keys(mine).forEach(id => { if (mine[id] && mine[id].at >= _fetchAt) { out[id] = mine[id].row; kept++; } });
      if (kept) console.warn('monitoring: kept ' + kept + ' row(s) changed here while the list was loading');
      return out;
    };
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
      let r = await dbGetMon();
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
        r = {...r, data: _keepMine(r.data)};
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
  /* A stored stamp is a full ISO timestamp; a date input wants YYYY-MM-DD in
     LOCAL time. Slicing the ISO string instead would shift the date back a day
     for anything stamped before 08:00 in Manila. */
  const monDateInput = v => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  /* One edit, one write. Two calls in the same tick each read the SharePoint
     row, put their own field on what they read and patch it back -- so the
     one that lands second carries a copy of the row from before the first,
     and the first field is lost. That is how a status set alongside an
     approval (signed, submitted, superseded) failed to reach the site while
     the browser showed it happily. Pass an object to write several fields as
     one change. */
  const updateMon = (ceId, field, val) => setMonData(prev => {
    const fields = (field && typeof field === 'object') ? field : { [field]: val };
    const extra = {};
    /* Stamp who moved a CE and when, on EVERY status change.

       This used to fire only for a hand-picked list, which named 'Issued' and
       'For Review' -- neither a status this app has ever offered -- and missed
       'Submitted' and 'No Quote', the two that most need a trail. A CE moved
       to Ongoing or For site insp. recorded nothing at all, so the history of
       how it got where it is had holes in it.

       Clearing the status back to blank is not a change worth attributing, so
       it is left unstamped. */
    const _has = k => Object.prototype.hasOwnProperty.call(fields, k);
    if (_has('status') && fields.status) {
      const val = fields.status;
      /* A date given with the status is the date it happened -- the panel
         sends both together, and the stamp must not talk over it. */
      extra.statusChangedAt = (_has('statusChangedAt') && fields.statusChangedAt) || new Date().toISOString();
      extra.statusChangedBy = currentUser?.name || currentUser?.username || '';
      /* The whole trail, not just the latest change. statusChangedAt only ever
         held the most recent one, so "who moved this to Submitted, and when did
         it leave For Approval" had no answer -- the previous stamp was
         overwritten the moment the next change landed.

         Capped: a CE that gets toggled daily for a year should not grow an
         unbounded column in a list already at its size limits. The oldest
         entries go first, and the newest 60 are the ones anyone asks about. */
      const before = prev[ceId] || {};
      const log = Array.isArray(before.statusLog) ? before.statusLog : [];
      extra.statusLog = [...log, {
        status: val,
        from: before.status || '',
        at: extra.statusChangedAt,
        by: extra.statusChangedBy
      }].slice(-60);
    }
    /* Remarks keep a trail like status does: every remark, who wrote it and
       when. The remark already on a CE from before the trail existed becomes
       its first entry, undated, rather than being lost to the next edit. */
    if (_has('remarks')) {
      const val = fields.remarks;
      const before = prev[ceId] || {};
      let log = Array.isArray(before.remarksLog) ? before.remarksLog : [];
      if (!log.length && String(before.remarks || '').trim()) log = [{ text: String(before.remarks), at: '', by: '' }];
      if (String(val || '').trim()) log = [...log, { text: String(val).trim(), at: new Date().toISOString(), by: currentUser?.name || currentUser?.username || '' }];
      extra.remarksLog = log.slice(-60);
    }
    /* Correcting when a status changed has to correct the trail too, or the
       history would still show the day it was recorded here rather than the day
       it happened -- which is the whole point of correcting it on a CE entered
       long after the fact. */
    if (_has('statusChangedAt') && !(_has('status') && fields.status)) {
      const val = fields.statusChangedAt;
      const log0 = (prev[ceId] || {}).statusLog;
      if (Array.isArray(log0) && log0.length) {
        extra.statusLog = log0.map((h, i) => i === log0.length - 1 ? {...h, at: val} : h);
      }
    }
    const n = {
      ...prev,
      [ceId]: {
        ...prev[ceId],
        ...fields,
        ...extra
      }
    };
    try {
      _monWroteAt.current[ceId] = { at: Date.now(), row: n[ceId] };
      localStorage.setItem(MON_KEY, JSON.stringify(n));
      /* Save only the one changed CE entry, not the whole blob -- and within
         that entry, only the fields this edit touched, so a colleague's
         deadline is not written back as it stood when this page was opened. */
      const h = history.find(x => String(x.id) === String(ceId));
      const ceNum = h?.info?.ceNum || h?.ceNum || String(ceId);
      const changed = [...Object.keys(fields), ...Object.keys(extra)];
      dbSaveMonEntry(ceId, ceNum, n[ceId], changed).then(res => {
        if (res && res.ok) {
          /* Show the row the site now holds: anything somebody else changed on
             this CE came back in the merge. */
          if (res.fields) setMonData(p => {
            const m = {...p, [ceId]: res.fields};
            try { localStorage.setItem(MON_KEY, JSON.stringify(m)); } catch (_e) {}
            return m;
          });
          setSyncStatus({monitoring:'synced', lastSyncAt:new Date().toISOString(), sp:'connected', dirty:false});
        } else {
          /* It used to do nothing at all here, so a monitoring edit that
             SharePoint refused looked exactly like one it accepted. */
          setSyncStatus({monitoring:'error', dirty:true});
          showToast('Monitoring change saved in this browser only — SharePoint refused it' +
            (res && res.reason ? ': ' + String(res.reason).slice(0, 100) : '.'), true);
        }
      }).catch(e => {
        setSyncStatus({monitoring:'error', dirty:true});
        showToast('Monitoring save failed: ' + (e && e.message ? e.message : e), true);
      });
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
      const got = await dbGetSowLib();
      if (got && got.length) {
        /* A service with no number yet gets one, and that is written back so
           every browser shows the same SY3 number for it. */
        const {lib, changed} = assignSvcCodes(got);
        setSowLib(lib);
        cacheSowLib(lib);
        setSyncStatus({sowlib:'synced', lastSyncAt: new Date().toISOString()});
        if (changed.length) saveSowLib(lib);
      } else setSyncStatus({sowlib:'local'});
    } catch (e) { console.warn('Scope library load failed:', e.message); setSyncStatus({sowlib:'error'}); }
  };
  /* Save the library, and come back with whatever somebody else put there
     while this browser was holding its copy.

     The library is read once, at startup. Editing one service used to write
     the whole list back as the truth, so every service added by a colleague
     since this tab was opened was deleted -- with a green tick in the sidebar,
     because nothing looked at the result. Their services are now merged back
     in and named in a toast, and a save that fails says so.

     opts.deleted: ids this caller means to be gone. opts.replace: true only
     for Import-replace and Reset Defaults, which really do mean "just this". */
  const saveSowLib = (lib, opts) => {
    setSowLib(lib);
    cacheSowLib(lib);
    if (!(USE_SP || getSiteURL())) return;
    setSyncStatus({sowlib: 'saving'});
    dbSaveSowLib(lib, opts).then(res => {
      if (!res || !res.sp) {
        setSyncStatus({sowlib: 'error'});
        showToast('Scope Library saved on this device only — SharePoint refused it' +
          (res && res.reason ? ': ' + res.reason : '.'), true);
        return;
      }
      const adopted = res.adopted || [];
      if (adopted.length) {
        /* Theirs first: they are the ones the user has not seen yet. */
        const merged = [...adopted, ...lib];
        setSowLib(merged);
        cacheSowLib(merged);
        showToast(adopted.length + ' service' + (adopted.length === 1 ? '' : 's') +
          ' added by someone else since you opened this page ' +
          (adopted.length === 1 ? 'was' : 'were') + ' kept: ' +
          adopted.slice(0, 3).map(s => s.title || '(untitled)').join(', ') +
          (adopted.length > 3 ? ' and ' + (adopted.length - 3) + ' more' : '') + '.');
      }
      setSyncStatus({sowlib: 'synced', lastSyncAt: new Date().toISOString()});
    }).catch(e => {
      setSyncStatus({sowlib: 'error'});
      showToast('Scope Library save failed: ' + (e && e.message ? e.message : e), true);
    });
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
  /* Scope Library editor state -- see the note in ScopeLibraryEditor for why it
     cannot live inside that component. */
  const [_libSearch, _setLibSearch] = useState('');
  const [_libCat, _setLibCat] = useState('All');
  const [_editSvc, _setEditSvc] = useState(null);
  const [_editDraft, _setEditDraft] = useState(null);
  const [_resTab, _setResTab] = useState('mp');
  /* Re-read the library when the tab is opened. It used to be read once, at
     startup, so a service a colleague added this morning was invisible until
     the page was reloaded -- and the tab is exactly where somebody goes to
     look for it. Throttled, and never while a service is open in the editor,
     which would swap the list out from under the draft. */
  const sowLibReadAt = useRef(0);
  useEffect(() => {
    if (tab !== 'scopelib' || !(USE_SP || getSiteURL()) || _editSvc) return;
    if (Date.now() - sowLibReadAt.current < 60000) return;
    sowLibReadAt.current = Date.now();
    loadSowLib();
  }, [tab, _editSvc]);
  /* And the same for the Masterlist, for the same reason -- it is one blob read
     once at startup, so another user's new rate was invisible until a reload.
     Not while a save is in flight, which would paint the pre-save copy back. */
  const mlReadAt = useRef(0);
  useEffect(() => {
    if (tab !== 'masterlist' || !(USE_SP || getSiteURL())) return;
    if (getSyncStatus().masterlist === 'saving') return;
    if (Date.now() - mlReadAt.current < 60000) return;
    mlReadAt.current = Date.now();
    loadML();
  }, [tab]);
  /* And the monitoring table, where several people work on the same CEs and a
     status set an hour ago is exactly what somebody opens this tab to see. The
     CE list itself still comes from the Refresh button -- that is 800 rows. */
  const monReadAt = useRef(0);
  useEffect(() => {
    if (tab !== 'history' || !(USE_SP || getSiteURL())) return;
    if (getSyncStatus().monitoring === 'saving') return;
    if (Date.now() - monReadAt.current < 60000) return;
    monReadAt.current = Date.now();
    loadMonData();
  }, [tab]);
  /* Merge a role or item shared by two services into one row. Off by default:
     a merged row can only be filed against one scope task, so the other task
     shows no cost for work it really does need -- and once a role carries its
     own duration, merging a 3-day welder with a 5-day one produces a row that
     is neither. On is still offered for a short, flat resource list. */
  const [sowMergeAcross, setSowMergeAcross] = useState(false);
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
  const _lastDraftId = useRef(null); /* the draft row this session wrote, whatever it was numbered */
  /* A CE asked for by URL, to be printed or exported the moment it is on
     screen. Printing another CE used to mean loading it over the one being
     worked on; this opens its own tab instead, so nothing in the tab you are
     working in moves. */
  const [autoPrint, setAutoPrint] = useState(null);
  /* Scoped to this account: the window now outlives the tab, so a colleague
     signing in on the same browser must not inherit the bypass. */
  const [bulkOn, setBulkOn] = useState(() => bulkMode.on(currentUser?.username));
  const [, setBulkTick] = useState(0);
  useEffect(() => {
    /* Poll as well as listen: the window expires on a timer, so the banner
       has to disappear on its own without another user action. */
    const h = () => setBulkOn(bulkMode.on(currentUser?.username));
    window.addEventListener('shic:bulk:changed', h);
    const t = setInterval(h, 5000); /* short, so the banner clears promptly when the window expires */
    /* bulkOn is a boolean, so setting it to true again never re-renders -- the
       banner's "3d 23h left", and the "open for N days" warning that appears
       after a day, stayed frozen at whatever they were when some unrelated
       action last redrew the page. A separate tick redraws them, once a minute
       and only while the window is actually open, because App is a large tree
       to re-render for a clock. */
    const tick = setInterval(() => {
      if (bulkMode.on(currentUser?.username)) setBulkTick(n => n + 1);
    }, 60000);
    return () => { window.removeEventListener('shic:bulk:changed', h); clearInterval(t); clearInterval(tick); };
  }, []);
  const _live = useRef(null);       /* current state for the auto-save timer */
  /* The owner holds every admin power on top of being unmanageable by them. */
  const isAdmin = hasAdminPowers(currentUser.role);
  /* A requestor raises a request and hands it over. The costing tabs are not
     theirs -- there is nothing on them they are allowed to change -- but a CE
     that comes back is theirs to read in full, which is what View is for. */
  const isRequestor = isRequestorRole(currentUser.role);
  const REQUESTOR_TABS = ['mywork', 'info', 'sow', 'history', 'dashboard'];
  /* Every CE number in use, not just this user's. See dbGetCeNumbers. */
  const [ceNums, setCeNums] = useState([]);
  const isOwner = isOwnerRole(currentUser.role);
  const cfg = CE_CFG[ceType] || CE_CFG.onsite || {};
  const TABS = [...(isRequestor ? CE_TABS.filter(t => REQUESTOR_TABS.indexOf(t.id) >= 0) : CE_TABS), ...(isAdmin ? [{
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
        /* A copy of the app inside a View or xlsx frame is only there to draw
           one CE. It must never save a draft under the viewer's name. */
        if(window!==window.top)return;
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
      /* Drafts are rows in Monitoring now, so they have to be loaded with the
         history rather than only when the Saved Drafts panel is opened. */
      loadSharedDrafts();
      dbGetCeDefaults().then(d => setCeDefaults(Array.isArray(d) ? d : [])).catch(e => console.warn('CE defaults:', e.message));
      /* The standard may have changed since this browser last saw it. Only the
         untouched blank CE picks the fresh one up. */
      dbGetFeatures().then(() => setFeatTick(n => n + 1)).catch(e => console.warn('Features:', e.message));
      dbGetShiftRates().then(() => setRates(p => p === _initRates.current ? (_initRates.current = stampRates()) : p)).catch(e => console.warn('Shift rates:', e.message));
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
          /* Drafts belong in here. Refresh marks them syncing and only the
             Drafts screen ever fetched them, so the finally below downgraded
             them to "this device only" on every refresh -- an amber warning
             about nothing, on a connection that was working. */
          await Promise.all([loadHist(), loadMonData(), loadML(), loadSowLib(), loadSharedDrafts(true)]);
        } finally {
          const st = getSyncStatus(), fix = {};
          ['masterlist','monitoring','drafts','sowlib'].forEach(k => { if (st[k] === 'saving') fix[k] = 'local'; });
          if (Object.keys(fix).length) setSyncStatus(fix);
        }
      };
      /* ?print=<CE id>&as=ce|detailed -- open one CE, print or export it, and
         leave every other tab alone. */
      try {
        const _q = new URLSearchParams(window.location.search);
        const _pid = Number(_q.get('print'));
        if (_pid) {
          const _as = _q.get('as') === 'detailed' ? 'detailed' : _q.get('as') === 'view' ? 'view' : 'ce';
          window.history.replaceState({}, '', window.location.pathname);
          setTimeout(async () => {
            try {
              const full = await dbLoadCE(_pid);
              if (!full) { showToast('Could not open that CE — it is not in SharePoint or this browser.', true); return; }
              await handleLoad(full);
              setAutoPrint({as: _as, ceNum: (full.info || {}).ceNum || ''});
            } catch (ex) { showToast('Could not open that CE: ' + ex.message, true); }
          }, 600);
        }
      } catch (e) { console.warn('print URL parse failed:', e.message); }
      /* ?viewdraft=<key>&as=view -- CE Monitoring's View on a draft. The draft
         has no saved record to fetch, so the row hands it over through
         localStorage under a one-time key, read once and removed here. */
      try {
        const _vq = new URLSearchParams(window.location.search);
        const _vk = _vq.get('viewdraft');
        if (_vk && /^shic:viewDraft:/.test(_vk) && window !== window.top) {
          window.history.replaceState({}, '', window.location.pathname);
          let _vd = null;
          try { _vd = JSON.parse(localStorage.getItem(_vk) || 'null'); localStorage.removeItem(_vk); } catch (_e) {}
          if (_vd && _vd.info) setTimeout(() => {
            try { applyDraftData(_vd); setAutoPrint({as: 'view', ceNum: (_vd.info || {}).ceNum || ''}); }
            catch (ex) { showToast('Could not open that draft: ' + ex.message, true); }
          }, 600);
        }
      } catch (e) { console.warn('viewdraft parse failed:', e.message); }
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
  /* A CE saved by someone else is still yours to see when its monitoring row
     assigns it to you or says you received it -- the request flow depends on
     it. Read through a ref: loadHist is called from closures older than the
     latest monitoring data. */
  const _monRef = React.useRef({});
  _monRef.current = monData;
  const mineToSee = id => {
    const m = (_monRef.current || {})[id];
    if (!m) return false;
    const me = [currentUser?.name, currentUser?.username].map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
    /* And any CE routed to them for signature. Without this an approver who is
       not an admin was told a CE waited on them but never received the CE
       itself, so there was nothing to open. */
    if (apvMonWaitsOn(m, currentUser?.username)) return true;
    return me.includes(String(m.ceeName || '').trim().toUpperCase()) || me.includes(String(m.receivedBy || '').trim().toUpperCase());
  };
  const loadHist = async () => {
    setHistBusy(true);
    /* Paint the cached history immediately, then refresh from SharePoint in the
       background. Fetching 800+ CEs takes seconds, and blocking the first render
       on it made opening the app feel like it had hung. */
    try {
      const cached = LS.get('history') || [];
      if (cached.length) setHistory(isAdmin ? cached : cached.filter(h => h.savedBy === currentUser.username || mineToSee(h.id)));
    } catch (_e) {}
    try {
      const spAvail = !!(USE_SP || getSiteURL());
      /* Alongside the history, never instead of it: this is Titles only and
         says nothing about anyone's estimates, but it is what stops two
         people being handed the same number. */
      dbGetCeNumbers().then(ns => { if (ns && ns.length) setCeNums(ns); }).catch(() => {});
      const h = await dbGetHistory(currentUser.username, isAdmin, isAdmin ? null : mineToSee);
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
        setHistory(isAdmin ? cached : cached.filter(h => h.savedBy === u || mineToSee(h.id)));
      } catch (_e) {}
    }
    setHistBusy(false);
  };
  /* opts.deleted {section:[ids]} and opts.replaceTabs [sections] say what this
     caller means to REMOVE. Everything else the site holds is somebody else's
     work and is merged back in -- see dbSaveML. */
  const saveML = async (_ml, opts) => {
    /* Import, the tier calculator, Fill missing prices, Sync Rates and Reset
       Defaults all land here. */
    const _mlU = {};
    Object.keys(_ml || {}).forEach(k => { _mlU[k] = Array.isArray(_ml[k]) ? _ml[k].map(r => r && r.uom ? {...r, uom: uomCase(r.uom)} : r) : _ml[k]; });
    const ml = mlRound(_mlU);
    setMasterlist(ml);
    try{window.shicMasterlist=ml;}catch(_e){}
    setSyncStatus({masterlist:'saving', dirty:true});
    try {
      const res = await dbSaveML(ml, opts);
      /* What SharePoint had and this browser did not. Folded into the list on
         screen, or the next save would offer to delete it all over again. */
      if (res && res.sp && res.merged && res.adopted && Object.keys(res.adopted).length) {
        const kept = mlRound(res.merged);
        setMasterlist(kept);
        try{window.shicMasterlist=kept;}catch(_e){}
        try { LS.set('masterlist', kept); } catch (_e) {}
        const n = Object.values(res.adopted).reduce((s, a) => s + a.length, 0);
        const secs = Object.keys(res.adopted).join(', ');
        showToast(n + ' ' + secs + ' item' + (n === 1 ? '' : 's') +
          ' added by someone else since you opened this page ' + (n === 1 ? 'was' : 'were') + ' kept.');
      }
      auditLog('masterlist_save', Object.keys(ml||{}).map(k=>k+':'+((ml[k]||[]).length)).join(' '), currentUser?.username);
      /* dbSaveML does not throw when SharePoint refuses -- the change is kept
         in this browser instead. Reporting that as "synced" is how a masterlist
         edit reaches nobody else while the sidebar shows a tick. */
      if (res && res.sp === false) {
        setSyncStatus({masterlist:'error', dirty:true});
        showToast('Masterlist saved in this browser only — SharePoint refused it: ' + String(res.reason||'unknown').slice(0,100), true);
      } else {
        setSyncStatus({masterlist:'synced', lastSyncAt: new Date().toISOString(), sp:'connected', dirty:false});
      }
    } catch (e) {
      setSyncStatus({masterlist:'error'});
      showToast('Masterlist save failed: ' + e.message, true);
    }
  };
  /* Rows from Tools, Materials or PPE that the Masterlist does not have yet,
     added to it from the CE -- description, unit and unit cost, plus a tool's
     tier source figures -- under the next code in that section. The category
     is 'General' until someone files it on the Masterlist. */
  const addRowsToML = (tab, list) => {
    const cur = masterlist[tab] || [];
    const have = new Set(cur.map(m => String(m.desc || '').trim().toUpperCase()));
    const pfx = 'SHIC-' + ({ tools: 'TL', materials: 'MT', ppe: 'PP' }[tab] || 'XX') + '-';
    let n = Math.max(0, ...cur.map(m => { const x = String(m.code || '').match(/-(\d+)$/); return x ? parseInt(x[1], 10) : 0; }));
    const add = [];
    (list || []).forEach(r => {
      const d = String(r.desc || '').trim(), k = d.toUpperCase();
      if (!d || have.has(k)) return;
      have.add(k);
      const src = {};
      ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].forEach(f => { if (N(r[f]) > 0) src[f] = N(r[f]); });
      add.push({ id: uid(), code: pfx + String(++n).padStart(3, '0'), category: 'General', desc: d, uom: r.uom || 'Lot', cost: N(r.cost), ...(tab === 'tools' ? src : {}) });
    });
    if (!add.length) { showToast('Already on the Masterlist.'); return; }
    if (!confirm('Add ' + add.length + ' item(s) to the shared Masterlist?\n\n' + add.map(a => a.desc + ' — ' + a.uom + ' @ P' + a.cost).join('\n') + '\n\nEveryone will see them. Set their category on the Masterlist later.')) return;
    saveML({ ...masterlist, [tab]: [...add, ...cur] });
    auditLog('masterlist_add_from_ce', tab + ': ' + add.map(a => a.desc).join(', '), currentUser?.username);
    showToast(add.length + ' item(s) added to the Masterlist (' + tab + '), category General.');
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
  /* What one manpower row is paid in wages: the shift-adjusted day rate plus
     its overtime, before benefits.

     One definition, because there were two. The per-shift subtotal printed
     under each shift computed only pax x days x rate x multiplier and left
     the overtime out, so a row reading P1,107.03 sat above a subtotal of
     P650.00 on the very same screen. Every wage figure now comes from here. */
  /* Split, because the printed CE and the detailed export give the basic pay
     and the overtime their own columns, and the editor prints "OT: P..." under
     the row total. They each carried their own copy of this arithmetic to get
     the two halves; now they take them from here. */
  const mpWageParts = r => {
    if (!r.role) return {reg: 0, ot: 0, total: 0}; /* blank starter row is not a cost */
    const mult = ceShiftMult(rr, r.shift);
    const reg = N(r.pax) * N(r.days) * N(r.rate) * mult;
    const ot = N(r.pax) * N(r.days) * (N(r.otHours || 0) / 8) * N(r.rate) * ceOtMult(rr) * mult;
    return {reg, ot, total: reg + ot};
  };
  const mpWage = r => mpWageParts(r).total;
  const mpSub = useMemo(() => mp.reduce((s, r) => s + mpWage(r), 0), [mp, rr]);
  /* Benefits are computed on the BASIC day rate, never the shift-adjusted
     one. 13th-month pay, SSS, HDMF/PHIC and SIL/ECC are statutory and scale
     with the days worked, not with what the shift pays. A night, Sunday or
     holiday premium raises the wage for those days; it does not raise the
     contributions. Applying the multiplier here inflated every one of them by
     25-100% on any CE carrying a non-straight shift.

     The premium still applies to the wage itself -- mpSub above multiplies by
     it. Only the benefits base drops it. */
  const incOn = ceIncentiveOn(ceType);
  /* Each row's share of the ECC under this CE's rule (see eccByRow). */
  const eccMap = useMemo(() => eccByRow(mp, rr), [mp, rr]);
  /* Shop + Site: which scope items are shop work. A row's Incentive counts
     only its site share, its tool power only its shop share. */
  const _workMap = useMemo(() => ceSplitOn(ceType) ? ceWorkMap(sowItems) : null, [ceType, sowItems]);
  const siteFrac = r => _workMap ? ceSiteFrac(r, _workMap) : 1;
  const pwrFrac = r => cfg.power === 'shop' ? 1 - siteFrac(r) : 1;
  const calcBen = r => {
    const pax = N(r.pax),
      days = N(r.days),
      rate = N(r.rate);
    const thirteenth = rate / 12 * days * pax;
    const sss = rate * 0.25 * 0.75 * days * pax / 26;
    const hdmf = rate * 0.16 * days * pax / 26 * 2;
    const ecc = eccMap.has(r) ? eccMap.get(r) : pax * 30;
    const sil = rate * days * pax * 5 / 12 / 26 + ecc;
    /* `perDiem` is the STORED name of the incentive -- on the row, in
       IndexedDB and as shicPerDiem in SharePoint. Everything a user reads
       says "Incentive"; the key keeps its old spelling so that no CE already
       on file has to be migrated to be read back. */
    /* Not on shop work (CE_CFG.shopworks.incentive). The figure stays on the
       row, so switching the CE back to onsite brings it back as it was. */
    const perdiem = incOn ? N(r.perDiem || 0) * days * pax * (cfg.incentive === 'site' ? siteFrac(r) : 1) : 0;
    return {
      thirteenth,
      sss,
      hdmf,
      sil,
      ecc,
      perdiem,
      total: thirteenth + sss + hdmf + sil + perdiem
    };
  };
  const ben = mp.reduce((s, r) => s + (r.role ? calcBen(r).total : 0), 0),
    mpTot = mpSub + ben;
  /* The Benefits & Others rows, as the Manpower tab shows them.

     Benefits are computed from the row by calcBen; they are never stored on
     it. The printed CE and both exports looked for r.benefits and
     r.monthlyRate -- fields no manpower row has ever carried -- so every one
     of them quietly dropped the whole table while its cost stayed inside the
     manpower total. The figures were right and the page saying where they came
     from was missing.

     Monthly rate is the basic day rate over a 26-day month, the same way the
     tab derives it -- and, like the benefits themselves, free of the shift
     premium. */
  const benefitRows = useMemo(() => {
    /* Merged by role across every shift, the way the Manpower tab merges them.
       A role worked on both a day and a night shift is one line here, not two
       lines with the same name -- which reads as two different hires.

       Merging is presentation only: each shift entry is still costed on its
       own by calcBen, with that shift's multiplier, and then added in. The
       merged row totals exactly what the separate rows did. */
    const grouped = {};
    mp.filter(r => r.role && (N(r.rate) > 0 || N(r.pax) > 0)).forEach(r => {
      const key = String(r.role).trim().toUpperCase();
      const b = calcBen(r), pax = N(r.pax) || 1;
      const g = grouped[key] || (grouped[key] = {
        role: r.role, pax: 0, paxDay: 0, paxNight: 0, paxSum: 0, days: 0, manDays: 0, daysVary: false, _d: null, shiftDays: [],
        monthlyRate: 0,
        thirteenth: 0, sss: 0, hdmf: 0, sil: 0, perdiem: 0, total: 0
      });
      /* HEADCOUNT: the day crew plus the night crew.

         A shift row is a day TYPE, not automatically a different hire. The
         same supervisor works the regular days, the Sundays and the holidays
         -- three rows, one man -- so summing every row printed "3 pax" for one
         person, and beside a DAYS of 1 that read as a crew of three on a
         single day.

         But nobody works a day shift and the night shift of the same day.
         Day and night are different people, so those two DO add: one
         supervisor on days and one on nights is two supervisors. Within each
         of the two, the most on any one shift is the crew size. */
      const _isNight = /_night$/.test(r.shift || 'regular_day');
      if (_isNight) g.paxNight = Math.max(g.paxNight, pax);
      else g.paxDay = Math.max(g.paxDay, pax);
      g.pax = g.paxDay + g.paxNight;
      /* Man-days: pax x days, summed over the shifts. Was Math.max on days,
         which described a 2 pax x 10 day + 1 pax x 2 day role as 30 man-days
         rather than 22. QTY x DAYS on the printed line is this figure. */
      g.manDays += pax * (N(r.days) || 1);
      g.paxSum += pax;
      if (g._d === null) g._d = N(r.days) || 1;
      else if (g._d !== (N(r.days) || 1)) g.daysVary = true;
      /* The shift entry itself, with its own benefits, so C.7 can show the
         role as a subtotal over one line per shift rather than asking two
         columns to summarise several different day types at once. */
      g.shiftDays.push({shift: r.shift || 'regular_day', pax, days: N(r.days) || 1,
        monthlyRate: N(r.rate) * 26, perDiem: N(r.perDiem || 0),
        thirteenth: b.thirteenth, sss: b.sss, hdmf: b.hdmf, sil: b.sil, ecc: b.ecc,
        perdiem: b.perdiem, total: b.total});
      g.monthlyRate += N(r.rate) * 26 * pax;
      ['thirteenth', 'sss', 'hdmf', 'sil', 'ecc', 'perdiem', 'total'].forEach(k => { g[k] = (g[k] || 0) + b[k]; });
    });
    /* Monthly rate is a rate: what ONE person earns in a 26-day month. It is
       weighted by pax while merging only so that roles hired at different
       rates average correctly, then divided back out. Leaving the pax in made
       a P650/day helper read as P33,800 a month at 2 pax, which is a cost, not
       a rate, and nothing else on the row is a cost. */
    return Object.values(grouped)
      .map(g => ({...g,
        /* paxSum, not the headcount: the weighting has to match how it was
           accumulated, or a role hired at two rates averages wrong. */
        monthlyRate: g.paxSum ? g.monthlyRate / g.paxSum : 0,
        /* Rounded for the column, never for the arithmetic -- manDays is the
           figure the benefits were actually computed over. */
        days: g.pax ? Math.round(g.manDays / g.pax * 100) / 100 : 0,
        /* Flagged whenever the line rolls up more than one shift: DAYS is then
           a total across day types rather than the length of any one of them,
           and the tooltip is where that gets said. */
        daysVary: g.shiftDays.length > 1}))
      .filter(x => x.total > 0);
  }, [mp, incOn, _workMap]);
  const benefitsT = benefitRows.reduce((t, r) => t + r.total, 0);
  /* Tools & Equipment can be charged per day (crane, welding machine, ...).
     `days` is optional and defaults to 1, so any row that never sets it costs
     exactly qty x cost and existing CEs keep their totals. */
  const resDays = r => (r.days === undefined || r.days === null || r.days === '') ? 1 : (N(r.days) || 0);
  /* The tariff this CE charges power at: the CE's own figure on shopworks,
     and zero everywhere else, which is what switches power costing off. One
     value, read by the tab, the totals, the print and both exports, so none
     of them can disagree about whether power was counted. */
  const powerOn = !!cfg.power && toolPowerEnabled() && featTick >= 0;
  const kwhRate = powerOn ? ceKwhRate(rr) : 0;
  const toolsT = useMemo(() => tools.reduce((s, r) => s + toolRowTotal(r, kwhRate, undefined, pwrFrac(r)), 0), [tools, kwhRate, _workMap]);
  const matsT = useMemo(() => mats.reduce((s, r) => s + N(r.qty) * N(r.cost), 0), [mats]);
  const ppeT = useMemo(() => ppe.reduce((s, r) => s + N(r.qty) * N(r.cost), 0), [ppe]);
  const miscT = useMemo(() => (MISC_DEF[ceType] || MISC_DEF['onsite']).reduce((s, [k]) => {
    const arr = Array.isArray(misc[k]) ? misc[k] : [];
    return s + arr.reduce((t, r) => t + miscRowCost(r), 0);
  }, 0), [misc, ceType]);
  const mobVehiclesT = useMemo(() => mobVehicles.reduce((s, r) => s + mobRowCost(r, rr), 0), [mobVehicles, rr]);
  const demobVehiclesT = useMemo(() => demobVehicles.reduce((s, r) => s + mobRowCost(r, rr), 0), [demobVehicles, rr]);
  /* Mobilization / demobilization crew linked to the SOW Breakdown: rows marked
     auto are rebuilt from the manpower whenever it changes -- role, pax and
     rate follow the project; days and OT stay as the estimator set them.
     Returns the same array when nothing changed, so the effect cannot loop. */
  const syncCrewRows = (list, create) => {
    const autos = list.filter(r => r.kind === 'mp' && r.auto);
    if (!autos.length && !create) return list;
    const prev = {};
    autos.forEach(r => { prev[String(r.desc || '').trim().toUpperCase()] = r; });
    const next = consolidateCrew(mp).map(c => {
      const p = prev[c.role.toUpperCase()];
      /* An edited pax (paxSet) is the estimator's -- fewer may travel than
         work -- and a re-sync leaves it alone. */
      return { id: p ? p.id : uid(), kind: 'mp', auto: true, desc: c.role, qty: p && p.paxSet ? p.qty : c.pax, paxSet: !!(p && p.paxSet),
        /* A typed rate (rateSet) is kept the same way -- travel days may be paid
           at a different rate than the work. */
        rate: p && p.rateSet ? p.rate : c.rate, rateSet: !!(p && p.rateSet),
        days: p ? p.days : 1, otHours: p ? p.otHours : 0 };
    });
    const sig = rs => JSON.stringify(rs.map(r => [r.id, r.desc, r.qty, r.rate, r.days, r.otHours]));
    if (!create && sig(next) === sig(autos)) return list;
    return [...next, ...list.filter(r => !(r.kind === 'mp' && r.auto))];
  };
  React.useEffect(() => {
    setMobVehicles(p => syncCrewRows(p, false));
    setDemobVehicles(p => syncCrewRows(p, false));
  }, [mp]);
  /* Food allowance, one line per category, counted from the crew. In
     mobilization / demobilization it covers the travel days only (days are the
     estimator's, default 1); in Accommodation it covers the stay, so days come
     from the shifts. The unit rate comes from the Masterlist item of the same
     name, or stays as typed if there is none. rateKey: 'rate' on the mob lists,
     'cost' on Miscellaneous. */
  const mealRate = label => {
    const m = ((masterlist && masterlist.vehicles) || []).find(v => String(v.desc || '').trim().toUpperCase() === label);
    return m ? N(m.rate || m.cost) : 0;
  };
  /* Each role's food allowance category, from the Manpower masterlist (a role
     the list does not categorise falls back to a guess from its name). */
  const mealCatMap = useMemo(() => {
    const m = {};
    ((masterlist && masterlist.manpower) || []).forEach(r => { if (r && r.role && r.mealCat) m[String(r.role).trim().toUpperCase()] = r.mealCat; });
    return m;
  }, [masterlist]);
  const syncMealRows = (list, create, rateKey, stayDays) => {
    const autos = list.filter(r => r.kind === 'meal' && r.auto);
    if (!autos.length && !create) return list;
    const prev = {};
    autos.forEach(r => { prev[String(r.desc || '').toUpperCase()] = r; });
    /* Accommodation counts the whole crew over the stay. Mobilization and
       demobilization count who actually travels -- the crew lines in that
       list, with any pax typed over them. */
    const g = stayDays ? mealGroups(mp, mealCatMap) : (() => {
      const o = {};
      MEAL_CATS.forEach(([k]) => { o[k] = { pax: 0 }; });
      list.filter(r => r.kind === 'mp' && String(r.desc || '').trim()).forEach(r => {
        const k = mealCatMap[String(r.desc).trim().toUpperCase()] || mealCatGuess(r.desc);
        o[k].pax += N(r.qty);
      });
      return o;
    })();
    const next = MEAL_CATS.filter(([k]) => g[k].pax > 0).map(([k, label]) => {
      const p = prev[label];
      return { id: p ? p.id : uid(), kind: 'meal', auto: true, desc: label, qty: g[k].pax, uom: 'PAX',
        days: stayDays ? g[k].days : (p ? p.days : 1),
        ...(stayDays ? { parts: g[k].parts } : {}),
        /* Priced from the Masterlist once, when the line is first made; after
           that it is the CE's own figure (a CE never silently reprices). */
        [rateKey]: p ? N(p[rateKey]) : mealRate(label) };
    });
    const sig = rs => JSON.stringify(rs.map(r => [r.id, r.desc, r.qty, r.days, r[rateKey], r.parts || null]));
    if (!create && sig(next) === sig(autos)) return list;
    return [...list.filter(r => !(r.kind === 'meal' && r.auto)), ...next];
  };
  /* The one deliberate way a meal line takes a new masterlist rate: the
     estimator asks for it. Every meal line on this CE -- mobilization,
     demobilization, accommodation -- moves to the current Masterlist rate for
     its category; a category with no Masterlist item keeps its own. */
  const syncMealRates = () => {
    let n = 0;
    const missing = new Set();
    /* Counted on the current state first, so the toast says what happened. */
    [[mobVehicles, 'rate'], [demobVehicles, 'rate'], [misc.accommodation || [], 'cost']].forEach(([l, k]) => l.forEach(r => {
      if (r.kind !== 'meal') return;
      const v = mealRate(String(r.desc || '').trim().toUpperCase());
      if (!v) missing.add(r.desc); else if (N(r[k]) !== v) n++;
    }));
    const fix = (list, key) => (list || []).map(r => {
      if (r.kind !== 'meal') return r;
      const v = mealRate(String(r.desc || '').trim().toUpperCase());
      return v && N(r[key]) !== v ? { ...r, [key]: v } : r;
    });
    if (n) {
      setMobVehicles(p => fix(p, 'rate'));
      setDemobVehicles(p => fix(p, 'rate'));
      setMisc(p => ({ ...p, accommodation: fix(p.accommodation, 'cost') }));
    }
    showToast((n ? n + ' meal line(s) updated to the Masterlist rate.' : 'Meal lines already match the Masterlist.') +
      (missing.size ? ' Not in the Masterlist: ' + [...missing].join(', ') + '.' : ''), !n && missing.size > 0);
  };
  React.useEffect(() => {
    setMobVehicles(p => syncMealRows(p, false, 'rate', false));
    setDemobVehicles(p => syncMealRows(p, false, 'rate', false));
    setMisc(p => {
      const a = Array.isArray(p.accommodation) ? p.accommodation : [];
      const n = syncMealRows(a, false, 'cost', true);
      return n === a ? p : { ...p, accommodation: n };
    });
  }, [mp, mealCatMap, mobVehicles, demobVehicles]);
  const mobSubT = mobVehiclesT;
  const demobSubT = demobVehiclesT;
  const mobT = cfg.mobDemob ? mobSubT + demobSubT : 0;
  const grand = mobT + mpTot + toolsT + matsT + ppeT + miscT;
  /* Costs charged once for the job, whatever the quantity -- transport to
     site costs the same for one valve as for two. They are kept out of the
     unit price and shown beside it. Chosen per CE on the Summary tab and kept
     in info.perJob: misc category keys, and 'mobdemob'. */
  const perJob = Array.isArray(info.perJob) ? info.perJob : [];
  const perJobLines = [
    ...(perJob.includes('mobdemob') && mobT > 0 ? [{ k: 'mobdemob', label: 'Mobilization / Demobilization', v: mobT }] : []),
    ...(MISC_DEF[ceType] || MISC_DEF.onsite).filter(([k]) => perJob.includes(k)).map(([k, l]) => ({
      k, label: String(l).replace(/^[A-Z]\.\d+\s*/, ''),
      v: (Array.isArray(misc[k]) ? misc[k] : []).reduce((t, r) => t + miscRowCost(r), 0)
    })).filter(x => x.v > 0)
  ];
  const perJobT = perJobLines.reduce((t, x) => t + x.v, 0);
  const perJobNames = perJobLines.map(x => x.label).join(', ');
  const unitP = (grand - perJobT) / (N(info.qty) || 1);
  /* The unit the quantity is counted in reads better than the count itself:
     "UNIT PRICE PER PCS" says what one of them costs; "(qty 3)" made the
     reader work it out. Used by the summary, the printed CE and the exports. */
  const unitLbl = 'UNIT PRICE PER ' + (String(info.qtyUom || 'LOT').trim().toUpperCase() || 'LOT') +
    (perJobT ? ' (excl. per-job costs)' : '') + ':';
  const perJobLbl = 'PER-JOB COSTS, CHARGED ONCE (' + perJobNames + '):';
  /* At qty 1 the unit price is just the total again, printed under it with a
     different name. On a supply CE covering several different items it reads
     as the price of one of them, which is the one thing it is not. Show it
     only when a quantity was actually given. */
  const showUnitP = (N(info.qty) || 1) > 1;
  /* What one row of a section costs. The single definition every subtotal,
     the SOW breakdown and the highlighted-cost picker all read, so none of
     them can price the same row differently. */
  const rowCost = (kind, r) => {
    /* Tools carry a tier. The source figures ride on the row itself, copied
       from the masterlist when it was added, so a later masterlist change
       cannot silently re-price a CE that has already been quoted. */
    if (kind === 'tools') return toolRowTotal(r, kwhRate, undefined, pwrFrac(r));
    if (kind === 'misc') return miscRowCost(r);
    if (kind !== 'mp') return N(r.qty) * N(r.cost);
    if (!r.role) return 0; /* blank row: no role, no cost (calcBen SIL adds pax*30) */
    /* Wage from mpWage, benefits from calcBen -- the same two the subtotals
       are built from, rather than a third copy of the same arithmetic. */
    return mpWage(r) + calcBen(r).total;
  };
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
    /* Individual rows, so a callout can name ONE crane or ONE technician
       rather than the whole section it sits in. The amount comes from the
       same rowCost the section total is summed from, so a line highlighted
       here can never disagree with the line printed above it -- overtime,
       the shift multiplier, benefits, the tool tier and its power are all
       already in it. */
    if (cfg.mobDemob) {
      [['mob', 'Mobilization', mobVehicles], ['demob', 'Demobilization', demobVehicles]].forEach(([kk, nm, rows]) => {
        (rows || []).forEach((r, i) => {
          if (!r.desc) return;
          o.push({ k: 'row:' + kk + ':' + (r.id || i), g: 'Line Items · ' + nm, l: r.desc,
                   v: mobRowCost(r, rr) });
        });
      });
    }
    [['mp', 'Manpower', mp, 'role'], ['tools', 'Tools & Equipment', tools, 'desc'],
     ['mats', 'Materials & Consumables', mats, 'desc'], ['ppe', 'PPE', ppe, 'desc']].forEach(([kk, nm, rows, nameKey]) => {
      (rows || []).forEach((r, i) => {
        const nme = r[nameKey];
        if (!nme) return;
        o.push({ k: 'row:' + kk + ':' + (r.id || i), g: 'Line Items · ' + nm, l: nme, v: rowCost(kk, r) });
      });
    });
    (MISC_DEF[ceType] || MISC_DEF['onsite']).forEach(([key, lbl]) => {
      const nm = lbl.replace(/^[A-Z]\.\d+\s*/, '');
      const arr = Array.isArray(misc[key]) ? misc[key] : [];
      o.push({ k: 'miscCat:' + key, g: 'Misc Categories', l: nm, v: arr.reduce((s, r) => s + miscRowCost(r), 0) });
      arr.forEach((r, i) => {
        if (!r.desc) return;
        o.push({ k: 'miscRow:' + key + ':' + (r.id || i), g: 'Line Items · Miscellaneous', l: nm + ' → ' + r.desc, v: miscRowCost(r) });
      });
    });
    return o;
  }, [unitP, grand, mobSubT, demobSubT, mpTot, toolsT, matsT, ppeT, miscT, misc, ceType,
      cfg.mobDemob, mp, tools, mats, ppe, mobVehicles, demobVehicles, kwhRate, rr]);
  /* ── Resolving a highlighted row ────────────────────────────────────────
     A row links to nothing (a typed amount), to one figure, or to SEVERAL --
     "DELIVERY" is often a truck line plus a driver plus a permit, three rows
     in three different sections that the client wants to see as one number.
     `srcs` is the list; `src` is the single link every CE saved before this
     carries, and is read as a list of one so nothing has to be re-entered. */
  const hlKeys = r => (Array.isArray(r.srcs) && r.srcs.length) ? r.srcs
    : ((r.src && r.src !== 'manual') ? [r.src] : []);
  const hlIsLinked = r => hlKeys(r).length > 0;
  /* Keys whose cost has since been deleted from the CE. Summing around a
     missing one would quietly shrink the callout instead of saying so. */
  const hlMissing = r => hlKeys(r).filter(k => !hlSources.some(o => o.k === k));
  const hlAmt = r => {
    const ks = hlKeys(r);
    if (!ks.length) return N(r.amount);
    return ks.reduce((s, k) => s + N((hlSources.find(o => o.k === k) || {}).v), 0);
  };
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
  /* kw only when the Masterlist entry has one -- writing 0 would read as a
     tool that draws nothing rather than one nobody has rated yet. */
  /* The four figures a tier price is derived from, plus the power rating.

     A CE row is costed from ITSELF -- toolRowTotal is called with no masterlist
     to consult, deliberately, so a CE quoted last month cannot be repriced by
     an edit to the list today. That only works if the row arrives carrying
     what it needs. It did not: a tool picked From Masterlist got desc, uom,
     cost and kw, and nothing else. So Tier 1 had no annual cost to divide
     between projects and Tier 3 had none to divide between hours, and both
     fell back to the stored daily rate -- a per-project charge quoting one
     day's hire, a per-hour charge quoting a twenty-fourth of it. Sync Rates
     copied these figures and the picker did not, which is why re-syncing a
     row appeared to "fix" it. */
  const TOOL_SRC_KEYS = ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'];
  const toolSrcFields = item => {
    const out = {};
    if (!item) return out;
    TOOL_SRC_KEYS.forEach(k => { if (item[k] !== undefined && item[k] !== '' && N(item[k]) > 0) out[k] = N(item[k]); });
    return out;
  };
  const _mkResRow = (item, taskId) => ({ ...mkRes(), desc: item ? item.desc : '', uom: item ? item.uom : 'Lot', cost: item ? item.cost : 0, ...toolSrcFields(item), taskId: taskId || '' });
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
  /* ── Consolidation ──────────────────────────────────────────────────────────
     One crew works across several scope tasks. If task 1 needs 1 electrician
     and task 2 needs 3, you mobilise 3 for the whole job and pay them for the
     whole duration -- so the charged row is MAX of the pax and the SUM of the
     days, not the sum of the individual rows. That deliberately costs MORE than
     the per-task rows added up (3 x 7 days beats 1x2 + 3x5), because the crew
     is on site and paid whether or not every task needs all of them.

     Consumables are the opposite: 5 L on one task and 8 L on another means you
     buy 13. Quantities add, and there are no days.

     A consolidated row keeps `shares` -- what each task originally asked for --
     so the SOW Breakdown can still show it under every task it serves and
     split its cost between them in proportion. Without that the breakdown
     would lose the resource entirely. */
  const isPeopleOrPlant = key => key === 'mp' || key === 'tools';
  /* What a row originally contributed, for splitting a shared cost back out. */
  const _weight = (key, r) => isPeopleOrPlant(key)
    /* A Tier 3 tool is measured in hours and a Tier 1 tool in nothing at all,
       so neither can be weighted by days without splitting a shared row in the
       wrong proportion. */
    ? Math.max(0, N(r.pax !== undefined ? r.pax : r.qty)) * Math.max(0, N(r.tier) === 3 ? N(r.hours)
        : N(r.tier) === 1 ? 1
        : (r.days === undefined || r.days === '' ? 1 : r.days))
    : Math.max(0, N(r.qty));
  const rowShares = r => Array.isArray(r && r.shares) && r.shares.length ? r.shares : null;
  const rowServesTask = (r, id) => r.taskId === id || (rowShares(r) || []).some(sh => sh.taskId === id);
  /* A shared row is costed once. Each task it serves carries the slice it asked
     for, so the per-task figures still add up to the row -- and to the grand
     total. A task that asked for nothing measurable gets an equal slice rather
     than a divide-by-zero. */
  const rowCostForTask = (key, r, id) => {
    const sh = rowShares(r);
    const full = rowCost(key, r);
    if (!sh) return r.taskId === id ? full : 0;
    const tot = sh.reduce((a, x) => a + Math.max(0, N(x.weight)), 0);
    const mine = sh.filter(x => x.taskId === id).reduce((a, x) => a + Math.max(0, N(x.weight)), 0);
    if (tot <= 0) return sh.some(x => x.taskId === id) ? full / sh.length : 0;
    return full * (mine / tot);
  };
  const taskResCount = id => RES_TABS.reduce((s, t) => s + t.rows.filter(r => rowServesTask(r, id)).length, 0)
    + miscFlat().filter(r => rowServesTask(r, id)).length;
  /* Cost of a single row, using the same formulas that drive the section totals
     so a per-task subtotal can never disagree with the Grand Total. */
  /* How a tool is charged, in words, for the client's copy. The printed CE and
     both exports carried a DAYS column, which says nothing on a row charged per
     project or by the hour -- and read as a mistake on a Tier 3 row showing 1
     day against an hourly price. One column, naming the basis of the charge. */
  const toolBasis = r => {
    const t = N(r.tier) || 2;
    if (t === 1) return 'per project';
    if (t === 3) return (N(r.hours) || 0) + ' hrs';
    return resDays(r) + (resDays(r) === 1 ? ' day' : ' days');
  };
  const taskCost = id => RES_TABS.reduce((s, t) => s + t.rows.filter(r => rowServesTask(r, id)).reduce((a, r) => a + rowCostForTask(t.key, r, id), 0), 0)
    + miscFlat().filter(r => rowServesTask(r, id)).reduce((a, r) => a + rowCostForTask('misc', r, id), 0);
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
  /* ── Services summary ────────────────────────────────────────────────────
     Some clients want the total restated by service -- SAND BLASTING WORKS,
     WELDING WORKS... -- under the cost summary. A main scope item names the
     service it belongs to (`group`); its sub-items come with it. Several
     items may share one group, and the lines print in the order their first
     item appears in the scope.

     "Other misc. to the project" is whatever the named services do not
     carry: unlinked rows, mob/demob, anything costed to an ungrouped item.
     It is the remainder of the grand total rather than a sum of its own, so
     the services always add back to the cost total. The one way that can
     fail is a remainder below zero, which would mean a row was counted into
     two services -- that is reported, and the block does not print. */
  const servicesSummary = (() => {
    const lines = [];
    (sowItems || []).forEach(it => {
      if (it.type !== 'main') return;
      const g = String(it.group || '').trim();
      if (!g) return;
      const key = g.toUpperCase();
      let l = lines.find(x => x.key === key);
      if (!l) lines.push(l = { key, label: g, v: 0, items: [] });
      l.v += taskCostRollup(it);
      l.items.push(it.id);
    });
    const named = lines.reduce((t, l) => t + l.v, 0);
    const other = grand - named;
    return { lines, other, total: grand, ok: other > -0.005, on: !!info.showServices && lines.length > 0 };
  })();
  const sowUnassignedCount = (() => {
    const valid = new Set((sowItems || []).map(s => s.id));
    const bad = r => !r.taskId || !valid.has(r.taskId);
    return RES_TABS.reduce((s, t) => s + t.rows.filter(r => r[t.nameKey] && bad(r)).length, 0)
      + miscFlat().filter(r => r.desc && bad(r)).length;
  })();
  /* One snapshot of everything a scope deletion can touch, and one way to put
     it all back. Deleting a step used to be undoable only when it carried
     sub-steps or resources, so an empty main step, any sub-step and Clear All
     all went with a single click and no way back. Every scope deletion is
     undoable now, whether or not anything was hanging off it. */
  const SOW_UNDO_MS = 20000;
  const sowSnapshot = () => ({
    sow: [...sowItems], mp: [...mp], tools: [...tools], mats: [...mats],
    ppe: [...ppe], misc: JSON.parse(JSON.stringify(misc))
  });
  const sowRestore = snap => {
    setSowItems(snap.sow); setMp(snap.mp); setTools(snap.tools);
    setMats(snap.mats); setPpe(snap.ppe); setMisc(snap.misc);
  };
  /* A second deletion must not inherit the first one's countdown, or the new
     bar disappears early -- so any pending timer is cleared first. */
  const sowUndoTimer = useRef(null);
  const sowOfferUndo = (msg, snap) => {
    if (sowUndoTimer.current) clearTimeout(sowUndoTimer.current);
    sowUndoTimer.current = setTimeout(() => { sowUndoTimer.current = null; setUndoToast(null); }, SOW_UNDO_MS);
    setUndoToast({
      msg,
      onUndo: () => {
        if (sowUndoTimer.current) clearTimeout(sowUndoTimer.current);
        sowUndoTimer.current = null;
        sowRestore(snap);
        setUndoToast(null);
        showToast('Delete undone.');
      }
    });
  };
  /* Delete a scope task and, with confirmation, the resources assigned to it. */
  const deleteSowTask = item => {
    const ids = sowTaskGroup(item);
    const subs = ids.length - 1;
    const n = ids.reduce((s, id) => s + taskResCount(id), 0);
    if ((n > 0 || subs > 0) && !confirm('Delete this scope task' +
      (subs > 0 ? ' and its ' + subs + ' sub-task' + (subs === 1 ? '' : 's') : '') +
      (n > 0 ? ', plus the ' + n + ' resource row' + (n === 1 ? '' : 's') + ' assigned to ' + (subs > 0 ? 'them' : 'it') : '') +
      '?' + (n > 0 ? '\n\nThe resources will be removed from the Manpower / Tools / Consumables / PPE / Miscellaneous tabs too, so the totals will change.' : '') +
      '\n\nYou can undo this for ' + (SOW_UNDO_MS / 1000) + ' seconds.')) return;
    const snap = sowSnapshot();
    setSowItems(p => p.filter(s => !ids.includes(s.id)));
    if (n > 0) { RES_TABS.forEach(t => t.set(p => p.filter(r => !ids.includes(r.taskId)))); ids.forEach(id => miscClearTask(id)); }
    sowOfferUndo(
      (ids.length > 1 ? ids.length + ' scope tasks' : (item.type === 'sub' ? 'Sub-item' : 'Scope task')) +
      (n > 0 ? ' and ' + n + ' resource row' + (n === 1 ? '' : 's') : '') + ' deleted.', snap);
  };
  /* Clear All: the scope goes, the resources stay and fall back to Unassigned.
     One click used to take the whole method with it. */
  const clearAllSow = () => {
    if (!confirm('Clear all scope items?\n\nResources stay in their tabs and keep their costs, but they will all become Unassigned in the SOW Breakdown.' +
      '\n\nYou can undo this for ' + (SOW_UNDO_MS / 1000) + ' seconds.')) return;
    const snap = sowSnapshot();
    const count = sowItems.length;
    setSowItems([]);
    /* Drop the now-dangling task links so every row shows up as Unassigned
       rather than pointing at a task that no longer exists. */
    RES_TABS.forEach(t => t.set(p => p.map(r => r.taskId ? { ...r, taskId: '' } : r)));
    setMisc(p => { const n = { ...p }; Object.keys(n).forEach(k => { if (Array.isArray(n[k])) n[k] = n[k].map(r => r.taskId ? { ...r, taskId: '' } : r); }); return n; });
    sowOfferUndo('All ' + count + ' scope item' + (count === 1 ? '' : 's') + ' cleared.', snap);
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
      /* Every page, and one line per printed line. It read the first 30 pages
         only, and ran each page into a single line -- so a 42-page tool list
         lost its last 12 pages and every table row ran into the next, which
         is what the AI then had to make sense of. */
      const PDF_MAX_PAGES = 200;
      let t = '';
      for (let i = 1; i <= Math.min(pdf.numPages, PDF_MAX_PAGES); i++) {
        const pg = await pdf.getPage(i);
        const c = await pg.getTextContent();
        let line = '', lastY = null;
        const lines = [];
        c.items.forEach(x => {
          const y = x.transform ? Math.round(x.transform[5]) : lastY;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.trim()) { lines.push(line.trim()); line = ''; }
          line += (line && x.str && !/\s$/.test(line) ? ' ' : '') + x.str;
          lastY = y;
          if (x.hasEOL && line.trim()) { lines.push(line.trim()); line = ''; }
        });
        if (line.trim()) lines.push(line.trim());
        t += lines.join('\n') + '\n\n';
      }
      if (pdf.numPages > PDF_MAX_PAGES) t += '[only the first ' + PDF_MAX_PAGES + ' of ' + pdf.numPages + ' pages were read]';
      return t.replace(/[ \t]+/g, ' ').trim();
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
  /* Client Document holds several files: an enquiry usually comes as a letter,
     a TOR and a drawing list, and the AI reads better with all of them. The
     one docFile object stays -- save, load and the AI read it as before --
     with the files listed inside it and their text joined under a heading each. */
  const docCombine = files => files.length ? {
    name: files.length === 1 ? files[0].name : files.length + ' documents',
    size: files.reduce((t, f) => t + (f.size || 0), 0),
    text: files.map(f => files.length > 1 && f.text ? '=== ' + f.name + ' ===\n' + f.text : (f.text || '')).filter(Boolean).join('\n\n'),
    spUrl: files[0].spUrl || null,
    files: files,
    uploadedAt: new Date().toISOString()
  } : null;
  const docFilesOf = d => !d ? [] : (Array.isArray(d.files) && d.files.length ? d.files : [{name: d.name, size: d.size || 0, text: d.text || '', spUrl: d.spUrl || null}]);
  const handleDocUpload = async (input, append) => {
    const list = Array.from(input && input.length != null ? input : (input ? [input] : []));
    if (!list.length) return;
    setDocBusy(true);
    const added = [];
    for (const file of list) {
      try {
        const text = await readDoc(file);
        let spUrl = null;
        if (USE_SP) {
          const ab = await file.arrayBuffer();
          spUrl = await spUploadDoc(file.name, ab);
        }
        added.push({name: file.name, size: file.size, text, spUrl});
      } catch (e) {
        showToast('"' + file.name + '": ' + e.message, true);
      }
    }
    if (added.length) {
      setDocFile(prev => {
        const keep = append ? docFilesOf(prev).filter(f => !added.some(a => a.name === f.name)) : [];
        return docCombine(keep.concat(added));
      });
      showToast((added.length === 1 ? '"' + added[0].name + '"' : added.length + ' documents') + ' loaded. Click Extract Info to auto-fill fields.');
    }
    setDocBusy(false);
  };
  const removeDoc = name => setDocFile(prev => docCombine(docFilesOf(prev).filter(f => f.name !== name)));
  const extractDocInfo = async () => {
    if (!docFile?.text) return;
    setDocBusy(true);
    try {
      /* 10,000 characters was about 8 pages of a 42-page kit list. The limit
         is what the free AI providers accept in one request, so it is raised
         only as far as they reliably take, and a longer document says what
         was left out rather than quietly reading the start of it. */
      const AI_DOC_CHARS = 30000;
      const preview = docFile.text.slice(0, AI_DOC_CHARS);
      if (docFile.text.length > AI_DOC_CHARS) showToast('The document is long: the AI reads the first ' + Math.round(100 * AI_DOC_CHARS / docFile.text.length) + '% of it. Split it, or remove files you do not need it to read.', true);
      const mlRoles = masterlist.manpower.map(r => r.role + ':P' + r.rate).join(', ');
      const tlList = masterlist.tools.slice(0, 30).map(r => r.desc).join(', ');
      const mtList = masterlist.materials.slice(0, 30).map(r => r.desc).join(', ');
      const prompt = ['You are a cost estimation assistant for Synergy3 Corp, a Philippine mechanical/electrical contractor.', '\nRead the document below and return ONLY valid JSON -- no markdown, no commentary.\n', '\nDOCUMENT:\n---\n', preview, '\n---\n\n', 'Available manpower roles and day rates: ', mlRoles, '\nAvailable tools: ', tlList, '\nAvailable materials: ', mtList, '\n\nRespond with exactly this JSON shape:\n', AI_EXTRACT_SCHEMA, AI_EXTRACT_RULES, AI_PLAN_RULES, '\n- Match every manpower role to the rate list above; do not leave a rate at 0', ' when the role appears there.'].join('');
      const raw = await callAI(prompt, AI_MAX_TOKENS);
      const ex = aiParseJSON(raw);
      const plan = aiLinkPlan(ex);
      /* Project info: the model may return it nested under `info` or flat. */
      const src = (ex && typeof ex.info === 'object' && ex.info) ? ex.info : ex;
      const infoFields = ['client', 'location', 'description', 'material', 'qty', 'days', 'projType', 'attention', 'endUser'];
      const infoUpdate = Object.fromEntries(infoFields.map(k => [k, src[k] || '']).filter(([, v]) => v));
      if (Object.keys(infoUpdate).length) setInfo(p => ({
        ...p,
        ...infoUpdate
      }));
      if (plan.sowItems.length) setSowItems(plan.sowItems);
      if (plan.mp.length) setMp(plan.mp);
      if (plan.tools.length) setTools(plan.tools);
      if (plan.mats.length) setMats(plan.mats);
      if (plan.ppe.length) setPpe(plan.ppe);
      if (ex.notes) setNotes(p => [...p, {
        id: uid(),
        seq: p.length + 1,
        text: String(ex.notes)
      }]);
      const filled = [];
      if (plan.mp.length) filled.push(plan.mp.length + ' manpower');
      if (plan.tools.length) filled.push(plan.tools.length + ' tools');
      if (plan.mats.length) filled.push(plan.mats.length + ' materials');
      if (plan.ppe.length) filled.push(plan.ppe.length + ' PPE');
      if (plan.sowItems.length) filled.push(plan.sowItems.length + ' scope items');
      showToast('Extracted: ' + filled.join(', ') + '. ' + aiLinkNote(plan) + ' Review all tabs.');
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
      const prompt = ['Philippine contractor Synergy3 Corp. CE Type: ', ceTypeLabel(ceType).toUpperCase(), ceSplitOn(ceType) ? ' (part shop work, part site work; tag each main scope item)' : '', '.\nScope description: ', scope, '\n\nAvailable manpower roles & rates: ', rlist, '\nAvailable tools: ', tlList, '\nAvailable materials: ', mtList, '\n\nRespond ONLY in valid JSON (no markdown):\n', AI_PLAN_SCHEMA, AI_PLAN_RULES,'\nBased on the scope description, generate:', '\n- Realistic manpower roles with appropriate pax, days, and rates from available list', '\n- Required tools and equipment', '\n- Necessary materials and consumables', '\n- Required PPE', '\n- Detailed Scope of Work items (main numbered steps and lettered sub-steps)'].join('');
      const raw = await callAI(prompt, AI_MAX_TOKENS);
      const plan = aiLinkPlan(aiParseJSON(raw));
      if (plan.sowItems.length) setSowItems(plan.sowItems);
      if (plan.mp.length) setMp(plan.mp);
      if (plan.tools.length) setTools(plan.tools);
      if (plan.mats.length) setMats(plan.mats);
      if (plan.ppe.length) setPpe(plan.ppe);
      setTab('manpower');
      const filled = [];
      if (plan.mp.length) filled.push(plan.mp.length + ' manpower');
      if (plan.tools.length) filled.push(plan.tools.length + ' tools');
      if (plan.sowItems.length) filled.push(plan.sowItems.length + ' SOW items');
      showToast('Generated: ' + filled.join(', ') + '. ' + aiLinkNote(plan) + ' Review all tabs.');
    } catch (e) {
      showToast('AI failed: ' + e.message, true);
    }
    setAiLoad(false);
  };
  /* The CE number is the only link between the editor and its monitoring row;
     nothing tracks "the CE currently open" by id. */
  const openCeId = useMemo(() => {
    const n = String(info.ceNum || '').trim().toUpperCase();
    if (!n) return null;
    const h = history.find(x => String(x.info?.ceNum || x.ceNum || '').trim().toUpperCase() === n);
    return h ? h.id : null;
  }, [history, info.ceNum]);
  const openMonStatus = openCeId != null ? ((monData[openCeId] || {}).status || '') : '';
  /* Sales' Request for Cost Estimate number. Typed on Project Info it rides
     with the CE; a CE logged through New Request has it in Monitoring. */
  const rceNo = String(info.rceNo || (openCeId != null ? (monData[openCeId] || {}).rceNo : '') || '').trim();
  /* The unit the Quantity is counted in -- a CE for 3 pumps is 3 PCS, not 3 LOT. */
  const qtyUom = String(info.qtyUom || 'LOT').trim().toUpperCase() || 'LOT';
  /* The document state, as printed on the CE.

     Once a CE is tracked in Monitoring, that pipeline status is the source of
     truth and this is read from it, so the two can never say different things
     about the same estimate. Before then -- a CE being written, not yet saved
     -- it is info.status, which seeds Monitoring on save. */
  const docStatus = (openMonStatus && MON_TO_DOC[openMonStatus]) || info.status || 'DRAFT';
  const setDocStatus = v => {
    setInfo(p => ({...p, status: v}));
    const mapped = DOC_TO_MON[v];
    /* Write through only when the pipeline would actually change meaning.
       Ongoing already reads as REVISED, so re-selecting REVISED must not shove
       the pipeline back to Ongoing from, say, For site insp. */
    if (openCeId != null && mapped && MON_TO_DOC[openMonStatus] !== v) updateMon(openCeId, 'status', mapped);
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
      verifyNotes: {...verifyNotes},
      rates: {...rates},
      /* The margin % was in the unsaved-changes signature but in neither this
         object nor the draft, so `_margin` was written as 0 every time. You set
         15%, watched the SELLING PRICE line appear on screen and on the printed
         CE, saved, reopened -- and the margin was 0 and the line was gone. */
      margin,
      /* Likewise the scope description: saved as an empty string into a
         SharePoint column, read back, and then ignored by the loader. */
      scope,
      notes: [...notes],
      sowItems: [...sowItems],
      approvers: [...approvers],
      /* Drawn signatures, keyed like the signatories. Saved with the CE so a
         signed estimate reopens signed. */
      signatures: {...signatures},
      mobVehicles: [...mobVehicles],
      demobVehicles: [...demobVehicles],
      grand,
      unitP,
      savedBy: currentUser.username,
      ...(revSuffix ? { info: (({approval, ...r}) => ({...r, ceNum: revNum}))(info), signatures: apvStripSigs(approvers, signatures) } : {}),
      savedAt: new Date().toISOString(),
      docRef: docFile ? {
        name: docFile.name,
        spUrl: docFile.spUrl || null,
        files: docFilesOf(docFile).map(f => ({name: f.name, spUrl: f.spUrl || null, size: f.size || 0}))
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
    const _R = ceIdRemapper(d.sowItems);
    const _sow = _R.sow;
    const _mp=(d.mp||[]).map(_R.rt('mp'));setMp(_mp);try{window.shicCurrentMp=_mp;}catch(_e){}
    const _tools=(d.tools||[]).map(_R.rt('tools'));setTools(_tools);try{window.shicCurrentTools=_tools;}catch(_e){}
    const _mats=(d.mats||[]).map(_R.rt('mats'));setMats(_mats);try{window.shicCurrentMats=_mats;}catch(_e){}
    setPpe((d.ppe || []).map(_R.rt('ppe')));
    /* A drawn signature belongs to the CE it was drawn on. */
    setSignatures(d.signatures && typeof d.signatures === 'object' ? {...d.signatures} : {});
    const rawMisc = d.misc || {};
    const migratedMisc = {};
    MISC_DEF[d.ceType || 'onsite']?.forEach(([k]) => {
      migratedMisc[k] = Array.isArray(rawMisc[k]) ? rawMisc[k].map(_R.rt('misc')) : N(rawMisc[k]) > 0 ? [{
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
    setVerifyNotes(d.verifyNotes || {});
    setRates(d.rates || {});
    _defaultsSig.current = ''; /* a resumed draft owns its notes and signatories */
    setMobVehicles((d.mobVehicles || []).map(r => ({
      ...r,
      id: uid()
    })));
    setDemobVehicles((d.demobVehicles || []).map(r => ({
      ...r,
      id: uid()
    })));
    setScope(d.scope || '');
    setAddlCosts(_R.fixAddl(d.addlCosts));
    setMargin(d.margin || 0);
    setTab('info');
  };

  /* \u2500\u2500 Save draft \u2014 local + SharePoint shared \u2500\u2500 */
  /* One id for this user's draft of a given CE. Shared with the save path so
     it can retire exactly the row saveDraft wrote. */
  const draftIdFor = num => 'draft_' + (num || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + currentUser.username;
  /* A draft is work in progress. Once the CE is in history it is no longer in
     progress, so the draft has to go -- otherwise the same CE is listed twice,
     once under Drafts and once in Monitoring, with nothing to say which one is
     current. clearDraft() only empties the local one-slot copy; the shared
     SharePoint row outlived every save.

     Cleanup never blocks the save: the CE is already in history by the time
     this runs, and a stale draft is a smaller problem than a save that reports
     failure after succeeding. */
  const retireDrafts = async (...nums) => {
    /* Tell the 3-minute auto-save that this state is already accounted for.
       Without it the timer sees a signature it has not written yet, saves a
       fresh draft of the CE that was just saved, and the row comes straight
       back a few minutes later. */
    if (_live.current) _lastAutoSig.current = _live.current.sig;
    const ids = new Set(nums.filter(Boolean).map(draftIdFor));
    /* The draft this session actually wrote. Retiring by CE number alone missed
       it whenever the number changed after the draft was saved -- which is the
       normal shape of a bulk upload: open the extracted CE, autosave fires under
       whatever number is in the field, then the real number is typed in and
       saved. The orphan under the old number stayed in Resume Work forever. */
    if (_lastDraftId.current) ids.add(_lastDraftId.current);
    /* And anything already on the Resume Work list for the same CE, mine only.
       An id is built from the number as typed, so a stray space or a lower-case
       letter produced a second id for one CE and only one of them was retired. */
    const key = n => String(n || '').trim().toUpperCase();
    const mine = new Set(nums.filter(Boolean).map(key));
    (sharedDrafts || []).forEach(d => {
      if (d.savedBy === currentUser.username && mine.has(key(d.info && d.info.ceNum))) ids.add(d.draftId);
    });
    for (const id of ids) {
      try { await dbDeleteDraft(id); } catch (e) { console.warn('draft cleanup:', e.message); }
    }
    _lastDraftId.current = null;
    setSharedDrafts(prev => prev.filter(d => !ids.has(d.draftId)));
  };
  const saveDraft = async () => {
    const draftId = draftIdFor(info.ceNum);
    /* Remembered so the save can retire this exact row even if the CE number
       has changed since. */
    _lastDraftId.current = draftId;
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
      verifyNotes: {...verifyNotes},
      rates: {...rates},
      margin,
      notes: [...notes],
      sowItems: [...sowItems],
      approvers: [...approvers],
      /* Drawn signatures, keyed like the signatories. Saved with the CE so a
         signed estimate reopens signed. */
      signatures: {...signatures},
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
  const loadSharedDrafts = async (quiet) => {
    setSyncStatus({drafts:'saving'});
    try {
      const list = await dbGetDrafts();
      setSharedDrafts(list);
      setSyncStatus({drafts:'synced', lastSyncAt: new Date().toISOString(), sp:'connected'});
      /* Quiet when it runs as part of a full refresh: "nothing in progress"
         is an answer to opening the Drafts list, not to pressing Refresh. */
      if (!quiet && list.length === 0) showToast('Nothing in progress — every CE has been saved.');
    } catch (e) {
      setSharedDrafts([]);
      setSyncStatus({drafts:'error'});
    }
  };

  /* \u2500\u2500 Delete a shared draft \u2500\u2500 */
  /* Only the draft's owner or an admin may delete it, and only after saying
     so: a draft is somebody's unsaved work, and it cannot be brought back.
     The saved CE and its CE Monitoring row are never touched. */
  const deleteDraft = async (draftId, draft, asked) => {
    const d = draft || (sharedDrafts || []).find(x => x.draftId === draftId) || {};
    const own = !d.savedBy || d.savedBy === currentUser.username;
    if (!own && !isAdmin) { showToast('Only ' + (d.savedByName || d.savedBy) + ' or an admin can delete this draft.', true); return; }
    if (!asked && !confirm('Delete this draft' + (d.info && d.info.ceNum ? ' of ' + d.info.ceNum : '') + (own ? '' : ' by ' + (d.savedByName || d.savedBy)) + '?\n\n' +
      'Changes not yet saved will be lost for good. The saved CE and its CE Monitoring entry are not affected.')) return;
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

  /* Clearing out Resume Work in one go, by the two things that make a draft
     dead: its CE has since been saved, or nobody has touched it in a month.
     Each is counted and named before anything goes, and a draft belonging to
     somebody else is only ever touched by an admin -- the same rule the one
     Delete button has always followed. */
  const draftTidyGroups = () => {
    const key = n => String(n || '').trim().toUpperCase();
    const saved = new Set((history || []).map(h => key((h.info && h.info.ceNum) || h.ceNum)).filter(Boolean));
    const mine = d => d.savedBy === currentUser.username;
    const canTouch = d => mine(d) || isAdmin;
    const month = Date.now() - 30 * 24 * 3600 * 1000;
    const all = (sharedDrafts || []).filter(canTouch);
    return {
      savedCE: all.filter(d => saved.has(key(d.info && d.info.ceNum))),
      old: all.filter(d => { const t = Date.parse(d.savedAt || '') || 0; return t && t < month; }),
      mineN: (sharedDrafts || []).filter(mine).length,
      othersN: (sharedDrafts || []).filter(d => !mine(d)).length
    };
  };
  const [draftTidyBusy, setDraftTidyBusy] = useState(false);
  const tidyDrafts = async which => {
    const g = draftTidyGroups();
    const list = which === 'old' ? g.old : g.savedCE;
    if (!list.length) { showToast('Nothing to clear there.'); return; }
    const notMine = list.filter(d => d.savedBy !== currentUser.username).length;
    const what = which === 'old'
      ? list.length + ' draft(s) nobody has touched in 30 days'
      : list.length + ' draft(s) whose CE has since been saved';
    if (!confirm('Clear ' + what + '?' + String.fromCharCode(10, 10) +
      list.slice(0, 12).map(d => '  \u2022 ' + ((d.info && d.info.ceNum) || '(no CE#)') + ' \u2014 ' + (d.savedByName || d.savedBy || '')).join(String.fromCharCode(10)) +
      (list.length > 12 ? String.fromCharCode(10) + '  \u2026 and ' + (list.length - 12) + ' more' : '') +
      String.fromCharCode(10, 10) + (notMine ? notMine + ' of them belong to somebody else. ' : '') +
      'Whatever they hold that was never saved is lost for good. The saved CEs and their Monitoring rows are not touched.')) return;
    setDraftTidyBusy(true);
    const removed = new Set();
    let kept = 0;
    for (const d of list) {
      try { await dbDeleteDraft(d.draftId); removed.add(d.draftId); } catch (_e) { kept++; }
    }
    const gone = removed.size;
    /* Only the ones that actually went: a draft the site would not let go of
       has to stay on the list, or it comes back on the next refresh looking
       like it returned from the dead. */
    setSharedDrafts(p => p.filter(x => !removed.has(x.draftId)));
    setDraftTidyBusy(false);
    showToast(gone + ' draft(s) cleared' + (kept ? ', ' + kept + ' could not be reached and are still there' : '') + '.', !!kept);
    loadSharedDrafts(true);
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
  /* Re-price the CE on screen from today's masterlist.

     A saved CE is a record of what was quoted, so nothing re-prices it on its
     own: every rate and cost is stored on the row it belongs to and comes back
     exactly as it was saved. Prices move only when someone asks for it here,
     on a CE they are about to quote.

     Nothing is written to history. This changes what is on screen; saving is
     still a separate, deliberate act -- and if the number already belongs to a
     saved CE, saving would overwrite that record, so say so first. */
  const syncRatesFromML = () => {
    const norm = v => String(v || '').trim().toUpperCase();
    const mlMp = new Map((masterlist.manpower || []).filter(m => m.role).map(m => [norm(m.role), m]));
    const byDesc = list => new Map((list || []).filter(x => x.desc).map(x => [norm(x.desc), x]));
    const mlRes = {tools: byDesc(masterlist.tools), mats: byDesc(masterlist.materials), ppe: byDesc(masterlist.ppe)};

    const changes = [];
    (mp || []).forEach(r => {
      const f = mlMp.get(norm(r.role));
      if (f && N(f.rate) !== N(r.rate)) changes.push({what: r.role, was: N(r.rate), now: N(f.rate)});
    });
    [['tools', tools], ['mats', mats], ['ppe', ppe]].forEach(([k, rows]) => {
      (rows || []).forEach(r => {
        const f = mlRes[k].get(norm(r.desc));
        if (f && N(f.cost) !== N(r.cost)) changes.push({what: r.desc, was: N(r.cost), now: N(f.cost)});
      });
    });

    if (!changes.length) { showToast('Every priced row already matches the masterlist.'); return; }

    const money = v => 'P' + v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const shown = changes.slice(0, 12).map(c => '  ' + c.what + ':  ' + money(c.was) + '  ->  ' + money(c.now)).join('\n');
    const existing = history.some(h => norm(h.info && h.info.ceNum || h.ceNum) === norm(info.ceNum));
    if (!confirm(
      'Re-price ' + changes.length + ' row' + (changes.length === 1 ? '' : 's') + ' from the masterlist?\n\n' +
      shown + (changes.length > 12 ? '\n  ...and ' + (changes.length - 12) + ' more' : '') +
      '\n\nRows with no masterlist match keep the price they have.' +
      (existing
        ? '\n\nCAREFUL: ' + info.ceNum + ' is already saved. Saving after this REPLACES what was quoted. Clone it to a new CE number first if the original must stand.'
        : '')
    )) return;

    setMp(prev => prev.map(r => {
      const f = mlMp.get(norm(r.role));
      return f ? {...r, rate: f.rate, perDiem: f.perDiem !== undefined ? f.perDiem : r.perDiem} : r;
    }));
    const reprice = (rows, map) => rows.map(r => {
      const f = map.get(norm(r.desc));
      return f ? {...r, cost: f.cost} : r;
    });
    /* Tools also take the tier source figures, or a Tier 1 or Tier 3 row has
       nothing to derive from and falls back to the daily rate. */
    setTools(prev => prev.map(r => {
      const f = mlRes.tools.get(norm(r.desc));
      if (!f) return r;
      const n = {...r, cost: f.cost};
      ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].forEach(k => {
        if (f[k] !== undefined) n[k] = f[k];
      });
      return n;
    }));
    setMats(prev => reprice(prev, mlRes.mats));
    setPpe(prev => reprice(prev, mlRes.ppe));
    showToast('Re-priced ' + changes.length + ' row' + (changes.length === 1 ? '' : 's') + ' from the masterlist. Nothing is saved until you press Save.');
  };
  /* Print or export a CE without disturbing the one being worked on.

     The document is built from what is on screen -- section totals, benefits,
     highlighted costs and the signatory block are all derived from the CE the
     editor is holding -- so producing another CE's paperwork means that CE has
     to be on screen somewhere. It opens in its own tab, which is the part that
     matters: the CE you have open here does not move, and there is nothing to
     restore afterwards. */
  const openForPrint = (id, as) => {
    /* The workbook is built in a hidden frame: a new tab -- in the installed
       app, a whole second window -- stayed open on that CE after the file had
       downloaded. The frame is removed once the file is out. */
    if (as === 'detailed') {
      const f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = window.location.pathname + '?print=' + id + '&as=detailed';
      document.body.appendChild(f);
      setTimeout(() => { try { f.remove(); } catch (_e) {} }, 60000);
      showToast('Preparing the Excel file — it will download in a few seconds...');
      return;
    }
    const w = window.open(window.location.pathname + '?print=' + id + '&as=' + as, '_blank');
    if (!w) { showToast('Allow pop-ups for this site to print a CE from here.', true); return; }
    let _what = 'the printable CE';
    if (as === 'detailed') _what = 'Export Detailed';
    showToast('Opening ' + _what + ' in a new tab...');
  };
  /* Runs only once the loaded CE has been committed to state -- the export
     functions read what is on screen, so firing any earlier would have printed
     the CE that was open before. */
  useEffect(() => {
    if (!autoPrint) return;
    if ((info.ceNum || '') !== autoPrint.ceNum) return;
    const as = autoPrint.as;
    setAutoPrint(null);
    setTimeout(() => {
      try { if (as === 'detailed') { handleExportXLSX();
        /* In the hidden frame: once the file is out, stop this copy of the app
           so nothing in it can autosave. */
        if (window !== window.top) setTimeout(() => { document.open(); document.write('<p>Exported.</p>'); document.close(); }, 3000);
      } else if (as === 'view') handleGenerateCE({ embed: true }); else handleGenerateCE(); }
      catch (ex) { showToast('Could not produce the document: ' + ex.message, true); }
    }, 250);
  }, [autoPrint, info.ceNum, mp, tools, mats, ppe]);
  /* What a requestor may save: their own request, while it is still one.
     Hiding the costing tabs is how it looks; this is how it holds. Every save
     comes through here, so a control that slips through, a keyboard shortcut
     and an auto-save are all answered in the same place and with the same
     words -- and once an estimator has costed it, it is no longer a request
     and is out of the requestor's hands. */
  const requestorSaveRefusal = (e) => {
    if (!isRequestor) return null;
    const i = (e && e.info) || {};
    if (!i.request) return "Costing is the estimator's. You can raise a request from CE Monitoring, and read this CE in full, but not change it.";
    if (e && e.savedBy && e.savedBy !== currentUser.username) return 'This request was raised by ' + (e.savedByName || e.savedBy) + '. Only they or an admin can change it.';
    return null;
  };
  const handleSave = async () => {
    let _overwrote = null; /* set when bulk mode lets a save replace an existing CE */
    /* Whose request it is, is what was saved, not what is on screen: a save
       stamps savedBy with whoever is saving, so asking the open CE would let
       anyone become its owner by opening it. */
    const _rec = (history || []).find(h => String(h.ceNum || '').trim().toUpperCase() === (info.ceNum || '').trim().toUpperCase());
    const _no = requestorSaveRefusal({ info, savedBy: _rec && _rec.savedBy, savedByName: _rec && _rec.savedByName });
    if (_no) { showToast(_no, true); return; }
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
    if (!String(info.projType || '').trim()) {
      showToast('Discipline is required — choose it on Project Info.', true);
      return;
    }
    /* Every figure on a row, not just its price. A negative quantity quietly
       SUBTRACTED from the CE, and a value that is not a number at all -- from
       an import, or a paste -- made the whole total NaN. */
    const _figs = r => [r.cost, r.rate, r.qty, r.pax, r.days, r.otHours, r.hours, r.kw, r.runHrs, r.perDiem];
    const badCost = [...(mp||[]), ...(tools||[]), ...(mats||[]), ...(ppe||[])]
      .find(r => r && _figs(r).some(v => v !== undefined && v !== null && v !== '' &&
        (!Number.isFinite(Number(v)) || Number(v) < 0)));
    if (badCost) {
      showToast('Every figure on a line — price, quantity, days, people — must be a number, and zero or more. Check ' +
        ((badCost.role || badCost.desc || 'the row with no description').slice(0, 40)) + '.', true);
      return;
    }
    if (!confirmZeroCost('Save anyway?')) return;
    const dup = await dbFindCEByNum(ceNum).catch(() => null);
    /* A logged request is built out and saved over under its own number. Only
       that number: renaming the CE to someone else's number is still refused. */
    const _fromRequest = !!(info.request && String(info.requestNum || '').toUpperCase() === ceNum);
    /* One sequence across companies: SY3-CE-2026-1131 may not exist beside
       SHIC-CE-2026-1131. Refused in bulk mode too -- that overwrites the same
       number, never another company's. */
    const _clash = await dbFindCESeqClash(ceNum, ceNums).catch(() => null);
    if (_clash) {
      showToast('CE Number ' + ceNum + ' is already used as ' + _clash.ceNum + (_clash.savedBy ? ' by ' + _clash.savedBy : '') +
        '. SHIC and SY3 share one sequence. Next free: ' + nextCeNum(history, (ceNum.split('-CE-')[0] || null), [...ceNums, ceNum]), true);
      return;
    }
    if (dup && !dup._imported && !_fromRequest) {
      /* Bulk upload mode lets an admin load historical CEs whose numbers already
         exist. Saving then UPDATES that CE rather than adding a second one, so
         say which one is being replaced instead of failing silently. */
      if (!(isAdmin && bulkMode.on(currentUser?.username))) {
        /* Naming the free number matters: this fires after the estimate is
           finished, and "use a unique CE Number" leaves the person to work
           out which one that is. */
        const _free = nextCeNum(history, (ceNum.split('-CE-')[0] || null), [...ceNums, ceNum]);
        showToast('CE Number "' + ceNum + '" is already taken' +
          (dup.savedBy ? ' by ' + dup.savedBy : '') +
          ' (saved ' + new Date(dup.savedAt).toLocaleDateString() + '). Next free: ' + _free, true);
        setCeNums(p => p.indexOf(ceNum) < 0 ? [...p, ceNum] : p);
        return;
      }
      /* Recorded rather than toasted here: the success toast fires moments later
         and would replace it, leaving no trace that a CE was replaced. */
      _overwrote = new Date(dup.savedAt).toLocaleDateString();
      auditLog('bulk_overwrite', ceNum + ' (was saved ' + _overwrote + ')', currentUser?.username);
    }
    try {
      const _entry = mkEntry();
      /* A signature belongs to the figures it approved. If they changed, every
         routed signature goes and the routing starts again from the first step. */
      const _apv = _entry.info.approval;
      const _wipes = !!(_apv && (_apv.state === 'pending' || _apv.state === 'approved') &&
        (apvFigSig(_entry) !== _apv.figSig || (_apv.contentSig && apvContentSig(_entry) !== _apv.contentSig)));
      /* Asked BEFORE the save, not reported 1.5 seconds after it. Signatures
         that took a week to collect were gone before anyone knew the edit
         counted as a change, with nothing to undo it. */
      if (_wipes) {
        const _lost = apvStatus(_entry.approvers, _apv);
        const _who = Object.values(_apv.lines || {}).map(l => (l && l.byName) || (l && l.by) || '').filter(Boolean);
        const _hand = Object.keys(_entry.signatures || {}).length - _who.length;
        if (_who.length || _hand > 0) {
          const _msg = 'Saving clears ' + (_who.length ? _who.length + ' signature(s) — ' + _who.join(', ') : '') +
            (_who.length && _hand > 0 ? ' and ' : '') + (_hand > 0 ? _hand + ' signed by hand' : '') + '.' + String.fromCharCode(10, 10) +
            'The figures or the wording changed since ' + (_apv.state === 'approved' ? 'it was approved' : 'it was submitted') +
            ', and a signature belongs to the CE it was put to. ' +
            (_lost.total ? 'Routing starts again from the first step, and all ' + _lost.total + ' signatory(ies) sign again.' : '') +
            String.fromCharCode(10, 10) + 'Save and clear them?' + String.fromCharCode(10) +
            'Cancel to keep them — use ↻ Revise to save your changes as a new revision instead.';
          if (!confirm(_msg)) { showToast('Not saved — the signatures on ' + ceNum + ' are untouched.'); return; }
        }
      }
      if (_wipes) {
        const _now = new Date().toISOString(), _had = Object.keys(_apv.lines || {}).length;
        const _na = {..._apv, state: 'pending', figSig: apvFigSig(_entry), contentSig: apvContentSig(_entry), lines: {}, submittedAt: _now,
          log: [...(_apv.log || []), {at: _now, by: currentUser.username, byName: currentUser.name || currentUser.username, action: 'reset', comment: 'CE changed'}]};
        _entry.info = {..._entry.info, approval: _na};
        /* Every signature, hand-drawn ones included: each was put to the CE as it was. */
        _entry.signatures = {};
        setInfo(p => ({...p, approval: _na})); setSignatures(_entry.signatures);
        if (_had || Object.keys(signatures || {}).length) setTimeout(() => showToast('The CE changed — every signature was cleared; routing restarts from the first step.', true), 1500);
      }
      if (_fromRequest) { _entry.info = {..._entry.info, request: false}; setInfo(p => ({...p, request: false})); }
      const _res = await spWithRetry(() => dbSaveHistory(_entry));
      auditLog('save_ce', ceNum, currentUser?.username);
      /* Without this the next New CE in the same session is handed the
         number just used: ceNums is only fetched on load. */
      setCeNums(p => p.indexOf(ceNum) < 0 ? [...p, ceNum] : p);
      _checkAutoBackup();
      /* Seed the pipeline status from the document state, so a CE saved as
         FOR REVIEW arrives in Monitoring already triaged instead of sitting in
         the untriaged bucket saying something different. Only when Monitoring
         has nothing yet -- it never overwrites a status someone has set. */
      try {
        const saved = await dbFindCEByNum(ceNum);
        const mapped = DOC_TO_MON[info.status];
        const _a = _entry.info.approval;
        if (saved && saved.id != null) {
          const _m = monData[saved.id] || {}, _w = {};
          if (mapped && !_m.status) _w.status = mapped;
          if (_a) {
            _w.apv = apvMirror(_entry.approvers, _a);
            /* Saving a CE that happens to be out for approval must not put
               the pipeline status back to For Approval: whoever moved it on
               to Submitted, Ongoing or Awarded watched it snap back every
               time the CE was saved. Only a status nobody has chosen -- blank
               or still Draft -- is moved on. */
            const _st = String(_m.status || '').trim();
            if (_a.state === 'pending' && !Object.keys(_a.lines || {}).length && (!_st || _st === 'Draft')) _w.status = 'For Approval';
          }
          if (Object.keys(_w).length) updateMon(saved.id, _w);
        }
      } catch (_e) { console.warn('status seed skipped:', _e.message); }
      clearDraft();
      /* Both spellings: saveDraft keyed the row off info.ceNum as typed, while
         this save normalises it to upper case. */
      await retireDrafts(ceNum, info.ceNum);
      await loadHist();
      /* dbSaveHistory swallows a SharePoint failure on purpose -- the work is
         kept in this browser rather than lost. Reporting that as "Saved!" is
         how a CE ends up visible to nobody else and unopenable from Monitoring
         on any other machine. Say which of the two happened. */
      if (_res && _res.sp === false) {
        showToast('Saved to THIS BROWSER only — SharePoint did not accept it'
          + (_res.reason ? ' (' + String(_res.reason).slice(0, 70) + ')' : '')
          + '. Nobody else can open ' + ceNum + ' until you run "Push All Local Data to SharePoint".', true);
      } else showToast(_overwrote
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
    /* Find the highest revision already on file for this CE.

       This matched only a trailing "-R1". Almost none of the numbers in the
       lists are written that way -- they are R01, or " R01" -- so revising
       SHIC-CE-2026-0912BR01 produced SHIC-CE-2026-0912BR01-R1: a revision of
       a revision, in a family of its own, counted as a separate CE. ceFamily
       reads every shape in use, so the next revision now follows the one
       before it. */
    const fam = ceFamily(ceNum);
    const base = fam.base;
    let nextRev = fam.rev + 1;
    allHist.forEach(h => {
      const f = ceFamily(h.info?.ceNum || '');
      if (f.key && f.key === fam.key) nextRev = Math.max(nextRev, f.rev + 1);
    });
    /* Matched to how this CE's number was already written: one on R01 goes to
       R02, one on -R1 goes to -R2, one on " R01" keeps its space. A CE with no
       revision yet gets -R1, which is what this has always written. Imposing a
       single house style on an existing number would only mean one CE written
       two ways. */
    let sep = '-', pad = false;
    if (fam.rev > 0) {
      const tail = ceNum.slice(fam.base.length);   /* "R01", " R01", "-R1" */
      sep = tail.replace(/R\d+\s*$/i, '');
      pad = /R0\d/i.test(tail);
    }
    const revLabel = 'R' + (pad && nextRev < 10 ? '0' + nextRev : String(nextRev));
    const revCeNum = base + sep + revLabel;
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
      clearDraft();
      /* The draft was written under the old number; the revision supersedes it. */
      await retireDrafts(ceNum, info.ceNum);
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
      /* Every source failed: SharePoint would not answer and this browser has
         never held the CE. Opening it anyway produced an empty estimate under
         the real CE number, showing a grand total of P0.00 -- and saving from
         there would have written that emptiness back, deleting every line item
         the CE had. Refuse, and say what to do about it. */
      if (d.tools === undefined) {
        showToast('Could not read ' + (d.info?.ceNum || d.ceNum || 'this CE') +
          ' — SharePoint did not answer and this browser has no copy. Nothing was loaded. Check the connection, or ask an admin to run SP Setup → "Repair lists & columns".', true);
        return;
      }
    } else {
      // We have full data from SP — compare with local cache and use whichever is newer
      try {
        const cached = LS.get('ce_cache:' + (d.info?.ceNum || d.ceNum));
        if (cached && cached.savedAt && d.savedAt && cached.savedAt > d.savedAt) d = cached;
      } catch(_) {}
    }
    /* A CE whose header says it cost money but has no line items behind it.

       dbSaveHistory POSTs the header before the line items, so anything that
       fails in between leaves exactly this in SharePoint. It used to open as a
       blank estimate reporting P0.00 with a cheerful "Loaded" toast, which
       reads as "this CE is empty" rather than "this CE did not come back". */
    const _rowCount = (d.mp || []).length + (d.tools || []).length + (d.mats || []).length + (d.ppe || []).length;
    if (!_rowCount && N(d.grand) > 0) {
      showToast('⚠ ' + (d.info?.ceNum || d.ceNum || 'This CE') + ' has a stored total of ' +
        'P' + N(d.grand).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' but no line items in SharePoint — the header was written and the rows were not. ' +
        'Nothing was loaded. Re-import or re-save this CE to restore it.', true);
      return;
    }
    setCeType(d.ceType);
    setInfo({
      ...BLANK_INFO,
      ...d.info
    });
    /* Loading regenerates every row id, scope tasks included. Remap each
       resource row's taskId through the same mapping, or every SOW Breakdown
       assignment would silently orphan on load. */
    const _R = ceIdRemapper(d.sowItems);
    const _sow = _R.sow;
    const _mp=(d.mp||[]).map(_R.rt('mp'));setMp(_mp);try{window.shicCurrentMp=_mp;}catch(_e){}
    const _tools=(d.tools||[]).map(_R.rt('tools'));setTools(_tools);try{window.shicCurrentTools=_tools;}catch(_e){}
    const _mats=(d.mats||[]).map(_R.rt('mats'));setMats(_mats);try{window.shicCurrentMats=_mats;}catch(_e){}
    setPpe((d.ppe || []).map(_R.rt('ppe')));
    /* A drawn signature belongs to the CE it was drawn on. */
    setSignatures(d.signatures && typeof d.signatures === 'object' ? {...d.signatures} : {});
    /* migrate old numeric misc to arrays */
    const rawMisc = d.misc || {};
    const migratedMisc = {};
    MISC_DEF[d.ceType || 'onsite']?.forEach(([k]) => {
      migratedMisc[k] = Array.isArray(rawMisc[k]) ? rawMisc[k].map(_R.rt('misc')) : N(rawMisc[k]) > 0 ? [{
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
    setVerifyNotes(d.verifyNotes ? {...d.verifyNotes} : {});
    /* A logged request being built out, or a clone, is a NEW quote: it starts
       on the company standard and today's ECC rule. Anything else -- opening a
       saved CE, or revising one -- keeps what it was quoted at. */
    setRates(d.info && d.info.request ? {...stampRates(), ...(d.rates || {}), eccRule: 'month'}
      : e && e._newQuote ? {...(d.rates || {}), eccRule: 'month'}
      : d.rates ? {...d.rates} : {});
    /* This content came from the CE, not from a preset, so the effect above
       must not treat it as replaceable. */
    _defaultsSig.current = '';
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
    setAddlCosts(_R.fixAddl(d.addlCosts));
    setMargin(d.margin || 0);
    setScope(d.scope || '');
    setDocFile(d.docRef ? (Array.isArray(d.docRef.files) && d.docRef.files.length
      ? docCombine(d.docRef.files.map(f => ({...f, text: ''})))
      : {name: d.docRef.name, spUrl: d.docRef.spUrl, text: '', size: 0}) : null);
    setDocPreview(false);
    setTab('info');
    /* Opening a CE is not work in progress. The auto-save only asks whether
       the CE has CHANGED since it last wrote, and a CE just loaded had --
       from whatever was on screen before it -- so merely opening one wrote a
       draft of it. Every CE anybody opened ended up in Resume Work. What was
       just loaded is what is saved, so it is recorded as already written. */
    setTimeout(() => { try { if (_live.current) _lastAutoSig.current = _live.current.sig; } catch (_e) {} }, 400);
    showToast('Loaded: ' + (d.info?.ceNum || ''));
  };
  const handleClone = (e) => {
    const d = e.data || e;
    handleLoad({...d, _newQuote: true, signatures: apvStripSigs(d.approvers, d.signatures), info: {...(d.info || {}), approval: undefined, ceNum: nextCeNum(history, null, ceNums), date: new Date().toISOString().slice(0,10)}});
    showToast('Cloned — assigned new CE number.');
  };
  const handleRevise = (e) => {
    const d = e.data || e;
    /* Same shapes as handleSaveRevision, and for the same reason: matching
       only "-R1" meant revising an R01 CE started a second family instead of
       continuing the first. */
    const raw = (d.info?.ceNum || '').trim();
    const fam = ceFamily(raw);
    const base = fam.base;
    let nextRev = fam.rev + 1;
    (history || []).forEach(h => {
      const f = ceFamily(h.info?.ceNum || '');
      if (f.key && f.key === fam.key) nextRev = Math.max(nextRev, f.rev + 1);
    });
    let sep = '-', pad = false;
    if (fam.rev > 0) {
      const tail = raw.slice(fam.base.length);
      sep = tail.replace(/R\d+\s*$/i, '');
      pad = /R0\d/i.test(tail);
    }
    const newCeNum = base + sep + 'R' + (pad && nextRev < 10 ? '0' + nextRev : String(nextRev));
    handleLoad({...d, signatures: apvStripSigs(d.approvers, d.signatures), info: {...(d.info || {}), approval: undefined, ceNum: newCeNum, date: new Date().toISOString().slice(0,10)}});
    showToast('Revision ' + newCeNum + ' loaded — review & save when ready.');
  };
  /* ── Approval routing (approval.js) ── */
  useEffect(() => { if (saveReq) handleSave(); }, [saveReq]);
  useEffect(() => {
    if (tab !== 'summary') return;
    dbGetUsers().then(u => setApvUsers((u || []).filter(x => x.status !== 'pending' && x.status !== 'disabled' && x.status !== 'rejected'))).catch(() => {});
  }, [tab]);
  /* Monitoring knows when a revision was superseded; the CE's own copy of the
     approval was written before that and still says pending. */
  const _apvMon = (() => { try { const id = (history.find(h => ((h.info && h.info.ceNum) || h.ceNum) === info.ceNum) || {}).id; return id != null && (monData[id] || {}).apv; } catch (_e) { return null; } })();
  const apvState = (_apvMon && _apvMon.state === 'superseded') ? 'superseded' : ((info.approval && info.approval.state) || 'none');
  /* The signatures this CE may show: a routed line's stamped image only
     while that line is signed in the approval on the CE right now. */
  const visSigs = useMemo(() => apvVisibleSigs(approvers, info.approval, signatures), [approvers, info.approval, signatures]);
  const apvLocked = apvState === 'pending' || apvState === 'approved';
  const _apvMe = () => ({ by: currentUser.username, byName: currentUser.name || currentUser.username, at: new Date().toISOString() });
  /* Store an approval change. Save refuses a CE number that is already saved
     (so a finished CE cannot be overwritten by accident) -- which meant Submit
     and Withdraw on any saved CE failed with "already taken", nothing was
     stored, and approvers never saw it. A saved CE is updated directly
     instead, and only while its figures are the ones on screen. */
  const apvPersist = async (apvIn, sigs) => {
    let apv = apvIn;
    const e = mkEntry();
    e.info = {...e.info, approval: apv};
    e.signatures = sigs;
    const num = String(e.info.ceNum || '').trim().toUpperCase();
    const dup = await dbFindCEByNum(num).catch(() => null);
    if (!dup || dup.id == null) {
      /* Never saved: the normal save stores it, approval and all. */
      setSignatures(sigs); setInfo(p => ({...p, approval: apv})); setSaveReq(n => n + 1);
      return true;
    }
    try {
      const full = await dbLoadCE(dup.id);
      if (full && apvFigSig(full) !== apvFigSig(e)) {
        showToast('The figures on screen differ from the saved ' + num + '. Use ↻ Revise to save your changes as a new revision, then submit that.', true);
        return false;
      }
      e.info.ceNum = num;
      e.savedBy = (full && full.savedBy) || dup.savedBy || e.savedBy;
      /* Anything edited since the saved copy -- scope, notes, a line's text --
         and no signature on it stands, hand-drawn ones included. */
      if (full && apvContentSig(full) !== apvContentSig(e) && Object.keys(e.signatures || {}).length) {
        /* Asked first, and only then cleared. And the signed lines go with the
           images: a line marked signed with no signature on it shows an
           approval nobody can see. */
        if (!confirm('This clears ' + Object.keys(e.signatures).length + ' signature(s) on ' + num + '.' + String.fromCharCode(10, 10) +
          'The wording changed since it was saved, and a signature belongs to the CE it was put to.' + String.fromCharCode(10, 10) +
          'Go on and clear them?')) { showToast('Nothing was changed — the signatures on ' + num + ' stand.'); return false; }
        e.signatures = {}; sigs = {};
        apv = {...apv, lines: {}};
        e.info = {...e.info, approval: apv};
      }
      const res = await spWithRetry(() => dbSaveHistory(e));
      /* The fingerprint has to describe the CE as it comes BACK, not as it
         went in: a figure that returns from SharePoint even slightly
         differently left every approver refused with "The figures changed
         after it was submitted", with nothing they could do about it. */
      if (apv.state === 'pending' && !(res && res.sp === false)) {
        try {
          const back = await dbLoadCE(dup.id);
          if (back && !back._partial && apvFigSig(back) !== apv.figSig) {
            const fixed = {...apv, figSig: apvFigSig(back), contentSig: apvContentSig(back)};
            if (await dbPatchCEInfo(dup.id, {...(back.info || {}), approval: fixed})) apv = fixed;
          }
        } catch (_e) {}
      }
      setSignatures(sigs); setInfo(p => ({...p, ceNum: num, approval: apv}));
      updateMon(dup.id, {
        apv: apvMirror(e.approvers, apv),
        ...(apv.state === 'pending' && !Object.keys(apv.lines || {}).length && (monData[dup.id] || {}).status !== 'For Approval' ? { status: 'For Approval' } : {})
      });
      loadHist();
      if (res && res.sp === false) { showToast('Stored in this browser only — SharePoint did not accept it, so approvers cannot see it yet.', true); return false; }
      return true;
    } catch (ex) { showToast('Could not update the approval: ' + ex.message, true); return false; }
  };
  /* The number of a later revision of this CE, or '' when this is the latest. */
  const apvNewerRevision = num => {
    const f = ceFamily(num); if (!f.key) return '';
    let best = null;
    (history || []).forEach(h => {
      const n = (h.info && h.info.ceNum) || h.ceNum || '', g = ceFamily(n);
      if (g.key === f.key && g.rev > f.rev && (!best || g.rev > best.rev)) best = {rev: g.rev, num: n};
    });
    return best ? best.num : '';
  };
  const apvSubmit = async () => {
    if (!apvRoute(approvers).length) { showToast('Pick a user in the dropdown on at least one signatory card below (it starts on ✍ Sign by hand), then Submit again.', true); return; }
    if (!String(info.ceNum || '').trim()) { showToast('Give the CE a number first.', true); return; }
    /* Only the latest revision can be routed. An older one submitted again was
       closed as superseded the next time anyone opened the list, so approvers
       saw it appear and vanish. */
    { const newer = apvNewerRevision(info.ceNum);
      if (newer) { showToast(info.ceNum + ' has been revised — ' + newer + ' is the latest. Load ' + newer + ' and submit that.', true); return; } }
    const me = _apvMe();
    /* Submitted again after a Return, with the figures and the wording exactly
       as they were signed: the signatures already given still count, and only
       the signatories who had not reached it yet are asked. */
    const _e0 = mkEntry();
    const _kept = apvResume(_e0, info.approval);
    const _keptN = Object.keys(_kept).length;
    const apv = { state: 'pending', submittedAt: me.at, submittedBy: me.by, submittedByName: me.byName, figSig: apvFigSig(_e0), contentSig: apvContentSig(_e0), lines: _kept,
      skipped: (info.approval && info.approval.skipped) || {},
      log: [...((info.approval && info.approval.log) || []), {...me, action: 'submitted', kept: _keptN}] };
    const ok = await apvPersist(apv, _keptN ? {...signatures} : apvStripSigs(approvers, signatures));
    if (!ok) return;
    auditLog('apv_submit', info.ceNum, currentUser?.username);
    const s0 = apvStatus(approvers, apv);
    showToast('Submitted for approval — waiting on ' + s0.waiting.map(l => l.name || l.user).join(', ') + '.' +
      (_keptN ? ' ' + _keptN + ' signature(s) from before the return still stand.' : ''));
  };
  const apvWithdraw = () => {
    if (!confirm('Withdraw this CE from approval?\n\nSignatures collected so far are cleared.')) return;
    const me = _apvMe(), a = info.approval || {};
    apvPersist({...a, state: 'withdrawn', lines: {}, log: [...(a.log || []), {...me, action: 'withdrawn'}]}, apvStripSigs(approvers, signatures))
      .then(ok => ok && showToast('Withdrawn from approval.'));
  };
  /* The editor signs the SAVED CE, so what is on screen must be what was saved. */
  const _apvEditorId = () => {
    if (apvFigSig(mkEntry()) !== (info.approval || {}).figSig) { showToast('Save or undo your changes first — you can only sign the figures that were submitted.', true); return null; }
    const k = String(info.ceNum || '').trim().toUpperCase();
    const h = (history || []).find(x => String((x.info && x.info.ceNum) || x.ceNum || '').trim().toUpperCase() === k && typeof x.id === 'number');
    if (!h) { showToast('Could not find the saved copy of this CE.', true); return null; }
    return h.id;
  };
  /* Signing reads the CE back, merges the signature into it, writes it, writes
     the Monitoring row and reloads the list -- seconds, over SharePoint, with
     the signature pad already closed. Nothing said so, so the screen simply sat
     there and the CE reappeared signed a moment later, by which time you had
     no way of knowing whether your click had registered or you had missed. */
  const [apvBusy, setApvBusy] = useState(null);
  const apvStartSign = (ceId) => {
    const fromEditor = ceId == null;
    const id = fromEditor ? _apvEditorId() : ceId;
    if (id == null) return;
    setSigModal({ mode: 'approve', ceId: id, fromEditor, id: '__apv', name: currentUser.name || currentUser.username });
  };
  const apvStartReturn = (ceId) => {
    const fromEditor = ceId == null;
    const id = fromEditor ? _apvEditorId() : ceId;
    if (id == null) return;
    const c = prompt('Return this CE to the estimator.\n\nWhat needs to change? (required)');
    if (c == null) return;
    if (!c.trim()) { showToast('A comment is required to return a CE.', true); return; }
    apvAct(id, 'return', { comment: c.trim(), fromEditor });
  };
  const apvAct = async (ceId, action, opt = {}) => {
    if (apvBusy) return false;
    setApvBusy(action === 'return' ? 'Returning the CE to the estimator' : 'Signing the CE');
    try {
      const full = await dbLoadCE(ceId);
      if (!full) { showToast('Could not open that CE.', true); return false; }
      const inf = {...(full.info || {})}, a0 = inf.approval;
      if (!a0 || a0.state !== 'pending') { showToast('This CE is not waiting for approval.', true); return false; }
      /* Signing writes the whole CE back, so a CE that only half arrived
         would be saved with its missing lines gone for good. */
      if (full._partial) { showToast('This CE did not arrive complete — ' + (full._missingRows || 'some') + ' line(s) are missing, and signing it would save it that way. Refresh and open it again.', true); return false; }
      if (apvFigSig(full) !== a0.figSig) {
        showToast('The figures changed after it was submitted (it now totals ' + 'P' + N(N(full.grand) || computeCEGrand(full)).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ') — it has to be submitted again.', true);
        return false;
      }
      const me = _apvMe();
      const line = apvCanSign(full.approvers, a0, me.by);
      let apv = {...a0, lines: {...(a0.lines || {})}, log: [...(a0.log || [])]};
      let sigs = {...(full.signatures || {})};
      if (action === 'approve') {
        if (!line) { showToast('It is not your turn to sign this CE.', true); return false; }
        sigs[line.id] = await apvStamp(opt.sig, me.byName, apvWhen(me.at), inf.ceNum, line.title || line.role);
        apv.lines[line.id] = { at: me.at, by: me.by, byName: me.byName };
        apv.log.push({...me, action: 'approved', role: line.role});
        if (apvStatus(full.approvers, apv).done) apv.state = 'approved';
      } else {
        if (!line && !isAdmin) { showToast('Only the signatory whose turn it is can return this CE.', true); return false; }
        /* A Return no longer wipes the signatures already collected. Sending a
           CE back for a wording change made three people sign again for a
           change none of them had asked about. They stand while the CE they
           were put to stands: the estimator's next save clears them if, and
           only if, the figures or the wording change. */
        apv.lines = apvKeepOnReturn(full.approvers, apv, sigs);
        apv.state = 'returned';
        apv.log.push({...me, action: 'returned', comment: opt.comment, kept: Object.keys(apv.lines).length});
      }
      inf.approval = apv;
      /* Two signatories signing in the same minute: the second read the CE
         before the first had written, and writing the whole CE back dropped
         the first signature. Read it once more at the last moment and fold
         the two together. */
      let out = {...full, info: inf, signatures: sigs};
      try {
        const now = await dbLoadCE(ceId);
        const aN = now && now.info && now.info.approval;
        if (now && !now._partial && aN && aN.state === 'pending' && !(action === 'approve' && aN.lines && aN.lines[line.id])) {
          const appr = now.approvers || full.approvers;
          const merged = {...apv, lines: {...(aN.lines || {}), ...apv.lines}, log: apvMergeLog(aN.log, apv.log)};
          if (action === 'approve') {
            merged.state = apvStatus(appr, merged).done ? 'approved' : 'pending';
            out = {...now, info: {...(now.info || {}), approval: merged}, signatures: {...(now.signatures || {}), [line.id]: sigs[line.id]}};
          } else {
            out = {...now, info: {...(now.info || {}), approval: merged}, signatures: apvStripSigs(appr, now.signatures || {})};
          }
          apv = merged; sigs = out.signatures;
        }
      } catch (_e) {}
      const res = await spWithRetry(() => dbSaveHistory({...out, grand: N(out.grand) || computeCEGrand(out)}));
      updateMon(ceId, {
        apv: apvMirror(out.approvers || full.approvers, apv),
        ...(action === 'return' ? { remarks: '↩ Returned by ' + me.byName + ': ' + opt.comment }
          : apv.state === 'approved' ? { status: 'Approved' } : {})
      });
      auditLog('apv_' + action, inf.ceNum + (opt.comment ? ': ' + opt.comment : ''), currentUser?.username);
      if (opt.fromEditor) { setInfo(p => ({...p, approval: apv})); setSignatures(sigs); }
      setViewCE(v => v ? {...v, k: Date.now()} : v);
      loadHist();
      showToast(action === 'return' ? 'Returned with your comment.' : apv.state === 'approved' ? 'Signed — the CE is fully approved.' : 'Signed. It moves on to the next signatory.', res && res.sp === false);
      return true;
    } catch (ex) { showToast('Could not record that: ' + ex.message, true); return false; }
    finally { setApvBusy(null); }
  };
  /* Whether it is my turn on the CE open in the viewer. The button used to
     ask Monitoring alone, so an approver whose mirror was never written, or
     was written stale, had no way to sign at all. Ask the CE itself, and
     put the mirror right while we are there. */
  const [viewApvTurn, setViewApvTurn] = useState(false);
  useEffect(() => {
    setViewApvTurn(false);
    const id = (viewCE && !viewCE.draftKey) ? viewCE.id : null;
    if (id == null || !currentUser || apvMonWaitsOn(monData[id], currentUser.username)) return;
    let off = false;
    (async () => {
      try {
        const full = await dbLoadCE(id);
        const a = full && full.info && full.info.approval;
        if (off || !a || a.state !== 'pending') return;
        if (apvCanSign(full.approvers, a, currentUser.username)) setViewApvTurn(true);
        const fresh = apvMirror(full.approvers, a);
        if (JSON.stringify(fresh) !== JSON.stringify(((monData[id] || {}).apv) || null)) updateMon(id, { apv: fresh });
      } catch (_e) {}
    })();
    return () => { off = true; };
  }, [viewCE && viewCE.id, viewCE && viewCE.k, currentUser && currentUser.username]);
  /* A signatory who is away holds up everyone behind them. An admin can hand
     the line to somebody else, or take it out of the routing altogether.
     Neither touches the figures, and both are written to the CE's own trail,
     so what happened to the line is on the record. A line already signed is
     left alone: a signature is not an admin's to move. */
  const [apvAbsent, setApvAbsent] = useState(null);
  const apvAdminLine = async (action, lineId, arg) => {
    const ceId = _apvEditorId();
    if (ceId == null) return false;
    try {
      const full = await dbLoadCE(ceId);
      if (!full) { showToast('Could not open that CE.', true); return false; }
      if (full._partial) { showToast('This CE did not arrive complete - refresh and open it again.', true); return false; }
      const inf = {...(full.info || {})}, a0 = inf.approval;
      if (!a0 || a0.state !== 'pending') { showToast('This CE is not waiting for approval.', true); return false; }
      const me = _apvMe();
      const appr = (full.approvers || []).map(x => ({...x}));
      const ln = appr.find(x => String(x.id) === String(lineId));
      if (!ln) { showToast('That signatory is no longer on this CE.', true); return false; }
      if ((a0.lines || {})[lineId]) { showToast((ln.name || ln.user) + ' has already signed - that cannot be undone from here.', true); return false; }
      const apvN = {...a0, lines: {...(a0.lines || {})}, skipped: {...(a0.skipped || {})}, log: [...(a0.log || [])]};
      let said = '';
      if (action === 'skip') {
        apvN.skipped[lineId] = {at: me.at, by: me.by, byName: me.byName, reason: String(arg || '')};
        apvN.log.push({...me, action: 'skipped', role: ln.role, comment: (ln.name || ln.user || 'that line') + (arg ? ': ' + arg : '')});
        said = (ln.name || ln.user) + ' was taken out of the routing - it moves on without them.';
      } else {
        const u = arg || {};
        if (!u.username) { showToast('Pick who it goes to.', true); return false; }
        if (u.username === ln.user) { showToast('It is already with ' + (ln.name || ln.user) + '.', true); return false; }
        apvN.log.push({...me, action: 'reassigned', role: ln.role, comment: (ln.name || ln.user || 'nobody') + ' -> ' + (u.name || u.username)});
        said = (ln.title || ln.role || 'The line') + ' now waits on ' + (u.name || u.username) + '.';
        ln.user = u.username; ln.name = u.name || u.username;
        delete apvN.skipped[lineId];
      }
      if (apvStatus(appr, apvN).done) apvN.state = 'approved';
      const res = await spWithRetry(() => dbSaveHistory({...full, approvers: appr, info: {...inf, approval: apvN}, grand: N(full.grand) || computeCEGrand(full)}));
      updateMon(ceId, {apv: apvMirror(appr, apvN), ...(apvN.state === 'approved' ? {status: 'Approved'} : {})});
      auditLog('apv_' + action, inf.ceNum + ' - ' + (ln.title || ln.role || lineId), currentUser?.username);
      setApprovers(appr); setInfo(p => ({...p, approval: apvN}));
      loadHist();
      showToast(said + (apvN.state === 'approved' ? ' The CE is now fully approved.' : ''), res && res.sp === false);
      return true;
    } catch (ex) { showToast('Could not change that signatory: ' + ex.message, true); return false; }
  };
  const apvBar = () => {
    const a = info.approval, s = apvStatus(approvers, a), me = currentUser.username;
    const mine = apvCanSign(approvers, a, me);
    const col = {pending: 'var(--accent-cyan)', approved: '#16a34a', returned: ERR}[apvState] || MT;
    const lbl = {none: 'Not submitted for approval', withdrawn: 'Withdrawn from approval', returned: '↩ Returned',
      superseded: '⊘ Superseded' + (_apvMon && _apvMon.supersededBy ? ' by ' + _apvMon.supersededBy : '') + ' — route the latest revision instead',
      approved: '✅ Approved · ' + s.signedN + '/' + s.total + ' signed',
      pending: '⏳ Step ' + s.step + ' · ' + s.signedN + '/' + s.total + ' signed · waiting on ' + s.waiting.map(l => l.name || l.user).join(', ')}[apvState];
    const ret = a && (a.log || []).filter(l => l.action === 'returned').slice(-1)[0];
    const b = (t, title, on, kind) => /*#__PURE__*/React.createElement("button", {style: {...btn(kind || 'def', true), fontSize: 10, padding: '3px 8px', textTransform: 'none', letterSpacing: 0}, title, onClick: on}, t);
    return /*#__PURE__*/React.createElement("div", {style: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '0 0 10px', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + alpha(BDR, '88'), background: SURF}},
      /*#__PURE__*/React.createElement("b", {style: {fontSize: 11, color: col, textTransform: 'none', letterSpacing: 0}}, lbl),
      apvState === 'returned' && ret && /*#__PURE__*/React.createElement("span", {style: {fontSize: 10, color: MT, textTransform: 'none', letterSpacing: 0}}, '— ' + ret.byName + ': "' + ret.comment + '"'),
      /*#__PURE__*/React.createElement("span", {style: {flex: 1}}),
      !apvLocked && b('One after another', 'Each linked signatory signs in turn, left to right', () => setApprovers(p => p.map((x, i) => ({...x, step: i + 1})))),
      !apvLocked && b('All at once', 'Every linked signatory can sign straight away, in any order', () => setApprovers(p => p.map(x => ({...x, step: 1})))),
      !apvLocked && b('📤 Submit for approval', s.total > 0 ? 'Save and send to the linked signatories. Changing the figures later clears their signatures.' : 'First pick a user in the dropdown on at least one signatory card below', apvSubmit, 'acc'),
      apvLocked && (isAdmin || (a && a.submittedBy === me)) && b('Withdraw', 'Take it back out of approval and clear the signatures', apvWithdraw),
      mine && b(apvBusy ? '✍ Signing…' : '✍ Approve & Sign', apvBusy ? 'Saving your signature — a moment' : 'Sign the saved CE as ' + (mine.role || 'signatory'), () => { if (!apvBusy) apvStartSign(null); }, 'ok'),
      apvState === 'pending' && (mine || isAdmin) && b('↩ Return', 'Send it back to the estimator with a comment', () => apvStartReturn(null)),
      apvState === 'pending' && isAdmin && s.waiting.length > 0 && b('👤 Signatory away', 'Hand a waiting line to somebody else, or take it out of the routing', () => setApvAbsent({to: ''})),
      s.skippedN > 0 && /*#__PURE__*/React.createElement("span", {style: {fontSize: 10, color: MT, textTransform: 'none', letterSpacing: 0}}, '· ' + s.skippedN + ' skipped'));
  };
  /* Put the matching preset's notes and signatories on the CE.

     Returns false when nothing matches, so callers can leave what is there
     alone rather than blanking it. */
  const applyCeDefaults = (type, discipline, force) => {
    const p = ceDefaultFor(ceDefaults, type, discipline);
    const nextNotes = p ? (p.notes || []).map((t, i) => ({id: uid(), seq: i + 1, text: String(t)})) : [];
    const nextAps = p && (p.approvers || []).length
      ? JSON.parse(JSON.stringify(p.approvers))
      : JSON.parse(JSON.stringify(CE_FALLBACK_APPROVERS));
    /* Whoever is signed in prepared it. The preset cannot name them -- it is
       shared by everyone -- so the name is left blank there and filled in
       here. A preset that DOES name someone is left alone. */
    const _me = (currentUser.name || currentUser.username || '').trim();
    if (_me) nextAps.forEach(a => {
      if (/prepared/i.test(a.role || '') && !String(a.name || '').trim()) a.name = _me;
    });
    if (!p && !force) return false;
    setNotes(nextNotes);
    setApprovers(nextAps);
    _defaultsSig.current = JSON.stringify({n: nextNotes.map(n => n.text), a: nextAps});
    return !!p;
  };
  /* Safe to re-apply only while nothing has been edited since the last one. */
  const _defaultsUntouched = () =>
    _defaultsSig.current === JSON.stringify({n: notes.map(n => String(n.text || '')), a: approvers});

  /* Re-apply when the CE type or the discipline changes, and once the presets
     arrive from SharePoint.

     Only while the notes and signatories are still exactly what the last
     preset put there. Otherwise switching Onsite to Supply would throw away
     notes and names the estimator had just typed, which is a worse failure
     than not applying a default. */
  useEffect(() => {
    if (!ceDefaults.length) return;
    if (_defaultsUntouched()) applyCeDefaults(ceType, info.projType, true);
  }, [ceType, info.projType, ceDefaults]);
  const handleNew = () => {
    setCeType('onsite');
    setInfo({
      ...BLANK_INFO,
      ceNum: nextCeNum(history, null, ceNums),
      date: new Date().toISOString().slice(0, 10)
    });
    setMp([]);
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
    setRates(stampRates());
    setVerifyNotes({});
    setSignatures({});
    applyCeDefaults(ceType, BLANK_INFO.projType, true);
    setAddlCosts([]);
    setMargin(0);
    setDocFile(null);
    setDocPreview(false);
    setTab('info');
    showToast('New CE started.');
  };
  /* Export the CE as a formatted workbook.

     This used to dump five sheets of bare arrays -- no headers, no borders,
     no number formats, every section flattened into one "Resources" tab. The
     sales team could read the printed CE but could not work with the file, so
     the workbook now mirrors the master SY3 CE workbook they already know:
     a CE SUMMARY tab, the scope, and one bill per tab (BOL / BOTE / BOCM /
     PPE / MISC.), each with the same tables the printed CE shows.

     Written through SHICXlsx rather than XLSX.writeFile because the vendored
     SheetJS build cannot write cell styles, and the formatting is the whole
     point of this export. */
  const handleExport = () => {
    const cl = ceType === 'shopworks' ? 'Shopwork' : ceTypeLabel(ceType);
    const S = (v, s, span) => ({v: v, s: s, span: span});
    const COLS = [7, 46, 9, 9, 10, 15, 17];

    /* Every sheet opens with the same four rows: document control on the
       right, then a black title bar and the CE identifiers -- the same header
       the printed CE carries at the top of each page. */
    const head = title => [
      [S('COST ESTIMATE SUMMARY', 'title', 4), null, null, null, null, S('Document No.:', 'doc'), S(cfg.docNo || '', 'doc')],
      [null, null, null, null, null, S('Revision No.:', 'doc'), S('0', 'doc')],
      [],
      [S(title, 'secbar', 6)],
      [S('CE No.:', 'label'), S(info.ceNum || '', 'val'), null, S('CE TYPE:', 'label'), S(cl.toUpperCase(), 'val'), S('DATE:', 'label'), S(info.date || '', 'val')],
      []
    ];

    const sheets = [];

    /* ---- CE SUMMARY ---------------------------------------------------- */
    const sum = head('COST ESTIMATE SUMMARY');
    [['PROJECT TYPE:', (info.projType ? info.projType + ' ' : '') + cl],
     ['PROJECT DESCRIPTION:', info.description],
     /* Beside the description, because it describes the same thing: what the
        job is being quoted on. It used to be printed below END USER, three
        rows away from the work it qualifies. */
     ['MATERIAL:', info.material],
     ['CLIENT NAME:', info.client],
     ['CLIENT LOCATION:', info.location],
     ['ATTENTION:', info.attention],
     ['END USER:', info.endUser],
     ['RCE No.:', rceNo],
     ['QUANTITY:', (info.qty || 1) + ' ' + qtyUom],
     ['NO. OF DAYS:', info.days],
     ['STATUS:', docStatus]].forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) return;
      sum.push([S(k, 'label'), S(String(v), 'val', 5)]);
    });
    sum.push([]);
    sum.push([S('ITEM', 'th'), S('DESCRIPTION', 'th', 4), null, null, null, null, S('TOTAL COST', 'th')]);
    ceSections.filter(x => x.v > 0).forEach(x => {
      const _blank = !ceLayout.parentCarries && !!ceBreakdown[x.printLabel];
      sum.push([S(x.letter, 'tdc'), S(x.printLabel, 'td', 4), null, null, null, null, S(_blank ? '' : N(x.v), 'tdn')]);
      /* A section with parts is itemised under it. Which way round depends
         on the layout, and both arrangements exist for the same reason: read
         down TOTAL COST and every cost must appear exactly once.
           Mechanical keeps the section's figure in the column and sets its
         parts beside it, in a column of their own, marked "of which".
           Electrical leaves the section's own cell empty and lets the parts
         carry the figures, which is how SY3-F-ACF-009 has always read.
         Before either, the parts sat in the total column looking exactly
         like the sections, and the column added up to more than the CE. */
      const kids = ceBreakdown[x.printLabel];
      if (kids) kids.forEach(k => sum.push(ceLayout.parentCarries
        ? [S('', 'tdc'), S('        of which  ' + k.letter + '  ' + k.label, 'tdsub', 4), null, null, null, S(N(k.v), 'tdsubn'), S('', 'tdn')]
        : [S('', 'tdc'), S('      ' + k.letter + '.  ' + k.label, 'td', 4), null, null, null, null, S(N(k.v), 'tdn')]));
    });
    sum.push([S('', 'totlbl'), S('TOTAL AMOUNT:', 'totlbl', 4), null, null, null, null, S(N(grand), 'tot')]);
    if (showUnitP) sum.push([S('', 'totlbl'), S(unitLbl, 'totlbl', 4), null, null, null, null, S(N(unitP), 'tot')]);
    if (showUnitP && perJobT) sum.push([S('', 'totlbl'), S(perJobLbl, 'totlbl', 4), null, null, null, null, S(N(perJobT), 'tot')]);
    if (margin !== 0) {
      sum.push([S('', 'totlbl'), S('MARGIN:', 'totlbl', 4), null, null, null, null, S((margin > 0 ? '+' : '') + margin + '%', 'totlbl')]);
      sum.push([S('', 'totlbl'), S('SELLING PRICE:', 'totlbl', 4), null, null, null, null, S(N(grand * (1 + margin / 100)), 'tot')]);
    }
    if (hlRows.length) {
      sum.push([]);
      sum.push([S('HIGHLIGHTED COSTS (already included above)', 'sec')]);
      hlRows.forEach(r => sum.push([S('', 'tdc'), S(hlLabel(r).toUpperCase(), 'td', 4), null, null, null, null, S(N(hlAmt(r)), 'tdn')]));
    }
    if (servicesSummary.on && servicesSummary.ok) {
      sum.push([]);
      sum.push([S('SERVICES', 'sec')]);
      servicesSummary.lines.forEach(l => sum.push([S('', 'tdc'), S(l.label.toUpperCase() + ':', 'td', 4), null, null, null, null, S(N(l.v), 'tdn')]));
      if (Math.abs(servicesSummary.other) >= 0.005) sum.push([S('', 'tdc'), S('OTHER MISC. TO THE PROJECT:', 'td', 4), null, null, null, null, S(N(servicesSummary.other), 'tdn')]);
      sum.push([S('', 'totlbl'), S('SERVICES TOTAL AMOUNT:', 'totlbl', 4), null, null, null, null, S(N(servicesSummary.total), 'tot')]);
    }
    const sowNotes = (sowItems || []).filter(x => String(x.note || '').trim());
    const noteLines = [...notes.map(n => String(n.text || '')),
                       ...sowNotes.map(x => 'Scope ' + (sowLabels[x.id] || '') + ' — ' + String(x.note).trim())].filter(t => t.trim());
    if (noteLines.length) {
      sum.push([]);
      sum.push([S('NOTE:', 'sec')]);
      noteLines.forEach((t, i) => sum.push([null, S((i + 1) + '. ' + t, 'note', 5)]));
    }
    const aps = (approvers || []).filter(a => a.role || a.name || a.title);
    if (aps.length) {
      sum.push([], []);
      sum.push(aps.map(a => S((a.role || '') + ':', 'label')));
      sum.push([], []);
      sum.push(aps.map(a => S(a.name || '', 'label')));
      sum.push(aps.map(a => S(a.title || a.role || '', 'val')));
    }
    sheets.push({name: 'CE SUMMARY', cols: COLS, rows: sum});

    /* ---- SCOPE OF WORK -------------------------------------------------- */
    if (sowItems.length) {
      const sow = head('SCOPE OF WORK');
      let mc = 0, sc = 0;
      sowItems.forEach(it => {
        if (it.type === 'main') { mc++; sc = 0; sow.push([S(mc + '.', 'label'), S(it.text || '', 'label', 5)]); }
        else { sc++; sow.push([null, S(mc + '.' + sc + '  ' + (it.text || ''), 'note', 5)]); }
      });
      sheets.push({name: 'SCOPE', cols: COLS, rows: sow});
    }

    /* ---- BOL (manpower + benefits) -------------------------------------- */
    /* A row with no role is not a hire: mpWage costs it at zero, so printing
       it would put a line on the client's copy that the total does not carry. */
    /* ---- MOB / DEMOB ------------------------------------------------------ */
    const _mobList = rows => (rows || []).filter(r => String(r.desc || '').trim() || N(r.rate) > 0);
    if (cfg.mobDemob && (_mobList(mobVehicles).length || _mobList(demobVehicles).length)) {
      const s = head('MOBILIZATION / DEMOBILIZATION');
      [['MOBILIZATION', mobVehicles, mobVehiclesT], ['DEMOBILIZATION', demobVehicles, demobVehiclesT]].forEach(([lbl, all, tot]) => {
        const list = _mobList(all);
        if (!list.length) return;
        const crew = list.filter(r => r.kind === 'mp'), exp = list.filter(r => r.kind !== 'mp');
        s.push([S(lbl, 'sec')]);
        if (crew.length) {
          s.push(['ITEM', 'MANPOWER LOADING', 'QTY', 'DAYS', 'OT HRS/DAY', 'RATE/DAY', 'TOTAL'].map(h => S(h, 'th')));
          crew.forEach((r, i) => s.push([S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty), 'tdc'), S(N(r.days) || 1, 'tdc'), S(N(r.otHours), 'tdc'), S(N(r.rate), 'tdn'), S(mobRowCost(r, rr), 'tdnb')]));
          s.push([S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(crew.reduce((t, r) => t + N(r.qty), 0), 'tot'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S(crew.reduce((t, r) => t + mobRowCost(r, rr), 0), 'tot')]);
        }
        if (exp.length) {
          s.push(['ITEM', 'DESCRIPTION', 'QTY', 'DAYS', '', 'RATE', 'TOTAL'].map(h => S(h, 'th')));
          exp.forEach((r, i) => s.push([S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(N(r.days) || 1, 'tdc'), S('', 'tdc'), S(N(r.rate), 'tdn'), S(mobRowCost(r, rr), 'tdnb')]));
          s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(exp.reduce((t, r) => t + mobRowCost(r, rr), 0), 'tot')]);
        }
        s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S(lbl + ' TOTAL:', 'totlbl'), S(N(tot), 'tot')]);
        s.push([]);
      });
      sheets.push({name: 'MOB-DEMOB', cols: COLS, rows: s});
    }

    const mpActive = mp.filter(r => r.role && (N(r.rate) > 0 || N(r.pax) > 0));
    if (mpActive.length) {
      const bol = head('BILL OF LABOR');
      const shiftKeys = [...new Set(mpActive.map(r => r.shift || 'straight'))];
      shiftKeys.forEach(sk => {
        const rows = mpActive.filter(r => (r.shift || 'straight') === sk);
        if (!rows.length) return;
        const sh = SHIFTS[sk], mult = ceShiftMult(rr, sk);
        const sub = rows.reduce((s, r) => s + mpWage(r), 0);
        bol.push([S(sh?.label || sk.toUpperCase(), 'sec')]);
        bol.push(['ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'DAYS', 'RATE/DAY', 'TOTAL'].map(h => S(h, 'th')));
        rows.forEach((r, i) => bol.push([
          S(i + 1, 'tdc'), S(r.role || '', 'td'), S(N(r.pax) || 1, 'tdc'), S('pax', 'tdc'), S(N(r.days) || 1, 'tdc'),
          S(N(r.rate), 'tdn'),
          S(mpWage(r), 'tdnb')
        ]));
        bol.push([S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(rows.reduce((s, r) => s + N(r.pax), 0), 'tot'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S(sub, 'tot')]);
        bol.push([]);
      });
      if (benefitRows.length) {
        bol.push([S('BENEFITS AND OTHERS', 'sec')]);
        bol.push(['ITEM', 'MANPOWER LOADING', 'QTY', '13TH PAY', 'SSS', 'HDMF, PHIC, SIL & ECC', 'TOTAL'].map(h => S(h, 'th')));
        benefitRows.forEach((r, i) => bol.push([
          S(i + 1, 'tdc'), S(r.role, 'td'), S(r.pax, 'tdc'),
          S(r.thirteenth, 'tdn'), S(r.sss, 'tdn'), S(r.hdmf + r.sil, 'tdn'), S(r.total, 'tdnb')]));
        bol.push([S('', 'totlbl'), S('TOTAL MANPOWER:', 'totlbl'), S(benefitRows.reduce((t, r) => t + N(r.pax), 0), 'tot'), S('', 'totlbl'), S('', 'totlbl'), S('BENEFITS SUB TOTAL:', 'totlbl'), S(benefitsT, 'tot')]);
        bol.push([]);
      }
      bol.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('TOTAL MANPOWER COST:', 'totlbl'), S(N(mpTot), 'tot')]);
      sheets.push({name: 'BOL', cols: COLS, rows: bol});
    }

    /* ---- BOTE / BOCM / PPE ---------------------------------------------- */
    const toolsActive = tools.filter(r => r.desc && String(r.desc).trim());
    if (toolsActive.length) {
      const s = head('BILL OF TOOLS AND EQUIPMENT');
      s.push(['ITEM', 'DESCRIPTION', 'QTY', 'UOM', 'BASIS', 'UNIT PRICE', 'TOTAL'].map(h => S(h, 'th')));
      toolsActive.forEach((r, i) => s.push([
        S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(r.uom || 'Lot', 'tdc'), S(toolBasis(r), 'tdc'),
        S(N(r.cost), 'tdn'), S(toolRowTotal(r, kwhRate, undefined, pwrFrac(r)), 'tdnb')]));
      s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('TOTAL:', 'totlbl'), S(N(toolsT), 'tot')]);
      sheets.push({name: 'BOTE', cols: COLS, rows: s});
    }

    const simpleBill = (sheetName, title, rows, total) => {
      const s = head(title);
      s.push(['ITEM', 'DESCRIPTION', 'QTY', 'UOM', '', 'UNIT PRICE', 'TOTAL'].map(h => S(h, 'th')));
      rows.forEach((r, i) => s.push([
        S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(r.uom || 'Lot', 'tdc'), S('', 'tdc'),
        S(N(r.cost), 'tdn'), S(N(r.qty) * N(r.cost), 'tdnb')]));
      s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('TOTAL:', 'totlbl'), S(N(total), 'tot')]);
      sheets.push({name: sheetName, cols: COLS, rows: s});
    };
    const matsActive = mats.filter(r => r.desc && String(r.desc).trim());
    if (matsActive.length) simpleBill('BOCM', 'BILL OF MATERIALS AND CONSUMABLES', matsActive, matsT);
    const ppeActive = ppe.filter(r => r.desc && String(r.desc).trim());
    if (ppeActive.length) simpleBill('PPE', 'PERSONAL PROTECTIVE EQUIPMENTS', ppeActive, ppeT);

    /* ---- MISC. ----------------------------------------------------------- */
    const cats = miscCosted;
    if (cats.length) {
      const s = head('MISCELLANEOUS');
      cats.forEach(cat => {
        s.push([S(cat.letter + '  ' + cat.label, 'sec')]);
        s.push(['ITEM', 'DESCRIPTION', 'QTY', 'UOM', 'NO. OF DAYS', 'UNIT PRICE', 'TOTAL'].map(h => S(h, 'th')));
        cat.rows.forEach((r, i) => {
          s.push([
          S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(r.uom || 'Lot', 'tdc'), S(N(r.days) || 1, 'tdc'),
          S(N(r.cost), 'tdn'), S(miscRowCost(r), 'tdnb')]);
          (Array.isArray(r.parts) ? r.parts : []).forEach(p => s.push([S('', 'tdc'), S('    - ' + p.label, 'td'), S(N(p.qty), 'tdc'), S('', 'tdc'), S(N(p.days), 'tdc'), S('', 'tdn'), S(N(r.cost) * N(p.qty) * N(p.days), 'tdn')]));
        });
        s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(N(cat.v), 'tot')]);
        s.push([]);
      });
      s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('MISCELLANEOUS TOTAL:', 'totlbl'), S(N(miscT), 'tot')]);
      sheets.push({name: 'MISC.', cols: COLS, rows: s});
    }

    const _xb = ceBrand(getCompanies().find(c => String(c.id) === String(info.companyId)) || getCompanies()[0] || {});
    SHICXlsx.download((info.ceNum || 'CE') + '_' + ceType + '.xlsx', sheets, { bar: _xb.bar, barText: _xb.text });
    showToast('Excel exported — ' + sheets.length + ' sheets.');
  };

  /* ---- Scope Builder (Project Info tab - multi-select) ---- */
  /* Called, not rendered as a component: see ExpenseTable. A component
     declared inside render is a new type every keystroke, and React rebuilds
     its inputs from scratch -- losing the focus mid-word. */
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
    const findIncentive = role => {
      const m = (masterlist?.manpower || []).find(r => r.role.toUpperCase() === role.toUpperCase());
      return m ? m.perDiem || 0 : 0;
    };
    const findTool = desc =>
      (masterlist?.tools || []).find(r => r.desc.toUpperCase() === desc.toUpperCase());
    const findToolCost = desc => {
      const t = findTool(desc);
      return t ? t.cost : 0;
    };
    /* The kW rating and the tier figures travel with the cost, through
       toolSrcFields. A tool brought in from a scope library entry is the same
       machine as one picked from the Masterlist by hand: it has to arrive
       knowing what it draws and what it is worth, or a shopworks CE built from
       a saved scope charges no power and a Tier 1 row charges a day's hire. */
    const findMatCost = desc => {
      const m = (masterlist?.materials || []).find(r => r.desc.toUpperCase() === desc.toUpperCase());
      return m ? m.cost : 0;
    };
    /* The item's own unit from the Masterlist. Every row built from a scope
       used to arrive as Lot (Pcs for PPE) whatever the item was sold in. */
    const findUom = (list, desc, dflt) => {
      const m = (masterlist?.[list] || []).find(r => String(r.desc || '').toUpperCase() === String(desc || '').toUpperCase());
      return (m && String(m.uom || '').trim()) || dflt;
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
      /* Add to CE is additive by design: each press builds a fresh set of scope
         tasks and files a fresh set of resources against them. Pressing it
         twice for the same service is therefore a doubled CE, and the only
         signal used to be the totals quietly growing. Ask first, and name the
         services rather than warning in the abstract. */
      if (addMode) {
        const already = selected.filter(svc => {
          const t = String(svc.title || '').trim().toUpperCase();
          return t && (sowItems || []).some(it => it.type === 'main' &&
            String(it.text || '').replace(/^x\d+\s+/i, '').trim().toUpperCase() === t);
        });
        if (already.length && !confirm(
          (already.length === 1 ? 'This service is' : 'These ' + already.length + ' services are') +
          ' already in this CE:\n\n  ' + already.map(s => s.title).join('\n  ') +
          '\n\nAdding again creates a SECOND set of scope tasks and a second set of ' +
          'resources, so the total will roughly double for them.\n\n' +
          'To change what is already there, edit it in SOW Breakdown instead.\n\nAdd anyway?')) return;
      }

      /* Build the SOW tasks FIRST, so every resource can be filed against the
         scope step that needs it. Before this, resources were merged into one
         flat pile with no taskId and every one of them landed in "Unassigned"
         -- the library already knew the answer and threw it away. */
      const newSow = [];
      const taskOf = {};   /* svc.id -> {main, steps:[ids]} */
      selected.forEach(svc => {
        const q = sowSel[svc.id] || 1;
        const mainId = uid();
        newSow.push({ id: mainId, type: 'main', text: (q > 1 ? 'x' + q + ' ' : '') + svc.title });
        const steps = [];
        (svc.scope || []).forEach(line => {
          if (!String(line).trim()) { steps.push(mainId); return; }
          const sid = uid();
          steps.push(sid);
          newSow.push({ id: sid, type: 'sub', text: String(line).trim() });
        });
        taskOf[svc.id] = { main: mainId, steps };
      });
      /* A resource whose step was deleted, or which predates per-step storage,
         belongs to the service as a whole -- its main task. */
      const taskFor = (svc, step) => {
        const t = taskOf[svc.id];
        if (!t) return '';
        return t.steps[Number.isFinite(step) ? step : -1] || t.main;
      };

      /* Accumulate all items, then merge duplicates by name */
      const mpMap = {}, toolMap = {}, matMap = {}, ppeMap = {};
      const miscAdds = [];
      const scopeParts = [];
      /* With merging ON a role shared by two services becomes ONE row, which can
         only be filed against one task -- the first that asked for it. The other
         task then shows no cost for work it really does need. Turning it off
         keeps a row per service, so the per-task totals are exact. */
      const mkey = (svc, step, name, days) => sowMergeAcross
        ? name.toUpperCase().trim() + '|' + (days || '')
        : svc.id + '|' + (Number.isFinite(step) ? step : -1) + '|' + name.toUpperCase().trim() + '|' + (days || '');
      selected.forEach(svc => {
        const qty = sowSel[svc.id] || 1;
        scopeParts.push('[x' + qty + '] ' + svc.title + ': ' + ((svc.scope||[])[0] || ''));
        for (let i = 0; i < qty; i++) {
          /* Helper: resolve item — accepts string or {name,qty,step} */
          const resolve = item => typeof item === 'string'
            ? {name: item, qty: 1, step: 0}
            : {name: item.name||'', qty: item.qty||1, step: item.step, miscCat: item.miscCat};
          /* Manpower: merge by role — add pax (multiplied by item qty) */
          (svc.mp || []).forEach(raw => {
            const {name: role, qty: iq, step} = resolve(raw);
            if (!role) return;
            const key = mkey(svc, step, role, raw && raw.days);
            if (mpMap[key]) {
              mpMap[key].pax += iq;
            } else {
              mpMap[key] = {
                id: uid(), role, pax: iq,
                /* A role with its own duration works only its step; one without
                   reports from day 1 to completion, which is what every service
                   did before durations existed. */
                days: Number(raw && raw.days) > 0 ? Number(raw.days) : (N(info.days) || 1),
                shift: 'regular_day',
                rate: findRate(role),
                otHours: 0,
                perDiem: findIncentive(role),
                taskId: taskFor(svc, step)
              };
            }
          });
          /* Tools: merge by description — add qty */
          (svc.tools || []).forEach(raw => {
            const {name: desc, qty: iq, step} = resolve(raw);
            if (!desc) return;
            const key = mkey(svc, step, desc);
            if (toolMap[key]) toolMap[key].qty += iq;
            else toolMap[key] = { id: uid(), desc, qty: iq, uom: findUom('tools', desc, (raw && raw.uom) || 'Lot'), cost: findToolCost(desc),
              /* The tier figures travel with the cost, exactly as for a tool
                 picked by hand -- a Tier 1 row built from a saved scope has
                 nothing to derive from otherwise. */
              ...toolSrcFields(findTool(desc)),
              taskId: taskFor(svc, step) };
          });
          /* Consumables: merge by description — add qty */
          (svc.mats || []).forEach(raw => {
            const {name: desc, qty: iq, step} = resolve(raw);
            if (!desc) return;
            const key = mkey(svc, step, desc);
            if (matMap[key]) matMap[key].qty += iq;
            else matMap[key] = { id: uid(), desc, qty: iq, uom: findUom('materials', desc, (raw && raw.uom) || 'Lot'), cost: findMatCost(desc), taskId: taskFor(svc, step) };
          });
          /* PPE: merge by description — add qty */
          (svc.ppe || []).forEach(raw => {
            const {name: desc, qty: iq, step} = resolve(raw);
            if (!desc) return;
            const key = mkey(svc, step, desc);
            if (ppeMap[key]) ppeMap[key].qty += iq;
            else ppeMap[key] = { id: uid(), desc, qty: iq, uom: findUom('ppe', desc, (raw && raw.uom) || 'Pcs'), cost: findPpeCost(desc), taskId: taskFor(svc, step) };
          });
          /* Miscellaneous: keyed by category as well as name, because the same
             description means different things under Transportation and Admin. */
          (svc.misc || []).forEach(raw => {
            const {name: desc, qty: iq, step, miscCat} = resolve(raw);
            if (!desc) return;
            miscAdds.push({ cat: miscCat || 'requirements', desc, qty: iq, step, svc });
          });
        }
      });
      const newMp = Object.values(mpMap);
      const newTools = Object.values(toolMap);
      const newMats = Object.values(matMap);
      const newPpe = Object.values(ppeMap);
      if (addMode) {
        /* ADD mode: merge into existing, skip duplicates. The key includes the
           task -- the same role on two different scope tasks is two real rows,
           and matching on the name alone would silently drop the second. */
        const dk = (name, r) => String(name || '').toUpperCase() + '@' + (r.taskId || '');
        const addTo = (setter, nameKey, rows) => setter(prev => {
          const ex = new Set(prev.map(x => dk(x[nameKey], x)));
          return [...prev, ...rows.filter(r => !ex.has(dk(r[nameKey], r)))];
        });
        addTo(setMp, 'role', newMp);
        addTo(setTools, 'desc', newTools);
        addTo(setMats, 'desc', newMats);
        addTo(setPpe, 'desc', newPpe);
      } else {
        if (newMp.length > 0) setMp(newMp);
        if (newTools.length > 0) setTools(newTools);
        if (newMats.length > 0) setMats(newMats);
        if (newPpe.length > 0) setPpe(newPpe);
      }
      setScope(scopeParts.join('\n\n'));
      /* The SOW tasks were built at the top, before the resources, so the rows
         above already carry the taskId of the step that needs them. */
      if (newSow.length) setSowItems(addMode ? prev => [...prev, ...newSow] : newSow);
      /* Miscellaneous goes through its own setter: it is an object of category
         arrays, not one flat list. A category the current CE type does not have
         falls back to its first, so nothing is dropped on the floor. */
      if (miscAdds.length) setMisc(prev => {
        const valid = (MISC_DEF[ceType] || MISC_DEF['onsite']).map(([k]) => k);
        const next = addMode ? { ...prev } : {};
        miscAdds.forEach(m => {
          const k = valid.includes(m.cat) ? m.cat : valid[0];
          if (!k) return;
          next[k] = [...(next[k] || []), { ...mkMiscRow(), desc: m.desc, qty: m.qty, uom: 'Lot', cost: 0, taskId: taskFor(m.svc, m.step) }];
        });
        return next;
      });
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
        'On-Site Services': 'var(--accent-cyan)',
        'Turbine Repair': 'var(--status-danger)',
        'Valve Repair': 'var(--accent-violet)',
        'Fabrication': 'var(--status-success)',
        'Ndt - Level 2': 'var(--brand-accent)',
        'Ndt \u2013 Level 2': 'var(--brand-accent)',
        'Boiler Protection': 'var(--accent-violet)',
        'Rebabbitting': 'var(--brand-accent)',
        'Materials & Spare Parts': '#34D399',
        'Rental \u2013 Machinery & Tools': '#818CF8',
        'Hard Surfacing & Pulverizer': '#FB923C',
        'Manpower Supply & Tech Support': '#6EE7B7',
        'Long Term Service Contracts': '#A5B4FC',
        'Precision Machining & Fabrication': '#67E8F9'
      };
      const c = colors[cat] || 'var(--text-secondary)';
      return /*#__PURE__*/React.createElement("span", {
        style: {
          background: alpha(c, '22'),
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
        color: 'var(--accent-violet)'
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
          borderBottom: `1px solid ${alpha(BDR, '22')}`,
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
          accentColor: 'var(--accent-violet)'
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
      }, svcCode(svc)), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600,
          fontSize: 12
        }
      }, svc.title), CatBadge({
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
        border: `1px solid ${'var(--accent-violet)'}44`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        color: 'var(--accent-violet)'
      }
    }, selCount, " service", selCount !== 1 ? 's' : '', " selected -- ", totalQty, " total application", totalQty !== 1 ? 's' : ''), /*#__PURE__*/React.createElement("div", {
      style: {
        color: MT,
        fontSize: 11,
        marginTop: 2
      }
    }, sowLib.filter(s => sowSel[s.id]).map(s => `${s.title}${sowSel[s.id] > 1 ? ' x' + sowSel[s.id] : ''}`).join(' + '))),
    /* Resources are filed against the scope step that needs them. Merging a
       shared role across services collapses it onto one task, so the other
       task shows no cost for work it does need -- worth a visible switch
       rather than a silent rule. */
    /*#__PURE__*/React.createElement("label", {
      style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MT, cursor: 'pointer', userSelect: 'none', maxWidth: 210, lineHeight: 1.4 },
      title: sowMergeAcross
        ? "On: a role used by two services becomes one row, filed under the first service that asked for it. The other task will show no cost for it."
        : "Off: each service keeps its own rows, so every scope task carries exactly what it needs. More rows, exact per-task totals."
    }, /*#__PURE__*/React.createElement("input", {
      type: 'checkbox', checked: sowMergeAcross,
      onChange: e => setSowMergeAcross(e.target.checked)
    }), "Merge duplicates across services (shorter list, less exact per task)"),
    /*#__PURE__*/React.createElement("button", {
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
  /* MlEditor's own state, held by App rather than by MlEditor.

     MlEditor is declared inside App, so every App render produced a NEW
     function identity and React unmounted and remounted the whole subtree.
     That reset this state to its defaults -- which is why editing a rate on
     the Tools tab jumped back to Manpower -- and destroyed the focused input,
     which is why typing stopped after one character: setMasterlist re-rendered
     App, App remounted the editor, and the field the cursor was in no longer
     existed.

     With no hooks left inside it, MlEditor is called as a plain function
     below, so its output is part of App's own tree and nothing remounts. */
  const [mlTab, setMlTab] = useState('manpower');
  /* The tier calculator. Held here rather than inside MlEditor: state declared
     in a component that is itself declared in another component is thrown away
     on every render, which is what ate keystrokes in this very editor before. */
  const [mlCalc, setMlCalc] = useState(null);
  const [mlTrend, setMlTrend] = useState(null);   /* Rate Trends: null, or {tab, pick} */
  /* mlTab names the tab; the history stores each resource under its own
     key, and the two are not the same word. Up here because the editor and
     the trends view both need it. */
  const ML_HIST_KIND = {
    manpower: 'mp', tools: 'tools', materials: 'mats',
    ppe: 'ppe', vehicles: 'vehicles'
  };
  const [mlQ, setMlQ] = useState('');
  const [mlPage, setMlPage] = useState(0);
  const [mlQuickAdd, setMlQuickAdd] = useState('');
  const [escPct, setEscPct] = useState('');
  const mlQuickAddRef = React.useRef(null);
  /* Work the tier prices out from what a tool actually costs to own.

     Typing a day rate straight in means the number behind it lives in someone
     else's spreadsheet. Enter the four figures the rate comes from and every
     tier follows -- and, because they are stored on the entry, Tier 1 and
     Tier 3 can be derived from it later without asking again.

     Applying writes the four figures AND the Tier 2 daily rate into Cost,
     which is the field the CE has always priced from, so nothing downstream
     has to know this happened. */
  const MlCalcModal = () => {
    if (!mlCalc) return null;
    const set = (k, v) => setMlCalc(c => ({...c, [k]: v}));
    const rates = toolTierRates(mlCalc);
    const money = v => (v === null || v === undefined) ? '—' :
      '₱' + Number(v).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const field = (k, label, hint) => React.createElement('div', {style: {flex: 1, minWidth: 130}},
      React.createElement('label', {style: LBL}, label),
      React.createElement('input', {
        style: {...INP, fontSize: 12}, type: 'number', min: 0,
        value: mlCalc[k], placeholder: '0',
        onChange: e => set(k, e.target.value)
      }),
      hint && React.createElement('div', {style: {color: MT, fontSize: 9, marginTop: 2}}, hint));
    const tier = (label, v, note) => React.createElement('div', {
      style: {flex: 1, minWidth: 130, padding: '8px 10px', border: '1px solid ' + BDR, borderRadius: 6, background: SURF}
    },
      React.createElement('div', {style: {fontSize: 9, color: MT, letterSpacing: .4}}, label.toUpperCase()),
      React.createElement('div', {style: {fontSize: 15, fontWeight: 700, marginTop: 2}}, money(v)),
      React.createElement('div', {style: {fontSize: 9, color: MT, marginTop: 2}}, note));

    return React.createElement('div', {
      style: {position: 'fixed', inset: 0, background: '#000A', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 200, padding: 16},
      onClick: e => { if (e.target === e.currentTarget) setMlCalc(null); }
    },
      React.createElement('div', {style: {...CS, maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto'}},
        React.createElement('div', {style: {fontWeight: 700, fontSize: 13, marginBottom: 2}}, 'Tier Pricing Calculator'),
        React.createElement('div', {style: {color: MT, fontSize: 11, marginBottom: 12}}, mlCalc.desc || 'this tool'),

        React.createElement('div', {style: {display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}},
          field('unitPrice', 'Unit Price', 'what it cost to buy'),
          field('serviceLife', 'Service Life (years)', 'over how long it is written off'),
          field('maintPerYear', 'Maintenance per Year', 'often 20% of unit price'),
          field('projectsPerYear', 'Projects per Year', 'Tier 1 only')),

        rates ? React.createElement('div', null,
          React.createElement('div', {style: {color: MT, fontSize: 11, marginBottom: 8}},
            'Annual cost to own: ', React.createElement('b', null, money(rates.annual)),
            '  =  unit price / service life + maintenance per year'),
          React.createElement('div', {style: {display: 'flex', gap: 8, flexWrap: 'wrap'}},
            tier('Tier 1 - per project', rates.tier1, 'flat, whatever the duration'),
            tier('Tier 2 - per day', rates.tier2, 'x days on the CE - the default'),
            tier('Tier 3 - per hour', rates.tier3, 'x hours on the CE')),
          React.createElement('div', {style: {color: MT, fontSize: 10, marginTop: 8, lineHeight: 1.6}},
            'Per day and per hour are CALENDAR time: a tool held on site is unavailable to another project overnight, ',
            'so it is charged for the hours it is held, not the hours it runs.')
        ) : React.createElement('div', {style: {color: MT, fontSize: 11, padding: '14px 0'}},
          'Enter a unit price and service life, or a yearly maintenance figure, and the tiers appear here.'),

        React.createElement('div', {style: {display: 'flex', gap: 8, marginTop: 14, alignItems: 'center'}},
          React.createElement('button', {
            style: btn('acc'),
            disabled: !rates,
            onClick: () => {
              const next = {...masterlist, tools: (masterlist.tools || []).map(r => r.id === mlCalc.id ? {
                ...r,
                unitPrice: N(mlCalc.unitPrice), serviceLife: N(mlCalc.serviceLife),
                projectsPerYear: N(mlCalc.projectsPerYear), maintPerYear: N(mlCalc.maintPerYear),
                cost: Math.round(rates.tier2 * 100) / 100
              } : r)};
              saveML(next);
              setMlCalc(null);
              showToast('Cost set to ' + money(rates.tier2) + ' per day. The figures behind it are saved with the item.');
            }
          }, 'Apply to this item'),
          React.createElement('button', {style: btn('def'), onClick: () => setMlCalc(null)}, 'Cancel'),
          rates && React.createElement('span', {style: {color: MT, fontSize: 10}},
            'Cost becomes the Tier 2 daily rate - what the CE has always priced from.'))
      ));
  };
  const MlEditor = () => {
    const colK = {
      manpower: ['category', 'role', 'rate', 'perDiem', 'uom'],
      tools: ['category', 'desc', 'cost', 'uom'],
      materials: ['category', 'desc', 'cost', 'uom'],
      ppe: ['category', 'desc', 'cost', 'uom'],
      vehicles: ['category', 'desc', 'rate', 'uom']
    };
    const colL = {
      manpower: ['Item Code', 'Category', 'Role / Position', 'Day Rate (P)', 'Incentive (P/Day)', 'UOM', 'Food Allowance'],
      /* The four figures a tier price is derived from ride with the rate. The
         workbook the rates are maintained in has them; without them here, they
         could be typed into the calculator one item at a time and no other
         way. Cost stays where it is so an older template still imports. */
      tools: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM',
        'Unit Price', 'Service Life (Years)', 'Projects per Year', 'Maintenance per Year', 'Power (kW)'],
      materials: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM'],
      ppe: ['Item Code', 'Category', 'Description', 'Cost (P)', 'UOM'],
      vehicles: ['Item Code', 'Category', 'Description', 'Rate (P)', 'UOM']
    };
    const downloadMLTemplate = tab => {
      const colMap = {
        manpower: ['code', 'category', 'role', 'rate', 'perDiem', 'uom', 'mealCat'],
        tools: ['code', 'category', 'desc', 'cost', 'uom',
          'unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'],
        materials: ['code', 'category', 'desc', 'cost', 'uom'],
        ppe: ['code', 'category', 'desc', 'cost', 'uom'],
        vehicles: ['code', 'category', 'desc', 'rate', 'uom']
      };
      const keys = colMap[tab] || colMap.manpower;
      /* Write the labels the app shows, not the field keys behind them. This
         wrote `perDiem` long after the column was renamed to Incentive
         everywhere else, because the header row came from this map rather than
         from colL a few lines up. importMLExcel reads both spellings, so a
         template downloaded from an older build still imports. */
      const headers = (colL[tab] || colL.manpower);
      /* Food allowance is written as the word the dropdown shows; blank means
         Auto (guessed from the role name) and imports back as blank. */
      const MEAL_WORD = { PM: 'PM', ADMIN: 'Admin', SKILLED: 'Skilled Manpower' };
      const rows = (masterlist[tab] || []).map(r => keys.map(h => h === 'mealCat' ? (MEAL_WORD[r.mealCat] || '') : (r[h] !== undefined ? r[h] : '')));
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
        /* A header may be the friendly label the template writes ("Role /
           Position", "Day Rate (P)") or the raw field key older templates used.
           Strip the units in brackets and everything that is not a letter, and
           both land on the same word. */
        const norm = h => String(h).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
        const HEADER_KEY = {
          itemcode: 'code', code: 'code',
          category: 'category',
          roleposition: 'role', role: 'role',
          description: 'desc', desc: 'desc',
          /* The maintained tools workbook heads its name column ITEM, not
             Description, and every row was being dropped for want of a name.
             "Item Code" normalises to itemcode, so this cannot swallow it. */
          item: 'desc', itemdescription: 'desc',
          dayrate: 'rate', rate: 'rate',
          cost: 'cost',
          incentive: 'perDiem', perdiem: 'perDiem',
          foodallowance: 'mealCat', mealallowance: 'mealCat', mealcategory: 'mealCat', mealcat: 'mealCat', foodallowancecategory: 'mealCat',
          uom: 'uom',
          /* Tier source columns, under the names the maintained workbook uses
             as well as the template's own. norm() has already stripped spaces,
             punctuation and case, so one entry covers "Unit Price", "UNIT
             PRICE" and "unit_price". */
          unitprice: 'unitPrice',
          servicelifespan: 'serviceLife', servicelife: 'serviceLife',
          estprojectperyear: 'projectsPerYear', projectsperyear: 'projectsPerYear',
          projectperyear: 'projectsPerYear', noofprojectsperyear: 'projectsPerYear',
          maintenanceperyear: 'maintPerYear', maintperyear: 'maintPerYear',
          /* Power rating, under every heading the shop's sheets use for it. */
          powerkw: 'kw', kw: 'kw', power: 'kw', rating: 'kw', ratingkw: 'kw',
          powerrating: 'kw', powerratingkw: 'kw', kilowatt: 'kw', kilowatts: 'kw'
        };
        const rekey = r => {
          const o = {};
          Object.keys(r).forEach(h => {
            const k = HEADER_KEY[norm(h)];
            /* First column wins: a sheet carrying both "Rate" and "Day Rate (P)"
               must not have the later one silently overwrite the earlier. */
            if (k && o[k] === undefined) o[k] = r[h];
          });
          return o;
        };
        const newItems = rows.map((r0, i) => {
          const rk = rekey(r0), r = r0;
          const item = {
            id: uid(),
            code: String(rk.code || r.code || r.Code || '').trim() || 'SHIC-' + tab.toUpperCase().slice(0, 2) + '-' + (900 + i).toString().padStart(3, '0'),
            category: String(rk.category || r.category || r.Category || 'General').trim(),
            [fm.name]: String(rk[fm.name] || r[fm.name] || r.role || r.desc || r.description || '').trim(),
            [fm.cost]: parseFloat(rk[fm.cost] !== undefined && rk[fm.cost] !== '' ? rk[fm.cost] : (r[fm.cost] || r.rate || r.cost || 0)) || 0,
            uom: String(rk.uom || r.uom || r.UOM || 'Day').trim()
          };
          /* Manpower-specific: read the incentive column. It was labelled "Per Diem"
             until the rename, so those headers are still accepted -- every
             masterlist workbook already in circulation carries the old one. */
          if (tab === 'manpower') {
            item.perDiem = parseFloat(rk.perDiem || r.incentive || r.Incentive || r.perDiem || r.perdiem || 0) || 0;
            /* PM / Admin / Skilled, in any case or spelling the sheet uses. A
               blank or unrecognised cell is Auto; a sheet without the column
               leaves the field off entirely. */
            if (rk.mealCat !== undefined) {
              const w = String(rk.mealCat || '').trim().toUpperCase();
              item.mealCat = /^PM$|PROJECT\s*MANAGER/.test(w) ? 'PM' : /ADMIN/.test(w) ? 'ADMIN' : /SKILL/.test(w) ? 'SKILLED' : '';
            }
          }
          /* Only what the sheet actually carried. Writing a 0 for a column the
             workbook does not have would turn "no basis to derive from" into a
             tool that costs nothing to own, and the tiers would read as real
             prices of zero. */
          if (tab === 'tools') {
            ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].forEach(k => {
              if (rk[k] !== undefined && rk[k] !== '') {
                const v = parseFloat(rk[k]);
                if (isFinite(v)) item[k] = v;
              }
            });
            /* The maintained workbook has no Cost column -- it holds the four
               figures and the tier columns worked out from them. Without this
               every imported tool arrives priced at zero. Derive the Tier 2
               daily rate, which is the field the CE prices from. A sheet that
               DOES give a cost keeps it: a typed rate is an override and wins. */
            if (!N(item.cost)) {
              const _r = toolTierRates(item);
              if (_r) item.cost = Math.round(_r.tier2 * 100) / 100;
            }
          }
          return item;
        }).filter(item => item[fm.name]);
        if (!newItems.length) {
          showToast('No valid rows found. Check column headers.', true);
          return;
        }
        /* saveML, not setMasterlist.

           This used to update React state and nothing else: the uploaded rows
           lived in memory until the tab was closed, while every other action on
           this screen -- add, delete, clear, bulk adjust -- went through saveML
           and persisted. Clear List followed by Upload Excel therefore wrote an
           EMPTY list to SharePoint and kept the upload nowhere, so the list
           came back empty. saveML mirrors locally, writes to SharePoint, and
           now reports if SharePoint refuses. */
        const existing = masterlist[tab] || [];
        const key = x => (x[fm.name] || '').toUpperCase().trim();
        const existingNames = new Set(existing.map(key));
        const toAdd = newItems.filter(x => !existingNames.has(key(x)));
        const toUpdate = newItems.filter(x => existingNames.has(key(x)));
        const merged = existing.map(x => {
          const match = toUpdate.find(u => key(u) === key(x));
          return match ? {...x, ...match, id: x.id} : x;
        });
        await saveML({...masterlist, [tab]: [...merged, ...toAdd]});
        /* Out of the state updater: React may invoke that twice, and a toast
           fired from inside it reports the import happening twice. */
        showToast(toAdd.length + ' added, ' + toUpdate.length + ' updated in ' + tab + '.');
      } catch (err) {
        showToast('Import failed: ' + err.message, true);
      }
    };
    const catOpts = {
      manpower: ['Electrical', 'Mechanical', 'Civil', 'General'],
      tools: TOOL_CATEGORIES,
      materials: MATERIAL_CATEGORIES,
      ppe: ['General', 'Welding', 'Electrical', 'Mechanical'],
      vehicles: ['Transport', 'Fuel', 'Allowance', 'Meals', 'Travel', 'Accommodation', 'Personnel', 'Equipment Rental', 'Permit / Fee', 'Miscellaneous']
    };
    const filtered = (masterlist[mlTab] || []).filter(r => !mlQ || (r.role || r.desc || '').toLowerCase().includes(mlQ.toLowerCase()) || r.category.toLowerCase().includes(mlQ.toLowerCase()));
    /* An item priced at zero is not a cheap item, it is an unpriced one -- and
       a masterlist full of them is how a CE goes out understating its own
       cost. The company has bought most of these before; until now nothing
       read that back.

       Only rates from CEs this company actually issued are used. A figure the
       file analyser lifted out of some spreadsheet is worth showing beside a
       rate for a person to weigh, which the clock does, but it is not worth
       writing into the masterlist unattended. */
    const fillFromHistory = () => {
      const kind = ML_HIST_KIND[mlTab];
      const key = (mlTab === 'manpower' || mlTab === 'vehicles') ? 'rate' : 'cost';
      const nk = mlTab === 'manpower' ? 'role' : 'desc';
      const list = masterlist[mlTab] || [];
      const blank = list.filter(r => !N(r[key]) && String(r[nk] || '').trim());
      if (!blank.length) {
        showToast('Every item in ' + mlTab + ' already has a price.');
        return;
      }
      const found = [];
      blank.forEach(r => {
        const issued = (typeof shicRateUses === 'function' ? shicRateUses(kind, r[nk], 10) : [])
          .filter(u => u.issued);
        if (issued.length) found.push({ id: r.id, name: r[nk], rate: issued[0].rate, ce: issued[0].ceNum, n: issued.length });
      });
      if (!found.length) {
        showToast(blank.length + ' item(s) have no price, and none of them appear in any saved CE.', true);
        return;
      }
      const sample = found.slice(0, 8)
        .map(f => '  ' + f.name.slice(0, 38) + '  P' + f.rate.toLocaleString('en-PH', { minimumFractionDigits: 2 }) + '  (' + f.ce + ')')
        .join('\n');
      if (!confirm('Price ' + found.length + ' of ' + blank.length + ' unpriced item(s) from the most recent CE each was charged on?\n\n' +
        sample + (found.length > 8 ? '\n  ... and ' + (found.length - 8) + ' more' : '') +
        '\n\nThe other ' + (blank.length - found.length) + ' appear in no saved CE and are left alone.\n' +
        'Rates read out of analysed spreadsheets are not used.')) return;
      const byId = {};
      found.forEach(f => { byId[f.id] = f.rate; });
      saveML({ ...masterlist, [mlTab]: list.map(r => byId[r.id] !== undefined ? { ...r, [key]: byId[r.id] } : r) });
      showToast('Priced ' + found.length + ' item(s) from CE history. ' + (blank.length - found.length) + ' still unpriced.');
    };
    const updML = (id, k, v) => {
      const next = { ...masterlist, [mlTab]: masterlist[mlTab].map(r => r.id === id ? { ...r, [k]: v } : r) };
      setMasterlist(next);
      try { window.shicMasterlist = next; } catch (_e) {}
      setSyncStatus(s => ({ ...s, dirty: true }));
      if (mlSaveTimer.current) clearTimeout(mlSaveTimer.current);
      mlSaveTimer.current = setTimeout(async () => {
        setSyncStatus({ masterlist: 'saving', dirty: true });
        /* Rounded here and not in the keystroke above: rounding what somebody
           is halfway through typing rewrites the field under the cursor. By
           the time this fires they have stopped, and 1.005 becoming 1.01 is
           what "two decimals" means rather than a surprise. */
        const rounded = mlRound(next);
        setMasterlist(rounded);
        try { window.shicMasterlist = rounded; } catch (_e) {}
        try {
          const res = await dbSaveML(rounded);
          /* The debounced typing path writes straight to db.js, so it has to
             fold in anything a colleague added too -- see saveML. */
          if (res && res.sp && res.merged && res.adopted && Object.keys(res.adopted).length) {
            const kept = mlRound(res.merged);
            setMasterlist(kept);
            try { window.shicMasterlist = kept; } catch (_e) {}
            const n = Object.values(res.adopted).reduce((s, a) => s + a.length, 0);
            showToast(n + ' masterlist item' + (n === 1 ? '' : 's') + ' added by someone else ' +
              (n === 1 ? 'was' : 'were') + ' kept.');
          }
          if (res && res.sp === false) {
            setSyncStatus({ masterlist: 'error', dirty: true });
            showToast('Masterlist saved in this browser only — SharePoint refused it: ' + String(res.reason||'unknown').slice(0,100), true);
          } else {
            setSyncStatus({ masterlist: 'synced', lastSyncAt: new Date().toISOString(), sp: 'connected', dirty: false });
          }
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
    /* Named, so the site removes this one and keeps anything else it has
       that this browser has not seen yet. */
    /* Asked first, and kept in the Trash for 30 days: the red x sits right
       beside the fields people edit, and one stray click used to lose an
       item and its rate with no way back. */
    const delML = async id => {
      const it = (masterlist[mlTab] || []).find(r => r.id === id);
      if (!it) return;
      if (!confirm('Delete "' + mlTrashItemName(it) + '" from the ' + mlTab + ' list?\n\nIt goes to the Trash and can be restored for 30 days.')) return;
      await mlToTrash(mlTab, [it]);
      saveML({
        ...masterlist,
        [mlTab]: (masterlist[mlTab] || []).filter(r => r.id !== id)
      }, {deleted: {[mlTab]: [id]}});
      auditLog('masterlist_delete', mlTab + ': ' + mlTrashItemName(it), currentUser?.username);
      showToast('Moved to Trash — restore it from 🗑 Trash within 30 days.');
    };
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
        borderColor: alpha(INFO, '44')
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
        /* This tab, rewritten whole -- one of the two callers that really
           does mean "and nothing else in it". */
        saveML({
          ...masterlist,
          [mlTab]: DEFAULT_ML[mlTab].map(r => ({
            ...r,
            id: uid()
          }))
        }, {replaceTabs: [mlTab]});
        showToast('Reset to defaults.');
      }
    }, "Reset Defaults"), /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      onClick: () => downloadMLTemplate(mlTab)
    }, "Download Template"), /*#__PURE__*/React.createElement("button", {
      style: btn('danger', true),
      onClick: () => {
        if (confirm('Clear all ' + colL[mlTab][2].toLowerCase() + ' items in the ' + mlTab + ' list?\n\nThey go to the Trash and can be restored for 30 days.')) {
          mlToTrash(mlTab, masterlist[mlTab] || []);
          saveML({
            ...masterlist,
            [mlTab]: []
          }, {replaceTabs: [mlTab]});
          showToast('Cleared ' + mlTab + ' list.');
        }
      }
    }, "Clear List"), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      title: "Deleted items stay here for 30 days and can be restored",
      onClick: openMlTrash
    }, "🗑 Trash"), /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      title: "Price every item in this tab that has none, using the most recent CE it was actually charged on",
      onClick: fillFromHistory
    }, "Fill missing prices"), /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      title: "Which rates in this list have stopped keeping up with what the CEs actually charge",
      onClick: () => setMlTrend({ tab: mlTab, pick: null })
    }, "Rate Trends"), /*#__PURE__*/React.createElement("label", {
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
        /* The row's own category first when the list no longer offers it.
           Without this an item filed under a retired category shows an empty
           dropdown, which reads as "no category" when the item has one -- and
           the next edit to any other field would look like it cleared it. */
      }, [...(r.category && catOpts[mlTab].indexOf(r.category) < 0 ? [r.category] : []), ...catOpts[mlTab]]
        .map(c => /*#__PURE__*/React.createElement("option", {
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
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 92
        },
        min: 0,
        value: costVal,
        onCommit: v => updML(r.id, costKey, v)
      }),
      /* What this item was actually charged at, beside the rate the list
         claims. Maintaining a masterlist without that is guesswork: the list
         says one thing and thirty CEs say another, and nothing showed the
         disagreement. */
      /*#__PURE__*/React.createElement(RateHistory, {
        kind: ML_HIST_KIND[mlTab],
        name: r[nameKey],
        onPick: v => updML(r.id, costKey, v)
      })), mlTab === 'manpower' && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 80
        },
        min: 0,
        value: r.perDiem || 0,
        onCommit: v => updML(r.id, 'perDiem', v),
        placeholder: "0"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 68
        },
        value: uomCase(r.uom || 'Day'),
        onChange: e => updML(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Day'))),
      /* Which meal allowance rate the role is paid: blank = guessed from the
         name. Mobilization, demobilization and accommodation count by it. */
      mlTab === 'manpower' && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 150, ...(r.mealCat ? {} : { color: MT }) },
        value: r.mealCat || '',
        title: r.mealCat ? '' : 'Not set -- counted as ' + ({PM: 'PM', ADMIN: 'Admin', SKILLED: 'Skilled'})[mealCatGuess(r.role)] + ' from the role name',
        onChange: e => updML(r.id, 'mealCat', e.target.value)
      }, /*#__PURE__*/React.createElement("option", { value: '' }, "Auto (" + ({PM: 'PM', ADMIN: 'Admin', SKILLED: 'Skilled'})[mealCatGuess(r.role)] + ")"),
        /*#__PURE__*/React.createElement("option", { value: 'PM' }, "PM"),
        /*#__PURE__*/React.createElement("option", { value: 'ADMIN' }, "Admin"),
        /*#__PURE__*/React.createElement("option", { value: 'SKILLED' }, "Skilled manpower"))),
      /* The four figures a tier price is derived from. They had column headings
         and no cells, so a value entered in the calculator was stored and then
         appeared nowhere -- which reads as the calculator having failed.
         Editable here as well, because typing one number is quicker than
         opening a dialog to change it. */
      ...(mlTab === 'tools'
        ? ['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].map(k =>
            /*#__PURE__*/React.createElement("td", {
              key: k,
              style: TDS
            }, /*#__PURE__*/React.createElement(NumBox, {
              style: {
                ...INP,
                ...MONO,
                width: (k === 'serviceLife' || k === 'kw') ? 74 : 96,
                fontSize: 10
              },
              type: "number",
              min: 0,
              /* Empty, not 0: nothing entered means there is no basis to derive
                 a tier from, and a zero would read as a real figure. */
              value: r[k] === undefined || r[k] === null || r[k] === '' ? '' : r[k],
              placeholder: "—",
              title: {
                unitPrice: 'What the tool cost to buy',
                serviceLife: 'Over how many years it is written off',
                projectsPerYear: 'Projects it is used on in a year — Tier 1 only',
                maintPerYear: 'Yearly maintenance, often 20% of unit price',
                kw: 'Power rating in kilowatts — used to cost electricity on shopworks CEs'
              }[k],
              onCommit: v => updML(r.id, k, v),
              allowBlank: true
            })))
        : []),
      /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, mlTab === 'tools' && /*#__PURE__*/React.createElement("button", {
        onClick: () => setMlCalc({
          id: r.id,
          desc: r.desc || '',
          unitPrice: r.unitPrice || '',
          serviceLife: r.serviceLife || '',
          projectsPerYear: r.projectsPerYear || '',
          maintPerYear: r.maintPerYear || ''
        }),
        title: "Work the tier prices out from unit price, service life and maintenance",
        style: {
          background: 'none',
          border: 'none',
          color: INFO,
          cursor: 'pointer',
          fontSize: 13,
          padding: '1px 5px'
        }
      }, "\uD83D\uDCB2"), /*#__PURE__*/React.createElement("button", {
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
    'Draft': 'var(--accent-violet)',
    'No Quote': '#94A3B8',
    'Pending': '#6B7280',
    'Ongoing': 'var(--status-warning)',
    'Revised': '#38BDF8',
    'For site insp.': 'var(--accent-violet)',
    'For Approval': 'var(--accent-cyan)',
    'Waiting in...': 'var(--accent-violet)',
    'Approved': 'var(--status-success)',
    'Cancelled': 'var(--status-danger)',
    'On Hold': '#F97316',
    'Submitted': '#06B6D4',
    'Awarded': '#16a34a',
    'Superseded': '#94A3B8'
  };
  const getStatusColor = s => STATUS_COLOR_MAP[s] || ACC;
  const [newStatusInput, setNewStatusInput] = useState('');
  const [monSearch, setMonSearch] = useState('');
  const [monStatusFilter, setMonStatusFilter] = useState(new Set());
  const [monTypeFilter, setMonTypeFilter] = useState('all');
  const [monDiscFilter, setMonDiscFilter] = useState('all');
  const [monCustFilter, setMonCustFilter] = useState('all');
  const [compareSet, setCompareSet] = useState(new Set()); // CE comparison: max 2 ids
  const [compareModal, setCompareModal] = useState(null); // {a, b} loaded CE data // 'all' | 'onsite' | 'shopworks' | 'supply'
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [monSpIds, setMonSpIds] = useState(new Set());
  /* Newest CE first, by CE NUMBER rather than by savedAt.

     savedAt is when the row was written here, so a batch of historical CEs
     imported this week all claimed to be the newest thing on the site and sat
     on top of work actually raised this year. The number carries the year and
     the sequence, which is what "newest" means to anyone reading the list. */
  const [monSortCol, setMonSortCol] = useState('ceNum');
  const [monSortDir, setMonSortDir] = useState('desc');
  const [showStatusMgr, setShowStatusMgr] = useState(false);
  const [monPage, setMonPage] = useState(0);
  /* Which CEs have their superseded revisions showing. Editor state: a CE is
     collapsed again the next time the tab is opened. */
  const [monRevOpen, setMonRevOpen] = useState(() => new Set());
  const MON_PAGE_SIZE = 20;
  const [editingRow, setEditingRow] = React.useState(null);
  const [attachPanel, setAttachPanel] = React.useState(null); // ceId or null
  /* ── Requests ────────────────────────────────────────────────────────────
     A request for estimation is logged the moment it arrives, before anyone
     costs it: a CE number, the customer and job, the deadline, who it is
     assigned to, and the documents that came with it. It is saved as an empty
     CE flagged `request`, so it sits in Monitoring like any other CE, takes
     attachments like any other CE, and opens with Load. The estimator then
     builds the estimate and saves it over the request under the same number
     -- the one save over an existing number that is allowed without Revise,
     and only for the number the request was raised under. */
  const [reqForm, setReqForm] = React.useState(null);
  /* The documents are chosen while the request is being written, not after it.
     They cannot go up yet -- there is no row to hang them on until the request
     is saved -- so they are held here and sent the moment there is one. */
  const [reqFiles, setReqFiles] = React.useState([]);
  const [reqBusy, setReqBusy] = React.useState(false);
  const [reqUsers, setReqUsers] = React.useState([]);
  const [monMine, setMonMine] = React.useState(false);
  const [monApvMine, setMonApvMine] = React.useState(false);
  /* Reassigning from the row: {id, ceNum, from, to} while the picker is open. */
  const [assignPanel, setAssignPanel] = React.useState(null);
  const openAssign = e => {
    const m = monOf(e);
    const cur = m.ceeName || m.preparedBy || e.savedBy || '';
    setAssignPanel({ id: e.id, ceNum: e.info?.ceNum || e.ceNum || '', from: cur, to: cur });
    dbGetUsers().then(u => setReqUsers((u || []).filter(x => x.status !== 'pending' && x.status !== 'disabled' && x.status !== 'rejected'))).catch(() => {});
  };
  const saveAssign = () => {
    const a = assignPanel || {};
    const to = String(a.to || '').trim();
    if (!to) { showToast('Pick the estimator to assign it to.', true); return; }
    if (to !== String(a.from || '').trim()) {
      updateMon(a.id, 'ceeName', to);
      auditLog('reassign_ce', a.ceNum + ': ' + (a.from || '(none)') + ' -> ' + to, currentUser?.username);
      showToast(a.ceNum + ' assigned to ' + to + '.');
    }
    setAssignPanel(null);
  };
  const meNames = () => [currentUser?.name, currentUser?.username].map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
  const openRequest = () => {
    setReqFiles([]);
    const today = new Date().toISOString().slice(0, 10);
    setReqForm({ ceNum: nextCeNum(history, null, ceNums), ceType: 'onsite', client: '', description: '',
      projType: 'Mechanical', dateRecv: today, deadline: '', assignee: '', remarks: '', rceNo: '',
      /* The checklist starts blank on purpose. Seeding every item as Yes would
         make a complete-looking request out of one that nobody has read. */
      inquiryNo: '', inquiryDate: today, completionDate: '', workLocation: '', address: '',
      assignedSales: currentUser.name || currentUser.username || '', inquiryType: '', stage: 'New project',
      items: {}, recommendation: '', otherRemarks: '', declineReason: '' });
    dbGetUsers().then(u => setReqUsers((u || []).filter(x => x.status !== 'pending' && x.status !== 'disabled' && x.status !== 'rejected'))).catch(() => {});
  };
  const submitRequest = async () => {
    const f = reqForm || {};
    const ceNum = String(f.ceNum || '').trim().toUpperCase();
    if (!/^[A-Z0-9\-_\/\.]{2,30}$/.test(ceNum)) { showToast('CE Number must be 2–30 characters, letters/numbers/dashes only.', true); return; }
    if (!String(f.client || '').trim()) { showToast('Customer is required.', true); return; }
    if (!String(f.assignee || '').trim()) { showToast('Assign the request to an estimator.', true); return; }
    /* The checklist is the form. A request logged with items unanswered says
       nothing about whether it can be costed, which is the one question it
       exists to answer -- so the first unanswered item is named and the
       request waits. Answering No is not blocked: that is what 14.2 is for. */
    const _miss = rceUnanswered(f);
    if (_miss.length) {
      showToast('Item ' + _miss[0].n + ', ' + _miss[0].t + ', has no answer. ' +
        (_miss.length > 1 ? _miss.length + ' items are unanswered. ' : '') +
        'Mark each one Yes, No or N/A -- No is how you record what did not arrive.', true);
      return;
    }
    if (!f.recommendation) { showToast('Item 14: choose what you recommend -- proceed, secure the missing reference data first, or decline.', true); return; }
    if (f.recommendation === 'decline' && !String(f.declineReason || '').trim()) {
      showToast('A declined request needs its reason: it is the record of why SHIC did not quote.', true); return;
    }
    setReqBusy(true);
    try {
      const dup = (await dbFindCEByNum(ceNum).catch(() => null)) || (await dbFindCESeqClash(ceNum, ceNums).catch(() => null));
      if (dup) {
        showToast('CE Number "' + ceNum + '" is already taken. Next free: ' + nextCeNum(history, (ceNum.split('-CE-')[0] || null), [...ceNums, ceNum]), true);
        setReqBusy(false); return;
      }
      const entry = {
        ceType: f.ceType || 'onsite',
        info: { ...BLANK_INFO, ceNum, date: f.dateRecv || BLANK_INFO.date, client: f.client.trim(),
          description: String(f.description || '').trim(), projType: f.projType || BLANK_INFO.projType,
          status: 'DRAFT', request: true, requestNum: ceNum,
          /* info is stored whole as one JSON column, so the checklist rides
             along with it and needs no new SharePoint column of its own. */
          rce: { inquiryNo: String(f.inquiryNo || '').trim(), inquiryDate: f.inquiryDate || '',
            completionDate: f.completionDate || '', deadline: f.deadline || '',
            workLocation: String(f.workLocation || '').trim(), address: String(f.address || '').trim(),
            assignedSales: String(f.assignedSales || '').trim(), inquiryType: f.inquiryType || '',
            stage: f.stage || '', items: f.items || {}, recommendation: f.recommendation || '',
            otherRemarks: String(f.otherRemarks || '').trim(), declineReason: String(f.declineReason || '').trim(),
            preparedBy: currentUser.name || currentUser.username || '', preparedAt: new Date().toISOString(),
            form: 'SHIC-F-SMD-002 Rev 01' } },
        mp: [], tools: [], mats: [], ppe: [], misc: {}, addlCosts: [], verifyNotes: {}, rates: {}, margin: 0,
        scope: '', notes: [], sowItems: [], approvers: [], mobVehicles: [], demobVehicles: [],
        grand: 0, unitP: 0, savedBy: currentUser.username, savedAt: new Date().toISOString(), docRef: null
      };
      const saved = await dbSaveHistory(entry);
      if (!saved || saved.sp === false || saved.id == null) {
        /* A request only this browser can see has not been assigned to anyone. */
        showToast('Request NOT logged — SharePoint did not accept it' + (saved && saved.reason ? ': ' + String(saved.reason).slice(0, 80) : '') + '.', true);
        setReqBusy(false); return;
      }
      const fields = { status: 'Pending', ceeName: f.assignee.trim(), customer: f.client.trim(),
        jobTitle: String(f.description || '').trim(), designation: f.projType || '', dateRecv: f.dateRecv || '',
        deadline: f.deadline || '', receivedBy: currentUser.name || currentUser.username || '',
        /* The recommendation belongs where the estimator looks first. Left
           only inside the CE it would be found after the work started, not
           before -- and 14.2 and 14.3 are both reasons not to start. */
        remarks: [(RCE_RECOMMENDATIONS.find(r => r.v === f.recommendation) || {}).t,
          f.recommendation === 'decline' ? String(f.declineReason || '').trim() : '',
          String(f.remarks || '').trim()].filter(Boolean).join(' — '),
        rceNo: String(f.rceNo || '').trim() };
      const mres = await dbSaveMonEntry(saved.id, ceNum, fields, Object.keys(fields));
      setMonData(p => ({ ...p, [saved.id]: (mres && mres.fields) || fields }));
      setCeNums(p => p.indexOf(ceNum) < 0 ? [...p, ceNum] : p);
      auditLog('log_request', ceNum + ' -> ' + fields.ceeName, currentUser?.username);
      await loadHist();
      setReqForm(null);
      const _docs = reqFiles.slice();
      setReqFiles([]);
      showToast('Request ' + ceNum + ' logged and assigned to ' + fields.ceeName +
        (_docs.length ? '. Sending ' + _docs.length + ' document(s)...' : '. Attach the documents that came with it.'));
      openAttachPanel(saved.id);
      /* The request is logged either way. An upload that fails says so and
         names the file, rather than leaving the panel looking as though it
         went up. */
      if (_docs.length) await handleAttachUpload(saved.id, ceNum, _docs);
    } catch (e) { showToast('Could not log the request: ' + e.message, true); }
    setReqBusy(false);
  };
  /* The row whose status panel is open: pick a new status, and read the trail
     of who moved it and when. */
  const [statusPanel, setStatusPanel] = React.useState(null); // ceId or null
  /* What is being chosen in the Status panel, not yet saved. Picking a status
     or a date used to write it straight away, so every click on the way to the
     one you meant went into the history. */
  const [statusDraft, setStatusDraft] = React.useState(null); // {id, status, date}
  const [attachList, setAttachList] = React.useState([]);
  const [attachBusy, setAttachBusy] = React.useState(false);
  /* Why the list is empty. Without this the panel says "No attachments yet"
     whether the CE really has none or the read failed, and someone looking for
     a drawing that IS there is told it is not. */
  const [attachErr, setAttachErr] = React.useState('');
  const monTopScrollRef = React.useRef(null);
  const monTableWrapRef = React.useRef(null);

  const openAttachPanel = async (ceId) => {
    setAttachPanel(ceId); setAttachList([]); setAttachErr(''); setAttachBusy(true);
    try {
      const spId = _monSpIdCache[ceId];
      if (!spId) { setAttachBusy(false); return; }
      const files = await spGetAttachments(spList('Monitoring'), spId);
      setAttachList(files);
    } catch(e) {
      setAttachErr(e.message || String(e));
      showToast('Could not load attachments: ' + e.message, true);
    }
    setAttachBusy(false);
  };

  const handleAttachUpload = async (ceId, ceNum, files) => {
    if (!files.length) return;
    setAttachBusy(true);
    try {
      let spId = _monSpIdCache[ceId];
      if (!spId) {
        // Ensure monitoring record exists first
        /* Only to get an item to attach to -- it must not overwrite what the
           site holds for this CE. */
        await dbSaveMonEntry(ceId, ceNum, monData[ceId] || {}, 'ensure');
        spId = _monSpIdCache[ceId];
      }
      if (!spId) throw new Error('Could not create monitoring record');
      /* One file at a time, and one failure does not end the rest: the loop
         used to stop at the first refusal -- a file too large, a name the site
         will not take -- and say "Upload failed" without saying which, while
         the files already up went unmentioned. Say what went and what did not,
         by name. */
      const gone = [], kept = [];
      for (const file of Array.from(files)) {
        try {
          const buf = await file.arrayBuffer();
          await spAddAttachment(spList('Monitoring'), spId, file.name, buf);
          gone.push(file.name);
        } catch (err) { kept.push(file.name + ' (' + String((err && err.message) || 'failed').slice(0, 60) + ')'); }
      }
      const updated = await spGetAttachments(spList('Monitoring'), spId);
      setAttachList(updated);
      if (!kept.length) showToast(gone.length + ' file(s) uploaded.');
      else showToast((gone.length ? gone.length + ' file(s) uploaded. ' : '') +
        kept.length + ' did NOT: ' + kept.join('; ') + '. Try again, or add them from the 📎 button.', true);
    } catch(e) { showToast('Upload failed: ' + e.message, true); }
    setAttachBusy(false);
  };

  const handleAttachDelete = async (ceId, fileName) => {
    /* The button is hidden from everyone else, but the UI is not a permission
       boundary and this call reaches SharePoint. */
    if (!isAdmin) { showToast('Only an admin or the owner can delete an attachment.', true); return; }
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
  /* Monitoring tracks open CEs, and a draft is an open CE -- the only
     difference is that it can still be edited. So drafts are listed alongside
     saved CEs, carrying the status Draft, and they search, sort, filter and
     count like any other row.

     A draft whose number is already in history is dropped: that work has been
     saved, and the row would be a duplicate of the real CE. Saving now retires
     its draft, so this only catches drafts left behind by someone else's save
     or by an older build. */
  /* History usually lands before monitoring does, so an assigned request
     is not known to be this user's until the monitoring rows arrive. Reload
     once for each new set of such CEs. */
  const _assignedKey = React.useRef('');
  React.useEffect(() => {
    if (isAdmin) return;
    const have = new Set(history.map(h => String(h.id)));
    const missing = Object.keys(monData || {}).filter(id => !have.has(String(id)) && mineToSee(id)).sort().join(',');
    if (missing && missing !== _assignedKey.current) { _assignedKey.current = missing; loadHist(); }
  }, [monData, history, isAdmin]);
  /* A draft is work in progress. Once the CE has been saved the work is in
     history and the draft is finished with -- but it was only ever retired by
     the person who saved it, in the session that saved it, so drafts of CEs
     saved long ago piled up in Resume Work by the hundred. Any draft written
     BEFORE the CE was saved is cleared here, by whoever next opens the list.
     A draft written after the save is somebody's newer work and is left. */
  const _draftPrunedRef = React.useRef(new Set());
  useEffect(() => {
    if (!sharedDrafts.length || !history.length) return;
    const key = n => String(n || '').trim().toUpperCase();
    const savedAt = {}, savedBy = {};
    history.forEach(h => {
      const k = key((h.info && h.info.ceNum) || h.ceNum);
      const t = Date.parse(h.savedAt || '') || 0;
      if (k && t && t > (savedAt[k] || 0)) { savedAt[k] = t; savedBy[k] = h.savedBy || ''; }
    });
    const done = sharedDrafts.filter(d => {
      if (_draftPrunedRef.current.has(d.draftId)) return false;
      const k = key(d.info && d.info.ceNum), dt = Date.parse(d.savedAt || '') || 0;
      if (!k || !dt || !savedAt[k] || savedAt[k] <= dt) return false;
      /* Only the draft of the person who then saved that CE: their own work
         is demonstrably in the saved copy. Somebody ELSE's draft of the same
         CE may hold changes that never went in, and deleting it on a guess
         would lose them for good. Those are offered in Resume Work under
         "CE saved", where a person decides. */
      return d.savedBy === savedBy[k];
    });
    if (!done.length) return;
    done.forEach(d => _draftPrunedRef.current.add(d.draftId));
    (async () => {
      let gone = 0;
      for (const d of done) {
        try { await dbDeleteDraft(d.draftId); gone++; } catch (_e) { /* left for next time */ }
      }
      if (!gone) return;
      setSharedDrafts(p => p.filter(x => !done.some(d => d.draftId === x.draftId)));
      showToast('Resume Work: ' + gone + ' finished draft' + (gone === 1 ? '' : 's') + ' cleared — the CE' + (gone === 1 ? ' was' : 's were') + ' saved after the draft was written.');
    })();
  }, [sharedDrafts, history]);
  const monRows = useMemo(() => {
    const saved = new Set(history.map(h => String(h.info?.ceNum || h.ceNum || '').trim().toUpperCase()).filter(Boolean));
    const draftRows = (sharedDrafts || [])
      .filter(d => !saved.has(String(d.info?.ceNum || '').trim().toUpperCase()))
      .map(d => ({
        ...d,
        id: 'draft:' + d.draftId,
        _draft: d,
        ceType: d.ceType || 'onsite',
        grand: computeCEGrand(d)
      }));
    return [...history, ...draftRows];
  }, [history, sharedDrafts]);
  /* A draft has no monitoring record -- there is no CE to attach a deadline or
     a received-by to yet -- so it reports the one field it does know. */
  const monOf = e => monData[e.id] || (e && e._draft ? {status: 'Draft'} : {});
  /* What is waiting on this user right now, as rows -- not a separate count.
     The badge said "1" while My Work showed nothing, because the badge counted
     monitoring records and the tab listed CEs; a record whose CE is not the
     latest revision, or whose CE this browser has not loaded, belonged to one
     and not the other. Both read this. */
  const myTodo = useMemo(() => {
    const me = currentUser && currentUser.username;
    if (!me) return {sign: [], returned: [], total: 0};
    const heads = groupCERevisions(monRows, h => (h.info && h.info.ceNum) || h.ceNum || '')
      .map(g => g.head).filter(e => !e._draft);
    const rows = heads.map(e => ({e: e, m: monData[e.id] || {}}));
    const apv = x => x.m.apv || {};
    const sign = rows.filter(x => apvMonWaitsOn(x.m, me));
    const returned = rows.filter(x => apv(x).state === 'returned' && apv(x).submittedBy === me);
    /* Only the latest revision of a CE is waiting on anyone. An approval left
       pending on an older revision -- replaced by ↻ Revise, or a CE since
       deleted -- is stale: it showed as "CE #2817" with nothing to sign. */
    return {sign: sign, returned: returned, total: sign.length + returned.length};
  }, [monRows, monData, currentUser]);
  /* The row summary can fall behind the CE itself -- a signature saved while
     SharePoint was unreachable, or an older app version that wrote no
     signedBy. Each CE said to be waiting on this person is checked against
     its own approval once per session, and the summary put right if it is
     wrong, so nothing sits in For my approval after it has been signed. */
  const _apvSyncRef = React.useRef(new Set());
  useEffect(() => {
    const me = currentUser && currentUser.username;
    if (!me || !myTodo.sign.length) return;
    let stop = false;
    (async () => {
      for (const x of myTodo.sign) {
        const key = String(x.e.id);
        if (stop || typeof x.e.id !== 'number' || _apvSyncRef.current.has(key)) continue;
        _apvSyncRef.current.add(key);
        try {
          const full = await dbLoadCE(x.e.id);
          const real = full && apvMirror(full.approvers, (full.info || {}).approval);
          if (!real) continue;
          const old = x.m.apv || {};
          if (real.state !== old.state || (real.waiting || []).join('|') !== (old.waiting || []).join('|') ||
              (real.signedBy || []).join('|') !== (old.signedBy || []).join('|')) {
            updateMon(x.e.id, 'apv', {...old, ...real});
          }
        } catch (_e) { /* offline: the summary is left as it is */ }
      }
    })();
    return () => { stop = true; };
  }, [myTodo.sign, currentUser]);
  /* A revision replaced by a newer one is no longer waiting on anyone. Its
     approval is closed as superseded -- in Monitoring, where every user and
     every filter reads it -- rather than left pending for ever. Runs whenever
     the list changes, so a ↻ Revise closes the one it replaced as soon as the
     new revision is saved; each record is written once. */
  const _supersededRef = React.useRef(new Set());
  useEffect(() => {
    if (!currentUser || !monRows.length) return;
    groupCERevisions(monRows, h => (h.info && h.info.ceNum) || h.ceNum || '').forEach(g => {
      if (g.dup || !g.revs.length) return;
      const headNum = (g.head.info && g.head.info.ceNum) || g.head.ceNum || '';
      g.revs.forEach(e => {
        if (_supersededRef.current.has(String(e.id))) return;
        const m = monData[e.id] || {}, a = m.apv;
        const closeApv = a && ['pending', 'returned'].includes(a.state);
        /* The status follows: a replaced revision is finished with, so it
           leaves Open CEs, the deadline queue and every "waiting on me" list.
           A revision that was already Approved, Submitted or Awarded keeps
           that -- what happened to it is a matter of record, and it counts as
           closed either way. */
        const st = String(m.status || '').trim();
        const setStatus = st !== 'Superseded' && ceIsOpen(st);
        if (!closeApv && !setStatus) return;
        _supersededRef.current.add(String(e.id));
        updateMon(e.id, {
          ...(closeApv ? { apv: {...a, state: 'superseded', waiting: [], supersededBy: headNum, at: new Date().toISOString()} } : {}),
          ...(setStatus ? { status: 'Superseded' } : {})
        });
      });
    });
  }, [monRows, monData]);
  /* Say it when it first appears and again whenever it grows, not once a session. */
  const _apvToldRef = React.useRef(-1);
  useEffect(() => {
    const n = myTodo.total, was = _apvToldRef.current;
    if (n > was && was >= 0) setTimeout(() => showToast(
      (myTodo.sign.length ? '✍ ' + myTodo.sign.length + ' CE' + (myTodo.sign.length === 1 ? '' : 's') + ' waiting for your signature' : '') +
      (myTodo.sign.length && myTodo.returned.length ? ' · ' : '') +
      (myTodo.returned.length ? '↩ ' + myTodo.returned.length + ' returned to you' : '') + ' — see My Work.'), 1200);
    _apvToldRef.current = n;
  }, [myTodo.total]);
  /* And on the window title, so it shows while the app is in another window. */
  useEffect(() => {
    const base = 'SHIC Cost Estimator';
    try { document.title = myTodo.total ? '(' + myTodo.total + ') ' + base : base; } catch (_e) {}
  }, [myTodo.total]);
  /* Both fields have a monitoring value that falls back to the CE's own. Read
     the same way by the filter, the sort and the cell, or a row could be
     filtered out by a value the column does not show. */
  const monDisc = (e, m) => m.designation || m.discipline || e.info?.discipline || e.info?.projType || '';
  const monCust = (e, m) => m.customer || e.info?.client || '';
  /* The name a saved CE prints under. The job title is typed on Monitoring on
     some CEs and only on the CE itself on others, so both are looked at --
     the same fallback the Job Title column shows. */
  const ceFileNameFor = (id, ceNum) => {
    const e = (history || []).find(h => h && h.id === id) || {};
    const m = monData[id] || {};
    return ceFileName(ceNum || e.info?.ceNum || e.ceNum, m.jobTitle || e.info?.description || '');
  };
  /* Every prefix on file, plus any a CE already carries -- an old CE from a
     company since removed must still be filterable by its own label.

     At App scope, not inside the sortedHistory memo: a hook called from
     within another hook's callback runs conditionally, which React cannot
     survive. */
  const coOptions = useMemo(() => {
    const set = {};
    (companies || []).forEach(c => { const p = String(c.cePrefix || '').toUpperCase().trim(); if (p) set[p] = 1; });
    monRows.forEach(e => { const p = ceNumPrefix((e.info && e.info.ceNum) || e.ceNum); if (p) set[p] = 1; });
    const out = Object.keys(set).sort();
    return out.length ? out : ['SHIC'];
  }, [companies, monRows]);
  /* Built from what the CEs actually hold, not a fixed list: disciplines are
     free text on import, and there is no list of customers anywhere. Counted,
     so a filter that would show three rows says so before it is chosen, and
     ordered by count -- the customer you have done ninety CEs for should not
     be somewhere in the middle of an alphabetical list of two hundred. */
  /* Named as a hook because it is one: it calls useMemo, so both invocations
     below must stay unconditional and in a fixed order. */
  const useMonFacet = (read) => useMemo(() => {
    const seen = {};
    monRows.forEach(e => {
      const raw = String(read(e, monOf(e)) || '').trim();
      const key = raw.toUpperCase();
      if (!seen[key]) seen[key] = {key, label: raw, n: 0};
      seen[key].n++;
    });
    return Object.values(seen).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [monRows, monData]);
  const discOptions = useMonFacet(monDisc);
  const custOptions = useMonFacet(monCust);

  const sortedHistory = useMemo(() => {
    const filtered = monRows.filter(e => {
      const m = monOf(e);
      if (monStatusFilter.size > 0) {
        const s = m.status || '';
        if (!monStatusFilter.has(s)) return false;
      }
      if (monTypeFilter !== 'all' && (e.ceType || 'onsite') !== monTypeFilter) return false;
      /* Compared case-insensitively: the same discipline is stored as
         "Mechanical" by the editor and "MECHANICAL" by the xlsx import, and a
         filter that treats those as different offers both and finds half the
         CEs under each. The blank option is its own choice -- a CE with no
         discipline is a real thing to go looking for. */
      if (monDiscFilter !== 'all' && monDisc(e, m).trim().toUpperCase() !== monDiscFilter) return false;
      if (monCustFilter !== 'all' && monCust(e, m).trim().toUpperCase() !== monCustFilter) return false;
      if (monApvMine && !apvMonWaitsOn(m, currentUser.username)) return false;
      if (monMine && !meNames().includes(String(m.ceeName || m.preparedBy || e.savedBy || '').trim().toUpperCase())) return false;
      if (!monSearch) return true;
      const q = monSearch.toLowerCase();
      return (e.info?.ceNum || '').toLowerCase().includes(q) || (e.info?.client || '').toLowerCase().includes(q) || (e.info?.description || '').toLowerCase().includes(q) || (m.customer || '').toLowerCase().includes(q) || (m.receivedBy || '').toLowerCase().includes(q) || (m.rceNo || '').toLowerCase().includes(q) || (m.remarks || '').toLowerCase().includes(q);
    });
    /* What each column actually SHOWS, so sorting agrees with the eye.

       Only ceNum, grand, deadline and status were handled; the other ten
       clickable headers fell through to a savedAt sort, so clicking Customer,
       Job Title, Estimator, Discipline, Days Left, Date Submitted, Received By
       or Remarks reordered the table by something invisible -- which reads as
       sorting being broken, because it is.

       These expressions mirror the cells below; a column sorted by a different
       value than it displays is the same bug wearing a hat. */
    const sortVal = (e, m) => {
      switch (monSortCol) {
        case 'ceeName':      return m.ceeName || m.preparedBy || e.savedBy || '';
        /* What the cell shows, which is the CE number's own prefix. Sorting by
           the stored field put a SY3 CE among the SHIC ones. */
        case 'companyDesig': return ceNumPrefix((e.info && e.info.ceNum) || e.ceNum) || m.companyDesig || 'SHIC';
        case 'ceNum':        return e.info?.ceNum || e.ceNum || '';
        case 'designation':  return monDisc(e, m);
        case 'customer':     return monCust(e, m);
        case 'jobTitle':     return m.jobTitle || e.info?.description || '';
        case 'grand':        return N(e.grand);
        case 'deadline':     return m.deadline || '';
        /* It used to sort by the deadline, which read the same only while
           every row was still counting down. Once the clock stops on
           submission a CE three days early and one still three days from its
           deadline show the same number and sort nowhere near each other, so
           this sorts by what the column actually says.

           A row with no deadline returns '' rather than a number, so the
           blanks-last rule below catches it whichever way the column points. */
        case 'deadlineDays': {
          const _d = ceDeadline(m.deadline, m.dateSubmitted, m.status).days;
          return _d === null ? '' : _d;
        }
        case 'dateSubmitted':return m.dateSubmitted || '';
        case 'status':       return m.status || '';
        case 'receivedBy':   return m.receivedBy || '';
        case 'rceNo':        return m.rceNo || '';
        case 'remarks':      return m.remarks || '';
        default:             return e.savedAt || '';   /* Date Recv. */
      }
    };
    /* Collapsed AFTER filtering, so a filter that matches only the newest
       revision still shows that CE -- and the count beside the title counts
       CEs, not rows. The superseded revisions ride along on the row that
       supersedes them, one click away rather than gone. */
    const heads = groupCERevisions(filtered, e => (e.info && e.info.ceNum) || e.ceNum || '')
      .map(g => (g.revs.length || g.dup) ? {...g.head, _revs: g.revs, _dup: g.dup, _rev: g.rev} : g.head);
    return heads.sort((a, b) => {
      const va = sortVal(a, monOf(a)), vb = sortVal(b, monOf(b));
      const dir = monSortDir === 'asc' ? 1 : -1;
      /* Blanks last, whichever way the column is pointing. A column of dashes
         at the top is never the answer anyone wanted from a sort. */
      const ea = va === '' || va === null || va === undefined, eb = vb === '' || vb === null || vb === undefined;
      if (ea !== eb) return ea ? 1 : -1;
      if (ea && eb) return 0;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      /* CE numbers compare on year, then sequence, then revision -- never as
         plain text, which would sort 2025 after 2026 whenever the prefix
         differed, and -10 before -9. */
      if (monSortCol === 'ceNum') {
        const ka = ceNumKey(va), kb = ceNumKey(vb);
        if (ka && kb) {
          for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
            /* Fewer parts first: a revision is OF the base, so the base leads. */
            if (ka[i] === undefined) return -dir;
            if (kb[i] === undefined) return dir;
            if (ka[i] !== kb[i]) return (ka[i] - kb[i]) * dir;
          }
          return 0;
        }
        /* One of them is not a CE number at all -- keep those together at the
           end rather than interleaving them by accident. */
        if (!!ka !== !!kb) return ka ? -1 : 1;
      }
      /* Numeric-aware and case-insensitive: SY3-CE-2026-9 must come before
         SY3-CE-2026-10, and "aestillore" must sit with "Aestillore". */
      return String(va).localeCompare(String(vb), 'en', {numeric: true, sensitivity: 'base'}) * dir;
    });
  }, [monRows, monData, monSearch, monStatusFilter, monTypeFilter, monDiscFilter, monCustFilter, monMine, monApvMine, monSortCol, monSortDir]);
  /* The rows actually drawn: one page of CEs, with the superseded revisions of
     any CE that has been expanded slotted in underneath it. Expanded after the
     page is cut, so a page is always the same 25 CEs whether or not anyone has
     opened a revision history. */
  const monPageRows = useMemo(() => {
    const page = sortedHistory.slice(monPage * MON_PAGE_SIZE, (monPage + 1) * MON_PAGE_SIZE);
    const out = [];
    page.forEach(e => {
      out.push(e);
      if (monRevOpen.has(e.id)) (e._revs || []).forEach(r => out.push({...r, _isRev: true}));
    });
    return out;
  }, [sortedHistory, monPage, monRevOpen]);
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
        /* The stored total must be what these rows actually cost, computed by
           the same function the editor uses.

           It used to be worked out here by hand as wage only -- pax x days x
           rate x shift -- with no benefits, no OT and no miscellaneous. So an
           imported CE was filed under a total LOWER than its own line items,
           Monitoring showed that figure, and opening the CE recomputed the
           real one. The number appeared to change on load; nothing had
           changed, the two were never the same number. */
        const entry = {
          ceType:importedCeType,
          info:{ceNum:ceNum||fallbackCeNum, date:dateStr, client, location, attention:attention||'SALES DEPARTMENT', endUser:endUser||'C/O SALES', projType, description, dept:'', status:'Submitted', material, qty, days, companyId:null},
          mp:mpRows, tools, mats, ppe, misc,
          notes:[], sowItems:[], approvers:[], mobVehicles:[], demobVehicles:[],
          grand:0, unitP:0, savedBy:currentUser?.username||'import',
          savedAt:new Date(dateStr).toISOString(), _imported:true
        };
        entry.grand = computeCEGrand(entry);
        console.log('[CE Import] Parsed:', {ceNum, description, client, ceType:importedCeType, mp:mpRows.length, tools:tools.length, mats:mats.length, ppe:ppe.length, grand:entry.grand});
        const effCeNum = ceNum || fallbackCeNum;
        const dupIdx = history.findIndex(h => (h.info?.ceNum || h.ceNum) === effCeNum);
        if (dupIdx >= 0) {
          const confirmed = window.confirm(`CE ${effCeNum} already exists in history. Overwrite it?`);
          if (!confirmed) { errors.push(file.name + ': skipped (duplicate)'); setCeImportProgress({done, total:list.length, errors}); continue; }
        }
        const res = await dbSaveHistory(entry);
        /* A CE that only reached this browser is not imported. Saying it was
           is how a run of these ended up in SharePoint as headers with a total
           and no line items under them, reported as a clean success. */
        if (res && res.sp === false) {
          errors.push(effCeNum + ': SharePoint refused it — ' + String(res.reason || 'unknown').slice(0, 120));
          setCeImportProgress({done, total: list.length, errors});
          continue;
        }
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
      const _hn = h => h.toLowerCase().replace(/[\s.]+/g,'');
      const iCeNum=headers.findIndex(h => _hn(h)==='ceno') >= 0 ? headers.findIndex(h => _hn(h)==='ceno') : col('CENo'),
            iRce=headers.findIndex(h => ['rceno','rce','rcenumber'].includes(_hn(h))), iCeName=col('CEName'), iComp=col('CompanyDesignation'),
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
        'revised':'Revised',
        'pending':'Pending',
        'for site insp':'For site insp.',
        'for approval':'For Approval',
        'waiting':'Waiting in...', 'waiting in':'Waiting in...',
        'on hold':'On Hold', 'onhold':'On Hold',
        'awarded':'Awarded', 'won':'Awarded',
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
          ...(iRce >= 0 && String(r[iRce]||'').trim() ? {rceNo: String(r[iRce]).trim()} : {}),
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
      const importFails = [];
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        const results = await Promise.all(chunk.map(e =>
          spWithRetry(() => dbSaveHistory(e)).catch(err => ({sp: false, reason: err.message}))));
        /* .catch(()=>{}) meant a batch where every CE failed counted as a
           batch where every CE succeeded. */
        results.forEach((r, j) => { if (r && r.sp === false) importFails.push((chunk[j].info?.ceNum || '?') + ': ' + String(r.reason || 'unknown').slice(0, 80)); });
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
      const ok = imported - importFails.length;
      auditLog('xlsx_import', `${ok} CEs added, ${updated} updated${importFails.length ? ', ' + importFails.length + ' FAILED' : ''}`, currentUser?.username);
      if (importFails.length) {
        console.warn('CEs SharePoint would not take:', importFails);
        showToast(`Import finished with problems: ${ok} of ${imported} CEs reached SharePoint, ${updated} monitoring records updated. ${importFails.length} failed — ${importFails[0]}`, true);
      } else {
        showToast(`Import complete: ${ok} CEs added, ${updated} monitoring records updated.`);
      }
    } catch(e) {
      setImportProgress(null);
      showToast('Import failed: ' + e.message, true);
      console.error('importMonitoringXLSX', e);
    }
  };

  /* Invoked as HistPanel(), never as an element -- it is declared inside App,
     so as a component it takes a new identity on every App render and React
     remounts the whole panel each time. It holds no hooks, so nothing looked
     wrong; but it holds nine uncontrolled inputs and the search box, and a
     remount destroys the caret and any half-typed cell along with them.
     Calling it makes its output part of App's own tree.
     (Written without the element-creating call by name: the guard in
     tools/check-remounting-editors.js reads the source as text, and would
     take a mention of it here for the real thing.) */
  const HistPanel = () => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(INFO, '44'),
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
  }, sortedHistory.length, " estimates",
     /* Revisions are folded in, so the count is of CEs. Saying how many rows
        were folded away stops the number reading as if work had gone missing. */
     (() => { const r = sortedHistory.reduce((s, e) => s + (e._revs || []).length, 0);
              return r ? ' · ' + r + ' revision' + (r === 1 ? '' : 's') + ' folded in' : ''; })(),
     isAdmin ? ' (all users)' : ''), /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      width: 200,
      fontSize: 11,
      marginLeft: 8
    },
    placeholder: "Search CE#, client, customer...",
    /* No autoFocus. It fires whenever this input mounts, and the panel around
       it was remounting on every App render -- so every edit to a cell threw
       the caret back up here. It is wrong on its own terms too: a search box
       that grabs the caret on arrival takes it from wherever the person meant
       to be. */
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
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize:11, width:150},
    value: monDiscFilter,
    onChange: e => { setMonDiscFilter(e.target.value); setMonPage(0); },
    title: "Filter by discipline"
  },
    /*#__PURE__*/React.createElement("option", {value:'all'}, "All Disciplines"),
    discOptions.map(o => /*#__PURE__*/React.createElement("option", {key: o.key, value: o.key},
      (o.label || '(none)') + '  \u00b7 ' + o.n))
  ),
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize:11, width:190},
    value: monCustFilter,
    onChange: e => { setMonCustFilter(e.target.value); setMonPage(0); },
    title: "Filter by customer"
  },
    /*#__PURE__*/React.createElement("option", {value:'all'}, "All Customers"),
    custOptions.map(o => /*#__PURE__*/React.createElement("option", {key: o.key, value: o.key},
      (o.label || '(none)') + '  \u00b7 ' + o.n))
  ),
  /*#__PURE__*/React.createElement("button", {
    style: btn(monMine ? 'acc' : 'def', true),
    title: "Only the CEs and requests whose Estimator is you",
    onClick: () => { setMonMine(v => !v); setMonPage(0); }
  }, "\uD83D\uDC64 Assigned to me"),
  /*#__PURE__*/React.createElement("button", {
    style: btn(monApvMine ? 'acc' : 'def', true),
    title: "Only the CEs waiting on your signature",
    onClick: () => { setMonApvMine(v => !v); setMonPage(0); }
  }, "✍ Awaiting my signature (" + Object.values(monData || {}).filter(m => apvMonWaitsOn(m, currentUser.username)).length + ")"),
  (monSearch || monStatusFilter.size > 0 || monTypeFilter !== 'all' || monDiscFilter !== 'all' || monCustFilter !== 'all') && /*#__PURE__*/React.createElement("button", {
    style: {...btn('danger', true), fontSize:10},
    title: "Clear all filters",
    onClick: () => { setMonSearch(''); setMonStatusFilter(new Set()); setMonTypeFilter('all'); setMonDiscFilter('all'); setMonCustFilter('all'); setMonPage(0); }
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
    style: btn('ok', true),
    title: "Log a request for estimation: CE number, customer, deadline, who it is assigned to, and its documents",
    onClick: openRequest
  }, "+ New Request"), /*#__PURE__*/React.createElement("button", {
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
        ['CE No.','CE Name','Company Designation','Discipline','Customer','Job Title','Date Recieved','Deadline','Date Submitted','Status','Recieved By','Remarks','RCE No.'],
        ['CE-2826-0001','Juan Dela Cruz','SHIC','Mechanical','Sample Client Inc.','PUMP OVERHAUL AND REPAIR','2026-01-15','2026-01-22','2026-01-21','Submitted','Kenneth Mendoza','','RCE-2026-0001'],
      ]);
      ws['!cols'] = [120,120,120,100,140,200,110,110,110,90,120,140,110].map(w=>({wch:Math.round(w/7)}));
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
  }, /*#__PURE__*/React.createElement("div", {style: {color: MT, fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em'}}, "Status Options"), /*#__PURE__*/React.createElement("div", {
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
  }, /*#__PURE__*/React.createElement("th", {style:{...THS,width:28,padding:'6px 4px',fontSize:10,textAlign:'center'}, title:"Select to compare (max 2)"}, "⚖"), [['ceeName', 'Estimator', 80], ['companyDesig', 'Co.', 60], ['ceNum', 'CE No.', 120], ['rceNo', 'RCE No.', 100], ['designation', 'Discipline', 90], ['customer', 'Customer', 100], ['jobTitle', 'Job Title', 180], ['grand', 'Total (₱)', 110], ['dateRecv', 'Date Recv.', 95], ['deadline', 'Deadline', 95], ['deadlineDays', 'Days Left', 65], ['dateSubmitted', 'Date Submitted', 105], ['status', 'Status', 120], ['receivedBy', 'Received By', 100], ['remarks', 'Remarks', 140]].map(([col, label, w]) => /*#__PURE__*/React.createElement("th", {
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
  }, label, ['ceNum', 'deadline', 'status', 'grand'].includes(col) && SortIcon({
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
  }, "Actions"))),/*#__PURE__*/React.createElement("tbody", null, monPageRows.map((e, rowIdx) => {
    /* The 16 columns total ~1570px, so on any normal screen Actions sits past
       the right edge and the row has to be scrolled sideways to reach it —
       which is why people reported the buttons as missing rather than
       off-screen. Pinning the column keeps Edit/Attach/Del reachable at any
       scroll position. Needs an opaque background: the row's own is
       semi-transparent on alternate rows, and cells would scroll visibly
       underneath it. */
    const stickyBg = rowIdx % 2 === 0 ? CARD : SURF;
    const m = monOf(e);
    const ceNum = e.info?.ceNum || e.ceNum || '';
    const jobTitle = e.info?.description || '';
    const dateRecv = e.savedAt ? new Date(e.savedAt).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) : '';
    /* Whose CE this is. The number already says -- SHIC-CE-2026-0004 is
       SHIC's -- so a stored companyDesig that disagrees with it is stale, and
       an absent one needs no default guess. It fell back to a flat 'SHIC',
       which labelled every SY3 CE as SHIC's. */
    const coDesig = ceNumPrefix(ceNum) || m.companyDesig || 'SHIC';

    /* Deadline countdown, which stops when the CE is submitted. */
    const dl = ceDeadline(m.deadline, m.dateSubmitted, m.status);
    const deadlineDays = dl.days;
    /* A finished CE is history, not a warning. Late still reads red -- it is
       the fact of the matter -- but an on-time one is green however close to
       the wire it went, rather than amber for the rest of its life. */
    const daysColor = deadlineDays === null ? MT
      : dl.done ? (dl.late ? ERR : OK)
      : deadlineDays < 0 ? ERR : deadlineDays <= 7 ? 'var(--status-warning)' : OK;
    const statusColor = getStatusColor(m.status || '');
    const trBg = rowIdx % 2 === 0 ? 'transparent' : alpha(SURF, '88');
    /* A superseded revision is shown dimmed and indented under the revision
       that replaced it: still readable, still openable, but plainly not the
       row that counts. */
    return /*#__PURE__*/React.createElement("tr", {
      key: e.id,
      style: {
        background: e._isRev ? alpha(INFO, '0F') : trBg,
        opacity: e._isRev ? .62 : 1,
        borderBottom: `1px solid ${alpha(BDR, '22')}`,
        ...(e._isRev ? {borderLeft: '3px solid ' + alpha(INFO, '55')} : {})
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
      defaultValue: coDesig,
      onChange: ev => { updateMon(e.id, 'companyDesig', ev.target.value); }
      /* Built from the companies actually on file, not a hardcoded list.
         That list had grown to hold MFS, JAVV and EMN -- estimator initials,
         not companies -- so the column that answers "whose CE is this" was
         offering the name of the person who wrote it.

         The row's own value comes first when the list no longer offers it, so
         a CE filed under a company since removed keeps its label instead of
         showing an empty dropdown. */
    }, [...(coDesig && coOptions.indexOf(coDesig) < 0 ? [coDesig] : []), ...coOptions].map(o => /*#__PURE__*/React.createElement("option", {
      key: o
    }, o))) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11}}, coDesig)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TDS,
        padding: '4px 6px',
        ...MONO,
        fontSize: 10,
        whiteSpace: 'nowrap'
      }
    }, e._isRev ? '↳ ' + ceNum : ceNum,
    e._isRev && /*#__PURE__*/React.createElement("span", {
      title: 'Superseded by a later revision — kept for reference, and not counted as a separate CE',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8,
              background: alpha(INFO, '22'), color: INFO, border: '1px solid ' + alpha(INFO, '44')}
    }, 'SUPERSEDED'),
    e._draft && /*#__PURE__*/React.createElement("span", {
      /* A saved CE whose status is Draft and an unsaved draft both read
         "Draft" in the status column. This badge says which is which. */
      title: 'Unsaved draft by ' + (e.savedByName || e.savedBy || 'someone') + ' — Load to pick it up',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8, background: '#8B5CF622', color: 'var(--accent-violet)', border: '1px solid #8B5CF644'}
    }, 'UNSAVED'),
    e.info?.request && !e._draft && /*#__PURE__*/React.createElement("span", {
      title: 'Logged request, not costed yet — Load it to build the estimate, then Save under the same number',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8, background: alpha(OK, '22'), color: OK, border: '1px solid ' + alpha(OK, '44')}
    }, 'REQUEST'),
    /* Superseded revisions are folded into the row that supersedes them. The
       chip says how many, so a CE with history is visible as such without
       having to take three rows to say it. */
    (e._revs || []).length > 0 && /*#__PURE__*/React.createElement("button", {
      title: monRevOpen.has(e.id)
        ? 'Hide the superseded revisions'
        : 'Show the ' + e._revs.length + ' superseded revision' + (e._revs.length === 1 ? '' : 's') + ' of this CE',
      onClick: () => setMonRevOpen(p => { const n = new Set(p); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; }),
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8,
              background: alpha(INFO, '22'), color: INFO, border: '1px solid ' + alpha(INFO, '44'), cursor: 'pointer'}
    }, (monRevOpen.has(e.id) ? '▾ ' : '▸ ') + '+' + e._revs.length + ' rev'),
    /* Two rows claiming the same revision of the same number are not a CE and
       its revision -- they are two different jobs filed under one number. They
       are deliberately NOT merged, because merging would hide one of them and
       its value with it. */
    e._dup && /*#__PURE__*/React.createElement("span", {
      title: 'Another CE on file carries this same number and revision. They have been left as separate rows — one of them needs renumbering.',
      style: {marginLeft: 5, fontSize: 8, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 8,
              background: alpha(ERR, '22'), color: ERR, border: '1px solid ' + alpha(ERR, '44')}
    }, '⚠ DUPLICATE No.')), /*#__PURE__*/React.createElement("td", {
      className: 'mon-rce',
      style: { ...TDS, padding: '4px 6px' }
    }, editingRow === e.id ? /*#__PURE__*/React.createElement("input", {
      style: { ...INP, border: 'none', background: 'transparent', padding: '2px 4px', fontSize: 11, width: '100%', ...MONO },
      key: e.id + 'rceNo',
      defaultValue: m.rceNo || '',
      onBlur: ev => { const v = ev.target.value.trim(); if (v !== String(m.rceNo || '')) updateMon(e.id, 'rceNo', v); },
      placeholder: "RCE No. from Sales"
    }) : /*#__PURE__*/React.createElement("span", {style:{fontSize:11,...MONO}}, m.rceNo || '—')), /*#__PURE__*/React.createElement("td", {
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
      , title: dl.done ? 'Submitted ' + m.dateSubmitted + ' against a ' + m.deadline + ' deadline' : ''
    }, dl.label), /*#__PURE__*/React.createElement("td", {
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
    }, /*#__PURE__*/React.createElement("div", null,
      /*#__PURE__*/React.createElement("span", {style:{display:'inline-block',background:alpha(statusColor, '22'),color:statusColor,fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:12,whiteSpace:'nowrap'}}, m.status||'—'),
      m.statusChangedAt && /*#__PURE__*/React.createElement("div", {style:{fontSize:9,color:MT,marginTop:2,lineHeight:1.3},title:'Changed by '+(m.statusChangedBy||'unknown')}, new Date(m.statusChangedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}), m.statusChangedBy?' · '+m.statusChangedBy.split(' ')[0]:''),
      m.apv && m.apv.state === 'superseded' && /*#__PURE__*/React.createElement("div", {style:{fontSize:9,marginTop:2,fontWeight:700,color:MT}, title:'This revision was replaced; its approval was closed.'}, '⊘ Superseded' + (m.apv.supersededBy ? ' by ' + m.apv.supersededBy : '')),
      m.apv && ['pending','approved','returned'].includes(m.apv.state) && (() => {
        const turn = apvMonWaitsOn(m, currentUser.username);
        return /*#__PURE__*/React.createElement("div", {style:{fontSize:9,marginTop:2,fontWeight:700,color:m.apv.state==='approved'?'#16a34a':m.apv.state==='returned'?ERR:'var(--accent-cyan)',cursor:turn?'pointer':'default'},
          title: turn ? 'Open it to approve and sign' : '', onClick: turn ? () => setViewCE({id:e.id,ceNum:e.info?.ceNum||e.ceNum||''}) : undefined},
          m.apv.state === 'approved' ? '✅ Approved' : m.apv.state === 'returned' ? '↩ Returned' : '✍ ' + m.apv.signed + '/' + m.apv.total + ' signed' + (turn ? ' · YOUR TURN' : ''));
      })()
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
        /* Three across rather than one tall column: thirteen stacked buttons
           made every row as tall as the list of actions. */
        display: 'grid',
        gridTemplateColumns: 'repeat(3, auto)',
        /* Each button has a fixed cell, one row per purpose -- track, open,
           output, copy, and Delete alone -- so a button a row does not offer
           leaves a gap instead of shuffling the rest out of their group. */
        gap: 3,
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      /* Status changes constantly and everything else in the row does not, so
         it gets its own action rather than sharing Edit with the reference
         fields. It opens a panel: pick the new status, and read the trail. */
      disabled: !!e._draft,
      style: {gridRow: 1, gridColumn: 1, ...btn(statusPanel === e.id ? 'acc' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'A draft is always Draft — save the CE to start tracking it' : 'Update status and view its history',
      onClick: () => { if (!e._draft) setStatusPanel(statusPanel === e.id ? null : e.id); }
    }, '⚑ Status'), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft,
      style: {gridRow: 1, gridColumn: 2, ...btn('def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE to start its remarks' : 'Add a remark and read every earlier one',
      onClick: () => { if (!e._draft) { setRemarkDraft(''); setRemarksPanel({ id: e.id, ceNum: e.info?.ceNum || e.ceNum || '' }); } }
    }, '💬 Remarks' + (((monData[e.id] || {}).remarksLog || []).length > 1 ? ' (' + monData[e.id].remarksLog.length + ')' : '')), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft,
      style: {gridRow: 1, gridColumn: 3, ...btn(assignPanel && assignPanel.id === e.id ? 'acc' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE first — a draft has no monitoring record to assign' : 'Reassign this CE to another estimator',
      onClick: () => { if (!e._draft) openAssign(e); }
    }, '👤 Assign'), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft,
      style: {gridRow: 2, gridColumn: 3, ...btn(editingRow === e.id ? 'ok' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE first — a draft has no monitoring record to hold a deadline' : 'Edit monitoring fields',
      onClick: () => { if (!e._draft) setEditingRow(editingRow === e.id ? null : e.id); }
    }, editingRow === e.id ? '✓ Done' : '✎ Edit'), /*#__PURE__*/React.createElement("button", {
      disabled: !!e._draft,
      style: {gridRow: 3, gridColumn: 3, ...btn(attachPanel === e.id ? 'acc' : 'def', true), fontSize: 10, padding: '2px 8px', opacity: e._draft ? .4 : 1, cursor: e._draft ? 'not-allowed' : 'pointer'},
      title: e._draft ? 'Save the CE first — attachments need a saved record' : "Attachments (Drawings, TOR, etc.)",
      onClick: () => { if (e._draft) return; if (attachPanel === e.id) { setAttachPanel(null); } else { openAttachPanel(e.id); } }
    }, '📎', monSpIds.has(String(e.id)) && attachList.length > 0 && attachPanel === e.id ? ` ${attachList.length}` : ''), (e.data || e.info) && /*#__PURE__*/React.createElement("button", {
      style: {
        gridRow: 2, gridColumn: 2, ...btn('acc', true),
        fontSize: 10,
        padding: '2px 8px'
      },
      onClick: () => e._draft ? resumeDraft(e._draft) : handleLoad(e.data || e)
    }, "Load"), (isAdmin || (e._draft && e.savedBy === currentUser.username)) && /*#__PURE__*/React.createElement("button", {
      style: {
        gridRow: 5, gridColumn: 3, ...btn('danger', true),
        fontSize: 10,
        padding: '2px 8px'
      },
      onClick: async () => {
        if (confirmDel !== e.id) {
          setConfirmDel(e.id);
          return;
        }
        setConfirmDel(null);
        /* A draft row has no history entry behind it; deleting one has to go
           to the drafts list or the row comes back on the next refresh. */
        if (e._draft) { await deleteDraft(e._draft.draftId, e._draft, true); return; }
        const ceNum = e.info?.ceNum || e.ceNum || String(e.id);
        const snapshot = [...history];
        setHistory(prev => prev.filter(h => h.id !== e.id));
        let undone = false;
        const tid = setTimeout(async () => {
          if (!undone) {
            await dbDeleteHistory(e.id, currentUser.role);
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
    }, confirmDel === e.id ? 'Sure?' : 'Del'), e._draft&&typeof e.id!=='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:2,gridColumn:1,...btn('info',true),fontSize:10,padding:'2px 8px'},onClick:()=>{
      const k='shic:viewDraft:'+Date.now();
      try { localStorage.setItem(k, JSON.stringify(e._draft)); } catch (ex) { showToast('This draft is too large to view here — use Load.', true); return; }
      setViewCE({draftKey:k,ceNum:(e._draft.info&&e._draft.info.ceNum)||e.info?.ceNum||'',draft:true});
    },title:"View this draft here without loading it — your open work is left as it is"},"👁 View"), typeof e.id==='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:2,gridColumn:1,...btn('info',true),fontSize:10,padding:'2px 8px'},onClick:()=>setViewCE({id:e.id,ceNum:e.info?.ceNum||e.ceNum||''}),title:"View the CE here without loading it — your open work is left as it is"},"👁 View"), typeof e.id==='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:3,gridColumn:1,...btn('def',true),fontSize:10,padding:'2px 8px'},onClick:()=>openForPrint(e.id,'ce'),title:"Generate the printable CE in its own tab — this one is left as it is"},"\uD83D\uDDA8 CE"), typeof e.id==='number'&&/*#__PURE__*/React.createElement("button",{style:{gridRow:3,gridColumn:2,...btn('def',true),fontSize:10,padding:'2px 8px'},onClick:()=>openForPrint(e.id,'detailed'),title:"Export Detailed in its own tab — this one is left as it is"},"\u2B07 xlsx"), (e.data||e.info)&&/*#__PURE__*/React.createElement("button",{style:{gridRow:4,gridColumn:1,...btn('ok',true),fontSize:10,padding:'2px 8px'},onClick:()=>handleClone(e.data||e),title:"Clone with new CE number"},"Clone"), (e.data||e.info)&&/*#__PURE__*/React.createElement("button",{style:{gridRow:4,gridColumn:2,...btn('info',true),fontSize:10,padding:'2px 8px'},onClick:()=>handleRevise(e.data||e),title:"Revision copy (-R1, -R2...)"},"Revise"),
    /* Feature 3: Compare button for revisions */
    (()=>{const cn=(e.info?.ceNum||e.ceNum||'');const isRev=/-R\d+$/i.test(cn);if(!isRev)return null;return/*#__PURE__*/React.createElement("button",{style:{gridRow:4,gridColumn:3,...btn('def',true),fontSize:10,padding:'2px 8px'},title:"Compare with base CE",onClick:()=>{const base=cn.replace(/-R\d+$/i,'').toUpperCase();const baseEntry=history.find(h=>(h.info?.ceNum||h.ceNum||'').toUpperCase()===base);setDiffModal({base:baseEntry||null,rev:e.data||e});}},"⚖ Diff");})()
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
    style:{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:500,background:ACC,color:ON_ACC,borderRadius:12,padding:'10px 20px',display:'flex',gap:12,alignItems:'center',boxShadow:'0 4px 20px #0008',fontWeight:700,fontSize:13}
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
      style:{background:'transparent',color:ON_ACC,border:`1px solid ${alpha(ON_ACC,'26')}`,borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:12},
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
      /* That CE's multipliers, not the open one's: comparing two estimates
         must price each at what it was quoted at. */
      const _r = ceRates(ce);
      const mpT = (ce.mp||[]).reduce((s,r)=>s+N(r.pax)*N(r.days)*N(r.rate)*ceShiftMult(_r,r.shift)+N(r.pax)*N(r.days)*N(r.otHours)*(N(r.rate)/8)*ceOtMult(_r)+(ceIncentiveOn(ce.ceType)?N(r.pax)*N(r.days)*N(r.perDiem):0),0);
      const toolT = (ce.tools||[]).reduce((s,r)=>s+N(r.qty)*resDays(r)*N(r.cost),0);
      const matT = (ce.mats||[]).reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
      const ppeT = (ce.ppe||[]).reduce((s,r)=>s+N(r.qty)*N(r.cost),0);
      const miscT = Object.values(ce.misc||{}).flat().reduce((s,r)=>s+miscRowCost(r),0);
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
          return /*#__PURE__*/React.createElement("tr", {key, style:{borderBottom:`1px solid ${alpha(BDR, '22')}`,background:isGrand?alpha(SURF, '88'):'transparent'}},
            /*#__PURE__*/React.createElement("td", {style:{...TDS,fontWeight:isGrand?700:400}}, label),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:isGrand?ACC:TX}}, '₱'+ph(va)),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:isGrand?INFO:TX}}, '₱'+ph(vb)),
            /*#__PURE__*/React.createElement("td", {style:{...TDS,...MONO,textAlign:'right',color:diffColor(va,vb)}}, diff===0?'—':(diff>0?'+':'')+'₱'+ph(diff))
          );
        }))
      ),
      /*#__PURE__*/React.createElement("div", {style:{marginTop:14,display:'flex',gap:8,justifyContent:'flex-end'}},
        /*#__PURE__*/React.createElement("button", {style:{...btn('acc',true),fontSize:11}, onClick:()=>{handleLoad(a);setCompareModal(null);}}, "Load "+ceA),
        /*#__PURE__*/React.createElement("button", {style:{...btn('info',true)||btn('def',true),fontSize:11,borderColor:alpha(INFO, '55'),color:INFO}, onClick:()=>{handleLoad(b);setCompareModal(null);}}, "Load "+ceB)
      )
    ));
  })()
  );
  /* ---- Scope Library Editor (Scope Library tab) ---- */
  /* ScopeLibraryEditor's state, and ResEditor's, held by App.

     Both were declared inside a component that App re-creates on every render,
     so React remounted them constantly: the SharePoint wizard closed itself,
     and ResEditor's "focus the row I just added" never got the chance to fire
     because the row it was pointing at had already been thrown away. Same
     defect as the Masterlist tab, same fix -- see check-remounting-editors.js.

     newRowId is deliberately shared across every ResEditor on screen: only one
     row can have just been added, so only one can want the focus. */
  const [showSpWiz, setShowSpWiz] = useState(false);
  const [spWizLog, setSpWizLog] = useState('');
  const [spWizBusy, setSpWizBusy] = useState(false);
  const [newRowId, setNewRowId] = useState(null);
  const newRowNameRef = useRef(null);
  useEffect(() => {
    if (newRowId && newRowNameRef.current) {
      newRowNameRef.current.focus();
      setNewRowId(null);
    }
  }, [newRowId]);
  const ScopeLibraryEditor = () => {
    /* These live on App, not here. ScopeLibraryEditor is a closure created
       fresh on every App render, so React sees a NEW component type each time
       and remounts it -- wiping any state held locally. That is why adding a
       service never opened its editor: startEdit ran, saveSowLib re-rendered
       App, and the remount threw the selection away. Hence "go to the bottom,
       click Edit, come back up". */
    const [libSearch, setLibSearch] = [_libSearch, _setLibSearch];
    const [libCat, setLibCat] = [_libCat, _setLibCat];
    const [editSvc, setEditSvc] = [_editSvc, _setEditSvc];
    const [editDraft, setEditDraft] = [_editDraft, _setEditDraft];
    const [resTab, setResTab] = [_resTab, _setResTab];

    const spConnected = !!(USE_SP || getSiteURL());
    const spPublish = async () => {
      setSpWizBusy(true);
      setSpWizLog('Publishing scope library to SharePoint…');
      try {
        /* dbSaveSowLib answers with {sp, adopted, reason} now, not a boolean --
           a truthy object would have reported every failure as a success. */
        const res = await dbSaveSowLib(sowLib);
        if (res && res.sp) {
          const kept = (res.adopted || []).length;
          if (kept) { const merged = [...res.adopted, ...sowLib]; setSowLib(merged); cacheSowLib(merged); }
          setSpWizLog('✅ Published successfully! All users will see the updated library.' +
            (kept ? ' ' + kept + ' service' + (kept === 1 ? '' : 's') + ' already on the site ' +
              (kept === 1 ? 'was' : 'were') + ' kept and added to your copy.' : ''));
        } else setSpWizLog('⚠️ Saved to local storage only' +
          (res && res.reason ? ' — ' + res.reason : ' (SP not connected)') + '.');
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
          uom: r.uom || 'Lot',
          /* Blank means "on site for the whole project", which is what every
             service written before this did -- apply stamped the project's day
             count onto every row. A number means this role is only needed for
             that many days of its step. */
          days: Number.isFinite(Number(r.days)) && Number(r.days) > 0 ? Number(r.days) : '',
          miscCat: r.miscCat || 'requirements',
          /* Which scope step needs this. Stored as an index into `scope`;
             every service written before this existed has none, so it parks on
             step 1 rather than disappearing. */
          step: Number.isFinite(r.step) ? r.step : 0
        };
      });
    };
    const serialise = (rows, isMisc) => rows.map(r => r.name ? (
      {name: r.name, qty: r.qty || 1, step: Number.isFinite(r.step) ? r.step : 0,
       ...(Number(r.days) > 0 ? {days: Number(r.days)} : {}),
       ...(isMisc ? {miscCat: r.miscCat || 'requirements'} : {})}
    ) : null).filter(Boolean);
    /* Scope rows carry a stable id for the whole edit, and every resource
       points at one by id rather than by position -- otherwise deleting step 1
       would silently move every resource under it to whatever took its place. */
    const mkScopeRows = svc => (svc.scope || []).map((t, i) => ({
      id: 'sr' + i + '_' + uid(),
      type: i === 0 || !String(t).match(/^[a-z]\./i) ? 'main' : 'sub',
      text: t
    }));
    const startEdit = svc => {
      const rows = mkScopeRows(svc);
      const toId = arr => arr.map(r => ({ ...r, step: (rows[r.step] || rows[0] || {}).id || '' }));
      setEditSvc(svc);
      setEditDraft({
        ...svc,
        scope: [...(svc.scope || [])],
        scopeRows: rows,
        mp: toId(normalise(svc.mp, 'mp')),
        tools: toId(normalise(svc.tools, 'tools')),
        mats: toId(normalise(svc.mats, 'mats')),
        ppe: toId(normalise(svc.ppe, 'ppe')),
        misc: toId(normalise(svc.misc, 'mats')).map(r => ({ ...r, cat: r.miscCat }))
      });
      setResTab('mp');
    };
    const cancelEdit = () => {
      setEditSvc(null);
      setEditDraft(null);
    };
    const saveEdit = () => {
      /* Blank steps are dropped on save, so the index a resource points at must
         be its position in the KEPT rows, not in the edited list. */
      const kept = (editDraft.scopeRows || []).filter(r => String(r.text || '').trim());
      const idx = {};
      kept.forEach((r, i) => { idx[r.id] = i; });
      const toIdx = arr => (arr || []).map(r => ({ ...r, step: idx[r.step] !== undefined ? idx[r.step] : 0 }));
      const saved = {
        ...editDraft,
        scope: kept.map(r => r.text),
        mp: serialise(toIdx(editDraft.mp)),
        tools: serialise(toIdx(editDraft.tools)),
        mats: serialise(toIdx(editDraft.mats)),
        ppe: serialise(toIdx(editDraft.ppe)),
        misc: serialise(toIdx(editDraft.misc).map(r => ({ ...r, miscCat: r.cat || 'requirements' })), true)
      };
      delete saved.scopeRows;
      saveSowLib(sowLib.map(s => s.id === saved.id ? saved : s));
      setEditSvc(null);
      setEditDraft(null);
      showToast('Service updated.');
    };
    const delSvc = id => {
      if (!confirm('Delete this service?')) return;
      /* Named, so SharePoint removes this one and leaves alone anything else it
         has that this browser has not seen yet. */
      saveSowLib(sowLib.filter(s => s.id !== id), {deleted: [id]});
      showToast('Deleted.');
    };
    const addSvc = () => {
      const blank = {
        id: uid(),
        code: sowLib.reduce((m, s) => Math.max(m, svcNum(s)), 0) + 1,
        cat: 'On-Site Services',
        title: 'New Service',
        scope: ['Describe the scope here.'],
        mp: [],
        tools: [],
        mats: [],
        ppe: [],
        misc: []
      };
      /* At the TOP. It used to be appended, so a new service landed below 131
         others: you scrolled to the bottom to find it, and back up to the
         editor to fill it in, for every single edit. */
      saveSowLib([blank, ...sowLib]);
      startEdit(blank);
      showToast('New service added — it is the first one in the list.');
    };
    /* Merge-on-save left every replaced service in SharePoint alongside the
       one that replaced it, so a library imported over another shows both.
       Loading now keeps one of each, but the extra rows are still on the site
       until something writes over them -- this is that something, on purpose
       and with a count, rather than as a side effect of editing a service. */
    const dedupeLib = () => {
      const key = s => String(s.cat || '').toUpperCase().trim() + '|' + String(s.title || '').toUpperCase().trim();
      const seen = {};
      const kept = [];
      const droppedIds = [];
      /* Later wins: the newest import is the one worth keeping. */
      [...sowLib].reverse().forEach(s => {
        const k = key(s);
        if (seen[k]) { droppedIds.push(s.id); return; }
        seen[k] = true;
        kept.unshift(s);
      });
      const dropped = droppedIds.length;
      if (!dropped) { showToast('No duplicates — every service is listed once.'); return; }
      if (!confirm('Remove ' + dropped + ' duplicate service' + (dropped === 1 ? '' : 's') + '?\n\n' +
        kept.length + ' will remain. Where two services share a category and title, the more recently imported one is kept.')) return;
      saveSowLib(kept, {deleted: droppedIds});
      showToast('Removed ' + dropped + ' duplicate' + (dropped === 1 ? '' : 's') + ' — ' + kept.length + ' services remain.');
    };
    const resetLib = () => {
      if (!confirm('Reset to defaults? All custom changes will be lost.')) return;
      /* This list and nothing else -- the one caller besides Import-replace
         that genuinely means to rewrite the whole library. */
      saveSowLib(window.SOW_LIBRARY, {replace: true});
      showToast('Library reset to defaults.');
    };
    const allCats = [...new Set(sowLib.map(s => s.cat))].sort();

    /* Resource table for one type (mp/tools/mats/ppe) */
    const ResEditor = ({
      rows,
      setRows,
      type,
      /* When the caller groups rows by scope step it passes the other steps and
         a mover, so a row can be re-filed without deleting and retyping it.
         Every service written before per-step storage has all its resources on
         step 1, and this is how they get where they belong. */
      steps,
      onMoveStep
    }) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      const mlMap = {
        mp: masterlist.manpower,
        tools: masterlist.tools,
        mats: masterlist.materials,
        ppe: masterlist.ppe
      };
      const mlItems = mlMap[type] || [];
      const catOpts = type === 'mp' ? ['Electrical', 'Mechanical', 'Civil', 'General'] : type === 'ppe' ? ['General', 'Welding', 'Electrical', 'Mechanical'] : type === 'tools' ? TOOL_CATEGORIES : type === 'mats' ? MATERIAL_CATEGORIES : ['Electrical', 'Mechanical', 'Civil', 'General'];
      /* Updater form, not a new array built from props: two edits landing in one
         React batch both read the same rendered snapshot, so the second would
         quietly undo the first. Callers that only accept an array still work --
         `apply` falls back to the rows this render was given. */
      const apply = fn => setRows(prev => fn(Array.isArray(prev) ? prev : safeRows));
      const addRow = () => {
        const newId = uid();
        setNewRowId(newId);
        apply(rs => [...rs, {
          id: newId,
          code: '',
          cat: type === 'misc' ? 'requirements' : 'General',
          name: '',
          qty: 1,
          cost: 0,
          uom: type === 'mp' ? 'Day' : 'Lot'
        }]);
      };
      const upd = (id, k, v) => apply(rs => rs.map(r => r.id === id ? {
        ...r,
        [k]: v
      } : r));
      const del = id => apply(rs => rs.filter(r => r.id !== id));
      const autoFill = (id, name) => {
        const m = mlItems.find(x => (x.role || x.desc || '').toUpperCase() === name.toUpperCase());
        /* Same updater rule as upd/del: typing a name that matches the
           masterlist fires this in the same batch as the keystroke itself, and
           the array form put the row back to what it was before the keystroke. */
        if (m) apply(rs => rs.map(r => r.id === id ? {
          ...r,
          name,
          code: m.code || r.code,
          cat: m.category || r.cat,
          cost: m.rate || m.cost || r.cost,
          uom: m.uom || r.uom
        } : r));else apply(rs => rs.map(r => r.id === id ? {
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
      }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Item Code', 'Category', 'Role / Description', type === 'mp' ? 'Pax' : 'Qty', 'Cost (PHP)', 'UOM'].concat(type === 'mp' ? ['Days'] : []).concat(steps && steps.length > 1 ? ['Step'] : []).concat(['']).map(h => /*#__PURE__*/React.createElement("th", {
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
        /* First alphabetically is not a sensible default. With four
           categories it barely showed; with nineteen, an uncategorised
           material reads as an abrasive. Fall back to General where the
           list has one. */
        value: r.cat || (catOpts.indexOf('General') >= 0 ? 'General' : catOpts[0]),
        onChange: e => upd(r.id, 'cat', e.target.value)
        /* Same as the masterlist: a row carrying a category this list no longer
           offers keeps it rather than showing an empty dropdown. Tools moved off
           Electrical / Mechanical / General, so every older row is in exactly
           that position. */
      }, [...(r.cat && catOpts.indexOf(r.cat) < 0 ? [r.cat] : []), ...catOpts]
        .map(c => /*#__PURE__*/React.createElement("option", {
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
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {...INP, ...MONO, width: 52},
        min: 1, intOnly: true,
        value: r.qty || 1,
        onCommit: v => upd(r.id, 'qty', v),
        title: "Quantity of this item per service application"
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 90
        },
        min: 0,
        value: r.cost || 0,
        onCommit: v => upd(r.id, 'cost', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 68
        },
        value: uomCase(r.uom || 'Day'),
        onChange: e => upd(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Day'))), type === 'mp' && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: { ...INP, ...MONO, width: 62, fontSize: 10 },
        min: 0, allowBlank: true, value: r.days === undefined || r.days === null ? '' : r.days,
        placeholder: "full",
        title: "Days this role is needed for THIS step. Leave blank if they report from day 1 to completion — then the project's No. of Days is used, which is what every service did before this existed.",
        onCommit: v => upd(r.id, 'days', v)
      })), steps && steps.length > 1 && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 74, fontSize: 10 },
        value: r.step || '',
        title: "Move this item to another scope step",
        onChange: e => onMoveStep && onMoveStep(r, e.target.value)
      }, steps.map(st => /*#__PURE__*/React.createElement("option", { key: st.id, value: st.id }, st.label)))), /*#__PURE__*/React.createElement("td", {
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
    /* Called, not rendered as a component -- see ExpenseTable -- so the
       site URL can be typed in one go. */
    const SpWizModal = () => showSpWiz && /*#__PURE__*/React.createElement("div", {
      style: {position:'fixed',inset:0,background:'#000a',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}
    }, /*#__PURE__*/React.createElement("div", {
      style: {background:BG,border:`1px solid ${BDR}`,borderRadius:10,padding:28,width:440,maxWidth:'95vw',boxShadow:'0 8px 40px #0008'}
    }, /*#__PURE__*/React.createElement("div", {
      style: {fontWeight:700,fontSize:15,marginBottom:4,color:'var(--accent-violet)'}
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
    /* Resources hang off a SCOPE STEP, the same way a SOW Breakdown task owns
       its rows -- that is what lets an applied service arrive already filed
       against 1.1 rather than in one flat "Unassigned" pile. The names match
       the Breakdown's, including Consumables, which the library used to call
       Materials while the rest of the app called it something else again. */
    const LIB_RES_TYPES = [['mp', 'Manpower'], ['tools', 'Tools & Equipment'], ['mats', 'Consumables'], ['ppe', 'PPE'], ['misc', 'Miscellaneous']];
    /* "1.", "a.", "2." -- the same numbering the scope list above shows, so the
       dropdown reads like the steps it points at. */
    const stepLabels = () => {
      let mc = 0, sc = 0;
      return ((editDraft && editDraft.scopeRows) || []).map(r => {
        if (r.type === 'main') { mc++; sc = 0; } else { sc++; }
        return { id: r.id, label: (r.type === 'main' ? mc + '.' : mc + '.' + String.fromCharCode(96 + sc)) };
      });
    };
    const stepRowsOf = (type, stepId) => ((editDraft && editDraft[type]) || []).filter(r => r.step === stepId);
    /* Every write re-stamps the step, so a row added by ResEditor -- which knows
       nothing about steps -- lands on the right one. */
    const setStepRows = (type, stepId, rows) => setEditDraft(p => {
      /* `rows` may be an updater. ResEditor builds the next array from the props
         it was rendered with, so two edits landing in one React batch would see
         the same stale snapshot and the second would undo the first. */
      const cur = ((p && p[type]) || []);
      const next = typeof rows === 'function' ? rows(cur.filter(r => r.step === stepId)) : rows;
      return { ...p, [type]: [...cur.filter(r => r.step !== stepId), ...next.map(r => ({ ...r, step: stepId }))] };
    });
    const addFirstRow = (type, stepId) => setStepRows(type, stepId, [...stepRowsOf(type, stepId), {
      id: uid(), code: '', cat: type === 'misc' ? 'requirements' : 'General', name: '', qty: 1, cost: 0,
      uom: type === 'mp' ? 'Day' : 'Lot'
    }]);
    const stepResources = stepId => {
      const used = LIB_RES_TYPES.filter(([t]) => stepRowsOf(t, stepId).length);
      const empty = LIB_RES_TYPES.filter(([t]) => !stepRowsOf(t, stepId).length);
      return /*#__PURE__*/React.createElement("div", { style: { marginLeft: 22, marginTop: 4, marginBottom: 8 } },
        used.map(([t, label]) => /*#__PURE__*/React.createElement("div", { key: t, style: { marginBottom: 8 } },
          /*#__PURE__*/React.createElement("div", { style: { ...LBL, marginBottom: 3 } }, label),
          ResEditor({
            rows: stepRowsOf(t, stepId),
            setRows: rows => setStepRows(t, stepId, rows),
            type: t,
            steps: stepLabels(),
            onMoveStep: (row, toId) => setEditDraft(p => ({
              ...p,
              [t]: ((p && p[t]) || []).map(x => x.id === row.id ? { ...x, step: toId } : x)
            }))
          })
        )),
        empty.length > 0 && /*#__PURE__*/React.createElement("div", {
          style: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }
        },
          /*#__PURE__*/React.createElement("span", { style: { color: MT, fontSize: 10 } }, "Add:"),
          empty.map(([t, label]) => /*#__PURE__*/React.createElement("button", {
            key: t, style: { ...btn('def', true), fontSize: 10 },
            onClick: () => addFirstRow(t, stepId)
          }, "+ " + label))
        )
      );
    };
    /* The whole edit form, rendered inside whichever card is open. Kept as a
       plain function rather than a component so React does not remount it on
       every keystroke and steal the focus out of the field being typed in. */
    const editorBody = () => /*#__PURE__*/React.createElement("div", {
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
        color: 'var(--accent-violet)'
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
          style: { marginBottom: 6, paddingLeft: item.type === 'main' ? 0 : 16 }
        }, /*#__PURE__*/React.createElement("div", {
          style: { display: 'flex', gap: 6, marginBottom: 3, alignItems: 'flex-start' }
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
        }),
        /* Steps could only be appended and never moved, so a method written in
           the wrong order had to be retyped. Resources point at a step by id,
           not by position, so inserting or moving one keeps everything filed
           where it was. */
        /*#__PURE__*/React.createElement("button", {
          title: "Move up",
          disabled: idx === 0,
          style: {...btn('def', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]];
            return a;
          })
        }, "^"), /*#__PURE__*/React.createElement("button", {
          title: "Move down",
          disabled: idx === scopeRows.length - 1,
          style: {...btn('def', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]];
            return a;
          })
        }, "v"), /*#__PURE__*/React.createElement("button", {
          title: "Insert a main step below this one",
          style: {...btn('def', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            a.splice(idx + 1, 0, {id: uid(), type: 'main', text: ''});
            return a;
          })
        }, "+1"), /*#__PURE__*/React.createElement("button", {
          title: "Insert a sub-step below this one",
          style: {...btn('info', true), fontSize: 10, padding: '2px 5px', flexShrink: 0},
          onClick: () => setRows(p => {
            const a = [...p];
            a.splice(idx + 1, 0, {id: uid(), type: 'sub', text: ''});
            return a;
          })
        }, "+a"), /*#__PURE__*/React.createElement("button", {
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
        }, "x")), stepResources(item.id));
      }));
    })()),
    /* The four resource tabs used to sit here, one flat list per type for the
       whole service. They are now rendered under the scope step that needs
       them, above. */
    /*#__PURE__*/React.createElement("div", {
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
    }, "Delete Service")));
    return /*#__PURE__*/React.createElement("div", null, SpWizModal(), /*#__PURE__*/React.createElement("div", {
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
        /* One row per scope step, and each resource written on the row of the
           step that needs it.

           Two faults this replaces. Every resource went on the FIRST row, so
           the step a resource belongs to -- the thing the library exists to
           record -- was destroyed by its own export. And a resource stored as
           {name, qty, step} went through join(), which is why the file came
           out full of "[object Object]" where the resources should have been. */
        const resName = it => (typeof it === 'string' ? it : (it && it.name) || '').trim();
        const resQty = it => (typeof it === 'string' ? 1 : Number(it && it.qty) || 1);
        const resStep = it => (typeof it === 'string' ? 0 : (Number.isFinite(it && it.step) ? it.step : 0));
        const resCell = (list, step) => (list || [])
          .filter(it => resName(it) && resStep(it) === step)
          .map(it => resName(it) + (resQty(it) > 1 ? ' x' + resQty(it) : ''))
          .join(' | ');
        const rows = sowLib.flatMap(svc => {
          const base = {
            ID: svc.id,
            Category: svc.cat,
            Title: svc.title
          };
          const scopeArr = (svc.scope || []).length ? svc.scope : [''];
          return scopeArr.map((t, i) => ({
            ...base,
            /* A step lettered a. / b. / c. belongs under the numbered step
               above it; anything else is a step in its own right. */
            ScopeType: SUBSTEP_RE.test(String(t)) ? 'sub' : 'main',
            ScopeText: t,
            MP: resCell(svc.mp, i),
            Tools: resCell(svc.tools, i),
            Materials: resCell(svc.mats, i),
            PPE: resCell(svc.ppe, i),
            /* Miscellaneous had no column at all, so every accommodation,
               permit and admin line a service carried was dropped by its own
               export -- silently, since nothing said the column was missing. */
            Misc: resCell(svc.misc, i)
          }));
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
          /* Group rows by ID, keeping every resource against the step it was
             written on.

             The whole resource list used to be overwritten from whichever row
             carried one, as plain strings. So a library where each resource
             sits on its own step came back with all of them attached to the
             service as a whole, and every one landed in "Unassigned" -- a round
             trip through Excel quietly undid the filing the library exists for. */
          const map = {};
          const stepOf = {};
          /* "CHAIN BLOCK 5T x2" -> {name: 'CHAIN BLOCK 5T', qty: 2}. The suffix
             is read only when it is a trailing quantity, so a tool genuinely
             named "... X2" keeps its name. */
          const parseRes = (txt, step) => (txt + '').split('|').map(x => x.trim()).filter(Boolean)
            .map(x => {
              /* A SPACE before the x is required. Without it "BORING BAR MX2"
                 reads as "BORING BAR M" x2 -- a tool renamed by its own
                 quantity parser. */
              const m = x.match(/^(.*?)\s+[x×]\s*(\d+)$/i);
              const name = (m ? m[1] : x).trim();
              return { name: name, qty: m ? Number(m[2]) : 1, step: step };
            })
            .filter(x => x.name);
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
                ppe: [],
                misc: []
              };
              stepOf[id] = 0;
            }
            /* The step index is the row's position within its own service,
               which is exactly how applyServices reads svc.scope. Resources on
               a row are filed against the step that row carries. */
            const step = stepOf[id];
            if (r.ScopeText !== undefined && r.ScopeText !== null && String(r.ScopeText).trim() !== '') {
              map[id].scope.push(String(r.ScopeText));
              stepOf[id] = step + 1;
            }
            [['MP', 'mp'], ['Tools', 'tools'], ['Materials', 'mats'], ['PPE', 'ppe'], ['Misc', 'misc']].forEach(pair => {
              if (r[pair[0]]) map[id][pair[1]] = map[id][pair[1]].concat(parseRes(r[pair[0]], step));
            });
          });
          const parsed = Object.values(map).filter(s => s.title);
          if (!parsed.length) {
            showToast('No valid services found in file.', true);
            return;
          }
          /* Import used to replace the whole library, which is right for a
             rebuilt library and badly wrong for everything else: uploading one
             new service deleted the other sixty-eight. Merging is the common
             case and the safe one, so it is the default; replacing is still
             reachable, but it now says what it will delete first. */
          const byId = {};
          sowLib.forEach(s => { byId[String(s.id)] = true; });
          const fresh = parsed.filter(s => !byId[String(s.id)]).length;
          const upd = parsed.length - fresh;
          const rest = sowLib.length - upd;
          const summary = 'Import ' + parsed.length + ' service' + (parsed.length === 1 ? '' : 's') + '?\n\n' +
            '  ' + fresh + ' new\n' +
            '  ' + upd + ' will update a service you already have\n\n';
          if (confirm(summary + 'OK  \u2014  Merge: keep your other ' + rest + ' service' + (rest === 1 ? '' : 's') + '.\n' +
                      'Cancel  \u2014  other options.')) {
            const merged = sowLib.map(s => {
              const hit = parsed.find(p => String(p.id) === String(s.id));
              return hit || s;
            }).concat(parsed.filter(s => !byId[String(s.id)]));
            saveSowLib(merged);
            showToast('Imported ' + parsed.length + ' \u2014 ' + merged.length + ' services in the library.');
          } else if (rest > 0 && confirm('Replace the ENTIRE library with these ' + parsed.length + ' services?\n\n' +
                     rest + ' service' + (rest === 1 ? '' : 's') + ' not in this file will be DELETED, here and in SharePoint.\n\n' +
                     'Export a backup first if you are not sure.')) {
            saveSowLib(parsed, {replace: true});
            showToast('Library replaced \u2014 ' + parsed.length + ' services.');
          }
        } catch (err) {
          showToast('Import failed: ' + err.message, true);
        }
        e.target.value = '';
      }
    })), /*#__PURE__*/React.createElement("button", {
      style: btn('def', true),
      title: "Keep one of each service where a category and title appear twice",
      onClick: dedupeLib
    }, "Remove duplicates"), /*#__PURE__*/React.createElement("button", {
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
    }, "Clear"))),
    /* One card per service, collapsed by default and edited IN PLACE. The
       editor used to be a fixed panel above a 131-row table: adding a service
       appended it to the bottom, so every edit meant scrolling to the end of
       the list to press Edit and back to the top to type. Same shape as a SOW
       Breakdown task, because it is the same idea. */
    /*#__PURE__*/React.createElement("div", null,
      filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
        style: { ...CS, textAlign: 'center', padding: 28, color: MT }
      }, "No services match. Clear the filter."),
      filtered.map(svc => {
        const open = !!(editSvc && editSvc.id === svc.id);
        const counts = ['MP:' + (svc.mp || []).length, 'TL:' + (svc.tools || []).length,
                        'CN:' + (svc.mats || []).length, 'PP:' + (svc.ppe || []).length]
                       .concat((svc.misc || []).length ? ['MS:' + (svc.misc || []).length] : []).join(' ');
        const toggle = () => open ? cancelEdit() : startEdit(svc);
        return /*#__PURE__*/React.createElement("div", {
          key: svc.id,
          style: { ...CS, marginBottom: 8, borderColor: open ? '#A78BFA88' : BDR,
                   background: open ? '#A78BFA08' : CARD, padding: open ? 16 : '9px 14px' }
        },
          /*#__PURE__*/React.createElement("div", {
            style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: open ? 12 : 0 }
          },
            /*#__PURE__*/React.createElement("button", {
              title: open ? 'Close' : 'Edit', onClick: toggle,
              style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11, padding: 0, width: 14 }
            }, open ? "▾" : "▸"),
            /*#__PURE__*/React.createElement("span", { style: { ...MONO, fontSize: 10, color: MT, minWidth: 54 } },
              /* The seeded services are numbered; one you just added has a uid,
                 and padStart printed all 36 characters of it across the row. */
              svcCode(svc)),
            /*#__PURE__*/React.createElement("div", { style: { minWidth: 200, flex: 1, cursor: 'pointer' }, onClick: toggle },
              /*#__PURE__*/React.createElement("div", { style: { fontWeight: 600, fontSize: 12 } },
                svc.title || /*#__PURE__*/React.createElement("i", { style: { color: MT } }, "(untitled service)")),
              !open && /*#__PURE__*/React.createElement("div", {
                style: { color: MT, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }
              }, ((svc.scope || [])[0] || '').slice(0, 90) + (((svc.scope || [])[0] || '').length > 90 ? '...' : ''))),
            /*#__PURE__*/React.createElement("span", { style: { color: 'var(--accent-violet)', fontSize: 11 } }, svc.cat),
            /*#__PURE__*/React.createElement("span", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 } },
              /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: MT, fontSize: 10 } }, counts),
              /*#__PURE__*/React.createElement("button", { style: btn('info', true), onClick: toggle }, open ? 'Close' : 'Edit')
            )
          ),
          open && editDraft && editorBody()
        );
      })
    ));
  };

  /* ---- Picker modal ---- */
  /* Picker's state, held by App.

     It was declared inside Picker, AFTER an early `if (!picker) return null`
     -- hooks behind a condition, which only ever worked because the component
     was remounted on every App render anyway. Now that the identity is stable,
     the search box and the multi-select survive a re-render instead of being
     wiped whenever anything else on the page changed.

     Cleared when the picker opens, which is what the remount used to do. */
  const [pickerQ, setPickerQ] = useState('');
  const [pickerSel, setPickerSel] = useState({});
  useEffect(() => { setPickerQ(''); setPickerSel({}); }, [picker]);
  const Picker = () => {
    if (!picker) return null;
    const q = pickerQ, setQ = setPickerQ;
    const sel = pickerSel, setSel = setPickerSel; /* {id: item} for multi-select */
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
      /* A click outside closes the picker only while nothing is ticked: losing a
         long selection to a stray click meant picking every item again.
         Cancel and X still close it. */
      onClick: e => { if (e.target === e.currentTarget && !Object.keys(sel).length) setPicker(null); }
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
        background: alpha(ACC, '22'),
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
          borderBottom: `1px solid ${alpha(BDR, '22')}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: isSelected ? alpha(ACC, '15') : 'transparent',
          borderLeft: isSelected ? `3px solid ${ACC}` : '3px solid transparent'
        },
        onMouseEnter: e => e.currentTarget.style.background = isSelected ? alpha(ACC, '22') : SURF,
        onMouseLeave: e => e.currentTarget.style.background = isSelected ? alpha(ACC, '15') : 'transparent'
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
          color: ON_ACC,
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
  /* One letter scheme for every place a CE is rendered: the Summary tab, the
     printed CE, the detailed workbook and the share text.

     Letters used to be hardcoded per ceType, which got them wrong two ways at
     once. A supply CE handed B to Tools AND to Materials, and a section that
     came to zero kept its letter and left a hole behind it -- a materials-only
     supply CE printed "A. MANPOWER COST P0.00" and then jumped straight to
     "C.". A section with no cost is not part of the estimate: it gets no
     letter, and it does not print. Letters follow the sections that remain,
     so they always run A, B, C with nothing missing. */
  const ceSections = useMemo(() => {
    /* Mobilization and demobilization lead, each on its own row, as the
       client's CE lists them: A. MOBILIZATION, B. DEMOBILIZATION. */
    const defs = [
      ...(cfg.mobDemob ? [['Mobilization Expenses', 'MOBILIZATION', mobSubT], ['Demobilization Expenses', 'DEMOBILIZATION', demobSubT]] : []),
      ['Manpower Cost', 'MANPOWER COST', mpTot],
      ['Tools & Equipment', 'TOOLS AND EQUIPMENTS', toolsT],
      ['Materials & Consumables', 'MATERIALS AND CONSUMABLES', matsT],
      ['PPE', 'PERSONAL PROTECTIVE EQUIPMENT', ppeT],
      ['Miscellaneous', 'MISCELLANEOUS', miscT]
    ];
    let i = 0;
    return defs.map(([label, printLabel, v]) => ({
      label, printLabel, v,
      letter: N(v) > 0 ? String.fromCharCode(65 + i++) + '.' : ''
    }));
  }, [mpTot, toolsT, matsT, ppeT, miscT, mobSubT, demobSubT, cfg.mobDemob]);
  /* Which of the two summary sheets this CE prints. The discipline decides
     unless the CE says otherwise, so every CE saved before this existed
     reprints exactly as it did. */
  const ceLayoutKey = summaryLayoutKey(info);
  const ceLayout = SUMMARY_LAYOUTS[ceLayoutKey];

  /* The Miscellaneous categories that actually carry a cost, lettered under
     the section's own letter. Shared by the printed CE and the workbook so the
     two cannot drift apart on the itemisation again. */
  const miscCosted = useMemo(() => {
    const parent = (ceSections.find(x => x.printLabel === 'MISCELLANEOUS' && x.v > 0) || {}).letter || '';
    return (MISC_DEF[ceType] || MISC_DEF.onsite).map(([k, l]) => ({
      /* MISC_DEF labels carry their own hardcoded letters (D.1, E.3...) which
         no longer match anything; the section's real letter is prefixed below. */
      label: String(l).replace(/^[A-Z]\.\d+\s*/, ''),
      rows: (Array.isArray(misc[k]) ? misc[k] : []).filter(r => r && (r.desc || N(r.cost) > 0)),
      v: (Array.isArray(misc[k]) ? misc[k] : []).reduce((t, r) => t + miscRowCost(r), 0)
    })).filter(x => x.v > 0).map((x, j) => ({...x, letter: parent.replace('.', '') + '.' + (j + 1)}));
  }, [ceSections, ceType, misc]);
  /* Every section's parts, in one place, so the four things that render a CE
     -- the Summary tab, the printed CE, the workbook and the share text --
     cannot itemise it differently. Keyed by the printed section name.

     Manpower splits into the six shifts and what is paid on top of them.
     Neither figure is computed here: mpWage and ben are the same values the
     Manpower tab and the total are built from, so a breakdown that did not
     add up to its section would mean the section itself was wrong. */
  const ceBreakdown = useMemo(() => {
    const out = {};
    const put = (printLabel, items) => {
      const L = (ceSections.find(x => x.printLabel === printLabel && x.v > 0) || {}).letter || '';
      if (!L) return;
      /* A part that costs nothing is not part of the estimate, exactly as a
         section that costs nothing gets no letter. */
      const kept = items.filter(x => N(x.v) > 0);
      if (kept.length) out[printLabel] = kept.map((x, j) => ({ ...x, letter: L.replace('.', '') + '.' + (j + 1) }));
    };
    if (ceLayout.breaks.indexOf('mp') >= 0) {
      const byShift = {};
      mp.forEach(r => { if (!r || !r.role) return; const k = r.shift || 'regular_day'; byShift[k] = (byShift[k] || 0) + mpWage(r); });
      put('MANPOWER COST', [
        ...Object.keys(SHIFTS).map(k => ({ label: mpShiftLabel(k), v: byShift[k] || 0 })),
        { label: MP_BENEFITS_LABEL, v: ben }]);
    }
    /* The Electrical sheet sets its parts in capitals like everything else
       on it; the Mechanical one reads them as a sentence under the line they
       belong to. */
    if (ceLayout.breaks.indexOf('misc') >= 0) put('MISCELLANEOUS',
      miscCosted.map(x => ({ label: ceLayout.parentCarries ? x.label : String(x.label).toUpperCase(), v: x.v })));
    return out;
  }, [ceSections, ceLayout, mp, rr, ben, miscCosted]);
  /* One colour per cost group, matched to the tab each is costed on, so the
     matrix row and the tab it came from read as the same thing. Keyed on the
     label rather than position: the mob/demob rows only exist for onsite, and
     an index would shift the whole palette on the other CE types. */
  const SUMMARY_DOT = {
    'Mobilization Expenses': INFO,
    'Demobilization Expenses': ACC,
    'Manpower Cost': ACC,
    'Tools & Equipment': INFO,
    'Materials & Consumables': OK,
    'PPE': 'var(--accent-violet)',
    'Miscellaneous': MT,
    'Mobilization / Demobilization': INFO
  };
  const summaryDot = label => SUMMARY_DOT[String(label).replace(/^[A-Z]\.\s+/, '')] || MT;
  const summaryRows = [...ceSections.map(x => [(x.letter ? x.letter + '  ' : '') + x.label, x.v])];
  const handleGenerateCE = (opt) => {
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
    const _br = ceBrand(coInfo);
    const pageStyle = `
      /* Zero: every sheet carries its own margins as padding, so what is on
         screen is exactly what leaves the printer. */
      @page{size:A4 portrait;margin:0}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:8pt;color:#000;margin:0;padding:0}
      table{width:100%;border-collapse:collapse}
      td,th{border:1px solid #555;padding:1.5px 4px;font-size:7.5pt;vertical-align:middle}
      .nb td,.nb th{border:none} .bdr td,.bdr th{border:1px solid #999}
      .page{padding:0;margin-bottom:4mm}
      .page-break{page-break-before:always;padding-top:0}
      .blk{page-break-inside:avoid;margin-bottom:5px}
      h2{font-size:10pt;text-align:center;margin:2px 0;font-weight:bold}
      .sec{background:${_br.bar};color:${_br.text};font-weight:bold;text-align:center;padding:3px;font-size:8pt}
      .sub{background:#eee;font-weight:bold;font-size:7.5pt;padding:2px 4px}
      .r{text-align:right} .c{text-align:center} .b{font-weight:bold}
      /* Header labels never wrap: the tick rows are wide, and a label
         broken over two lines makes the whole block a row taller. */
      .nw{white-space:nowrap}
      .tot{background:#f5f5f5;font-weight:bold}
      .sig td{border:none;text-align:center;padding:0 6px;vertical-align:bottom}
      /* The document is laid out into real A4 sheets before printing, each
         carrying its own header and footer. A position:fixed running header is
         drawn wherever the printer's own margins happen to fall -- which is how
         a footer ended up struck through the middle of a table -- and HTML has
         no way to count pages, so "Page 3 of 12" was impossible that way. */
      .sheet{width:210mm;height:297mm;padding:9mm 7mm 8mm;display:flex;flex-direction:column;overflow:hidden;background:#fff;page-break-after:always;break-after:page}
      .sheet:last-child{page-break-after:auto;break-after:auto}
      .sbody{flex:1;min-height:0;overflow:hidden}
      .run-hdr,.run-ftr{font-size:6.5pt;color:#333;display:flex;justify-content:space-between;gap:8px;flex:none}
      .run-hdr{display:block;font-size:inherit;color:inherit;margin-bottom:2mm}
      .run-ftr{border-top:.5pt solid #999;padding-top:2px;margin-top:3mm}
      @media screen{body{background:#e9e9ee}.sheet{margin:0 auto 8px;box-shadow:0 1px 6px rgba(0,0,0,.25)}}
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
      ? `<img src="${esc(co.logo)}" width="70" height="36" style="width:70px;height:36px;object-fit:contain">`
      : `<div style="font-weight:900;font-size:10pt;color:${esc(co.color)};line-height:1.1">${esc(co.name)}<br><span style="font-size:6pt">${esc(co.sub)}</span></div>`;

    /* The logo / title / document-number block. It is the header of every
       printed page (the paginator puts it on each sheet), so the sections below
       carry only their own title bar. The right column was 150px with the
       labels fixed at 80px, which wrapped "SY3-F-TSG-025" onto two lines on a
       page with room to spare; it is sized to its content and never wraps. */
    const docTop = `<table style="border:1px solid #000;font-size:7.5pt"><tr>
      <td style="border:none;width:75px;padding:2px">${logoCell}</td>
      <td style="border:none;text-align:center"><h2>COST ESTIMATE SUMMARY</h2></td>
      <td style="border:none;width:1%;white-space:nowrap;font-size:7pt;padding:2px 6px">
        <table class="nb" style="width:auto"><tr><td style="border:none;white-space:nowrap;padding-right:8px">Document No.:</td><td style="border:none;white-space:nowrap">${esc(co.doc)}</td></tr>
        <tr><td style="border:none;white-space:nowrap;padding-right:8px">Revision No.:</td><td style="border:none;white-space:nowrap">${esc(co.revNo)}</td></tr>
        <tr><td style="border:none;white-space:nowrap;padding-right:8px">Revision Date:</td><td style="border:none;white-space:nowrap">${esc(co.revDate)}</td></tr></table>
      </td></tr></table>`;
    const docHdr = title => `<table style="border:1px solid #000;margin-bottom:4px;font-size:7.5pt">
      <tr><td colspan="3" style="text-align:center;background:${_br.bar};color:${_br.text};font-weight:bold;font-size:9pt;padding:3px;border:1px solid #000">${title}</td></tr>
      <tr><td colspan="3" style="border:none;font-size:7.5pt;padding:1px 4px"><div style="display:flex;justify-content:space-between;gap:8px"><span><b>CE TYPE:</b>&nbsp;${esc(ceTypeLabel(ceType).toUpperCase())}</span><span>${rceNo ? '<b>RCE No.:</b>&nbsp;' + esc(rceNo) + '&nbsp;&nbsp;' : ''}<b>CE No.:</b>&nbsp;${esc(info.ceNum || '')}&nbsp;&nbsp;<b>DATE:</b>&nbsp;${esc(info.date||'')}</span></div></td></tr>
    </table>`;

    /* PROJECT TYPE is ticked, not spelled out, because that is how the form is
       read: an approver looks for which box is marked. The boxes are
       CE_DISCIPLINES itself, so a discipline added there gets a box here and
       cannot go missing from the paper. */
    const tickRow = (opts, chosen) => opts.map(o =>
      `<span style="white-space:nowrap;margin-right:14px">${
        String(chosen || '').toLowerCase() === String(o.k).toLowerCase() ? '&#9745;' : '&#9744;'
      }&nbsp;<b>${esc(String(o.t).toUpperCase())}</b></span>`).join('');
    const typeBoxes = tickRow(CE_DISCIPLINES.map(d => ({ k: d, t: d })), info.projType);
    /* Whether the work is done in our shop or away on the client's site is
       the other thing an approver checks first: it decides mobilization, the
       site incentive and whose power the tools draw. Ticked like the
       discipline at first, but four boxes and a label would not fit the
       right-hand column and ran off the sheet -- and unlike the discipline
       there is only ever one CE type, so there is nothing to choose between:
       the one it is, stated. */
    const kindBoxes = `<b>${esc(ceTypeLabel(ceType).toUpperCase())}</b>`;

    const infoTable = `<table class="bdr" style="margin-bottom:5px;font-size:7.5pt">
      <tr><td class="b nw" style="width:110px">PROJECT TYPE:</td><td>${typeBoxes}</td><td class="b nw">CE TYPE:</td><td>${kindBoxes}</td></tr>
      <tr><td class="b nw">PROJECT DESCRIPTION:</td><td class="b c">${esc(info.description||'')}</td><td class="b nw">MATERIAL:</td><td>${esc(info.material||'')}</td></tr>
      <tr><td class="b nw">CLIENT NAME:</td><td>${esc(info.client||'')}</td><td class="b nw">CLIENT LOCATION:</td><td>${esc(info.location||'')}</td></tr>
      <tr><td class="b nw">ATTENTION:</td><td>${esc(info.attention||'SALES DEPARTMENT')}</td><td class="b">QUANTITY:</td><td>${esc(info.qty||1)} ${esc(qtyUom)}</td></tr>
      <tr><td class="b nw">END USER:</td><td>${esc(info.endUser||'C/O SALES')}</td><td class="b">NO. OF DAYS:</td><td>${esc(info.days||'')} DAYS</td></tr>
    </table>`;

    /* Cost summary -- only the sections this CE actually uses.

       The sub-rows read `misc.transport` as a number. Miscellaneous holds a
       LIST OF ROWS per category, so every one of those came out NaN, every
       category tested as empty, and the whole Miscellaneous section vanished
       from the printed CE -- while its cost stayed inside the total, which is
       the worst of both: a document whose parts do not add up to its sum.
       The parts now come from ceBreakdown, which every renderer reads. */
    const costRows = ceSections.filter(x => x.v > 0).map(x => ({
      letter: x.letter,
      label: x.printLabel,
      v: x.v,
      sub: ceBreakdown[x.printLabel] || null
    }));

    const costTable = `<table style="margin-bottom:5px">
      <tr style="background:${_br.bar};color:${_br.text}"><th class="c" style="width:40px">ITEM</th><th>DESCRIPTION</th><th class="r" style="width:110px">TOTAL COST</th></tr>
      ${costRows.map(r=>`<tr>
        <td class="c b">${r.letter}</td>
        <td class="b">${r.label}</td>
        <td class="r">${r.sub && !ceLayout.parentCarries ? '' : fmt(r.v)}</td>
      </tr>${r.sub?r.sub.map(s=>ceLayout.parentCarries
        ? `<tr><td class="c"></td><td style="padding-left:16px;font-size:7pt;font-style:italic;color:#555"><div style="display:flex;justify-content:space-between;gap:12px"><span>of which&nbsp; ${s.letter}&nbsp; ${esc(s.label)}</span><span>${fmt(s.v)}</span></div></td><td class="r"></td></tr>`
        : `<tr><td class="c"></td><td class="b" style="padding-left:22px">${s.letter}.&nbsp; ${esc(s.label)}</td><td class="r">${fmt(s.v)}</td></tr>`).join(''):''}
      `).join('')}
      <tr class="tot"><td colspan="2" class="b r" style="font-size:9pt">TOTAL AMOUNT:</td><td class="r b" style="font-size:9pt">${fmt(grand)}</td></tr>
      ${showUnitP ? `<tr class="tot"><td colspan="2" class="b r">${esc(unitLbl)}</td><td class="r b">${fmt(unitP)}</td></tr>` : ''}
      ${showUnitP && perJobT ? `<tr class="tot"><td colspan="2" class="b r">${esc(perJobLbl)}</td><td class="r b">${fmt(perJobT)}</td></tr>` : ''}
      ${margin !== 0 ? `<tr class="tot" style="background:#e8f5e9"><td colspan="2" class="b r">SELLING PRICE (${margin > 0 ? '+' : ''}${margin}% margin):</td><td class="r b">${fmt(grand*(1+margin/100))}</td></tr>` : ''}
      ${hlRows.length ? `<tr><td colspan="3" class="c b" style="background:#ddd;font-size:7.5pt">HIGHLIGHTED COSTS (already included above)</td></tr>` + hlRows.map(r=>`<tr class="tot"><td colspan="2" class="b r">${esc(hlLabel(r).toUpperCase())}:</td><td class="r b">${fmt(hlAmt(r))}</td></tr>`).join('') : ''}
      ${servicesSummary.on && servicesSummary.ok ? `<tr><td colspan="3" class="c b" style="background:#ddd">SERVICES</td></tr>
      ${servicesSummary.lines.map(l=>`<tr><td colspan="2" class="b r">${esc(l.label.toUpperCase())}:</td><td class="r">${fmt(l.v)}</td></tr>`).join('')}
      ${Math.abs(servicesSummary.other) >= 0.005 ? `<tr><td colspan="2" class="b r">OTHER MISC. TO THE PROJECT:</td><td class="r">${fmt(servicesSummary.other)}</td></tr>` : ''}
      <tr class="tot"><td colspan="2" class="b r" style="font-size:9pt">SERVICES TOTAL AMOUNT:</td><td class="r b" style="font-size:9pt">${fmt(servicesSummary.total)}</td></tr>` : ''}
    </table>`;

    /* Breakdown notes written on the SOW Breakdown tab print with the CE notes,
       after the manually written ones, each labelled with its scope number. */
    const sowNotes = (sowItems || []).filter(s => String(s.note || '').trim());
    const notesList = (notes.length || sowNotes.length) ? `<div style="margin-top:4px"><b>NOTE:</b><ol style="margin:1px 0 0 14px;padding:0;font-size:7.5pt">${notes.map(n=>`<li>${esc(n.text)}</li>`).join('')}${sowNotes.map(s=>`<li><b>Scope ${esc(sowLabels[s.id]||'')}</b> &#8212; ${esc(String(s.note).trim())}</li>`).join('')}</ol></div>` : '';
    /* Four signatories to a row. Seven in a single row left each about 2cm
       wide and shrank every signature image to match; the sheet is the same
       width whatever the routing is, so the row has to wrap instead. */
    const SIG_PER_ROW = 4;
    const sigRows = [];
    for (let i = 0; i < approvers.length; i += SIG_PER_ROW) sigRows.push(approvers.slice(i, i + SIG_PER_ROW));
    /* Only the signatures this approval actually stands on -- see apvVisibleSigs. */
    const sigShow = apvVisibleSigs(approvers, info.approval, signatures);
    const sigCell = (a, i) => {
      const sigImg = sigShow[a.id || i] ? `<img src="${sigShow[a.id || i]}" style="height:52px;max-width:100%;display:block;margin:0 auto 2px"/>` : '';
      const line = a.id && info.approval && (info.approval.lines || {})[a.id];
      return `<td style="border:1px solid #000;padding:4px 8px;vertical-align:bottom"><div style="min-height:50px;text-align:center">${sigImg}</div><div style="border-top:1px solid #000;padding-top:3px;text-align:center"><b style="font-size:8pt">${esc((line || {}).byName || a.name || '')}</b><br><span style="font-size:7.5pt">${esc(a.title || a.role || '')}</span></div></td>`;
    };
    const sigBlock = sigRows.map((row, ri) => {
      /* A short last row keeps the cell width of a full one, so four
         signatories and five do not draw at different sizes. */
      const pad = ri ? Array(SIG_PER_ROW - row.length).fill('<td style="border:none"></td>').join('') : '';
      return `<table style="width:100%;border-collapse:collapse;margin-top:${ri ? 8 : 20}px;table-layout:fixed;page-break-inside:avoid" class="sig">
      <tr>${row.map(a => `<td style="border:1px solid #000;padding:4px 8px;font-size:8pt;font-weight:bold;vertical-align:top"><b>${esc(a.role)}:</b></td>`).join('')}${pad}</tr>
      <tr>${row.map((a, i) => sigCell(a, ri * SIG_PER_ROW + i)).join('')}${pad}</tr>
    </table>`;
    }).join('');

    /* Manpower &#8212; skip zero-rate rows */
    const mpActive = mp.filter(r=>N(r.rate)>0||String(r.role||'').trim());
    const shiftKeys = [...new Set(mpActive.map(r=>r.shift||'straight'))];
    const shiftRows = shiftKeys.map(sk=>{
      const rows=mpActive.filter(r=>(r.shift||'straight')===sk);
      if(!rows.length)return'';
      const info2=SHIFTS[sk];const mult=ceShiftMult(rr, sk);const _otM=ceOtMult(rr);
      const subA=rows.reduce((s,r)=>s+N(r.pax)*N(r.days)*N(r.rate)*mult,0);
      const subB=rows.reduce((s,r)=>s+N(r.pax)*N(r.days)*(N(r.otHours)/8)*N(r.rate)*_otM*mult,0);
      return`<div class="sub">${info2?.label||sk.toUpperCase()}</div>
      <table><tr style="background:#eee"><th class="c" style="width:28px">ITEM</th><th>MANPOWER LOADING</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:30px">UOM</th><th class="c" style="width:36px">DAYS</th><th class="r" style="width:60px">RATE/DAY</th><th class="r" style="width:70px">SUBTOTAL</th><th class="c" style="width:34px">OT HRS/DAY</th><th class="c" style="width:30px">AOT</th><th class="r" style="width:55px">RATE OT</th><th class="r" style="width:70px">TOTAL</th></tr>
      ${rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.role||'')}</td><td class="c">${esc(r.pax||1)}</td><td class="c">pax</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.rate)}</td><td class="r">${fmt(N(r.pax)*N(r.days)*N(r.rate)*mult)}</td>${/* AOT is the ACCUMULATED overtime on the printed form: the reader multiplies
      this column by RATE OT. otHours is now per day, so the total is what
      belongs here -- printing the per-day figure would understate the row
      against its own TOTAL column. */''}<td class="c">${esc(N(r.otHours)||0)}</td><td class="c">${esc(N(r.otHours)*N(r.days)||0)}</td><td class="r">${fmt(N(r.rate)/8*_otM*mult)}</td><td class="r b">${fmt(N(r.pax)*N(r.days)*N(r.rate)*mult+N(r.pax)*N(r.days)*(N(r.otHours)/8)*N(r.rate)*_otM*mult)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2" class="r b">SUB TOTAL:</td><td class="c b">${esc(rows.reduce((s,r)=>s+N(r.pax),0))}</td><td colspan="7"></td><td class="r b">${fmt(subA+subB)}</td></tr></table>`;
    }).join('');

    /* Benefits &#8212; the same rows the Manpower tab shows */
    const benPage=benefitRows.length?`<div class="blk">
      <div class="sec">C.7 &nbsp;BENEFITS AND OTHERS</div>
      <table><tr style="background:#eee"><th class="c">ITEM</th><th>MANPOWER LOADING</th><th class="c">QTY</th><th class="c">UOM</th><th class="c">TOTAL DAYS</th><th class="r">MONTHLY RATE</th><th class="r">13TH PAY</th><th class="r">SSS</th><th class="r">HDMF&amp;PHIC</th><th class="r">SIL</th><th class="r">ECC</th>${incOn?'<th class="r">INCENTIVE</th>':''}<th class="r">TOTAL</th></tr>
      ${benefitRows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.role||'')}</td><td class="c">${esc(r.pax)}</td><td class="c">pax</td><td class="c">${esc(r.days)}</td><td class="r">${fmt(r.monthlyRate)}</td><td class="r">${fmt(r.thirteenth)}</td><td class="r">${fmt(r.sss)}</td><td class="r">${fmt(r.hdmf)}</td><td class="r">${fmt(r.sil-(r.ecc||0))}</td><td class="r">${fmt(r.ecc||0)}</td>${incOn?`<td class="r">${fmt(r.perdiem)}</td>`:''}<td class="r b">${fmt(r.total)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2" class="r b">TOTAL MANPOWER:</td><td class="c b">${esc(benefitRows.reduce((t,r)=>t+N(r.pax),0))}</td><td colspan="${incOn?9:8}" class="r b">BENEFITS &amp; OTHERS SUB TOTAL:</td><td class="r b">${fmt(benefitsT)}</td></tr>
      <tr class="tot"><td colspan="${incOn?12:11}" class="r b">TOTAL MANPOWER COST (C.1-C.7):</td><td class="r b">${fmt(mpTot)}</td></tr></table></div>` : '';

    /* Tools &#8212; skip zero rows */
    const toolsActive=tools.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const toolsPage=toolsActive.length?`<div class="blk">
      <div class="sec">BILL OF TOOLS AND EQUIPMENT</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:35px">UOM</th><th class="c" style="width:52px">BASIS</th>${powerOn?'<th class="r" style="width:64px">POWER</th>':''}<th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${toolsActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="c">${esc(toolBasis(r))}</td>${powerOn?`<td class="r">${(toolPowerCost(r, kwhRate) * pwrFrac(r))>0?fmt((toolPowerCost(r, kwhRate) * pwrFrac(r))):'&#8212;'}</td>`:''}<td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(toolRowTotal(r, kwhRate, undefined, pwrFrac(r)))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="${powerOn?7:6}" class="r b">TOTAL:</td><td class="r b">${fmt(toolsT)}</td></tr></table></div>` : '';

    /* Materials &#8212; skip zero rows */
    const matsActive=mats.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const matsPage=matsActive.length?`<div class="blk">
      <div class="sec">BILL OF MATERIALS AND CONSUMABLES</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${matsActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.cost))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r b">TOTAL:</td><td class="r b">${fmt(matsT)}</td></tr></table></div>` : '';

    /* PPE &#8212; skip zero rows */
    const ppeActive=ppe.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const ppePage=ppeActive.length?`<div class="blk">
      <div class="sec">PERSONAL PROTECTIVE EQUIPMENTS</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${ppeActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.cost))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r b">TOTAL:</td><td class="r b">${fmt(ppeT)}</td></tr></table></div>` : '';

    /* Miscellaneous &#8212; grouped by category, one row per entry.

       Labour, tools, materials, PPE and the scope each print their own bill
       page; Miscellaneous never did. Its cost reached the summary and the
       total, but a delivery charge or a third-party fee had no line anywhere
       in the document saying what the client was being charged for. */
    /* The Miscellaneous page itemises the rows under each category, which
       it does whichever summary layout the CE prints. */
    const miscItems = miscCosted;
    const miscPage=miscItems.length?`<div class="blk">
      <div class="sec">MISCELLANEOUS</div>
      ${miscItems.map(cat=>`<div class="sub">${cat.letter}&nbsp;&nbsp;${esc(cat.label)}</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="c" style="width:36px">NO. OF DAYS</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${cat.rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="c">${esc(N(r.days)||1)}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(miscRowCost(r))}</td></tr>${(Array.isArray(r.parts)?r.parts:[]).map(p=>`<tr style="font-size:7pt;color:#555"><td></td><td style="padding-left:14px">&#8211; ${esc(p.label)}</td><td class="c">${esc(N(p.qty))}</td><td></td><td class="c">${esc(N(p.days))}</td><td></td><td class="r">${fmt(N(r.cost)*N(p.qty)*N(p.days))}</td></tr>`).join('')}`).join('')}
      <tr class="tot"><td colspan="6" class="r b">SUB TOTAL:</td><td class="r b">${fmt(cat.v)}</td></tr></table>`).join('')}
      <div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">MISCELLANEOUS TOTAL: ${fmt(miscT)}</div></div>` : '';

    /* The summary and the scope of work each get a sheet of their own; the
       bills share whatever space is left.

       Every bill used to be its own `page-break` page, so a CE with three
       plywood lines and one delivery charge spent a whole sheet per section
       and printed mostly white space. They are `blk` blocks now: they flow one
       after another and break only when the paper actually runs out, with
       page-break-inside:avoid so a short bill is not split across that break.
       The document header prints once for the run rather than per section --
       each bill still carries its own black title bar. */
    const mpPage=mpActive.length?`<div class="blk"><div class="sec">MANPOWER COST</div>${shiftRows}<div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">TOTAL MANPOWER COST: ${fmt(mpTot)}</div></div>`:'';
    /* Mobilization and demobilization -- costed into the total but never
       printed, so the client saw a charge with no line saying what it was. */
    const mobRows=(rows)=>(rows||[]).filter(r=>String(r.desc||'').trim()||N(r.rate)>0);
    const _otMm=ceOtMult(rr);
    const mobMpTable=(rows)=>{const m=rows.filter(r=>r.kind==='mp');return m.length?`<table><tr style="background:#eee"><th class="c" style="width:28px">ITEM</th><th>MANPOWER LOADING</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:32px">UOM</th><th class="c" style="width:36px">NO. OF DAYS</th><th class="r" style="width:60px">RATE PER DAY</th><th class="r" style="width:66px">SUB-TOTAL A</th><th class="c" style="width:36px">OT HRS PER DAY</th><th class="r" style="width:55px">RATE OT/HR</th><th class="r" style="width:62px">SUB-TOTAL B</th><th class="r" style="width:70px">TOTAL</th></tr>
      ${m.map((r,i)=>{const a=N(r.qty)*N(r.days)*N(r.rate),b=mobRowCost(r,rr)-a;return`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">PAX/S</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.rate||0)}</td><td class="r">${fmt(a)}</td><td class="c">${esc(N(r.otHours))}</td><td class="r">${fmt(N(r.rate)/8*_otMm)}</td><td class="r">${fmt(b)}</td><td class="r b">${fmt(a+b)}</td></tr>`;}).join('')}
      <tr class="tot"><td colspan="2" class="r b">SUB TOTAL:</td><td class="c b">${esc(m.reduce((s,r)=>s+N(r.qty),0))}</td><td colspan="7"></td><td class="r b">${fmt(m.reduce((s,r)=>s+mobRowCost(r,rr),0))}</td></tr></table>`:'';};
    const mobTable=(label,all,tot)=>{const rows=all.filter(r=>r.kind!=='mp');return all.length?`<div class="sub">${label}</div>${mobMpTable(all)}${rows.length?`
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:36px">DAYS</th><th class="r" style="width:80px">RATE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.rate||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.days)*N(r.rate))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r b">SUB TOTAL:</td><td class="r b">${fmt(rows.reduce((s,r)=>s+mobRowCost(r,rr),0))}</td></tr></table>`:''}<div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">${label} TOTAL: ${fmt(tot)}</div>`:'';};
    const _mobR=mobRows(mobVehicles),_demobR=mobRows(demobVehicles);
    const mobPage=(_mobR.length||_demobR.length)?`<div class="blk">
      <div class="sec">MOBILIZATION / DEMOBILIZATION</div>
      ${mobTable('MOBILIZATION',_mobR,mobVehiclesT)}${mobTable('DEMOBILIZATION',_demobR,demobVehiclesT)}
      <div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">MOBILIZATION / DEMOBILIZATION TOTAL: ${fmt(mobVehiclesT+demobVehiclesT)}</div></div>`:'';
    const bills=[mobPage,mpPage,benPage,toolsPage,matsPage,ppePage,miscPage].filter(Boolean).join('');
    const billsPage=bills?`<div class="page page-break">${docHdr('BILL OF QUANTITIES')}${bills}</div>`:'';

    const sowPage=sowItems.length?`<div class="page page-break">${docHdr('SCOPE OF WORK')}<div style="font-size:8pt;line-height:1.6">${(()=>{let mc=0,sc=0;return sowItems.map(it=>{if(it.type==='main'){mc++;sc=0;return`<div style="margin-top:4px"><b>${mc}. ${esc(it.text)}</b></div>`;}else{sc++;return`<div style="margin-left:14px">${mc}.${sc} ${esc(it.text)}</div>`;}}).join('');})()}</div></div>`:'';

    const runHdr = `<div class="run-hdr">${docTop}</div>`;
    const runFtr = `<div class="run-ftr"><span>Document No.: ${esc(co.doc)} Rev. ${esc(co.revNo)}</span><span class="pnum"></span></div>`;
    /* Laid out here, not by the browser: only by measuring can a header and a
       footer sit on every page without crossing the rows, and only by counting
       the sheets can a footer say "of 12". */
    const paginator = `(function(){
      var HDR = ${JSON.stringify(runHdr)}, FTR = ${JSON.stringify(runFtr)};
      function sheet(){
        var d = document.createElement('div'); d.className = 'sheet';
        d.innerHTML = HDR + '<div class="sbody"></div>' + FTR;
        document.getElementById('out').appendChild(d); return d;
      }
      function run(){
        var src = document.getElementById('doc'), out = document.getElementById('out');
        if (!src || !out) return;
        src.style.display = '';
        var sections = [].slice.call(src.children);
        var sh = null, body = null, avail = 0;
        function fresh(){ sh = sheet(); body = sh.querySelector('.sbody'); avail = body.clientHeight; }
        /* What is measured is the bottom of the content, not scrollHeight:
           scrollHeight is a whole number and never reports less than the box
           itself, so it can neither see a row overflowing by half a line nor
           be asked for any room in hand -- "avail - 1" against it fits
           nothing at all, one row to a sheet, for ever.
           The room in hand is what a printer needs. A sheet filled to its
           last pixel on screen is a sheet whose final row a printer's own
           rounding of 297mm pushes under the footer, which is a row sliced
           in half at the foot of a page. GAP is about a millimetre. */
        var GAP = 4;
        function fits(){
          var last = body.lastElementChild;
          if (!last) return true;
          return last.getBoundingClientRect().bottom - body.getBoundingClientRect().top <= avail - GAP;
        }
        function put(el){
          body.appendChild(el);
          if (fits()) return;
          var tall = el.offsetHeight > avail;
          /* Taller than a whole sheet however it is placed, so it is cut here
             rather than moved: moving it left the heading above it alone on a
             page of its own with the table starting on the next one. */
          if (el.tagName === 'TABLE') {
            if (tall || body.children.length === 1) { split(el); return; }
            /* A table moved to the next sheet takes its heading with it, or
               the heading is left alone at the foot of the page it came
               from, announcing a table that is not there. */
            body.removeChild(el);
            var lead = body.lastElementChild;
            var carry = (lead && lead.tagName !== 'TABLE' && body.children.length > 1) ? lead : null;
            if (carry) body.removeChild(carry);
            fresh();
            if (carry) body.appendChild(carry);
            put(el);
            return;
          }
          /* A bill of quantities is a wrapper holding a heading and its table,
             and a wrapper is not a table, so nothing cut it: one taller than a
             sheet was laid down whole and everything past the foot of that
             page was swallowed by the sheet's own overflow -- 281 tools
             printed as 63, with nothing to say the rest had gone. Taken apart,
             its heading and its table are each placed on their own terms, and
             the table is cut between its rows like any other. */
          if (tall && el.children.length) {
            body.removeChild(el);
            [].slice.call(el.children).forEach(put);
            return;
          }
          /* Alone on a sheet and still too big: nothing is gained by moving
             it, and it must not be dropped. */
          if (body.children.length === 1) return;
          body.removeChild(el); fresh(); put(el);
        }
        /* A table taller than a page is cut between its rows, and its first
           row -- the column headings -- repeats on the sheet after it. */
        function split(tbl){
          if (tbl.tagName !== 'TABLE') return;
          body.removeChild(tbl);
          var rows = [].slice.call(tbl.rows), head = rows.length ? rows[0].cloneNode(true) : null, i = 0;
          while (i < rows.length) {
            var part = tbl.cloneNode(false), tb = document.createElement('tbody');
            part.appendChild(tb); body.appendChild(part);
            if (i && head) tb.appendChild(head.cloneNode(true));
            var placed = 0;
            while (i < rows.length) {
              tb.appendChild(rows[i]);
              if (!fits() && placed) { tb.removeChild(rows[i]); break; }
              i++; placed++;
            }
            if (i < rows.length) fresh();
          }
        }
        fresh();
        sections.forEach(function(sec, si){
          if (si) fresh();
          [].slice.call(sec.children).forEach(put);
        });
        src.parentNode.removeChild(src);
        var sheets = out.children, n = sheets.length;
        for (var p = 0; p < n; p++) {
          var t = sheets[p].querySelector('.pnum');
          if (t) t.textContent = 'Page ' + (p + 1) + ' of ' + n;
        }
        document.body.setAttribute('data-paged', '1');
      }
      /* Not before the images are in. The running header carries the company
         logo, and a logo that has not loaded measures as nothing: every sheet
         was given the height of a header without it, and when it arrived the
         header grew and pushed the last row of each page under the footer --
         which is what a row sliced in half at the foot of a page was. */
      var ran = false;
      function go(){ if (ran) return; ran = true; run(); }
      function whenLoaded(){
        var imgs = [].slice.call(document.images).filter(function(i){ return !i.complete; });
        if (!imgs.length) return go();
        var left = imgs.length;
        function one(){ if (--left <= 0) go(); }
        imgs.forEach(function(i){ i.addEventListener('load', one); i.addEventListener('error', one); });
        /* A logo that never arrives must not leave the CE blank. */
        setTimeout(go, 4000);
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenLoaded); else whenLoaded();
    })();`;
    /* Save as PDF offers the document title as the file name, so name it the
       way the file is filed: the CE number and what the job is. Anything a
       file name cannot hold is dropped. */
    const _jobTitle = String((openCeId != null ? (monData[openCeId] || {}).jobTitle : '') || info.description || '').trim();
    const printName = ceFileName(info.ceNum, _jobTitle);
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(printName)}<\/title><style>${pageStyle}<\/style><\/head><body>
      <div id="doc" style="display:none">
      <div class="page">
        ${docHdr('COST ESTIMATE SUMMARY')}
        ${infoTable}
        ${costTable}
        ${notesList}
        ${sigBlock}
      </div>
      ${sowPage}
      ${billsPage}
      </div><div id="out"></div>
      <script>${paginator}</script>
    <\/body><\/html>`;
    /* View from CE Monitoring: this copy of the app runs inside that frame
       only to draw the CE, so it swaps itself for the document -- which also
       stops it, leaving nothing running that could autosave. */
    /* Preview wants the document, not a print window. */
    if (opt && opt.htmlOnly) { window.__lastCEHtml = fullHtml; return fullHtml; }
    if (opt && opt.embed && window !== window.top) {
      document.open(); document.write(fullHtml); document.close();
      return;
    }
    const w=window.open('','_blank');
    w.document.write(fullHtml);
    w.document.close();
    /* Print when the sheets are laid out, not 800ms in: the paginator now
       waits for the logo, and printing before it finished would print the
       document unpaginated. */
    (function _waitThenPrint(n){
      try {
        if (w.closed) return;
        if ((w.document.body && w.document.body.getAttribute('data-paged')) || n > 40) { w.print(); return; }
      } catch (_e) { return; }
      setTimeout(() => _waitThenPrint(n + 1), 150);
    })(0);
    window.__lastCEHtml = fullHtml;
  };
  /* Feature 1: Print Preview (no auto-print) */
  const handlePrintPreview = () => {
    /* The document only. This used to call Generate CE outright -- which opened
       its own window and print dialog -- and then a second window on top, so
       Preview and Generate CE looked like the same button. */
    const w = window.open('','_blank');
    if (!w) { showToast('Allow pop-ups for this site to preview the CE.', true); return; }
    {
      const html = handleGenerateCE({ htmlOnly: true });
      if (!html) { w.close(); return; }
      const previewHtml = html.replace('</body>', `<div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;z-index:9999;font-family:sans-serif;font-size:13px"><b>👁 CE Preview</b><button onclick="window.print()" style="background:#F0A429;color:#000;border:none;padding:5px 14px;border-radius:4px;font-weight:700;cursor:pointer">🖨 Print</button><button onclick="window.close()" style="background:#333;color:#fff;border:1px solid #555;padding:5px 14px;border-radius:4px;cursor:pointer">✕ Close</button><span style="margin-left:auto;color:#aaa;font-size:11px">Use Ctrl+P to print</span></div></body>`);
      /* No extra page margin: each sheet carries its own, and adding one here
         pushed every page down and split the last line onto a page of its own. */
      w.document.write(previewHtml);
      w.document.close();
    }
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
  /* Export the CE to Excel as the same document the printer produces: one
     worksheet per printed page, in the same order, with the same section
     headings, the same columns and the same totals.

     It used to be a data dump -- a flat sheet per resource type with generic
     headers -- which was fine for re-importing figures and useless to anyone
     expecting the CE. Numbers are written as NUMBERS with a peso format, not
     as pre-formatted text, so the recipient can still total a column.

     HONEST LIMIT: the bundled SheetJS is the community build, which ignores
     cell styling on write. Layout, merges, column widths and number formats
     survive; bold text, the black header bars and cell borders do not. */
  const handleExportXLSX = () => {
    /* Written through SHICXlsx rather than SheetJS: the vendored build reads
       cell styles but cannot write them, so this workbook used to come out as
       unformatted text. The content was already right -- one sheet per printed
       page -- but sales could not work with a wall of plain cells. */
    const sheets = [];
    /* Resolved exactly as the printed CE does, so the two headers agree. */
    const _cos = getCompanies();
    const coI = _cos.find(c => String(c.id) === String(info.companyId)) || _cos[0] || {};
    const co = {
      name: coI.name || 'SYNERCORE', sub: coI.sub || 'HEAVY INDUSTRIES CORP.',
      doc: coI.docNo || coI.doc || 'SHIC-F-TSG025', revNo: coI.revNo || '0', revDate: coI.revDate || ''
    };
    const shiftLabel = k => (SHIFTS[k] && SHIFTS[k].label) || k;

    /* Build one sheet. A cell is a plain value or {v, n:true} for money.

       Table rows are bordered, headers are shaded and totals are boxed --
       worked out from position rather than declared per cell: `head` opens a
       table, `total` and `blank` close it, and every `row` in between is a
       body row. That is the shape every bill on the printed form already has,
       so no call site has to describe its own formatting twice. */
    const sheet = (name, build) => {
      const rows = [], merges = [];
      let inTable = false, width = 0;
      const cell = (c, bodyStyle) => {
        if (c === undefined || c === null) return null;
        if (typeof c === 'object' && 'v' in c) return { v: c.v, s: c.n ? (bodyStyle ? 'tdn' : 'valn') : bodyStyle || 'val' };
        if (!bodyStyle) return { v: c, s: 'val' };
        if (bodyStyle === 'label') return { v: c, s: 'label' };
        return { v: c, s: typeof c === 'number' ? 'tdc' : 'td' };
      };
      const api = {
        row: (...cells) => {
          /* Outside a table the first cell is the label of a label/value pair;
             inside one, every cell is a bordered body cell. */
          rows.push(cells.map((c, i) => cell(c, inTable ? 'body' : (i === 0 ? 'label' : null))));
          return rows.length - 1;
        },
        /* A table header. Opens the bordered run beneath it. */
        head: (...cells) => {
          inTable = true;
          width = cells.length;
          rows.push(cells.map(c => ({ v: c === undefined ? '' : c, s: 'th' })));
        },
        /* A total or sub-total line. Closes the run.

           Laid out as the printed CE lays it: the amount under the table's
           last column and the label right-aligned against it. Call sites wrote
           fewer cells than their table had columns, which put the Shopworks
           tools total and the manpower cost total a column short. */
        total: (...cells) => {
          inTable = false;
          const isAmt = c => c && typeof c === 'object' && 'v' in c;
          const out = cells.slice();
          if (out.length < width && isAmt(out[out.length - 1]))
            out.splice(out.length - 1, 0, ...Array(width - out.length).fill(''));
          const row = out.map(c => isAmt(c) ? { v: c.v, s: 'tot' } : { v: c === undefined ? '' : c, s: 'totlbl' });
          /* A label followed only by blanks spans them, so it reads beside the amount. */
          const last = row.length - 1;
          let li = last - 1;
          while (li > 0 && row[li].v === '') li--;
          if (li > 0 && li < last - 1 && typeof row[li].v === 'string' && isAmt(out[last])) {
            row[li].span = last - 1 - li;
            for (let k = li + 1; k < last; k++) row[k] = { v: '', s: 'totlbl' };
          }
          rows.push(row);
        },
        blank: () => { inTable = false; rows.push([]); },
        /* A full-width heading over `span` columns, like the black bars on the
           printed form. */
        title: (text, span) => {
          inTable = false;
          rows.push([{ v: text, s: 'secbar', span: span > 1 ? span - 1 : 0 }]);
        },
        money: v => ({ v: Math.round(N(v) * 100) / 100, n: true })
      };
      build(api);
      const widest = rows.reduce((m, r) => Math.max(m, r.length), 0);
      sheets.push({
        name: name,
        cols: Array.from({ length: widest }, (_, i) => i === 1 ? 42 : i === 0 ? 7 : 13),
        merges: merges,
        rows: rows
      });
    };

    /* The document header that tops every printed page. */
    const docHead = (a, title, span) => {
      a.row({ v: co.name + ' — ' + co.sub }, '', '', 'Document No.:', co.doc);
      a.row({ v: 'COST ESTIMATE SUMMARY' }, '', '', 'Revision No.:', co.revNo);
      a.row('', '', '', 'Revision Date:', co.revDate);
      a.title(title, span);
      a.row('CE No.:', info.ceNum || '', 'CE TYPE:', ceTypeLabel(ceType).toUpperCase(), 'DATE:', info.date || '');
      a.blank();
    };

    /* ── Page 1: cost estimate summary ── */
    sheet('CE Summary', a => {
      docHead(a, 'COST ESTIMATE SUMMARY', 7);
      a.row('PROJECT DESCRIPTION:', info.description || '');
      /* A material spec runs to a line of its own -- "A217 Gr. C12A with
         Co-Cr-Mo-Ni & ASTM A335 P91" does not sit in half a row -- and it
         belongs next to the description it qualifies. */
      if (info.material) a.row('MATERIAL:', info.material);
      a.row('CLIENT NAME:', info.client || '', '', 'CLIENT LOCATION:', info.location || '');
      a.row('ATTENTION:', info.attention || 'SALES DEPARTMENT', '', 'QUANTITY:', (info.qty || 1) + ' ' + qtyUom);
      a.row('END USER:', info.endUser || 'C/O SALES', '', 'NO. OF DAYS:', (info.days || '') + ' DAYS');
      a.row('DISCIPLINE:', info.projType || '', '', 'STATUS:', docStatus);
      a.blank();
      a.head('ITEM', 'DESCRIPTION', 'TOTAL COST');
      /* Itemised the same way the printed CE and the workbook itemise it, so
         a CE read in a message and the same CE read on paper agree. */
      ceSections.filter(x => x.v > 0).forEach(x => {
        const kids = ceBreakdown[x.printLabel];
        a.row(x.letter, x.label, kids && !ceLayout.parentCarries ? '' : a.money(x.v));
        if (kids) kids.forEach(k => a.row('', (ceLayout.parentCarries ? '   of which ' : '   ') + k.letter + '. ' + k.label, a.money(k.v)));
      });
      a.blank();
      a.total('', 'TOTAL AMOUNT:', a.money(grand));
      if (showUnitP) a.total('', unitLbl, a.money(unitP));
      if (showUnitP && perJobT) a.total('', perJobLbl, a.money(perJobT));
      if (margin !== 0) a.total('', 'SELLING PRICE (' + (margin > 0 ? '+' : '') + margin + '% margin):', a.money(grand * (1 + margin / 100)));
      /* The workbook has always headed these; the printed CE and this one
         did not, so two bold figures appeared under TOTAL AMOUNT, in the
         same column, with nothing to say they were already inside it. */
      if (hlRows.length) a.title('HIGHLIGHTED COSTS (already included above)', 3);
      hlRows.forEach(r => a.total('', String(hlLabel(r)).toUpperCase() + ':', a.money(hlAmt(r))));
      if (servicesSummary.on && servicesSummary.ok) {
        a.blank();
        a.title('SERVICES', 3);
        servicesSummary.lines.forEach(l => a.row('', l.label.toUpperCase() + ':', a.money(l.v)));
        if (Math.abs(servicesSummary.other) >= 0.005) a.row('', 'OTHER MISC. TO THE PROJECT:', a.money(servicesSummary.other));
        a.total('', 'SERVICES TOTAL AMOUNT:', a.money(servicesSummary.total));
      }
      /* Notes, including the breakdown notes, exactly as the CE prints them. */
      const sowNotes = (sowItems || []).filter(x => String(x.note || '').trim());
      if (notes.length || sowNotes.length) {
        a.blank();
        a.title('NOTE', 3);
        notes.forEach((n, i) => a.row(i + 1, n.text || ''));
        sowNotes.forEach((x, i) => a.row(notes.length + i + 1, 'Scope ' + (sowLabels[x.id] || '') + ' — ' + String(x.note).trim()));
      }
      if (approvers && approvers.length) {
        a.blank();
        a.title('SIGNATORIES', 3);
        approvers.forEach(ap => a.row(ap.role || '', ap.name || '', ap.title || ''));
      }
    });

    /* ── Page 2: manpower loading, one block per shift ── */
    /* ── Mobilization / demobilization, manpower then expenses, per stage ── */
    const _mobL = rows => (rows || []).filter(r => String(r.desc || '').trim() || N(r.rate) > 0);
    if (cfg.mobDemob && (_mobL(mobVehicles).length || _mobL(demobVehicles).length)) sheet('Mobilization', a => {
      docHead(a, 'MOBILIZATION / DEMOBILIZATION', 11);
      [['MOBILIZATION', mobVehicles, mobVehiclesT], ['DEMOBILIZATION', demobVehicles, demobVehiclesT]].forEach(([lbl, all, tot]) => {
        const list = _mobL(all);
        if (!list.length) return;
        const crew = list.filter(r => r.kind === 'mp'), exp = list.filter(r => r.kind !== 'mp');
        a.title(lbl, 11);
        if (crew.length) {
          a.head('ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'NO. OF DAYS', 'RATE PER DAY', 'SUB-TOTAL A', 'OT HRS PER DAY', 'RATE OT/HR', 'SUB-TOTAL B', 'TOTAL');
          crew.forEach((r, i) => {
            const base = N(r.qty) * N(r.days) * N(r.rate), all2 = mobRowCost(r, rr);
            a.row(i + 1, r.desc || '', N(r.qty), 'PAX/S', N(r.days), a.money(r.rate), a.money(base), N(r.otHours),
              a.money(N(r.rate) / 8 * ceOtMult(rr)), a.money(all2 - base), a.money(all2));
          });
          a.total('', 'SUB TOTAL:', crew.reduce((t, r) => t + N(r.qty), 0), '', '', '', '', '', '', '', a.money(crew.reduce((t, r) => t + mobRowCost(r, rr), 0)));
          a.blank();
        }
        if (exp.length) {
          a.head('ITEM', 'DESCRIPTION', 'QTY', 'DAYS', 'RATE', 'TOTAL');
          exp.forEach((r, i) => a.row(i + 1, r.desc || '', N(r.qty), N(r.days), a.money(r.rate), a.money(mobRowCost(r, rr))));
          a.total('', 'SUB TOTAL:', '', '', '', a.money(exp.reduce((t, r) => t + mobRowCost(r, rr), 0)));
          a.blank();
        }
        a.total('', lbl + ' TOTAL:', '', '', '', a.money(tot));
        a.blank();
      });
    });

    const mpActive = mp.filter(r => r.role && (N(r.rate) > 0 || N(r.pax) > 0));
    if (mpActive.length) sheet('Manpower', a => {
      docHead(a, 'BILL OF MANPOWER LOADING', 11);
      [...new Set(mpActive.map(r => r.shift || 'regular_day'))].forEach(sk => {
        const rows = mpActive.filter(r => (r.shift || 'regular_day') === sk);
        const mult = ceShiftMult(rr, sk);
        a.title(shiftLabel(sk), 11);
        a.head('ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'DAYS', 'RATE/DAY', 'SUBTOTAL', 'OT HRS/DAY', 'AOT', 'RATE OT', 'TOTAL');
        let subA = 0, subB = 0;
        rows.forEach((r, i) => {
          const {reg: base, ot} = mpWageParts(r);
          subA += base; subB += ot;
          a.row(i + 1, r.role || '', N(r.pax), 'pax', N(r.days), a.money(r.rate),
            a.money(base), N(r.otHours), N(r.otHours) * N(r.days), a.money(N(r.rate) / 8 * ceOtMult(rr) * mult), a.money(base + ot));
        });
        a.total('', 'SUB TOTAL:', rows.reduce((t, r) => t + N(r.pax), 0), '', '', '', '', '', '', a.money(subA + subB));
        a.blank();
      });
      /* Benefits table, matching section C.7 on the printed form. */
      if (benefitRows.length) {
        a.title('BENEFITS AND OTHERS', 12);
        const _inc = incOn ? ['INCENTIVE'] : [];
        a.head('ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'TOTAL DAYS', 'MONTHLY RATE', '13TH PAY', 'SSS', 'HDMF & PHIC', 'SIL', 'ECC', ..._inc, 'TOTAL');
        benefitRows.forEach((r, i) => a.row(i + 1, r.role, r.pax, 'pax', r.days, a.money(r.monthlyRate),
          a.money(r.thirteenth), a.money(r.sss), a.money(r.hdmf), a.money(r.sil - (r.ecc || 0)), a.money(r.ecc || 0), ...(incOn ? [a.money(r.perdiem)] : []), a.money(r.total)));
        a.total('', 'TOTAL MANPOWER:', benefitRows.reduce((t, r) => t + N(r.pax), 0), '', '', '', '', '', '', '', ...(incOn ? [''] : []), 'SUB TOTAL:', a.money(benefitsT));
      }
      a.blank();
      a.total('', 'MANPOWER COST TOTAL:', '', '', '', '', '', '', '', a.money(mpTot));
    });

    /* ── Resource pages, each mirroring its printed bill ── */
    const bill = (name, heading, rows, withDays, total) => {
      if (!rows.length) return;
      sheet(name, a => {
        /* withDays is only ever true for tools, which is the one bill whose
           rows can be charged per project or by the hour. POWER joins it on
           shopworks, where the shop's own electricity is part of the cost. */
        const pwrCol = withDays && powerOn;
        docHead(a, heading, (withDays ? 7 : 6) + (pwrCol ? 1 : 0));
        a.head('ITEM', 'DESCRIPTION', 'QTY', 'UOM', ...(withDays ? ['BASIS'] : []),
          ...(pwrCol ? ['POWER'] : []), 'UNIT PRICE', 'TOTAL');
        rows.forEach((r, i) => {
          a.row(i + 1, r.desc || '', N(r.qty), r.uom || 'Lot', ...(withDays ? [toolBasis(r)] : []),
            ...(pwrCol ? [a.money((toolPowerCost(r, kwhRate) * pwrFrac(r)))] : []),
            a.money(r.cost), a.money(withDays ? toolRowTotal(r, kwhRate, undefined, pwrFrac(r)) : N(r.qty) * N(r.cost)));
        });
        a.blank();
        a.total('', 'TOTAL:', '', '', ...(withDays ? [''] : []), '', a.money(total));
      });
    };
    bill('Tools & Equipment', 'BILL OF TOOLS AND EQUIPMENT', tools.filter(r => r.desc), true, toolsT);
    bill('Materials', 'BILL OF MATERIALS AND CONSUMABLES', mats.filter(r => r.desc), false, matsT);
    bill('PPE', 'PERSONAL PROTECTIVE EQUIPMENTS', ppe.filter(r => r.desc), false, ppeT);

    /* ── Miscellaneous, grouped by its categories ── */
    const miscCatsX = (MISC_DEF[ceType] || MISC_DEF.onsite);
    const miscAny = miscCatsX.some(([k]) => (Array.isArray(misc[k]) ? misc[k] : []).some(r => r.desc));
    if (miscAny) sheet('Miscellaneous', a => {
      docHead(a, 'MISCELLANEOUS', 7);
      miscCatsX.forEach(([k, label]) => {
        const rows = (Array.isArray(misc[k]) ? misc[k] : []).filter(r => r.desc);
        if (!rows.length) return;
        a.title(label, 7);
        a.head('ITEM', 'DESCRIPTION', 'QTY', 'UOM', 'NO. OF DAYS', 'UNIT PRICE', 'TOTAL');
        rows.forEach((r, i) => {
          a.row(i + 1, r.desc, N(r.qty), r.uom || 'Lot', N(r.days) || 1, a.money(r.cost), a.money(miscRowCost(r)));
          (Array.isArray(r.parts) ? r.parts : []).forEach(p => a.row('', '    - ' + p.label, N(p.qty), '', N(p.days), '', a.money(N(r.cost) * N(p.qty) * N(p.days))));
        });
        a.total('', 'SUB TOTAL:', '', '', '', '', a.money(rows.reduce((s2, r) => s2 + miscRowCost(r), 0)));
        a.blank();
      });
      a.total('', 'MISCELLANEOUS TOTAL:', '', '', '', '', a.money(miscT));
    });

    /* ── Scope of work, numbered as the CE prints it ── */
    if ((sowItems || []).length) sheet('Scope of Work', a => {
      docHead(a, 'SCOPE OF WORK', 3);
      let mc = 0, sc = 0;
      sowItems.forEach(it => {
        if (it.type === 'main') { mc++; sc = 0; a.row(mc + '.', it.text || ''); }
        else { sc++; a.row(mc + '.' + sc, '   ' + (it.text || '')); }
      });
    });

    SHICXlsx.download((info.ceNum || 'CE') + '_' + (info.client || 'export').replace(/[^a-z0-9]/gi, '_') + '.xlsx', sheets, { bar: ceBrand(coI).bar, barText: ceBrand(coI).text });
    showToast('Exported to Excel — one sheet per page of the CE.');
  };
  const [showDraftBanner, setShowDraftBanner] = React.useState(() => hasDraft());
  /* Refreshed on every render so the auto-save timer never works from a
     stale closure. */
  _live.current = {
    saveDraft, hasUnsavedWork,
    /* Everything mkEntry persists belongs here, or an edit to it leaves the CE
       looking saved when it is not. ceType, approvers and scope were missing. */
    /* verifyNotes belongs here or the autosave never notices a note being
       typed -- the same way the margin was left out and written back as 0
       on every save. */
    sig: JSON.stringify([ceType, info, mp, tools, mats, ppe, misc, sowItems, notes, addlCosts, margin, approvers, scope, mobVehicles, demobVehicles, verifyNotes, rates])
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "shic-app-root",
    style: {
      background: BG,
      color: TX,
      minHeight: '100vh',
      fontSize: 13
    },
    onClick: () => copyMenu && setCopyMenu(null)
  }, /*#__PURE__*/React.createElement(StatusBar, { currentUser }), /*#__PURE__*/React.createElement(SPDeniedBanner, null), /*#__PURE__*/React.createElement(SyncStatusBar, null),
  bulkOn && isAdmin && /*#__PURE__*/React.createElement("div", {
    style: { background: alpha(ERR, '22'), borderBottom: `1px solid ${alpha(ERR, '55')}`, padding: '6px 16px',
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
      background: updateInfo.urgent ? alpha(ERR, '22') : '#22C55E22',
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
      color: 'var(--accent-violet)',
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
      color: 'var(--accent-violet)',
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
      color: 'var(--accent-violet)'
    }
  }, "\uD83D\uDCCB Resume Work"),/*#__PURE__*/React.createElement("span", {
    style: {
      color: MT,
      fontSize: 11,
      flex: 1
    }
  }, 'Unsaved work in progress, shared via SharePoint'),
  (() => {
    const g = draftTidyGroups();
    const tb = (t, title, on, n) => /*#__PURE__*/React.createElement("button", {
      style: {...btn('def', true), fontSize: 10, padding: '3px 8px', opacity: (n && !draftTidyBusy) ? 1 : .45},
      disabled: !n || draftTidyBusy, title, onClick: on
    }, t + ' (' + n + ')');
    return /*#__PURE__*/React.createElement("span", {style: {display: 'flex', gap: 6, marginRight: 6}},
      tb('\uD83E\uDDF9 CE saved', 'Clear the drafts whose CE has since been saved. What they hold that was never saved is lost.',
        () => tidyDrafts('saved'), g.savedCE.length),
      tb('\uD83E\uDDF9 Over 30 days', 'Clear the drafts nobody has touched in a month.',
        () => tidyDrafts('old'), g.old.length));
  })(),
  /*#__PURE__*/React.createElement("button", {
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
  }, "Nothing in progress — every CE has been saved."), sharedDrafts.map(d => {
    const age = Math.round((Date.now() - new Date(d.savedAt).getTime()) / 60000);
    const ageStr = age < 60 ? age + 'm ago' : age < 1440 ? Math.round(age / 60) + 'h ago' : Math.round(age / 1440) + 'd ago';
    const isOwn = d.savedBy === currentUser.username;
    /* A draft of a CE that has since been saved, and written after that save:
       it is newer than the saved copy, so it is kept -- but say so, or nobody
       can tell it from work that was never saved at all. */
    const _savedCE = (history || []).some(h => String((h.info && h.info.ceNum) || h.ceNum || '').trim().toUpperCase() === String(d.info?.ceNum || '').trim().toUpperCase());
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
    }, d.info?.ceNum || '(No CE#)'), _savedCE && /*#__PURE__*/React.createElement("span", {
      title: "This CE is saved. The draft was written after that save, so it holds changes the saved CE does not.",
      style: {fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#F0A42922', color: ACC, whiteSpace: 'nowrap'}
    }, "newer than the saved CE"), /*#__PURE__*/React.createElement("span", {
      style: {
        background: isOwn ? '#8B5CF622' : '#F0A42922',
        color: isOwn ? 'var(--accent-violet)' : ACC,
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
    }, ceTypeLabel(d.ceType).toUpperCase(), " \xB7 ", (d.mp || []).length, " manpower \xB7 ", (d.tools || []).length, " tools \xB7 ", (d.mats || []).length, " materials")), /*#__PURE__*/React.createElement("div", {
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
  }, "Undo")), Picker(), showApiKey && /*#__PURE__*/React.createElement("div", {
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
        background: isSel ? alpha(p.bc, '18') : SURF,
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
        background: alpha(p.bc, '33'),
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
      height: 'var(--h-top)',
      padding: '0 16px',
      position: 'sticky',
      top: 'var(--y-top)',
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
      color: ON_ACC,
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
      background: ceType === ceKey ? alpha(ceVal.color, '1A') : 'transparent',
      color: ceType === ceKey ? ceVal.color : MT,
      border: ceType === ceKey ? `1px solid ${alpha(ceVal.color, '55')}` : '1px solid transparent',
      borderRadius: 5,
      padding: '5px 10px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontWeight: ceType === ceKey ? 700 : 400,
      fontSize: 11,
      transition: 'all .12s'
    }
  }, ceTypeLabel(ceKey)))), /*#__PURE__*/React.createElement("div", {
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
      borderColor: getApiKey() && provInfo ? alpha(provInfo.bc, '88') : alpha(ERR, '88'),
      color: getApiKey() && provInfo ? provInfo.bc : ERR
    },
    onClick: () => {
      setApiKeyInput('');
      setShowApiKey(true);
    },
    title: getApiKey() && provInfo ? provInfo.label + ' active' : 'No AI key - click to set'
  }, getApiKey() && provInfo ? 'AI: ' + provInfo.badge : 'Set AI Key'), /*#__PURE__*/React.createElement(SignInBanner, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginLeft: 'auto',
      paddingLeft: 12,
      borderLeft: `1px solid ${BDR}`
    }
  }, /*#__PURE__*/React.createElement(ThemeSwitch, null), /*#__PURE__*/React.createElement("div", {
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
  }, currentUser.role)), /*#__PURE__*/React.createElement(OnlinePill,null), /*#__PURE__*/React.createElement(ChangePasswordModal,{currentUser}), /*#__PURE__*/React.createElement("button", {style:btn('def',true),title:"Your saved signature — used when you Approve & Sign",onClick:()=>setMySigOpen(true)}, "✍ My Signature"), /*#__PURE__*/React.createElement("button", {
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
      top: 'var(--y-tabs)',
      zIndex: 49
    }
  }, TABS.map(t => {
    /* Count only rows the user actually filled in. mkMP() defaults pax to 1, so
       `r.role||r.pax` counted the blank starter row and every new CE showed a
       phantom "1" on the Manpower tab. */
    const tabCounts = {manpower: mp.filter(r=>r.role).length, tools: tools.filter(r=>r.desc).length, materials: mats.filter(r=>r.desc).length, ppe: ppe.filter(r=>r.desc).length, /* Miscellaneous is the one tab that keeps its rows in per-category lists, which is why it was the one tab with no badge -- there is no flat array to count. */ misc: Object.values(misc || {}).reduce((n, arr) => n + (Array.isArray(arr) ? arr.filter(r => r && r.desc).length : 0), 0), sowbreak: sowUnassignedCount, mywork: myTodo.total};
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
      title: t.id === 'mywork'
        ? [myTodo.sign.length ? myTodo.sign.length + ' waiting for your signature' : '', myTodo.returned.length ? myTodo.returned.length + ' returned to you' : ''].filter(Boolean).join(' · ')
        : t.id === 'sowbreak'
        ? cnt + ' resource row' + (cnt === 1 ? '' : 's') + ' not yet assigned to a scope task'
        : cnt + ' item' + (cnt === 1 ? '' : 's'),
      /* Work waiting on a person is red and never dimmed: it is not a row count. */
      style: {
        background: t.id === 'mywork' ? ERR : tab === t.id ? ACC : alpha(ACC, '44'),
        color: t.id === 'mywork' ? '#fff' : tab === t.id ? ON_ACC : ACC,
        fontSize: 9,
        fontWeight: 700,
        borderRadius: 8,
        padding: '1px 5px',
        lineHeight: 1.4
      }
    }, cnt));
  })), /*#__PURE__*/React.createElement("div", {
    className: "shic-workspace"
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
      borderColor: alpha(INFO, '44')
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
    onClick: clearAllSow
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
          background: isMain ? SURF : alpha(BG, '88'),
          borderColor: isMain ? alpha(BDR, '88') : alpha(BDR, '44')
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
      }, "v"),
      /* A main step could only ever be APPENDED. Remembering a step you left
         out of the middle of a method meant adding it at the end and clicking
         Move up until it arrived -- once per position. Both kinds insert where
         you are now; the buttons at the top still add at the end. */
      /*#__PURE__*/React.createElement("button", {
        title: "Insert a main item below this one",
        style: btn('def', true),
        onClick: () => setSowItems(p => {
          const a = [...p];
          a.splice(idx + 1, 0, {
            id: uid(),
            type: 'main',
            text: ''
          });
          return a;
        })
      }, "+1"), item.type === 'main' && /*#__PURE__*/React.createElement("button", {
        title: "Insert a sub-item below this one",
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
      }, "+a"), /*#__PURE__*/React.createElement("button", {
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
    /* A consolidated row serves several tasks, so it is listed under each of
       them -- carrying the slice of its cost that this task asked for. */
    const rows = t.rows.filter(r => rowServesTask(r, taskId));
    if (!rows.length) return null;
    const isMp = t.key === 'mp';
    const hasDays = isMp || t.key === 'tools'; /* tools are charged qty x days x cost */
    return /*#__PURE__*/React.createElement("div", { key: t.key, style: { marginBottom: 6 } },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: MT, textTransform: 'uppercase', letterSpacing: '.06em', minWidth: 128 } }, t.label),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(t, taskId, true) }, "+ Masterlist"),
        /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), fontSize: 10 }, onClick: () => addTo(t, taskId, false) }, "+ Blank"),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 10, color: MT }, title: t.label + " subtotal for this task" },
          "₱" + ph(rows.reduce((a, r) => a + rowCostForTask(t.key, r, taskId), 0)))
      ),
      /*#__PURE__*/React.createElement("datalist", { id: 'sb_ml_' + t.ml },
        ((masterlist && masterlist[t.ml]) || []).map(x => /*#__PURE__*/React.createElement("option", { key: x.id, value: x[t.nameKey] || x.desc || x.role || '' }))),
      /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 2 } },
        hdr([['Item description'], [isMp ? 'Pax' : 'Qty', 58], ...(hasDays ? [['Days', 56]] : []), ...(isMp ? [] : [['UOM', 66]]), [isMp ? 'Rate' : 'Unit cost', 92], ['Cost', 92], ['', 56]]),
        /*#__PURE__*/React.createElement("tbody", null, rows.map(r =>
          /*#__PURE__*/React.createElement("tr", { key: r.id },
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, paddingLeft: 128 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' },
                value: r[t.nameKey] || '', placeholder: "Type or pick from the Masterlist...",
                list: 'sb_ml_' + t.ml,
                /* Picking a Masterlist name brings its rate and unit, as on the resource tabs. */
                onChange: e => { const v = e.target.value;
                  const f = ((masterlist && masterlist[t.ml]) || []).find(x => (x[t.nameKey] || x.desc || x.role) === v);
                  t.set(p => p.map(x => x.id !== r.id ? x : {...x, [t.nameKey]: v, ...(f ? {[t.costKey]: N(f[t.costKey] != null ? f[t.costKey] : (f.cost != null ? f.cost : f.rate)), ...(!isMp && f.uom ? {uom: f.uom} : {}),
                    ...['unitPrice', 'serviceLife', 'projectsPerYear', 'maintPerYear', 'kw'].reduce((o, k) => { if (N(f[k]) > 0) o[k] = N(f[k]); return o; }, {})} : {})})); }
              }),
              /* One consolidated crew shown under each task it serves. Without
                 this the same row appearing in two places, at two different
                 costs, would look like a duplicate rather than a share. */
              /* The same role is on several shifts; say which one this is. */
              isMp && /*#__PURE__*/React.createElement("div", {
                className: 'sb-shift-tag',
                style: { fontSize: 9.5, color: MT, marginTop: 2 }
              }, (SHIFTS[r.shift || 'regular_day'] || {}).label || r.shift),
              rowShares(r) && /*#__PURE__*/React.createElement("div", {
                style: { fontSize: 9.5, color: INFO, marginTop: 2 },
                title: "One consolidated row costed once and split between the tasks that need it. Editing it here changes it everywhere."
              }, "shared crew across " + rowShares(r).length + " tasks · costed once at ₱" + ph(rowCost(t.key, r)))
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
            /*#__PURE__*/React.createElement("td", {
              style: { ...TDS, ...MONO, width: 92, textAlign: 'right', color: MT, fontSize: 10 },
              title: rowShares(r)
                ? "This task's share of a consolidated row costing ₱" + ph(rowCost(t.key, r)) + " in total"
                : "Row cost (recomputed)"
            }, "₱" + ph(rowCostForTask(t.key, r, taskId))),
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
    const rows = miscFlat().filter(r => rowServesTask(r, taskId));
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
      /*#__PURE__*/React.createElement("datalist", { id: 'sb_ml_misc' },
        ((masterlist && masterlist.vehicles) || []).map(x => /*#__PURE__*/React.createElement("option", { key: x.id, value: x.desc || '' }))),
      /*#__PURE__*/React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 2 } },
        hdr([['Item description'], ['Qty', 58], ['UOM', 66], ['Unit cost', 92], ['Cost', 92], ['', 56]]),
        /*#__PURE__*/React.createElement("tbody", null, rows.map(r =>
          /*#__PURE__*/React.createElement("tr", { key: r.id },
            /*#__PURE__*/React.createElement("td", { style: { ...TDS, paddingLeft: 128 } },
              /*#__PURE__*/React.createElement("input", {
                style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' },
                value: r.desc || '', placeholder: r._catLabel + " item — type or pick...",
                list: 'sb_ml_misc',
                onChange: e => { const v = e.target.value; const f = ((masterlist && masterlist.vehicles) || []).find(x => x.desc === v);
                  setMisc(p => ({ ...p, [r._cat]: (p[r._cat] || []).map(x => x.id !== r.id ? x : {...x, desc: v, ...(f ? {cost: N(f.cost != null ? f.cost : f.rate), ...(f.uom ? {uom: f.uom} : {})} : {})}) })); }
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
    /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: alpha(INFO, '44'), marginBottom: 10 } },
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

    /* Groups already typed on this CE, offered back so one service is not
       spelled three ways and printed as three lines. */
    /*#__PURE__*/React.createElement("datalist", { id: 'svc-groups' },
      [...new Set((sowItems || []).map(x => String(x.group || '').trim()).filter(Boolean))].map(g => /*#__PURE__*/React.createElement("option", { key: g, value: g }))),
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
        style: { ...CS, marginBottom: 8, borderColor: rollN ? alpha(OK, '33') : BDR, marginLeft: it.type === 'sub' ? 18 : 0, padding: open ? undefined : '8px 12px' }
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
          /* The service this item is restated under on the CE's services
             summary. Main items only: a sub-item goes where its parent goes. */
          it.type === 'main' && /*#__PURE__*/React.createElement("input", {
            list: 'svc-groups',
            style: { ...INP, width: 170, fontSize: 10.5, padding: '2px 6px' },
            value: it.group || '',
            placeholder: "Service group…",
            title: "Service group for the Services summary on the CE (e.g. WELDING WORKS). Items with the same group print as one line; sub-items follow their main item.",
            onChange: e => { const v = e.target.value; setSowItems(p => p.map(x => x.id === it.id ? { ...x, group: v } : x)); }
          }),
          /* Shop + Site CEs: where this task is done. Site earns the Incentive;
             Shop is charged the tools' power. Sub-items follow their main item. */
          it.type === 'main' && ceSplitOn(ceType) && /*#__PURE__*/React.createElement("button", {
            className: 'shopsite-toggle',
            style: { ...INP, width: 'auto', fontSize: 10.5, padding: '2px 8px', cursor: 'pointer', fontWeight: 700,
              color: it.work === 'shop' ? INFO : OK, borderColor: it.work === 'shop' ? INFO : OK },
            title: it.work === 'shop'
              ? "Shop work: no Incentive for these days; the tools' power is charged. Click for Site."
              : "Site work: the Incentive is paid for these days; no tool power is charged. Click for Shop.",
            onClick: () => setSowItems(p => p.map(x => x.id === it.id ? { ...x, work: x.work === 'shop' ? 'site' : 'shop' } : x))
          }, it.work === 'shop' ? "🏭 Shop" : "🏗 Site"),
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
          /*#__PURE__*/React.createElement("tbody", null, (t.key === 'mp'
            /* Manpower by shift: a day line-up and a night line-up list the
               same roles, and without the shift they read as duplicates. A
               whole shift can be ticked, or filed to a task, at once. */
            ? Object.keys(SHIFTS).concat([...new Set(rows.map(r => r.shift || 'regular_day'))].filter(k => !SHIFTS[k]))
                .map(sk => ({ sk, g: rows.filter(r => (r.shift || 'regular_day') === sk) })).filter(x => x.g.length)
                .reduce((out, { sk, g }) => {
                  const ds = g.map(r => ({ kind: 'res', key: 'mp', id: r.id }));
                  const allOn = ds.every(d => sbSel[selKey(d.kind, d.key, d.id)]);
                  out.push(/*#__PURE__*/React.createElement("tr", { key: 'sh_' + sk, className: 'sb-shift-group' },
                    /*#__PURE__*/React.createElement("td", { style: { ...TDS, textAlign: 'center', background: SURF } },
                      /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: allOn, title: 'Tick every ' + ((SHIFTS[sk] || {}).label || sk) + ' row',
                        onChange: e => setSbSel(p => { const n = { ...p }; ds.forEach(d => { const k = selKey(d.kind, d.key, d.id); if (e.target.checked) n[k] = d; else delete n[k]; }); return n; }) })),
                    /*#__PURE__*/React.createElement("td", { colSpan: 3, style: { ...TDS, background: SURF, fontWeight: 700, fontSize: 10.5, color: INFO } },
                      ((SHIFTS[sk] || {}).label || sk) + ' — ' + g.length + ' row' + (g.length === 1 ? '' : 's') + ', ' + g.reduce((a, r) => a + N(r.pax), 0) + ' pax'),
                    /*#__PURE__*/React.createElement("td", { style: { ...TDS, background: SURF } },
                      /*#__PURE__*/React.createElement("select", {
                        style: { ...INP, width: '100%', fontSize: 11, padding: '2px 6px' }, value: '',
                        onChange: e => { const v = e.target.value; if (!v) return; const ids = new Set(g.map(r => r.id));
                          setMp(p => p.map(x => ids.has(x.id) ? { ...x, taskId: v } : x));
                          setSbSel(p => { const n = { ...p }; ds.forEach(d => delete n[selKey(d.kind, d.key, d.id)]); return n; }); }
                      }, /*#__PURE__*/React.createElement("option", { value: '' }, "— assign whole shift to —"), taskOptions))));
                  g.forEach(r => out.push(unRow({ kind: 'res', key: t.key, id: r.id }, r[t.nameKey], N(r[t.qtyKey]), 'PAX/S', v => updRow(t.set, r.id, 'taskId', v))));
                  return out;
                }, [])
            : rows.map(r =>
            unRow({ kind: 'res', key: t.key, id: r.id }, r[t.nameKey], N(r[t.qtyKey]), t.key === 'mp' ? 'PAX/S' : r.uom,
              v => updRow(t.set, r.id, 'taskId', v))
          )))
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
tab === 'scopelib' && ScopeLibraryEditor(),
tab === 'masterlist' && MlEditor(), tab === 'masterlist' && MlCalcModal(), tab === 'masterlist' && /*#__PURE__*/React.createElement(MlTrendModal, { mlTrend, setMlTrend, masterlist, ML_HIST_KIND }),
tab === 'history' && HistPanel(),   /* invoked, not rendered — see its declaration */

/* ── Status Panel Modal ──────────────────────────────────────────────────────
   Pick the new status, and read the trail of who moved it and when.

   The status used to be a dropdown sitting in the table row, which put a form
   control on every one of 900 rows and still had nowhere to show the history:
   statusChangedAt only ever held the most recent change, so the previous one
   was overwritten the moment the next landed. */
apvAbsent && (() => {
  const _s = apvStatus(approvers, info.approval);
  const _to = String(apvAbsent.to || '').trim().toLowerCase();
  const _pick = (reqUsers || []).find(u => String(u.name || '').trim().toLowerCase() === _to || String(u.username || '').trim().toLowerCase() === _to);
  return /*#__PURE__*/React.createElement("div", {
    style:{position:'fixed',inset:0,background:'#000b',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},
    onClick:()=>setApvAbsent(null)
  }, /*#__PURE__*/React.createElement("div", {style:{...CS, width:'min(520px,100%)'}, onClick:ev=>ev.stopPropagation()},
    /*#__PURE__*/React.createElement("b", {style:{fontSize:14}}, "👤 Signatory away"),
    /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,margin:'4px 0 12px',lineHeight:1.6}},
      "Waiting on " + _s.waiting.map(l => l.name || l.user).join(', ') + ". Hand a line to somebody else, or take it out of the routing so the CE moves on without it. Signatures already given are not touched, and both go on the CE's trail."),
    _s.waiting.map(l => /*#__PURE__*/React.createElement("div", {key:l.id, style:{border:'1px solid '+BDR,borderRadius:6,padding:'8px 10px',marginBottom:8}},
      /*#__PURE__*/React.createElement("div", {style:{fontSize:12,fontWeight:700,marginBottom:6}}, (l.title || l.role || 'Signatory') + ' — ' + (l.name || l.user)),
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},
        /*#__PURE__*/React.createElement("input", {
          list:'req-users', style:{...INP, flex:1, minWidth:160}, placeholder:'Hand it to…',
          value: apvAbsent.line === l.id ? (apvAbsent.to || '') : '',
          onChange: ev => setApvAbsent({line: l.id, to: ev.target.value})
        }),
        /*#__PURE__*/React.createElement("button", {
          style:{...btn('acc'), opacity: (apvAbsent.line === l.id && _pick) ? 1 : .5},
          disabled: !(apvAbsent.line === l.id && _pick),
          onClick: async () => { if (await apvAdminLine('reassign', l.id, _pick)) setApvAbsent(null); }
        }, "Hand over"),
        /*#__PURE__*/React.createElement("button", {
          style:btn('danger'),
          onClick: async () => {
            const why = prompt('Take ' + (l.name || l.user) + ' out of the routing for this CE?' + String.fromCharCode(10,10) + 'Why? (goes on the record, required)');
            if (why == null) return;
            if (!why.trim()) { showToast('A reason is required to skip a signatory.', true); return; }
            if (await apvAdminLine('skip', l.id, why.trim())) setApvAbsent(null);
          }
        }, "Skip this line")))),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',justifyContent:'flex-end',marginTop:6}},
      /*#__PURE__*/React.createElement("button", {style:btn('def'), onClick:()=>setApvAbsent(null)}, "Close"))));
})(),
assignPanel && /*#__PURE__*/React.createElement("div", {
  style:{position:'fixed',inset:0,background:'#000b',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},
  onClick:()=>setAssignPanel(null)
}, /*#__PURE__*/React.createElement("div", {
  style:{...CS, width:'min(420px,100%)'}, onClick:ev=>ev.stopPropagation()
},
  /*#__PURE__*/React.createElement("b", {style:{fontSize:14}}, "👤 Assign"),
  /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,margin:'4px 0 12px',...MONO}}, assignPanel.ceNum),
  /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:10}}, "Currently: ", /*#__PURE__*/React.createElement("b", {style:{color:TX}}, assignPanel.from || '—')),
  /*#__PURE__*/React.createElement("input", {
    autoFocus: true, list: 'assign-users', style: INP, value: assignPanel.to, placeholder: 'Estimator',
    onChange: ev => { const v = ev.target.value; setAssignPanel(p => ({...p, to: v})); },
    onKeyDown: ev => { if (ev.key === 'Enter') saveAssign(); }
  }),
  /*#__PURE__*/React.createElement("datalist", {id:'assign-users'}, reqUsers.map(u => /*#__PURE__*/React.createElement("option", {key:u.username, value:u.name || u.username}))),
  /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,marginTop:6}}, "Pick from the list so \"Assigned to me\" finds it for them."),
  /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}},
    /*#__PURE__*/React.createElement("button", {style:btn('def'), onClick:()=>setAssignPanel(null)}, "Cancel"),
    /*#__PURE__*/React.createElement("button", {style:btn('acc'), onClick:saveAssign}, "Assign"))
)),
statusPanel && (() => {
  const _e = sortedHistory.find(x => x.id === statusPanel);
  const _m = _e ? monOf(_e) : {};
  const _log = Array.isArray(_m.statusLog) ? _m.statusLog : [];
  /* A CE tracked before statusLog existed still has its latest stamp, so show
     that rather than claiming nothing ever happened. */
  const _shown = _log.length ? [..._log].reverse()
    : (_m.statusChangedAt ? [{status: _m.status, at: _m.statusChangedAt, by: _m.statusChangedBy, _legacy: true}] : []);
  const _d0 = {id: statusPanel, status: _m.status || '', date: monDateInput(_m.statusChangedAt)};
  const _d = statusDraft && statusDraft.id === statusPanel ? statusDraft : _d0;
  const _setD = patch => setStatusDraft({..._d, ...patch});
  const _dirty = _d.status !== _d0.status || _d.date !== _d0.date;
  const _close = () => { setStatusDraft(null); setStatusPanel(null); };
  const _saveStatus = () => {
    /* One write, both fields. Sent as two, the second read SharePoint before
       the first had landed and patched the row back without the new status --
       so the browser showed the change and the site never received it. */
    const _w = {};
    if (_d.status !== _d0.status && _d.status) _w.status = _d.status;
    if (_d.status && (_d.date !== _d0.date || _d.status !== _d0.status) && _d.date && _d.date !== monDateInput(new Date().toISOString()))
      _w.statusChangedAt = new Date(_d.date + 'T12:00:00').toISOString();
    else if (_d.status === _d0.status && _d.date !== _d0.date)
      _w.statusChangedAt = _d.date ? new Date(_d.date + 'T12:00:00').toISOString() : '';
    if (Object.keys(_w).length) updateMon(statusPanel, _w);
    showToast('Status saved: ' + (_d.status || '—') + (_d.date ? ' · ' + _d.date : '') + '.');
    _close();
  };
  return /*#__PURE__*/React.createElement("div", {
    style:{position:'fixed',inset:0,background:'#000b',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'},
    onClick:()=>{ if (!_dirty || confirm('Discard the status change you have not saved?')) _close(); }
  }, /*#__PURE__*/React.createElement("div", {
    style:{background:CARD,border:`1px solid ${BDR}`,borderRadius:10,padding:24,minWidth:440,maxWidth:560,maxHeight:'82vh',overflowY:'auto'},
    onClick:ev=>ev.stopPropagation()
  },
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
      /*#__PURE__*/React.createElement("b", {style:{fontSize:14}}, "⚑ Status"),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true), onClick:()=>{ if (!_dirty || confirm('Discard the status change you have not saved?')) _close(); }}, "✕ Close")),
    /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:16,...MONO}}, (_e?.info?.ceNum || _e?.ceNum || '')),

    /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,letterSpacing:.5,marginBottom:6}}, "CURRENT"),
    /*#__PURE__*/React.createElement("span", {style:{display:'inline-block',background:getStatusColor(_m.status||'')+'22',color:getStatusColor(_m.status||''),fontWeight:700,fontSize:12,padding:'3px 12px',borderRadius:12,marginBottom:16}}, _m.status || "—"),

    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:18,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT}}, "changed on"),
      /*#__PURE__*/React.createElement("input", {
        /* Written automatically when a status is picked, which is right for a
           CE moving through the pipeline and wrong for one entered years after
           the fact: it recorded today. Correctable here, and the trail above is
           corrected with it. The name is not editable -- who clicked is
           genuinely observed; only the date is being put right. */
        type: "date",
        disabled: !_d.status,
        title: _d.status ? 'The date this status took effect — saved with Save' : 'Pick a status first',
        style: {...INP, fontSize: 11, padding: '3px 8px', width: 150, opacity: _d.status ? 1 : .4},
        value: _d.date || '',
        onChange: ev => _setD({date: ev.target.value})
      }),
      _m.statusChangedBy && /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT}}, "by " + _m.statusChangedBy)),

    /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,letterSpacing:.5,marginBottom:8}}, "CHANGE TO"),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexWrap:'wrap',gap:6,marginBottom:20}},
      allStatuses.map(st => /*#__PURE__*/React.createElement("button", {
        key: st,
        style:{...btn('def',true), fontSize:11, padding:'4px 12px', borderRadius:12,
               background: st === _d.status ? getStatusColor(st)+'33' : 'transparent',
               borderColor: st === _d.status ? getStatusColor(st) : getStatusColor(st)+'66', color: getStatusColor(st),
               fontWeight: st === _d.status ? 700 : 400},
        title: st === _m.status ? 'The current status' : 'Choose ' + st + ' — saved with Save',
        onClick: () => _setD({status: st, date: st === _m.status ? _d0.date : monDateInput(new Date().toISOString())})
      }, (st === _d.status ? '✓ ' : '') + st))),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',justifyContent:'flex-end',gap:8,marginTop:-8,marginBottom:18}},
      _dirty && /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:'var(--status-warning)',marginRight:'auto',alignSelf:'center'}}, 'Not saved yet — nothing is in the history until you press Save.'),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true), disabled:!_dirty, onClick:()=>setStatusDraft(null)}, "Undo"),
      /*#__PURE__*/React.createElement("button", {style:{...btn('acc',true), opacity:_dirty?1:.5}, disabled:!_dirty, onClick:_saveStatus}, "Save")),

    /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,letterSpacing:.5,marginBottom:8}}, "HISTORY"),
    _shown.length === 0
      ? /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,padding:'12px 0',border:'1px dashed '+BDR,borderRadius:6,textAlign:'center'}}, "No status changes recorded yet.")
      : /*#__PURE__*/React.createElement("div", null, _shown.map((h, i) => /*#__PURE__*/React.createElement("div", {
          key: i,
          style:{display:'flex',alignItems:'baseline',gap:8,padding:'6px 0',borderBottom:'1px solid '+alpha(BDR, '44')}
        },
          /*#__PURE__*/React.createElement("span", {style:{background:getStatusColor(h.status||'')+'22',color:getStatusColor(h.status||''),fontWeight:700,fontSize:10,padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap'}}, h.status || "—"),
          h.from && /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT}}, "from " + h.from),
          /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,marginLeft:'auto',whiteSpace:'nowrap'}},
            h.at ? new Date(h.at).toLocaleString('en-PH',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : ''),
          /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:TX,minWidth:90,textAlign:'right'}}, h.by || "—")
        ))),
    _shown.length && _shown[0]._legacy ? /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,marginTop:8,lineHeight:1.5}},
      "Only the most recent change was kept before this version. Everything from here on is logged in full.") : null
  ));
})(),

/* ── New Request Modal ── */
reqForm && (() => {
  const set = (k, v) => setReqForm(p => ({...p, [k]: v}));
  /* One item's answer, or its remark, without disturbing the other twelve. */
  const setItem = (n, patch) => setReqForm(p => ({...p, items: {...(p.items || {}), [n]: {...((p.items || {})[n] || {}), ...patch}}}));
  const L = (label, el) => /*#__PURE__*/React.createElement("label", {style:{display:'flex',flexDirection:'column',gap:3,fontSize:11,color:MT}}, label, el);
  const inp = (k, extra) => /*#__PURE__*/React.createElement("input", {style:INP, value:reqForm[k] || '', onChange:e=>set(k, e.target.value), ...(extra || {})});
  const sect = (title, note) => /*#__PURE__*/React.createElement("div", {style:{marginTop:16,marginBottom:8,borderTop:'1px solid '+BDR,paddingTop:10}},
    /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:11,letterSpacing:'.5px',color:TX}}, title),
    note && /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginTop:2}}, note));
  const grid = (...kids) => /*#__PURE__*/React.createElement("div", {style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10}}, ...kids);
  const missing = rceUnanswered(reqForm);
  const answered = RCE_ITEMS.length - missing.length;
  return /*#__PURE__*/React.createElement("div", {
    style:{position:'fixed',inset:0,background:'#000b',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},
    onClick:()=>{ if (!reqBusy) setReqForm(null); }
  }, /*#__PURE__*/React.createElement("div", {
    style:{...CS, width:'min(760px,100%)', maxHeight:'92vh', overflow:'auto'}, onClick:e=>e.stopPropagation()
  },
    /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:14,marginBottom:2}}, "Request for Costing (RCE) Checklist"),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginBottom:10,...MONO}}, "SHIC-F-SMD-002 Rev 01"),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:11,marginBottom:12}},
      "Logs the request in CE Monitoring, assigns it, and sends whatever came with it. The estimator Loads it, builds the estimate, and Saves under the same number."),

    sect("THE INQUIRY"),
    grid(
      L("CE Number *", inp('ceNum', {style:{...INP,...MONO}})),
      L("Inquiry number", inp('inquiryNo', {placeholder:'e.g. HSAB - RFQ 130000516', style:{...INP,...MONO}})),
      L("RCE No.", inp('rceNo', {placeholder:'From Sales', style:{...INP,...MONO}})),
      L("Inquiry date", inp('inquiryDate', {type:'date'})),
      L("Submission deadline", inp('deadline', {type:'date'})),
      L("Completion date", inp('completionDate', {type:'date'})),
      L("Date received", inp('dateRecv', {type:'date'})),
      L("Assigned sales", inp('assignedSales', {placeholder:'Who took the inquiry'}))
    ),

    sect("THE CUSTOMER AND THE WORK"),
    grid(
      L("Customer *", inp('client', {placeholder:'e.g. SLTEC'})),
      L("Work location", inp('workLocation', {placeholder:'Where the work happens'}))
    ),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Address", inp('address', {placeholder:'Site or office address as the inquiry gives it'}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Project title", /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:46,resize:'vertical'}, value:reqForm.description, placeholder:'What the client is asking for', onChange:e=>set('description', e.target.value)}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, grid(
      L("Assigned to *", /*#__PURE__*/React.createElement(React.Fragment, null,
        inp('assignee', {list:'req-users', placeholder:'Estimator'}),
        /*#__PURE__*/React.createElement("datalist", {id:'req-users'}, reqUsers.map(u => /*#__PURE__*/React.createElement("option", {key:u.username, value:u.name || u.username}))))),
      L("Inquiry type", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.inquiryType || '', onChange:e=>set('inquiryType', e.target.value)},
        /*#__PURE__*/React.createElement("option", {value:''}, '--'),
        RCE_INQUIRY_TYPES.map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, k)))),
      L("Discipline", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.projType, onChange:e=>set('projType', e.target.value)},
        ['Electrical', 'Mechanical', 'Civil', 'General'].map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, k)))),
      L("CE Type", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.ceType, onChange:e=>set('ceType', e.target.value)},
        Object.keys(CE_CFG).map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, ceTypeLabel(k))))),
      L("Project stage", /*#__PURE__*/React.createElement("select", {style:INP, value:reqForm.stage || '', onChange:e=>set('stage', e.target.value)},
        RCE_STAGES.map(k => /*#__PURE__*/React.createElement("option", {key:k, value:k}, k))))
    )),

    sect("COMPLETE?", "Every item is answered. No is not a refusal -- it is the record of what did not arrive, and item 14.2 is the recommendation that follows from it."),
    /*#__PURE__*/React.createElement("div", {style:{border:'1px solid '+BDR,borderRadius:7,overflow:'hidden'}},
      RCE_ITEMS.map((it, ix) => {
        const cur = (reqForm.items || {})[it.n] || {};
        return /*#__PURE__*/React.createElement("div", {
          key:it.n,
          style:{display:'grid',gridTemplateColumns:'26px 1fr 150px',gap:8,alignItems:'center',padding:'6px 9px',
            background: ix % 2 ? 'transparent' : alpha(TX, '06'),
            borderLeft:'3px solid ' + (cur.v === 'yes' ? OK : cur.v === 'no' ? ERR : cur.v === 'na' ? MT : 'transparent')}
        },
          /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,...MONO}}, it.n),
          /*#__PURE__*/React.createElement("div", null,
            /*#__PURE__*/React.createElement("div", {style:{fontSize:11.5,color: cur.v ? TX : MT}}, it.t),
            /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:5,marginTop:4}},
              RCE_ANSWERS.map(a => /*#__PURE__*/React.createElement("button", {
                key:a.v, disabled:reqBusy, onClick:()=>setItem(it.n, {v: cur.v === a.v ? '' : a.v}),
                title: a.v === 'no' ? 'This did not come with the inquiry' : a.v === 'na' ? 'This does not apply to this inquiry' : 'This came with the inquiry',
                style:{fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:5,cursor:'pointer',
                  border:'1px solid ' + (cur.v === a.v ? 'transparent' : BDR),
                  background: cur.v !== a.v ? 'transparent' : a.v === 'yes' ? OK : a.v === 'no' ? ERR : MT,
                  color: cur.v === a.v ? '#fff' : MT}
              }, a.t)))),
          /*#__PURE__*/React.createElement("input", {
            style:{...INP,fontSize:10.5,padding:'4px 7px'}, disabled:reqBusy, placeholder:'Remarks',
            value:cur.r || '', onChange:e=>setItem(it.n, {r: e.target.value})
          }));
      })),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:6,fontSize:10,color: missing.length ? ACC : OK}},
      missing.length
        ? answered + ' of ' + RCE_ITEMS.length + ' answered. Next unanswered: item ' + missing[0].n + ', ' + missing[0].t + '.'
        : 'All ' + RCE_ITEMS.length + ' items answered.'),

    sect("14. RECOMMENDATION"),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexDirection:'column',gap:5}},
      RCE_RECOMMENDATIONS.map(r => /*#__PURE__*/React.createElement("button", {
        key:r.v, disabled:reqBusy, onClick:()=>set('recommendation', reqForm.recommendation === r.v ? '' : r.v),
        style:{textAlign:'left',fontSize:11.5,padding:'7px 11px',borderRadius:6,cursor:'pointer',
          border:'1px solid ' + (reqForm.recommendation === r.v ? 'transparent' : BDR),
          background: reqForm.recommendation !== r.v ? 'transparent' : r.v === 'decline' ? ERR : r.v === 'secure' ? ACC : OK,
          color: reqForm.recommendation !== r.v ? TX : r.v === 'secure' ? ON_ACC : '#fff', fontWeight: reqForm.recommendation === r.v ? 700 : 400}
      }, r.t))),
    reqForm.recommendation === 'decline' && /*#__PURE__*/React.createElement("div", {style:{marginTop:10}},
      L("Reason to decline / no quote *", /*#__PURE__*/React.createElement("textarea", {
        style:{...INP,height:46,resize:'vertical'}, value:reqForm.declineReason || '', disabled:reqBusy,
        placeholder:'Why SHIC is not quoting this one', onChange:e=>set('declineReason', e.target.value)}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Other remarks", /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:46,resize:'vertical'}, value:reqForm.otherRemarks || '', placeholder:'Anything the estimator should know that no item above covers', onChange:e=>set('otherRemarks', e.target.value)}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Remarks for CE Monitoring", /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:40,resize:'vertical'}, value:reqForm.remarks, placeholder:'Site visit needed, contact person, anything not to forget...', onChange:e=>set('remarks', e.target.value)}))),

    /* Chosen here, sent the moment the request has a row to hang them on. */
    sect("DOCUMENTS THAT CAME WITH IT"),
    /*#__PURE__*/React.createElement("div", {style:{border:'1px dashed '+BDR,borderRadius:6,padding:9}},
      /*#__PURE__*/React.createElement("input", {
        type:'file', multiple:true, disabled:reqBusy, style:{fontSize:11,color:MT,width:'100%'},
        onChange:e=>{ const picked=Array.from(e.target.files||[]); if(picked.length) setReqFiles(p=>p.concat(picked.filter(f=>!p.some(x=>x.name===f.name&&x.size===f.size)))); e.target.value=''; }
      }),
      reqFiles.length > 0 && /*#__PURE__*/React.createElement("div", {style:{marginTop:8,display:'flex',flexDirection:'column',gap:4}},
        reqFiles.map((f, i) => /*#__PURE__*/React.createElement("div", {key:f.name+i, style:{display:'flex',alignItems:'center',gap:8,fontSize:11}},
          /*#__PURE__*/React.createElement("span", {style:{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, '📎 ' + f.name),
          /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:10,whiteSpace:'nowrap'}}, Math.max(1, Math.round(f.size/1024)).toLocaleString('en-US') + ' KB'),
          /*#__PURE__*/React.createElement("button", {
            style:{...btn('def',true),fontSize:10,padding:'1px 7px'}, disabled:reqBusy,
            title:'Take this one off the request', onClick:()=>setReqFiles(p=>p.filter((_x,k)=>k!==i))
          }, '✕')))),
      /*#__PURE__*/React.createElement("div", {style:{marginTop:6,fontSize:10,color:MT}},
        reqFiles.length
          ? reqFiles.length + ' file(s) go up as soon as the request is logged. More can be added afterwards from the 📎 button.'
          : 'Drawings, TOR, the RFQ, a PO -- anything the estimator needs. They can also be added afterwards from the 📎 button.')),

    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14,alignItems:'center'}},
      /*#__PURE__*/React.createElement("div", {style:{flex:1,fontSize:10,color:MT}},
        'Prepared by ' + (currentUser.name || currentUser.username || '')),
      /*#__PURE__*/React.createElement("button", {style:btn('def'), disabled:reqBusy, onClick:()=>{setReqFiles([]);setReqForm(null);}}, "Cancel"),
      /*#__PURE__*/React.createElement("button", {style:btn('acc'), disabled:reqBusy, onClick:submitRequest},
        reqBusy ? "Logging..." : (reqFiles.length ? "Log request & send " + reqFiles.length + " file(s)" : "Log request"))
    )
  ));
})(),

/* ── Attachment Panel Modal ── */
attachPanel && /*#__PURE__*/React.createElement("div", {
  /* Above the CE viewer (3000), because an approver opens it from there and a
     panel that paints behind the thing that opened it cannot be read. */
  style:{position:'fixed',inset:0,background:'#000b',zIndex:3100,display:'flex',alignItems:'center',justifyContent:'center'},
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
    style:{background:alpha(ERR, '22'),border:`1px solid ${alpha(ERR, '44')}`,borderRadius:6,padding:'10px 14px',fontSize:12,color:ERR,marginBottom:12}
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
    attachList.length === 0 && !attachBusy && !attachErr && /*#__PURE__*/React.createElement("div", {
      style:{textAlign:'center',padding:'20px 0',color:MT,fontSize:12,border:`1px dashed ${BDR}`,borderRadius:6}
    }, "No attachments yet. Upload drawings, TOR, or other documents."),
    attachErr && !attachBusy && /*#__PURE__*/React.createElement("div", {
      style:{padding:'12px 14px',color:ERR,fontSize:12,border:`1px solid ${alpha(ERR, '44')}`,background:alpha(ERR, '22'),borderRadius:6}
    }, "⚠ Could not read the attachments on this CE — ", attachErr,
       ". They have not been deleted; this list is unreadable right now. Try signing in to SharePoint again."),
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
          href: spAbsUrl(f.ServerRelativeUrl),
          target:'_blank', rel:'noopener noreferrer',
          style:{flex:1,fontSize:12,color:INFO,wordBreak:'break-all',textDecoration:'none'}
        }, f.FileName),
        /* Same rule as deleting the CE itself: an attachment on a saved CE is
           a company record -- a drawing or a TOR the estimate was built from --
           and removing it is an admin/owner action. */
        isAdmin && /*#__PURE__*/React.createElement("button", {
          style:{...btn('danger',true),fontSize:10,padding:'2px 6px',flexShrink:0},
          disabled:attachBusy,
          title:"Delete this attachment",
          onClick:()=>handleAttachDelete(attachPanel, f.FileName)
        }, "✕")
      ))
    )
  )
)),

/* ── CE Monitoring -> Remarks trail ── */
remarksPanel && (() => {
  const m = monData[remarksPanel.id] || {};
  let log = Array.isArray(m.remarksLog) ? m.remarksLog : [];
  if (!log.length && String(m.remarks || '').trim()) log = [{ text: m.remarks, at: '', by: '' }];
  const add = () => {
    const t = remarkDraft.trim();
    if (!t) return;
    updateMon(remarksPanel.id, 'remarks', t);
    setRemarkDraft('');
    showToast('Remark added.');
  };
  return /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'},onClick:()=>setRemarksPanel(null)},
    /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:18,width:'min(520px,94vw)',maxHeight:'82vh',display:'flex',flexDirection:'column',gap:10},onClick:e=>e.stopPropagation()},
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center'}},
        /*#__PURE__*/React.createElement("b", null, "💬 Remarks — " + (remarksPanel.ceNum || 'CE')),
        /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),marginLeft:'auto'},onClick:()=>setRemarksPanel(null)}, "✕ Close")),
      /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:64,resize:'vertical'},value:remarkDraft,autoFocus:true,placeholder:'New remark — e.g. Prebid done 09/15, deadline extension requested...',
        onChange:e=>setRemarkDraft(e.target.value), onKeyDown:e=>{ if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }}),
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8}},
        /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT}}, "Ctrl+Enter to add. Earlier remarks are kept below."),
        /*#__PURE__*/React.createElement("button", {style:{...btn('acc',true),marginLeft:'auto'},disabled:!remarkDraft.trim(),onClick:add}, "+ Add Remark")),
      /*#__PURE__*/React.createElement("div", {style:{overflowY:'auto',display:'flex',flexDirection:'column',gap:6}},
        log.length ? log.slice().reverse().map((h, i) => /*#__PURE__*/React.createElement("div", {key:i,style:{background:SURF,border:'1px solid '+BDR,borderRadius:6,padding:'6px 10px'}},
          /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,marginBottom:2}},
            (i === 0 ? 'LATEST · ' : '') + (h.by || 'Earlier remark') + (h.at ? ' · ' + new Date(h.at).toLocaleString() : '')),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:12,whiteSpace:'pre-wrap'}}, h.text)))
        : /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,textAlign:'center',padding:12}}, "No remarks yet."))));
})(),

/* ── CE Monitoring -> View -> the request behind it ── */
viewRce && (() => {
  const _e = sortedHistory.find(x => x.id === viewRce);
  const _rce = _e && _e.info && _e.info.rce;
  if (!_rce) return null;
  return /*#__PURE__*/React.createElement("div", {
    /* Above the viewer, like the attachment panel, and closed the same way. */
    style:{position:'fixed',inset:0,background:'#000b',zIndex:3100,display:'flex',alignItems:'center',justifyContent:'center'},
    onClick:()=>setViewRce(null)
  }, /*#__PURE__*/React.createElement("div", {
    style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:16,width:'min(820px,94vw)',maxHeight:'88vh',overflowY:'auto'},
    onClick:e=>e.stopPropagation()
  },
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:12}},
      /*#__PURE__*/React.createElement("b", {style:{fontSize:14}}, "📋 Request behind " + ((_e.info && _e.info.ceNum) || 'this CE')),
      /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT}}, "As Sales logged it. Read-only."),
      /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),marginLeft:'auto'},onClick:()=>setViewRce(null)}, "✕ Close")),
    /*#__PURE__*/React.createElement(RceChecklistCard, {rce: _rce})));
})(),

/* ── CE Monitoring -> View ── */
viewCE && /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'},onClick:()=>setViewCE(null)},
  /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:12,width:'min(960px,96vw)',height:'92vh',display:'flex',flexDirection:'column',gap:8},onClick:e=>e.stopPropagation()},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8}},
      /*#__PURE__*/React.createElement("b", null, "👁 " + (viewCE.ceNum || 'CE')),
      /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT}}, viewCE.draft ? "Read-only view of an unsaved DRAFT — figures may still change." : "Read-only view. Takes a few seconds to draw."),
      /*#__PURE__*/React.createElement("span", {style:{marginLeft:'auto'}}),
      /* What the client actually sent, and the papers it came with. An
         approver asked to sign off a figure has to be able to see the request
         behind it without leaving the CE, and without being able to change
         either one. */
      !viewCE.draftKey && (() => {
        const _e = sortedHistory.find(x => x.id === viewCE.id);
        const _rce = _e && _e.info && _e.info.rce;
        return /*#__PURE__*/React.createElement("button", {
          style:{...btn(viewRce === viewCE.id ? 'acc' : 'def', true), opacity: _rce ? 1 : .4, cursor: _rce ? 'pointer' : 'not-allowed'},
          disabled: !_rce,
          title: _rce ? "What the client sent with the inquiry — the RCE checklist Sales filled in"
                      : "This CE did not come from a logged request, so there is no checklist to show",
          onClick: () => setViewRce(viewRce === viewCE.id ? null : viewCE.id)
        }, "📋 Request");
      })(),
      !viewCE.draftKey && /*#__PURE__*/React.createElement("button", {
        style: btn(attachPanel === viewCE.id ? 'acc' : 'def', true),
        title: "Drawings, TOR and the rest of the papers attached to this CE",
        onClick: () => { if (attachPanel === viewCE.id) setAttachPanel(null); else openAttachPanel(viewCE.id); }
      }, "📎 Files"),
      !viewCE.draftKey && (apvMonWaitsOn(monData[viewCE.id], currentUser.username) || viewApvTurn) && /*#__PURE__*/React.createElement("button", {style:{...btn('ok',true),opacity:apvBusy?.6:1},disabled:!!apvBusy,title:apvBusy?"Saving your signature — a moment":"Sign the CE shown here",onClick:()=>{if(!apvBusy)apvStartSign(viewCE.id);}}, apvBusy ? "✍ Signing…" : "✍ Approve & Sign"),
      !viewCE.draftKey && ((monData[viewCE.id]||{}).apv||{}).state==='pending' && ((((monData[viewCE.id]||{}).apv||{}).waiting||[]).includes(currentUser.username) || isAdmin) && /*#__PURE__*/React.createElement("button", {style:btn('def',true),title:"Send it back to the estimator with a comment",onClick:()=>apvStartReturn(viewCE.id)}, "↩ Return"),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),title:"Print or save this CE as PDF",onClick:()=>{try{
      /* The viewer prints an iframe, and the browser names the PDF after the
         page's own title, not the frame's -- it came out "SHIC Cost
         Estimator". The title is lent to the CE for the print and handed
         back afterwards. */
      const _was=document.title;
      try{document.title=ceFileNameFor(viewCE.id, viewCE.ceNum);}catch(_e){}
      /* Wait for the frame to finish laying itself into sheets, the same way
         the print window does: printing mid-layout prints it unpaginated. */
      const _w=document.getElementById('shic-view-ce').contentWindow;
      (function _go(n){
        let paged=false;
        try{paged=!!(_w.document.body&&_w.document.body.getAttribute('data-paged'));}catch(_e){paged=true;}
        if(paged||n>40){_w.print();setTimeout(()=>{try{document.title=_was;}catch(_e){}},1000);return;}
        setTimeout(()=>_go(n+1),150);
      })(0);
    }catch(ex){showToast('Could not print: '+ex.message,true);}}}, "🖨 Print"),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setViewCE(null)}, "✕ Close")),
    /*#__PURE__*/React.createElement("iframe", {key:viewCE.k||0, id:'shic-view-ce', title:'CE ' + (viewCE.ceNum || ''), src: window.location.pathname + (viewCE.draftKey ? '?viewdraft=' + encodeURIComponent(viewCE.draftKey) + '&as=view' : '?print=' + viewCE.id + '&as=view'), style:{flex:1,width:'100%',border:'1px solid '+BDR,borderRadius:6,background:'#fff'}}))),

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
      /*#__PURE__*/React.createElement("tbody", null, (() => {
        /* Saved CEs store only the grand total, so each section is recomputed
           from the CE's own rows. Mob/Demob rows show only when either CE has
           them. The grand total is the one each CE was saved with. */
        const _d = x => (x && x.data) || x || {};
        const B = computeCEParts(_d(diffModal.base)), R = computeCEParts(_d(diffModal.rev));
        const _g = x => N(_d(x).grand) || N(x && x.grand) || null;
        B.grand = _g(diffModal.base) ?? B.total; R.grand = _g(diffModal.rev) ?? R.total;
        return [['Mobilization','mob'],['Demobilization','demob'],['Manpower','mpT'],['Tools','toolsT'],['Materials','matsT'],['PPE','ppeT'],['Misc','miscT'],['Grand Total','grand']]
          .filter(([, k]) => (k !== 'mob' && k !== 'demob') || B[k] || R[k])
          .map(([label, key]) => [label, B[key], R[key]]);
      })().map(([label, bv0, rv0]) => {
        const bv = N(bv0), rv = N(rv0), delta = rv - bv;
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
/* ── My Signature ── */
mySigOpen && /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000b',zIndex:3100,display:'flex',alignItems:'center',justifyContent:'center'},onClick:()=>setMySigOpen(false)},
  /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid #A78BFA',borderRadius:10,padding:20,width:460},onClick:e=>e.stopPropagation()},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},
      /*#__PURE__*/React.createElement("b", null, "✍ My Signature"),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setMySigOpen(false)}, "✕")),
    /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginBottom:10,lineHeight:1.5}}, "Draw it below or upload an image. It is saved to your account and fills in the pad when you Approve & Sign; each CE still stamps it with your name, title, date and time."),
    /*#__PURE__*/React.createElement("div", {style:{background:'#fff',borderRadius:6,marginBottom:10,overflow:'hidden',border:'1px solid #ccc'}},
      /*#__PURE__*/React.createElement("canvas", {
        id:'mySigCanvas', width:420, height:140, style:{display:'block',cursor:'crosshair'},
        ref: el => {
          if(!el||el.__sigReady) return; el.__sigReady=true;
          const ctx=el.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,420,140);
          ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
          let drawing=false;
          const pos=e=>{const r=el.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};};
          el.onmousedown=el.ontouchstart=e=>{e.preventDefault();drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);};
          el.onmousemove=el.ontouchmove=e=>{e.preventDefault();if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();};
          el.onmouseup=el.ontouchend=()=>{drawing=false;};
          if(mySig){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0);img.src=mySig;}
        }
      })),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("label", {style:{...btn('info',true),cursor:'pointer'},title:"PNG or JPG, ideally on a white or transparent background"}, "⬆ Upload image",
        /*#__PURE__*/React.createElement("input", {type:'file',accept:'image/png,image/jpeg,image/webp',style:{display:'none'},onChange:ev=>{
          const f=ev.target.files&&ev.target.files[0]; ev.target.value=''; if(!f) return;
          if(f.size>3*1024*1024){showToast('Pick an image under 3 MB.',true);return;}
          const rd=new FileReader(); rd.onload=()=>sigFit(rd.result).then(d=>{const c=document.getElementById('mySigCanvas');const x=c.getContext('2d');const im=new Image();im.onload=()=>{x.fillStyle='#fff';x.fillRect(0,0,420,140);x.drawImage(im,0,0);};im.src=d;}).catch(er=>showToast(er.message,true)); rd.readAsDataURL(f);
        }})),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>{const el=document.getElementById('mySigCanvas');const x=el.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,420,140);}}, "🗑 Clear"),
      mySig && /*#__PURE__*/React.createElement("button", {style:btn('danger',true),onClick:()=>{if(confirm('Remove your saved signature?')){saveMySig('');setMySigOpen(false);}}}, "Remove saved"),
      /*#__PURE__*/React.createElement("button", {style:{...btn('ok'),flex:1},onClick:()=>{saveMySig(document.getElementById('mySigCanvas').toDataURL('image/png'));setMySigOpen(false);}}, "💾 Save to my account")))),

/* ── Masterlist Trash ── */
mlTrash && /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'},onClick:()=>setMlTrash(null)},
  /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:16,width:'min(760px,96vw)',maxHeight:'86vh',display:'flex',flexDirection:'column',gap:8},onClick:e=>e.stopPropagation()},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8}},
      /*#__PURE__*/React.createElement("b", null, "🗑 Masterlist Trash (" + mlTrash.length + ")"),
      /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT}}, "Deleted items stay 30 days, then are removed for good."),
      /*#__PURE__*/React.createElement("span", {style:{marginLeft:'auto'}}),
      mlTrash.length > 0 && /*#__PURE__*/React.createElement("button", {style:btn('ok',true),onClick:()=>mlRestore(mlTrash)}, "Restore all"),
      mlTrash.length > 0 && isAdmin && /*#__PURE__*/React.createElement("button", {style:btn('danger',true),onClick:()=>mlPurge(mlTrash)}, "Empty trash"),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setMlTrash(null)}, "✕")),
    /*#__PURE__*/React.createElement("div", {style:{overflow:'auto',flex:1}},
      mlTrash.length ? mlTrash.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(e => {
        const left = Math.max(0, 30 - Math.floor((Date.now() - new Date(e.at).getTime()) / 864e5));
        return /*#__PURE__*/React.createElement("div", {key:e.key, style:{display:'flex',alignItems:'center',gap:8,padding:'6px 4px',borderBottom:'1px solid '+alpha(BDR,'55'),fontSize:12}},
          /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,width:74,textTransform:'uppercase'}}, e.tab),
          /*#__PURE__*/React.createElement("span", {style:{flex:1}}, mlTrashItemName(e.item),
            /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,marginLeft:6,...MONO}}, '₱' + N(e.item.cost != null ? e.item.cost : e.item.rate).toLocaleString())),
          /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,width:170,textAlign:'right'},title:new Date(e.at).toLocaleString()}, (e.by ? e.by.split(' ')[0] + ' · ' : '') + new Date(e.at).toLocaleDateString('en-PH',{month:'short',day:'numeric'}) + ' · ' + left + 'd left'),
          /*#__PURE__*/React.createElement("button", {style:btn('ok',true),onClick:()=>mlRestore([e])}, "Restore"),
          isAdmin && /*#__PURE__*/React.createElement("button", {style:{...btn('danger',true),padding:'2px 6px'},title:'Delete permanently',onClick:()=>mlPurge([e])}, "✕"));
      }) : /*#__PURE__*/React.createElement("div", {style:{fontSize:12,color:MT,textAlign:'center',padding:20}}, "Trash is empty.")))),

/* Said over everything, because the pad it was started from has already
   closed and the CE underneath looks exactly as it did before. */
apvBusy && /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000a',zIndex:3400,display:'flex',alignItems:'center',justifyContent:'center'}},
  /*#__PURE__*/React.createElement("div", {style:{background:'var(--panel,#161B22)',border:'1px solid '+BDR,borderRadius:10,padding:'18px 22px',display:'flex',gap:12,alignItems:'center',boxShadow:'0 10px 40px #000a'}},
    /*#__PURE__*/React.createElement("div", {style:{width:18,height:18,borderRadius:'50%',border:'2px solid '+alpha(OK,'44'),borderTopColor:OK,animation:'spin .7s linear infinite'}}),
    /*#__PURE__*/React.createElement("div", null,
      /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:13}}, apvBusy + '…'),
      /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginTop:2}}, 'Saving to SharePoint. This takes a few seconds — do not close the CE.')))),
sigModal && /*#__PURE__*/React.createElement("div", {style:{position:'fixed',inset:0,background:'#000b',zIndex:3100,display:'flex',alignItems:'center',justifyContent:'center'},onClick:()=>setSigModal(null)},
  /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid #A78BFA',borderRadius:10,padding:20,width:460},onClick:e=>e.stopPropagation()},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}},
      /*#__PURE__*/React.createElement("b", null, sigModal.mode === 'approve' ? "✍ Approve & sign — " : "✍ Signature — ", sigModal.name||sigModal.role),
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
          const pre=sigModal.mode==='approve'?mySig:signatures[sigModal.id];if(pre){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0);img.src=pre;}
        }
      })),
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:8}},
      /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>{const el=document.getElementById('sigCanvas');const ctx=el.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,420,140);}}, "🗑 Clear"),
      /*#__PURE__*/React.createElement("button", {style:{...btn('ok'),flex:1},onClick:()=>{
        const el=document.getElementById('sigCanvas');
        if(sigModal.mode==='approve'){const d=el.toDataURL('image/png'),sm=sigModal;setSigModal(null);apvAct(sm.ceId,'approve',{sig:d,fromEditor:sm.fromEditor});return;}
        setSignatures(p=>({...p,[sigModal.id]:el.toDataURL('image/png')}));
        setSigModal(null); showToast('Signature saved.');
      }}, "💾 Save Signature")))),

/* ── Feature 9: Dashboard Tab ── */
/* ── My Work: everything waiting on the signed-in user, in one place ── */
tab === 'mywork' && (() => {
  const me = currentUser.username, names = meNames();
  const heads = groupCERevisions(monRows, h => (h.info && h.info.ceNum) || h.ceNum || '').map(g => g.head);
  const rows = heads.map(e => ({e, m: monOf(e)}));
  const isMine = x => names.includes(String(x.m.ceeName || x.m.preparedBy || x.e.savedBy || '').trim().toUpperCase()) || x.e.savedBy === me;
  const mine = rows.filter(x => !x.e._draft && isMine(x));
  const apv = x => x.m.apv || {};
  const toSign = myTodo.sign, returned = myTodo.returned;
  const inApproval = mine.filter(x => apv(x).state === 'pending');
  const forReview = rows.filter(x => !x.e._draft && x.m.status === 'For Approval' && !isMine(x) && !(apv(x).state === 'pending'));
  const open = mine.filter(x => ceIsOpen(x.m.status) && apv(x).state !== 'pending')
    .map(x => ({...x, dl: ceDeadline(x.m.deadline, x.m.dateSubmitted, x.m.status)}))
    .sort((a, b) => (a.dl.days == null) - (b.dl.days == null) || (a.dl.days || 0) - (b.dl.days || 0));
  const drafts = (sharedDrafts || []).filter(d => d.savedBy === me);
  const now = new Date(), inMonth = v => { const d = v ? new Date(v) : null; return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };
  const subMonth = mine.filter(x => inMonth(x.m.dateSubmitted ? x.m.dateSubmitted + 'T00:00:00' : null) || (x.m.status === 'Submitted' && inMonth(x.m.statusChangedAt)));
  const timed = mine.map(x => ceDeadline(x.m.deadline, x.m.dateSubmitted, x.m.status)).filter(d => d.done && d.days != null);
  const onTime = timed.length ? Math.round(100 * timed.filter(d => !d.late).length / timed.length) : null;
  const yr = mine.filter(x => new Date(x.e.savedAt || 0).getFullYear() === now.getFullYear());
  const won = yr.filter(x => x.m.status === 'Awarded').length, lost = yr.filter(x => ['No Quote', 'Cancelled'].includes(x.m.status)).length;
  const overdue = open.filter(x => x.dl.late).length, dueSoon = open.filter(x => !x.dl.late && x.dl.days != null && x.dl.days <= 3).length;
  const peso = v => '₱' + Math.round(N(v)).toLocaleString();
  const kpi = (label, val, sub, col) => /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:'12px 14px',minWidth:0}},
    /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT,textTransform:'uppercase',letterSpacing:'.06em'}}, label),
    /*#__PURE__*/React.createElement("div", {style:{fontSize:24,fontWeight:800,color:col||'inherit',...MONO}}, val),
    sub && /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:MT}}, sub));
  const ceLabel = e => (e.info && e.info.ceNum) || e.ceNum || '(no number)';
  const line = (x, extra, actions) => /*#__PURE__*/React.createElement("div", {key: x.e.id, style:{display:'flex',alignItems:'center',gap:8,padding:'6px 2px',borderBottom:'1px solid '+alpha(BDR,'44'),fontSize:12}},
    /*#__PURE__*/React.createElement("b", {style:{...MONO,fontSize:11,whiteSpace:'nowrap'}}, ceLabel(x.e)),
    /*#__PURE__*/React.createElement("span", {style:{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:MT}}, [(x.e.info && x.e.info.client) || x.m.customer || '', (x.e.info && x.e.info.description) || ''].filter(Boolean).join(' · ')),
    extra, actions);
  const viewBtn = x => typeof x.e.id === 'number' && /*#__PURE__*/React.createElement("button", {style:btn('def',true),onClick:()=>setViewCE({id:x.e.id,ceNum:ceLabel(x.e)})}, "👁 View");
  const loadBtn = x => /*#__PURE__*/React.createElement("button", {style:btn('acc',true),onClick:()=>handleLoad(x.e.data || x.e)}, "Load");
  const section = (title, list, render, empty) => /*#__PURE__*/React.createElement("div", {style:{background:CARD,border:'1px solid '+BDR,borderRadius:10,padding:'12px 14px'}},
    /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,fontSize:13,marginBottom:6}}, title, /*#__PURE__*/React.createElement("span", {style:{marginLeft:6,fontSize:11,color:MT}}, '(' + list.length + ')')),
    list.length ? list.slice(0, 15).map(render) : /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,padding:'6px 0'}}, empty),
    list.length > 15 && /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:MT,marginTop:4}}, '+' + (list.length - 15) + ' more in CE Monitoring'));
  return /*#__PURE__*/React.createElement("div", {style:{display:'flex',flexDirection:'column',gap:12}},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("div", {style:{fontSize:18,fontWeight:800}}, 'Good ' + (now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening') + ', ' + String(currentUser.name || me).split(' ')[0]),
      /*#__PURE__*/React.createElement("span", {style:{fontSize:12,color:MT}}, toSign.length + returned.length + overdue ? 'Here is what needs you today.' : 'Nothing urgent — you are all caught up.'),
      /*#__PURE__*/React.createElement("button", {style:{...btn('acc',true),marginLeft:'auto'},onClick:()=>setTab('info')}, "➕ Go to the CE editor")),
    /*#__PURE__*/React.createElement("div", {style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}},
      kpi('Awaiting my signature', toSign.length, 'approvals routed to you', toSign.length ? 'var(--accent-cyan)' : null),
      kpi('Open CEs assigned', open.length, overdue + ' overdue · ' + dueSoon + ' due ≤3 days', overdue ? ERR : null),
      kpi('Returned to me', returned.length, 'need changes', returned.length ? ERR : null),
      kpi('Submitted this month', subMonth.length, peso(subMonth.reduce((t, x) => t + N(x.e.grand), 0))),
      kpi('On-time rate', onTime == null ? '—' : onTime + '%', timed.length + ' CEs with a deadline', onTime != null && onTime < 80 ? ERR : '#16a34a'),
      kpi('Won ' + now.getFullYear(), won, lost + ' lost · ' + yr.length + ' CEs this year', '#16a34a')),
    /*#__PURE__*/React.createElement("div", {style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:12}},
      section('✍ For my approval', toSign, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,whiteSpace:'nowrap'}}, apv(x).signed + '/' + apv(x).total + ' signed'), viewBtn(x)), 'No CE is waiting on your signature.'),
      section('↩ Returned to me', returned, x => line(x, null, loadBtn(x)), 'Nothing returned.'),
      section('📂 My open CEs', open, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,fontWeight:700,whiteSpace:'nowrap',color:x.dl.late ? ERR : x.dl.days != null && x.dl.days <= 3 ? 'var(--accent-orange, #F07F12)' : MT}}, (x.m.status || 'Draft') + ' · ' + x.dl.label), [viewBtn(x), loadBtn(x)]), 'No open CEs assigned to you.'),
      section('📝 My drafts', drafts, d => /*#__PURE__*/React.createElement("div", {key: d.draftId, style:{display:'flex',alignItems:'center',gap:8,padding:'6px 2px',borderBottom:'1px solid '+alpha(BDR,'44'),fontSize:12}},
        /*#__PURE__*/React.createElement("b", {style:{...MONO,fontSize:11}}, (d.info && d.info.ceNum) || 'Untitled'),
        /*#__PURE__*/React.createElement("span", {style:{flex:1,color:MT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, ((d.info && d.info.client) || '') + ' · saved ' + new Date(d.savedAt).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})),
        /*#__PURE__*/React.createElement("button", {style:btn('acc',true),onClick:()=>resumeDraft(d)}, "Resume")), 'No saved drafts.'),
      section('⏳ My CEs in approval', inApproval, x => line(x, /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT,whiteSpace:'nowrap'}}, apv(x).signed + '/' + apv(x).total + ' signed · waiting on ' + (apv(x).waiting || []).join(', ')), viewBtn(x)), 'None of your CEs are in approval.'),
      forReview.length > 0 && section('🔎 For review (status For Approval)', forReview, x => line(x, null, viewBtn(x)), '')));
})(),

tab === 'dashboard' && (() => {
  const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();
  /* R01 of a CE is the same job, priced again. Counted as its own CE it was
     an extra row in every tally on this page and its whole value again in the
     pipeline -- so a job revised twice reported three times the money it could
     ever bring in. Every figure below is of the NEWEST revision only. */
  const liveOnly = rows => groupCERevisions(rows, h => (h.info && h.info.ceNum) || h.ceNum || '').map(g => g.head);
  const liveHist = liveOnly(history), liveRows = liveOnly(monRows);
  const supersededN = history.length - liveHist.length;
  const monthHist = liveHist.filter(h => { const d=new Date(h.savedAt||h.createdAt||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; });
  const totalThis = monthHist.reduce((s,h)=>s+N(h.grand||0),0);
  const avgVal = liveHist.length ? liveHist.reduce((s,h)=>s+N(h.grand||0),0)/liveHist.length : 0;
  const statuses = liveRows.map(h=>monOf(h).status||'Draft');
  /* An "open" CE is one still needing work. Submitted, No Quote and Cancelled
     CE_CLOSED_STATUSES are the end states -- everything else, Draft and On
     Hold included, is open.
     Sorted by deadline so the next thing due is the first thing read. A CE
     with no deadline set cannot be ranked, so it sorts to the bottom; as a
     plain string compare an empty deadline would sort to the very top and
     bury the genuinely urgent rows. */
  const openCEs = liveRows.map(h => ({h, m: monOf(h)}))
    .filter(x => ceIsOpen(x.m.status))
    .sort((a, b) => {
      const da = a.m.deadline || '', db = b.m.deadline || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : da > db ? 1 : 0;
    });
  const openValue = openCEs.reduce((t, x) => t + N(x.h.grand || 0), 0);
  const statusCount = statuses.reduce((m,s)=>{m[s]=(m[s]||0)+1;return m;},{});
  const clients = {}; liveHist.forEach(h=>{const c=h.info?.client||h.client||'Unknown';clients[c]=(clients[c]||{count:0,total:0});clients[c].count++;clients[c].total+=N(h.grand||0);});
  const top5 = Object.entries(clients).sort((a,b)=>b[1].total-a[1].total).slice(0,5);
  const prefixMap = {}; liveHist.forEach(h=>{const cn=(h.info?.ceNum||'').toUpperCase();const pfx=cn.split('-CE-')[0]||'?';prefixMap[pfx]=(prefixMap[pfx]||{count:0,total:0});prefixMap[pfx].count++;prefixMap[pfx].total+=N(h.grand||0);});
  const months=[]; for(let i=5;i>=0;i--){const d=new Date(thisYear,thisMonth-i,1);months.push({label:d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2),month:d.getMonth(),year:d.getFullYear()});}
  const monthTotals = months.map(m=>({...m,total:liveHist.filter(h=>{const d=new Date(h.savedAt||0);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).reduce((s,h)=>s+N(h.grand||0),0)}));
  const maxBar = Math.max(...monthTotals.map(m=>m.total),1);
  const kpiCard = (label,value,color) => /*#__PURE__*/React.createElement("div",{style:{background:SURF,border:'1px solid '+BDR,borderRadius:8,padding:'14px 18px',flex:1,minWidth:140}},
    /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:4}},label),
    /*#__PURE__*/React.createElement("div",{style:{fontSize:20,fontWeight:800,color:color||TX,...MONO}},value));
  return /*#__PURE__*/React.createElement("div",{style:{padding:'0 0 24px'}},
    /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:15,marginBottom:supersededN?4:16,color:ACC}}, "📊 Dashboard"),
    /* Said out loud, because a figure that quietly drops is a figure nobody
       trusts: these numbers moved the day revisions stopped being counted. */
    supersededN > 0 && /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT,marginBottom:16}},
      'Counting the newest revision of each CE — ' + supersededN + ' superseded revision' +
      (supersededN === 1 ? '' : 's') + ' excluded from every figure below.'),
    /* KPI row */
    /*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}},
      kpiCard('CEs This Month', monthHist.length, INFO),
      kpiCard('Value This Month', '₱'+ph(totalThis), OK),
      kpiCard('Avg CE Value', '₱'+ph(avgVal), ACC),
      kpiCard('Total CEs', history.length, MT),
      kpiCard('Open CEs', openCEs.length, ERR)),
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
    /* Open CEs, soonest deadline first */
    /*#__PURE__*/React.createElement("div",{style:{...CS,marginBottom:16}},
      /*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10,gap:10,flexWrap:'wrap'}},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,fontSize:12}}, "⏳ Open CEs — by deadline"),
        /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:MT}}, openCEs.length, " open · ",
          /*#__PURE__*/React.createElement("span",{style:{...MONO,color:OK}}, "₱"+ph(openValue)))),
      openCEs.length === 0
        ? /*#__PURE__*/React.createElement("div",{style:{textAlign:'center',padding:'14px 0',color:MT,fontSize:12,border:'1px dashed '+BDR,borderRadius:6}}, "Nothing open — every CE is Submitted, No Quote or Cancelled.")
        : /*#__PURE__*/React.createElement("div",null,
            /*#__PURE__*/React.createElement("div",{style:{overflowX:'auto'}},
              /*#__PURE__*/React.createElement("table",{style:{width:'100%',borderCollapse:'collapse',fontSize:11}},
                /*#__PURE__*/React.createElement("thead",null,/*#__PURE__*/React.createElement("tr",null,
                  ['CE No.','Client','Status','Deadline','Days Left','Total'].map(hd=>/*#__PURE__*/React.createElement("th",{key:hd,style:THS},hd)))),
                /*#__PURE__*/React.createElement("tbody",null, openCEs.slice(0,15).map(x=>{
                  const st = x.m.status || 'Draft';
                  const dl = x.m.deadline ? new Date(x.m.deadline+'T00:00:00') : null;
                  const days = dl ? Math.round((dl - new Date())/(1000*60*60*24)) : null;
                  const dCol = days === null ? MT : days < 0 ? ERR : days <= 7 ? 'var(--status-warning)' : OK;
                  return /*#__PURE__*/React.createElement("tr",{key:x.h.id},
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,color:INFO,fontWeight:600}}, x.h.info?.ceNum || x.h.ceNum || "—"),
                    /*#__PURE__*/React.createElement("td",{style:TDS}, x.h.info?.client || x.h.client || 'Unknown'),
                    /*#__PURE__*/React.createElement("td",{style:TDS}, /*#__PURE__*/React.createElement("span",{style:{background:getStatusColor(st)+'33',color:getStatusColor(st),borderRadius:4,padding:'1px 6px',fontWeight:700,whiteSpace:'nowrap'}}, st)),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,whiteSpace:'nowrap'}}, dl ? dl.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : "—"),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,color:dCol,fontWeight:700,whiteSpace:'nowrap'}}, days === null ? "—" : days < 0 ? Math.abs(days)+'d OD' : days+'d'),
                    /*#__PURE__*/React.createElement("td",{style:{...TDS,...MONO,fontSize:10,textAlign:'right'}}, "₱"+ph(N(x.h.grand||0))));
                }))),
            openCEs.length > 15 && /*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:MT,marginTop:8,textAlign:'center'}}, "+", openCEs.length-15, " more — see the CE Monitoring tab")))),
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
          /*#__PURE__*/React.createElement("span",{style:{background:alpha(ACC, '33'),color:ACC,borderRadius:4,padding:'0 6px',fontWeight:700}},c)))),
      /* Top clients */
      /*#__PURE__*/React.createElement("div",{style:CS},
        /*#__PURE__*/React.createElement("div",{style:{fontWeight:700,marginBottom:10,fontSize:12}}, "🏆 Top 5 Clients"),
        top5.map(([name,d],i)=>/*#__PURE__*/React.createElement("div",{key:name,style:{marginBottom:6,fontSize:11}},
          /*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between'}},
            /*#__PURE__*/React.createElement("span",{style:{color:i===0?ACC:TX}}, (i+1)+'. '+name),
            /*#__PURE__*/React.createElement("span",{style:{color:MT}},d.count,' CE')),
          /*#__PURE__*/React.createElement("div",{style:{...MONO,fontSize:10,color:OK}},'₱'+ph(d.total)))))));
})(), tab === 'info' && /*#__PURE__*/React.createElement("div", null,
  /* The checklist Sales filled in, read back where the estimator starts.
     Without this the form would be write-only: thirteen answers collected
     at the front door and never shown to the person they were collected
     for. Read-only here -- it is Sales's record of what they sent, and
     the estimator correcting it would erase what was actually received. */
  (info.rce && /*#__PURE__*/React.createElement(RceChecklistCard, {rce: info.rce})),
  companies.length === 0 && /*#__PURE__*/React.createElement("div", {style: {margin: '0 0 14px 0', padding: '12px 16px', background: '#F8514920', border: '1px solid #F85149', borderRadius: 8, color: ERR, fontSize: 12, fontWeight: 600}}, "⚠ No companies configured. Go to the Admin → Users tab and set up at least one company before creating a CE."), /*#__PURE__*/React.createElement("div", {
    style: CS
  }, secHead("Project Details", MT, null, {size: 11, mb: 14}), /*#__PURE__*/React.createElement("div", {
    style: {marginBottom: 16, padding: '12px 14px', background: '#A78BFA11', borderRadius: 8, border: '2px solid #A78BFA44', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'}
  }, /*#__PURE__*/React.createElement("div", {style: {flex: 1, minWidth: 200}},
    /*#__PURE__*/React.createElement("label", {style: {...LBL, color: 'var(--accent-violet)', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em'}}, "🏢 Issuing Company"),
    /*#__PURE__*/React.createElement("select", {
      style: INP,
      value: info.companyId != null ? info.companyId : (companies[0]||{}).id || '',
      onChange: e => {
        const rawId = e.target.value === '' ? null : (isNaN(e.target.value) ? e.target.value : Number(e.target.value));
        const selCo = companies.find(c => String(c.id) === String(rawId)) || companies[0];
        setInfo(p => {
          const pfx = ((selCo?.cePrefix || 'SHIC') + '-CE-').toUpperCase();
          const isDefault = !p.ceNum || p.ceNum.toUpperCase().startsWith(pfx) || /^[A-Z0-9]+-CE-\d{4}-\d+$/i.test(p.ceNum);
          const newCeNum = isDefault ? nextCeNumForCompany(history, selCo, ceNums) : p.ceNum;
          return {...p, companyId: rawId, ceNum: newCeNum};
        });
      }
    }, companies.map(c => /*#__PURE__*/React.createElement("option", {key: c.id, value: c.id}, c.name + (c.sub ? ' — ' + c.sub : ''))))
  ), (() => {
    const selCo = companies.find(c => String(c.id) === String(info.companyId != null ? info.companyId : (companies[0]||{}).id)) || companies[0] || {};
    return /*#__PURE__*/React.createElement("div", {style: {display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0}},
      selCo.logo && /*#__PURE__*/React.createElement("img", {src: selCo.logo, style: {maxWidth: 64, maxHeight: 32, objectFit: 'contain', background: '#fff', borderRadius: 4, padding: 3, border: `1px solid ${BDR}`}}),
      /*#__PURE__*/React.createElement("div", {style: {fontSize: 11, color: MT, lineHeight: 1.5}},
        /*#__PURE__*/React.createElement("div", null, "CE Prefix: ", /*#__PURE__*/React.createElement("b", {style: {color: TX}}, selCo.cePrefix || 'SHIC'), " → ", /*#__PURE__*/React.createElement("b", {style: {color: 'var(--accent-violet)'}}, (selCo.cePrefix||'SHIC')+'-CE-'+new Date().getFullYear()+'-XXXX')),
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
  }, "Discipline", /*#__PURE__*/React.createElement("span", { style: { color: ERR } }, " *")), /*#__PURE__*/React.createElement("select", {
    style: { ...INP, ...(info.projType ? {} : { borderColor: ERR }) },
    title: 'Required before the CE can be saved',
    value: info.projType || '',
    onChange: e => setInfo(p => ({
      ...p,
      projType: e.target.value
    }))
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "— Select discipline —"), /*#__PURE__*/React.createElement("option", {
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
    value: docStatus,
    title: openMonStatus
      ? 'Kept in step with the Monitoring status (' + openMonStatus + ')'
      : 'Seeds the Monitoring status when this CE is saved',
    onChange: e => setDocStatus(e.target.value)
  }, CE_DOC_STATUSES.map(s => /*#__PURE__*/React.createElement("option", {
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
  }, "Quantity (for unit price)"), /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 6 } }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...INP,
      ...MONO,
      flex: 1, minWidth: 0
    },
    type: "number",
    min: 1,
    value: info.qty,
    onChange: e => setInfo(p => ({
      ...p,
      qty: e.target.value
    }))
  }), /* A plain dropdown: a datalist only offered what matched the text
         already in the box, so with LOT in it LOT was the only choice. */
  (() => {
    const QTY_UOMS = ['LOT', 'PCS', 'SET', 'UNIT', 'EA', 'JOB', 'MANDAYS'];
    const cur = qtyUom;
    return /*#__PURE__*/React.createElement("select", {
      className: 'qty-uom',
      style: { ...INP, width: 100 },
      title: "The unit the Quantity is counted in. Prints after it: 3 PCS, 1 LOT.",
      value: cur,
      onChange: e => {
        let v = e.target.value;
        if (v === '__other') { v = String(window.prompt('Unit for the quantity (e.g. METERS, ROLLS):', '') || '').trim().toUpperCase(); if (!v) return; }
        setInfo(p => ({ ...p, qtyUom: v }));
      }
    }, (QTY_UOMS.includes(cur) ? QTY_UOMS : [...QTY_UOMS, cur]).map(u => /*#__PURE__*/React.createElement("option", { key: u, value: u }, u)),
      /*#__PURE__*/React.createElement("option", { value: '__other' }, "Other…"));
  })())), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: LBL
  }, "RCE No."), /*#__PURE__*/React.createElement("input", {
    className: 'info-rce',
    style: { ...INP, ...MONO },
    placeholder: "From Sales",
    value: info.rceNo !== undefined ? info.rceNo : rceNo,
    onChange: e => setInfo(p => ({ ...p, rceNo: e.target.value })),
    onBlur: e => { const v = e.target.value.trim(); if (openCeId != null && v !== String((monData[openCeId] || {}).rceNo || '')) updateMon(openCeId, 'rceNo', v); }
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
      borderColor: alpha(INFO, '44')
    }
  }, secHead("Client Document", INFO, null, {size: 11, mb: 12}), !docFile ? /*#__PURE__*/React.createElement("div", {
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
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleDocUpload(e.dataTransfer.files, true);
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
  }, "Drop files here or click to browse — several at once is fine"), /*#__PURE__*/React.createElement("div", {
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
    href: spAbsUrl(docFile.spUrl),
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
    title: 'Add more documents to this CE',
    onClick: () => fileRef.current?.click()
  }, "＋ Add files"), /*#__PURE__*/React.createElement("button", {
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
  }, "x"))), docFilesOf(docFile).length > 1 && /*#__PURE__*/React.createElement("div", {
    style: {display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10}
  }, docFilesOf(docFile).map(f => /*#__PURE__*/React.createElement("div", {
    key: f.name,
    style: {display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 10px', background: SURF, border: '1px solid ' + BDR, borderRadius: 6}
  }, /*#__PURE__*/React.createElement("span", {style: {flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, '📄 ' + f.name),
    f.size > 0 && /*#__PURE__*/React.createElement("span", {style: {color: MT, fontSize: 10}}, Math.round(f.size / 1024) + ' KB'),
    f.spUrl && /*#__PURE__*/React.createElement("a", {href: spAbsUrl(f.spUrl), target: '_blank', style: {color: INFO, textDecoration: 'none', fontSize: 10}}, 'open'),
    /*#__PURE__*/React.createElement("button", {
      title: 'Remove ' + f.name + ' from this CE',
      style: {background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 13, padding: '0 4px'},
      onClick: () => removeDoc(f.name)
    }, '×')))), docPreview && docFile.text && /*#__PURE__*/React.createElement("div", {
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
      background: alpha(ERR, '15'),
      border: `1px solid ${alpha(ERR, '44')}`,
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
    multiple: true,
    style: {
      display: 'none'
    },
    onChange: e => {
      if (e.target.files && e.target.files.length) handleDocUpload(e.target.files, true);
      e.target.value = '';
    }
  })), ScopeBuilder(), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(ACC, '55')
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
      background: alpha(ERR, '15'),
      border: `1px solid ${alpha(ERR, '44')}`,
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
    /* Shared expense line-item table.

       NOT a component: declared inside render, its function identity is new
       on every keystroke, so React threw the whole table away and built it
       again -- taking the focused input with it. That is why a rate had to be
       clicked once per character. It is called as a plain function instead,
       so the inputs are part of this render's own tree and keep their focus. */
    /* Manpower charged to mobilization / demobilization: travel days, the
       crew's first-day induction. Lives in the same list as the expenses,
       marked kind 'mp'; the expense table below filters these out. */
    const MobMpTable = ({ rows: all, setRows, idPfx, color }) => {
      const rows = all.filter(r => r.kind === 'mp');
      const otM = ceOtMult(rr);
      const upd = (id, patch) => setRows(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
      const E = React.createElement;
      const num = (r, k, w, min) => E("td", { style: TDS }, E(NumBox, { style: { ...INP, ...MONO, width: w }, min, value: r[k], onCommit: v => upd(r.id, { [k]: v }) }));
      return E("div", { style: { marginBottom: 14 } },
        E("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
          E("span", { style: { fontSize: 11, fontWeight: 700, color: color || ACC, letterSpacing: .5 } }, "MANPOWER"),
          E("div", { style: { display: 'flex', gap: 6 } },
            E("button", { style: btn('acc', true), title: 'One line per role from the Manpower in the SOW Breakdown -- the most pax on any day shift plus any night shift. It stays in sync as the crew changes; days and OT hours are yours to set.',
              onClick: () => { if (!consolidateCrew(mp).length) { showToast('No manpower in the SOW Breakdown yet.', true); return; } setRows(p => syncMealRows(syncCrewRows(p, true), true, 'rate', false)); } }, rows.some(r => r.auto) ? "⟳ Re-sync crew from SOW" : "⟳ Crew from SOW Breakdown"),
            all.some(r => r.kind === 'meal') && E("button", { style: btn('info', true), title: 'Set every meal allowance line on this CE (mobilization, demobilization, accommodation) to the current Masterlist rate', onClick: syncMealRates }, "↺ Sync meal rates"),
            E("button", { style: btn('def', true), onClick: () => setRows(p => [...p, { id: uid(), kind: 'mp', desc: '', qty: 1, days: 1, rate: 0, otHours: 0 }]) }, "+ Add Manpower"))),
        rows.length === 0 ? E("div", { style: { textAlign: 'center', padding: '10px 0', color: MT, fontSize: 12, border: '1px dashed ' + BDR, borderRadius: 6 } }, "No manpower charged to this stage.") :
        E("div", { style: { overflowX: 'auto' } }, E("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
          E("thead", null, E("tr", null, ['#', 'Manpower loading', 'Pax', 'Days', 'Rate/day (P)', 'OT hrs/day', 'Rate OT/hr', 'Total', ''].map(h => E("th", { key: h, style: THS }, h)))),
          E("tbody", null, rows.map((r, _ix) => {
            const tot = mobRowCost(r, rr);
            return E("tr", { key: r.id }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), 
              r.auto ? E("td", { style: TDS }, E("span", { style: { fontSize: 12 } }, r.desc), E("span", { title: 'Linked to the SOW Breakdown crew', style: { marginLeft: 6, fontSize: 9, fontWeight: 700, color: OK, border: '1px solid ' + alpha(OK, '66'), borderRadius: 4, padding: '0 4px' } }, "SOW")) :
              E("td", { style: TDS },
                E("input", { style: { ...INP, minWidth: 200 }, list: idPfx + r.id, value: r.desc, placeholder: "e.g. Supervisor, Welder...",
                  onChange: e => { const dv = e.target.value; const f = (masterlist.manpower || []).find(m => m.role === dv); upd(r.id, { desc: dv, ...(f ? { rate: f.rate } : {}) }); } }),
                E("datalist", { id: idPfx + r.id }, (masterlist.manpower || []).map(m => E("option", { key: m.id || m.role, value: m.role })))),
              r.auto ? E("td", { style: TDS }, E(NumBox, { style: { ...INP, ...MONO, width: 52, ...(r.paxSet ? { borderColor: ACC } : {}) }, min: 0, value: r.qty,
                title: r.paxSet ? 'Set by hand -- the crew count is no longer applied. Clear it to follow the SOW Breakdown again.' : 'From the SOW Breakdown crew. Type to override.',
                onCommit: v => upd(r.id, { qty: v, paxSet: true }) }),
                r.paxSet && E("button", { title: 'Follow the SOW Breakdown crew again', style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11 },
                  onClick: () => { const c = consolidateCrew(mp).find(x => x.role.toUpperCase() === String(r.desc || '').toUpperCase()); upd(r.id, { paxSet: false, qty: c ? c.pax : r.qty }); } }, "↺")) : num(r, 'qty', 52, 1), num(r, 'days', 52, 1),
              r.auto ? E("td", { style: TDS }, E(NumBox, { style: { ...INP, ...MONO, width: 96, ...(r.rateSet ? { borderColor: ACC } : {}) }, min: 0, value: r.rate,
                title: r.rateSet ? 'Set by hand -- the Manpower day rate is no longer applied. Clear it to follow the Manpower again.' : 'From the Manpower day rate. Type to override.',
                onCommit: v => upd(r.id, { rate: v, rateSet: true }) }),
                r.rateSet && E("button", { title: 'Follow the Manpower day rate again', style: { background: 'none', border: 'none', color: MT, cursor: 'pointer', fontSize: 11 },
                  onClick: () => { const c = consolidateCrew(mp).find(x => x.role.toUpperCase() === String(r.desc || '').toUpperCase()); upd(r.id, { rateSet: false, rate: c ? c.rate : r.rate }); } }, "↺")) : num(r, 'rate', 96, 0), num(r, 'otHours', 52, 0),
              E("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'right' } }, "P", ph(N(r.rate) / 8 * otM)),
              E("td", { style: { ...TDS, ...MONO, color: tot > 0 ? color || ACC : MT, fontWeight: 700, textAlign: 'right', minWidth: 100 } }, "P", ph(tot)),
              E("td", { style: TDS }, E("button", { onClick: () => setRows(p => p.filter(x => x.id !== r.id)), style: { background: 'none', border: 'none', color: ERR, cursor: 'pointer', fontSize: 15, padding: '1px 5px' } }, "x")));
          }))),
          E("div", { style: { textAlign: 'right', marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + BDR, color: color || ACC, fontWeight: 700, fontSize: 12 } },
            "Sub total: ", E("span", { style: MONO }, rows.reduce((s, r) => s + N(r.qty), 0) + " pax · P" + ph(rows.reduce((s, r) => s + mobRowCost(r, rr), 0))))));
    };
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
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Description', 'Qty', 'Days', 'Rate (P)', 'Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, _ix) => {
      const tot = N(r.qty) * N(r.days) * N(r.rate);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
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
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 52
        },
        min: 1,
        value: r.qty,
        onCommit: v => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          qty: v
        } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 52
        },
        min: 1,
        value: r.days,
        onCommit: v => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          days: v
        } : xr))
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 96
        },
        min: 0,
        value: r.rate,
        onCommit: v => setRows(p => p.map(xr => xr.id === r.id ? {
          ...xr,
          rate: v
        } : xr))
      }),
      /*#__PURE__*/React.createElement(RateHistory, {
        kind: 'vehicles',
        name: r.desc,
        onPick: v => setRows(p => p.map(xr => xr.id === r.id ? { ...xr, rate: v } : xr))
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
        borderColor: alpha(INFO, '44')
      }
    }, secHead("Mobilization Expenses", INFO, "Manpower and each charge as separate line items", {size: 11, mb: 12}), MobMpTable({
      rows: mobVehicles,
      setRows: setMobVehicles,
      idPfx: "mm",
      color: INFO
    }), ExpenseTable({
      rows: mobVehicles.filter(r => r.kind !== 'mp'),
      setRows: setMobVehicles,
      idPfx: "mv",
      color: INFO
    }), mobVehiclesT > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 10,
        borderTop: `1px solid ${alpha(INFO, '44')}`,
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
        borderColor: alpha(ACC, '44')
      }
    }, secHead("Demobilization Expenses", ACC, "Manpower and each charge as separate line items", {size: 11, mb: 12}), MobMpTable({
      rows: demobVehicles,
      setRows: setDemobVehicles,
      idPfx: "dm",
      color: ACC
    }), (() => {
      /* Most demobilization charges repeat the mobilization ones. Food
         allowance and the crew linked to the SOW are left out: both are
         counted from the Manpower on their own. "(MOB)" becomes "(DEMOB)". */
      const src = mobVehicles.filter(r => r.kind !== 'meal' && !(r.kind === 'mp' && r.auto));
      if (!src.length) return null;
      const ren = d => String(d || '').replace(/\(MOB\)/gi, '(DEMOB)').replace(/\bMOBILIZATION\b/gi, 'DEMOBILIZATION');
      const have = new Set(demobVehicles.map(r => String(r.desc || '').trim().toUpperCase()));
      const dup = r => have.has(ren(r.desc).trim().toUpperCase());
      if (!mobCopy) return /*#__PURE__*/React.createElement("div", { style: { display: 'flex', justifyContent: 'flex-end', margin: '4px 0 10px' } },
        /*#__PURE__*/React.createElement("button", {
          style: btn('info', true),
          title: 'Copy some or all mobilization items here. Food allowance and the SOW crew are not copied -- they come from the Manpower.',
          onClick: () => setMobCopy(new Set(src.filter(r => !dup(r)).map(r => r.id)))
        }, "\u29c9 Copy from Mobilization"));
      const all = src.every(r => mobCopy.has(r.id));
      return /*#__PURE__*/React.createElement("div", { style: { border: '1px solid ' + alpha(ACC, '44'), borderRadius: 8, padding: 10, margin: '4px 0 12px', background: alpha(ACC, '08') } },
        /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
          /*#__PURE__*/React.createElement("b", { style: { fontSize: 12, color: ACC } }, "Copy from Mobilization"),
          /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: MT } }, "Food allowance and the SOW crew are counted from the Manpower, so they are not listed."),
          /*#__PURE__*/React.createElement("button", { style: { ...btn('def', true), marginLeft: 'auto', fontSize: 10, padding: '2px 8px' },
            onClick: () => setMobCopy(all ? new Set() : new Set(src.map(r => r.id))) }, all ? "None" : "All")),
        src.map((r, i) => /*#__PURE__*/React.createElement("label", { key: r.id, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '2px 0', cursor: 'pointer' } },
          /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: mobCopy.has(r.id),
            onChange: () => setMobCopy(p => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }) }),
          /*#__PURE__*/React.createElement("span", { style: { color: MT, width: 18 } }, i + 1),
          /*#__PURE__*/React.createElement("span", { style: { flex: 1 } }, ren(r.desc) || '(no description)', r.kind === 'mp' ? ' \u00b7 manpower' : ''),
          dup(r) && /*#__PURE__*/React.createElement("span", { style: { fontSize: 10, color: ACC } }, "already in demob"),
          /*#__PURE__*/React.createElement("span", { style: { ...MONO, color: MT } }, N(r.qty) + " \u00d7 " + (N(r.days) || 1) + "d \u00d7 " + ph(N(r.rate))))),
        /*#__PURE__*/React.createElement("div", { style: { display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 } },
          /*#__PURE__*/React.createElement("button", { style: btn('def', true), onClick: () => setMobCopy(null) }, "Cancel"),
          /*#__PURE__*/React.createElement("button", { style: btn('acc', true), disabled: !mobCopy.size,
            onClick: () => {
              const pick = src.filter(r => mobCopy.has(r.id)).map(r => ({ ...r, id: uid(), desc: ren(r.desc) }));
              setDemobVehicles(p => [...p, ...pick]);
              setMobCopy(null);
              showToast(pick.length + ' item(s) copied to Demobilization.');
            } }, "Copy " + mobCopy.size + " item(s)")));
    })(), ExpenseTable({
      rows: demobVehicles.filter(r => r.kind !== 'mp'),
      setRows: setDemobVehicles,
      idPfx: "dv",
      color: ACC
    }), demobVehiclesT > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right',
        marginTop: 10,
        borderTop: `1px solid ${alpha(ACC, '44')}`,
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
        borderColor: alpha(OK, '44'),
        background: alpha(OK, '08')
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
      borderColor: alpha(INFO, '44'),
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
  }, "Rows are grouped by shift type. Add under the shift you need."),
  /* The OT factor sits with the shift multipliers because it is one: the two
     compound on every overtime hour, and having one editable while the other
     stayed a constant would have been the more confusing half-measure. */
  /*#__PURE__*/React.createElement("span", {
    style: {display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 10, color: MT}
  }, "OT rate", /*#__PURE__*/React.createElement("input", {
    key: 'otm' + ceOtMult(rr),
    defaultValue: ceOtMult(rr),
    type: "number", min: "0", step: "0.05",
    title: "What an overtime hour costs, as a multiple of the hourly rate (day rate / 8). Default "
      + stdRates().otMult + "×. It compounds with the shift multiplier, so a night OT hour is "
      + (ceOtMult(rr) * ceShiftMult(rr, 'regular_night')).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
      + "× the hourly rate.",
    style: {
      ...INP, ...MONO, width: 54, padding: '2px 4px', fontSize: 10, fontWeight: 700,
      textAlign: 'right', color: ceOtMult(rr) === stdRates().otMult ? TX : ACC
    },
    onBlur: ev => {
      const v = parseFloat(ev.target.value);
      setRates(p => {
        const n = {...p};
        if (!isFinite(v) || v <= 0 || v === OT_MULT_DEFAULT) delete n.otMult; else n.otMult = v;
        return n;
      });
    }
  }), "×"))), Object.entries(SHIFTS).map(([shiftKey, shiftInfo]) => {
    const rows = mp.filter(r => r.shift === shiftKey);
    const shiftMult = ceShiftMult(rr, shiftKey);
    /* Overtime included -- see mpWage. Left out, this disagreed with the row
       totals printed directly above it and with the C.1–C.4 subtotal below. */
    const shiftSub = rows.reduce((s, r) => s + mpWage(r), 0);
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
    const shiftColor = shiftKey.startsWith('regular') ? INFO : shiftKey.startsWith('sunday') ? 'var(--accent-violet)' : ERR;
    return /*#__PURE__*/React.createElement("div", {
      key: shiftKey,
      style: {
        ...CS,
        padding: collapsed ? '10px 14px' : 16,
        borderColor: rows.length > 0 ? alpha(shiftColor, '55') : BDR,
        /* A shift carrying people is ringed rather than only tinted: on the
           light canvas a tint alone is nearly invisible against the card. */
        boxShadow: rows.length > 0
          ? '0 0 0 1px ' + alpha(shiftColor, '33') + ', var(--card-shadow)'
          : 'var(--card-shadow)',
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
    }, shiftInfo.label),
    /* The pill is the field. The statutory figures are the defaults, not the
       law of the app -- DOLE changes, and a CE agreed at a negotiated rate is
       a real thing. Edited here it is stored on THIS CE, so nothing already
       saved reprices.

       Uncontrolled with an onBlur: keystroke state would recost every row in
       the tab on each digit, and "1." is not a multiplier. */
    /*#__PURE__*/React.createElement("span", {
      onClick: e => e.stopPropagation(),
      style: {
        display: 'inline-flex', alignItems: 'center', gap: 1,
        background: alpha(shiftColor, '22'),
        color: shiftColor,
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 5px 1px 7px',
        borderRadius: 3
      }
    }, /*#__PURE__*/React.createElement("input", {
      key: 'sm' + shiftKey + shiftMult,
      defaultValue: shiftMult,
      type: "number", min: "0", step: "0.05",
      title: "Multiplier for this shift on this CE. Company standard " + stdRates().shiftMults[shiftKey] + "\u00d7."
        + (shiftMult !== stdRates().shiftMults[shiftKey] ? " Differs from the standard." : ""),
      style: {
        ...INP, ...MONO, width: 42, padding: 0, border: 'none', background: 'transparent',
        color: 'inherit', fontSize: 10, fontWeight: 700, textAlign: 'right'
      },
      onBlur: ev => {
        const v = parseFloat(ev.target.value);
        setRates(p => {
          const m = {...(p.shiftMults || {})};
          /* Back to the statutory figure rather than storing a copy of it, so
             a CE only carries what actually differs. */
          if (!isFinite(v) || v <= 0 || v === shiftInfo.mult) delete m[shiftKey];
          else m[shiftKey] = v;
          return {...p, shiftMults: m};
        });
      }
    }), "\u00d7",
    shiftMult !== stdRates().shiftMults[shiftKey] && /*#__PURE__*/React.createElement("span", {
      title: "Company standard is " + stdRates().shiftMults[shiftKey] + "\u00d7",
      style: {marginLeft: 3, opacity: .75}
    }, "\u25cf"),
    rows.length > 0 ? " Multiplier" : ""),
    /* The head count and the subtotal are stated even at zero. Hidden, an
       empty shift and a shift nobody has opened look identical, and the row
       silently changes shape the moment the first person is added. */
    /*#__PURE__*/React.createElement("span", {
      style: {
        color: shiftWorkers > 0 ? MT : 'var(--text-muted)',
        fontSize: 11
      }
    }, shiftWorkers, " worker", shiftWorkers !== 1 ? 's' : ''))), /*#__PURE__*/React.createElement("span", {
      style: {
        ...MONO,
        color: shiftSub > 0 ? shiftColor : 'var(--text-muted)',
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0
      }
    }, "\u20b1", ph(shiftSub)), /*#__PURE__*/React.createElement("div", {
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
    }, "↺ Sync Rates"),
    /* Consolidates the crew the way the estimate is actually priced: MAX of the
       pax and the SUM of the days. One electrician on task 1 and three on task
       2 is three electricians mobilised for both durations -- they are on site
       and paid whether or not every task needs all of them. The total goes UP,
       and that is the point; adding the rows up understates what the job costs.

       OT hours per day and the incentive are per-day RATES, so the peak is carried
       across the whole duration for the same reason the pax is.

       The row keeps what each task originally asked for, so SOW Breakdown still
       lists it under both and splits its cost between them in proportion. */
    /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      title: "Combine rows for the same role into the crew you actually mobilise: the largest PAX any task needs, for the total number of days",
      onClick: () => {
        const key = r => [String(r.role || '').trim().toUpperCase(), N(r.rate)].join('|');
        const rows = mp.filter(r => r.shift === shiftKey && r.role);
        const groups = {};
        rows.forEach(r => { (groups[key(r)] = groups[key(r)] || []).push(r); });
        const dupes = Object.values(groups).filter(g => g.length > 1);
        if (!dupes.length) { showToast('No repeated roles in this shift — nothing to consolidate.', true); return; }
        const before = rows.reduce((a, r) => a + rowCost('mp', r), 0);
        const plan = dupes.map(g => {
          const pax = Math.max(...g.map(r => N(r.pax)));
          const days = g.reduce((a, r) => a + N(r.days), 0);
          return { g, pax, days, role: g[0].role };
        });
        const preview = plan.map(p2 =>
          '  ' + p2.role + ':  ' + p2.g.map(r => N(r.pax) + ' pax x ' + N(r.days) + 'd').join('  +  ') +
          '   ->   ' + p2.pax + ' pax x ' + p2.days + ' days').join('\n');
        if (!confirm('Consolidate ' + plan.length + ' role' + (plan.length === 1 ? '' : 's') +
          ' into the crew you mobilise?\n\n' + preview +
          '\n\nThe largest PAX any task needs, kept for the total number of days. ' +
          'This normally COSTS MORE than the rows added up, because the crew is on site for the whole duration.' +
          '\n\nSOW Breakdown will still show each role under every task it serves, with the cost split between them.')) return;
        const drop = new Set(), patch = {};
        plan.forEach(p2 => {
          const keep = p2.g[0];
          /* Record what each task asked for BEFORE the merge, so the breakdown
             can split the consolidated cost back out in proportion. */
          const shares = p2.g.flatMap(r => (rowShares(r) || [{ taskId: r.taskId || '', weight: _weight('mp', r) }]));
          patch[keep.id] = {
            pax: p2.pax, days: p2.days,
            otHours: Math.max(...p2.g.map(r => N(r.otHours || 0))),
            perDiem: Math.max(...p2.g.map(r => N(r.perDiem || 0))),
            shares: shares.filter(x => x.taskId)
          };
          p2.g.slice(1).forEach(r => drop.add(r.id));
        });
        setMp(p2 => p2.filter(r => !drop.has(r.id)).map(r => patch[r.id] ? { ...r, ...patch[r.id] } : r));
        const after = plan.reduce((a, p2) => a + p2.pax * p2.days * N(p2.g[0].rate) * shiftMult, 0)
          + rows.filter(r => !dupes.flat().includes(r)).reduce((a, r) => a + rowCost('mp', r), 0);
        showToast('Consolidated ' + plan.length + ' role' + (plan.length === 1 ? '' : 's') + '. ' +
          (after > before ? 'The manpower cost rose — the crew is now costed for the whole duration.' : 'Totals updated.'));
      }
    }, "⇊ Consolidate crew"), /*#__PURE__*/React.createElement("label", {
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
    }, /*#__PURE__*/React.createElement("div", {style: {color: MT, fontSize: 10, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em'}}, "Copy to shift:"), Object.entries(SHIFTS).filter(([sk]) => sk !== shiftKey).map(([sk, sv]) => /*#__PURE__*/React.createElement("button", {
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
        background: sk.startsWith('regular') ? INFO : sk.startsWith('sunday') ? 'var(--accent-violet)' : ERR,
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
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Role / Position', 'PAX', 'Days', 'OT Hrs/Day', 'Day Rate (P)'].concat((sowItems || []).length ? ['Scope Task'] : []).concat(['Row Total', '']).map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, _ix) => {
      const {reg: regAmt, ot: otAmt, total: tot} = mpWageParts(r);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
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
          /* The Masterlist is where a role's figures come from -- its day rate
             AND its incentive. Only the rate was being copied, so a role typed
             here arrived with no incentive at all: the C.7 line read P0.00
             against a Masterlist that says P200, and the CE charged the P0.
             The ML button and Sync Rates always copied both; this path was the
             one that did not.

             Matched case-insensitively, the way Sync Rates matches it, so a
             role typed in lower case finds its entry too.

             Copied onto the row rather than read from the list on the fly:
             what a CE charges has to be settled when it is quoted, or editing
             the Masterlist next month silently reprices every estimate already
             sent out. Sync Rates is how a row is deliberately brought back up
             to date. */
          const f = masterlist.manpower.find(m => m.role && m.role.toUpperCase() === ro.toUpperCase());
          setMp(p => p.map(x => x.id === r.id ? {
            ...x,
            role: ro,
            ...(f ? {rate: f.rate, perDiem: f.perDiem !== undefined ? f.perDiem : x.perDiem} : {})
          } : x));
        },
        placeholder: "Role name..."
      }), /*#__PURE__*/React.createElement("datalist", {
        id: 'rl' + r.id
      }, masterlist.manpower.map(m => /*#__PURE__*/React.createElement("option", {
        key: m.id,
        value: m.role
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 50
        },
        min: 1,
        intOnly: true,
        value: r.pax,
        onCommit: v => updRow(setMp, r.id, 'pax', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 50
        },
        min: 1,
        intOnly: true,
        value: r.days,
        onCommit: v => updRow(setMp, r.id, 'days', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 58,
          borderColor: N(r.otHours) > 0 ? alpha(ACC, '88') : BDR
        },
        min: 0,
        step: 0.5,
        value: r.otHours || 0,
        onCommit: v => updRow(setMp, r.id, 'otHours', v),
        title: "Overtime hours PER DAY, charged at " + ceOtMult(rr) + "× the hourly rate (day rate / 8) for every day in the Days column. 3 hrs over 10 days = 30 OT hours."
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 90
        },
        min: 0,
        value: r.rate,
        onCommit: v => updRow(setMp, r.id, 'rate', v)
      }),
      /*#__PURE__*/React.createElement(RateHistory, {
        kind: 'mp',
        name: r.role,
        onPick: v => updRow(setMp, r.id, 'rate', v)
      }),
      /* The average stays: it answers "is this rate normal" at a glance, which
         is a different question from "what exactly did we charge, and when".
         The clock beside it answers that one. */
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
      ),
      /* Which scope task this row belongs to. Two rows for the same role are
         normal once tasks own their resources -- one crew on 1.1, another on
         1.2 -- but with nothing on screen saying so the tab just looked like it
         had failed to merge them. */
      (sowItems || []).length > 0 && /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: { ...INP, width: 150, fontSize: 10, padding: '3px 4px' },
        value: r.taskId || '',
        title: "The scope task this row is costed under. Change it here or in SOW Breakdown.",
        onChange: e => updRow(setMp, r.id, 'taskId', e.target.value)
      },
        /*#__PURE__*/React.createElement("option", { value: '' }, "— unassigned —"),
        (sowItems || []).map(it => /*#__PURE__*/React.createElement("option", { key: it.id, value: it.id },
          (sowLabels[it.id] || '') + '  ' + (it.text || '(untitled)').slice(0, 28)))
      )), /*#__PURE__*/React.createElement("td", {
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
      }, "OT: \u20b1", ph(N(r.pax) * N(r.days) * (N(r.otHours) / 8) * N(r.rate) * ceOtMult(rr) * shiftMult))), /*#__PURE__*/React.createElement("td", {
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
    })), /* SUB TOTAL for the shift, as the printed CE shows it: headcount under
       PAX, cost under Row Total. */
    rows.length > 0 && /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", {
      style: { borderTop: '2px solid ' + BDR }
    }, /*#__PURE__*/React.createElement("td", {
      colSpan: 2,
      style: { ...TDS, textAlign: 'right', fontWeight: 700, fontSize: 11, color: MT }
    }, "SUB TOTAL ", /*#__PURE__*/React.createElement("span", {
      title: "This shift's multiplier on this CE -- already applied to the total",
      style: { ...MONO, color: shiftColor }
    }, "(\u00d7" + shiftMult + ")"), ":"), /*#__PURE__*/React.createElement("td", {
      style: { ...TDS, ...MONO, fontWeight: 700, color: shiftColor, paddingLeft: 12 }
    }, rows.reduce((t, r) => t + (String(r.role || '').trim() ? N(r.pax) : 0), 0), " pax"), /*#__PURE__*/React.createElement("td", {
      colSpan: (sowItems || []).length ? 4 : 3,
      style: TDS
    }), /*#__PURE__*/React.createElement("td", {
      style: { ...TDS, ...MONO, fontWeight: 700, color: shiftColor, textAlign: 'right' }
    }, "₱", ph(shiftSub)), /*#__PURE__*/React.createElement("td", {
      style: TDS
    })))))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(ACC, '55'),
      background: alpha(ACC, '08')
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
  }, "C.1\u2013C.4 Subtotal"), /*#__PURE__*/React.createElement("div", {
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
  }, secHead("Manpower Total", ACC, null, {size: 11, mb: 2}), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 800,
      fontSize: 18,
      color: ACC
    }
  }, "P", ph(mpTot)))))), mp.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      ...CS,
      borderColor: alpha(ACC, '44'),
      marginTop: 8
    }
  }, secHead("C.7 Benefits & Others", ACC, "Standard Philippine mandated formula", {size: 12, mb: 12}), /*#__PURE__*/React.createElement("div", {
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
  }, "SIL"), /*#__PURE__*/React.createElement("th", {
    style: { ...THS, textAlign: 'right', width: 70 },
    title: rr.eccRule === 'month' ? 'ECC: P30 per person per month, shared across the shifts they work' : 'ECC: P30 per person on each shift entry'
  }, "ECC"), incOn && /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 90
    }
  }, cfg.incentive === 'site' ? /*#__PURE__*/React.createElement("span", {
    title: "Shop + Site: counted only on rows assigned to Site scope items (SOW Breakdown). Shop days earn none."
  }, "Incentive (site) ⓘ") : "Incentive"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 100,
      background: alpha(ACC, '22'),
      color: ACC
    }
  }, "Total"))), /*#__PURE__*/React.createElement("tbody", null, (() => {
    /* Straight off benefitRows -- the same rows the printed CE and both
       exports use, computed by calcBen.

       This block used to recompute all five benefits itself, and took the
       incentive from the MASTERLIST entry for the role rather than from the
       row. So a role the list gives a P200 incentive showed INCENTIVE P200 and
       a row total of P307.27, while C.5, the sub-total under this very table,
       the manpower total and the CE itself all charged P107.27. The screen
       was showing P200 that nothing was billing. The row is the source of
       truth for cost everywhere else in this app, so it is here too -- and
       the incentive is now editable on the row, below, rather than being
       whatever the masterlist happens to say today. */
    return benefitRows.map((g, rowIdx) => {
      const cell = (v, extra) => /*#__PURE__*/React.createElement("td", {
        style: {...TDS, textAlign: 'right', ...MONO, ...(extra || {})}
      }, "P", ph(v));
      /* Editing a merged line writes the rate to every shift entry for that
         role -- the line is one role, however many shifts it was split over,
         and an incentive that differed between them could not be shown here. */
      const setIncentive = v => setMp(p => p.map(x =>
        String(x.role || '').trim().toUpperCase() === String(g.role).trim().toUpperCase()
          ? {...x, perDiem: v} : x));
      const rowIncentive = (() => {
        const mine = mp.filter(x => String(x.role || '').trim().toUpperCase() === String(g.role).trim().toUpperCase());
        const first = mine.length ? N(mine[0].perDiem || 0) : 0;
        return mine.every(x => N(x.perDiem || 0) === first) ? first : null;   /* null = mixed */
      })();
      /* Null when the role is not in the Masterlist at all -- which is not the
         same as a role the Masterlist prices at zero, and must not read as a
         disagreement worth flagging. */
      const mlIncentive = (() => {
        const m = (masterlist.manpower || []).find(x => x.role &&
          x.role.trim().toUpperCase() === String(g.role).trim().toUpperCase());
        return m ? N(m.perDiem || 0) : null;
      })();
      /* One line per shift, under the role that subtotals them.

         A role split over a regular day, a Sunday and a holiday used to be a
         single line, and two columns cannot honestly summarise three different
         day types: the pax read as a crew, the days as one shift's length, and
         the P30 ECC inside SIL & ECC -- charged once per shift entry -- was
         invisible. The role line is now a SUBTOTAL, and each shift is shown
         underneath with its own figures, exactly as calcBen computed them. */
      const kids = (g.shiftDays || []).length > 1 ? g.shiftDays.map((x, i) =>
        /*#__PURE__*/React.createElement("tr", {
          key: g.role + ':' + x.shift + ':' + i,
          style: {background: alpha(SURF, '55'), fontSize: 11}
        },
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT, fontSize: 10}},
            (rowIdx + 1) + '.' + (i + 1)),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, paddingLeft: 22, color: MT}},
            "↳ " + ((SHIFTS[x.shift] || {}).label || x.shift)),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', ...MONO, color: MT}}, x.pax),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT}}, "pax"),
          /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', ...MONO, color: MT}}, x.days),
          cell(x.monthlyRate, {color: MT}), cell(x.thirteenth, {color: MT}), cell(x.sss, {color: MT}),
          cell(x.hdmf, {color: MT}),
          /*#__PURE__*/React.createElement("td", {
            style: {...TDS, textAlign: 'right', ...MONO, color: MT},
            /* The flat ECC is charged once per shift entry, so a role on three
               day types carries it three times. Said out loud on the line it
               happens, rather than buried in a subtotal. */
            title: 'Service incentive leave, 5 days a year'
          }, "P", ph(x.sil - x.ecc)),
          /*#__PURE__*/React.createElement("td", {
            style: {...TDS, textAlign: 'right', ...MONO, color: MT},
            title: rr.eccRule === 'month' ? 'This shift\u2019s share of P30 per person per month' : 'P30 per person, charged once on each shift entry -- the rule this CE was quoted on'
          }, "P", ph(x.ecc)),
          incOn && cell(x.perdiem, {color: MT}),
          cell(x.total, {color: MT})
        )) : [];
      const head = /*#__PURE__*/React.createElement("tr", {
        key: g.role,
        style: {background: rowIdx % 2 === 0 ? 'transparent' : alpha(SURF, '88')}
      },
        /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT, fontSize: 10}}, rowIdx + 1),
        /*#__PURE__*/React.createElement("td", {style: TDS},
          /*#__PURE__*/React.createElement("div", {style: {fontWeight: 600, fontSize: 12}}, g.role || '--'),
          kids.length ? /*#__PURE__*/React.createElement("div", {style: {fontSize: 10, color: MT}},
            "subtotal of " + kids.length + " shift entries" +
            (g.paxDay && g.paxNight ? "  ·  " + g.paxDay + " day + " + g.paxNight + " night" : "")) : null),
        /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', ...MONO}}, g.pax),
        /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'center', color: MT}}, "pax"),
        /*#__PURE__*/React.createElement("td", {
          style: {...TDS, textAlign: 'center', ...MONO},
          title: g.daysVary
            ? 'One line for ' + g.shiftDays.length + ' shift rows. QTY is ' + g.paxDay + ' on days + ' +
              g.paxNight + ' on nights -- the same person works the regular, Sunday and holiday DAYS, but ' +
              'nobody works a day and that night. QTY x DAYS is the ' + ph(g.manDays) +
              ' man-days the benefits are charged on. ' +
              g.shiftDays.map(x => (SHIFTS[x.shift] || {label: x.shift}).label + ': ' + x.pax + ' x ' + x.days + 'd').join(', ')
            : undefined
        }, g.days, g.daysVary ? ' *' : ''),
        cell(g.monthlyRate, {color: MT}),
        cell(g.thirteenth), cell(g.sss), cell(g.hdmf), cell(g.sil - (g.ecc || 0)), cell(g.ecc || 0),
        incOn && /*#__PURE__*/React.createElement("td", {style: {...TDS, textAlign: 'right'}},
          rowIncentive === null
            ? /*#__PURE__*/React.createElement("span", {
                style: {...MONO, color: MT, fontSize: 11},
                title: "This role carries different incentives on different shifts. Edit them on the shift rows above."
              }, "P" + ph(g.perdiem) + " *")
            : /*#__PURE__*/React.createElement("div", {style: {display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end'}},
                /* What the Masterlist says for this role, when the row does not
                   say the same. A CE quoted last month keeps the figure it was
                   quoted at -- the list must never reprice it on its own -- but
                   the estimator has to be able to SEE that the two differ, and
                   take the new one deliberately. Same idea as Sync Rates, for
                   one figure on one line. */
                mlIncentive !== null && mlIncentive !== rowIncentive && /*#__PURE__*/React.createElement("button", {
                  style: {...btn('info', true), fontSize: 9, padding: '1px 5px'},
                  title: "The Masterlist has P" + ph(mlIncentive) + " per day for " + g.role +
                         ". Click to use it on this CE. Sync Rates does the same for the whole shift.",
                  onClick: () => setIncentive(mlIncentive)
                }, "ML P" + ph(mlIncentive)),
                /*#__PURE__*/React.createElement(NumBox, {
                  style: {...INP, ...MONO, width: 84, textAlign: 'right', fontSize: 11},
                  min: 0, value: rowIncentive, placeholder: "0",
                  title: "Incentive PER DAY, per person, charged as part of C.5 Benefits & Others. It comes from the Masterlist when the role is picked or typed, and Sync Rates brings it up to date. Typed here, it applies to this CE only.",
                  onCommit: setIncentive
                }))),
        cell(g.total, {color: ACC, fontWeight: 700, background: alpha(ACC, '0A')})
      );
      return kids.length ? [head, ...kids] : head;
    });
  })()), /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: alpha(ACC, '14'),
      borderTop: `2px solid ${alpha(ACC, '44')}`,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 2,
    style: { ...TDS, textAlign: 'right', color: ACC, fontSize: 11 }
  }, "Total manpower:"), /*#__PURE__*/React.createElement("td", {
    /* The headcount the rows above carry -- each role's day plus night crew. */
    style: { ...TDS, ...MONO, color: ACC, textAlign: 'center' }
  }, benefitRows.reduce((t, r) => t + N(r.pax), 0), " pax"), /*#__PURE__*/React.createElement("td", {
    colSpan: incOn ? 9 : 8,
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
    /* The sum of the rows above it, so this footer can never report a figure
       the table it sits under does not add up to. Equal to `ben` -- the one
       the CE is costed on -- and tools/test-manpower-totals.js keeps it so. */
  }, "P", ph(benefitsT)))))))), tab === 'tools' && /*#__PURE__*/React.createElement(ResTab, {
    rows: tools,
    set: setTools,
    total: toolsT,
    label: "Tools & Equipment (BOTE)",
    mlType: "tools",
    addToML: list => addRowsToML('tools', list),
    showDays: true,
    /* Lives on info, so it rides to SharePoint inside shicInfo with no column
       of its own and comes back with the CE. */
    defaultTier: N(info.toolTier) || 2,
    setDefaultTier: v => setInfo(p => ({...p, toolTier: v})),
    showPower: powerOn,
    kwhRate,
    pwrFrac,
    readFile: readDoc,
    /* A rate equal to the default is removed rather than stored, so a CE that
       was never touched is not frozen against a future change to it -- the
       same rule the shift multipliers follow. */
    setKwhRate: v => setRates(p => {
      const n = {...p}, f = parseFloat(v);
      if (!isFinite(f) || f < 0 || f === KWH_RATE_DEFAULT) delete n.kwhRate; else n.kwhRate = f;
      return n;
    }),
    /* The CE's own duration, offered as the days to charge the equipment for.
       With 900 rows on a CE, typing it into each one is not a thing anyone
       will do -- so it is one click, and it is the number already on the
       Project Info tab rather than a second one to keep in step. */
    ceDays: N(info.days) || 0,
    masterlist, showToast, setPicker
  }), tab === 'materials' && /*#__PURE__*/React.createElement(ResTab, {
    rows: mats,
    set: setMats,
    total: matsT,
    label: "Materials & Consumables (BOCM)",
    mlType: "materials",
    addToML: list => addRowsToML('materials', list),
    /* The same reader the Tools tab has. A BOM or a PPE issue list
       arrives as the same kind of list -- description, quantity,
       unit -- and was being typed in by hand only because the tab
       was never handed the reader. */
    readFile: readDoc,
    masterlist, showToast, setPicker
  }), tab === 'ppe' && /*#__PURE__*/React.createElement(ResTab, {
    rows: ppe,
    set: setPpe,
    total: ppeT,
    label: "Personal Protective Equipment (PPE)",
    mlType: "ppe",
    addToML: list => addRowsToML('ppe', list),
    /* The same reader the Tools tab has. A BOM or a PPE issue list
       arrives as the same kind of list -- description, quantity,
       unit -- and was being typed in by hand only because the tab
       was never handed the reader. */
    readFile: readDoc,
    masterlist, showToast, setPicker
  }), tab === 'misc' && /*#__PURE__*/React.createElement("div", null, (MISC_DEF[ceType] || MISC_DEF.onsite).map(([miscKey, label]) => {
    const rows = Array.isArray(misc[miscKey]) ? misc[miscKey] : [];
    const catTotal = rows.reduce((s, r) => s + miscRowCost(r), 0);
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
    }, "From Masterlist"), miscKey === 'accommodation' && /*#__PURE__*/React.createElement("button", {
      style: btn('acc', true),
      title: 'Meal allowance per category (PM, admin, skilled manpower): pax from the crew, days from the shifts. Stays in sync with the Manpower.',
      onClick: () => { if (!consolidateCrew(mp).length) { showToast('No manpower yet.', true); return; } setMisc(p => ({ ...p, accommodation: syncMealRows(Array.isArray(p.accommodation) ? p.accommodation : [], true, 'cost', true) })); }
    }, "🍽 Food allowance from crew"), miscKey === 'accommodation' && rows.some(r => r.kind === 'meal') && /*#__PURE__*/React.createElement("button", {
      style: btn('info', true),
      title: 'Set every meal allowance line on this CE (mobilization, demobilization, accommodation) to the current Masterlist rate',
      onClick: syncMealRates
    }, "↺ Sync meal rates"), /*#__PURE__*/React.createElement("button", {
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
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['#', 'Description', 'Qty', 'UOM', 'Days', 'Unit Cost (P)', 'Total', ''].map(h => /*#__PURE__*/React.createElement("th", {
      key: h,
      style: THS
    }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, _ix) => {
      const tot = miscRowCost(r);
      return /*#__PURE__*/React.createElement("tr", {
        key: r.id
      }, /*#__PURE__*/React.createElement("td", { style: { ...TDS, ...MONO, color: MT, textAlign: 'center', width: 28 } }, _ix + 1), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, r.auto && /*#__PURE__*/React.createElement("span", { title: 'Counted from the crew -- follows the Manpower', style: { float: 'right', marginTop: 6, fontSize: 9, fontWeight: 700, color: OK, border: '1px solid ' + alpha(OK, '66'), borderRadius: 4, padding: '0 4px' } }, "CREW"), /*#__PURE__*/React.createElement("input", {
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
      }), Array.isArray(r.parts) && r.parts.length > 0 && /*#__PURE__*/React.createElement("div", {
        style: { marginTop: 4, fontSize: 10, color: MT, lineHeight: 1.5 }
      }, r.parts.map((p, j) => /*#__PURE__*/React.createElement("div", { key: j, style: { display: 'flex', gap: 8 } },
        /*#__PURE__*/React.createElement("span", { style: { flex: 1, paddingLeft: 10 } }, "\u2013 " + p.label),
        /*#__PURE__*/React.createElement("span", { style: MONO }, N(p.qty) + " pax \u00d7 " + N(p.days) + (N(p.days) === 1 ? " day" : " days"))))), /*#__PURE__*/React.createElement("datalist", {
        id: 'mc' + miscKey + r.id
      }, (masterlist.vehicles || []).map(mlItem => /*#__PURE__*/React.createElement("option", {
        key: mlItem.id,
        value: mlItem.desc
      })))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, Array.isArray(r.parts) && r.parts.length ? /*#__PURE__*/React.createElement("span", { style: { ...MONO, paddingLeft: 8 }, title: 'The crew in this category -- counted from the Manpower' }, N(r.qty)) : /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 58
        },
        min: 1, intOnly: true,
        value: r.qty || 1,
        onCommit: v => updItem(r.id, 'qty', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement("select", {
        style: {
          ...INP,
          width: 72
        },
        value: uomCase(r.uom || 'Lot'),
        onChange: e => updItem(r.id, 'uom', e.target.value)
      }, uomOptionEls(r.uom || 'Lot'))), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, Array.isArray(r.parts) && r.parts.length ? /*#__PURE__*/React.createElement("span", { style: { ...MONO, paddingLeft: 8 }, title: 'Pax-days / crew, like DAYS on Benefits & Others. The total is charged on the sub-items below the description, not on this rounded figure.' }, N(r.days), " *") : /*#__PURE__*/React.createElement(NumBox, {
        style: { ...INP, ...MONO, width: 58 },
        min: 1,
        value: r.days || 1,
        onCommit: v => updItem(r.id, 'days', v)
      })), /*#__PURE__*/React.createElement("td", {
        style: TDS
      }, /*#__PURE__*/React.createElement(NumBox, {
        style: {
          ...INP,
          ...MONO,
          width: 96
        },
        min: 0,
        value: r.cost || 0,
        onCommit: v => updItem(r.id, 'cost', v)
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
      background: alpha(ACC, '08'),
      borderColor: alpha(ACC, '44'),
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
    /* One deleted line inside a summed callout is the dangerous case: the
       number still looks plausible, it is just short by that line. */
    const dangling = (addlCosts || []).filter(r => hlMissing(r).length);
    if (dangling.length) add('err', dangling.length + ' highlighted cost' + (dangling.length === 1 ? '' : 's') + ' point at a cost that no longer exists.', 'summary');
    if (!(approvers || []).some(a => (a.name || '').trim())) add('warn', 'No approvers named.', 'summary');

    const errs = issues.filter(i => i.sev === 'err').length;
    const warns = issues.length - errs;
    const clean = issues.length === 0;

    return /*#__PURE__*/React.createElement("div", {
      style: { ...CS, marginBottom: 10, borderColor: clean ? alpha(OK, '55') : errs ? alpha(ERR, '55') : '#F59E0B55' }
    },
      /*#__PURE__*/React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        /*#__PURE__*/React.createElement("span", {
          style: {
            fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
            color: clean ? OK : errs ? ERR : 'var(--status-warning)'
          }
        }, clean ? "✓ CE Audit — complete" : "⚠ CE Audit"),
        /* Counts as chips, in the severity's own colour. The old run-on --
           "2 to fix · 2 to review" -- made the more urgent half the harder
           one to pick out. */
        !clean && errs > 0 && /*#__PURE__*/React.createElement("span", {
          style: {
            background: alpha(ERR, '22'), color: ERR, border: `1px solid ${alpha(ERR, '55')}`,
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10
          }
        }, errs, " item", errs === 1 ? '' : 's', " to fix"),
        !clean && warns > 0 && /*#__PURE__*/React.createElement("span", {
          style: {
            background: alpha('var(--status-warning)', '22'), color: 'var(--status-warning)',
            border: `1px solid ${alpha('var(--status-warning)', '55')}`,
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10
          }
        }, warns, " to review"),
        clean && /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: MT } }, "No issues found."),
        /*#__PURE__*/React.createElement("span", { style: { ...MONO, marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: grand > 0 ? ACC : MT } }, "₱" + ph(grand))
      ),
      /* Pills rather than a stacked list. Each finding is a self-contained
         thing to go and fix, and a column of them reads as one long paragraph
         of problems -- which is how the shorter ones got skipped. */
      !clean && /*#__PURE__*/React.createElement("div", { style: { marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 } },
        issues.map((i, n) => {
          const c = i.sev === 'err' ? ERR : 'var(--status-warning)';
          return /*#__PURE__*/React.createElement("div", {
            key: n,
            style: {
              display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 11,
              padding: '6px 10px', borderRadius: 8, flex: '1 1 260px', minWidth: 0,
              background: alpha(c, '11'), border: `1px solid ${alpha(c, '44')}`
            }
          },
            /*#__PURE__*/React.createElement("span", { style: { color: c, fontWeight: 700, flexShrink: 0 } }, i.sev === 'err' ? "●" : "○"),
            /*#__PURE__*/React.createElement("span", { style: { flex: 1, minWidth: 0 } },
              i.msg,
              i.hint && /*#__PURE__*/React.createElement("span", { style: { color: MT, display: 'block', fontSize: 10, marginTop: 1 } }, i.hint)
            ),
            i.tabId && i.tabId !== 'summary' && /*#__PURE__*/React.createElement("button", {
              style: {
                background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                color: c, fontWeight: 700, fontSize: 10, fontFamily: 'inherit', padding: 0
              },
              onClick: () => setTab(i.tabId)
            }, i.sev === 'err' ? "Fix →" : "View →")
          );
        })
      )
    );
  })(),
  /* Feature 12: AI Cost Suggestion banner */
  /*#__PURE__*/React.createElement("div", {style:{marginBottom:12,display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}},
    /*#__PURE__*/React.createElement("button", {
      style:{...btn('def',true),borderColor:'#A78BFA55',color:'var(--accent-violet)'},
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
      /*#__PURE__*/React.createElement("div", {style:{fontWeight:700,color:'var(--accent-violet)',marginBottom:6}}, "💡 Based on "+aiSuggest.n+" similar "+ceType+" CEs:"),
      /*#__PURE__*/React.createElement("div", {style:{display:'flex',gap:16,flexWrap:'wrap'}},
        [['Grand Total','grand',ACC],['Manpower','mp',INFO],['Tools','tools',OK],['Materials','mats','var(--brand-accent)'],['PPE','ppe',ERR]].map(([label,key,color])=>
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
  /* Services summary card -- per CE on/off, with the lines it will print */
  /*#__PURE__*/React.createElement("div", {style:{...CS, marginBottom:10}},
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}},
      /*#__PURE__*/React.createElement("label", {style:{display:'flex',alignItems:'center',gap:6,fontWeight:700,fontSize:12,cursor:'pointer'}},
        /*#__PURE__*/React.createElement("input", {type:'checkbox', checked:!!info.showServices, onChange:e=>{const v=e.target.checked; setInfo(p=>({...p, showServices:v}));}}),
        "Services summary on this CE"),
      /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:11}}, "— restate the total by service (Sand Blasting Works, Welding Works...) under the cost summary")
    ),
    /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:10,marginBottom:6,fontStyle:'italic'}},
      "Name each main scope item's service group on the SOW Breakdown tab. Whatever no group carries prints as Other misc. to the project, so the services always add up to the Grand Total."),
    info.showServices && (servicesSummary.lines.length === 0
      ? /*#__PURE__*/React.createElement("div", {style:{color:ACC,fontSize:11}}, "No scope item has a service group yet, so nothing will print. ",
          /*#__PURE__*/React.createElement("button", {style:{...btn('def',true),fontSize:10}, onClick:()=>setTab('sowbreak')}, "Go to SOW Breakdown"))
      : /*#__PURE__*/React.createElement("table", {style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
          !servicesSummary.ok && /*#__PURE__*/React.createElement("caption", {style:{captionSide:'bottom',color:ERR,fontSize:11,textAlign:'left',paddingTop:4}},
            "The services add up to more than the Grand Total, so a cost is being counted under two services. The block will not print until that is fixed."),
          /*#__PURE__*/React.createElement("tbody", null,
            servicesSummary.lines.map(l => /*#__PURE__*/React.createElement("tr", {key:l.key},
              /*#__PURE__*/React.createElement("td", {style:{padding:'2px 4px'}}, l.label.toUpperCase(), /*#__PURE__*/React.createElement("span", {style:{color:MT,fontSize:10}}, "  (scope " + l.items.map(id => sowLabels[id] || '').join(', ') + ")")),
              /*#__PURE__*/React.createElement("td", {style:{...MONO,textAlign:'right',padding:'2px 4px'}}, "₱" + ph(l.v)))),
            /*#__PURE__*/React.createElement("tr", null,
              /*#__PURE__*/React.createElement("td", {style:{padding:'2px 4px',color:MT}}, "OTHER MISC. TO THE PROJECT"),
              /*#__PURE__*/React.createElement("td", {style:{...MONO,textAlign:'right',padding:'2px 4px',color:servicesSummary.ok?TX:ERR}}, "₱" + ph(servicesSummary.other))),
            /*#__PURE__*/React.createElement("tr", {style:{borderTop:'1px solid ' + BDR,fontWeight:700}},
              /*#__PURE__*/React.createElement("td", {style:{padding:'2px 4px'}}, "SERVICES TOTAL AMOUNT"),
              /*#__PURE__*/React.createElement("td", {style:{...MONO,textAlign:'right',padding:'2px 4px'}}, "₱" + ph(servicesSummary.total)))))
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
      "These are already included in the Grand Total — they are shown separately on the CE, never added on top. Link one to a whole section, to a single line, or tick several lines to show them as one figure."),
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
        const keys = hlKeys(r), gone = hlMissing(r), linked = keys.length > 0;
        const open = hlPick === r.id;
        /* Toggling one source in or out. The first pick also names the row, so
           the common case -- call out one line by its own name -- takes a
           single click. `src` is cleared as soon as a list exists so the two
           can never both be live and disagree about what the row points at. */
        const toggle = k => setAddlCosts(p=>p.map(x=>{
          if (x.id!==r.id) return x;
          const cur = hlKeys(x);
          const next = cur.indexOf(k) >= 0 ? cur.filter(v=>v!==k) : [...cur, k];
          const hit = hlSources.find(o=>o.k===k);
          return {...x, srcs: next, src: '', desc: undefined,
                  label: (hlLabel(x) || (next.length===1 && hit ? hit.l : ''))};
        }));
        /* What the closed button says. One source reads as its own name; a sum
           has to say how many lines it is made of, or a deleted line inside it
           would never be noticed. */
        const summary = !linked ? '— type amount manually —'
          : keys.length === 1
            ? (gone.length ? '⚠ linked cost no longer exists'
                           : (hlSources.find(o=>o.k===keys[0])||{}).l)
            : keys.length + ' lines' + (gone.length ? '  ⚠ ' + gone.length + ' missing' : '');
        const groups = [];
        hlSources.forEach(o=>{ if (groups.indexOf(o.g) < 0) groups.push(o.g); });
        const q = hlPickQ.trim().toLowerCase();
        return /*#__PURE__*/React.createElement(React.Fragment, {key:r.id},
        /*#__PURE__*/React.createElement("tr", null,
          /*#__PURE__*/React.createElement("td", {style:TDS},
            /*#__PURE__*/React.createElement("input", {
              style:{...INP,width:'100%'},
              value:hlLabel(r),
              placeholder:"e.g. Delivery to Pagbilao, Unit Price per Set...",
              onChange:e=>setAddlCosts(p=>p.map(x=>x.id===r.id?{...x,label:e.target.value,desc:undefined}:x))
            })
          ),
          /*#__PURE__*/React.createElement("td", {style:TDS},
            /*#__PURE__*/React.createElement("button", {
              style:{...INP,width:'100%',fontSize:11,textAlign:'left',cursor:'pointer',
                     color: gone.length ? ERR : (linked ? OK : MT),
                     borderColor: open ? OK : undefined},
              title: linked ? 'Click to change which costs this adds up' : 'Click to link this to costs already in the CE',
              onClick:()=>{ setHlPick(open?null:r.id); setHlPickQ(''); }
            }, summary + (open ? '  ▾' : '  ▸'))
          ),
          /*#__PURE__*/React.createElement("td", {style:{...TDS,textAlign:'right'}},
            linked
              ? /*#__PURE__*/React.createElement("span", {
                  style:{...MONO,fontSize:12,color:gone.length?ERR:OK},
                  title: gone.length ? 'A cost this points at was removed from the CE — the amount shown is short by it.' : 'Linked — updates automatically when these costs change'
                }, gone.length && keys.length === 1 ? '⚠ —' : '₱' + ph(hlAmt(r)))
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
        ),
        /* The picker, in a row of its own under the one being edited rather
           than floating over it -- the running subtotal has to stay readable
           beside the CE totals while lines are being ticked. */
        open && /*#__PURE__*/React.createElement("tr", null,
          /*#__PURE__*/React.createElement("td", {colSpan:4, style:{...TDS,padding:0}},
            /*#__PURE__*/React.createElement("div", {style:{border:'1px solid '+alpha(OK,'66'),borderRadius:6,padding:8,margin:'2px 0 8px'}},
              /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}},
                /*#__PURE__*/React.createElement("input", {
                  style:{...INP,flex:'1 1 200px',fontSize:11},
                  value:hlPickQ, autoFocus:true,
                  placeholder:"Filter — type part of a line, role or section name...",
                  onChange:e=>setHlPickQ(e.target.value)
                }),
                /*#__PURE__*/React.createElement("span", {style:{...MONO,fontSize:12,color:OK,fontWeight:700}},
                  keys.length ? (keys.length + (keys.length===1?' line · ₱':' lines · ₱') + ph(hlAmt(r))) : 'nothing picked'),
                keys.length > 0 && /*#__PURE__*/React.createElement("button", {
                  style:{...btn('def',true),fontSize:10},
                  title:"Unlink every source and go back to typing the amount by hand",
                  onClick:()=>setAddlCosts(p=>p.map(x=>x.id===r.id?{...x,srcs:[],src:'',amount:N(hlAmt(x))}:x))
                }, "Type manually instead"),
                /*#__PURE__*/React.createElement("button", {
                  style:{...btn('ok',true),fontSize:10},
                  onClick:()=>setHlPick(null)
                }, "Done")
              ),
              /* A key that no longer matches anything in the CE cannot be
                 offered in the list below, so it is shown here -- otherwise
                 the only way to clear it would be to delete the whole row. */
              gone.map(k=>/*#__PURE__*/React.createElement("div", {key:k,
                style:{fontSize:11,color:ERR,display:'flex',alignItems:'center',gap:6,marginBottom:4}},
                "⚠ a cost this points at was deleted from the CE",
                /*#__PURE__*/React.createElement("button", {style:{...btn('danger',true),fontSize:10,padding:'1px 6px'},
                  onClick:()=>toggle(k)}, "remove it")
              )),
              /*#__PURE__*/React.createElement("div", {style:{maxHeight:260,overflowY:'auto'}},
                groups.map(g=>{
                  const inGroup = hlSources.filter(o=>o.g===g &&
                    (!q || (g + ' ' + o.l).toLowerCase().indexOf(q) >= 0));
                  if (!inGroup.length) return null;
                  return /*#__PURE__*/React.createElement("div", {key:g,style:{marginBottom:6}},
                    /*#__PURE__*/React.createElement("div", {style:{fontSize:10,fontWeight:700,color:MT,textTransform:'uppercase',letterSpacing:.5,padding:'2px 0'}}, g),
                    inGroup.map(o=>{
                      const on = keys.indexOf(o.k) >= 0;
                      return /*#__PURE__*/React.createElement("label", {key:o.k,
                        style:{display:'flex',alignItems:'center',gap:8,fontSize:11,padding:'3px 6px',
                               borderRadius:4,cursor:'pointer',background:on?alpha(OK,'1A'):'transparent'}},
                        /*#__PURE__*/React.createElement("input", {type:'checkbox',checked:on,onChange:()=>toggle(o.k)}),
                        /*#__PURE__*/React.createElement("span", {style:{flex:1}}, o.l),
                        /*#__PURE__*/React.createElement("span", {style:{...MONO,fontSize:11,color:MT}}, '₱' + ph(o.v))
                      );
                    })
                  );
                }),
                q && !hlSources.some(o=>(o.g + ' ' + o.l).toLowerCase().indexOf(q) >= 0) &&
                  /*#__PURE__*/React.createElement("div", {style:{color:MT,fontSize:11,fontStyle:'italic',padding:'6px 2px'}},
                    'Nothing in this CE matches "' + hlPickQ.trim() + '".')
              )
            )
          )
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
  }, ceTypeLabel(ceKey).toUpperCase()))))), /*#__PURE__*/React.createElement("td", {
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
      background: alpha(INFO, '18'),
      border: `1px solid ${alpha(INFO, '44')}`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 10,
      color: INFO
    }
  }, "Doc: ", docFile.name, docFile.spUrl && /*#__PURE__*/React.createElement("a", {
    href: spAbsUrl(docFile.spUrl),
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
  }, /* Grouped by what they do -- keep, re-price, produce, send -- and each
     explains itself on hover. */
  /*#__PURE__*/React.createElement("div", {
    title: "Saving and drafts",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Keep"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def'),
      background: '#8B5CF611',
      borderColor: '#8B5CF644',
      color: 'var(--accent-violet)',
      position: 'relative'
    },
    onClick: () => {
      loadSharedDrafts();
      setDraftsOpen(true);
    },
    title: "Open the list of unsaved drafts — yours and the team's — and pick one up where it was left."
  }, "\uD83D\uDCCB Resume Work", sharedDrafts.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -4,
      right: -4,
      background: 'var(--accent-violet)',
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
    style: {
      ...btn('def'),
      background: '#8B5CF622',
      borderColor: '#8B5CF655',
      color: 'var(--accent-violet)'
    },
    onClick: saveDraft,
    title: "Park unfinished work as a draft the team can see and pick up. Saving the CE clears it."
  }, "\u2B07 Draft"), /*#__PURE__*/React.createElement("button", {
    title: "Save this CE and share it with the team (Ctrl+S). The CE Number must be unique.",
    style: { ...btn('acc'), fontWeight: 800, padding: '6px 18px' },
    onClick: handleSave
  }, "Save"), /*#__PURE__*/React.createElement("button", {
    title: "Save a copy of this CE as its next revision (-R1, -R2…); the original is kept.",
    style: {
      ...btn('def'),
      background: alpha(INFO, '22'),
      borderColor: alpha(INFO, '55'),
      color: INFO
    },
    onClick: handleSaveRevision,
    title: 'Save as ' + ((info.ceNum || 'CE') + '-Rn revision')
  }, "\u21BB Revise")), /*#__PURE__*/React.createElement("div", {
    title: "Re-pricing from the Masterlist",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Prices"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn('def'),
      background: alpha(OK, '22'),
      borderColor: alpha(OK, '55'),
      color: OK
    },
    onClick: syncRatesFromML,
    title: "Re-price every matching row from the Masterlist. A saved CE keeps the price it was quoted at until you press this."
  }, "\u21BA Sync Rates")), /*#__PURE__*/React.createElement("div", {
    title: "Print and export",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Output"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#58A6FF55', color: INFO},
    onClick: handlePrintPreview,
    title: "See the printed CE on screen before printing. Nothing is sent to the printer."
  }, "👁 Preview"), /*#__PURE__*/React.createElement("button", {
    title: "Open the official CE form in a print window — print it or save it as PDF. Warns first about ₱0 items.",
    style: btn('info'),
    onClick: handleGenerateCEWithCheck
  }, "🖨 Generate CE"), /*#__PURE__*/React.createElement("button", {
    style: btn('ok'),
    onClick: handleExportXLSX,
    title: "Excel copy of the printed CE, page for page, with every column: OT hours, AOT, each benefit separately."
  }, "Export Detailed"), /*#__PURE__*/React.createElement("button", {
    style: { ...btn('def'), borderColor: alpha(ACC, '66'), color: ACC },
    onClick: handleExport,
    title: "Excel in the SY3 master CE workbook layout (BOL, BOTE, BOCM…): shorter, the same 7 columns on every sheet."
  }, "Export CE Template")), /*#__PURE__*/React.createElement("div", {
    title: "Share with others",
    style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', border: '1px solid ' + BDR, borderRadius: 8, padding: '3px 6px' }
  }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 9, fontWeight: 700, letterSpacing: .6, color: MT, textTransform: 'uppercase' } }, "Send"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#3FB95055', color: OK},
    onClick: () => {
      try {
        const d = {info, ceType, mp, tools, mats, ppe, misc, notes, approvers, sowItems, mobVehicles, demobVehicles};
        const url = window.location.href.split('?')[0] + '?draft=' + btoa(JSON.stringify(d));
        navigator.clipboard.writeText(url).then(() => showToast('🔗 Share link copied to clipboard!')).catch(() => { prompt('Copy this link:', url); });
      } catch(e) { showToast('Failed to generate share link.', true); }
    },
    title: "Copy a link that opens this CE as it is now in someone else's app. Anyone with the link sees the figures."
  }, "🔗 Share"), /*#__PURE__*/React.createElement("button", {
    style: {...btn('def'), borderColor: '#A371F755', color: '#A371F7'},
    title: "Start an email to the approvers with the CE number, client and cost summary filled in.",
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
  }, "📧 Notify")))), /*#__PURE__*/React.createElement("div", {
    style: {display:'flex',alignItems:'center',gap:8,margin:'0 0 10px 0',flexWrap:'wrap'}
  },
    /*#__PURE__*/React.createElement("span", {style:{fontSize:11,color:MT}}, "Summary sheet:"),
    Object.keys(SUMMARY_LAYOUTS).map(k => /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setInfo(p => ({...p, sumFmt: k})),
      title: k === 'elec'
        ? 'Manpower by shift, benefits on their own line, each section’s parts carrying the figures. As SY3-F-ACF-009 reads.'
        : 'One line per section, with Miscellaneous itemised beside it.',
      style: {fontSize:11,fontWeight:700,padding:'4px 12px',borderRadius:6,cursor:'pointer',
        border: '1px solid ' + (ceLayoutKey === k ? 'transparent' : BDR),
        background: ceLayoutKey === k ? ACC : 'transparent',
        color: ceLayoutKey === k ? ON_ACC : MT}
    }, SUMMARY_LAYOUTS[k].label)),
    /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:MT}},
      info.sumFmt ? "Chosen for this CE." : "Following the discipline — pick one to fix it for this CE.")),
  /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: THS
  }, "Cost Group / Scope Classification"), /*#__PURE__*/React.createElement("th", {
    style: THS
  }, "Internal Verification Notes"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right'
    }
  }, "Computed Cost (₱)"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...THS,
      textAlign: 'right',
      width: 74
    }
  }, "% Total Share"))), /*#__PURE__*/React.createElement("tbody", null, summaryRows.map(([label, val]) => /*#__PURE__*/React.createElement("tr", {
    key: label
  }, /*#__PURE__*/React.createElement("td", {
    style: TDS
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
      marginRight: 8, verticalAlign: 'middle', flexShrink: 0,
      background: val > 0 ? summaryDot(label) : BDR
    }
  }), label), /*#__PURE__*/React.createElement("td", {
    style: {...TDS, width: '38%'}
  },
  /* Typed by whoever built the estimate, for whoever reviews it. Not derived:
     a sentence the app made up about a cost group would read as verification
     on a document that goes to a client, and nothing would have verified it.

     Uncontrolled with an onBlur, like the monitoring cells -- keystroke state
     here would re-render the whole summary on every letter. */
  /*#__PURE__*/React.createElement("input", {
    key: 'vn' + label,
    defaultValue: verifyNotes[label] || '',
    placeholder: '—',
    style: {
      ...INP, background: 'transparent', border: 'none', padding: '2px 0',
      fontSize: 11, color: verifyNotes[label] ? TX : MT
    },
    onBlur: ev => {
      const v = ev.target.value;
      if (v === (verifyNotes[label] || '')) return;
      setVerifyNotes(p => { const n = {...p}; if (v.trim()) n[label] = v; else delete n[label]; return n; });
    }
  })), /*#__PURE__*/React.createElement("td", {
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
      background: alpha(ACC, '14'),
      borderTop: `2px solid ${alpha(ACC, '55')}`
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      fontWeight: 800,
      color: ACC,
      paddingTop: 12,
      paddingBottom: 12
    }
  }, "TOTAL DIRECT PROJECT COST"), /*#__PURE__*/React.createElement("td", {
    /* The notes column has no total. Without a cell for it the amount and the
       share both slide one column left of the figures they belong under. */
    style: TDS
  }), /*#__PURE__*/React.createElement("td", {
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
  }, "₱", ph(grand)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      textAlign: 'right',
      color: MT,
      paddingTop: 12
    }
  }, "100%")), showUnitP && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      color: MT
    }
  }, "Unit Price (qty ", info.qty || 1, perJobT ? ", excl. per-job costs" : "", ")",
    /* Which costs are charged once for the job rather than per unit. */
    /*#__PURE__*/React.createElement("div", { style: { marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 } },
      /*#__PURE__*/React.createElement("span", { title: 'Ticked costs are the same whatever the quantity, so they are left out of the unit price and shown on their own line.' }, "Charged once per job:"),
      [...(mobT > 0 ? [['mobdemob', 'Mob/Demob']] : []), ...(MISC_DEF[ceType] || MISC_DEF.onsite)
        .filter(([k]) => (Array.isArray(misc[k]) ? misc[k] : []).some(r => miscRowCost(r) > 0))
        .map(([k, l]) => [k, String(l).replace(/^[A-Z]\.\d+\s*/, '')])].map(([k, l]) =>
        /*#__PURE__*/React.createElement("label", { key: k, style: { display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer', border: '1px solid ' + BDR, borderRadius: 10, padding: '1px 8px', color: perJob.includes(k) ? ACC : MT } },
          /*#__PURE__*/React.createElement("input", { type: 'checkbox', checked: perJob.includes(k),
            onChange: e => setInfo(p => { const cur = Array.isArray(p.perJob) ? p.perJob : []; return { ...p, perJob: e.target.checked ? [...cur.filter(x => x !== k), k] : cur.filter(x => x !== k) }; }) }), l)))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...TDS,
      ...MONO,
      textAlign: 'right',
      color: INFO
    }
  }, "P", ph(unitP)), /*#__PURE__*/React.createElement("td", {
    style: TDS
  })), showUnitP && perJobT > 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    style: { ...TDS, color: MT }
  }, "Charged once per job (", perJobNames, ")"), /*#__PURE__*/React.createElement("td", {
    style: { ...TDS, ...MONO, textAlign: 'right', color: ACC }
  }, "P", ph(perJobT)), /*#__PURE__*/React.createElement("td", {
    style: TDS
  })), /*#__PURE__*/React.createElement("tr", {
    style: {background: alpha(OK, '10'), borderTop: `2px solid ${alpha(OK, '44')}`}
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
      borderColor: alpha(INFO, '44')
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
      background: alpha(ACC, '22'),
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
    return /*#__PURE__*/React.createElement("div", { style: { ...CS, borderColor: alpha(INFO, '44') } },
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
  }, "Signatories", ceDefaults.length > 0 && /*#__PURE__*/React.createElement("button", {
    /* The notes and signatories stop following the CE type once anyone edits
       them -- deliberately, so typed names are never thrown away. This puts
       them back when that is what you actually wanted. */
    style: {...btn('def', true), fontSize: 9, padding: '2px 8px', marginLeft: 8, textTransform: 'none', letterSpacing: 0},
    title: 'Replace the notes and signatories with the preset for ' +
      ceTypeLabel(ceType) + ' + ' + (info.projType || 'this discipline') +
      '. Set these up in the Users tab.',
    onClick: () => {
      if (!_defaultsUntouched() && !confirm('Replace the current notes and signatories with the preset for this CE type and discipline?\n\nAnything typed here will be lost.')) return;
      showToast(applyCeDefaults(ceType, info.projType, true)
        ? 'Applied the defaults for ' + (info.projType || 'this discipline') + '.'
        : 'No preset matches this CE type and discipline — set one up in the Users tab.', false);
    }
  }, "Apply defaults")), apvBar(), /*#__PURE__*/React.createElement("div", {
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
      borderBottom: `1px dashed ${alpha(BDR, '44')}`,
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
  /* Approval routing: link the line to a user, and the step it signs on. */
  /*#__PURE__*/React.createElement("select", {
    style: {...INP, fontSize: 9, width: '100%', marginTop: 4, padding: '2px 4px'},
    disabled: apvLocked, value: a.user || '',
    title: 'Link this line to a user so they approve and sign it in the app',
    onChange: e => { const u = e.target.value, usr = apvUsers.find(x => x.username === u);
      setApprovers(p => p.map((x, j) => j === i ? {...x, user: u, id: x.id || uid(), name: (!x.name && usr) ? (usr.name || usr.username) : x.name} : x)); }
  }, /*#__PURE__*/React.createElement("option", {value: ''}, '✍ Sign by hand'),
    a.user && !apvUsers.some(x => x.username === a.user) && /*#__PURE__*/React.createElement("option", {value: a.user}, a.user),
    apvUsers.map(x => /*#__PURE__*/React.createElement("option", {key: x.username, value: x.username}, '👤 ' + (x.name || x.username)))),
  a.user && /*#__PURE__*/React.createElement("label", {style: {display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', fontSize: 9, color: MT, marginTop: 4}, title: 'Lines on the same step sign at the same time; the next step opens when they are all signed'}, 'Step',
    /*#__PURE__*/React.createElement("input", {type: 'number', min: 1, disabled: apvLocked, value: a.step || i + 1, style: {...INP, width: 44, fontSize: 10, padding: '1px 4px', textAlign: 'center'},
      onChange: e => setApprovers(p => p.map((x, j) => j === i ? {...x, step: Math.max(1, parseInt(e.target.value, 10) || 1)} : x))})),
  a.user && info.approval && apvState !== 'none' && (() => {
    const l = (info.approval.lines || {})[a.id];
    const w = apvState === 'pending' && apvStatus(approvers, info.approval).waiting.some(x => x.id === a.id);
    return /*#__PURE__*/React.createElement("div", {style: {fontSize: 9, marginTop: 3, fontWeight: 700, color: l ? '#16a34a' : w ? 'var(--accent-cyan)' : MT}},
      l ? '✔ ' + l.byName + ' · ' + apvWhen(l.at) : w ? '⏳ Waiting' : apvState === 'pending' ? 'Step ' + (a.step || i + 1) : '');
  })(),
  /* Feature 11: signature thumbnail + sign button */
  visSigs[a.id||i] && /*#__PURE__*/React.createElement("div",{style:{margin:'4px 0'}},
    /*#__PURE__*/React.createElement("img",{src:visSigs[a.id||i],style:{width:'100%',height:36,objectFit:'contain',background:'#fff',borderRadius:3,border:'1px solid '+BDR}})),
  !a.user && /*#__PURE__*/React.createElement("button",{
    style:{...btn(visSigs[a.id||i]?'ok':'def',true),fontSize:9,padding:'2px 6px',width:'100%',marginTop:4},
    onClick:()=>setSigModal({...a,id:a.id||i})
  }, visSigs[a.id||i]?'✅ Re-sign':'✍ Sign'),
  approvers.length > 1 && !(apvLocked && a.user) && /*#__PURE__*/React.createElement("button", {
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
    className: "shic-rail",
    style: {
      padding: '14px 14px',
      borderLeft: `1px solid ${BDR}`,
      background: CARD
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
  }, "\u20b1", ph(val)))), /*#__PURE__*/React.createElement("div", {
    /* The grand total is the one figure the rail exists for, so it is a card
       rather than another line. The gradient is the theme's, which keeps it
       dark in both -- an amber total on a deep ground is the same reading in
       Executive Light as in Dark Slate, and DESIGN.md section 5.4 asks for
       exactly that. */
    style: {
      marginTop: 10,
      padding: '12px 14px',
      borderRadius: 10,
      background: 'var(--highlight-gradient)',
      border: `1px solid ${alpha(ACC, '44')}`,
      boxShadow: 'var(--card-shadow)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: 3
    }
  }, "Grand Total Estimate"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontWeight: 800,
      /* 28px per DESIGN.md section 3, but it has to survive a nine-figure
         total in a 260px rail, so it gives way rather than overflowing. */
      fontSize: 'clamp(18px, 2.2vw, 28px)',
      lineHeight: 1.1,
      color: ACC
    }
  }, "\u20b1", ph(grand)), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontSize: 10,
      color: MT,
      marginTop: 3
    }
  }, "Unit rate: \u20b1", ph(unitP))), /*#__PURE__*/React.createElement("div", {
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
  }, "Standard Quick Rates"),
  /* Two across, as the mockup has them: the rail is wide enough now, and a
     stacked list of five wastes most of it. The role keeps its full name --
     it was cut to the first word to fit 184px, which turned "Lead Electrical"
     and "Electrician" into the same entry. */
  /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
      gap: 6
    }
  }, masterlist.manpower.slice(0, 5).map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: {
      border: `1px solid ${BDR}`,
      borderRadius: 6,
      padding: '5px 8px',
      minWidth: 0,
      background: 'var(--bg-surface-elevated)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 9,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    title: r.role
  }, r.role), /*#__PURE__*/React.createElement("div", {
    style: {
      ...MONO,
      fontSize: 12,
      fontWeight: 700,
      color: ACC
    }
  }, "₱", r.rate, /*#__PURE__*/React.createElement("span", {
    style: {fontSize: 9, color: MT, fontWeight: 400}
  }, "/day"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      color: MT,
      fontSize: 9,
      marginTop: 4,
      lineHeight: 1.5
    }
  /* Read from the CE rather than written out: a fixed caption goes on
     claiming 1.25x the moment somebody edits the multiplier. */
  }, "Night ×" + ceShiftMult(rr, 'regular_night') + " · Sun ×" + ceShiftMult(rr, 'sunday_day'),
     /*#__PURE__*/React.createElement("br", null),
     "Holiday ×" + ceShiftMult(rr, 'holiday_day') + " · OT ×" + ceOtMult(rr))), /*#__PURE__*/React.createElement("div", {
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
  }, "View All"),
  /* Which build is actually running. Without this the only way to tell was
     reading ?v= off a stack trace in DevTools, and two bug reports were filed
     against a build that had already been fixed. */
  /*#__PURE__*/React.createElement("div", {
    style: { color: MT, fontSize: 9, textAlign: 'center', marginTop: 10, opacity: .6 },
    title: 'Build version. Reload the page if this is behind the current release.'
  }, "build ", typeof APP_BUILD === 'undefined' ? '?' : APP_BUILD)),
  /*#__PURE__*/React.createElement(FooterBar, null))));
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
          background: 'var(--bg-canvas)',
          color: 'var(--status-danger)',
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
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap'
        }
      }, this.state.error.stack));
    }
    return this.props.children;
  }
}
