/* Quantity calculators: how much to buy for babbitt, painting and welding, with the
   material lost in use, added to the Materials tab as ordinary rows.

   Two halves. The first is plain functions with no React in them, so the maths
   can be tested on its own (tools/test-calculators.js). The second is the drawer
   that opens from the Materials tab.

   Every allowance is a LOSS percentage: you buy the net quantity divided by what
   is left after the loss, so a 25% loss is 1.33 times the net, not 1.25. The one
   exception is the welding allowance for tacks, run-off and repairs, which is added
   to the weld metal before any loss is applied.

   The company's standards (the defaults below, as edited by an admin) and what each
   CE actually used are separate things. A CE keeps the values it used, so changing
   a standard later never changes a quantity that was already worked out. */

const CALC_KINDS = [
  { id: 'babbitt', label: 'Babbitt', job: 'Bearing' },
  { id: 'painting', label: 'Painting', job: 'Surface' },
  { id: 'welding', label: 'Welding', job: 'Shaft' },
  { id: 'cut1d', label: 'Bar cutting', job: 'Cut' },
  { id: 'cut2d', label: 'Sheet cutting', job: 'Layout' }
];

/* kind: src = a published figure, est = our own estimate (shown as such).
   how: loss = bought / (1 - x); add = added to the weld metal; len = a length in mm. */
const CALC_DEFAULTS = {
  allow: {
    babbitt: { label: 'Babbitt pour and trial casts', pct: 20, unit: '%', how: 'loss', lo: null, hi: null, range: 'none found', kind: 'est' },
    brush: { label: 'Paint, brush or roller', pct: 15, unit: '%', how: 'loss', lo: 10, hi: 20, range: '10-20%', kind: 'src' },
    spray: { label: 'Paint, airless spray', pct: 25, unit: '%', how: 'loss', lo: 20, hi: 30, range: '20-30%', kind: 'src' },
    waste: { label: 'Tacks, run-off, repairs (added to weld metal)', pct: 10, unit: '%', how: 'add', lo: 5, hi: 10, range: '5-10%', kind: 'src' },
    smaw: { label: 'Stick electrode loss (coating, spatter, stub)', pct: 35, unit: '%', how: 'loss', lo: 25, hi: 35, range: '25-35%', kind: 'src' },
    tig: { label: 'TIG filler loss besides stub (spatter, tip)', pct: 1, unit: '%', how: 'loss', lo: 0, hi: 2, range: 'about 1%', kind: 'src' },
    stub: { label: 'TIG stub left on each rod', pct: 100, unit: 'mm', how: 'len', lo: 50, hi: 100, range: '50-100 mm', kind: 'src' }
  },
  units: {
    bar: { label: 'Babbitt bar', v: 900, unit: 'g' },
    tin: { label: 'Tin ingot', v: 3.8, unit: 'kg' }
  }
};
const CALC_ROWS = { babbitt: ['babbitt'], painting: ['brush', 'spray'], welding: ['waste', 'smaw', 'tig', 'stub'], cut1d: [], cut2d: [] };
const CALC_SOURCES = {
  babbitt: [['No published figure was found for babbitt pour waste.', null]],
  painting: [['Industrial Coatings Ltd', 'https://industrialcoatingsltd.com/pages/how-to-work-out-paint-coverage-for-protective-coatings']],
  welding: [['welding.org.au', 'https://welding.org.au/tools/weld-consumable-calculator/'],
    ['The Fabricator', 'https://www.thefabricator.com/thewelder/article/consumables/understanding-the-relationship-between-deposition-rate-deposition-efficiency-and-production-output'],
    ['MachineMFG', 'https://machinemfg.com/welding-rod-consumption']]
};
/* The inputs a job asks for. std marks a value that is a standard rather than a measurement. */
const CALC_FIELDS = {
  babbitt: [
    { id: 'dens', label: 'Density of babbitt G2', unit: 'g/cm3', v: 7.4, std: 1 },
    { id: 'id', label: 'Bearing ID', unit: 'mm', v: 330, hint: 'From the actual bearing' },
    { id: 'w', label: 'Bearing width', unit: 'mm', v: 280 },
    { id: 't', label: 'Babbitt thickness', unit: 'mm', v: 6 },
    { id: 'tin', label: 'Tin ingot share', unit: '%', v: 20, std: 1, hint: 'Share of the babbitt weight' }],
  painting: [
    { id: 'area', label: 'Area to be painted', unit: 'm2', v: 80 },
    { id: 'th', label: 'Thinner', unit: '%', v: 25, std: 1, hint: 'Share of all paint to buy' },
    { id: 'p1', label: 'Primer rate', unit: 'm2/L', v: 10, hint: 'Practical rate from the TDS' },
    { id: 'p2', label: 'Intermediate rate', unit: 'm2/L', v: 6.2 },
    { id: 'p3', label: 'Topcoat rate', unit: 'm2/L', v: 9.8 }],
  cut1d: [
    { id: 'stock', label: 'Stock length', unit: 'mm', v: 6000, hint: 'A pipe, bar or angle as the supplier sells it' },
    { id: 'kerf', label: 'Cut width (saw or torch kerf)', unit: 'mm', v: 3, std: 1, hint: 'Lost at every cut' }],
  cut2d: [
    { id: 'sw', label: 'Sheet width', unit: 'mm', v: 1220 },
    { id: 'sh', label: 'Sheet length', unit: 'mm', v: 2440 },
    { id: 'kerf', label: 'Cut width (saw or torch kerf)', unit: 'mm', v: 3, std: 1, hint: 'Lost at every cut' },
    { id: 'rot', label: 'Pieces may be turned 90 degrees', unit: '1 = yes, 0 = no', v: 1, hint: 'Say 0 when the grain or pattern matters' }],
  welding: [
    { id: 'dens', label: 'Density of weld metal', unit: 'g/cm3', v: 7.85, std: 1, hint: '7.85 carbon steel, about 8.0 stainless' },
    { id: 'd', label: 'Shaft diameter before welding', unit: 'mm', v: 500 },
    { id: 'len', label: 'Length to be welded', unit: 'mm', v: 300 },
    { id: 't', label: 'Thickness of buildup', unit: 'mm', v: 6, hint: 'Include the machining allowance' }]
};

function calcUp(x) { return isFinite(x) ? Math.ceil(x - 1e-9) : 0; }
function calcBuy(net, lossPct) { return net / (1 - Math.min(Math.max(lossPct, 0), 95) / 100); }
function calcMed(a) {
  if (!a || !a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function calcF(x, d) { return isFinite(x) ? Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-'; }
function calcG(n) { return Math.round(n * 100) / 100; }

/* The company standards: the defaults, with any value an admin has changed.
   `stored` is { allow: {key: pct}, units: {key: value} } and holds only changes. */
function calcStd(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const out = { allow: {}, units: {} };
  Object.keys(CALC_DEFAULTS.allow).forEach(k => {
    const v = s.allow && Number(s.allow[k]);
    out.allow[k] = { ...CALC_DEFAULTS.allow[k], pct: isFinite(v) && s.allow[k] !== '' && s.allow[k] != null && v >= 0 ? v : CALC_DEFAULTS.allow[k].pct };
  });
  Object.keys(CALC_DEFAULTS.units).forEach(k => {
    const v = s.units && Number(s.units[k]);
    out.units[k] = { ...CALC_DEFAULTS.units[k], v: isFinite(v) && s.units[k] != null && v > 0 ? v : CALC_DEFAULTS.units[k].v };
  });
  return out;
}

function calcNewJob(kind, n) {
  const j = { name: CALC_KINDS.find(k => k.id === kind).job + ' ' + n, vals: {} };
  CALC_FIELDS[kind].forEach(f => { j.vals[f.id] = f.v; });
  if (kind === 'welding') j.cons = [{ proc: 'SMAW', dia: 4, len: 350, share: 100 }];
  if (kind === 'cut1d') { j.mat = ''; j.pieces = [{ len: 1500, qty: 4 }, { len: 900, qty: 6 }]; }
  if (kind === 'cut2d') { j.mat = ''; j.pieces = [{ w: 600, h: 400, qty: 8 }, { w: 300, h: 300, qty: 10 }]; }
  return j;
}
/* A calculator's state on this CE, created from the standards the first time it is opened. */
function calcKindState(kind, std) {
  const st = { jobs: [calcNewJob(kind, 1)], act: 0, loss: {}, units: {} };
  CALC_ROWS[kind].forEach(k => { st.loss[k] = std.allow[k].pct; });
  if (kind === 'babbitt') Object.keys(std.units).forEach(k => { st.units[k] = std.units[k].v; });
  if (kind === 'painting') { st.method = 'spray'; st.incl = false; }
  return st;
}

/* Weight of one 1 m TIG rod (or any rod): density x pi d^2/4 x length, in grams. */
function calcRodG(dia, lenMm) { return 7.85 * Math.PI * Math.pow(dia / 20, 2) * (lenMm / 10); }
/* Yield: the share of what you buy that ends up in the weld. */
function calcYield(c, loss) {
  if (c.proc === 'GTAW') return Math.max(0.05, (1 - Math.min(loss.stub, c.len - 1) / c.len) * (1 - loss.tig / 100));
  return Math.max(0.05, 1 - loss.smaw / 100);
}

/* Cutting stock into pieces, the way cutlistoptimizer.com does it: how many full lengths or
   sheets to buy, and which piece goes where. These are heuristics, fast and close to the
   best layout but not guaranteed to be it, so a layout is an estimate to buy against, not
   a cutting instruction. Kerf is the width the saw or torch takes at every cut. */
function calcCut1D(stock, kerf, pieces) {
  const items = [], unfit = [];
  (pieces || []).forEach(p => {
    const n = Math.max(0, Math.floor(Number(p.qty) || 0)), l = Number(p.len) || 0;
    if (l > 0) for (let i = 0; i < n; i++) items.push(l);
  });
  items.sort((a, b) => b - a);
  const bins = [];
  /* best fit: the bar this piece leaves the least over on */
  items.forEach(l => {
    if (l > stock) { unfit.push(l); return; }
    let best = -1, bestLeft = Infinity;
    bins.forEach((b, i) => {
      const left = stock - b.used - kerf - l;
      if (left >= -1e-9 && left < bestLeft) { best = i; bestLeft = left; }
    });
    if (best < 0) bins.push({ items: [l], used: l });
    else { bins[best].used += kerf + l; bins[best].items.push(l); }
  });
  const placed = bins.reduce((a, b) => a + b.items.reduce((x, y) => x + y, 0), 0);
  return { bins, unfit, placed, count: bins.length, waste: bins.length ? 1 - placed / (bins.length * stock) : 0 };
}
function calcCut2D(sw, sh, kerf, pieces, rotate) {
  const items = [], unfit = [];
  (pieces || []).forEach(p => {
    const n = Math.max(0, Math.floor(Number(p.qty) || 0)), w = Number(p.w) || 0, h = Number(p.h) || 0;
    if (w > 0 && h > 0) for (let i = 0; i < n; i++) items.push({ w, h });
  });
  const ready = [];
  items.forEach(it => {
    const o = rotate ? [[Math.min(it.w, it.h), Math.max(it.w, it.h)], [Math.max(it.w, it.h), Math.min(it.w, it.h)]] : [[it.w, it.h]];
    const fit = o.find(x => x[0] <= sw && x[1] <= sh);
    if (fit) ready.push({ w: fit[0], h: fit[1] }); else unfit.push(it);
  });
  /* shelves: pieces sorted tallest first, laid in rows across the sheet */
  ready.sort((a, b) => b.h - a.h || b.w - a.w);
  const sheets = [];
  ready.forEach(p => {
    for (const s of sheets) {
      for (const sf of s.shelves) {
        const x = sf.x + (sf.x ? kerf : 0);
        if (p.h <= sf.h && x + p.w <= sw) { s.placed.push({ x, y: sf.y, w: p.w, h: p.h }); sf.x = x + p.w; return; }
      }
      const y = s.usedH + (s.shelves.length ? kerf : 0);
      if (y + p.h <= sh) { s.shelves.push({ y, h: p.h, x: p.w }); s.placed.push({ x: 0, y, w: p.w, h: p.h }); s.usedH = y + p.h; return; }
    }
    sheets.push({ shelves: [{ y: 0, h: p.h, x: p.w }], placed: [{ x: 0, y: 0, w: p.w, h: p.h }], usedH: p.h });
  });
  const area = sheets.reduce((a, s) => a + s.placed.reduce((x, r) => x + r.w * r.h, 0), 0);
  return { sheets, unfit, placed: ready.length, count: sheets.length, waste: sheets.length ? 1 - area / (sheets.length * sw * sh) : 0, area };
}
function calcPieceCount(pieces) { return (pieces || []).reduce((a, p) => a + Math.max(0, Math.floor(Number(p.qty) || 0)) * (Number(p.len != null ? p.len : p.w) > 0 ? 1 : 0), 0); }

/* One job through its calculator. Returns the figures to show and the lines to buy:
   net is before loss, raw is after loss and before rounding. */
function calcRun(kind, job, st) {
  const v = job.vals, L = st.loss, PI = Math.PI;
  if (kind === 'babbitt') {
    const bar = st.units.bar / 1000, ing = st.units.tin;
    const kg = PI * v.w * v.t * (v.id + v.t) / 1000 * v.dens / 1000;
    const bN = kg / bar, iN = kg * v.tin / 100 / ing, lo = L.babbitt;
    return {
      rows: [
        { l: 'Babbitt needed, before loss', net: kg, buy: kg, u: 'kg', how: 'pi x width x thickness x (ID + thickness) / 1000 x density / 1000' },
        { l: 'Bars of babbitt', net: bN, buy: calcBuy(bN, lo), u: 'bars', how: 'babbitt needed / bar weight, then / (1 - loss)' },
        { l: 'Tin ingots', net: iN, buy: calcBuy(iN, lo), u: 'ingots', how: 'babbitt needed x tin share / ingot weight, then / (1 - loss)' }],
      lines: [
        { k: 'bar', d: 'Babbitt G2 bar, ' + calcG(st.units.bar) + ' g', u: 'bar', net: bN, raw: calcBuy(bN, lo) },
        { k: 'tin', d: 'Tin ingot, ' + calcG(st.units.tin) + ' kg', u: 'pc', net: iN, raw: calcBuy(iN, lo) }]
    };
  }
  if (kind === 'painting') {
    const lo = st.incl ? 0 : L[st.method], a = v.area;
    const pr = calcBuy(a / v.p1, lo), it = calcBuy(a / v.p2, lo), tc = calcBuy(a / v.p3, lo);
    const th = (pr + it + tc) * v.th / 100, thN = (a / v.p1 + a / v.p2 + a / v.p3) * v.th / 100;
    return {
      rows: [
        { l: 'Primer', net: a / v.p1, buy: pr, u: 'L', how: 'area / primer rate, then / (1 - loss)' },
        { l: 'Intermediate', net: a / v.p2, buy: it, u: 'L', how: 'area / intermediate rate, then / (1 - loss)' },
        { l: 'Topcoat', net: a / v.p3, buy: tc, u: 'L', how: 'area / topcoat rate, then / (1 - loss)' },
        { l: 'Thinner', net: thN, buy: th, u: 'L', how: 'thinner % x (primer + intermediate + topcoat to buy)' }],
      lines: [
        { k: 'primer', d: 'Primer', u: 'L', net: a / v.p1, raw: pr }, { k: 'inter', d: 'Intermediate coat', u: 'L', net: a / v.p2, raw: it },
        { k: 'top', d: 'Topcoat', u: 'L', net: a / v.p3, raw: tc }, { k: 'thin', d: 'Thinner', u: 'L', net: thN, raw: th }]
    };
  }
  if (kind === 'cut1d') {
    const c = calcCut1D(v.stock, v.kerf, job.pieces), total = c.placed;
    const d = (String(job.mat || '').trim() || 'Stock bar') + ', ' + calcG(v.stock) + ' mm';
    return {
      rows: [
        { l: 'Pieces to cut', net: calcPieceCount(job.pieces) - c.unfit.length, buy: calcPieceCount(job.pieces) - c.unfit.length, u: 'pcs', how: 'the quantities added up' },
        { l: 'Stock lengths to buy', net: total / v.stock, buy: c.count, u: 'pcs', how: 'pieces laid onto stock lengths, longest first, each into the length it leaves the least over on; every cut takes the cut width' },
        { l: 'Offcut and kerf', net: c.waste * 100, buy: c.waste * 100, u: '%', how: '1 - (length of pieces placed / length bought)' }],
      lines: c.count ? [{ k: 'cut1d:' + d, d, u: 'pc', net: total / v.stock, raw: c.count }] : [],
      cut: c
    };
  }
  if (kind === 'cut2d') {
    const c = calcCut2D(v.sw, v.sh, v.kerf, job.pieces, v.rot > 0);
    const d = (String(job.mat || '').trim() || 'Sheet') + ', ' + calcG(v.sw) + ' x ' + calcG(v.sh) + ' mm';
    return {
      rows: [
        { l: 'Pieces to cut', net: c.placed, buy: c.placed, u: 'pcs', how: 'the quantities added up' },
        { l: 'Sheets to buy', net: c.area / (v.sw * v.sh), buy: c.count, u: 'sheets', how: 'pieces laid in rows across each sheet, tallest first, with the cut width between them' },
        { l: 'Offcut and kerf', net: c.waste * 100, buy: c.waste * 100, u: '%', how: '1 - (area of pieces placed / area of sheets bought)' }],
      lines: c.count ? [{ k: 'cut2d:' + d, d, u: 'pc', net: c.area / (v.sw * v.sh), raw: c.count }] : [],
      cut: c
    };
  }
  /* welding: buildup on a shaft */
  const vol = PI * v.t * (v.d + v.t) * v.len / 1000, net = vol * v.dens / 1000, need = net * (1 + L.waste / 100);
  const rows = [
    { l: 'Weld metal in the buildup', net, buy: net, u: 'kg', how: 'pi x thickness x (diameter + thickness) x length / 1000 x density / 1000' },
    { l: 'Weld metal to deposit', net, buy: need, u: 'kg', how: 'buildup weight x (1 + tacks, run-off and repairs)' }];
  const lines = []; let shareSum = 0;
  (job.cons || []).forEach(c => {
    shareSum += c.share;
    const y = calcYield(c, L), kg = need * c.share / 100 / y;
    const rods = c.proc === 'GTAW' ? kg * 1000 / calcRodG(c.dia, c.len) : null;
    rows.push({
      l: (c.proc === 'GTAW' ? 'TIG filler rod ' : 'Stick electrode ') + c.dia + ' mm (' + c.share + '%)', net: need * c.share / 100, buy: kg, u: 'kg',
      extra: rods != null ? '~ ' + calcUp(rods) + ' rods of ' + c.len + ' mm' : '',
      how: 'weld metal share / yield. Yield ' + calcF(y * 100, 1) + '%' + (c.proc === 'GTAW' ? ' = (1 - stub / rod length) x (1 - other loss)' : ' = 1 - electrode loss')
    });
    lines.push({
      k: (c.proc === 'GTAW' ? 'tig' : 'smaw') + c.dia, d: (c.proc === 'GTAW' ? 'Filler rod, GTAW ' : 'Welding electrode, SMAW ') + c.dia + ' mm',
      u: 'kg', net: need * c.share / 100, raw: kg
    });
  });
  return { rows, lines, shareSum, need };
}

/* Every job added together, then rounded up once, so two bearings do not each round up. */
function calcAggregate(kind, st) {
  const agg = {}, order = [];
  st.jobs.forEach(j => calcRun(kind, j, st).lines.forEach(l => {
    if (!agg[l.k]) { agg[l.k] = { k: l.k, d: l.d, u: l.u, net: 0, raw: 0 }; order.push(l.k); }
    agg[l.k].net += l.net; agg[l.k].raw += l.raw;
  }));
  /* A consumable given none of the weld metal buys nothing, so it is not a line. */
  return order.map(k => ({ ...agg[k], q: calcUp(agg[k].raw) })).filter(l => l.raw > 1e-9);
}
/* Where a value sits against its published range. */
function calcStatus(def, using) {
  if (def.lo == null) return using === def.pct ? ['estimate', 'warn'] : ['edited', ''];
  if (using < def.lo || using > def.hi) return ['outside range', 'warn'];
  return using === def.pct ? ['standard', 'ok'] : ['edited, in range', ''];
}
/* What estimators typed before: the latest value from each CE, newest 30, and their median. */
function calcTypical(hist, key) {
  const seen = new Set(), vals = [];
  (hist || []).slice().reverse().forEach(r => {
    if (r && r.k === key && !seen.has(r.ce) && isFinite(r.v)) { seen.add(r.ce); vals.push(Number(r.v)); }
  });
  const last = vals.slice(0, 30);
  return { med: calcMed(last), n: last.length };
}
/* The values a calculator used, for the team history. */
function calcUsed(kind, st) {
  const out = {};
  if (kind === 'painting') { if (!st.incl) out[st.method] = st.loss[st.method]; return out; }
  CALC_ROWS[kind].forEach(k => { out[k] = st.loss[k]; });
  return out;
}

/* ---------------------------------------------------------------------------------
   The drawer. Props:
     open, onClose
     calc, setCalc      this CE's calculator state (saved with the CE)
     std                company standards, already merged (calcStd)
     hist               team history, [{ce, k, v, at}]
     isAdmin, onSaveStd admin edits standards; onSaveStd({allow:{}, units:{}}) stores the changes
     priceFor(desc)     unit cost from the Masterlist, or null
     onAdd(lines, kind) lines are [{desc, qty, uom, k}]
   Inputs are uncontrolled (defaultValue) so typing "7." keeps its dot; `rev` is
   bumped whenever the app itself changes a value, to make them redraw. */
function CalcStdInput({ value, onCommit, label }) {
  const [txt, setTxt] = React.useState(String(value));
  React.useEffect(() => { setTxt(String(value)); }, [value]);
  const commit = () => { const n = parseFloat(txt); if (isFinite(n) && n >= 0 && n !== value) onCommit(n); else setTxt(String(value)); };
  return React.createElement('input', {
    className: 'calc-in', type: 'number', step: 'any', value: txt, 'aria-label': label,
    onChange: e => setTxt(e.target.value), onBlur: commit, onKeyDown: e => { if (e.key === 'Enter') e.target.blur(); }
  });
}

function CalcDrawer(props) {
  const { open, onClose, calc, setCalc, std, hist, isAdmin, onSaveStd, priceFor, onAdd, page } = props;
  const [adminOn, setAdminOn] = React.useState(false);
  const [rev, setRev] = React.useState(0);
  React.useEffect(() => {
    if (!open || page) return;
    const key = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;

  const h = React.createElement;
  const kind = (calc && calc.tab) || 'babbitt';
  const kinds = (calc && calc.k) || {};
  const st = kinds[kind] || calcKindState(kind, std);
  const job = st.jobs[Math.min(st.act, st.jobs.length - 1)];
  const out = calcRun(kind, job, st);
  const lines = calcAggregate(kind, st);
  /* Every welding job's consumables must account for all of its weld metal. */
  const sharesOff = kind === 'welding' && st.jobs.some(j => Math.abs((j.cons || []).reduce((a, c) => a + c.share, 0) - 100) > 0.01);

  /* Change this calculator's state. fn gets a copy to edit. */
  const upd = fn => setCalc(prev => {
    const next = JSON.parse(JSON.stringify(prev || {}));
    next.tab = next.tab || kind; next.k = next.k || {};
    if (!next.k[kind]) next.k[kind] = calcKindState(kind, std);
    fn(next.k[kind]);
    return next;
  });
  const setTab = k => setCalc(prev => ({ ...(prev || {}), tab: k }));
  const num = (e, fallback) => { const n = parseFloat(e.target.value); return isFinite(n) ? n : (fallback == null ? 0 : fallback); };

  const C = {
    sec: { background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px' },
    h3: { margin: '0 0 8px', fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    mute: { color: 'var(--text-muted)', fontSize: 10 },
    mono: { fontFamily: "'JetBrains Mono',ui-monospace,monospace" }
  };
  const tag = (txt, color) => h('span', { className: 'calc-tag', style: color ? { color, borderColor: color } : null }, txt);

  /* inputs */
  const inputs = h('div', { className: 'calc-fg' }, CALC_FIELDS[kind].map(f => h('div', { key: kind + st.act + job.name + f.id + rev },
    h('label', { className: 'calc-lbl', htmlFor: 'ci_' + f.id }, f.label, f.std ? tag('default') : null),
    h('div', { className: 'calc-inp' },
      h('input', { id: 'ci_' + f.id, type: 'number', step: 'any', inputMode: 'decimal', defaultValue: job.vals[f.id],
        onChange: e => { const v = num(e); upd(s => { s.jobs[s.act].vals[f.id] = v; }); } }),
      h('span', null, f.unit)),
    f.hint ? h('div', { style: C.mute }, f.hint) : null)));

  /* results */
  const results = out.rows.map((r, i) => {
    const showNet = Math.abs(r.net - r.buy) > 1e-9 && !r.extra;
    return h('div', { key: i, className: 'calc-res' },
      h('div', { style: { minWidth: 0 } }, h('div', null, r.l),
        h('details', null, h('summary', null, 'How it is worked out'), h('div', { className: 'calc-how' }, r.how))),
      h('div', { style: { textAlign: 'right' } },
        h('div', { style: { ...C.mono, fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap' } }, calcF(r.buy, 2), h('small', { style: { ...C.mute, marginLeft: 3, fontWeight: 400 } }, r.u)),
        h('div', { style: { ...C.mute, ...C.mono } }, r.extra ? r.extra : (showNet ? 'net ' + calcF(r.net, 2) + ' ' + r.u : ''))));
  });

  /* babbitt purchase units */
  const unitsSec = kind !== 'babbitt' ? null : h('section', { style: C.sec },
    h('h3', { style: C.h3 }, 'Purchase units'),
    h('table', { className: 'calc-tbl' },
      h('thead', null, h('tr', null, ['Item', 'Standard', 'Using', 'Status'].map((t, i) => h('th', { key: t, className: i && i < 3 ? 'n' : '' }, t)))),
      h('tbody', null, Object.keys(std.units).map(k => {
        const u = std.units[k], using = st.units[k], same = using === u.v;
        return h('tr', { key: k },
          h('td', null, u.label + ' weight'),
          h('td', { className: 'n' }, isAdmin && adminOn
            ? [h(CalcStdInput, { key: 's' + u.v, value: u.v, label: 'Standard ' + u.label + ' weight', onCommit: n => onSaveStd({ units: { [k]: n } }) }), ' ' + u.unit]
            : u.v + ' ' + u.unit),
          h('td', { className: 'n', key: 'u' + rev }, h('input', { className: 'calc-in', type: 'number', step: 'any', defaultValue: using, 'aria-label': u.label + ' weight in ' + u.unit,
            onChange: e => { const n = num(e); upd(s => { s.units[k] = n > 0 ? n : u.v; }); } }), ' ' + u.unit),
          h('td', null, h('span', { className: 'calc-st ' + (same ? 'ok' : 'warn') }, same ? 'standard' : 'changed on this CE')));
      }))),
    h('p', { className: 'calc-foot' }, 'A different weight typed here applies to this CE only. The line on Materials follows the weight, for example "Tin ingot, 3.8 kg".'));

  /* welding consumables */
  const consSec = kind !== 'welding' ? null : h('section', { style: C.sec },
    h('h3', { style: C.h3 }, h('span', null, 'Consumables for this shaft'),
      h('button', { className: 'calc-btn', onClick: () => upd(s => { const j = s.jobs[s.act], used = j.cons.reduce((a, c) => a + c.share, 0); j.cons.push({ proc: 'GTAW', dia: 2.4, len: 1000, share: Math.max(0, 100 - used) }); }) }, '+ Add')),
    h('div', { className: 'calc-tw' }, h('table', { className: 'calc-tbl' },
      h('thead', null, h('tr', null, ['Process', 'Size', 'Length', 'Share', 'Yield', 'kg', ''].map((t, i) => h('th', { key: i, className: i > 0 && i < 6 ? 'n' : '' }, t)))),
      h('tbody', null, job.cons.map((c, i) => {
        const y = calcYield(c, st.loss), kg = out.need * c.share / 100 / y, k0 = kind + st.act + job.name + i + rev;
        return h('tr', { key: k0 },
          h('td', null, h('select', { className: 'calc-in', style: { width: 'auto', textAlign: 'left' }, defaultValue: c.proc, 'aria-label': 'Process', onChange: e => { const p = e.target.value; upd(s => { s.jobs[s.act].cons[i].proc = p; }); } },
            h('option', { value: 'SMAW' }, 'Stick'), h('option', { value: 'GTAW' }, 'TIG'))),
          h('td', { className: 'n' }, h('input', { className: 'calc-in', type: 'number', step: 'any', defaultValue: c.dia, 'aria-label': 'Rod size in mm', onChange: e => { const n = num(e); upd(s => { s.jobs[s.act].cons[i].dia = n; }); } }), ' mm'),
          h('td', { className: 'n' }, h('input', { className: 'calc-in', type: 'number', step: 'any', defaultValue: c.len, 'aria-label': 'Rod length in mm', onChange: e => { const n = Math.max(1, num(e, 1)); upd(s => { s.jobs[s.act].cons[i].len = n; }); } }), ' mm'),
          h('td', { className: 'n' }, h('input', { className: 'calc-in', type: 'number', step: '1', defaultValue: c.share, 'aria-label': 'Share of weld metal', onChange: e => { const n = num(e); upd(s => { s.jobs[s.act].cons[i].share = n; }); } }), ' %'),
          h('td', { className: 'n' }, calcF(y * 100, 1) + '%'), h('td', { className: 'n' }, calcF(kg, 2)),
          h('td', null, job.cons.length > 1 ? h('button', { className: 'calc-btn', 'aria-label': 'Remove consumable', onClick: () => upd(s => { s.jobs[s.act].cons.splice(i, 1); }) }, 'x') : null));
      })))),
    Math.abs(out.shareSum - 100) > 0.01 ? h('div', { style: { color: 'var(--brand-accent)', fontSize: 11, fontWeight: 600, marginTop: 6 } }, 'The shares add up to ' + out.shareSum + '%, not 100%. Weld metal is ' + (out.shareSum < 100 ? 'left out.' : 'counted more than once.')) : null,
    h('p', { className: 'calc-foot' }, 'Split the weld metal between processes and rod sizes. Stick yield comes from the electrode loss below; TIG yield from the stub and the rod length.'));

  /* allowance table */
  const cutOn = kind === 'cut1d' || kind === 'cut2d';
  const two = kind === 'cut2d';
  const cutSec = !cutOn ? null : h('section', { style: C.sec },
    h('h3', { style: C.h3 }, h('span', null, 'Pieces to cut'),
      h('button', { className: 'calc-btn', onClick: () => upd(s => { s.jobs[s.act].pieces.push(two ? { w: 0, h: 0, qty: 1 } : { len: 0, qty: 1 }); }) }, '+ Add')),
    h('div', { style: { marginBottom: 8 } },
      h('label', { className: 'calc-lbl', htmlFor: 'cut_mat' }, 'Material (goes on the Materials line)'),
      h('input', { key: 'mat' + kind + st.act + rev, id: 'cut_mat', className: 'calc-in', style: { width: '100%', textAlign: 'left' }, type: 'text', defaultValue: job.mat || '',
        placeholder: two ? 'e.g. Steel plate 6 mm A36' : 'e.g. Pipe 6 in SCH40', onChange: e => { const t = e.target.value; upd(s => { s.jobs[s.act].mat = t; }); } })),
    h('div', { className: 'calc-tw' }, h('table', { className: 'calc-tbl' },
      h('thead', null, h('tr', null, (two ? ['Width', 'Length', 'Qty', ''] : ['Length', 'Qty', '']).map((t, i) => h('th', { key: i, className: i < (two ? 3 : 2) ? 'n' : '' }, t)))),
      h('tbody', null, (job.pieces || []).map((p, i) => {
        const fld = (key, label, unit) => h('td', { className: 'n', key: key }, h('input', { className: 'calc-in', type: 'number', min: 0, step: 'any', defaultValue: p[key], 'aria-label': label,
          onChange: e => { const n = Math.max(0, num(e)); upd(s => { s.jobs[s.act].pieces[i][key] = n; }); } }), unit ? ' ' + unit : '');
        return h('tr', { key: kind + st.act + i + rev },
          two ? [fld('w', 'Piece width in mm', 'mm'), fld('h', 'Piece length in mm', 'mm')] : fld('len', 'Piece length in mm', 'mm'),
          fld('qty', 'How many'),
          h('td', null, job.pieces.length > 1 ? h('button', { className: 'calc-btn', 'aria-label': 'Remove piece', onClick: () => upd(s => { s.jobs[s.act].pieces.splice(i, 1); }) }, 'x') : null));
      })))),
    out.cut && out.cut.unfit.length ? h('div', { style: { color: 'var(--status-danger)', fontSize: 11, fontWeight: 600, marginTop: 6 } },
      out.cut.unfit.length + ' piece' + (out.cut.unfit.length === 1 ? ' is' : 's are') + ' larger than the ' + (two ? 'sheet' : 'stock length') + ' and left out.') : null,
    h('p', { className: 'calc-foot' }, 'Quick estimate by a standard packing method, close to the best layout but not guaranteed to be it. Check it against the real cutting before ordering to the last piece.'));
  /* the layout, drawn: each stock length or sheet, with its pieces */
  const PAL = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899'];
  const layoutSec = !cutOn || !out.cut || !out.cut.count ? null : h('section', { style: C.sec },
    h('h3', { style: C.h3 }, h('span', null, 'Layout'), h('span', { style: C.mute }, calcF(100 - out.cut.waste * 100, 1) + '% used, ' + out.cut.count + (two ? ' sheet' : ' stock length') + (out.cut.count === 1 ? '' : 's'))),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      two ? out.cut.sheets.slice(0, 12).map((sht, si) => h('div', { key: si },
        h('div', { style: C.mute }, 'Sheet ' + (si + 1)),
        h('div', { style: { position: 'relative', width: '100%', maxWidth: 360, aspectRatio: job.vals.sw + ' / ' + job.vals.sh, background: 'var(--bg-surface)', border: '1px solid var(--border-strong)' } },
          sht.placed.map((r, ri) => h('div', { key: ri, title: r.w + ' x ' + r.h + ' mm', style: { position: 'absolute', left: (r.x / job.vals.sw * 100) + '%', top: (r.y / job.vals.sh * 100) + '%', width: (r.w / job.vals.sw * 100) + '%', height: (r.h / job.vals.sh * 100) + '%', background: PAL[(r.w + r.h) % PAL.length], opacity: .8, boxSizing: 'border-box', border: '1px solid var(--bg-surface)' } })))))
      : out.cut.bins.slice(0, 24).map((b, bi) => h('div', { key: bi, style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { ...C.mute, minWidth: 18 } }, bi + 1),
        h('div', { style: { display: 'flex', flex: 1, height: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', overflow: 'hidden' } },
          b.items.map((l, li) => h('div', { key: li, title: l + ' mm', style: { width: (l / job.vals.stock * 100) + '%', marginRight: (job.vals.kerf / job.vals.stock * 100) + '%', background: PAL[Math.round(l) % PAL.length], opacity: .85, flexShrink: 0 } }))),
        h('span', { style: { ...C.mute, minWidth: 70, textAlign: 'right' } }, calcF(job.vals.stock - b.used, 0) + ' mm left')))),
    (two ? out.cut.sheets.length > 12 : out.cut.bins.length > 24) ? h('p', { className: 'calc-foot' }, 'The first ' + (two ? 12 : 24) + ' are drawn; the count above is for all of them.') : null);
  const rows = CALC_ROWS[kind];
  const allowSec = h('section', { style: C.sec },
    h('h3', { style: C.h3 }, h('span', null, 'Allowances used here'),
      isAdmin ? h('label', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 11, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: adminOn, onChange: e => setAdminOn(e.target.checked) }), 'Edit the standards') : null),
    h('div', { className: 'calc-tw' }, h('table', { className: 'calc-tbl' },
      h('thead', null, h('tr', null, ['Allowance', 'Standard', 'Range', 'Team typical', 'Using', 'Status'].map((t, i) => h('th', { key: t, className: i === 1 || i === 3 || i === 4 ? 'n' : '' }, t)))),
      h('tbody', null, rows.map(k => {
        const def = std.allow[k], using = st.loss[k], status = calcStatus(def, using), ty = calcTypical(hist, k);
        const off = kind === 'painting' && st.method !== k;
        return h('tr', { key: k, style: off ? { opacity: .55 } : null },
          h('td', null,
            kind === 'painting' ? h('label', { style: { display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' } },
              h('input', { type: 'radio', name: 'calc-method', checked: st.method === k, onChange: () => upd(s => { s.method = k; }) }), def.label) : def.label,
            tag(def.kind === 'src' ? 'published' : 'estimate', def.kind === 'src' ? 'var(--status-success)' : 'var(--brand-accent)')),
          h('td', { className: 'n' }, isAdmin && adminOn
            ? [h(CalcStdInput, { key: 's' + def.pct, value: def.pct, label: 'Standard for ' + def.label, onCommit: n => onSaveStd({ allow: { [k]: n } }) }), ' ' + def.unit]
            : def.pct + ' ' + def.unit),
          h('td', null, def.range),
          h('td', { className: 'n' }, ty.med == null ? h('span', { style: C.mute }, 'no history yet')
            : [ty.med + ' ' + def.unit + ' ', h('span', { key: 'n', style: C.mute }, '(n=' + ty.n + ') '),
              h('button', { key: 'b', className: 'calc-btn', onClick: () => { upd(s => { s.loss[k] = ty.med; }); setRev(r => r + 1); } }, 'Use')]),
          h('td', { className: 'n', key: 'l' + k + rev }, h('input', { className: 'calc-in', type: 'number', min: 0, step: 1, defaultValue: using, 'aria-label': 'Value used for ' + def.label,
            onChange: e => { const n = Math.max(0, num(e)); upd(s => { s.loss[k] = n; }); } }), ' ' + def.unit),
          h('td', null, h('span', { className: 'calc-st ' + status[1] }, status[0])));
      })))),
    kind === 'painting' ? h('label', { className: 'calc-chk' }, h('input', { type: 'checkbox', checked: !!st.incl, onChange: e => { const c = e.target.checked; upd(s => { s.incl = c; }); } }),
      h('span', null, 'My spreading rates already include application loss. Use no extra loss.')) : null,
    h('p', { className: 'calc-foot' }, 'Sources: ', (CALC_SOURCES[kind] || []).map((s, i) => s[1] ? h('a', { key: i, href: s[1], target: '_blank', rel: 'noopener noreferrer' }, s[0] + (i < CALC_SOURCES[kind].length - 1 ? ', ' : '.')) : h('span', { key: i }, s[0]))),
    h('p', { className: 'calc-foot' }, 'Team typical is the median of what estimators used on their CEs, newest 30.'));

  /* lines */
  let total = 0, allow = 0, unpriced = 0;
  const lineRows = lines.map(l => {
    const p = priceFor ? priceFor(l.d) : null;
    if (p == null) unpriced++; else { total += l.q * p; allow += (l.raw - l.net) * p; }
    return h('tr', { key: l.k },
      h('td', null, l.d), h('td', { className: 'n' }, l.q), h('td', null, l.u),
      h('td', { className: 'n' }, p == null ? '-' : calcF(p, 0)), h('td', { className: 'n' }, p == null ? '-' : calcF(l.q * p, 0)));
  });
  const linesSec = h('section', { style: C.sec },
    h('h3', { style: C.h3 }, 'Lines for Materials'),
    h('div', { className: 'calc-tw' }, h('table', { className: 'calc-tbl' },
      h('thead', null, h('tr', null, ['Description', 'Qty', 'UOM', 'Unit price', 'Amount'].map((t, i) => h('th', { key: t, className: i > 0 && i !== 2 ? 'n' : '' }, t)))),
      h('tbody', null, lineRows))),
    h('p', { className: 'calc-foot' },
      unpriced ? unpriced + ' line' + (unpriced === 1 ? ' has' : 's have') + ' no price on the Masterlist yet. Its unit cost is left at 0 for you to fill in. ' : '',
      total ? 'Of which allowance: about ₱' + calcF(allow, 0) + '. ' : '',
      st.jobs.length > 1 ? 'Added across ' + st.jobs.length + ' jobs and rounded up once.' : ''));

  /* the jobs strip */
  const kdef = CALC_KINDS.find(k => k.id === kind);
  const jobsRow = h('div', { className: 'calc-jobs' },
    st.jobs.map((j, i) => h('button', { key: i, className: 'calc-job', 'aria-pressed': i === st.act, onClick: () => upd(s => { s.act = i; }) }, j.name,
      st.jobs.length > 1 ? h('i', { role: 'button', 'aria-label': 'Remove ' + j.name, onClick: e => { e.stopPropagation(); upd(s => { s.jobs.splice(i, 1); s.act = Math.min(s.act, s.jobs.length - 1); }); } }, '×') : null)),
    h('button', { className: 'calc-addjob', onClick: () => upd(s => { const copy = JSON.parse(JSON.stringify(s.jobs[s.act])); copy.name = kdef.job + ' ' + (s.jobs.reduce((m, j) => Math.max(m, parseInt(String(j.name).replace(/\D+/g, ''), 10) || 0), 0) + 1); s.jobs.push(copy); s.act = s.jobs.length - 1; }) }, '+ Add another ' + kdef.job.toLowerCase()));

  return h('aside', { className: 'calc-drawer' + (page ? ' calc-page' : ''), 'aria-label': 'Quantity calculators' },
    h('div', { className: 'calc-hd' },
      h('b', { style: { fontSize: 14, flex: 1 } }, 'Quantity calculators'),
      h('div', { className: 'calc-tabs', role: 'tablist' }, CALC_KINDS.map(k => h('button', { key: k.id, role: 'tab', 'aria-selected': k.id === kind, onClick: () => setTab(k.id) }, k.label))),
      page ? null : h('button', { className: 'calc-x', 'aria-label': 'Close calculators', onClick: onClose }, '×')),
    h('div', { className: 'calc-bd' },
      jobsRow,
      h('section', { style: C.sec }, h('h3', { style: C.h3 }, 'Inputs'), inputs),
      h('section', { style: C.sec }, h('h3', { style: C.h3 }, 'Results for this job'), results),
      unitsSec, consSec, cutSec, layoutSec, rows.length ? allowSec : null, linesSec),
    h('div', { className: 'calc-ft' },
      h('div', { style: { flex: 1, fontSize: 11, color: 'var(--text-secondary)' } }, 'Lines total',
        h('b', { style: { display: 'block', fontSize: 15, color: 'var(--brand-accent)', ...C.mono } }, total ? '₱' + calcF(total, 0) : '-')),
      h('button', { className: 'calc-add', disabled: !lines.length || sharesOff,
        title: sharesOff ? 'The consumable shares must add up to 100%' : '',
        onClick: () => onAdd(lines.map(l => ({ k: l.k, desc: l.d, qty: l.q, uom: l.u })), kind, calcUsed(kind, st)) },
        'Add ' + lines.length + (lines.length === 1 ? ' line' : ' lines') + ' to Materials')));
}
