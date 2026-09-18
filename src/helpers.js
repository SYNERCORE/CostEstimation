const N = v => parseFloat(v) || 0;
const ph = n => (n || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
/* ── Scope Library numbers ──────────────────────────────────────────────
   The seeded services have numeric ids (1..69), and that id is what SY3-66
   shows. A service added in the app gets a uid instead -- the id SharePoint
   matches its row on, which must never change -- so it showed as SY3-NEW in
   the library and as SY3-55929d9a-... in the builder. It now carries a
   separate `code`: the next number after the highest in use. */
function svcNum(s) {
  if (!s) return 0;
  if (/^\d+$/.test(String(s.id))) return Number(s.id);
  return Number(s.code) > 0 ? Number(s.code) : 0;
}
function svcCode(s) {
  const n = svcNum(s);
  return 'SY3-' + (n ? String(n).padStart(2, '0') : 'NEW');
}
/* Numbers every service that has none, and renumbers one whose code another
   service already uses (two people adding a service at the same moment).
   Numeric ids are never touched. Returns the list, and the ids it changed. */
function assignSvcCodes(lib) {
  const list = Array.isArray(lib) ? lib : [];
  const used = new Set();
  list.forEach(s => { if (/^\d+$/.test(String(s.id))) used.add(Number(s.id)); });
  const changed = [];
  const out = list.map(s => ({...s}));
  const need = [];
  /* Oldest first -- new services go on at the top of the list -- so the
     service added earlier keeps the lower number. */
  for (let i = out.length - 1; i >= 0; i--) {
    const s = out[i];
    if (/^\d+$/.test(String(s.id))) continue;
    const c = Number(s.code);
    if (c > 0 && !used.has(c)) used.add(c); else need.push(s);
  }
  let next = used.size ? Math.max(...used) : 0;
  need.forEach(s => { s.code = ++next; used.add(next); changed.push(s.id); });
  return {lib: out, changed};
}
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
/* `history` is what this user can see, which for a non-admin is only their own
   CEs. Allocating from that alone hands the same number to two estimators on
   the same prefix, and neither finds out until one of them has finished the
   estimate and the save is refused. `known` is every CE number in use, from
   dbGetCeNumbers, and it is what makes the answer right. */
/* The sequence part of a CE number, prefix and revision stripped:
   "SY3-CE-2026-1131-R1" -> {prefix:"SY3", seq:"2026-1131"}. SHIC and SY3 share
   ONE sequence, so SHIC-CE-2026-1131 and SY3-CE-2026-1131 are the same number. */
function ceSeqOf(ceNum) {
  const m = String(ceNum || '').trim().toUpperCase().replace(/-R\d+$/i, '').match(/^([A-Z0-9]+)-CE-(\d{4})-(\d+)$/);
  return m ? {prefix: m[1], seq: m[2] + '-' + String(parseInt(m[3], 10)).padStart(4, '0')} : null;
}
function nextCeNum(history, cePrefix, known) {
  const yr = new Date().getFullYear();
  const pfx = ((cePrefix || 'SHIC') + '-CE-' + yr + '-').toUpperCase();
  let max = 0;
  /* Counted across every prefix -- one sequence for all companies. A revision
     shares its parent's number, so -R1 never reserves it twice. */
  const consider = n => {
    const s = ceSeqOf(n);
    if (!s || s.seq.slice(0, 4) !== String(yr)) return;
    const num = parseInt(s.seq.slice(5), 10) || 0;
    if (num > max) max = num;
  };
  (history || []).forEach(h => consider((h.info && h.info.ceNum) || h.ceNum));
  (known || []).forEach(consider);
  return pfx + String(max + 1).padStart(4, '0');
}
function nextCeNumForCompany(history, company, known) {
  return nextCeNum(history, (company && company.cePrefix) ? company.cePrefix : 'SHIC', known);
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

/* THE MULTIPLIERS A CE WAS PRICED AT.
   ===================================
   SHIFTS and the 1.25 OT factor were constants, so the day the law or the
   company changes one, every CE ever written silently reprices -- including
   the ones already sent to a client. The rule this project settled on for
   rates applies here too: a CE keeps what it was quoted at.

   So they are data the CE carries, and SHIFTS remains the default for any CE
   that does not carry them. Every existing CE has no `rates`, resolves to the
   statutory figures, and costs exactly what it always did.

   A value is only honoured if it is a real positive number. A blank field, a
   deleted one, or a zero falls back to the default rather than pricing a
   night shift at nothing. */
const OT_MULT_DEFAULT = 1.25;
/* Pesos per kWh. A starting figure only -- it is editable on the CE, and the
   shop's actual tariff should be typed in. */
const KWH_RATE_DEFAULT = 12;
function ceRates(src) {
  const raw = (src && src.rates) || {};
  const rawShifts = raw.shiftMults || {};
  const shiftMults = {};
  const keys = (typeof SHIFTS !== 'undefined') ? Object.keys(SHIFTS) : [];
  keys.forEach(k => {
    const v = parseFloat(rawShifts[k]);
    shiftMults[k] = (isFinite(v) && v > 0) ? v : SHIFTS[k].mult;
  });
  const ot = parseFloat(raw.otMult);
  /* The electricity tariff rides here for the same reason the multipliers do:
     a CE keeps what it was quoted at. A utility rate change must not reprice
     an estimate that has already gone to a client. Zero is a legitimate
     value -- it means power is not being charged -- so unlike a multiplier it
     is honoured rather than replaced by the default. */
  const kwh = parseFloat(raw.kwhRate);
  return {
    shiftMults,
    /* How the P30 ECC is charged -- see eccByRow. A CE with no rule was quoted
       on 'row' and keeps it; new CEs are stamped 'month'. */
    eccRule: raw.eccRule === 'month' ? 'month' : 'row',
    otMult: (isFinite(ot) && ot > 0) ? ot : OT_MULT_DEFAULT,
    kwhRate: (isFinite(kwh) && kwh >= 0) ? kwh : KWH_RATE_DEFAULT
  };
}
/* One shift's multiplier. Takes a resolved rates object, or undefined -- a
   caller that has not got one still gets the statutory figure rather than 1,
   which would quietly bill a holiday at straight time. */
function ceShiftMult(rates, shiftKey) {
  const r = (rates && rates.shiftMults) ? rates : ceRates(null);
  const v = r.shiftMults[shiftKey];
  return (isFinite(v) && v > 0) ? v : 1;
}
function ceOtMult(rates) {
  const v = rates && parseFloat(rates.otMult);
  return (isFinite(v) && v > 0) ? v : OT_MULT_DEFAULT;
}
/* The company standard: what a NEW CE is stamped with. Set by an admin in
   Admin -> Shift Multipliers when a ruling changes, shared through
   SharePoint and mirrored here. SHIFTS and OT_MULT_DEFAULT stay what an
   unstamped CE -- every CE written before the standard existed -- resolves
   to, so changing the standard never reprices a saved estimate. */
function stdRates() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('shic:shift_rates') || 'null'); } catch (_) {}
  return ceRates({ rates: (s && typeof s === 'object') ? s : {} });
}
function stampRates() {
  const s = stdRates();
  return { shiftMults: { ...s.shiftMults }, otMult: s.otMult, eccRule: 'month' };
}
/* Loading gives every row and scope task a fresh id. Three things point at
   those ids and have to follow them:
   - a row's taskId (its scope task),
   - each entry of a row's shares (a row split across several tasks),
   - a highlighted-cost callout's src / srcs ('row:<tab>:<id>', 'miscRow:<key>:<id>').
   Only the first was remapped, so a shared row lost its tasks and a callout
   linked to a line item read as "missing" after every reload. Ids are kept
   per tab: rows from two SharePoint lists can share an 'sp<Id>'. */
function ceIdRemapper(sowItems) {
  const sowMap = {}, ids = {};
  const sow = (sowItems || []).map(s => { const nid = uid(); sowMap[s.id] = nid; return { ...s, id: nid }; });
  const rt = tab => r => {
    const nid = uid();
    if (r && r.id != null && r.id !== '') ids[tab + ':' + r.id] = nid;
    const out = { ...r, id: nid, taskId: (r.taskId && sowMap[r.taskId]) || '' };
    if (Array.isArray(r.shares)) out.shares = r.shares.filter(x => x && sowMap[x.taskId]).map(x => ({ ...x, taskId: sowMap[x.taskId] }));
    return out;
  };
  const key = k => {
    const m = /^(row:(mp|tools|mats|ppe)|miscRow:([^:]+)):(.+)$/.exec(String(k || ''));
    if (!m) return k;
    const nid = ids[(m[2] || 'misc') + ':' + m[4]];
    return nid ? m[1] + ':' + nid : k;
  };
  const fixAddl = list => (list || []).map(r => ({
    ...r,
    id: r.id || uid(),
    ...(r.src ? { src: key(r.src) } : {}),
    ...(Array.isArray(r.srcs) ? { srcs: r.srcs.map(key) } : {})
  }));
  return { sow, rt, fixAddl };
}
/* The P30 ECC, per manpower row.

   'row' (every CE quoted before build 189): P30 x pax on EVERY row. One man on
   a regular day, a Sunday and a holiday is three rows, so three ECCs -- while
   the same man on one row for 20 days paid one.

   'month': P30 per person per month. Per role, the crew is the most on any day
   shift plus the most on any night shift (the Benefits headcount), the days
   are its man-days over that crew, and a month is 26 working days -- the month
   the SIL and daily rates already use -- rounded up, at least one. The role's
   ECC is spread over its rows by man-days, so each row still carries its own
   share and every total that adds rows up is unchanged in shape. */
const ECC_MONTHLY = 30;
const ECC_MONTH_DAYS = 26;
function eccByRow(mp, rates) {
  const m = new Map();
  const list = (Array.isArray(mp) ? mp : []).filter(r => r && r.role);
  if (!(rates && rates.eccRule === 'month')) {
    list.forEach(r => m.set(r, N(r.pax) * ECC_MONTHLY));
    return m;
  }
  const g = {};
  list.forEach(r => {
    const k = String(r.role).trim().toUpperCase();
    const x = g[k] || (g[k] = { day: 0, night: 0, md: 0, rows: [] });
    const pax = N(r.pax) || 1;
    if (/_night$/.test(r.shift || 'regular_day')) x.night = Math.max(x.night, pax);
    else x.day = Math.max(x.day, pax);
    x.md += pax * (N(r.days) || 1);
    x.rows.push(r);
  });
  Object.keys(g).forEach(k => {
    const x = g[k], crew = x.day + x.night;
    const months = Math.max(1, Math.ceil((crew ? x.md / crew : 0) / ECC_MONTH_DAYS - 1e-9));
    const tot = ECC_MONTHLY * crew * months;
    x.rows.forEach(r => m.set(r, x.md ? tot * (N(r.pax) || 1) * (N(r.days) || 1) / x.md : tot / x.rows.length));
  });
  return m;
}
/* The colour of the title bars on the printed CE and the Excel exports:
   green for SY3, orange for Synercore, black for any other company. The text
   on the bar is black or white, whichever reads better on that colour. */
function ceBrand(co) {
  const n = String((co && co.name) || '') + ' ' + String((co && co.sub) || '');
  const bar = /SY3/i.test(n) ? '#1E7B34' : /SYNERCORE/i.test(n) ? '#F07F12' : '#000000';
  const lin = h => { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(bar.slice(1, 3)) + 0.7152 * lin(bar.slice(3, 5)) + 0.0722 * lin(bar.slice(5, 7));
  return { bar, text: L > 0.179 ? '#000000' : '#FFFFFF' };
}
function ceKwhRate(rates) {
  const v = rates && parseFloat(rates.kwhRate);
  return (isFinite(v) && v >= 0) ? v : KWH_RATE_DEFAULT;
}
/* Power is charged on shopworks only, and the CE type is what says so -- not
   the presence of a kW figure on a row. The same welding machine on an onsite
   job runs on the client's supply, so its power is not ours to bill. */
/* Whether this CE type pays the per-day Incentive. On unless the type says
   otherwise, so a CE with no type prices as it always did. */
function ceIncentiveOn(ceType) {
  const c = (typeof CE_CFG !== 'undefined' && CE_CFG[ceType]) || {};
  return c.incentive !== false;
}
function cePowerOn(ceType) {
  const c = (typeof CE_CFG !== 'undefined' && CE_CFG[ceType]) || {};
  return !!c.power;
}
/* Electricity for one tool row: rating x running hours x tariff.
   Running hours are typed, not derived from days. A grinder on the floor for
   five days does not draw for 120 hours, and billing it as though it did is
   how a shopworks CE ends up quoting more power than the shop consumes. */
function toolPowerCost(row, kwhRate) {
  if (!row) return 0;
  const rate = N(kwhRate);
  if (!(rate > 0)) return 0;
  const kw = N(row.kw), hrs = N(row.runHrs);
  if (!(kw > 0) || !(hrs > 0)) return 0;
  return N(row.qty) * kw * hrs * rate;
}
/* What a tool row costs all in: rental plus the power it draws. Every place
   that shows a row total -- the editor, the printed CE, both exports and the
   grand total -- goes through this one function, so none of them can disagree
   about whether power was counted. */
/* A Miscellaneous line: qty x unit cost x days. Days is optional -- every
   row written before it existed has none and costs qty x cost, as before. */
function miscRowCost(r) {
  if (!r) return 0;
  /* A line built from the crew carries its sub-items -- one per role and
     shift, as Benefits & Others lists them -- and is charged on those:
     unit cost x the pax-days each one actually works. QTY and DAYS on the
     line itself are the summary (crew, and pax-days / crew), which rounds. */
  if (Array.isArray(r.parts) && r.parts.length)
    return N(r.cost) * r.parts.reduce((t, p) => t + N(p.qty) * (N(p.days) || 1), 0);
  return N(r.qty) * N(r.cost) * (N(r.days) || 1);
}
function toolRowTotal(row, kwhRate, src) {
  return toolRowCost(row, src) + toolPowerCost(row, kwhRate);
}

function ceResDays(r) {
  return (r.days === undefined || r.days === null || r.days === '') ? 1 : (parseFloat(r.days) || 0);
}
function ceMpRowCost(r, rates, ceType) {
  if (!r || !r.role) return 0;
  /* Omitted, this resolves to the statutory defaults, so every caller that
     has not been given the CE's own rates still prices as it always did. */
  const mult = ceShiftMult(rates, r.shift);
  const otMult = ceOtMult(rates);
  /* Benefits use the basic rate, the wage uses the shift-adjusted one.
     Kept in step with calcBen in src/App.js by tools/test-recompute.js. */
  const pax = N(r.pax), days = N(r.days), rate = N(r.rate);
  const reg = pax * days * N(r.rate) * mult;
  const ot = pax * days * (N(r.otHours || 0) / 8) * N(r.rate) * otMult * mult;
  const thirteenth = rate / 12 * days * pax;
  const sss = rate * 0.25 * 0.75 * days * pax / 26;
  const hdmf = rate * 0.16 * days * pax / 26 * 2;
  /* This row's ECC share rides on the rates as _ecc (from eccByRow, keyed by
     row). Without it, the old per-row P30. */
  const ecc = rates && rates._ecc && rates._ecc.has(r) ? rates._ecc.get(r) : pax * 30;
  const sil = rate * days * pax * 5 / 12 / 26 + ecc;
  const perdiem = ceIncentiveOn(ceType) ? N(r.perDiem || 0) * days * pax : 0;
  return reg + ot + thirteenth + sss + hdmf + sil + perdiem;
}
/* A mobilization / demobilization line. Two kinds share one list (so they
   ride the existing shicMob / shicDemob JSON columns with no migration):
   an expense -- qty x days x rate -- and a manpower row (kind 'mp'), costed
   like the Manpower tab's regular day shift: pax x days x rate, plus overtime
   hours per day at the CE's OT multiplier. desc holds the role. */
function mobRowCost(r, rates) {
  if (!r) return 0;
  const base = N(r.qty) * N(r.days) * N(r.rate);
  if (r.kind !== 'mp') return base;
  return base + N(r.qty) * N(r.days) * (N(r.otHours) / 8) * N(r.rate) * ceOtMult(rates);
}
/* The project crew, one line per role, for mobilization / demobilization.
   The same people move between scope tasks and shift types, so a role counts
   the most pax on any one day-type row plus the most on any one night row --
   the headcount rule Benefits & Others uses. Rate is the role's base day rate
   (a regular-day row's if there is one), with no shift premium: travel and
   induction are paid at the plain rate. Order is first appearance. */
function consolidateCrew(mp) {
  const out = [], by = {};
  (Array.isArray(mp) ? mp : []).forEach(r => {
    const role = String((r && r.role) || '').trim();
    if (!role) return;
    const key = role.toUpperCase();
    const pax = N(r.pax) || 1;
    const g = by[key] || (by[key] = (out.push({ role, day: 0, night: 0, rate: 0, _reg: false }), out[out.length - 1]));
    if (/_night$/.test(r.shift || 'regular_day')) g.night = Math.max(g.night, pax);
    else g.day = Math.max(g.day, pax);
    const isReg = (r.shift || 'regular_day') === 'regular_day';
    if ((isReg && !g._reg) || (!g._reg && !g.rate)) { g.rate = N(r.rate); if (isReg) g._reg = true; }
  });
  return out.map(g => ({ role: g.role, pax: g.day + g.night, rate: g.rate }));
}
/* Food allowance is paid at three rates -- project manager, admin staff and
   skilled manpower. A role's category is the CE's own choice (info.mealCats)
   and otherwise a guess from its name. */
const MEAL_CATS = [['PM', 'MEAL ALLOWANCE (PM)'], ['ADMIN', 'MEAL ALLOWANCE (ADMIN)'], ['SKILLED', 'MEAL ALLOWANCE (SKILLED MANPOWER)']];
function mealCatGuess(role) {
  const r = String(role || '').toUpperCase();
  if (/PROJECT\s*MANAGER|\bPM\b/.test(r)) return 'PM';
  if (/ADMIN|DOCUMENT|DOC\.?\s*CON|TIME\s*KEEP|DRIVER|TOOL\s*KEEP|WAREHOUSE|STORE\s*KEEP|SECRETARY|CLERK|PURCHAS|ACCOUNT|LIAISON|HR\b/.test(r)) return 'ADMIN';
  return 'SKILLED';
}
/* Headcount and duration per category, from the manpower. Pax is the
   consolidated crew (most on a day shift + most on a night shift, per role);
   days is man-days / pax, the same DAYS rule Benefits & Others uses, so a
   category on site 45 days reads 45 however the shifts split them. */
function mealGroups(mp, cats) {
  const map = cats || {};
  const catOf = role => map[String(role || '').trim().toUpperCase()] || mealCatGuess(role);
  const g = {};
  MEAL_CATS.forEach(([k]) => { g[k] = { pax: 0, manDays: 0, days: 0 }; });
  consolidateCrew(mp).forEach(c => { g[catOf(c.role)].pax += c.pax; });
  (Array.isArray(mp) ? mp : []).forEach(r => {
    if (!String((r && r.role) || '').trim()) return;
    g[catOf(r.role)].manDays += (N(r.pax) || 1) * (N(r.days) || 1);
  });
  Object.keys(g).forEach(k => { g[k].days = g[k].pax ? Math.round(g[k].manDays / g[k].pax * 100) / 100 : 0; g[k].parts = []; });
  /* Sub-items: role x shift, same role and shift merged. */
  (Array.isArray(mp) ? mp : []).forEach(r => {
    const role = String((r && r.role) || '').trim();
    if (!role) return;
    const sk = r.shift || 'regular_day';
    const label = role + ' \u00b7 ' + ((typeof SHIFTS !== 'undefined' && SHIFTS[sk] && SHIFTS[sk].label) || sk);
    const parts = g[catOf(role)].parts;
    const hit = parts.find(p => p.label === label && N(p.days) === (N(r.days) || 1));
    if (hit) hit.qty += N(r.pax) || 1;
    else parts.push({ label, qty: N(r.pax) || 1, days: N(r.days) || 1 });
  });
  return g;
}
function computeCEGrand(ce) {
  if (!ce) return 0;
  const cfg = (typeof CE_CFG !== 'undefined' && CE_CFG[ce.ceType]) || {};
  const arr = v => Array.isArray(v) ? v : [];
  /* The CE's own multipliers, so a recompute reproduces what it was quoted
     at rather than what today's rules would charge. */
  const _rates = ceRates(ce);
  const _mpRates = { ..._rates, _ecc: eccByRow(arr(ce.mp), _rates) };
  const mpT = arr(ce.mp).reduce((s, r) => s + ceMpRowCost(r, _mpRates, ce.ceType), 0);
  /* Through toolRowCost, so a tiered CE recomputes to what the editor shows.
     A row naming no tier is Tier 2, which is exactly the old expression. */
  const _kwh = cePowerOn(ce.ceType) ? ceKwhRate(_rates) : 0;
  const toolsT = arr(ce.tools).reduce((s, r) => s + toolRowTotal(r, _kwh), 0);
  const matsT = arr(ce.mats).reduce((s, r) => s + N(r.qty) * N(r.cost), 0);
  const ppeT = arr(ce.ppe).reduce((s, r) => s + N(r.qty) * N(r.cost), 0);
  const miscT = Object.keys(ce.misc || {}).reduce((s, k) => {
    if (k.charAt(0) === '_') return s; /* _addlCosts / _margin are not costs */
    return s + arr((ce.misc || {})[k]).reduce((t, r) => t + miscRowCost(r), 0);
  }, 0);
  const veh = rows => arr(rows).reduce((s, r) => s + mobRowCost(r, _rates), 0);
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


/* DAYS LEFT, and when it stops.
   =============================
   The countdown measured the deadline against `new Date()` every render and
   never looked at whether the CE had gone out. A CE submitted ON its deadline
   in July went on accruing overdue days through August, and by September was
   reporting "49d OD" in red beside its own on-time submission date. The work
   was done; only the clock had not been told.

   Submitting is what stops it. After that the question is no longer "how long
   have I got" but "how did we do", and that answer never changes again.

   Both dates are plain YYYY-MM-DD. `new Date('2026-07-18')` parses as UTC
   midnight while `new Date()` is local, which in Manila is eight hours of skew
   -- enough to report a deadline as a day out either side of midnight. Both
   sides are pinned to local midnight so a whole number of days is what comes
   back. */
function _ceMidnight(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? null : d;
}
function _ceToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function ceDeadline(deadline, dateSubmitted, status) {
  /* A status that closes the CE stops the clock as surely as a submission
     date does, and the two must not disagree: a CE marked Approved is off
     the dashboard's open list, and leaving it counting down in the table
     beside that would be the same CE described two ways. */
  const closed = typeof ceIsOpen === 'function' && status !== undefined && !ceIsOpen(status);
  const due = _ceMidnight(deadline);
  if (!due) return { days: null, label: '—', done: closed, late: false };
  const sub = _ceMidnight(dateSubmitted);
  if (!sub && closed) {
    /* Closed, but nobody recorded when it went out. There is no honest number
       of days to report, so it says the one thing that is true. */
    return { days: null, label: 'closed', done: true, late: false };
  }
  const days = Math.round((due - (sub || _ceToday())) / 86400000);
  if (!sub) {
    /* Still running. Negative is overdue and keeps growing, which is the
       point -- nobody has submitted it. */
    return { days, done: false, late: days < 0,
             label: days < 0 ? Math.abs(days) + 'd OD' : days + 'd' };
  }
  /* Submitted. A settled result, not a countdown: "on time" reads as finished
     where "0d" reads as due today. */
  return {
    days, done: true, late: days < 0,
    label: days === 0 ? 'on time'
      : days < 0 ? Math.abs(days) + 'd late'
      : days + 'd early'
  };
}


/* The company a CE belongs to is already in its number.
   SHIC-CE-2026-0004 is SHIC's; SY3-CE-2026-0004 is SY3's. The monitoring
   table kept a separate companyDesig field that defaulted to 'SHIC' whatever
   the number said, so SY3 CEs sat under a SHIC label. */
function ceNumPrefix(ceNum) {
  const t = String(ceNum || '').toUpperCase();
  const i = t.indexOf('-CE-');
  return i > 0 ? t.slice(0, i) : '';
}
