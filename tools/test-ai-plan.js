#!/usr/bin/env node
/*
 * What the AI writes into the CE, and whether it still fits the app.
 *
 * Both AI features -- "Extract Info" (from an uploaded document) and
 * "Generate" (from a typed scope) -- ask the model for a scope of work AND the
 * manpower, tools, materials and PPE to deliver it, then write the lot into
 * state. They had no test at all, because testing them looked like it needed a
 * live API key. It does not: the only interesting part is what happens to the
 * model's reply after it arrives, and that is a pure function.
 *
 * The bug this was written for: the two halves of the reply were never joined
 * up. Resource rows landed with no taskId, and rowServesTask matches on exactly
 * that, so the SOW Breakdown showed 0.00 and 0 resources against every task the
 * model had just written. The model knew which step needed the welder; the app
 * discarded it on arrival.
 *
 * Run: node tools/test-ai-plan.js src/ai.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const aiPath = process.argv[2] || 'src/ai.js';
const ai = fs.readFileSync(path.isAbsolute(aiPath) ? aiPath : path.join(ROOT, aiPath), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src/App.js'), 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

let _n = 0;
const uid = () => 'id' + (++_n);

/* Load the real helpers. ai.js is browser code, but nothing it defines at the
   top level touches the DOM, so the pure functions can be lifted out and run
   here against the actual source -- not a copy that could drift. */
const pick = ['AI_PLAN_SCHEMA', 'AI_PLAN_RULES', 'AI_MAX_TOKENS', 'aiParseJSON', 'aiLinkPlan', 'aiLinkNote'];
let M;
try {
  const start = ai.indexOf('const AI_PLAN_SCHEMA');
  if (start < 0) throw new Error('AI_PLAN_SCHEMA not found in ' + aiPath);
  M = new Function('uid', ai.slice(start) + '\nreturn {' + pick.join(',') + '};')(uid);
} catch (e) { console.error('could not load helpers: ' + e.message); process.exit(1); }

/* A reply in the shape the prompt asks for: three scope steps, and resources
   that each name the step they serve. */
const REPLY = JSON.stringify({
  info: { client: 'SEM-CALACA', description: 'Turbine bearing rebabbitting', qty: '1', days: '20', projType: 'mechanical' },
  sow: [
    { type: 'main', text: 'Dismantle bearing housing', note: 'Two fitters, one shift' },
    { type: 'sub', text: 'Tag and log fasteners', note: '' },
    { type: 'main', text: 'Rebabbitt and machine', note: 'Machining drives the duration' }
  ],
  manpower: [
    { role: 'FITTER', pax: 2, days: 3, shift: 'regular_day', rate: 850, otHours: 2, task: 1 },
    { role: 'MACHINIST', pax: 1, days: 12, shift: 'regular_day', rate: 1100, otHours: 0, task: 3 }
  ],
  tools: [{ desc: 'LATHE', qty: 1, days: 12, uom: 'Unit', cost: 2500, task: 3 }],
  materials: [{ desc: 'BABBITT ALLOY', qty: 40, uom: 'Kg', cost: 900, task: 3 }],
  ppe: [{ desc: 'FACE SHIELD', qty: 3, uom: 'Pcs', cost: 450, task: 1 }],
  notes: 'Assumes no hold points.'
});

const plan = M.aiLinkPlan(M.aiParseJSON(REPLY));
const allRows = [].concat(plan.mp, plan.tools, plan.mats, plan.ppe);

console.log('The scope and the resources arrive joined up:');
ck('every scope item gets an id', plan.sowItems.length === 3 && plan.sowItems.every(s => s.id));
ck('every resource row carries a taskId', allRows.every(r => r.taskId),
  'without it the SOW Breakdown shows 0.00 against every task');
ck('each row points at a scope item that exists', allRows.every(r => plan.sowItems.some(s => s.id === r.taskId)));
ck('the fitter is on step 1, the machinist on step 3',
  plan.mp[0].taskId === plan.sowItems[0].id && plan.mp[1].taskId === plan.sowItems[2].id,
  'a row linked to the wrong step is a costing error nobody sees');
ck('the raw index is not left on the row', allRows.every(r => r.task === undefined),
  'it would be saved to SharePoint and mean nothing on reload');

/* This is the check that actually reproduces the reported symptom. It uses the
   app's own rowServesTask rule rather than restating it, so a change to that
   rule that broke AI-generated rows would fail here. */
const servesSrc = (app.match(/const rowServesTask = ([^;]*);/) || [])[1] || '';
ck('rowServesTask found in App.js', servesSrc.length > 0);
const rowShares = r => Array.isArray(r && r.shares) && r.shares.length ? r.shares : null;
const rowServesTask = new Function('rowShares', 'return (' + servesSrc + ');')(rowShares);
const served = plan.sowItems.map(s => allRows.filter(r => rowServesTask(r, s.id)).length);
ck('the breakdown finds resources under each scope step', served[0] > 0 && served[2] > 0,
  'served counts: ' + served.join(','));

console.log('\nThe fields the app bills on survive:');
ck('tools keep their days', plan.tools[0].days === 12,
  'tools are charged qty x days x cost -- a missing days bills a 12-day hire for one day');
ck('consumables get no days key', plan.mats[0].days === undefined && plan.ppe[0].days === undefined,
  'a consumable is not billed by the day');
ck('overtime hours are carried', plan.mp[0].otHours === 2);
ck('and the prompt says overtime is PER DAY', /overtime hours PER DAY \(not the total for the job\)/.test(M.AI_PLAN_RULES),
  'the app multiplies otHours by days, so a job total would be billed days-times over');
ck('pax and days are numbers, not strings', typeof plan.mp[0].pax === 'number' && typeof plan.mp[0].days === 'number');
ck('breakdown notes are asked for and kept', plan.sowItems[0].note === 'Two fitters, one shift' && /sow\[\]\.note/.test(M.AI_PLAN_RULES),
  'the note prints on the CE under the scope label');
ck('a missing note is an empty string, not undefined', plan.sowItems[1].note === '');

console.log('\nA reply the model got slightly wrong does not corrupt the CE:');
const loose = M.aiLinkPlan({ sow: [{ type: 'main', text: 'Only step' }],
  manpower: [{ role: 'WELDER', task: 7 }, { role: 'HELPER' }] });
ck('an out-of-range task index links to nothing', loose.mp[0].taskId === '',
  'guessing a task is worse than leaving it visibly unassigned');
ck('a row with no task index links to nothing', loose.mp[1].taskId === '');
ck('and the user is told', /could not be linked to a scope task/.test(M.aiLinkNote(loose)),
  'silent zeros in the breakdown are how this went unnoticed');
ck('a fully linked plan says so', /All 5 rows linked/.test(M.aiLinkNote(plan)));
ck('zero pax or days falls back to 1, never 0', M.aiLinkPlan({ sow: [], manpower: [{ role: 'X', pax: 0, days: 0 }] }).mp[0].pax === 1,
  'a row costed at zero looks deliberate on a printed CE');
ck('missing arrays are empty, not a crash',
  (() => { const p = M.aiLinkPlan({}); return p.sowItems.length === 0 && p.mp.length === 0 && p.tools.length === 0; })());

console.log('\nThe reply is parsed the way models actually answer:');
const FENCE = String.fromCharCode(96, 96, 96);
ck('plain JSON', M.aiParseJSON('{"sow":[]}').sow.length === 0);
ck('fenced JSON', M.aiParseJSON(FENCE + 'json\n{"sow":[]}\n' + FENCE).sow.length === 0);
ck('JSON with a sentence in front of it', M.aiParseJSON('Here is the plan:\n{"sow":[]}').sow.length === 0,
  'the old code stripped fences and nothing else, so one line of preamble threw');
ck('JSON with prose on both sides', M.aiParseJSON('Sure!\n{"sow":[]}\nLet me know.').sow.length === 0);
const thrown = f => { try { f(); return ''; } catch (e) { return e.message; } };
ck('a truncated reply says it was cut off', /cut off before it finished/.test(thrown(() => M.aiParseJSON('{"sow":[{"text":"half a'))),
  '"Unexpected end of JSON input" blames the model for the token cap');
ck('an empty reply says so', /empty response/.test(thrown(() => M.aiParseJSON('   '))));
ck('unusable text says so', /did not return usable JSON/.test(thrown(() => M.aiParseJSON('I cannot help with that.'))));

console.log('\nBoth features ask for the same thing:');
ck('the schema is defined once', (ai.match(/const AI_PLAN_SCHEMA/g) || []).length === 1);
ck('and both prompts use it', (app.match(/AI_PLAN_SCHEMA, AI_PLAN_RULES/g) || []).length === 2,
  'two hand-maintained copies is how they drift');
ck('both parse through aiParseJSON', (app.match(/aiParseJSON\(/g) || []).length === 2);
ck('both link through aiLinkPlan', (app.match(/aiLinkPlan\(/g) || []).length === 2);
ck('neither still hand-rolls the fence strip', !app.includes('replace(/' + FENCE + 'json|' + FENCE + '/g'),
  'that strip is what made a one-line preamble fatal');
ck('the token cap has room for the whole schema', M.AI_MAX_TOKENS >= 8000,
  'the reply is one JSON object -- a cap hit mid-object is unparseable, not short');
ck('and neither call site hardcodes its own', !/callAI\(prompt, \d/.test(app));
ck('the schema asks for a task on every resource kind',
  ['manpower', 'tools', 'materials', 'ppe'].every(k => new RegExp('"' + k + '":\\[\\{[^\\]]*"task":1').test(M.AI_PLAN_SCHEMA)));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall AI plan assertions passed');
process.exit(fails ? 1 : 0);
