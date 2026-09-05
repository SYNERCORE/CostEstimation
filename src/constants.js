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
const UOM_OPTIONS = UOM_GROUPS.reduce((all, g) => all.concat(g[1]), []);

/* Renders the grouped <option>s for a select.

   `current` is the value already on the row. Saved CEs and xlsx imports carry
   whatever UOM the source used ("SET/S", "pc", "LM"), and a select with no
   matching option displays the first one instead — misrepresenting the saved
   row, and rewriting it for real the moment anyone touches the control. An
   unrecognised value is therefore kept and offered at the top rather than
   quietly dropped. */
function uomOptionEls(current) {
  const cur = String(current == null ? '' : current).trim();
  const known = cur && UOM_OPTIONS.some(u => u.toLowerCase() === cur.toLowerCase());
  const groups = UOM_GROUPS.map(g => React.createElement('optgroup', { key: g[0], label: g[0] },
    g[1].map(u => React.createElement('option', { key: u, value: u }, u))));
  if (cur && !known) {
    groups.unshift(React.createElement('optgroup', { key: '_cur', label: 'From this record' },
      React.createElement('option', { key: cur, value: cur }, cur)));
  }
  return groups;
}