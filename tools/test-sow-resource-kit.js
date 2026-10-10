#!/usr/bin/env node
/*
 * SOW Breakdown "Fill from kit": a Scope Library service is the kit. It fills ONE task with the service's manpower, tools, consumables, PPE
 * and miscellaneous, with the steps flattened. This pins the wiring: the button on every card, the picker, the preview with ticks, the
 * skip of rows already on the task, Masterlist rates and units, and that nothing existing is replaced.
 *
 * Run: node tools/test-sow-resource-kit.js
 */
'use strict';
const fs = require('fs');
const sb = fs.readFileSync('src/components/SowBreakdownTab.js', 'utf8');
const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

ck('the kit state lives on App and the tab gets it with the Scope Library', /const \[kit, setKit\] = useState\(null\)/.test(app) && /KIT_TYPES, kit, kitApply, kitItems, setKit, sowLib \}\)/.test(app));
ck('the tab reads them from ctx', /KIT_TYPES,\n\s+RES_TABS/.test(sb) && /kitApply,\n\s+kitItems,/.test(sb) && /setKit,\n\s+setMisc/.test(sb) && /sowLib,\n\s+sowTaskGroup/.test(sb));
ck('every open task card has a Fill from kit button, in Split and List (it is in the shared card)', /"Fill from kit"/.test(sb) && /setKit\(\{ task: it\.id, svc: '', q: '', cat: 'All', mult: 1, off: \{\} \}\)/.test(sb));
ck('the picker is drawn after the tab content', /split \? null : unPanel,\n\s+kitPanel\(\)/.test(sb) && /const kitPanel = \(\) =>/.test(sb));
ck('the picker searches the library by title and category and has category chips', /String\(s\.title \|\| ''\)\.toLowerCase\(\)\.includes\(q\)/.test(sb) && /kit\.cat === 'All' \|\| s\.cat === kit\.cat/.test(sb));
ck('the preview groups by type with a tick per row, and a quantity multiplier', /KIT_TYPES\.map\(\(\[tk, tl\]\)/.test(sb) && /type: 'checkbox'/.test(sb) && /Multiplies every quantity in the kit/.test(sb));
ck('rows already on the task are shown and cannot be ticked', /already on this task/.test(sb) && /disabled: x\.dup/.test(sb));
ck('a row with no Masterlist match is flagged "no rate"', /"no rate"/.test(sb) && /noRate: x\.type !== 'misc' && !_kitMl/.test(app));
ck('steps are flattened: the same item twice is one row with quantities added', /if \(out\[key\]\) \{ out\[key\]\.qty \+= q; return; \}/.test(app));
ck('duplicate check is per task and by name', /r\.taskId === taskId && String\(r\.desc \|\| ''\)\.toUpperCase\(\) === u/.test(app) && /\.rows\.some\(r => r\.taskId === taskId/.test(app));
ck('apply files every new row against the chosen task', /rate: m \? m\.rate : 0, perDiem: m \? \(m\.perDiem \|\| 0\) : 0, taskId/.test(app) && /\.\.\.\(type === 'tools' \? toolSrcFields\(m\) : \{\}\), taskId/.test(app) && /qty: x\.qty, taskId \}/.test(app));
ck('apply adds to the existing rows and replaces nothing', /setMp\(p => \[\.\.\.p, /.test(app) && /setter\(p => \[\.\.\.p, /.test(app) && /next\[k\] = \[\.\.\.\(next\[k\] \|\| \[\]\), /.test(app));
ck('units and costs come from the Masterlist', /String\(m\.uom \|\| ''\)\.trim\(\)/.test(app) && /cost: m \? m\.cost : 0/.test(app));
ck('a miscellaneous category the CE type lacks falls back to its first', /valid\.includes\(x\.cat\) \? x\.cat : valid\[0\]/.test(app));
ck('an empty result says so instead of adding nothing silently', /Nothing to add/.test(app));
ck('the panel closes on Cancel, the backdrop, the X and after adding', (sb.match(/setKit\(null\)/g) || []).length >= 3 && /setKit\(null\);\n\s+showToast\('Added '/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nSOW resource kit OK');
process.exit(bad ? 1 : 0);
