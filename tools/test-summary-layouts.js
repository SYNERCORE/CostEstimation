/* Electrical does not write its CE summary the way Mechanical does. On
   SY3-F-ACF-009 the manpower section carries no figure of its own: C.1 to C.6
   are the six shifts, C.7 is what is paid on top of them, and reading down the
   TOTAL COST column adds those seven to reach C -- the section line itself is
   blank. Mechanical keeps the section's figure in that column and sets its
   parts beside it.

   Both arrangements exist for one reason, and it is the same reason the
   Miscellaneous breakdown was moved out of the column in build 277: every
   cost must appear in TOTAL COST exactly once. This file runs the shipped
   row-building loop under both layouts and adds the column up.

   It also holds the other promise: a CE that does not opt in prints exactly
   as it did before the layouts existed. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + what); if (!cond) bad++; };

const app = R('src/App.js');
const cfg = R('src/config.js');
const help = R('src/helpers.js');

console.log('CE SUMMARY layouts');

/* ---- which layout a CE gets ---- */
const SHIFTS = {
  regular_day: { label: 'Regular day' }, regular_night: { label: 'Regular night' },
  sunday_day: { label: 'Sunday day' }, sunday_night: { label: 'Sunday night' },
  holiday_day: { label: 'Holiday day' }, holiday_night: { label: 'Holiday night' }
};
const conf = new Function('SHIFTS',
  cfg.slice(cfg.indexOf('const SUMMARY_LAYOUTS = {'), cfg.indexOf('const CE_TABS')) +
  '\nreturn { SUMMARY_LAYOUTS, summaryLayoutKey, mpShiftLabel, MP_BENEFITS_LABEL };')(SHIFTS);
const key = conf.summaryLayoutKey;

ck('an Electrical CE gets the electrical sheet', key({ projType: 'Electrical' }) === 'elec');
ck('a Mechanical CE gets the mechanical one', key({ projType: 'Mechanical' }) === 'mech');
ck('so does every other discipline', key({ projType: 'Civil' }) === 'mech');
/* The CE's own choice outranks its discipline, both ways -- an electrical job
   quoted on the mechanical sheet is a real request, not a mistake. */
ck('a CE that has chosen overrides the discipline',
  key({ projType: 'Mechanical', sumFmt: 'elec' }) === 'elec' &&
  key({ projType: 'Electrical', sumFmt: 'mech' }) === 'mech');
ck('and a CE saved before any of this existed falls to the mechanical sheet',
  key({}) === 'mech' && key(undefined) === 'mech');

/* ---- the six shifts are the six shifts ---- */
ck('every shift has a line of its own on the electrical sheet',
  Object.keys(SHIFTS).every(k => conf.mpShiftLabel(k) && conf.mpShiftLabel(k) !== k));
ck('and there are six of them, so C.1 to C.6 is the whole of the wage',
  Object.keys(SHIFTS).length === 6);
ck('with what is paid on top of them as the seventh', !!conf.MP_BENEFITS_LABEL);

/* ---- the wage and the benefits re-add to the row ---- */
const hp = new Function('N', 'SHIFTS',
  (help.match(/const OT_MULT_DEFAULT[\s\S]*?\nfunction toolRowTotal\(row, kwhRate, src, powerFrac\) \{[\s\S]*?\n\}/) || [''])[0] + '\n' +
  (help.match(/function ceMpRowParts\(r, rates, ceType\) \{[\s\S]*?\nfunction ceMpRowCost\(r, rates, ceType\) \{[\s\S]*?\n\}/) || [''])[0] +
  '\nreturn { ceMpRowParts, ceMpRowCost };')(v => parseFloat(v) || 0, SHIFTS);

let worst = 0;
[['regular_day', 2, 8, 550, 0], ['regular_night', 1, 6, 620, 2], ['sunday_day', 3, 2, 700, 4],
 ['holiday_night', 1, 1, 900, 8], ['regular_day', 5, 30, 480, 1.5]].forEach(([shift, pax, days, rate, otHours]) => {
  const r = { role: 'TECHNICIAN', shift, pax, days, rate, otHours, perDiem: 350 };
  const p = hp.ceMpRowParts(r, null, 'onsite');
  worst = Math.max(worst, Math.abs(p.wage + p.benefits - hp.ceMpRowCost(r, null, 'onsite')));
});
ck('the wage and the benefits add back to the row exactly (gap ' + worst + ')', worst === 0);
ck('a blank row costs nothing in either half',
  hp.ceMpRowParts({}, null, 'onsite').wage === 0 && hp.ceMpRowParts({}, null, 'onsite').benefits === 0);

/* One row off his own sheet: 2 pax x 8 days x P550 on a regular day shift,
   no overtime. C.1 must read the plain wage -- 8,800 -- with every statutory
   item on it sitting in C.7 instead, and the two together still being the row.
   What C.7 itself comes to is tools/test-recompute.js's business; what matters
   here is that not one centavo of it has leaked into C.1. */
const his = hp.ceMpRowParts({ role: 'HVAC TECHNICIAN', shift: 'regular_day', pax: 2, days: 8, rate: 550, otHours: 0 }, null, 'onsite');
ck('a real row puts the plain wage in C.1 (' + his.wage.toFixed(2) + ')', Math.abs(his.wage - 8800) < 0.005);
ck('and everything paid on top of it in C.7 (' + his.benefits.toFixed(2) + ')',
  his.benefits > 0 && Math.abs(his.wage + his.benefits - hp.ceMpRowCost({ role: 'HVAC TECHNICIAN', shift: 'regular_day', pax: 2, days: 8, rate: 550, otHours: 0 }, null, 'onsite')) === 0);

/* ---- the shipped loop, run under both layouts ---- */
const START = 'ceSections.filter(x => x.v > 0).forEach(x => {';
const at = app.indexOf(START);
const endAt = app.indexOf("sum.push([S('', 'totlbl'), S('TOTAL AMOUNT:'", at);
const loop = app.slice(at, app.lastIndexOf('});', endAt) + 3);
ck('the summary loop is where it was', at > 0 && loop.length > 100);

const TOTAL_COL = 6;
const SUB_COL = 5;
const sections = [
  { letter: 'A.', printLabel: 'MOBILIZATION', v: 10040.00 },
  { letter: 'B.', printLabel: 'DEMOBILIZATION', v: 10040.00 },
  { letter: 'C.', printLabel: 'MANPOWER COST', v: 103668.17 },
  { letter: 'D.', printLabel: 'TOOLS AND EQUIPMENTS', v: 11658.00 },
  { letter: 'E.', printLabel: 'MATERIALS AND CONSUMABLES', v: 18500.00 },
  { letter: 'F.', printLabel: 'PERSONAL PROTECTIVE EQUIPMENT', v: 1865.50 },
  { letter: 'G.', printLabel: 'MISCELLANEOUS', v: 19406.67 }
];
const GRAND = 175178.34;
/* C split seven ways, and G two, as the CE itself would split them. */
const MP_PARTS = [
  { letter: 'C.1', label: 'REGULAR MANPOWER COST (DAY SHIFT)', v: 61200.00 },
  { letter: 'C.2', label: 'REGULAR MANPOWER COST (NIGHT SHIFT)', v: 18400.00 },
  { letter: 'C.3', label: 'SUNDAY & NON-WORKING MANPOWER COST (DAY SHIFT)', v: 7900.00 },
  { letter: 'C.4', label: 'BENEFITS & OTHERS', v: 16168.17 }
];
const MISC_PARTS = [
  { letter: 'G.1', label: 'ACCOMMODATION', v: 19200.00 },
  { letter: 'G.2', label: 'REQUIREMENTS', v: 206.67 }
];

const run = (layout, breakdown) => {
  const sum = [];
  new Function('ceSections', 'sum', 'ceBreakdown', 'ceLayout', 'S', 'N', loop)(
    sections, sum, breakdown, layout,
    (v, s, span) => ({ v: v, s: s, span: span }),
    v => (typeof v === 'number' && isFinite(v) ? v : 0));
  return sum;
};
const colSum = (rows, col) => rows.reduce((t, r) =>
  t + ((r[col] && typeof r[col].v === 'number') ? r[col].v : 0), 0);

/* -- Electrical: the parts carry the figures, the section line is blank -- */
const elec = run(conf.SUMMARY_LAYOUTS.elec,
  { 'MANPOWER COST': MP_PARTS, MISCELLANEOUS: MISC_PARTS });
const elecCol = colSum(elec, TOTAL_COL);
ck('ELECTRICAL: reading down TOTAL COST gives the total and nothing else (' +
  elecCol.toFixed(2) + ' vs ' + GRAND.toFixed(2) + ')', Math.abs(elecCol - GRAND) < 0.005);
ck('C.1 to C.7 add up to C itself',
  Math.abs(MP_PARTS.reduce((t, p) => t + p.v, 0) - 103668.17) < 0.005);
const cLine = elec.find(r => r[1] && r[1].v === 'MANPOWER COST');
ck('and C itself is left blank, because its parts are below it', cLine[TOTAL_COL].v === '');
ck('a section with no parts still carries its own figure',
  elec.find(r => r[1] && r[1].v === 'MOBILIZATION')[TOTAL_COL].v === 10040.00);
ck('nothing is written into the subordinate column on this sheet',
  colSum(elec, SUB_COL) === 0);
ck('the parts read as items, in capitals, as the form has them',
  elec.filter(r => /C\.\d/.test(String((r[1] || {}).v || '')))
    .every(r => r[1].s === 'td' && r[1].v === r[1].v.toUpperCase()));

/* -- Mechanical: unchanged from build 277 -- */
const mech = run(conf.SUMMARY_LAYOUTS.mech, { MISCELLANEOUS: MISC_PARTS });
const mechCol = colSum(mech, TOTAL_COL);
ck('MECHANICAL: the column still gives the total and nothing else (' +
  mechCol.toFixed(2) + ')', Math.abs(mechCol - GRAND) < 0.005);
ck('and manpower is not broken down at all on this sheet',
  conf.SUMMARY_LAYOUTS.mech.breaks.indexOf('mp') < 0 &&
  !mech.some(r => /C\.\d/.test(String((r[1] || {}).v || ''))));
ck('its Miscellaneous parts are still set beside the line, saying "of which"',
  mech.filter(r => String((r[1] || {}).v || '').indexOf('of which') >= 0).length === MISC_PARTS.length);
ck('with their amounts in the subordinate column, not the total one',
  Math.abs(colSum(mech, SUB_COL) - 19406.67) < 0.005);

/* Byte-for-byte: a CE that has not opted in must print what it printed. */
const before = JSON.stringify(run({ parentCarries: true, breaks: ['misc'] }, { MISCELLANEOUS: MISC_PARTS }));
ck('a CE that does not opt in produces the identical sheet', JSON.stringify(mech) === before);

/* ---- the breakdown is built once, not once per renderer ---- */
const memo = app.slice(app.indexOf('const ceBreakdown = useMemo(() => {'), app.indexOf('}, [ceSections, ceLayout'));
ck('a part that costs nothing gets no line', memo.indexOf('items.filter(x => N(x.v) > 0)') > 0);
ck('and a section that costs nothing is not broken down either',
  /x\.printLabel === printLabel && x\.v > 0/.test(memo));
ck('the shifts come from SHIFTS, so one added there appears here',
  /Object\.keys\(SHIFTS\)\.map/.test(memo));
ck('the wage comes from mpWage and the benefits from ben -- the same values the total is built from',
  /mpWage\(r\)/.test(memo) && /v: ben/.test(memo));
ck('all four renderers read the one breakdown',
  (app.match(/ceBreakdown\[x\.printLabel\]/g) || []).length >= 3);

/* ---- and the estimator can choose ---- */
ck('the Summary tab offers the choice', app.indexOf('Summary sheet:') > 0);
ck('which is stored on the CE, so it is saved and reprinted with it',
  /setInfo\(p => \(\{ \.\.\.p, sumFmt: k \}\)\)/.test(app) || /sumFmt: k/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE SUMMARY layouts OK');
process.exit(bad ? 1 : 0);
