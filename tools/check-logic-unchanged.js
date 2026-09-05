#!/usr/bin/env node
/*
 * A presentation change must not change a number.
 *
 * The design work ahead touches style objects and wrapper markup across every
 * screen. Nothing in that should reach a formula -- but "should" is not a
 * guarantee, and a cost estimator that quietly starts pricing differently is
 * the worst possible way to find out.
 *
 * So every function that computes money, dates or identifiers is fingerprinted
 * here. Whitespace and comments are stripped first, so reformatting is free;
 * changing what a function DOES is not. A styling pass that trips this has
 * strayed out of presentation, and the failure names which function.
 *
 * When a formula is meant to change, run with --update and commit the lock
 * alongside the change, so the diff records the decision.
 *
 * Run: node tools/check-logic-unchanged.js [--update]
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const LOCK = 'tools/logic.lock.json';

/* Named because each one turns inputs into a figure somebody quotes, invoices
   or files against. Presentation may not touch any of them. */
const WATCH = {
  'src/helpers.js': ['nextCeNum', 'nextCeNumForCompany', 'ceResDays', 'ceMpRowCost',
    'computeCEGrand', 'toolAnnualCost', 'toolTierRates', 'toolRowCost',
    '_ceMidnight', '_ceToday', 'ceDeadline', 'ceNumPrefix'],
  'src/App.js': ['mlRound', 'mlShape', 'ceNumKey'],
  'src/config.js': ['ceDefaultFor', 'ceIsOpen'],
  'src/db.js': ['_assembleCE']
};

/* Whole-object constants that are as load-bearing as any function: the shift
   multipliers ARE the labour cost, and the closed-status list decides what
   counts as open. */
const CONSTS = {
  'src/config.js': ['SHIFTS', 'CE_CLOSED_STATUSES', 'DEFAULT_STATUS_OPTIONS']
};

/* Arrow functions, which the `function` pattern above cannot see. The first
   version of this file watched declarations only -- and calcBen, where the
   DOLE statutory loading is computed, is an arrow inside App. A stray edit
   sat in it undetected until test-recompute caught the peso difference
   downstream. That gap is what this closes. */
const ARROWS = {
  'src/App.js': ['calcBen', 'rowCost', 'resDays']
};

const strip = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')     /* block comments */
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1') /* line comments, sparing http:// */
  .replace(/\s+/g, ' ')
  .trim();

function grab(src, name, kind) {
  let re;
  if (kind === 'fn') {
    re = new RegExp('\\bfunction ' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  } else if (kind === 'arrow') {
    /* `const x = (a, b) => { ... };` indented inside App, or a one-liner. */
    re = new RegExp('\\bconst ' + name + '\\s*=\\s*[^;\\n]*=>\\s*\\{[\\s\\S]*?\\n  \\};'
      + '|\\bconst ' + name + '\\s*=\\s*[^\\n]*;', 'm');
  } else {
    re = new RegExp('\\bconst ' + name + '\\s*=\\s*[\\[{][\\s\\S]*?\\n\\];?'
      + '|\\bconst ' + name + '\\s*=\\s*[\\[{][\\s\\S]*?\\n\\};?', 'm');
  }
  const m = src.match(re);
  return m ? m[0] : null;
}

const now = {};
const missing = [];
for (const [file, names] of Object.entries(WATCH)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const n of names) {
    const body = grab(src, n, 'fn');
    if (!body) { missing.push(file + ':' + n); continue; }
    now[file + ':' + n] = crypto.createHash('sha256').update(strip(body)).digest('hex').slice(0, 16);
  }
}
for (const [file, names] of Object.entries(ARROWS)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const n of names) {
    const body = grab(src, n, 'arrow');
    if (!body) { missing.push(file + ':' + n); continue; }
    now[file + ':' + n] = crypto.createHash('sha256').update(strip(body)).digest('hex').slice(0, 16);
  }
}
for (const [file, names] of Object.entries(CONSTS)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const n of names) {
    const body = grab(src, n, 'const');
    if (!body) { missing.push(file + ':' + n); continue; }
    now[file + ':' + n] = crypto.createHash('sha256').update(strip(body)).digest('hex').slice(0, 16);
  }
}

if (process.argv.indexOf('--update') >= 0) {
  fs.writeFileSync(LOCK, JSON.stringify(now, null, 2) + '\n');
  console.log('locked ' + Object.keys(now).length + ' definitions -> ' + LOCK);
  if (missing.length) { console.log('MISSING: ' + missing.join(', ')); process.exit(1); }
  process.exit(0);
}

if (!fs.existsSync(LOCK)) {
  console.error('No ' + LOCK + '. Run with --update to create it.');
  process.exit(1);
}
const was = JSON.parse(fs.readFileSync(LOCK, 'utf8'));

let bad = 0;
console.log('every costing formula is byte-identical (comments and layout aside):');
/* A watched definition that cannot be found is a failure, not a pass. Renaming
   one out of existence would otherwise slip through as "nothing changed". */
for (const m of missing) { console.log('  FAIL  ' + m + '  -> not found'); bad++; }
for (const k of Object.keys(was)) {
  if (now[k] === undefined) { console.log('  FAIL  ' + k + '  -> gone'); bad++; continue; }
  if (now[k] !== was[k]) { console.log('  FAIL  ' + k + '  -> CHANGED'); bad++; continue; }
  console.log('  PASS  ' + k);
}
for (const k of Object.keys(now))
  if (was[k] === undefined) { console.log('  FAIL  ' + k + '  -> new, and unlocked'); bad++; }

if (bad) {
  console.log('\n' + bad + ' definition(s) moved.');
  console.log('If that was deliberate: node tools/check-logic-unchanged.js --update, and commit the lock with it.');
  console.log('If it was not: a presentation change has reached a formula.');
  process.exit(1);
}
console.log('\n' + Object.keys(now).length + ' definitions unchanged');
