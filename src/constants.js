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