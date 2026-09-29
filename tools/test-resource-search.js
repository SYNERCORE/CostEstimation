/* Finding one row in a list of 671.
   =================================
   An imported consumables sheet puts hundreds of rows on one tab, and the
   only question anyone asks of a list that long is "is this item on here".
   Scrolling is not an answer, and neither is the browser's own Ctrl+F: every
   description lives in an <input>, and a page search does not see an input's
   value at all.

   Two things this must not break. The row number stays the row's number in
   the WHOLE list, not its position among the matches -- a filtered view whose
   numbers renumber is a filtered view you cannot report from. And the total
   stays the total of the list, not of what is shown; a CE's tools cost what
   they cost whatever is being looked at.

   Run: node tools/test-resource-search.js */
'use strict';
const fs = require('fs');
const tab = fs.readFileSync('src/components/ResTab.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };

/* The matcher itself, lifted from the shipped source rather than retyped. */
const grab = (re, what) => { const m = tab.match(re); if (!m) { console.error('not found in ResTab.js: ' + what); process.exit(1); } return m[0]; };
const mk = q => new Function('q',
  grab(/const _terms = String\(q\)[\s\S]*?\n  const _hit = r => [\s\S]*?\.indexOf\(t\) >= 0\);/, 'the matcher') +
  '\nreturn _hit;')(q);

const rows = [
  { desc: 'Cord, Extension, M-F Plug, 12/3 W/ 3 Gang Outlet', uom: 'Pcs', code: 'A-1001' },
  { desc: 'Alignment Pins, Hex Head, No Studs', uom: 'Pcs', code: 'B-2002' },
  { desc: 'Bolt Cleaning Tool 1/2" SCH 40 Pipe', uom: 'Set', code: 'C-3003' },
  { desc: 'Regulator Adapter, Acetylene, FxF, No 61', uom: 'Pcs', code: '', src: { code: 'SIE-77' } }
];
const hits = q => rows.filter(mk(q)).map(r => r.desc.slice(0, 12));

console.log('finding a row:');
ck('a word out of the middle of a description finds it',
  hits('extension').join() === 'Cord, Extens', hits('extension').join());
ck('case does not matter', hits('ALIGNMENT').length === 1);
/* Nobody types a description the way a supplier wrote it, so the words are
   matched separately and in any order. Matching the phrase finds nothing. */
ck('two words in the wrong order still find the row',
  hits('acetylene regulator').join() === 'Regulator Ad', hits('acetylene regulator').join());
ck('and every word has to be there, not just one',
  hits('acetylene cord').length === 0, hits('acetylene cord').length);
ck('a part number finds it', hits('B-2002').length === 1);
/* An imported row carries the Masterlist code separately -- often the only
   thing anyone is sure of. */
ck('so does the code it was imported under', hits('SIE-77').length === 1);
ck('the unit is searched too', hits('set').length === 1, hits('set').length);
ck('something not on the list finds nothing', hits('turbine').length === 0);

console.log('\nand an empty box is not a filter:');
ck('every row shows', rows.filter(mk('')).length === 4);
ck('spaces alone are still empty', rows.filter(mk('   ')).length === 4);

console.log('\nwhat the table does with it:');
/* The number shown is the row's index in the WHOLE list: the index is taken
   before the filter runs, then carried through it. */
ck('the row keeps its real number when the view is filtered',
  /rows\.map\(\(r, _ix\) => \(\{ r, _ix \}\)\)\.filter\(x => _hit\(x\.r\)\)\.map\(\(\{ r, _ix \}\) => \{/.test(tab));
/* Edits are keyed by id, never by position, so editing a filtered row edits
   that row and not whatever sits at its index in the full list. */
ck('and edits still find the row by id, not by position',
  tab.indexOf('set(p => p.map(x => x.id === r.id ?') > 0);
ck('the box says how many of how many', tab.indexOf("' of ' + rows.length") > 0);
ck('and says plainly when the answer is none', tab.indexOf("' -- not on this list'") > 0);
/* Set all, Combine and Sync Rates act on `rows`, which the filter never
   touches. Someone pressing Set all on a filtered view would otherwise be
   entitled to think it applied to what they could see. */
ck('the view warns that the buttons still act on everything',
  tab.indexOf('The buttons above still act on all ') > 0);
ck('the box is only shown when there are rows to search', /rows\.length > 0 && \/\*#__PURE__\*\/React\.createElement\("div"/.test(tab));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nresource search OK');
process.exit(bad ? 1 : 0);
