#!/usr/bin/env node
/*
 * Scope Library <-> SOW Breakdown alignment.
 *
 * The library knew which service needed which resources and threw it away on
 * apply: every row was merged by name into one flat pile with no taskId, so all
 * of it landed in "Unassigned" and had to be filed by hand -- the exact grouping
 * the library already held.
 *
 * Resources now hang off a scope STEP, so an applied service arrives filed
 * against 1.1 rather than nowhere. Two things make that worth having:
 *
 *   - a role can carry its own duration. Blank means it reports from day 1 to
 *     completion (what every service did before), a number means it works only
 *     that many days of its step. Both models appear in the same CE.
 *   - merging a shared role across services collapses it onto ONE task, so the
 *     other task shows no cost for work it needs -- and a 3-day welder merged
 *     with a 5-day one is a row that is neither.
 *
 * Run: node tools/test-scopelib.js src/App.js
 */
'use strict';

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'src/App.js', 'utf8');
const grab = (re, what) => { const m = src.match(re); if (!m) { console.error('not found in source: ' + what); process.exit(1); } return m[0]; };

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* ---- the real taskFor / mkey, lifted ------------------------------------- */
const taskForSrc = grab(/const taskFor = \(svc, step\) => \{[\s\S]*?\n      \};/, 'taskFor');
const mkeySrc = grab(/const mkey = \(svc, step, name, days\) =>[\s\S]*?;\n/, 'mkey');

const taskOf = { A: { main: 'mA', steps: ['s1', 's2'] }, B: { main: 'mB', steps: ['t1'] } };
const taskFor = new Function('taskOf', taskForSrc + ' return taskFor;')(taskOf);
const mk = merge => new Function('sowMergeAcross', mkeySrc + ' return mkey;')(merge);

console.log('A resource is filed against the step that needs it:');
ck('step 0 goes to the first sub-task', taskFor({ id: 'A' }, 0) === 's1');
ck('step 1 goes to the second', taskFor({ id: 'A' }, 1) === 's2');
ck('a step that no longer exists falls back to the service itself', taskFor({ id: 'A' }, 9) === 'mA',
  'an out-of-range index must not orphan the row');
ck('no step at all falls back the same way', taskFor({ id: 'A' }, undefined) === 'mA');
ck('a negative index does not wrap to the last step', taskFor({ id: 'A' }, -1) === 'mA',
  'arrays index from the end with -1 in some languages, not this one, but the guard should be explicit');
ck('a service with one step still works', taskFor({ id: 'B' }, 0) === 't1');
ck('an unknown service yields no task rather than a wrong one', taskFor({ id: 'ZZ' }, 0) === '');

console.log('\nMerging across services (off by default):');
const off = mk(false), on = mk(true);
const A = { id: 'A' }, B = { id: 'B' };
ck('off: the same role in two services stays two rows', off(A, 0, 'WELDER') !== off(B, 0, 'WELDER'));
ck('off: the same role on two steps stays two rows', off(A, 0, 'WELDER') !== off(A, 1, 'WELDER'),
  'they are on different tasks and may have different durations');
ck('off: the same role on the same step of the same service merges', off(A, 0, 'WELDER') === off(A, 0, 'welder'),
  'that is one row asked for twice, not two crews');
ck('on: the same role in two services becomes one row', on(A, 0, 'WELDER') === on(B, 0, 'WELDER'));
ck('on: a 3-day welder does NOT merge with a 5-day one', on(A, 0, 'WELDER', 3) !== on(B, 0, 'WELDER', 5),
  'the merged row would be neither duration');
ck('on: two full-project welders still merge', on(A, 0, 'WELDER') === on(B, 1, 'WELDER'));
ck('case and padding do not create duplicates', off(A, 0, '  welder ') === off(A, 0, 'WELDER'));

console.log('\nThe default is the exact one:');
ck('merging starts OFF', /const \[sowMergeAcross, setSowMergeAcross\] = useState\(false\)/.test(src),
  'on by default would silently mis-file costs across tasks');
ck('and is a visible switch, not a hidden rule', /Merge duplicates across services/.test(src));

console.log('\nDuration: full project vs. this step only:');
const daysRule = grab(/days: Number\(raw && raw\.days\) > 0[^\n]*/, 'apply duration rule');
ck('a row with its own days uses them', /Number\(raw && raw\.days\) > 0 \? Number\(raw\.days\)/.test(daysRule));
ck('a row without days falls back to the project duration', /N\(info\.days\) \|\| 1/.test(daysRule),
  'this is what every service did before durations existed, so nothing changes for them');
ck('the library input treats blank as "full project"', /placeholder: "full"/.test(src));
ck('and only manpower has it', /type === 'mp' && \/\*#__PURE__\*\/React\.createElement\("td"/.test(src),
  'a consumable is not billed by the day');
ck('zero days is not treated as a duration', /Number\(raw && raw\.days\) > 0/.test(daysRule),
  '0 would otherwise cost nothing at all rather than meaning "full project"');

console.log('\nEverything the library holds reaches a task:');
for (const t of ['mp', 'tools', 'mats', 'ppe'])
  ck(t + ' rows carry a taskId', new RegExp('taskId: taskFor\\(svc, step\\)').test(src));
ck('miscellaneous does too', /taskId: taskFor\(m\.svc, m\.step\)/.test(src),
  'misc is an object of category arrays, so it needs its own path');
ck('the SOW tasks are built BEFORE the resources', src.indexOf('const taskOf = {}') < src.indexOf('const mpMap = {}'),
  'the resources need the task ids, so the order is load-bearing');

console.log('\nA misc row keeps its category:');
ck('the library stores one', /miscCat: r\.miscCat \|\| 'requirements'/.test(src));
ck('apply honours it', /valid\.includes\(m\.cat\) \? m\.cat : valid\[0\]/.test(src),
  'a category this CE type does not have must not drop the row');
ck('only misc rows carry it', /\.\.\.\(isMisc \? \{miscCat/.test(src),
  'a manpower row with a miscCat is noise in every saved service');

console.log('\nEditing happens where the row is:');
ck('a new service goes to the top', /saveSowLib\(\[blank, \.\.\.sowLib\]\)/.test(src),
  'appending it meant scrolling past 131 others to find it');
ck('the editor state survives an App re-render', /const \[editSvc, setEditSvc\] = \[_editSvc, _setEditSvc\]/.test(src),
  'held locally it was wiped on every remount, which is why the new service never opened');
ck('the state actually lives on App', /const \[_editSvc, _setEditSvc\] = useState\(null\)/.test(src));
ck('a uid-based id does not print in full', /'NEW'/.test(src), 'padStart on a uuid printed all 36 characters');
ck('rows can be moved between steps', /Move this item to another scope step/.test(src),
  'without it, resources inherited on step 1 could never be re-filed');

console.log('\nRow edits cannot clobber each other:');
ck('ResEditor uses the updater form', /const apply = fn => setRows\(prev => fn\(/.test(src));
for (const fn of ['upd', 'del', 'addRow', 'autoFill'])
  ck(fn + ' goes through it', new RegExp('const ' + fn + ' = [\\s\\S]{0,400}?apply\\(').test(src),
    'two edits in one React batch would read the same stale snapshot');
ck('and the receiving setter accepts an updater', /typeof rows === 'function' \? rows\(/.test(src));

console.log('\nThe two screens use the same words:');
ck('the library calls it Consumables, like the Breakdown', /\['mats', 'Consumables'\]/.test(src),
  'it used to say Materials on one screen and Consumables on the other');
ck('and offers Miscellaneous, which it never had', /\['misc', 'Miscellaneous'\]/.test(src));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall scope-library assertions passed');
process.exit(fails ? 1 : 0);
