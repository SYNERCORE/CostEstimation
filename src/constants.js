const {
  useState,
  useMemo,
  useEffect,
  useRef
} = React;
const AppContext = React.createContext({});
/* THE COLOUR LAYER.
   =================
   These were fixed hex values, so the app could only ever be dark. They point
   at the CSS variables in index.html now, which are redefined under
   [data-theme="light"] -- so one attribute on <html> re-themes every surface
   that goes through these constants, which is most of the application.

   Nothing here changes what any component asks for. A card still says CS and
   a warning still says ACC; only the answer moves with the theme. */
const BG = "var(--bg-canvas)",
  CARD = "var(--bg-surface)",
  SURF = "var(--bg-surface-elevated)",
  BDR = "var(--border-subtle)",
  TX = "var(--text-primary)",
  MT = "var(--text-secondary)",
  ACC = "var(--brand-accent)",
  ERR = "var(--status-danger)",
  INFO = "var(--accent-cyan)",
  OK = "var(--status-success)";
/* Text that sits ON the accent -- black on dark-mode amber, white on the
   darker light-mode amber. A single fixed colour fails contrast in one theme
   or the other. */
const ON_ACC = "var(--on-accent)";

/* A translucent shade of any of the above.
   ========================================
   The codebase expressed transparency by concatenating a hex alpha pair onto
   a colour: ACC + '22'. That works on #F0A429 and produces nonsense the
   moment the constant becomes var(--brand-accent) -- "var(--brand-accent)22"
   is not a colour, and the browser drops the declaration silently, so a tinted
   panel simply loses its background with nothing in the console.

   color-mix takes the variable and stays theme-aware. The argument is kept as
   the same two hex digits the call sites already used, so each one reads as
   the value it replaced rather than a percentage nobody can check against the
   original. */
const alpha = (color, hex) => {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex), 16);
  const pct = Math.max(0, Math.min(100, Math.round((n / 255) * 1000) / 10));
  return 'color-mix(in srgb, ' + color + ' ' + pct + '%, transparent)';
};
const INP = {
  background: "var(--bg-input)",
  border: `1px solid ${BDR}`,
  color: TX,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  outline: "none",
  width: "100%",
  fontFamily: "'Plus Jakarta Sans','Outfit',system-ui,sans-serif"
};
const btn = (v = "def", sm = false) => ({
  cursor: "pointer",
  fontFamily: "'Plus Jakarta Sans','Outfit',system-ui,sans-serif",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
  borderRadius: 6,
  padding: sm ? "3px 9px" : "7px 14px",
  fontSize: sm ? 11 : 13,
  background: v === "acc" ? ACC : v === "ok" ? alpha(OK, "22") : v === "info" ? alpha(INFO, "22") : v === "danger" ? alpha(ERR, "22") : "transparent",
  color: v === "acc" ? ON_ACC : v === "ok" ? OK : v === "info" ? INFO : v === "danger" ? ERR : TX,
  border: v === "acc" ? `1px solid ${ACC}` : v === "ok" ? `1px solid ${alpha(OK, "55")}` : v === "info" ? `1px solid ${alpha(INFO, "55")}` : v === "danger" ? `1px solid ${alpha(ERR, "55")}` : `1px solid ${BDR}`
});

/* A SECTION HEADER.
   =================
   Written out inline at fourteen sites, each with its own font size and
   margin, so they had drifted from one another -- 9px in one panel, 18px in
   another, all meant to read as the same thing.

   The dot is the mockup's: it carries the section's colour, which lets the
   label itself stay quiet. Tracking is 0.05em per DESIGN.md section 3.

   `note` is the grey aside the mockups put after several of these -- "Add each
   charge as a separate line item". It stays out of the coloured label so the
   heading is still scannable on its own. */
const secHead = (label, color, note, opts) => {
  const o = opts || {};
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap',
      marginBottom: o.mb === undefined ? 12 : o.mb
    }
  },
    React.createElement('span', {
      style: {
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        alignSelf: 'center', display: 'inline-block',
        background: color || ACC
      }
    }),
    React.createElement('span', {
      style: {
        fontWeight: 600, fontSize: o.size === undefined ? 12 : o.size,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        color: color || ACC
      }
    }, label),
    note ? React.createElement('span', {
      style: {fontSize: 11, color: MT, fontWeight: 400, textTransform: 'none', letterSpacing: 0}
    }, note) : null);
};

const CS = {
  background: "var(--bg-surface-card)",
  border: `1px solid ${BDR}`,
  borderRadius: 10,
  boxShadow: "var(--card-shadow)",
  padding: 16,
  marginBottom: 12
};
const THS = {
  padding: "7px 9px",
  borderBottom: `1px solid ${BDR}`,
  color: MT,
  fontWeight: 700,
  fontSize: 10,
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  background: SURF
};
const TDS = {
  padding: "6px 8px",
  borderBottom: `1px solid ${BDR}`,
  verticalAlign: "middle"
};
const MONO = {
  fontFamily: "'JetBrains Mono',monospace"
};
const LBL = {
  display: "block",
  color: MT,
  fontSize: 10,
  fontWeight: 700,
  marginBottom: 3,
  textTransform: "uppercase",
  letterSpacing: "0.06em"
};

/* ── Units of measure ────────────────────────────────────────────────────────
   One list, used by every UOM control. There were five near-identical copies of
   a twelve-item list across App.js and ResTab.js, in three different orders, so
   adding a unit meant finding all five and the Materials tab could offer
   something the Masterlist could not.

   Grouped because a flat list this long is hard to scan; the groups render as
   <optgroup> in a select and are flattened for the free-text datalist.        */
const UOM_GROUPS = [
  ['Count',     ['Pcs', 'Unit', 'Set', 'Lot', 'Pair', 'Dozen', 'Assy', 'Kit', 'Bundle',
                 'Sheet', 'Plate', 'Bar', 'Rod', 'Length', 'Joint', 'Roll', 'Coil', 'Spool', 'Ream']],
  ['Container', ['Box', 'Carton', 'Case', 'Pack', 'Bag', 'Sack', 'Can', 'Gallon', 'Pail',
                 'Drum', 'Tank', 'Bottle', 'Jar', 'Tube', 'Cartridge', 'Cylinder', 'Sachet']],
  ['Length',    ['mm', 'cm', 'M', 'Km', 'Inch', 'Ft', 'Yard', 'L.M.']],
  ['Area',      ['sq.mm', 'sq.m', 'sq.ft']],
  ['Volume',    ['mL', 'L', 'cu.m', 'cu.ft']],
  ['Weight',    ['g', 'Kg', 'Ton', 'lb']],
  ['Time',      ['Hour', 'Shift', 'Day', 'Week', 'Month', 'Man-day', 'Trip']]
];
/* Every unit is written one way, so "PIECE", "piece" and "Piece" do not read
   as three units. A unit on the list above keeps the list's spelling -- the
   standard abbreviations mm, mL, sq.m, Kg, L.M. are written the way they are
   meant to be. Anything else gets its first letter capital and the rest
   small. Applied to every UOM control and to the CE's rows as they arrive
   (see the effect in App.js). */
const _UOM_CANON = {};
UOM_GROUPS.forEach(g => g[1].forEach(u => { _UOM_CANON[u.toLowerCase()] = u; }));
function uomCase(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  return _UOM_CANON[s.toLowerCase()] || s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
const UOM_OPTIONS = UOM_GROUPS.reduce((all, g) => all.concat(g[1]), []);

/* Renders the grouped <option>s for a select.

   `current` is the value already on the row. Saved CEs and xlsx imports carry
   whatever UOM the source used ("SET/S", "pc", "LM"), and a select with no
   matching option displays the first one instead — misrepresenting the saved
   row, and rewriting it for real the moment anyone touches the control. An
   unrecognised value is therefore kept and offered at the top rather than
   quietly dropped. */
function uomOptionEls(current) {
  const cur = uomCase(current);
  const known = cur && UOM_OPTIONS.includes(cur);
  const groups = UOM_GROUPS.map(g => React.createElement('optgroup', { key: g[0], label: g[0] },
    g[1].map(u => React.createElement('option', { key: u, value: u }, u))));
  if (cur && !known) {
    groups.unshift(React.createElement('optgroup', { key: '_cur', label: 'From this record' },
      React.createElement('option', { key: cur, value: cur }, cur)));
  }
  return groups;
}
/* ── Test mode ──────────────────────────────────────────────────────────
   A sandbox for trying the app out without touching anything real. It is
   local only: SharePoint is switched off, so nothing a test CE holds can
   reach the site or be seen by anyone else.

   Keeping test data apart could have meant renaming the localStorage prefix
   at every one of the ~50 places that spell out 'shic:' -- nine files, and
   one missed line would write test data into the live store. So instead the
   whole localStorage object is swapped for one that lives under its own
   prefix. Every existing line works unchanged, and in test mode the real
   keys are not merely ignored: they cannot be read, written, counted or
   enumerated at all, so a wipe or a quota sweep can only ever reach test
   data.

   The flag itself sits outside both stores, because it has to be read
   before either one is chosen. */
const TEST_MODE_KEY = 'shic.testmode';
const TEST_NS = 'shictest|';
/* The flag is read from the REAL store, never through the swap below. Read
   through the sandbox it would be looked up inside the sandbox, come back
   empty, and every caller -- the banner, and the SharePoint refusal in
   getSiteURL -- would be told the app was live while it was not. */
function _shicLS(){ return window._shicRealLS || window.localStorage; }
function isTestMode(){ try { return _shicLS().getItem(TEST_MODE_KEY) === '1'; } catch (e) { return false; } }
function setTestMode(on){ try { const s = _shicLS(); if (on) s.setItem(TEST_MODE_KEY, '1'); else s.removeItem(TEST_MODE_KEY); return true; } catch (e) { return false; } }
/* Counts what the sandbox is holding, for the banner and the wipe. Reads the
   REAL store by name, so it keeps working after the swap below. */
function testDataKeys(real){
  const s = real || _shicLS(); const out = [];
  try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.indexOf(TEST_NS) === 0) out.push(k); } } catch (e) {}
  return out;
}
function wipeTestData(){
  const s = _shicLS(); const ks = testDataKeys(s);
  ks.forEach(k => { try { s.removeItem(k); } catch (e) {} });
  return ks.length;
}
(function installTestStore(){
  try {
    const real = window.localStorage;
    window._shicRealLS = real;
    if (real.getItem(TEST_MODE_KEY) !== '1') return;
    const P = TEST_NS;
    const mine = () => { const o = []; for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k && k.indexOf(P) === 0) o.push(k.slice(P.length)); } return o; };
    const shim = {
      getItem: k => real.getItem(P + k),
      setItem: (k, v) => real.setItem(P + k, v),
      removeItem: k => real.removeItem(P + k),
      /* clear() empties the SANDBOX, never the live store -- a "reset
         everything" button inside test mode must not take the real data
         with it. */
      clear: () => { mine().forEach(k => real.removeItem(P + k)); },
      key: i => { const o = mine(); return i >= 0 && i < o.length ? o[i] : null; },
      get length(){ return mine().length; }
    };
    Object.defineProperty(window, 'localStorage', { value: shim, configurable: true, writable: false });
  } catch (e) { /* a browser that will not let the property be redefined keeps
                   the real store -- and getSiteURL() still refuses SharePoint,
                   so the worst case is test data sitting beside live data
                   rather than test data reaching the site. */ }
})();
