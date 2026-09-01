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
  /* Through toolRowCost, so a tiered CE recomputes to what the editor shows.
     A row naming no tier is Tier 2, which is exactly the old expression. */
  const toolsT = arr(ce.tools).reduce((s, r) => s + toolRowCost(r), 0);
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

/* -- Tool & equipment tier pricing ------------------------------------------
   Three ways to charge a tool, all derived from one annual figure, so they can
   never disagree with each other:

     annualCost = UnitPrice / ServiceLife + MaintenancePerYear

     Tier 1  flat per project   annualCost / ProjectsPerYear   duration ignored
     Tier 2  daily x days       annualCost / 365               <- the default
     Tier 3  hourly x hours     annualCost / 8760

   Tier 2 is what the app has always done: a tool row costs qty x days x cost,
   so the masterlist `cost` column has always held the Tier 2 daily rate. That
   is why nothing needs migrating -- every masterlist entry and every saved CE
   is already priced on Tier 2, and the other two tiers are additions.

   365 and 8760 are CALENDAR time, deliberately: a tool on site is unavailable
   to any other project overnight, so it is charged for the hours it is held,
   not the hours it is running.

   Returns null when the source figures are not there to derive from -- an
   entry carrying only a hand-typed cost is not an error, it is the ordinary
   case for a rented tool with no depreciation basis. */
const TIER_HOURS_PER_YEAR = 365 * 24;
function toolAnnualCost(src) {
  if (!src) return null;
  const price = N(src.unitPrice), life = N(src.serviceLife), maint = N(src.maintPerYear);
  if (price <= 0 && maint <= 0) return null;
  /* A life of zero would divide by zero and hand back Infinity, which reads on
     screen as a real price. No life stated means nothing is being written off. */
  const depreciation = (price > 0 && life > 0) ? price / life : 0;
  if (depreciation <= 0 && maint <= 0) return null;
  return depreciation + maint;
}
/* Every tier for one masterlist entry, for display beside the inputs that
   produced them. */
function toolTierRates(src) {
  const annual = toolAnnualCost(src);
  if (annual === null) return null;
  const perYear = N(src.projectsPerYear);
  return {
    annual,
    /* Tier 1 needs to know how many projects share the year. Without it there
       is no per-project share to take, so it is absent rather than guessed. */
    tier1: perYear > 0 ? annual / perYear : null,
    tier2: annual / 365,
    tier3: annual / TIER_HOURS_PER_YEAR
  };
}
/* What one CE row costs. `cost` is the Tier 2 daily rate, the same field the
   app has always used, so a row that names no tier costs exactly what it did
   before. A tier the entry cannot derive falls back to that stored rate rather
   than to zero: charging nothing for a tool is never the safer wrong answer. */
function toolRowCost(row, src) {
  if (!row) return 0;
  const qty = N(row.qty), daily = N(row.cost);
  const tier = N(row.tier) || 2;
  const r = toolTierRates(src || row);
  if (tier === 1) {
    if (r && r.tier1 !== null) return qty * r.tier1;
    return qty * daily * ceResDays(row);
  }
  if (tier === 3) {
    /* Hours, not days. A four-hour job is the reason this tier exists, so an
       hours field left empty must not silently become a full day. */
    const hours = N(row.hours);
    if (r) return qty * r.tier3 * hours;
    return qty * (daily / 24) * hours;
  }
  return qty * daily * ceResDays(row);
}
