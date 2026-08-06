const {
  useState,
  useMemo,
  useEffect,
  useRef
} = React;
const AppContext = React.createContext({});
const BG = "#0D1117",
  CARD = "#161B22",
  SURF = "#1C2128",
  BDR = "#21262D",
  TX = "#E6EDF3",
  MT = "#7D8590",
  ACC = "#F0A429",
  ERR = "#F85149",
  INFO = "#58A6FF",
  OK = "#3FB950";
const INP = {
  background: SURF,
  border: `1px solid ${BDR}`,
  color: TX,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  outline: "none",
  width: "100%",
  fontFamily: "'Outfit',sans-serif"
};
const btn = (v = "def", sm = false) => ({
  cursor: "pointer",
  fontFamily: "'Outfit',sans-serif",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
  borderRadius: 6,
  padding: sm ? "3px 9px" : "7px 14px",
  fontSize: sm ? 11 : 13,
  background: v === "acc" ? ACC : v === "ok" ? OK + "22" : v === "info" ? INFO + "22" : v === "danger" ? ERR + "22" : "transparent",
  color: v === "acc" ? "#000" : v === "ok" ? OK : v === "info" ? INFO : v === "danger" ? ERR : TX,
  border: v === "acc" ? `1px solid ${ACC}` : v === "ok" ? `1px solid ${OK}55` : v === "info" ? `1px solid ${INFO}55` : v === "danger" ? `1px solid ${ERR}55` : `1px solid ${BDR}`
});
const CS = {
  background: CARD,
  border: `1px solid ${BDR}`,
  borderRadius: 8,
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