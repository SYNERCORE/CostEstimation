#!/usr/bin/env node
/*
 * The optional Scope Breakdown on the generated CE: each main scope item with its sub-items as A, B, C beside the manpower, tools,
 * consumables, PPE and miscellaneous linked to it -- names, quantities, units, never an amount. Long lists are cut into blocks so a
 * merged scope cell is never split by a page break; the landscape page and the Excel sheet are built from the same blocks.
 * Run: node tools/test-scope-breakdown.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const ce = fs.readFileSync('src/components/CeOutput.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
const sum = fs.readFileSync('src/components/SummaryTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = ce.indexOf('const SB_KEYS'), b = ce.indexOf('function makeHandleGenerateCE');
if (a < 0 || b < 0) { console.error('helpers not found'); process.exit(1); }
const ctx = vm.createContext({ Math, Number, String, Array });
vm.runInContext(ce.slice(a, b) + '\nthis.sbChunks=sbChunks;this.sbHtml=sbHtml;this.sbSheet=sbSheet;', ctx);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const br = { bar: '#000', text: '#fff' };

const mk = n => Array.from({ length: n }, (_, i) => ({ d: 'Item ' + i, q: i + 1, u: 'PC' }));
const sb = {
  groups: [
    { no: 1, title: 'Blasting', subs: ['Prep', 'Blast', 'Paint'], cols: { mp: [{ d: 'Blaster', q: 2, u: 'PAX' }], tools: mk(3), mats: [], ppe: [], misc: [] } },
    { no: 2, title: 'Welding', subs: [], cols: { mp: mk(30), tools: [], mats: [], ppe: [], misc: [] } }
  ],
  unlinked: { mp: [], tools: [{ d: 'Orphan', q: 1, u: 'EA' }], mats: [], ppe: [], misc: [] }
};
const ch = ctx.sbChunks(sb, 14);
ck('a short task is one block; a 30-line task is cut into 3 blocks of at most 14 lines', ch.length === 1 + 3 + 1 && ch.slice(1, 4).every(c => c.rows.length <= 14) && ch[1].rows.length === 14 && ch[3].rows.length === 2, JSON.stringify(ch.map(c => c.rows.length)));
ck('a later block of a long task says (continued) and repeats no sub-items', ch[2].cont === true && ch[2].subs.length === 0 && ch[1].cont === false);
ck('resources linked to no task come last under their own heading', ch[ch.length - 1].title === 'NOT LINKED TO A TASK');
ck('no data at all gives no blocks', ctx.sbChunks({ groups: [], unlinked: null }, 14).length === 0);

const html = ctx.sbHtml(sb, br, esc);
ck('printed table has the five column groups and the scope column', ['SCOPE OF WORK', 'MANPOWER', 'TOOLS AND EQUIPMENT', 'CONSUMABLES', 'PPE', 'MISCELLANEOUS'].every(t => html.includes(t)));
ck('sub-items are lettered A. B. C.', html.includes('A. Prep') && html.includes('B. Blast') && html.includes('C. Paint'));
ck('header rows are marked to repeat on every page', (html.match(/<tr class="rep"/g) || []).length === 2);
ck('each block starts on a data-start row and its rows carry data-grp (page breaks fall between blocks)', (html.match(/data-start="1"/g) || []).length === ch.length && (html.match(/data-grp="1"/g) || []).length === ch.reduce((n, c) => n + c.rows.length, 0));
ck('quantity and unit are printed, no peso sign', html.includes('>2<') && html.includes('PAX') && !/₱|P\d/.test(html));
ck('text is escaped', ctx.sbHtml({ groups: [{ no: 1, title: 'A<b>', subs: [], cols: { mp: [], tools: [], mats: [], ppe: [], misc: [] } }] }, br, esc).includes('A&lt;b>'));

const sh = ctx.sbSheet(sb, { name: 'ACME', ceNum: 'X-1', ceType: 'ONSITE', date: '2026-10-14' });
ck('Excel sheet is named SCOPE BREAKDOWN with 16 columns', sh.name === 'SCOPE BREAKDOWN' && sh.cols.length === 16);
ck('every row fits those columns', sh.rows.every(r => r.length <= 16));
ck('scope cells are merged down their block and the heading is merged over two rows', sh.merges.includes('A5:A6') && sh.merges.some(m => /^A\d+:A\d+$/.test(m) && m !== 'A5:A6'), JSON.stringify(sh.merges));
ck('quantities are numbers in the sheet', sh.rows.some(r => r.some(c => c && typeof c.v === 'number')));

ck('App.js builds scopeBreakdown from the scope tree and passes it to all three exporters', /const scopeBreakdown = \(\(\) =>/.test(app) && (app.match(/scopeBreakdown, servicesSummary/g) || []).length >= 3);
ck('it is off unless the CE asks for it (info.showScopeBreakdown)', app.includes('on: !!info.showScopeBreakdown && hasAny'));
ck('Summary tab has the per-CE checkbox', sum.includes('info.showScopeBreakdown') && sum.includes('Scope breakdown on this CE'));
ck('printed page is landscape and added to the document', ce.includes('@page land{size:A4 landscape;margin:0}') && ce.includes('data-land="1"') && ce.includes('${sbPage}'));
ck('both Excel exporters add the sheet before amounts are stripped', (ce.match(/sheets\.push\(sbSheet\(/g) || []).length === 2);


/* CE Monitoring's "with Scope Breakdown" box adds it to a CE that was saved without it */
vm.runInContext('this.sbWanted=sbWanted', ctx);
const mon = fs.readFileSync('src/components/MonitoringPanel.js', 'utf8');
ck('one print can ask for it: off CE + withScope + data -> on', ctx.sbWanted({ on: false, groups: [{}], unlinked: null }, { withScope: true }) === true);
ck('without the ask, an off CE stays off; an on CE stays on', ctx.sbWanted({ on: false, groups: [{}], unlinked: null }, {}) === false && ctx.sbWanted({ on: true, groups: [{}] }, undefined) === true);
ck('nothing to show means nothing printed even when asked', ctx.sbWanted({ on: false, groups: [], unlinked: null }, { withScope: true }) === false);
ck('CE Monitoring has the box, remembered in the browser, and it adds sb=1 to the print URL', mon.includes('with Scope Breakdown') && mon.includes('shic_print_sb') && app.includes("'&sb=1'") && app.includes("_q.get('sb') === '1'"));
ck('the flag reaches the CE, no-amounts CE and both Excel exports', (app.match(/withScope: !!autoPrint.sb/g) || []).length >= 5);

/* the real workbook writer, read back */
(async () => {
  const XLSX = require('../vendor/xlsx.full.min.js');
  const g = {}; vm.runInContext(fs.readFileSync('src/xlsx-styled.js', 'utf8'), vm.createContext({ window: g, Blob, Uint8Array, TextEncoder, Math, String, Array, Object, Number, Date, JSON, URL }));
  const blob = g.SHICXlsx.build([sh], {});
  const wb = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: 'buffer' });
  const ws = wb.Sheets['SCOPE BREAKDOWN'];
  ck('the workbook opens and has the SCOPE BREAKDOWN sheet', !!ws);
  ck('merged scope cells survive the write', ws && (ws['!merges'] || []).length >= sh.merges.length, JSON.stringify(ws && ws['!merges']));
  const txt = XLSX.utils.sheet_to_csv(ws);
  ck('names, quantities and units are in the file', txt.includes('Blaster') && txt.includes('PAX') && txt.includes('NOT LINKED TO A TASK'));
  console.log(bad ? bad + ' FAILURE(S)' : 'Scope breakdown OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
