#!/usr/bin/env node
/*
 * A CE and its revisions are one CE.
 *
 * R01 of a job is the same job priced again. Counted as its own CE it was an
 * extra row in CE Monitoring, an extra CE in every Dashboard tally, and its
 * whole value again in the open pipeline -- so a job revised twice reported
 * three times the money it could ever bring in.
 *
 * The hard part is not the grouping, it is reading the numbers. The app's own
 * Revise button writes "-R1", but almost nothing on file is written that way:
 * the numbers people type are "R01", sometimes " R01" with a space, and a CE
 * revised off a revision carries both, "-R2-R3". Two of those shapes differing
 * by a single space is exactly the case this exists for, so the family key is
 * compared with spaces, dashes and case removed.
 *
 * And the case that must NOT be grouped: two entries claiming the SAME
 * revision of the same number are not a base and its revision -- they are two
 * different jobs filed under one number, by two estimators, at two different
 * amounts. Merging those would hide one of them and its value with it. Such a
 * family is left alone entirely and every row flagged.
 *
 * Run: node tools/test-ce-revisions.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const grab = (start, end) => {
  const a = app.indexOf(start);
  if (a < 0) { console.error('not found in src/App.js: ' + start); process.exit(1); }
  const b = app.indexOf(end, a);
  return app.slice(a, b);
};
const ctx = vm.createContext({console});
vm.runInContext(grab('const CE_REV_RE =', '\n/* Money in the masterlist') +
  ';this.ceFamily=ceFamily;this.groupCERevisions=groupCERevisions;', ctx);
const {ceFamily, groupCERevisions} = ctx;

console.log('every revision shape actually on file is read:');
[['SY3-CE-2025-0674', 'SY3-CE-2025-0674', 0, 'a CE with no revision'],
 ['SHIC-CE-2026-0912CR01', 'SHIC-CE-2026-0912C', 1, 'R01 run straight onto the letter'],
 ['SHIC-CE-2026-0912B R01', 'SHIC-CE-2026-0912B', 1, 'R01 after a space'],
 ['SY3-CE-2026-0091A-R1', 'SY3-CE-2026-0091A', 1, 'the -R1 the app writes itself'],
 ['SY3-CE-2025-0555-R2-R3', 'SY3-CE-2025-0555', 3, 'a revision of a revision'],
 ['SHIC-CE-2026-0912b r01', 'SHIC-CE-2026-0912b', 1, 'lower case']
].forEach(([num, base, rev, why]) => {
  const f = ceFamily(num);
  ck('  ' + why, f.base === base && f.rev === rev, f.base + ' rev ' + f.rev);
});
ck('the last marker written is the revision in force', ceFamily('X-0555-R2-R3').rev === 3,
  'R3 supersedes R2; reading the first would report the CE a revision behind');
ck('a blank number has no family', ceFamily('').key === '' && ceFamily(null).key === '');

console.log('\nthe letter suffix is part of the identity, not a revision:');
ck('0912B and 0912C are different CEs',
  ceFamily('SHIC-CE-2026-0912B').key !== ceFamily('SHIC-CE-2026-0912C').key,
  'collapsing them would merge two separate jobs');

console.log('\nand a space is not a difference:');
ck('"0912B R01" and "0912BR01" are the same CE',
  ceFamily('SHIC-CE-2026-0912B R01').key === ceFamily('SHIC-CE-2026-0912BR01').key,
  'one space typed or not typed is the whole reason this case exists');
ck('so are "-R1" and "R01"',
  ceFamily('SY3-CE-2026-0091A-R1').key === ceFamily('SY3-CE-2026-0091AR01').key);

/* ---- grouping ---- */
const ce = (num, extra) => ({id: num, info: {ceNum: num}, ...(extra || {})});
const numOf = e => (e.info && e.info.ceNum) || '';
const group = rows => groupCERevisions(rows, numOf);

console.log('\na CE and its revisions collapse to one row:');
const chain = group([ce('SY3-CE-2025-0674'), ce('SY3-CE-2025-0674R01'), ce('SY3-CE-2025-0674 R02')]);
ck('three rows become one CE', chain.length === 1, String(chain.length));
ck('the newest revision is the one that counts', numOf(chain[0].head) === 'SY3-CE-2025-0674 R02');
ck('and the older two ride along on it', chain[0].revs.length === 2);
ck('nothing is thrown away',
  chain[0].revs.map(numOf).sort().join('|') === 'SY3-CE-2025-0674|SY3-CE-2025-0674R01');
ck('it is not flagged as a duplicate', chain[0].dup === false);

console.log('\ndifferent CEs stay different:');
const many = group([ce('SHIC-CE-2026-0912A'), ce('SHIC-CE-2026-0912B'), ce('SHIC-CE-2026-0912C')]);
ck('three unrelated CEs stay three rows', many.length === 3);
ck('and none of them carry revisions', many.every(g => g.revs.length === 0));

console.log('\ntwo jobs under one number are NOT merged:');
/* Exactly the pair in CE Monitoring: same number, same revision, two
   estimators, two job titles, thirty thousand pesos apart. */
const clash = group([
  ce('SHIC-CE-2026-0912B R01', {grand: 287775.00, savedBy: 'msuralta'}),
  ce('SHIC-CE-2026-0912BR01', {grand: 257290.02, savedBy: 'aestillore'})
]);
ck('both rows survive', clash.length === 2, String(clash.length));
ck('both are flagged for renumbering', clash.every(g => g.dup === true));
ck('neither swallows the other',
  clash.reduce((s, g) => s + g.head.grand, 0) === 287775.00 + 257290.02,
  'merging would have hidden one job and its value with it');
ck('and neither is treated as a revision', clash.every(g => g.revs.length === 0));

console.log('\na collision alongside a real revision is still left alone:');
const messy = group([ce('X-1R01', {n: 1}), ce('X-1 R01', {n: 2}), ce('X-1', {n: 3})]);
ck('the whole family is left uncollapsed', messy.length === 3,
  'guessing which of the two R01s the base belongs to is not something to guess at');

console.log('\nrows with no usable number stand alone:');
const blanks = group([ce(''), ce(''), ce('   ')]);
ck('they are not herded into one group', blanks.length === 3,
  'an empty family key would make every unnumbered CE one CE');

console.log('\nthe value of a revised CE is counted once:');
const rows = [ce('A-1', {grand: 100}), ce('A-1R01', {grand: 130}),
              ce('B-2', {grand: 50}), ce('C-3', {grand: 70})];
const live = group(rows).map(g => g.head);
ck('four rows are three CEs', live.length === 3);
ck('and worth 250, not 350', live.reduce((s, h) => s + h.grand, 0) === 250,
  'the superseded 100 was being counted alongside the 130 that replaced it');

console.log('\nthe monitoring list is built on it:');
ck('revisions are folded after filtering, not before',
  /const heads = groupCERevisions\(filtered,/.test(app),
  'folding first would hide a CE whose newest revision matches the filter');
ck('the head row carries its superseded revisions', /_revs: g\.revs, _dup: g\.dup/.test(app));
ck('they are drawn only when the row is expanded',
  /if \(monRevOpen\.has\(e\.id\)\) \(e\._revs \|\| \[\]\)\.forEach/.test(app));
ck('expanded after the page is cut, so a page is always the same CEs',
  app.indexOf('sortedHistory.slice(monPage * MON_PAGE_SIZE') <
  app.indexOf('if (monRevOpen.has(e.id))'));
ck('the count says how many rows were folded away', /revision' \+ \(r === 1 \? '' : 's'\) \+ ' folded in'/.test(app),
  'a count that drops with no explanation is a count nobody trusts');
ck('a superseded row says so', /'SUPERSEDED'/.test(app));
ck('and a collision says so', /'⚠ DUPLICATE No\.'/.test(app));

console.log('\nand so is the dashboard:');
ck('it counts the newest revision only', /const liveHist = liveOnly\(history\), liveRows = liveOnly\(monRows\)/.test(app));
/* From the collapse down to the end of the figures. The two lines that do the
   collapsing read `history` by definition, so the scan starts below them. */
const dash = app.slice(app.indexOf('const supersededN = history.length'), app.indexOf('const kpiCard ='));
ck('no figure on it still reads the raw history',
  !/\bhistory\.(filter|reduce|forEach|length)/.test(dash.slice(dash.indexOf('\n'))),
  'one left behind is one KPI still counting revisions');
ck('no figure on it still reads the raw monitoring rows',
  !/\bmonRows\.(map|filter|reduce|forEach)/.test(dash));
ck('and it says the revisions were excluded',
  /' superseded revision' \+\n?\s*\(supersededN === 1/.test(app),
  'a figure that quietly drops is a figure nobody trusts');

console.log('\nsaving a revision continues the family it belongs to:');
ck('handleSaveRevision reads the number with ceFamily', /const fam = ceFamily\(ceNum\);/.test(app));
ck('so does the Revise button', /const fam = ceFamily\(raw\);/.test(app));
ck('neither matches only "-R1" any more',
  !/replace\(\/-R\\d\+\$\/i?, ''\)/.test(app),
  'that is what made revising an R01 CE start a second family');
ck('the next revision keeps the style already used', /pad = \/R0\\d\/i\.test\(tail\)/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE revisions OK');
process.exit(bad ? 1 : 0);
