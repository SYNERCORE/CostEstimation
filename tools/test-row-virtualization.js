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
ck('spacer rows keep the scroll height', t.indexOf('height: _from * _rowH.current') > 0 && t.indexOf('(_list.length - _to) * _rowH.current') > 0);
ck('row numbers stay the real position', t.indexOf('_ix + 1') > 0);
ck('a just-added row stays drawn to take focus', t.indexOf('_list.findIndex(x => x.r.id === _rtNewId)') > 0);
ck('scroll listener is captured and removed', t.indexOf("addEventListener('scroll', kick, true)") > 0 && t.indexOf("removeEventListener('scroll', kick, true)") > 0);
ck('the window is derived from the measured row height', t.indexOf('_rowH.current = tr.offsetHeight') > 0);
/* the window arithmetic, as shipped */
const m = (top, h, vh, n, over) => ({ a: Math.max(0, Math.floor(-top / h) - over), b: Math.min(n, Math.ceil((vh - top) / h) + over) });
const w = m(-4400, 44, 800, 700, 12);
ck('scrolled 100 rows down draws ~ rows 88..131', w.a === 88 && w.b === 131);
ck('at the top draws the first screen only', m(100, 44, 800, 700, 12).b < 40);
if (bad) process.exit(1);
/* Switching tabs: the Masterlist suggestion list is built on first focus, not on every visit. */
const t2 = t;
let b2 = 0;
const c2 = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) b2++; };
c2('the suggestion list is built only after an input is focused', t2.indexOf('const _dlEl = React.useMemo(() => _dlOn ?') > 0 && t2.indexOf("onFocusCapture: _dlOn ? undefined") > 0);
c2('and is kept, not rebuilt per render', t2.indexOf('[_dlOn, masterlist, mlType]);') > 0);
if (b2) process.exit(1);
/* SOW Breakdown: past 150 resources the task cards start closed. */
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
let b3 = 0;
const c3 = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) b3++; };
c3('big CEs open the SOW Breakdown with cards closed', app.indexOf('> 150;') > 0 && app.indexOf('const _sbOpen = id => sbCollapsed[id] === undefined ? !_sbBig : !sbCollapsed[id];') > 0);
c3('the card and the Collapse/Expand all button agree', app.indexOf('const open = _sbOpen(it.id);') > 0 && app.indexOf('n[it.id] = allOpen;') > 0 && app.indexOf('!sbCollapsed[it.id]') < 0);
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
