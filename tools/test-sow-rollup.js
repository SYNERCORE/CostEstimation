#!/usr/bin/env node
/*
 * SOW Breakdown: parent roll-up and breakdown notes.
 *
 * A main task is usually a heading -- the cost sits on its sub-tasks -- so the
 * parent card must report the whole group, not just the rows filed directly on
 * it. The roll-up is a pure sum of the same per-task figures the sub-cards
 * show, so a parent can never disagree with the children under it.
 *
 * The notes must survive the same journeys the scope items do (save/load remaps
 * every id) and must reach the printed CE labelled with their scope number, or
 * the reviewer sees reasoning with nothing to attach it to.
 *
 * Run: node tools/test-sow-rollup.js src/App.js
 */
'use strict';

const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'src/App.js', 'utf8');

const grab = (re, what) => { const m = src.match(re); if (!m) { console.error('not found in source: ' + what); process.exit(1); } return m[0]; };

const groupSrc = grab(/const sowTaskGroup = item => \{[\s\S]*?\n  \};/, 'sowTaskGroup');
const costRollSrc = grab(/const taskCostRollup = [^\n]*;/, 'taskCostRollup');
const cntRollSrc = grab(/const taskResCountRollup = [^\n]*;/, 'taskResCountRollup');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* A scope list shaped like a real CE: one heading with two sub-tasks, one
   heading with none, and a heading that also carries rows of its own. */
const sowItems = [
  { id: 'a', type: 'main', text: 'Sand Blasting' },
  { id: 'a1', type: 'sub', text: 'HIP' },
  { id: 'a2', type: 'sub', text: 'LIP' },
  { id: 'b', type: 'main', text: 'Painting' },
  { id: 'c', type: 'main', text: 'Mobilisation' },
  { id: 'c1', type: 'sub', text: 'Trucking' }
];
const COST = { a: 0, a1: 4872.16, a2: 1200, b: 500, c: 300, c1: 700 };
const COUNT = { a: 0, a1: 5, a2: 0, b: 2, c: 1, c1: 3 };

const api = new Function('sowItems', 'taskCost', 'taskResCount', `
  ${groupSrc}
  ${costRollSrc}
  ${cntRollSrc}
  return { sowTaskGroup, taskCostRollup, taskResCountRollup };
`)(sowItems, id => COST[id] || 0, id => COUNT[id] || 0);

const byId = id => sowItems.find(s => s.id === id);
const near = (a, b) => Math.abs(a - b) < 0.005;

console.log('A parent reports its sub-tasks:');
ck('heading with two subs sums all three', near(api.taskCostRollup(byId('a')), 6072.16), api.taskCostRollup(byId('a')));
ck('resource counts roll up too', api.taskResCountRollup(byId('a')) === 5, api.taskResCountRollup(byId('a')));
ck('a heading that carries its own rows adds them to its subs',
  near(api.taskCostRollup(byId('c')), 1000), api.taskCostRollup(byId('c')));
ck('own-rows heading counts both', api.taskResCountRollup(byId('c')) === 4, api.taskResCountRollup(byId('c')));

console.log('\nAnd nothing that is not under it:');
ck('a heading with no subs reports only itself', near(api.taskCostRollup(byId('b')), 500), api.taskCostRollup(byId('b')));
ck('the roll-up stops at the next heading', !near(api.taskCostRollup(byId('a')), 6072.16 + 500),
  'task b belongs to no one else');
ck('a sub-task reports only itself', near(api.taskCostRollup(byId('a1')), 4872.16));
ck('a sub-task never swallows its siblings', !near(api.taskCostRollup(byId('a1')), 6072.16));

console.log('\nThe roll-up cannot disagree with the cards under it:');
const childSum = ['a', 'a1', 'a2'].reduce((s, id) => s + COST[id], 0);
ck('parent total equals the sum of what the children display', near(api.taskCostRollup(byId('a')), childSum));
ck('every task is counted exactly once across the headings',
  near(sowItems.filter(s => s.type === 'main').reduce((s, m) => s + api.taskCostRollup(m), 0),
       Object.values(COST).reduce((s, v) => s + v, 0)),
  'a task counted twice would inflate the breakdown against the Grand Total');

console.log('\nBreakdown notes:');
ck('the note is written onto the scope item, so it travels with the task',
  /setSowItems\(p => p\.map\(s => s\.id === it\.id \? \{ \.\.\.s, note: v \} : s\)\)/.test(src),
  'a note kept in separate state would be orphaned by reorder/copy/delete');
ck('load carries the note through the id remap', /\{ \.\.\.s, id: nid \}/.test(src),
  'the spread must be kept - listing fields by hand would drop note');
ck('the note is part of the dirty signature', /sowItems, notes, addlCosts/.test(src),
  'editing a note must mark the CE unsaved');

console.log('\nThe printed CE:');
const printed = grab(/const sowNotes = [\s\S]*?const notesList = [^\n]*;/, 'printed notes');
ck('breakdown notes are printed', /sowNotes\.map/.test(printed));
ck('the note text is escaped', /esc\(String\(s\.note\)\.trim\(\)\)/.test(printed),
  'a note is free text typed by the user');
ck('the scope number is escaped too', /esc\(sowLabels\[s\.id\]/.test(printed));
ck('each note is labelled with its scope number', /Scope \$\{esc\(sowLabels/.test(printed),
  'reasoning with no number attached is not reviewable');
ck('a CE with only breakdown notes still prints a NOTE block',
  /\(notes\.length \|\| sowNotes\.length\)/.test(printed),
  'notes.length alone would silently drop them');
ck('blank notes are not printed', /String\(s\.note \|\| ''\)\.trim\(\)/.test(printed));

console.log('\nNotes / Remarks tab:');
ck('breakdown notes are shown there', /From the SOW Breakdown/.test(src));
ck('shown read-only, with a link back to the one place they are edited',
  /Edit in SOW Breakdown/.test(src), 'two editable copies would drift');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall SOW roll-up assertions passed');
process.exit(fails ? 1 : 0);
