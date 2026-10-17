#!/usr/bin/env node
/*
 * A note beside NO. OF DAYS on the generated CE: whether the days include or exclude mob/demob and pick-up/delivery. Chosen on Project Info,
 * printed in the HTML CE and written into both Excel exports; without a note the cell reads exactly as before ("2 DAYS").
 * Run: node tools/test-days-note.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const h = fs.readFileSync('src/helpers.js', 'utf8');
const out = fs.readFileSync('src/components/CeOutput.js', 'utf8');
const info = fs.readFileSync('src/components/InfoTab.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = h.indexOf('const DAYS_NOTES'), b = h.indexOf("/* CE Monitoring's date filter.");
const ctx = vm.createContext({});
vm.runInContext(h.slice(a, b) + '\nthis.p=daysPrinted;this.n=DAYS_NOTES;', ctx);
const p = (days, note) => ctx.p({ days, daysNote: note });
ck('no note prints exactly as before', p('2', '') === '2 DAYS' && p('2', undefined) === '2 DAYS');
ck('excluding mob/demob matches the sample', p('10', 'excl-md') === '10 DAY/S (EXCL. MOB. & DEMOB.)', p('10', 'excl-md'));
ck('including mob/demob', p('10', 'incl-md') === '10 DAY/S (INCL. MOB. & DEMOB.)');
ck('pick-up and delivery, both ways', p('3', 'excl-pd') === '3 DAY/S (EXCL. PICK-UP & DELIVERY)' && p('3', 'incl-pd') === '3 DAY/S (INCL. PICK-UP & DELIVERY)');
ck('both together', p('5', 'excl-both') === '5 DAY/S (EXCL. MOB. & DEMOB. AND PICK-UP & DELIVERY)' && p('5', 'incl-both').startsWith('5 DAY/S (INCL.'));
ck('an unknown code adds nothing', p('4', 'zzz') === '4 DAYS');
ck('every option has a code and a label', ctx.n.length === 7 && ctx.n.every(x => Array.isArray(x) && x.length === 2));
ck('a new CE starts with no note', /days: "",\s*daysNote: "",/.test(h));

ck('the printed CE says it', out.includes("${esc(daysPrinted(info))}"));
ck('both Excel exports say it', out.includes("'NO. OF DAYS:', daysPrinted(info));") && out.includes("['NO. OF DAYS:', info.days ? daysPrinted(info) : info.days],"));
ck('no print site is left showing the bare days', !out.includes("${esc(info.days||'')} DAYS"));
ck('Project Info has the choice, saved on the CE\'s info', info.includes("'aria-label': 'What the days cover'") && info.includes('daysNote: e.target.value') && info.includes('DAYS_NOTES.map'));
process.exit(bad ? 1 : 0);
