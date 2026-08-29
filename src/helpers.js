const N = v => parseFloat(v) || 0;
const ph = n => (n || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const uid = () => { try { return crypto.randomUUID(); } catch { return Date.now().toString(36) + Math.random().toString(36).slice(2); } };
/* Escape a value for interpolation into generated HTML (the printed CE is built
   as an HTML string and written into a new window). Without this, a description
   containing markup executes in whoever opens the CE, and a plain "&" or "<"
   silently corrupts the printout. Covers text and attribute contexts. */
const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
function nextCeNum(history, cePrefix) {
  const yr = new Date().getFullYear();
  const pfx = ((cePrefix || 'SHIC') + '-CE-' + yr + '-').toUpperCase();
  let max = 0;
  (history || []).forEach(h => {
    const n = ((h.info && h.info.ceNum) || '').toUpperCase().replace(/-R\d+$/i, '');
    if (n.startsWith(pfx)) {
      const num = parseInt(n.slice(pfx.length)) || 0;
      if (num > max) max = num;
    }
  });
  return pfx + String(max + 1).padStart(4, '0');
}
function nextCeNumForCompany(history, company) {
  return nextCeNum(history, (company && company.cePrefix) ? company.cePrefix : 'SHIC');
}
const mkMP = () => ({
  id: uid(),
  role: "",
  pax: 1,
  days: 1,
  otHours: 0,
  shift: "regular_day",
  rate: 0,
  perDiem: 0
});
const mkVeh = () => ({
  id: uid(),
  desc: "",
  qty: 1,
  days: 1,
  rate: 0,
  uom: "Day"
});
const mkRes = () => ({
  id: uid(),
  desc: "",
  qty: 1,
  uom: "Lot",
  cost: 0
});
const BLANK_INFO = {
  ceNum: "SHIC-CE-" + new Date().getFullYear() + "-0001",
  date: new Date().toISOString().slice(0, 10),
  client: "",
  location: "",
  attention: "SALES DEPARTMENT",
  endUser: "C/O SALES",
  projType: "Electrical",
  description: "",
  dept: "",
  status: "DRAFT",
  material: "",
  qty: "1",
  days: "",
  companyId: null
};
const BLANK_MISC = {
  accommodation: [],
  transportation: [],
  requirements: [],
  adminCost: [],
  thirdParty: [],
  insurance: [],
  allowance: []
};
const mkMiscRow = () => ({
  id: uid(),
  desc: '',
  qty: 1,
  uom: 'Lot',
  cost: 0
});
/* ── Recompute the grand total of a SAVED CE object ──────────────────────────
   Mirrors the live editor's rules exactly:
     - a manpower row with no role costs nothing (calcBen's SIL adds pax*30, so
       the blank starter row used to add P30 to every CE)
     - Tools & Equipment is qty x days x cost, days optional and defaulting to 1
     - Materials / PPE / Miscellaneous are qty x cost
     - Mobilization / Demobilization vehicles are qty x days x rate, and only
       count for CE types that use them
   Reads SHIFTS and CE_CFG from config.js at call time (config.js loads after
   this file, which is fine because nothing here runs at load).
   tools/test-recompute.js asserts this stays in step with the editor. */
function ceResDays(r) {
  return (r.days === undefined || r.days === null || r.days === '') ? 1 : (parseFloat(r.days) || 0);
}
function ceMpRowCost(r) {
  if (!r || !r.role) return 0;
  const mult = (typeof SHIFTS !== 'undefined' && SHIFTS[r.shift] && SHIFTS[r.shift].mult) || 1;
  /* Benefits use the basic rate, the wage uses the shift-adjusted one.
     Kept in step with calcBen in src/App.js by tools/test-recompute.js. */
  const pax = N(r.pax), days = N(r.days), rate = N(r.rate);
  const reg = pax * days * N(r.rate) * mult;
  const ot = pax * days * (N(r.otHours || 0) / 8) * N(r.rate) * 1.25 * mult;
  const thirteenth = rate / 12 * days * pax;
  const sss = rate * 0.25 * 0.75 * days * pax / 26;
  const hdmf = rate * 0.16 * days * pax / 26 * 2;
  const sil = rate * days * pax * 5 / 12 / 26 + pax * 30;
  const perdiem = N(r.perDiem || 0) * days * pax;
  return reg + ot + thirteenth + sss + hdmf + sil + perdiem;
}
function computeCEGrand(ce) {
  if (!ce) return 0;
  const cfg = (typeof CE_CFG !== 'undefined' && CE_CFG[ce.ceType]) || {};
  const arr = v => Array.isArray(v) ? v : [];
  const mpT = arr(ce.mp).reduce((s, r) => s + ceMpRowCost(r), 0);
  const toolsT = arr(ce.tools).reduce((s, r) => s + N(r.qty) * ceResDays(r) * N(r.cost), 0);
  const matsT = arr(ce.mats).reduce((s, r) => s + N(r.qty) * N(r.cost), 0);
  const ppeT = arr(ce.ppe).reduce((s, r) => s + N(r.qty) * N(r.cost), 0);
  const miscT = Object.keys(ce.misc || {}).reduce((s, k) => {
    if (k.charAt(0) === '_') return s; /* _addlCosts / _margin are not costs */
    return s + arr((ce.misc || {})[k]).reduce((t, r) => t + N(r.qty) * N(r.cost), 0);
  }, 0);
  const veh = rows => arr(rows).reduce((s, r) => s + N(r.qty) * N(r.days) * N(r.rate), 0);
  const mobT = cfg.mobDemob ? veh(ce.mobVehicles) + veh(ce.demobVehicles) : 0;
  return mobT + mpT + toolsT + matsT + ppeT + miscT;
}
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s + 'sy3_salt_2026'));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
const _hex = buf => Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2,'0')).join('');
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:200000}, key, 256);
  return 'pbkdf2:' + _hex(salt.buffer) + ':' + _hex(bits);
}
async function verifyPassword(pw, stored) {
  if (stored && stored.startsWith('pbkdf2:')) {
    const parts = stored.split(':');
    const salt = new Uint8Array(parts[1].match(/.{2}/g).map(h => parseInt(h,16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:200000}, key, 256);
    return _hex(bits) === parts[2];
  }
  // Legacy SHA-256 fallback
  return await sha256(pw) === stored;
}
