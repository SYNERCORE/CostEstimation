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

/* A step is one `- name:` and one `run:`. Two `run:` lines under a single
   name are a duplicate YAML key, and only the LAST of them survives -- so the
   others never run on GitHub while still looking present in the file, and
   while this checker, which reads the lines rather than the YAML, still
   reports them as covered. That is exactly how test-request-docs.js and
   test-storage-warning.js sat in the workflow for two builds without ever
   running. Every run: line must therefore be introduced by its own name. */
{
  const lines = yml.split(/\r?\n/);
  let orphaned = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*run:/.test(lines[i])) continue;
    let j = i - 1;
    while (j >= 0 && /^\s*(#|$)/.test(lines[j])) j--;
    if (j >= 0 && /^\s*run:/.test(lines[j])) {
      console.log('  ORPHANED  line ' + (i + 1) + ': ' + lines[i].trim() +
        ' -- shares a step with the run: above it, so GitHub silently drops one of them.');
      orphaned++;
    }
  }
  if (orphaned) { console.log(orphaned + ' run: line(s) without a step of their own'); process.exit(1); }
}

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
