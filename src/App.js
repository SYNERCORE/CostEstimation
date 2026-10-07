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

/* The resource tabs skip a render when nothing they show has changed. Every
   prop is compared as is; the callbacks come through resStable (see App), which
   keep their identity but always run the newest closure. */
const ResTabM = React.memo(ResTab);

function App({
  currentUser,
  onLogout
}) {
  /* Project type and issuing company start blank on a new CE: they decide the number's prefix, the
     rates that apply and the printed form, so they are chosen, not assumed. */
  const [ceType, setCeType] = useState("");
  const [tab, setTab] = useState("mywork");
  const [info, setInfo] = useState({
    ...BLANK_INFO,
    companyId: ''
  });
  /* No starter row. Every shift group already has its own empty state, so a
     blank row bought nothing and cost the user a stray "Role name..." line
     on every new CE -- one they had to either fill or delete. */
  const [mp, setMp] = useState([]);
  const [tools, setTools] = useState([mkRes()]);
  const [mats, setMats] = useState([mkRes()]);
  /* The quantity calculators (babbitt, painting, welding). `calc` is what this CE
     typed into them and is saved with it; the standards and the team's history are
     company-wide and live in the Companies list. */
  const [calc, setCalc] = useState(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcStored, setCalcStored] = useState(null);
  const [calcHist, setCalcHist] = useState([]);
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
  const [notes, setNotes] = useState([]); /* [{id,seq,text,imp}] */
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
    text: '',
    /* Ordinary until someone says otherwise. A note that shouted by default
       would teach the sales team to read past the red, which is the one thing
       it must never do. */
    imp: false
  });
  const [sowItems, setSowItems] = useState([]); /* [{id,type:'main'|'sub',text}] */
  /* SOW Breakdown view state */
  const [sbCollapsed, setSbCollapsed] = useState({}); /* {taskId:true} */
  const [sbDlOn, setSbDlOn] = useState(false);   /* Masterlist suggestions built on first focus */
  const [sbShow, setSbShow] = useState({});      /* {taskId|tabKey: rows drawn} */
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
  useEffect(() => { if (currentUser && currentUser.username) dbGetMySig(currentUser.username).then(v => setMySig(v || '')).catch(_e=>logSwallowed('App:App',_e)); }, [currentUser && currentUser.username]);
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
    if (!await uiConfirm('Delete ' + entries.length + ' item' + (entries.length === 1 ? '' : 's') + ' permanently?\n\nThis cannot be undone.')) return;
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
  const [monData, _setMonDataRaw] = useState({});
  /* Every write passes through here so a renamed status is read under its new name. */
  const _renameStatuses = d => {
    if (!d || typeof d !== 'object') return d;
    let out = null;
    Object.keys(d).forEach(k => {
      const r = d[k];
      if (r && typeof r === 'object' && r.status && ceStatusName(r.status) !== r.status) {
        out = out || {...d}; out[k] = {...r, status: ceStatusName(r.status)};
      }
    });
    return out || d;
  };
  const setMonData = v => _setMonDataRaw(typeof v === 'function' ? (p => _renameStatuses(v(p))) : _renameStatuses(v));
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
    } catch(_e){logSwallowed('App:App',_e);}
  };
  const removeStatus = s => {
    const n = customStatuses.filter(x => x !== s);
    setCustomStatuses(n);
    try {
      localStorage.setItem('shic:statuses', JSON.stringify(n));
    } catch(_e){logSwallowed('App:App',_e);}
  };
  const MON_KEY = 'shic:monitoring';
  /* When each CE's row was last changed here. A fetch that was already in
     flight when someone changed a status came back holding the row from
     before it and replaced the table wholesale -- the change was on screen,
     then gone the next time the tab was opened. A row changed since a fetch
     began is kept as this browser has it; the write is on its way to the
     site and the next fetch will carry it. */
  const _monWroteAt = React.useRef({});
  const loadMonData = makeLoadMonData(() => ({ MON_KEY, _monWroteAt, monData, setMonData, setMonSpIds, showToast }));
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
  /* One request event, stated for the Power Automate flow: what happened (new, returned, resubmitted, accepted,
     declined), who to tell (display names, comma separated), and a note. The key is new every time. */
  const mkReq = (state, to, note, rce) => ({ state, to: String(to || '').trim(), note: String(note || '').trim().slice(0, 240), rce: String(rce || ''),
    by: (currentUser && (currentUser.name || currentUser.username)) || '', key: state + '|' + new Date().toISOString() });
  const updateMon = makeUpdateMon(() => ({ MON_KEY, _monWroteAt, currentUser, history, isRequestor, reqOwns, setMonData, showToast }));
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
      }).catch(_e=>logSwallowed('App:App',_e));
    }
    return () => window.removeEventListener('shic:companies:updated', onStorage);
  }, []);
  /* One writer for the scope-library cache. The key is the raw 'sy3:sowlib'
     (no shic: prefix) that this component has always read; db.js's non-SP
     branch wrote LS 'sy3:sowlib', which lands at 'shic:sy3:sowlib' — a key
     nothing ever read. */
  const cacheSowLib = lib => {
    lsPut('sy3:sowlib', lib, 'the Scope Library');
    try { refPut('sowlib', lib, (USE_SP || getSiteURL()) ? 'sharepoint' : 'local'); } catch(_e){logSwallowed('App:App',_e);}
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
  /* The CE number this editor is working on because it was opened from, or
     saved to, history -- the only CE a Save may replace. A number that merely
     matches someone else's CE is still refused. */
  const _ownNum = useRef('');
  /* When the copy of the CE open here was saved -- on the site, or by this browser -- so a Save can tell that somebody else saved it since. */
  const _loadedAt = useRef({ num: '', at: '' });
  /* The sequence part of the number this editor has claimed for its new CE, so Continue does not claim a second. */
  const _claimedSeq = useRef('');
  /* The owner holds every admin power on top of being unmanageable by them. */
  const isAdmin = hasAdminPowers(currentUser.role);
  /* A requestor raises a request and hands it over. The costing tabs are not
     theirs -- there is nothing on them they are allowed to change -- but a CE
     that comes back is theirs to read in full, which is what View is for. */
  const isRequestor = isRequestorRole(currentUser.role);
  const REQUESTOR_TABS = ['mywork', 'info', 'sow', 'history', 'dashboard'];
  /* A requestor reads every CE in CE Monitoring and the Dashboard -- the owner's
     decision -- but changes only the ones they raised (see reqOwns). */
  const canSeeAll = isAdmin || isRequestor;
  /* Every CE number in use, not just this user's. See dbGetCeNumbers. */
  const [ceNums, setCeNums] = useState([]);
  const isOwner = isOwnerRole(currentUser.role);
  const cfg = CE_CFG[ceType] || CE_CFG.onsite || {};
  const TABS = [...(isRequestor ? CE_TABS.filter(t => REQUESTOR_TABS.indexOf(t.id) >= 0) : CE_TABS), ...(isAdmin ? [{
    id: 'admin',
    label: 'Users'
  }] : [])];
  /* The tabs are filed under three headings so only one group's worth is on
     screen at a time: fourteen in one row ran past the edge of a tablet. The
     group is derived from the open tab, never stored, so it cannot disagree
     with it; each group remembers the tab last used in it. */
  const TAB_GROUPS = [
    {id: 'workspace', label: 'Workspace', ids: ['mywork', 'history', 'dashboard', 'admin']},
    {id: 'estimate', label: 'Estimate', ids: ['info', 'sow', 'sowbreak', 'manpower', 'tools', 'materials', 'ppe', 'misc', 'summary'], steps: true},
    {id: 'libraries', label: 'Libraries', ids: ['scopelib', 'masterlist']},
    {id: 'calculators', label: 'Calculators', ids: ['calculators']}
  ].map(g => ({...g, tabs: g.ids.map(id => TABS.find(t => t.id === id)).filter(Boolean)})).filter(g => g.tabs.length);
  const _tabMemory = useRef({});
  /* The estimate cannot be worked on until Project Info says what it is for: the issuing
     company, the project type, the discipline and a description. They are listed all together, and
     the screens after Project Info stay shut until they are filled. A requestor only logs
     a request, so none of this applies to them. */
  const infoMissing = isRequestor ? [] : [
    (info.companyId == null || info.companyId === '') ? 'Issuing Company' : '',
    !String(info.client || '').trim() ? 'Client Name' : '',
    !String(ceType || '').trim() ? 'Project Type' : '',
    !String(info.projType || '').trim() ? 'Discipline' : '',
    !String(info.description || '').trim() ? 'Project Description' : ''
  ].filter(Boolean);
  const pickCompany = val => {
        const rawId = val === '' ? null : (isNaN(val) ? val : Number(val));
        const selCo = companies.find(c => String(c.id) === String(rawId)) || companies[0];
        setInfo(p => {
          const pfx = ((selCo?.cePrefix || 'SHIC') + '-CE-').toUpperCase();
          const isDefault = !p.ceNum || p.ceNum.toUpperCase().startsWith(pfx) || /^[A-Z0-9]+-CE-\d{4}-\d+$/i.test(p.ceNum);
          /* The number was claimed when the CE was started and the sequence is shared by every company,
             so choosing the company only changes its prefix; it does not claim another number. */
          const _sq = ceSeqOf(p.ceNum);
          const newCeNum = isDefault ? (_sq ? (selCo?.cePrefix || 'SHIC').toUpperCase() + '-CE-' + _sq.seq : nextCeNumForCompany(history, selCo, ceNums)) : p.ceNum;
          return {...p, companyId: rawId, ceNum: newCeNum};
        });
  };
  /* The four are asked for in front of Project Info, and the dialog stays until Continue. */
  const [piGate, setPiGate] = useState(false);
  const [mwOpen, setMwOpen] = useState({});
  const [mwQ, setMwQ] = useState('');
  const [mwReqQ, setMwReqQ] = useState('');
  /* The Dashboard's lists show the first 15 rows; these hold which of them has been opened to all of its rows. */
  const [dashAll, setDashAll] = useState({});
  const [dashQ, setDashQ] = useState('');
  const [dashReqQ, setDashReqQ] = useState('');
  useEffect(() => { if (!isRequestor && tab === "info" && infoMissing.length) setPiGate(true); }, [tab]);
  /* Continue is where a new CE gets its number, if it has not claimed one already: a fresh editor
     starts on a placeholder, and a CE that was opened or saved keeps the number it has. */
  const continueGate = () => {
    setPiGate(false);
    if (_ownNum.current) return;
    const sq = ceSeqOf(info.ceNum);
    if (sq && sq.seq === _claimedSeq.current) return;
    const selCo = (companies || []).find(c => String(c.id) === String(info.companyId)) || (companies || [])[0];
    const guess = nextCeNumForCompany(history, selCo, ceNums);
    setInfo(p => ({ ...p, ceNum: guess }));
    claimCeNum(selCo?.cePrefix || 'SHIC', guess);
  };
  const _gated = ['sow', 'sowbreak', 'manpower', 'tools', 'materials', 'ppe', 'misc', 'summary'];
  useEffect(() => {
    if (infoMissing.length && _gated.indexOf(tab) >= 0) {
      setTab('info');
      showToast('Fill in Project Info first. Still needed: ' + infoMissing.join(', ') + '.', true);
    }
  }, [tab, infoMissing.join('|')]);
  const [railSlim, setRailSlim] = useState(() => { try { return localStorage.getItem('shic:railSlim') === '1'; } catch (_e) { return false; } });
  const toggleRail = () => setRailSlim(v => { const n = !v; try { localStorage.setItem('shic:railSlim', n ? '1' : '0'); } catch (_e) {} return n; });
  useEffect(() => {
    setTimeout(async()=>{const info=await checkForUpdate();if(info.available)setUpdateInfo(info);},3000);
    const onKey=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();try{handleSave();}catch(ex){logSwallowed('App:L1005',ex);}}if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();try{handleNew();}catch(ex){logSwallowed('App:L1005',ex);}}};
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
      try { const n = LS.pruneCeCache(60); if (n) console.info('Pruned ' + n + ' cached CE(s) from local storage.'); } catch(_e){logSwallowed('App:L1041',_e);}
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
      if(isAdmin){try{const all=await dbGetUsers();const pCount=all.filter(u=>u.status==='pending').length;if(pCount>0)setTimeout(()=>showToast(`👤 ${pCount} user${pCount>1?'s':''} awaiting approval — check Admin Panel → Users`),1500);}catch(_){logSwallowed('App:L1059',_);}};
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
          try { if (window._shicFullRefresh) await window._shicFullRefresh(); } catch(_e){logSwallowed('App:L1080',_e);}
        }, 2000);
      };
      window.addEventListener('shic-online', onReconnect);
      _cleanupReconnect = () => { window.removeEventListener('shic-online', onReconnect); clearTimeout(_reconnectTimer); };
      /* Also catch the case where the app STARTS online with a backlog — an
         'online' event never fires when the connection was already there. */
      if (navigator.onLine !== false) {
        setTimeout(() => { dbPushLocalCEs().then(r => {
          if (r && r.pushed) showToast('Uploaded ' + r.pushed + ' CE(s) that were saved offline.');
        }).catch(_e=>logSwallowed('App:L1090',_e)); }, 6000);
        setTimeout(() => { dbPushAuditLog().catch(_e=>logSwallowed('App:L1091',_e)); }, 8000);
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
          const _as = _q.get('as') === 'detailed' ? 'detailed' : _q.get('as') === 'view' ? 'view' : _q.get('as') === 'noamt' ? 'noamt' : 'ce';
          window.history.replaceState({}, '', window.location.pathname);
          setTimeout(async () => {
            try {
              const full = await dbLoadCE(_pid);
              if (!full) { console.error('open CE ' + _pid + ': dbLoadCE returned nothing'); showToast('Could not open that CE — it is not in SharePoint or this browser.', true); return; }
              await handleLoad(full);
              setAutoPrint({as: _as, ceNum: (full.info || {}).ceNum || ''});
            } catch (ex) { console.error('open CE ' + _pid + ' failed:', ex); showToast('Could not open that CE: ' + ex.message, true); }
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
            setTimeout(() => { try { applyDraftData(d); showToast('Shared draft loaded from link!'); } catch(e){logSwallowed('App:L1151',e);} }, 800);
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
        try { refPut('masterlist', ml, (USE_SP || getSiteURL()) ? 'sharepoint' : 'local'); } catch(_e){logSwallowed('App:L1168',_e);}
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
  /* Whether a requestor raised this CE: receivedBy is stamped at request time
     and never changes; savedBy covers a request whose monitoring row has not
     arrived yet. */
  const reqOwns = (id, mon) => {
    const m = (mon || _monRef.current || {})[id] || {};
    const me = [currentUser?.name, currentUser?.username].map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
    if (me.includes(String(m.receivedBy || '').trim().toUpperCase()) && String(m.receivedBy || '').trim()) return true;
    const h = (history || []).find(x => String(x.id) === String(id));
    return !!(h && h.savedBy === currentUser?.username && !m.receivedBy);
  };
  const mineToSee = id => {
    const m = (_monRef.current || {})[id];
    if (!m) return false;
    const me = [currentUser?.name, currentUser?.username].map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
    /* And any CE routed to them for signature. Without this an approver who is
       not an admin was told a CE waited on them but never received the CE
       itself, so there was nothing to open. */
    if (apvMonWaitsOn(m, currentUser?.username)) return true;
    return ceeMatches(me, m.ceeName) || me.includes(String(m.receivedBy || '').trim().toUpperCase());
  };
  const loadHist = makeLoadHist(() => ({ canSeeAll, currentUser, mineToSee, setCeNums, setHistBusy, setHistory }));
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
    try{window.shicMasterlist=ml;}catch(_e){logSwallowed('App:L1266',_e);}
    setSyncStatus({masterlist:'saving', dirty:true});
    try {
      const res = await dbSaveML(ml, opts);
      /* What SharePoint had and this browser did not. Folded into the list on
         screen, or the next save would offer to delete it all over again. */
      if (res && res.sp && res.merged && res.adopted && Object.keys(res.adopted).length) {
        const kept = mlRound(res.merged);
        setMasterlist(kept);
        try{window.shicMasterlist=kept;}catch(_e){logSwallowed('App:L1275',_e);}
        try { LS.set('masterlist', kept); } catch(_e){logSwallowed('App:L1276',_e);}
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
  const addRowsToML = async (tab, list) => {
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
    if (!await uiConfirm('Add ' + add.length + ' item(s) to the shared Masterlist?\n\n' + add.map(a => a.desc + ' — ' + a.uom + ' @ P' + a.cost).join('\n') + '\n\nEveryone will see them. Set their category on the Masterlist later.')) return;
    saveML({ ...masterlist, [tab]: [...add, ...cur] });
    auditLog('masterlist_add_from_ce', tab + ': ' + add.map(a => a.desc).join(', '), currentUser?.username);
    showToast(add.length + ' item(s) added to the Masterlist (' + tab + '), category General.');
  };
  const showToast = (msg, err = false) => {
    /* An error toast is gone in three seconds, which is not long enough to read
       it, copy it, or notice it at all in the embedded viewer -- where a CE that
       would not open just left the page sitting on My Work. Errors go to the
       console as well, and stay up longer inside a frame. */
    if (err) { try { console.warn('[toast] ' + msg); } catch(_e){logSwallowed('App:L1326',_e);} }
    setToast(msg);
    setToastErr(err);
    setTimeout(() => setToast(''), (err && window !== window.top) ? 20000 : 3200);
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
  /* Callbacks for the memoised resource tabs. A new arrow on every render would
     defeat the memo, and wrapping each in useCallback would need its whole
     chain of dependencies listed (and a missed one is a stale price). Instead
     the wrappers are made once and read the newest functions from a ref each
     time they are called. What the tab DRAWS from pwrFrac is covered by the
     _pfk / _wm props, which change when its inputs do. */
  const _lat = useRef(null);
  _lat.current = () => ({ addRowsToML, readDoc, showToast, pwrFrac });
  const resStable = useMemo(() => ({
    addTools: l => _lat.current().addRowsToML('tools', l),
    addMats: l => _lat.current().addRowsToML('materials', l),
    addPpe: l => _lat.current().addRowsToML('ppe', l),
    readFile: f => _lat.current().readDoc(f),
    showToast: (m, e) => _lat.current().showToast(m, e),
    openCalc: () => setCalcOpen(true),
    pwrFrac: r => _lat.current().pwrFrac(r),
    setDefaultTier: v => setInfo(p => ({...p, toolTier: v})),
    setKwhRate: v => setRates(p => {
      const n = {...p}, f = parseFloat(v);
      if (!isFinite(f) || f < 0 || f === KWH_RATE_DEFAULT) delete n.kwhRate; else n.kwhRate = f;
      return n;
    })
  }), []);
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
  const _mobTabs = cfg.mobDemob ? mobSubT + demobSubT : 0;
  /* What is actually typed on the tabs, before the quantity is applied. */
  const tabsT = _mobTabs + mpTot + toolsT + matsT + ppeT + miscT;
  /* Costs charged once for the job, whatever the quantity -- transport to
     site costs the same for one valve as for two. Chosen per CE on the
     Summary tab and kept in info.perJob: misc category keys, and 'mobdemob'.

     The same list serves both quantity modes, because it answers the same
     question in both: which costs do NOT move with the quantity. Dividing, it
     is what stays out of the unit price; multiplying, it is what stays
     charged once. */
  const perJob = Array.isArray(info.perJob) ? info.perJob : [];
  const perJobLines = [
    ...(perJob.includes('mobdemob') && _mobTabs > 0 ? [{ k: 'mobdemob', label: 'Mobilization / Demobilization', v: _mobTabs }] : []),
    ...(MISC_DEF[ceType] || MISC_DEF.onsite).filter(([k]) => perJob.includes(k)).map(([k, l]) => ({
      k, label: String(l).replace(/^[A-Z]\.\d+\s*/, ''),
      v: (Array.isArray(misc[k]) ? misc[k] : []).reduce((t, r) => t + miscRowCost(r), 0)
    })).filter(x => x.v > 0)
  ];
  const perJobT = perJobLines.reduce((t, x) => t + x.v, 0);
  const perJobNames = perJobLines.map(x => x.label).join(', ');

  /* Two ways a quantity can mean something.
     =====================================
     DIVIDE (what this has always done, and the default): the tabs hold the
     cost of the whole job, so the unit price is the job divided by the count.

     MULTIPLY: the tabs hold ONE of them -- one valve, one panel -- and the
     job is that times the count. It is the natural way to cost a CE for a
     repeated item, and doing it the other way round meant typing figures
     nobody had worked out yet.

     Exemptions work the same in both, so a CE can be switched from one to the
     other without revisiting them. Every existing CE stays on divide: qtyMode
     is absent on all of them, and absent means divide. */
  const qtyN = N(info.qty) || 1;
  const qtyMulOn = info.qtyMode === 'multiply';
  /* How many times a bucket is charged. Manpower, tools, materials and PPE
     are always charged per unit when multiplying; mob/demob and the misc
     categories are too, unless they are on the exempt list. */
  const qF = qtyMulOn ? qtyN : 1;
  const qFx = k => (qtyMulOn && !perJob.includes(k)) ? qtyN : 1;
  const _pjMisc = perJobLines.filter(x => x.k !== 'mobdemob').reduce((t, x) => t + x.v, 0);
  const mobSubTX = mobSubT * qFx('mobdemob');
  const demobSubTX = demobSubT * qFx('mobdemob');
  const mobT = cfg.mobDemob ? mobSubTX + demobSubTX : 0;
  const mpTotX = mpTot * qF, toolsTX = toolsT * qF, matsTX = matsT * qF, ppeTX = ppeT * qF;
  /* The exempt categories keep their own figure; the rest move with the
     quantity. */
  const miscTX = (miscT - _pjMisc) * qF + _pjMisc;
  /* The amount charged for the job. In divide mode every multiplier is 1 and
     this is the old expression exactly, to the centavo. */
  const grand = mobT + mpTotX + toolsTX + matsTX + ppeTX + miscTX;
  /* One formula, both modes. Multiplying, (grand - perJobT) is the per-unit
     cost times the count, so dividing by the count gives the unit back. */
  const unitP = (grand - perJobT) / qtyN;
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
        : (N(r.tier) === 1 || N(r.tier) === 4) ? 1
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
    /* Not a duration at all: the job is being charged for the tool itself. An
       approver reading "1 day" against the full price of a grinder would take
       it for a typing error. */
    if (t === 4) return 'full price';
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
    /* taskCostRollup adds up the rows behind a task, and those rows hold ONE
       unit when the quantity multiplies. Scaling the named services by the
       quantity would be right only if no exempt cost were ever linked to a
       task -- and where one is, the block would overstate it silently. Money
       that might be wrong is worse than a block that does not print, so this
       stands down in multiply mode until it can be done properly. */
    return { lines, other, total: grand, ok: other > -0.005,
      on: !!info.showServices && lines.length > 0 && !qtyMulOn, offByQtyMode: !!info.showServices && lines.length > 0 && qtyMulOn };
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
  const deleteSowTask = async item => {
    const ids = sowTaskGroup(item);
    const subs = ids.length - 1;
    const n = ids.reduce((s, id) => s + taskResCount(id), 0);
    if ((n > 0 || subs > 0) && !await uiConfirm('Delete this scope task' +
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
  const clearAllSow = async () => {
    if (!await uiConfirm('Clear all scope items?\n\nResources stay in their tabs and keep their costs, but they will all become Unassigned in the SOW Breakdown.' +
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
      calc: calc ? JSON.parse(JSON.stringify(calc)) : null,
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
  /* Resume Work's search box and its estimator filter. Every word typed must be found in some column of the draft, in any order. */
  const [drftQ, setDrftQ] = React.useState('');
  const [drftBy, setDrftBy] = React.useState('');
  const _drftWords = String(drftQ || '').toLowerCase().split(/\s+/).filter(Boolean);
  const draftsShown = (sharedDrafts || []).filter(d => {
    if (drftBy && d.savedBy !== drftBy) return false;
    if (!_drftWords.length) return true;
    const hay = [d.info && d.info.ceNum, d.info && d.info.client, d.info && d.info.description, d.info && d.info.projType, d.ceType, d.savedByName, d.savedBy].join(' ').toLowerCase();
    return _drftWords.every(w => hay.indexOf(w) >= 0);
  });
  /* Who has drafts, with how many, for the estimator filter. */
  const draftOwners = (() => { const m = {}; (sharedDrafts || []).forEach(d => { const k = d.savedBy || ''; if (!k) return; m[k] = m[k] || {user: k, name: d.savedByName || k, n: 0}; m[k].n++; });
    return Object.values(m).sort((a, b) => String(a.name).localeCompare(String(b.name))); })();

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
    const _mp=(d.mp||[]).map(_R.rt('mp'));setMp(_mp);try{window.shicCurrentMp=_mp;}catch(_e){logSwallowed('App:L2262',_e);}
    const _tools=(d.tools||[]).map(_R.rt('tools'));setTools(_tools);try{window.shicCurrentTools=_tools;}catch(_e){logSwallowed('App:L2263',_e);}
    const _mats=(d.mats||[]).map(_R.rt('mats'));setMats(_mats);try{window.shicCurrentMats=_mats;}catch(_e){logSwallowed('App:L2264',_e);}
    setPpe((d.ppe || []).map(_R.rt('ppe')));
    /* A drawn signature belongs to the CE it was drawn on. */
    setSignatures(d.signatures && typeof d.signatures === 'object' ? {...d.signatures} : {});
    setCalc(d.calc && typeof d.calc === 'object' ? JSON.parse(JSON.stringify(d.calc)) : null);
    setCalcOpen(false);
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
  /* One click is one save.
     =====================
     Save, Revise and Draft all reach SharePoint and back before anything on
     screen changes. For that second or two the button looks untouched, so
     people press it again -- and Revise made that expensive: each press read
     the same history, worked out the same next revision number, found it
     unused, and wrote it. One Revise, three revisions, and a revision is not
     something anyone unpicks afterwards.

     A ref, not state: two clicks in the same tick would both read a state
     value that has not re-rendered yet and both pass. A ref assignment is
     there for the next click immediately. The state beside it is only so the
     button can say what it is doing -- which is the other half of the fault,
     because a button that gives no sign of life is a button people press
     again. Guarding at the definition covers Ctrl+S and every other caller,
     not just the one button. */
  const _busy = useRef({});
  const [busyOp, setBusyOp] = useState({});
  const guard = (key, fn) => async (...args) => {
    if (_busy.current[key]) return;
    _busy.current[key] = true;
    setBusyOp(p => ({ ...p, [key]: true }));
    try { return await fn(...args); }
    finally {
      _busy.current[key] = false;
      setBusyOp(p => ({ ...p, [key]: false }));
    }
  };
  /* A button mid-flight: visibly out of action, and saying so. */
  const busyBtn = (key, base) => busyOp[key]
    ? { ...base, opacity: .55, cursor: 'progress', pointerEvents: 'none' } : base;

  const saveDraft = guard('draft', async () => {
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
      calc: calc ? JSON.parse(JSON.stringify(calc)) : null,
      mobVehicles: [...mobVehicles],
      demobVehicles: [...demobVehicles],
      scope,
      savedBy: currentUser.username,
      savedByName: currentUser.name || currentUser.username,
      savedAt: new Date().toISOString()
    };
    lsPut(DRAFT_KEY, d, 'this draft');
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
  });

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
    if (!asked && !await uiConfirm('Delete this draft' + (d.info && d.info.ceNum ? ' of ' + d.info.ceNum : '') + (own ? '' : ' by ' + (d.savedByName || d.savedBy)) + '?\n\n' +
      'Changes not yet saved will be lost for good. The saved CE and its CE Monitoring entry are not affected.')) return;
    try {
      await dbDeleteDraft(draftId);
    } catch(e){logSwallowed('App:L2459',e);}
    try {
      const loc = localStorage.getItem(DRAFT_KEY);
      if (loc && JSON.parse(loc).draftId === draftId) localStorage.removeItem(DRAFT_KEY);
    } catch(e){logSwallowed('App:L2463',e);}
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
    if (!await uiConfirm('Clear ' + what + '?' + String.fromCharCode(10, 10) +
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
  const resumeDraft = async d => {
    if (await uiConfirm('Resume draft by ' + d.savedByName + '? This will replace your current unsaved work.')) {
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
    } catch(_e){logSwallowed('App:L2552',_e);}
  };
  /* Re-price the CE on screen from today's masterlist.

     A saved CE is a record of what was quoted, so nothing re-prices it on its
     own: every rate and cost is stored on the row it belongs to and comes back
     exactly as it was saved. Prices move only when someone asks for it here,
     on a CE they are about to quote.

     Nothing is written to history. This changes what is on screen; saving is
     still a separate, deliberate act -- and if the number already belongs to a
     saved CE, saving would overwrite that record, so say so first. */
  const syncRatesFromML = async () => {
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
    if (!await uiConfirm(
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
      /* The summary bucket, but only onto a row that does not already name
         one. Re-pricing is asked for; quietly undoing a grouping somebody set
         on this CE is not, and the two would be indistinguishable afterwards. */
      if (f.group && !r.group) n.group = f.group;
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
      setTimeout(() => { try { f.remove(); } catch(_e){logSwallowed('App:L2640',_e);} }, 60000);
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
      } else if (as === 'view') handleGenerateCE({ embed: true }); else if (as === 'noamt') handleGenerateCE({ noAmounts: true }); else handleGenerateCE(); }
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
  const handleSave = guard('save', async () => {
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
    if (infoMissing.length) {
      showToast('Project Info is incomplete. Still needed: ' + infoMissing.join(', ') + '.', true);
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
    if (!await confirmZeroCost('Save anyway?')) return;
    const dup = await dbFindCEByNum(ceNum).catch(() => null);
    /* A logged request is built out and saved over under its own number. Only
       that number: renaming the CE to someone else's number is still refused. */
    const _fromRequest = !!(info.request && (String(info.requestNum || '').toUpperCase() === ceNum ||
      (info.acceptedCeNum && String(info.acceptedCeNum).toUpperCase() === ceNum)));
    /* One sequence across companies: SY3-CE-2026-1131 may not exist beside
       SHIC-CE-2026-1131. Refused in bulk mode too -- that overwrites the same
       number, never another company's. */
    const _clash = await dbFindCESeqClash(ceNum, ceNums).catch(() => null);
    if (_clash) {
      showToast('CE Number ' + ceNum + ' is already used as ' + _clash.ceNum + (_clash.savedBy ? ' by ' + _clash.savedBy : '') +
        '. SHIC and SY3 share one sequence. Next free: ' + nextCeNum(history, (ceNum.split('-CE-')[0] || null), [...ceNums, ceNum]), true);
      return;
    }
    /* A saved CE stays editable until it is routed for approval. Save used to
       refuse any number already on file, so changing a CE after its first save
       meant a Revise -- a new number -- for what was only a correction. It may
       be replaced when it is the one open here, belongs to this user (or an
       admin), has not been routed or approved, and its pipeline status is not
       a finished one. Routed work still goes through Revise. */
    const _own = !!(dup && !dup._imported && _ownNum.current === ceNum && (isAdmin || !dup.savedBy || dup.savedBy === currentUser?.username));
    const _dupApv = dup ? ((monData[dup.id] || {}).apv || {}).state || ((info.approval && info.approval.state) || 'none') : 'none';
    const _dupMon = dup ? String((monData[dup.id] || {}).status || '').trim() : '';
    const _routed = _dupApv === 'pending' || _dupApv === 'approved' || _dupApv === 'superseded' || (_dupMon && !ceIsOpen(_dupMon));
    if (_own && !_routed) {
      /* Falls through: dbSaveHistory updates the CE in place. */
    } else if (_own && _routed && !(isAdmin && bulkMode.on(currentUser?.username))) {
      showToast(ceNum + ' is ' + (_dupApv === 'approved' ? 'approved' : _dupApv === 'pending' ? 'out for approval' : _dupMon ? 'marked ' + _dupMon : 'closed') +
        ' and can no longer be edited in place. Use ↻ Revise to save your changes as a new revision.', true);
      return;
    } else if (dup && !dup._imported && !_fromRequest) {
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
    /* Somebody else saved this CE after it was opened here: saving now would replace their changes with this copy. Say who and when, and
       let the person decide -- reopening it from History shows theirs. */
    if (_own && _loadedAt.current.num === ceNum && !(isAdmin && bulkMode.on(currentUser?.username))) {
      const _chg = ceChangedSince(_loadedAt.current, dup, currentUser?.username);
      if (_chg) {
        const _when = new Date(_chg.at).toLocaleString('en-PH', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
        if (!await uiConfirm(_chg.by + ' saved ' + ceNum + ' at ' + _when + ', after you opened it.' + String.fromCharCode(10, 10) +
          'Saving now REPLACES their changes with what is on your screen. To see theirs, do not save: open it again from History.',
          {ok: 'Replace theirs with mine', cancel: 'Do not save', danger: true})) {
          showToast('Not saved — ' + _chg.by + ' changed ' + ceNum + ' at ' + _when + '. Their version is untouched.', true);
          return;
        }
      }
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
          if (!await uiConfirm(_msg, {ok: 'Save and clear them', cancel: 'Keep signatures', danger: true})) { showToast('Not saved — the signatures on ' + ceNum + ' are untouched.'); return; }
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
      _loadedAt.current = { num: ceNum, at: new Date().toISOString() };
      auditLog('save_ce', ceNum, currentUser?.username);
      _ownNum.current = ceNum;
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
          if (_revReason.current && _revReason.current.num === String(ceNum).toUpperCase() && !(monData[saved.id] || {}).remarks) {
            _w.remarks = '\u21BB Revision ' + (ceFamily(ceNum).rev ? 'R' + ceFamily(ceNum).rev : '') + ': ' + _revReason.current.why;
            _revReason.current = null;
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
        : (_own && !_routed) ? 'Saved — CE ' + ceNum + ' updated.'
        : 'Saved! CE ' + ceNum + ' added to history.');
    } catch (e) {
      showToast('Save failed: ' + e.message, true);
    }
  });
  /* A revision needs a reason. It is asked for when the revision starts, kept on the CE (info.revisionReason) and written to the new
     revision's Monitoring remarks, so the trail says why each R-number exists. Cancel, or an empty answer, stops the revision. */
  const _revReason = React.useRef(null);
  const askRevisionReason = async (num) => {
    /* Required, and said so under the box: a reason that is too short keeps the dialog open instead of abandoning the revision. */
    const t = await uiPrompt('Reason for revising ' + num + String.fromCharCode(10, 10) + 'Required \u2014 e.g. client changed the scope, rates updated, quantity corrected.',
      {multiline: true, required: true, min: 3, requiredMsg: 'A revision needs a reason.', minMsg: 'A revision needs a reason \u2014 a few words at least.', ok: 'Revise'});
    return t == null ? null : t;
  };
  const noteRevisionRemark = async (num, reason) => {
    try {
      const saved = await dbFindCEByNum(num);
      if (saved && saved.id != null) updateMon(saved.id, {remarks: '\u21BB Revision ' + (ceFamily(num).rev ? 'R' + ceFamily(num).rev : '') + ': ' + reason});
    } catch (_e) { console.warn('revision remark skipped:', _e.message); }
  };
  const handleSaveRevision = guard('revise', async () => {
    const ceNum = (info.ceNum || '').trim();
    if (!ceNum) {
      showToast('Please enter a CE Number before saving a revision.', true);
      return;
    }
    const _why = await askRevisionReason(ceNum);
    if (!_why) return;
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
      const _re = mkEntry(revLabel); _re.info = {..._re.info, revisionReason: _why};
      await dbSaveHistory(_re);
      await noteRevisionRemark(_re.info.ceNum, _why);
      setInfo(p => ({
        ...p,
        ceNum: revCeNum, revisionReason: _why
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
  });
  const hasUnsavedWork = () => {
    const hasInfo = !!(info.ceNum && info.ceNum !== BLANK_INFO.ceNum) || !!(info.client) || !!(info.description);
    /* `r.pax` defaults to 1 on the blank starter row, so testing it made a
       brand-new CE look dirty and prompted "unsaved work will be replaced"
       before anything had been typed. */
    const hasRows = mp.some(r=>r.role) || tools.some(r=>r.desc) || mats.some(r=>r.desc) || ppe.some(r=>r.desc);
    return hasInfo || hasRows;
  };
  /* A request with no deadline is due three days after its inquiry date. */
  const reqDeadline = (dl, inquiryDate, dateRecv) => {
    if (dl) return dl;
    const b = inquiryDate || dateRecv; if (!b) return '';
    const d = new Date(b + 'T00:00:00'); if (isNaN(d)) return '';
    d.setDate(d.getDate() + 3);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const handleLoad = async e => {
    /* A request nobody has accepted has no CE number to build the estimate
       under -- its RCE No. is only the key it is filed by. */
    { const _ri = ((e && e.data) || e || {}).info || {};
      if (_ri.request && !_ri.acceptedCeNum && String(_ri.ceNum || '') === String(_ri.requestNum || '')) {
        showToast('Review this request first -- it gets its CE number when the Cost Estimation team proceeds with it. Use Review beside its number.', true); return; } }
    if (hasUnsavedWork() && !await uiConfirm('Load this CE? Your current unsaved work will be replaced.\n\nTip: save a draft first (Ctrl+S or the Save Draft button) if you need to keep it.')) return;
    let d = e.data || e;
    // SP history items have numeric id but no tools — fetch full CE before applying
    if (d.tools === undefined) {
      // Try SP first, fall back to local full-data cache
      if (typeof d.id === 'number' && (USE_SP || getSiteURL())) {
        try { const full = await dbLoadCE(d.id); if (full) d = full; } catch(ex) { console.warn('handleLoad dbLoadCE:', ex.message); }
      }
      // Still no tools — try the local cache written by dbSaveHistory
      if (d.tools === undefined) {
        try { const cached = LS.get('ce_cache:' + (d.info?.ceNum || d.ceNum)); if (cached) d = cached; } catch(_){logSwallowed('App:L2914',_);}
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
      } catch(_){logSwallowed('App:L2931',_);}
    }
    /* A CE whose header says it cost money but has no line items behind it.

       dbSaveHistory POSTs the header before the line items, so anything that
       fails in between leaves exactly this in SharePoint. It used to open as a
       blank estimate reporting P0.00 with a cheerful "Loaded" toast, which
       reads as "this CE is empty" rather than "this CE did not come back". */
    /* Every place a CE keeps cost, not just the four line-item tabs. A CE that is
       only mobilisation, or only a third-party rental under Miscellaneous, has no
       manpower, tools, materials or PPE rows and a perfectly good total -- and was
       refused here as though its rows had never reached SharePoint. */
    const _arr = v => Array.isArray(v) ? v.length : 0;
    const _rowCount = _arr(d.mp) + _arr(d.tools) + _arr(d.mats) + _arr(d.ppe) +
      _arr(d.mobVehicles) + _arr(d.demobVehicles) + _arr(d.addlCosts) +
      Object.keys(d.misc && typeof d.misc === 'object' ? d.misc : {}).reduce((t, k) => t + _arr(d.misc[k]), 0);
    if (!_rowCount && N(d.grand) > 0) {
      showToast('⚠ ' + (d.info?.ceNum || d.ceNum || 'This CE') + ' has a stored total of ' +
        'P' + N(d.grand).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' but no line items in SharePoint — the header was written and the rows were not. ' +
        'Nothing was loaded. Re-import or re-save this CE to restore it.', true);
      return;
    }
    _ownNum.current = String((d.info && d.info.ceNum) || d.ceNum || '').trim().toUpperCase();
    _loadedAt.current = { num: _ownNum.current, at: d.savedAt || '' };
    setCeType(d.ceType || 'onsite');
    setInfo({
      ...BLANK_INFO,
      ...d.info,
      /* Saved before the company was a choice: it was using the first one. */
      companyId: (d.info && d.info.companyId != null && d.info.companyId !== '') ? d.info.companyId : (((companies || [])[0] || {}).id != null ? companies[0].id : '')
    });
    /* Loading regenerates every row id, scope tasks included. Remap each
       resource row's taskId through the same mapping, or every SOW Breakdown
       assignment would silently orphan on load. */
    const _R = ceIdRemapper(d.sowItems);
    const _sow = _R.sow;
    const _mp=(d.mp||[]).map(_R.rt('mp'));setMp(_mp);try{window.shicCurrentMp=_mp;}catch(_e){logSwallowed('App:L2963',_e);}
    const _tools=(d.tools||[]).map(_R.rt('tools'));setTools(_tools);try{window.shicCurrentTools=_tools;}catch(_e){logSwallowed('App:L2964',_e);}
    const _mats=(d.mats||[]).map(_R.rt('mats'));setMats(_mats);try{window.shicCurrentMats=_mats;}catch(_e){logSwallowed('App:L2965',_e);}
    setPpe((d.ppe || []).map(_R.rt('ppe')));
    /* A drawn signature belongs to the CE it was drawn on. */
    setSignatures(d.signatures && typeof d.signatures === 'object' ? {...d.signatures} : {});
    setCalc(d.calc && typeof d.calc === 'object' ? JSON.parse(JSON.stringify(d.calc)) : null);
    setCalcOpen(false);
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
    setTimeout(() => { try { if (_live.current) _lastAutoSig.current = _live.current.sig; } catch(_e){logSwallowed('App:L3023',_e);} }, 400);
    showToast('Loaded: ' + (d.info?.ceNum || ''));
  };
  /* The number just offered is only a guess until it is claimed in the shared list of
     reservations; if the claim lands on a different number the form takes that one,
     unless the person has already typed their own. */
  const claimCeNum = (prefix, guess) => {
    let shown = guess;
    _claimedSeq.current = (ceSeqOf(guess) || {}).seq || '';
    const apply = n => {
      if (!n || n === shown) return;
      const from = shown; shown = n;
      _claimedSeq.current = (ceSeqOf(n) || {}).seq || '';
      setInfo(p => String(p.ceNum || '').toUpperCase() === String(from).toUpperCase() ? { ...p, ceNum: n } : p);
      showToast('CE Number ' + from + ' was just taken by someone else. This CE is ' + n + '.');
    };
    dbReserveCeNumber(prefix, history, ceNums, currentUser?.username, apply).then(apply).catch(_e => logSwallowed('App:claimCeNum', _e));
  };
  const handleClone = (e) => {
    const d = e.data || e;
    const _guess = nextCeNum(history, null, ceNums);
    handleLoad({...d, _newQuote: true, signatures: apvStripSigs(d.approvers, d.signatures), info: {...(d.info || {}), approval: undefined, ceNum: _guess, date: new Date().toISOString().slice(0,10)}});
    claimCeNum(null, _guess);
    showToast('Cloned — assigned new CE number.');
  };
  const handleRevise = async (e) => {
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
    const _why = await askRevisionReason(raw || newCeNum);
    if (!_why) return;
    _revReason.current = {num: newCeNum.toUpperCase(), why: _why};
    handleLoad({...d, signatures: apvStripSigs(d.approvers, d.signatures), info: {...(d.info || {}), approval: undefined, ceNum: newCeNum, revisionReason: _why, date: new Date().toISOString().slice(0,10)}});
    showToast('Revision ' + newCeNum + ' loaded — review & save when ready.');
  };
  /* ── Approval routing (approval.js) ── */
  useEffect(() => { if (saveReq) handleSave(); }, [saveReq]);
  /* The quantity calculators' company standards and the team's history. */
  useEffect(() => {
    let live = true;
    dbGetCompanyKey('calc_std').then(v => { if (live && v) setCalcStored(v); }).catch(_e => logSwallowed('App:calc_std', _e));
    dbGetCompanyKey('calc_hist').then(v => { if (live && v && Array.isArray(v.rows)) setCalcHist(v.rows); }).catch(_e => logSwallowed('App:calc_hist', _e));
    return () => { live = false; };
  }, []);
  const calcStdNow = useMemo(() => calcStd(calcStored), [calcStored]);
  const calcNorm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  /* The Masterlist's unit cost for a line, matched on its description, or null. */
  const calcPriceFor = desc => {
    const k = calcNorm(desc), hit = (masterlist.materials || []).find(r => calcNorm(r.desc) === k);
    return hit && isFinite(Number(hit.cost)) ? Number(hit.cost) : null;
  };
  /* An admin changes a company standard. Only the changed values are stored. */
  const calcSaveStd = change => {
    const next = {allow: {...((calcStored || {}).allow || {}), ...(change.allow || {})}, units: {...((calcStored || {}).units || {}), ...(change.units || {})}};
    setCalcStored(next);
    auditLog('calc_standard', JSON.stringify(change), currentUser?.username);
    dbSaveCompanyKey('calc_std', next).then(ok => { if (!ok) showToast('Saved on this device only: SharePoint did not accept the standard.', true); });
  };
  /* Lines go to Materials as ordinary rows. A row with the same description is
     updated instead of added again, so working a quantity out twice does not
     order it twice; its unit cost, which someone may have changed, is left alone. */
  const calcAddLines = (lines, kind, used) => {
    let rows = mats.slice();
    if (rows.length === 1 && !rows[0].desc && !N(rows[0].cost)) rows = [];
    let added = 0, updated = 0, unpriced = 0;
    lines.forEach(l => {
      /* A row is the same line whichever system it was worked in, so matching tries both wordings. The
         Masterlist is priced per metric unit: that price is converted to the unit this line is bought in. */
      const i = rows.findIndex(r => calcNorm(r.desc) === calcNorm(l.desc) || (l.alt && calcNorm(r.desc) === calcNorm(l.alt)) || calcNorm(r.desc) === calcNorm(l.mdesc));
      const pm = calcPriceFor(l.mdesc || l.desc), pe = pm == null ? calcPriceFor(l.desc) : null;
      const price = pm != null ? Math.round(pm / (l.f || 1) * 100) / 100 : pe;
      if (i >= 0) {
        /* Worked again in the other system: the quantity and unit change, and so must the price per unit. */
        const was = rows[i];
        rows[i] = {...was, desc: l.desc, qty: l.qty, uom: l.uom, cost: was.uom && was.uom !== l.uom ? Math.round(calcCostConv(N(was.cost), was.uom, l.uom) * 100) / 100 : was.cost};
        updated++;
      }
      else { rows.push({...mkRes(), desc: l.desc, qty: l.qty, uom: l.uom, cost: price == null ? 0 : price}); added++; if (price == null) unpriced++; }
    });
    setMats(rows);
    /* What this CE used goes into the team's history: one value per CE and allowance, the latest.
       The stored list is read again just before it is written, so another estimator's entries made since this
       session started are kept; an unsaved CE is filed under its user, not under one name shared by everyone. */
    const ce = String(info.ceNum || '').trim() || '(unsaved ' + (currentUser?.username || '') + ')', at = new Date().toISOString();
    const merge = base => {
      const keep = (base || []).filter(r => !(r && r.ce === ce && Object.prototype.hasOwnProperty.call(used || {}, r.k)));
      return [...keep, ...Object.keys(used || {}).map(k => ({ce, k, v: used[k], at}))].slice(-400);
    };
    setCalcHist(merge(calcHist));
    dbGetCompanyKey('calc_hist').then(v => {
      const next = merge(v && Array.isArray(v.rows) ? v.rows : calcHist);
      setCalcHist(next);
      return dbSaveCompanyKey('calc_hist', {rows: next});
    }).catch(_e => logSwallowed('App:calc_hist', _e));
    setCalcOpen(false);
    showToast((added + updated) + ' line' + (added + updated === 1 ? '' : 's') + ' ' + (updated && !added ? 'updated on' : 'added to') + ' Materials' +
      (unpriced ? '. ' + unpriced + ' ha' + (unpriced === 1 ? 's' : 've') + ' no Masterlist price, so its unit cost is 0.' : '.'), unpriced > 0);
  };
  useEffect(() => {
    if (tab !== 'summary') return;
    dbGetUsers().then(u => setApvUsers((u || []).filter(x => x.status !== 'pending' && x.status !== 'disabled' && x.status !== 'rejected'))).catch(_e=>logSwallowed('App:L3058',_e));
  }, [tab]);
  /* Monitoring knows when a revision was superseded; the CE's own copy of the
     approval was written before that and still says pending. */
  const _apvMon = (() => { try { const id = (history.find(h => ((h.info && h.info.ceNum) || h.ceNum) === info.ceNum) || {}).id; return id != null && (monData[id] || {}).apv; } catch (_e) { return null; } })();
  const apvState = (_apvMon && _apvMon.state === 'superseded') ? 'superseded' : ((info.approval && info.approval.state) || 'none');
  /* The signatures this CE may show: a routed line's stamped image only
     while that line is signed in the approval on the CE right now. */
  const visSigs = useMemo(() => apvVisibleSigs(approvers, info.approval, signatures), [approvers, info.approval, signatures]);
  const apvLocked = apvState === 'pending' || apvState === 'approved';
  /* Once the accounts are known, link each named signatory to theirs, so the estimator is not left picking five people from a small
     dropdown on every CE. Not while the CE is out for approval, and never a line set back to "Sign by hand" on purpose. */
  useEffect(() => {
    if (apvLocked || !apvUsers.length) return;
    const r = apvAutoLink(approvers, apvUsers);
    if (!r.linked.length) return;
    setApprovers(r.approvers);
    showToast('Linked to their accounts: ' + r.linked.map(l => l.name).join(', ') + '. Change any of them in its dropdown.');
  }, [apvUsers, approvers, apvLocked]);
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
        if (!await uiConfirm('This clears ' + Object.keys(e.signatures).length + ' signature(s) on ' + num + '.' + String.fromCharCode(10, 10) +
          'The wording changed since it was saved, and a signature belongs to the CE it was put to.' + String.fromCharCode(10, 10) +
          'Go on and clear them?', {ok: 'Clear them', cancel: 'Keep signatures', danger: true})) { showToast('Nothing was changed — the signatures on ' + num + ' stand.'); return false; }
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
        } catch(_e){logSwallowed('App:L3119',_e);}
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
    if (!apvRoute(approvers).length) {
      /* Every signatory is on "Sign by hand": nobody is part of the routing, so nobody would be notified and nothing would wait on anyone. */
      uiAlert('Nobody would be notified.\n\nEvery signatory on this CE is set to "Sign by hand", so there is no one to route it to. Approvers are told only when the CE is routed to their account.\n\nOn each signatory card below, pick the person from the dropdown (it starts on "Sign by hand"), then Submit again.');
      showToast('No approver is linked to an account — pick a user on at least one signatory card, then Submit again.', true); return;
    }
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
    /* Say who will be told, and who will not, before anything is sent. */
    { const nt = apvRoutingNotice(approvers, _kept, (info.approval && info.approval.skipped) || {}, apvUsers);
      const msg = ['Submit ' + info.ceNum + ' for approval?', '',
        nt.routed ? 'Notified in Teams once it is routed:' : 'Everyone linked has already signed; nobody new is notified.',
        ...nt.now.map(x => '  \u2022 ' + x),
        ...(nt.later.length ? ['', 'Notified later, as the step before them signs:', ...nt.later.map(x => '  \u2022 ' + x)] : []),
        ...(nt.byHand.length ? ['', '\u26A0 Set to "Sign by hand" \u2014 NOT part of the routing, never notified, and nothing waits for them. Their signature has to be put on by hand:', ...nt.byHand.map(x => '  \u2022 ' + x)] : []),
        ...(nt.noEmail.length ? ['', '\u26A0 No email on their account, so no Teams message can reach them:', ...nt.noEmail.map(x => '  \u2022 ' + x), 'Add it in Admin \u2192 Users, or tell them yourself.'] : []),
        '', 'Nobody is notified until you submit.'].join('\n');
      if (!await uiConfirm(msg, {ok: 'Submit for approval', danger: false})) return; }
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
  const apvWithdraw = async () => {
    if (!await uiConfirm('Withdraw this CE from approval?\n\nSignatures collected so far are cleared.')) return;
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
  const apvStartReturn = async (ceId) => {
    const fromEditor = ceId == null;
    const id = fromEditor ? _apvEditorId() : ceId;
    if (id == null) return;
    const c = await uiPrompt('Return this CE to the estimator.\n\nWhat needs to change? (required)', {multiline: true, required: true, requiredMsg: 'A comment is required to return a CE.', ok: 'Return to estimator'});
    if (c == null) return;
    apvAct(id, 'return', { comment: c, fromEditor });
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
      } catch(_e){logSwallowed('App:L3257',_e);}
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
      } catch(_e){logSwallowed('App:L3291',_e);}
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
      pending: '⏳ Step ' + (Array.from(new Set(s.lines.map(l => l.step))).sort((x, y) => x - y).indexOf(s.step) + 1) + ' of ' + new Set(s.lines.map(l => l.step)).size + ' · ' + s.signedN + '/' + s.total + ' signed · waiting on ' + s.waiting.map(l => l.name || l.user).join(', ')}[apvState];
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
    /* A preset note is a bare string, or {t, imp} when it is flagged. The
       standing warnings the sales team must see are the same on every CE, so
       they belong in the preset -- read here, a flag set there survives onto
       every estimate rather than being re-ticked by hand each time. */
    const nextNotes = p ? (p.notes || []).map((t, i) =>
      ({id: uid(), seq: i + 1, text: ceNoteText(t), imp: ceNoteImp(t)})) : [];
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
    _defaultsSig.current = JSON.stringify({n: nextNotes.map(n => [n.text, !!n.imp]), a: nextAps});
    return !!p;
  };
  /* Safe to re-apply only while nothing has been edited since the last one. */
  const _defaultsUntouched = () =>
    _defaultsSig.current === JSON.stringify({n: notes.map(n => [String(n.text || ''), !!n.imp]), a: approvers});

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
    _ownNum.current = '';
    setCalc(null); setCalcOpen(false);
    setCeType('');
    if (!isRequestor) setPiGate(true);
    const _newGuess = nextCeNum(history, null, ceNums);
    claimCeNum(null, _newGuess);
    setInfo({
      ...BLANK_INFO,
      companyId: '',
      ceNum: _newGuess,
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
  const handleExport = makeHandleExport(() => ({ approvers, benefitRows, benefitsT, ceBreakdown, ceLayout, ceSections, ceType, cfg, demobVehicles, demobVehiclesT, docStatus, grand, hlAmt, hlLabel, hlRows, info, kwhRate, margin, mats, matsT, miscCosted, miscT, mobVehicles, mobVehiclesT, mp, mpTot, mpWage, notes, perJobLbl, perJobT, ppe, ppeT, pwrFrac, qtyUom, rceNo, rr, servicesSummary, showToast, showUnitP, sowItems, sowLabels, toolBasis, tools, toolsT, unitLbl, unitP }));

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
    const applySelected = async () => {
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
        if (already.length && !await uiConfirm(
          (already.length === 1 ? 'This service is' : 'These ' + already.length + ' services are') +
          ' already in this CE:\n\n  ' + already.map(s => s.title).join('\n  ') +
          '\n\nAdding again creates a SECOND set of scope tasks and a second set of ' +
          'resources, so the total will roughly double for them.\n\n' +
          'To change what is already there, edit it in SOW Breakdown instead.\n\nAdd anyway?', {ok: 'Add anyway', danger: true})) return;
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
  /* The tools list carries five figures a tier price is derived from, and they
     are reference data: read when the tier pricing is being maintained, and in
     the way the rest of the time. Twelve columns squeezed Description and Cost
     -- the two anybody actually reads -- into nothing. Hidden by default, and
     the choice is remembered, because somebody maintaining tiers wants them up
     for the whole session and everybody else never wants them. */
  const [mlTierCols, setMlTierCols] = useState(() => { try { return !!LS.get('ml_tier_cols'); } catch (_e) { return false; } });
  const toggleTierCols = () => setMlTierCols(v => { const n = !v; try { LS.set('ml_tier_cols', n); } catch(_e){logSwallowed('App:L4209',_e);} return n; });
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
  const MlCalcModal = () => MlCalcModalTab({ masterlist, mlCalc, saveML, setMlCalc, showToast });
  const MlEditor = () => MlEditorTab({ ML_HIST_KIND, currentUser, escPct, masterlist, mlPage, mlQ, mlQuickAdd, mlQuickAddRef, mlSaveTimer, mlTab, mlTierCols, mlToTrash, mlTrashItemName, openMlTrash, saveML, setEscPct, setMasterlist, setMlCalc, setMlPage, setMlQ, setMlQuickAdd, setMlTab, setMlTrend, showToast, toggleTierCols });
  const STATUS_COLOR_MAP = {
    'Draft': 'var(--accent-violet)',
    'No Quote': '#94A3B8',
    'Pending': '#6B7280',
    'Ongoing': 'var(--status-warning)',
    'Sourcing': '#A855F7',
    'Waiting for Information': '#EAB308',
    'Revised': '#38BDF8',
    'For site Inspection': 'var(--accent-violet)',
    'For Approval': 'var(--accent-cyan)',
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
  const [monReqFilter, setMonReqFilter] = useState('all');
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
  const [rceReview, setRceReview] = React.useState(null);
  const [reqUsers, setReqUsers] = React.useState([]);
  const [monMine, setMonMine] = React.useState(false);
  const [monApvMine, setMonApvMine] = React.useState(false);
  /* Reassigning from the row: {id, ceNum, from, to} while the picker is open. */
  const [assignPanel, setAssignPanel] = React.useState(null);
  const openAssign = e => {
    const m = monOf(e);
    const cur = m.ceeName || m.preparedBy || e.savedBy || '';
    setAssignPanel({ id: e.id, ceNum: e.info?.ceNum || e.ceNum || '', from: cur, to: cur });
    dbGetUsers().then(u => setReqUsers((u || []).filter(x => x.status !== 'pending' && x.status !== 'disabled' && x.status !== 'rejected'))).catch(_e=>logSwallowed('App:L5146',_e));
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
    setReqForm({ ceType: 'onsite', client: '', description: '',
      projType: 'Mechanical', dateRecv: today, deadline: '', assignee: '', remarks: '', rceNo: '', companyId: '',
      /* The checklist starts blank on purpose. Seeding every item as Yes would
         make a complete-looking request out of one that nobody has read. */
      inquiryNo: '', inquiryDate: today, completionDate: '', workLocation: '', address: '',
      assignedSales: currentUser.name || currentUser.username || '', inquiryType: '', stage: 'New project',
      items: {}, recommendation: '', otherRemarks: '', declineReason: '' });
    dbGetUsers().then(u => setReqUsers((u || []).filter(x => x.status !== 'pending' && x.status !== 'disabled' && x.status !== 'rejected'))).catch(_e=>logSwallowed('App:L5170',_e));
  };
  /* The Cost Estimation team accepts a request: only now does it get a CE
     number. The request row keeps its place (same id, same attachments, same
     Monitoring row) and is renamed from its RCE No. to the CE number. */
  const acceptRequest = async (e, extra) => {
    if (isRequestor) { showToast('Only the Cost Estimation team can accept a request.', true); return false; }
    const i0 = e.info || {};
    if (!i0.request || i0.acceptedCeNum || typeof e.id !== 'number') return false;
    const rce = String(i0.requestNum || i0.ceNum || '').trim();
    const NL = String.fromCharCode(10);
    const co = (companies || []).find(c => i0.companyId != null && i0.companyId !== '' && String(c.id) === String(i0.companyId));
    const ans = await uiPrompt('Accept request ' + rce + ' and give it its CE number' + NL + NL +
      (co ? 'Issuing company: ' + co.name + '. The number follows its prefix (' + (co.cePrefix || 'SHIC') + ').' : 'This request names no company. Change the prefix (SHIC, SY3) if it belongs to the other company.'),
      {value: co ? nextCeNumForCompany(history, co, ceNums) : nextCeNum(history, null, ceNums), ok: 'Accept request', required: true,
       validate: v => /^[A-Z0-9\-_\/\.]{2,30}$/.test(String(v).toUpperCase()) ? '' : 'CE Number must be 2\u201330 characters, letters/numbers/dashes only.'});
    if (ans === null) return false;
    const newNum = String(ans).trim().toUpperCase();
    if (!/^[A-Z0-9\-_\/\.]{2,30}$/.test(newNum)) { showToast('CE Number must be 2–30 characters, letters/numbers/dashes only.', true); return false; }
    const taken = (await dbFindCEByNum(newNum).catch(() => null)) || (await dbFindCESeqClash(newNum, ceNums).catch(() => null));
    if (taken) { showToast('CE Number "' + newNum + '" is already taken. Next free: ' + nextCeNum(history, (newNum.split('-CE-')[0] || null), [...ceNums, newNum]), true); return false; }
    const newInfo = { ...i0, ...(extra || {}), ceNum: newNum, requestNum: rce, rceNo: i0.rceNo || rce, acceptedCeNum: newNum,
      acceptedBy: currentUser.name || currentUser.username || '', acceptedAt: new Date().toISOString() };
    const res = await dbAcceptRequest(e.id, rce, newNum, newInfo);
    if (!res || !res.ok) { showToast('Not accepted — ' + ((res && res.reason) || 'SharePoint refused it') + '.', true); return false; }
    const re = h => String(h.id) === String(e.id) ? { ...h, ceNum: newNum, info: newInfo } : h;
    setHistory(p => p.map(re));
    try { LS.set('history', (LS.get('history') || []).map(re)); } catch (_e) { logSwallowed('App:acceptRequest', _e); }
    setCeNums(p => p.indexOf(newNum) < 0 ? [...p, newNum] : p);
    auditLog('accept_request', rce + ' -> ' + newNum, currentUser?.username);
    showToast('Request ' + rce + ' accepted as ' + newNum + '. Load it to build the estimate.');
    return true;
  };
  /* The Cost Estimation team's review of a request (mode 'review'), or the
     requestor's update of one that came back (mode 'update'). Proceed is the
     acceptance; Secure returns it; Decline closes it with the reason. */
  const openReview = (e, mode) => {
    setRceReview({ e, mode });
    if (!reqUsers.length) dbGetUsers().then(u => setReqUsers((u || []).filter(x => x.status !== 'pending' && x.status !== 'disabled' && x.status !== 'rejected'))).catch(_e => logSwallowed('App:openReview', _e));
  };
  const saveReview = async p => {
    const e = rceReview && rceReview.e, mode = rceReview && rceReview.mode;
    if (!e || typeof e.id !== 'number') return;
    if (mode === 'review' && isRequestor) { showToast('Only the Cost Estimation team can review a request.', true); return; }
    if (mode === 'update' && !reqOwns(e.id, monData[e.id])) { showToast('You can only update a request you raised.', true); return; }
    const i0 = e.info || {}, who = currentUser.name || currentUser.username || '', now = new Date().toISOString();
    const rce = { ...(i0.rce || {}), items: p.items, otherRemarks: p.otherRemarks, recommendation: p.recommendation, declineReason: p.declineReason };
    const label = String(i0.requestNum || i0.ceNum || '');
    const curEst = String((monData[e.id] || {}).ceeName || '').trim(), newEst = String(p.assignee || '').trim();
    setReqBusy(true);
    try {
      if (mode === 'review' && newEst && newEst !== curEst) { updateMon(e.id, 'ceeName', newEst); auditLog('assign_request', label + ' -> ' + newEst, currentUser?.username); }
      if (mode === 'review' && p.recommendation === 'proceed') {
        const ok = await acceptRequest(e, { rce, reviewStatus: 'accepted', reviewedBy: who, reviewedAt: now, reviewNote: p.note });
        if (ok) {
          auditLog('review_request', label + ' proceed', currentUser?.username); setRceReview(null);
          const _m = monData[e.id] || {};
          updateMon(e.id, { req: mkReq('accepted', [_m.receivedBy, newEst || curEst].filter(Boolean).join(', '), p.note, label) });
        }
        return;
      }
      const st = mode === 'update' ? 'resubmitted' : p.recommendation === 'decline' ? 'declined' : 'returned';
      const newInfo = { ...i0, rce, reviewStatus: st,
        reviewNote: mode === 'update' ? '' : (p.recommendation === 'decline' ? p.declineReason : p.note),
        ...(mode === 'update' ? { resubmittedBy: who, resubmittedAt: now, resubmitNote: p.note } : { reviewedBy: who, reviewedAt: now }) };
      const okp = await dbPatchCEInfo(e.id, newInfo);
      if (!okp) { showToast('Not saved — SharePoint refused it.', true); return; }
      const re = h => String(h.id) === String(e.id) ? { ...h, info: newInfo } : h;
      setHistory(q => q.map(re));
      try { LS.set('history', (LS.get('history') || []).map(re)); } catch (_e) { logSwallowed('App:saveReview', _e); }
      /* A declined request is closed, so it must not count as open work; reopening it puts it back to Draft. */
      if (st === 'declined') updateMon(e.id, 'status', 'No Quote');
      else if (mode === 'review' && ((monData[e.id] || {}).status === 'No Quote')) updateMon(e.id, 'status', 'Draft');
      auditLog('review_request', label + ' ' + st, currentUser?.username);
      { const _m = monData[e.id] || {};
        /* Returned and declined go to the requestor; a resubmission goes back to the estimators, or, with none yet, the reviewers. */
        updateMon(e.id, { req: mkReq(st, st === 'resubmitted' ? (newEst || curEst).replace(/^Unassigned$/, '') : (_m.receivedBy || ''), mode === 'update' ? p.note : (p.recommendation === 'decline' ? p.declineReason : p.note), label) }); }
      setRceReview(null);
      showToast(mode === 'update' ? 'Sent back to Cost Estimation.' : st === 'declined' ? 'Request ' + label + ' declined.' : 'Request ' + label + ' returned to the requestor.');
    } finally { setReqBusy(false); }
  };
  const submitRequest = async () => {
    const f = reqForm || {};
    /* A request is known by its RCE No. It has no CE number yet: that is given
       when the Cost Estimation team accepts it (acceptRequest). Until then the
       RCE No. is the key the request is filed under. */
    const ceNum = String(f.rceNo || '').trim().toUpperCase();
    /* Every problem is gathered and shown together, so the requestor fixes the
       form in one pass instead of learning of one missing field per click. */
    const _errs = {}, _todo = [];
    if (!ceNum) { _errs.rceNo = 1; _todo.push('RCE No.'); }
    else if (!/^[A-Z0-9\-_\/\.]{2,30}$/.test(ceNum)) { _errs.rceNo = 1; _todo.push('RCE No. (2-30 characters, letters/numbers/dashes only)'); }
    if (!String(f.client || '').trim()) { _errs.client = 1; _todo.push('Customer'); }
    /* The company decides the CE number prefix and the printed form, so it is asked here and not guessed at acceptance. */
    if (f.companyId == null || f.companyId === '') { _errs.companyId = 1; _todo.push('Issuing company'); }
    /* A request names who it is for. Left blank it reached nobody in particular and sat unseen. */
    if (!String(f.assignee || '').trim()) { _errs.assignee = 1; _todo.push('Assigned to (pick at least one estimator)'); }
    /* The checklist and item 14 are the estimators' review, done after the request is logged; they are not required to log it. */
    if (_todo.length) {
      setReqForm(p => ({ ...p, _errs }));
      showToast('Still needed: ' + _todo.join('; ') + '.', true);
      return;
    }
    setReqBusy(true);
    try {
      const dup = (await dbFindCEByNum(ceNum).catch(() => null)) ||
        Object.values(monData || {}).some(m => String((m && m.rceNo) || '').trim().toUpperCase() === ceNum);
      if (dup) {
        showToast('RCE No. "' + ceNum + '" is already on a request or a CE. Each RCE No. is logged once.', true);
        setReqBusy(false); return;
      }
      const entry = {
        ceType: f.ceType || 'onsite',
        info: { ...BLANK_INFO, ceNum, date: f.dateRecv || BLANK_INFO.date, client: f.client.trim(),
          companyId: isNaN(f.companyId) ? f.companyId : Number(f.companyId),
          description: String(f.description || '').trim(), projType: f.projType || BLANK_INFO.projType,
          status: 'DRAFT', request: true, requestNum: ceNum, rceNo: ceNum,
          /* info is stored whole as one JSON column, so the checklist rides
             along with it and needs no new SharePoint column of its own. */
          rce: { inquiryNo: String(f.inquiryNo || '').trim(), inquiryDate: f.inquiryDate || '',
            completionDate: f.completionDate || '', deadline: reqDeadline(f.deadline, f.inquiryDate, f.dateRecv),
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
      const fields = { status: 'Pending', ceeName: String(f.assignee || '').trim() || 'Unassigned', customer: f.client.trim(),
        jobTitle: String(f.description || '').trim(), designation: f.projType || '', dateRecv: f.dateRecv || '',
        deadline: reqDeadline(f.deadline, f.inquiryDate, f.dateRecv), receivedBy: currentUser.name || currentUser.username || '',
        /* The recommendation belongs where the estimator looks first. Left
           only inside the CE it would be found after the work started, not
           before -- and 14.2 and 14.3 are both reasons not to start. */
        remarks: [(RCE_RECOMMENDATIONS.find(r => r.v === f.recommendation) || {}).t,
          f.recommendation === 'decline' ? String(f.declineReason || '').trim() : '',
          String(f.remarks || '').trim()].filter(Boolean).join(' — '),
        rceNo: ceNum };
      /* The assigned estimators are told; unassigned, the flow tells the reviewers. */
      fields.req = mkReq('new', String(f.assignee || '').trim(), [f.client.trim(), String(f.description || '').trim()].filter(Boolean).join(' - '), ceNum);
      const mres = await dbSaveMonEntry(saved.id, ceNum, fields, Object.keys(fields));
      setMonData(p => ({ ...p, [saved.id]: (mres && mres.fields) || fields }));
      auditLog('log_request', ceNum + ' -> ' + fields.ceeName, currentUser?.username);
      await loadHist();
      setReqForm(null);
      const _docs = reqFiles.slice();
      setReqFiles([]);
      showToast('Request RCE ' + ceNum + (fields.ceeName === 'Unassigned' ? ' logged. A reviewer will assign an estimator' : ' logged and assigned to ' + fields.ceeName) +
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
    if (canSeeAll) return;
    const have = new Set(history.map(h => String(h.id)));
    const missing = Object.keys(monData || {}).filter(id => !have.has(String(id)) && mineToSee(id)).sort().join(',');
    if (missing && missing !== _assignedKey.current) { _assignedKey.current = missing; loadHist(); }
  }, [monData, history, canSeeAll]);
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
    if (!me) return {sign: [], returned: [], reqReturned: [], reqAwaiting: [], total: 0};
    const heads = groupCERevisions(monRows, h => (h.info && h.info.ceNum) || h.ceNum || '')
      .map(g => g.head).filter(e => !e._draft);
    const rows = heads.map(e => ({e: e, m: monData[e.id] || {}}));
    const apv = x => x.m.apv || {};
    const sign = rows.filter(x => apvMonWaitsOn(x.m, me));
    const returned = rows.filter(x => apv(x).state === 'returned' && apv(x).submittedBy === me);
    /* Only the latest revision of a CE is waiting on anyone. An approval left
       pending on an older revision -- replaced by ↻ Revise, or a CE since
       deleted -- is stale: it showed as "CE #2817" with nothing to sign. */
    /* Requests. A requestor is told when the team sends one back; the team is told when one is waiting for a decision
       (new, or sent back to them by the requestor). Both are in the count that drives the toast and the window title. */
    const mine = meNames();
    const isReq = x => { const i = x.e.info || {}; return i.request && !i.acceptedCeNum; };
    const reqReturned = isRequestor ? rows.filter(x => isReq(x) && x.e.info.reviewStatus === 'returned' && ((x.m.receivedBy && mine.includes(String(x.m.receivedBy).trim().toUpperCase())) || x.e.savedBy === me)) : [];
    const reqAwaiting = !isRequestor ? rows.filter(x => isReq(x) && x.e.info.reviewStatus !== 'returned' && x.e.info.reviewStatus !== 'declined' && typeof x.e.id === 'number') : [];
    return {sign: sign, returned: returned, reqReturned: reqReturned, reqAwaiting: reqAwaiting, total: sign.length + returned.length + reqReturned.length + reqAwaiting.length};
  }, [monRows, monData, currentUser, isRequestor]);
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
    if (n > was && was >= 0) setTimeout(() => showToast([
      myTodo.sign.length ? '✍ ' + myTodo.sign.length + ' CE' + (myTodo.sign.length === 1 ? '' : 's') + ' waiting for your signature' : '',
      myTodo.returned.length ? '↩ ' + myTodo.returned.length + ' returned to you' : '',
      myTodo.reqReturned.length ? '↩ ' + myTodo.reqReturned.length + ' request' + (myTodo.reqReturned.length === 1 ? '' : 's') + ' returned to you by Cost Estimation' : '',
      myTodo.reqAwaiting.length ? '📥 ' + myTodo.reqAwaiting.length + ' request' + (myTodo.reqAwaiting.length === 1 ? '' : 's') + ' awaiting review' : ''
    ].filter(Boolean).join(' · ') + ' — see My Work.'), 1200);
    _apvToldRef.current = n;
  }, [myTodo.total]);
  /* And on the window title, so it shows while the app is in another window. */
  useEffect(() => {
    const base = 'SHIC Cost Estimator';
    try { document.title = myTodo.total ? '(' + myTodo.total + ') ' + base : base; } catch(_e){logSwallowed('App:L5498',_e);}
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
  /* CEs saved before the Discipline field existed carry none, and the column
     reads blank. Admins can give every blank CE in the current view one:
     only blanks are written, so a CE that already has a discipline is never
     overwritten, and the view's own filters pick which ones. */
  const fillBlankDisc = async () => {
    if (!isAdmin) return;
    const blanks = sortedHistory.filter(e => !e._draft && typeof e.id === 'number' && !String(monDisc(e, monOf(e)) || '').trim());
    if (!blanks.length) { showToast('Every CE in this view already has a discipline.'); return; }
    const NL = String.fromCharCode(10);
    const ans = await uiPrompt(blanks.length + ' CE(s) in this view have no discipline.' + NL + NL + 'Pick the discipline to give them.',
      {choices: CE_DISCIPLINES, required: true, requiredMsg: 'Pick a discipline.', ok: 'Continue'});
    if (ans === null) return;
    const pick = CE_DISCIPLINES.find(d => d.toUpperCase() === String(ans).trim().toUpperCase());
    if (!pick) { showToast('"' + ans + '" is not one of: ' + CE_DISCIPLINES.join(', ') + '.', true); return; }
    if (!await uiConfirm('Set ' + pick + ' on ' + blanks.length + ' CE(s)? Ones that already have a discipline are not touched.')) return;
    blanks.forEach(e => updateMon(e.id, 'designation', pick));
    auditLog('bulk_discipline', pick + ' x' + blanks.length, currentUser?.username);
    showToast(pick + ' set on ' + blanks.length + ' CE(s).');
  };
  const custOptions = useMonFacet(monCust);

  /* The RCE No. a row goes by: the one on its monitoring row, else the one the request was filed under. */
  const rceOf = (e, m) => String((m && m.rceNo) || (e.info && (e.info.requestNum || e.info.rceNo)) || '').trim();
  /* 'pending' a request nobody has accepted, 'accepted' a request that became a CE, 'ce' everything else. */
  const reqKind = e => { const i = e.info || {}; return i.request ? (i.acceptedCeNum ? 'accepted' : 'pending') : 'ce'; };
  const sortedHistory = useMemo(() => {
    const filtered = monRows.filter(e => {
      const m = monOf(e);
      if (monReqFilter !== 'all' && reqKind(e) !== monReqFilter) return false;
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
      if (monMine && !ceeMatches(meNames(), m.ceeName || m.preparedBy || e.savedBy || '')) return false;
      if (!monSearch) return true;
      /* Every word typed must be found in some column of the row, in any order (same as the Dashboard's Open CEs filter). */
      const hay = [e.info?.ceNum, rceOf(e, m), e.info?.client, e.info?.description, m.jobTitle, m.customer, e.info?.projType, m.designation, m.ceeName, m.preparedBy, e.savedBy, m.receivedBy, m.rceNo, m.remarks, m.status || 'Draft'].join(' ').toLowerCase();
      return monSearch.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.indexOf(w) >= 0);
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
        case 'rceNo':        return rceOf(e, m);
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
  }, [monRows, monData, monSearch, monStatusFilter, monTypeFilter, monReqFilter, monDiscFilter, monCustFilter, monMine, monApvMine, monSortCol, monSortDir]);
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
  const importShicCeFiles = makeImportShicCeFiles(() => ({ currentUser, history, loadHist, setCeImportProgress, showToast }));

  /* ── Import monitoring from Excel (CE Tracking spreadsheet) ── */
  const [importProgress, setImportProgress] = React.useState(null); // null | {done,total}
  const importMonitoringXLSX = makeImportMonitoringXLSX(() => ({ MON_KEY, currentUser, monData, setHistory, setImportProgress, setMonData, showToast }));

  /* Invoked as HistPanel(), never as an element -- it is declared inside App,
     so as a component it takes a new identity on every App render and React
     remounts the whole panel each time. It holds no hooks, so nothing looked
     wrong; but it holds nine uncontrolled inputs and the search box, and a
     remount destroys the caret and any half-typed cell along with them.
     Calling it makes its output part of App's own tree.
     (Written without the element-creating call by name: the guard in
     tools/check-remounting-editors.js reads the source as text, and would
     take a mention of it here for the real thing.) */
  const HistPanel = () => MonitoringPanel({ MON_PAGE_SIZE, STATUS_COLOR_MAP, SortIcon, addStatus, allStatuses, assignPanel, attachList, attachPanel, ceImportProgress, coOptions, compareModal, compareSet, confirmDel, currentUser, custOptions, deleteDraft, discOptions, editingRow, fillBlankDisc, getStatusColor, handleClone, handleLoad, handleRevise, handleSave, histBusy, history, importMonitoringXLSX, importProgress, importShicCeFiles, isAdmin, isRequestor, loadHist, loadMonData, monApvMine, monCustFilter, monData, monDiscFilter, monMine, monOf, monPage, monPageRows, monReqFilter, monRevOpen, monSearch, monSpIds, monStatusFilter, monTableWrapRef, monTopScrollRef, monTypeFilter, newStatusInput, openAssign, openAttachPanel, openForPrint, openRequest, openReview, rceOf, removeStatus, reqOwns, resDays, resumeDraft, setAttachPanel, setCompareModal, setCompareSet, setConfirmDel, setDiffModal, setEditingRow, setHistory, setMonApvMine, setMonCustFilter, setMonDiscFilter, setMonMine, setMonPage, setMonReqFilter, setMonRevOpen, setMonSearch, setMonStatusFilter, setMonTypeFilter, setNewStatusInput, setRceReview, setRemarkDraft, setRemarksPanel, setShowStatusFilter, setShowStatusMgr, setStatusPanel, setUndoToast, setViewCE, showStatusFilter, showStatusMgr, showToast, sortedHistory, statusPanel, toggleSort, updateMon });
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
  const ScopeLibraryEditor = () => ScopeLibraryTab({ _editDraft, _editSvc, _libCat, _libSearch, _resTab, _setEditDraft, _setEditSvc, _setLibCat, _setLibSearch, _setResTab, cacheSowLib, masterlist, newRowId, newRowNameRef, saveSowLib, setNewRowId, setShowSpWiz, setSowLib, setSpWizBusy, setSpWizLog, showSpWiz, showToast, sowLib, spWizBusy, spWizLog });

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
  const Picker = makePicker(() => ({ masterlist, picker, pickerQ, pickerSel, setPicker, setPickerQ, setPickerSel }));

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
      /* The figures the quantity has already been applied to, so reading down
         TOTAL COST still adds to TOTAL AMOUNT in either quantity mode. In
         divide mode every multiplier is 1 and these are the tab totals. */
      ...(cfg.mobDemob ? [['Mobilization Expenses', 'MOBILIZATION', mobSubTX], ['Demobilization Expenses', 'DEMOBILIZATION', demobSubTX]] : []),
      ['Manpower Cost', 'MANPOWER COST', mpTotX],
      ['Tools & Equipment', 'TOOLS AND EQUIPMENTS', toolsTX],
      ['Materials & Consumables', 'MATERIALS AND CONSUMABLES', matsTX],
      ['PPE', 'PERSONAL PROTECTIVE EQUIPMENT', ppeTX],
      ['Miscellaneous', 'MISCELLANEOUS', miscTX]
    ];
    let i = 0;
    return defs.map(([label, printLabel, v]) => ({
      label, printLabel, v,
      letter: N(v) > 0 ? String.fromCharCode(65 + i++) + '.' : ''
    }));
  }, [mpTotX, toolsTX, matsTX, ppeTX, miscTX, mobSubTX, demobSubTX, cfg.mobDemob]);
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
      /* Charged per unit or charged once, category by category -- the parts
         have to add up to the section above them, and that section has had
         the quantity applied to it. */
      v: (Array.isArray(misc[k]) ? misc[k] : []).reduce((t, r) => t + miscRowCost(r), 0) * qFx(k)
    })).filter(x => x.v > 0).map((x, j) => ({...x, letter: parent.replace('.', '') + '.' + (j + 1)}));
  }, [ceSections, ceType, misc, qtyMulOn, qtyN, perJob]);
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
      /* Manpower is never exempt, so every part of it moves with the quantity
         exactly as the section does. */
      put('MANPOWER COST', [
        ...Object.keys(SHIFTS).map(k => ({ label: mpShiftLabel(k), v: (byShift[k] || 0) * qF })),
        { label: MP_BENEFITS_LABEL, v: ben * qF }]);
    }
    /* Tools split into the three buckets the electrical team already works
       in: common tools, electrical equipments, facilities. rowCost is the
       same per-row figure toolsT is built from, so the three parts add up to
       the section exactly rather than to something near it.

       Every bucket is listed even when empty, because the sheet these are
       modelled on lists them: an estimator reading D.3 FACILITIES with a dash
       beside it knows nothing was charged there, where a missing line only
       says somebody left it out. `put` drops the parts that cost nothing, so
       a CE with tools in one bucket only prints the one. */
    if (ceLayout.breaks.indexOf('tools') >= 0) {
      const byGroup = {};
      tools.forEach(r => { const k = toolGroupOf(r); byGroup[k] = (byGroup[k] || 0) + rowCost('tools', r); });
      put('TOOLS AND EQUIPMENTS', TOOL_GROUPS.map(g => ({ label: g.t, v: (byGroup[g.k] || 0) * qF })));
    }
    /* The Electrical sheet sets its parts in capitals like everything else
       on it; the Mechanical one reads them as a sentence under the line they
       belong to. */
    if (ceLayout.breaks.indexOf('misc') >= 0) put('MISCELLANEOUS',
      miscCosted.map(x => ({ label: ceLayout.parentCarries ? x.label : String(x.label).toUpperCase(), v: x.v })));
    return out;
  }, [ceSections, ceLayout, mp, rr, ben, miscCosted, qF, tools, kwhRate, _workMap]);
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
  const handleGenerateCE = makeHandleGenerateCE(() => ({ approvers, benefitRows, benefitsT, ceBreakdown, ceLayout, ceSections, ceType, demobVehicles, demobVehiclesT, grand, hlAmt, hlLabel, hlRows, incOn, info, kwhRate, margin, mats, matsT, miscCosted, miscT, mobVehicles, mobVehiclesT, monData, mp, mpTot, notes, openCeId, perJobLbl, perJobT, powerOn, ppe, ppeT, pwrFrac, qtyUom, rceNo, rr, servicesSummary, showUnitP, signatures, sowItems, sowLabels, toolBasis, tools, toolsT, unitLbl, unitP }));
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
  const confirmZeroCost = async action => {
    const z = collectZeroCost();
    if (!z.length) return true;
    const preview = z.slice(0, 10).join('\n') + (z.length > 10 ? '\n... and ' + (z.length - 10) + ' more' : '');
    return await uiConfirm(z.length + ' item(s) have ₱0 cost and will not contribute to the total:\n\n' + preview + '\n\n' + action);
  };
  const handleGenerateCEWithCheck = async () => {
    if (!await confirmZeroCost('Proceed with generating CE?')) return;
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
  const handleExportXLSX = makeHandleExportXLSX(() => ({ approvers, benefitRows, benefitsT, ceBreakdown, ceLayout, ceSections, ceType, cfg, demobVehicles, demobVehiclesT, docStatus, grand, hlAmt, hlLabel, hlRows, incOn, info, kwhRate, margin, mats, matsT, misc, miscT, mobVehicles, mobVehiclesT, mp, mpTot, mpWageParts, notes, perJobLbl, perJobT, powerOn, ppe, ppeT, pwrFrac, qtyUom, rr, servicesSummary, showToast, showUnitP, sowItems, sowLabels, toolBasis, tools, toolsT, unitLbl, unitP }));
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
  AppBanners({ bulkOn, clearDraft, currentUser, deleteDraft, draftOwners, draftTidyBusy, draftTidyGroups, draftsOpen, draftsShown, drftBy, drftQ, hasDraft, history, isAdmin, isRequestor, loadDraft, loadSharedDrafts, resumeDraft, setBulkOn, setDraftsOpen, setDrftBy, setDrftQ, setShowDraftBanner, setUpdateInfo, sharedDrafts, showDraftBanner, showToast, tidyDrafts, toast, toastErr, undoToast, updateInfo }), Picker(), ApiKeyModal({ apiKeyInput, setApiKeyInput, setShowApiKey, showApiKey, showToast }), /*#__PURE__*/AppHeader({ TABS, TAB_GROUPS, _tabMemory, busyBtn, busyOp, ceType, currentUser, handleExport, handleNew, handleSave, isRequestor, loadSharedDrafts, mats, misc, mp, myTodo, onLogout, ppe, provInfo, setApiKeyInput, setCeType, setDraftsOpen, setMySigOpen, setShowApiKey, setTab, sharedDrafts, sowUnassignedCount, tab, tools }), /*#__PURE__*/React.createElement("div", {
    className: "shic-workspace"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 16,
      minWidth: 0
    }
  }, tab === 'admin' && isAdmin && /*#__PURE__*/React.createElement(AdminPanel, {
    currentUser: currentUser
  }), tab === 'sow' && /*#__PURE__*/SowTab({ clearAllSow, deleteSowTask, setSowItems, sowItems }),

/* ── SOW Breakdown: assign resources per scope task ── */
tab === 'sowbreak' && SowBreakdownTab({ RES_TABS, ceType, delRow, masterlist, mats, miscAdd, miscCats, miscDel, miscFlat, miscUpd, mp, ppe, rowCost, rowCostForTask, rowServesTask, rowShares, sbCollapsed, sbDlOn, sbSearch, sbSel, sbShow, setMisc, setMp, setPicker, setSbCollapsed, setSbDlOn, setSbSearch, setSbSel, setSbShow, setSowItems, setTab, showToast, sowItems, sowLabels, sowTaskGroup, sowUnassignedCount, taskCost, taskCostRollup, taskResCount, taskResCountRollup, tools, updRow }),
tab === 'scopelib' && ScopeLibraryEditor(),
tab === 'calculators' && /*#__PURE__*/React.createElement(CalcDrawer, {
  page: true, open: true, onClose: () => setTab('materials'), calc, setCalc, std: calcStdNow, hist: calcHist,
  isAdmin, onSaveStd: calcSaveStd, priceFor: calcPriceFor, onAdd: (l, k, u) => { calcAddLines(l, k, u); setTab('materials'); }
}),
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
            const why = await uiPrompt('Take ' + (l.name || l.user) + ' out of the routing for this CE?' + String.fromCharCode(10,10) + 'Why? It goes on the record.',
              {multiline: true, required: true, requiredMsg: 'A reason is required to skip a signatory.', ok: 'Skip this line'});
            if (why == null) return;
            if (await apvAdminLine('skip', l.id, why)) setApvAbsent(null);
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
  /*#__PURE__*/React.createElement(NamePicker, {value: assignPanel.to, users: reqUsers, listId: 'assign-users', autoFocus: true, onEnter: saveAssign, onChange: v => setAssignPanel(p => ({...p, to: v}))}),
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
    onClick:async ()=>{ if (!_dirty || await uiConfirm('Discard the status change you have not saved?')) _close(); }
  }, /*#__PURE__*/React.createElement("div", {
    style:{background:CARD,border:`1px solid ${BDR}`,borderRadius:10,padding:24,minWidth:440,maxWidth:560,maxHeight:'82vh',overflowY:'auto'},
    onClick:ev=>ev.stopPropagation()
  },
    /*#__PURE__*/React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
      /*#__PURE__*/React.createElement("b", {style:{fontSize:14}}, "⚑ Status"),
      /*#__PURE__*/React.createElement("button", {style:btn('def',true), onClick:async ()=>{ if (!_dirty || await uiConfirm('Discard the status change you have not saved?')) _close(); }}, "✕ Close")),
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

/* ── The five things a CE needs before it is estimated ── */
piGate && tab === "info" && !isRequestor && /*#__PURE__*/React.createElement(ProjectInfoGate, {
  missing: infoMissing, companies, companyId: info.companyId, client: info.client, ceType, projType: info.projType, description: info.description,
  ceTypes: Object.keys(CE_CFG).map(k => ({ k, label: ceTypeLabel(k) })),
  onCompany: pickCompany, onClient: v => setInfo(p => ({ ...p, client: v })), onType: setCeType, onDiscipline: v => setInfo(p => ({ ...p, projType: v })), onDescription: v => setInfo(p => ({ ...p, description: v })),
  onCancel: () => { setPiGate(false); setTab('mywork'); }, onContinue: continueGate
}),

/* ── Request review / update ── */
rceReview && /*#__PURE__*/React.createElement(RceReviewModal, {
  key: rceReview.e.id + rceReview.mode, mode: rceReview.mode, rce: (rceReview.e.info || {}).rce || {}, busy: reqBusy,
  title: (rceReview.mode === 'review' ? 'Review request ' : 'Update request ') + (rceReview.e.info?.requestNum || rceReview.e.ceNum),
  users: reqUsers, assignee: String((monData[rceReview.e.id] || {}).ceeName || '').replace(/^Unassigned$/, ''), onClose: () => setRceReview(null), onDone: saveReview,
  facts: (() => {
    const e = rceReview.e, i = e.info || {}, r = i.rce || {}, mo = monData[e.id] || {};
    const bl = v => (v == null || v === '') ? '—' : v;
    return [['RCE No.', i.requestNum || i.ceNum || e.ceNum], ['CE No.', i.acceptedCeNum || 'not yet — given when accepted'], ['Customer', i.client || mo.customer],
      ['Issuing company', (() => { const c = (companies || []).find(x => String(x.id) === String(i.companyId)); return c ? c.name + (c.cePrefix ? ' (' + c.cePrefix + ')' : '') : ''; })()], ['Project title', i.description || mo.jobTitle],
      ['Project type', i.projType || mo.designation], ['Inquiry No.', r.inquiryNo], ['Inquiry date', r.inquiryDate], ['Submission deadline', r.deadline || mo.deadline || reqDeadline('', r.inquiryDate, mo.dateRecv || i.date)],
      ['Completion date', r.completionDate], ['Date received', mo.dateRecv || i.date], ['Assigned sales', r.assignedSales], ['Work location', r.workLocation],
      ['Address', r.address], ['Inquiry type', r.inquiryType], ['Stage', r.stage], ['CE type', e.ceType],
      ['Requested by', mo.receivedBy || r.preparedBy || e.savedBy], ['Assigned estimator', mo.ceeName], ['Remarks', mo.remarks]
    ].map(p => [p[0], bl(p[1])]);
  })(),
  loadFiles: async () => { const sp = _monSpIdCache[rceReview.e.id]; return sp ? await spGetAttachments(spList('Monitoring'), sp) : []; }
}),

/* ── New Request Modal ── */
reqForm && (() => {
  const set = (k, v) => setReqForm(p => ({...p, [k]: v}));
  /* One item's answer, or its remark, without disturbing the other twelve. */
  const setItem = (n, patch) => setReqForm(p => ({...p, items: {...(p.items || {}), [n]: {...((p.items || {})[n] || {}), ...patch}}}));
  const L = (label, el) => /*#__PURE__*/React.createElement("label", {style:{display:'flex',flexDirection:'column',gap:3,fontSize:11,color:MT}}, label, el);
  const inp = (k, extra) => /*#__PURE__*/React.createElement("input", {style:(reqForm._errs && reqForm._errs[k] && !reqForm[k]) ? {...INP, border:'1px solid #ef4444'} : INP, value:reqForm[k] || '', onChange:e=>set(k, e.target.value), ...(extra || {})});
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
      "Logs the request in CE Monitoring, assigns it, and sends whatever came with it. A request is known by its RCE No.; it gets a CE number only when the Cost Estimation team accepts it, and the estimator then builds the estimate under that number."),

    sect("THE INQUIRY"),
    grid(
      L("RCE No. *", inp('rceNo', {placeholder:'From Sales', style:{...INP,...MONO}})),
      L("Inquiry number", inp('inquiryNo', {placeholder:'e.g. HSAB - RFQ 130000516', style:{...INP,...MONO}})),
      L("Inquiry date", inp('inquiryDate', {type:'date'})),
      L("Submission deadline", inp('deadline', {type:'date'})),
      L("Completion date", inp('completionDate', {type:'date'})),
      L("Date received", inp('dateRecv', {type:'date'})),
      L("Assigned sales", inp('assignedSales', {placeholder:'Who took the inquiry'}))
    ),

    sect("THE CUSTOMER AND THE WORK"),
    grid(
      L("Customer *", inp('client', {placeholder:'e.g. SLTEC'})),
      L("Issuing company *", /*#__PURE__*/React.createElement("select", {style:(reqForm._errs && reqForm._errs.companyId && (reqForm.companyId == null || reqForm.companyId === '')) ? {...INP, border:'1px solid #ef4444'} : INP, value: reqForm.companyId == null ? '' : reqForm.companyId, onChange:e=>set('companyId', e.target.value)},
        /*#__PURE__*/React.createElement("option", {value:''}, '\u2014 Select issuing company \u2014'),
        (companies || []).map(c => /*#__PURE__*/React.createElement("option", {key:c.id, value:c.id}, c.name + (c.sub ? ' \u2014 ' + c.sub : ''))))),
      L("Work location", inp('workLocation', {placeholder:'Where the work happens'}))
    ),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Address", inp('address', {placeholder:'Site or office address as the inquiry gives it'}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, L("Project title", /*#__PURE__*/React.createElement("textarea", {style:{...INP,height:46,resize:'vertical'}, value:reqForm.description, placeholder:'What the client is asking for', onChange:e=>set('description', e.target.value)}))),
    /*#__PURE__*/React.createElement("div", {style:{marginTop:10}}, grid(
      L("Assigned to * (one or more)", /*#__PURE__*/React.createElement("div", {style:(reqForm._errs && reqForm._errs.assignee && !String(reqForm.assignee || '').trim()) ? {border:'1px solid #ef4444', borderRadius:6} : {}},
        /*#__PURE__*/React.createElement(NamePicker, {value: reqForm.assignee || '', users: reqUsers, listId: 'req-users', placeholder: 'Pick the estimator(s) this is for', onChange: v => set('assignee', v)}))),
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

    /* Prefill only: a requestor who already has this information can enter it, and the Cost Estimation team reviews and decides item 14 afterwards. */
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
      /* Reviewing a request does not need it accepted first: Review is how it gets accepted. */
      !isRequestor && !viewCE.draftKey && (() => {
        const _e = sortedHistory.find(x => x.id === viewCE.id), _i = (_e && _e.info) || {};
        return _e && _i.request && !_i.acceptedCeNum && typeof _e.id === 'number' && /*#__PURE__*/React.createElement("button", {
          style: btn('ok', true), title: 'Review the checklist and decide: proceed, secure the missing data first, or decline',
          onClick: () => { setViewCE(null); openReview(_e, 'review'); }
        }, "Review");
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
      try{document.title=ceFileNameFor(viewCE.id, viewCE.ceNum);}catch(_e){logSwallowed('App:L11171',_e);}
      /* Wait for the frame to finish laying itself into sheets, the same way
         the print window does: printing mid-layout prints it unpaginated. */
      const _w=document.getElementById('shic-view-ce').contentWindow;
      (function _go(n){
        let paged=false;
        try{paged=!!(_w.document.body&&_w.document.body.getAttribute('data-paged'));}catch(_e){paged=true;}
        if(paged||n>40){_w.print();setTimeout(()=>{try{document.title=_was;}catch(_e){logSwallowed('App:_go',_e);}},1000);return;}
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
calcOpen && /*#__PURE__*/React.createElement(CalcDrawer, {
  open: true, onClose: () => setCalcOpen(false), calc, setCalc, std: calcStdNow, hist: calcHist,
  isAdmin, onSaveStd: calcSaveStd, priceFor: calcPriceFor, onAdd: calcAddLines
}),
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
      mySig && /*#__PURE__*/React.createElement("button", {style:btn('danger',true),onClick:async ()=>{if(await uiConfirm('Remove your saved signature?')){saveMySig('');setMySigOpen(false);}}}, "Remove saved"),
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
tab === 'mywork' && MyWorkTab({ currentUser, getStatusColor, handleLoad, isRequestor, meNames, monOf, monRows, mwOpen, mwQ, mwReqQ, myTodo, openRequest, openReview, reqDeadline, resumeDraft, setMwOpen, setMwQ, setMwReqQ, setRceReview, setTab, setViewCE, sharedDrafts }),

tab === 'dashboard' && DashboardTab({ dashAll, dashQ, dashReqQ, getStatusColor, history, monOf, monRows, reqDeadline, setDashAll, setDashQ, setDashReqQ }), tab === 'info' && /*#__PURE__*/InfoTab({ ScopeBuilder, addMode, aiLoad, ceType, companies, docBusy, docFile, docFilesOf, docPreview, docStatus, extractDocInfo, fileRef, handleAI, handleDocUpload, info, monData, openCeId, openMonStatus, pickCompany, provInfo, qtyUom, rceNo, removeDoc, scope, setAddMode, setDocFile, setDocPreview, setDocStatus, setInfo, setScope, updateMon }), tab === 'manpower' && /*#__PURE__*/ManpowerTab({ _mobTabs, _weight, ben, benefitRows, benefitsT, cfg, collapsedShifts, copyMenu, delRow, demobSubT, demobVehicles, demobVehiclesT, history, incOn, info, masterlist, mobCopy, mobSubT, mobVehicles, mobVehiclesT, mp, mpSub, mpTot, mpWage, mpWageParts, rowCost, rowShares, rr, setCollapsedShifts, setCopyMenu, setDemobVehicles, setMobCopy, setMobVehicles, setMp, setPicker, setRates, showToast, sowItems, sowLabels, syncCrewRows, syncMealRates, syncMealRows, toggleShift, updRow }), tab === 'tools' && /*#__PURE__*/React.createElement(ResTabM, {
    rows: tools,
    set: setTools,
    total: toolsT,
    label: "Tools & Equipment (BOTE)",
    mlType: "tools",
    addToML: resStable.addTools,
    showDays: true,
    /* Lives on info, so it rides to SharePoint inside shicInfo with no column
       of its own and comes back with the CE. */
    defaultTier: N(info.toolTier) || 2,
    setDefaultTier: resStable.setDefaultTier,
    showPower: powerOn,
    kwhRate,
    pwrFrac: resStable.pwrFrac,
    /* What pwrFrac depends on, so the memoised tab redraws when it changes. */
    _pfk: cfg.power, _wm: _workMap,
    readFile: resStable.readFile,
    /* A rate equal to the default is removed rather than stored, so a CE that
       was never touched is not frozen against a future change to it -- the
       same rule the shift multipliers follow. */
    setKwhRate: resStable.setKwhRate,
    /* The CE's own duration, offered as the days to charge the equipment for.
       With 900 rows on a CE, typing it into each one is not a thing anyone
       will do -- so it is one click, and it is the number already on the
       Project Info tab rather than a second one to keep in step. */
    ceDays: N(info.days) || 0,
    masterlist, showToast: resStable.showToast, setPicker
  }), tab === 'materials' && /*#__PURE__*/React.createElement(ResTabM, {
    rows: mats,
    set: setMats,
    total: matsT,
    label: "Materials & Consumables (BOCM)",
    onCalc: resStable.openCalc,
    mlType: "materials",
    addToML: resStable.addMats,
    /* The same reader the Tools tab has. A BOM or a PPE issue list
       arrives as the same kind of list -- description, quantity,
       unit -- and was being typed in by hand only because the tab
       was never handed the reader. */
    readFile: resStable.readFile,
    masterlist, showToast: resStable.showToast, setPicker
  }), tab === 'ppe' && /*#__PURE__*/React.createElement(ResTabM, {
    rows: ppe,
    set: setPpe,
    total: ppeT,
    label: "Personal Protective Equipment (PPE)",
    mlType: "ppe",
    addToML: resStable.addPpe,
    /* The same reader the Tools tab has. A BOM or a PPE issue list
       arrives as the same kind of list -- description, quantity,
       unit -- and was being typed in by hand only because the tab
       was never handed the reader. */
    readFile: resStable.readFile,
    masterlist, showToast: resStable.showToast, setPicker
  }), tab === 'misc' && /*#__PURE__*/MiscTab({ ceType, masterlist, misc, miscT, mp, setMisc, setPicker, showToast, syncMealRates, syncMealRows }), tab === 'summary' && /*#__PURE__*/SummaryTab({ _defaultsUntouched, _mobTabs, addlCosts, aiSuggest, applyCeDefaults, approvers, apvBar, apvLocked, apvState, apvUsers, busyBtn, busyOp, ceDefaults, ceLayoutKey, ceType, cfg, collectZeroCost, demobVehicles, docFile, grand, handleExport, handleExportXLSX, handleGenerateCEWithCheck, handlePrintPreview, handleSave, handleSaveRevision, history, hlAmt, hlKeys, hlLabel, hlMissing, hlPick, hlPickQ, hlSources, info, isRequestor, loadSharedDrafts, margin, mats, misc, mkNote, mobVehicles, mp, notes, perJob, perJobNames, perJobT, ppe, qtyMulOn, qtyN, saveDraft, servicesSummary, setAddlCosts, setAiSuggest, setApprovers, setCeType, setDraftsOpen, setHlPick, setHlPickQ, setInfo, setMargin, setNotes, setSigModal, setTab, setVerifyNotes, sharedDrafts, showToast, showUnitP, sowItems, sowLabels, sowUnassignedCount, summaryDot, summaryRows, syncRatesFromML, tools, unitP, verifyNotes, visSigs })), /* Live Totals describe the CE being built, so they show on its estimating
     screens only -- on My Work, Monitoring, the Dashboard and the libraries they
     read ₱0.00 or another CE's figures and take a quarter of the width. */
  LiveTotalsSidebar({ TAB_GROUPS, cfg, demobSubT, grand, history, masterlist, matsT, miscT, mobSubT, mpTot, ppeT, provInfo, railSlim, rr, setApiKeyInput, setShowApiKey, setTab, tab, toggleRail, toolsT, unitP })));
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
