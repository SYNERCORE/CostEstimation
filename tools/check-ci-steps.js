#!/usr/bin/env node
/* Every step of the workflow, run the way the workflow runs it.

   A test was added to both jobs and then left behind by a later change to the
   code it pins. It passed here and failed on push, because what is run here
   was a list kept by hand and the workflow is the list that counts. So the
   workflow is read, and every step in it is run, arguments and all.

   Run: node tools/check-ci-steps.js */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const yml = fs.readFileSync('.github/workflows/check.yml', 'utf8');

const SELF = 'tools/check-ci-steps.js';
/* Every step but this one: this one is the step that runs them. */
const steps = [...new Set((yml.match(/^\s*run: node tools\/.*$/gm) || [])
  .map(l => l.replace(/^\s*run:\s*/, '').trim()))].filter(s => s.split(/\s+/)[1] !== SELF);

let bad = 0;
if (steps.length < 100) { console.log('  FAIL  only ' + steps.length + ' steps found -- has the workflow moved?'); bad++; }
if (!yml.includes('run: node ' + SELF)) { console.log('  FAIL  this check is not itself a step in the workflow'); bad++; }
console.log(steps.length + ' step(s) from .github/workflows/check.yml\n');

/* Every tool a step names must exist: a renamed test is a step that fails on
   push and nowhere else. */
steps.forEach(s => {
  const file = s.split(/\s+/)[1];
  if (!fs.existsSync(file)) { console.log('  FAIL  ' + file + ' is named by the workflow and is not there'); bad++; }
});

steps.forEach(s => {
  const args = s.split(/\s+/).slice(1);
  try { execFileSync(process.execPath, args, { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const out = String(e.stdout || '') + String(e.stderr || '');
    console.log('  FAIL  ' + s);
    out.split('\n').filter(l => /^\s*FAIL|Error|FAILURE/.test(l)).slice(0, 4).forEach(l => console.log('        ' + l.trim()));
  }
});

/* A test that is in the tools folder and in neither job is a test nobody runs. */
const named = new Set(steps.concat(['node ' + SELF]).map(s => s.split(/\s+/)[1].replace('tools/', '')));
const orphans = fs.readdirSync('tools')
  .filter(f => /^(test|check)-.*\.js$/.test(f) && !named.has(f) && 'tools/' + f !== SELF);
if (orphans.length) { console.log('\n  FAIL  in tools/ but run by no job: ' + orphans.join(', ')); bad++; }

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nevery workflow step passes');
process.exit(bad ? 1 : 0);
