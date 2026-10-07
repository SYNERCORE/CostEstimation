/* Tools, split the way the electrical team already splits them.
   ============================================================
   Their summary sheet has always read D.1 COMMON TOOLS, D.2 ELECTRICAL
   EQUIPMENTS, D.3 FACILITIES, and the app printed one undivided TOOLS AND
   EQUIPMENTS line, so the sheet was finished by hand every time.

   The grouping is a property of the masterlist item and rides onto the CE row
   when the item is added, exactly as the tier figures do -- so a later edit to
   the masterlist cannot re-group a CE that has already been quoted.

   Two things have to hold or the printed sheet is wrong rather than merely
   plain. The parts must add up to the section: the client reads down TOTAL
   COST, and three buckets that sum to something other than TOOLS AND
   EQUIPMENTS is a sheet that does not add up. And an ungrouped row must land
   somewhere -- silently dropping the rows nobody has classified yet would
   understate the CE, and every row is ungrouped on the day this ships.

   Run: node tools/test-tool-groups.js */
'use strict';
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = require('./lib/appsrc').plus(R('src/App.js'));
const cfg = R('src/config.js');
const tab = R('src/components/ResTab.js');
const db = R('src/db.js');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const NL = String.fromCharCode(10);
const near = (a, b) => Math.abs(a - b) < 0.005;

/* The real constants and the real resolver. */
const C = new Function(
  cfg.slice(cfg.indexOf('const TOOL_GROUPS = ['), cfg.indexOf('const CE_TABS=')) +
  NL + 'return { TOOL_GROUPS, TOOL_GROUP_DEFAULT, toolGroupOf, toolGroupLabel };')();

console.log('which bucket a row prints under:');
ck('a row that names one is in it', C.toolGroupOf({ group: 'facility' }) === 'facility');
/* Every row in every CE that exists is this case. */
ck('a row that names none is a common tool', C.toolGroupOf({}) === 'common');
ck('and so is a row that names an empty one', C.toolGroupOf({ group: '' }) === 'common');
/* A bucket removed from the list later must not take rows with it. */
ck('a row naming a bucket that does not exist is not lost',
  C.toolGroupOf({ group: 'scaffolding' }) === 'common');
ck('case and spacing do not decide it',
  C.toolGroupOf({ group: '  Equipment ' }) === 'equipment');
ck('the three buckets are the ones the sheet prints',
  C.TOOL_GROUPS.map(g => g.t).join(' | ') === 'COMMON TOOLS | ELECTRICAL EQUIPMENTS | FACILITIES',
  C.TOOL_GROUPS.map(g => g.t).join(' | '));

/* The grouping, run exactly as ceBreakdown runs it. */
const split = (rows, qF) => {
  const byGroup = {};
  rows.forEach(r => { const k = C.toolGroupOf(r); byGroup[k] = (byGroup[k] || 0) + r.cost; });
  return C.TOOL_GROUPS.map(g => ({ label: g.t, v: (byGroup[g.k] || 0) * (qF || 1) }));
};

console.log(NL + 'and the parts add up to the section:');
const rows = [
  { desc: 'Multimeter', group: 'common', cost: 1200.55 },
  { desc: 'Hand tools', cost: 349.47 },                      /* ungrouped */
  { desc: 'Cable puller', group: 'equipment', cost: 13919.04 },
  { desc: 'Site office', group: 'facility', cost: 12050.24 },
  { desc: 'Megger', group: 'equipment', cost: 0 }
];
const toolsT = rows.reduce((s, r) => s + r.cost, 0);
let parts = split(rows);
ck('the three parts sum to the section total',
  near(parts.reduce((s, p) => s + p.v, 0), toolsT),
  parts.reduce((s, p) => s + p.v, 0) + ' vs ' + toolsT);
/* The row nobody has classified is the whole reason this cannot drop rows. */
ck('an ungrouped row is counted, under common tools',
  near(parts[0].v, 1200.55 + 349.47), parts[0].v);
ck('each bucket carries its own rows',
  near(parts[1].v, 13919.04) && near(parts[2].v, 12050.24),
  parts[1].v + ' / ' + parts[2].v);
/* A CE with nothing classified still totals correctly -- it just prints one
   part with everything in it, which is what the sheet looked like before. */
parts = split(rows.map(r => ({ desc: r.desc, cost: r.cost })));
ck('a CE with nothing grouped puts it all in one bucket',
  near(parts[0].v, toolsT) && parts[1].v === 0 && parts[2].v === 0, parts[0].v);
/* The quantity multiplies the section, so it has to multiply the parts. */
parts = split(rows, 3);
ck('the parts follow the quantity, as the section does',
  near(parts.reduce((s, p) => s + p.v, 0), toolsT * 3));

console.log(NL + 'where the grouping is set, and how it travels:');
ck('the Electrical sheet asks for the tools break',
  /elec:.*breaks: \['mp', 'tools', 'misc'\]/.test(cfg));
/* Mechanical prints its tools as one line and always has. */
ck('the Mechanical sheet is left as it was',
  /mech:.*breaks: \['misc'\]/.test(cfg));
ck('the masterlist carries it as a column',
  app.indexOf("'Item Code', 'Category', 'Description', 'Cost (P)', 'UOM', 'Group',") > 0);
/* Headings and cells are two lists that have to stay the same length -- this
   is what once put a delete button under "Unit Price". */
ck('and the template writes the same column in the same place',
  app.indexOf("['code', 'category', 'desc', 'cost', 'uom', 'group',") > 0);
ck('it rides onto the CE row when the item is added',
  tab.indexOf('if (it.group) out.group = String(it.group);') > 0);
/* Re-pricing is asked for; re-grouping is not, and afterwards the two would
   be indistinguishable. */
ck('but Sync Rates does not overwrite a grouping set on the CE',
  app.indexOf('if (f.group && !r.group) n.group = f.group;') > 0);
/* shicSrc is an existing JSON column, so no site has to be repaired first. */
ck('it is saved in a column that already exists',
  /\['unitPrice','serviceLife','projectsPerYear','maintPerYear','group'\]/.test(db));
ck('a row typed straight onto the CE can be grouped too',
  tab.indexOf("{ ...x, group: e.target.value || undefined }") > 0);
/* An unrecognised cell must leave the field alone rather than guess. */
ck('an import only sets it when the sheet actually said so',
  app.indexOf("if (rk.group !== undefined && String(rk.group).trim() !== '') {") > 0);

console.log(bad ? NL + bad + ' FAILURE(S)' : NL + 'tool groups OK');
process.exit(bad ? 1 : 0);
