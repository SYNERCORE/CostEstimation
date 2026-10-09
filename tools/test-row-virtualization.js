/* Long lists draw only the rows near the screen.
   Run: node tools/test-row-virtualization.js */
'use strict';
const fs = require('fs'), path = require('path');
const t = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ResTab.js'), 'utf8');
let bad = 0;
const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };
ck('rows are filtered once into _list', t.indexOf('const _list = rows.map((r, _ix) => ({ r, _ix })).filter(x => _hit(x.r));') > 0);
ck('short lists are drawn whole (threshold)', t.indexOf('const _VMIN = 60') > 0 && t.indexOf('_list.length > _VMIN') > 0);
ck('the table body draws only the window', t.indexOf('_vis.top, _vis.items.map(({ r, _ix }) => {') > 0 && t.indexOf('}), _vis.bot)))') > 0);
ck('spacer rows keep the scroll height, summed from the real row heights', t.indexOf('height: _hSum(0, _from)') > 0 && t.indexOf('height: _hSum(_to, _list.length)') > 0);
ck('row numbers stay the real position', t.indexOf('_ix + 1') > 0);
ck('a just-added row stays drawn to take focus', t.indexOf('_list.findIndex(x => x.r.id === _rtNewId)') > 0);
ck('scroll listener is captured and removed', t.indexOf("addEventListener('scroll', kick, true)") > 0 && t.indexOf("removeEventListener('scroll', kick, true)") > 0);
ck('every drawn row is measured and remembered by id, not the first row for all', t.indexOf("tr.getAttribute('data-rid')") > 0 && t.indexOf('_hMap.current[id] = hh') > 0 && t.indexOf('"data-rid": r.id') > 0);
ck('rows are re-measured after every draw, so a row that changes height is noticed', t.indexOf('useEffect(() => { if (_kickRef.current) _kickRef.current(); });') > 0);
/* the window arithmetic, as shipped: walk the real heights from the table's top */
const win = (top, hs, vh, over) => {
  let y = top, first = -1, last = hs.length;
  for (let i = 0; i < hs.length; i++) { if (first < 0 && y + hs[i] > 0) first = i; if (y >= vh) { last = i; break; } y += hs[i]; }
  if (first < 0) first = Math.max(0, hs.length - 1);
  return { a: Math.max(0, first - over), b: Math.min(hs.length, last + over) };
};
const uniform = Array(700).fill(44);
const w = win(-4400, uniform, 800, 12);
ck('scrolled 100 rows down draws ~ rows 88..131', w.a === 88 && w.b === 131);
ck('at the top draws the first screen only', win(100, uniform, 800, 12).b < 40);
/* The reported glitch: rows of two heights (taller where "+ Add to Masterlist" shows). A window worked out from ONE row's height
   for all of them misses the screen; one worked out from each row's own height covers it, wherever the page is scrolled. */
const mixed = Array.from({ length: 220 }, (_, i) => i % 3 ? 60 : 44);
const total = mixed.reduce((x, y) => x + y, 0);
let covers = true, oldMisses = 0;
for (let sc = 0; sc <= total; sc += 137) {
  const top = -sc, vh = 768, ww = win(top, mixed, vh, 12);
  let y = top, firstVis = -1, lastVis = -1;
  mixed.forEach((h, i) => { if (y + h > 0 && y < vh) { if (firstVis < 0) firstVis = i; lastVis = i; } y += h; });
  if (firstVis >= 0 && !(ww.a <= firstVis && ww.b > lastVis)) covers = false;
  const h0 = 44, oa = Math.max(0, Math.floor(-top / h0) - 12), ob = Math.min(220, Math.ceil((vh - top) / h0) + 12);
  if (firstVis >= 0 && !(oa <= firstVis && ob > lastVis)) oldMisses++;
}
ck('with rows of two heights the drawn window always covers what is on screen', covers);
ck('(the old one-height window missed the screen at ' + oldMisses + ' scroll positions of the same list)', oldMisses > 0);
if (bad) process.exit(1);
/* Switching tabs: the Masterlist suggestion list is built on first focus, not on every visit. */
const t2 = t;
let b2 = 0;
const c2 = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) b2++; };
c2('the suggestion list is built only after an input is focused', t2.indexOf('const _dlEl = React.useMemo(() => _dlOn ?') > 0 && t2.indexOf("onFocusCapture: _dlOn ? undefined") > 0);
c2('and is kept, not rebuilt per render', t2.indexOf('[_dlOn, masterlist, mlType]);') > 0);
if (b2) process.exit(1);
/* SOW Breakdown: past 150 resources the task cards start closed. */
const app = require('./lib/appsrc').plus(fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8'));
let b3 = 0;
const c3 = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) b3++; };
c3('big CEs open the SOW Breakdown with cards closed', app.indexOf('> 150;') > 0 && app.indexOf('const _sbOpen = id => sbCollapsed[id] === undefined ? !_sbBig : !sbCollapsed[id];') > 0);
c3('the card and the Collapse/Expand all button agree', app.indexOf('const open = inSplit ? true : _sbOpen(it.id);') > 0 && app.indexOf('n[it.id] = allOpen;') > 0 && app.indexOf('!sbCollapsed[it.id]') < 0);
const sbOpen = (big, c, id) => c[id] === undefined ? !big : !c[id];
c3('a card the user opened stays open on a big CE', sbOpen(true, { a: false }, 'a') === true && sbOpen(true, {}, 'a') === false);
c3('small CEs are unchanged (open by default)', sbOpen(false, {}, 'a') === true);
if (b3) process.exit(1);
/* SOW Breakdown: a task with hundreds of rows draws a page at a time; suggestions built on focus. */
let b4 = 0;
const c4 = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) b4++; };
c4('a task group draws a page of rows, not all of them', app.indexOf('rows.slice(0, _lim).map(r =>') > 0 && app.indexOf('const SB_PAGE = 100;') > 0);
c4('and says how many it holds back, with Show more / Show all', app.indexOf("'Showing ' + lim + ' of ' + n") > 0 && app.indexOf("'Show all'") > 0 && app.indexOf('_moreRow(rows.length, _lim, taskId') > 0);
c4('Masterlist suggestions are built on first focus, not per group per render',
  app.indexOf("sbDlOn && /*#__PURE__*/React.createElement(\"datalist\", { id: 'sb_ml_' + t.ml }") > 0 && app.split('onFocusCapture: sbDlOn ? undefined').length - 1 === 2);
if (b4) process.exit(1);
