/* What a long tab costs to open.
   =============================
   Every description box on a CE offers the Masterlist as suggestions. Each row
   used to carry its OWN copy of that list, and the copies are identical -- so
   opening a tab of 400 lines against a Masterlist of 1,500 items built 600,000
   <option> elements before a single row appeared. That is what made moving
   between tabs stall on a big CE.

   A datalist is shared by id, so one per table is enough.

   The guard here is a shape guard, and it has to be: the cost is a browser
   cost, not something a node test can time. So it asserts that no suggestion
   list is keyed by a ROW -- an id built from r.id is one list per line, and
   the next one somebody adds that way will fail this test rather than reach a
   user with a long CE.

   Run: node tools/test-row-suggestions.js */
'use strict';
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const NL = String.fromCharCode(10);

/* Each of these declares at least one list; App.js itself no longer does (the Misc tab moved to MiscTab.js). */
const FILES = ['src/components/ResTab.js', 'src/components/ScopeLibraryTab.js', 'src/components/MiscTab.js'];

console.log('no suggestion list is built per row:');
FILES.forEach(f => {
  const s = R(f);
  /* Every datalist in the file, with the object literal that follows it. */
  const parts = s.split(/React\.createElement\((?:"datalist"|'datalist')/);
  const heads = parts.slice(1).map(p => p.slice(0, 220));
  ck(f + ' declares ' + heads.length + ' suggestion list(s)', heads.length > 0);
  heads.forEach((h, i) => {
    const id = (h.match(/id:\s*([^,}\n]+)/) || [, ''])[1].trim();
    /* r.id in the id is the tell: one list per row. */
    ck('  ' + f + ' list ' + (i + 1) + ' is keyed by the table, not the row  (' + id + ')',
      id.indexOf('r.id') < 0 && id.indexOf('.id') < 0);
  });
});

console.log(NL + 'and where a list still sits inside the row loop, only one is made:');
const app = require('./lib/appsrc').plus(R('src/App.js'));
/* These three tables render their datalist from within the row map, so they
   are gated on the first row instead of being hoisted out of it. */
ck('the ML selector rows build one',
  app.indexOf("_ix === 0 && /*#__PURE__*/React.createElement(\"datalist\", {") > 0);
ck('the Mob/Demob manpower rows build one',
  app.indexOf('_ix === 0 && E("datalist", { id: idPfx }') > 0);
ck('the Misc tab rows build one', app.indexOf("        id: 'mc_' + miscKey") > 0);
ck('and the Manpower tab rows build one',
  app.indexOf("_ix === 0 && /*#__PURE__*/React.createElement(\"datalist\", {") > 0 &&
  app.indexOf("        id: 'rl'") > 0);
/* A shared id is only shared if the inputs point at it. */
['list: \'slr_\' + type,', 'list: idPfx,', 'list: \'rl\',', "list: 'mc_' + miscKey,"].forEach(l =>
  ck('an input points at the shared list: ' + l, app.indexOf(l) > 0));
const tab = R('src/components/ResTab.js');
ck('and the resource tabs hoist theirs out of the rows entirely',
  tab.indexOf("const _dlId = 'dl_' + mlType;") > 0 && tab.indexOf('list: _dlId,') > 0);

console.log(NL + 'and the Masterlist is not searched once per row either:');
ck('the resource tabs index it', tab.indexOf('const _mlIndex = React.useMemo') > 0);

console.log(bad ? NL + bad + ' FAILURE(S)' : NL + 'row suggestions OK');
process.exit(bad ? 1 : 0);
