#!/usr/bin/env node
/*
 * Two estimators must not be handed the same CE number.
 *
 * nextCeNum read `history`, and dbGetHistory filters a non-admin to
 * `shicSavedBy eq '<user>'`. That is right for the CE list -- an estimator's
 * work is their own -- and wrong for allocating a number: each person's client
 * computed "the next one" from a list that could not see anybody else's CEs,
 * so two estimators on the same prefix were both handed 0004.
 *
 * The save-time check caught it, because dbFindCEByNum queries SharePoint
 * unfiltered. But it fires at the END, after the estimate is finished, and
 * said only "use a unique CE Number" without saying which.
 *
 * Run: node tools/test-ce-numbering.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = ['nextCeNum', 'nextCeNumForCompany']
  .map(f => (help.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}')) || [''])[0]).join('\n');
if (!/function nextCeNum/.test(src)) { console.error('nextCeNum not found'); process.exit(1); }

const YEAR = 2026;
const ctx = { Date: class extends Date {
  constructor(...a) { if (!a.length) super(new Date(YEAR, 5, 1).getTime()); else super(...a); }
}, String, parseInt, Math };
vm.createContext(ctx);
vm.runInContext(src + ';globalThis._n=nextCeNum;globalThis._c=nextCeNumForCompany;', ctx);
const N = ctx._n, C = ctx._c;

const h = n => ({ info: { ceNum: n } });

console.log('the reported case — a number nobody in your own list holds:');
/* Cviovicente is not an admin, so their history holds only their own CEs. */
const mine = [h('SHIC-CE-2026-0001')];
const everyone = ['SHIC-CE-2026-0001', 'SHIC-CE-2026-0002', 'SHIC-CE-2026-0003', 'SHIC-CE-2026-0004'];
ck('without the full list it hands out a taken number',
  N(mine, 'SHIC') === 'SHIC-CE-2026-0002',
  'this is the old behaviour, kept here to show what changed');
ck('with it, the next one is genuinely free',
  N(mine, 'SHIC', everyone) === 'SHIC-CE-2026-0005',
  N(mine, 'SHIC', everyone));

console.log('\nprefixes are separate sequences, and stay that way:');
ck('SY3 is not advanced by a SHIC number',
  N([], 'SY3', everyone) === 'SY3-CE-2026-0001', N([], 'SY3', everyone));
ck('and the two can share a sequence number legitimately',
  N([], 'SY3', ['SY3-CE-2026-0003']) === 'SY3-CE-2026-0004' &&
  N([], 'SHIC', ['SHIC-CE-2026-0003']) === 'SHIC-CE-2026-0004',
  'SY3-CE-2026-0004 and SHIC-CE-2026-0004 are different CEs, not a duplicate');
ck('the company helper passes the list through',
  C([], { cePrefix: 'SY3' }, ['SY3-CE-2026-0009']) === 'SY3-CE-2026-0010');
ck('and falls back to SHIC with no company', C([], null, []) === 'SHIC-CE-2026-0001');

console.log('\na revision does not consume a number:');
ck('-R1 counts as its parent',
  N([], 'SHIC', ['SHIC-CE-2026-0004', 'SHIC-CE-2026-0004-R1']) === 'SHIC-CE-2026-0005');
ck('and a revision alone still reserves the parent',
  N([], 'SHIC', ['SHIC-CE-2026-0007-R2']) === 'SHIC-CE-2026-0008');

console.log('\nboth sources are read, not one or the other:');
ck('the local history still counts',
  N([h('SHIC-CE-2026-0020')], 'SHIC', ['SHIC-CE-2026-0002']) === 'SHIC-CE-2026-0021',
  'an unsaved local CE holds its number too');
ck('a bare ceNum with no info wrapper is read', N([{ ceNum: 'SHIC-CE-2026-0030' }], 'SHIC', []) === 'SHIC-CE-2026-0031');
ck('junk in either list is ignored',
  N([h(null), h(''), {}], 'SHIC', [null, '', 'nonsense', 'SHIC-CE-2026-0002']) === 'SHIC-CE-2026-0003');
ck('an empty everything starts at 0001', N([], 'SHIC', []) === 'SHIC-CE-2026-0001');
ck('and omitting the list entirely still works', N([h('SHIC-CE-2026-0005')], 'SHIC') === 'SHIC-CE-2026-0006',
  'the third argument is additive, never required');

console.log('\nthe numbers are fetched without a user filter:');
ck('there is a dedicated query', /async function dbGetCeNumbers\(\)/.test(db));
ck('it asks for Titles only', /spGet\(spList\('CEs'\),'','Title'\)/.test(db),
  'a CE number is an identifier, not content');
ck('and applies no shicSavedBy filter',
  !/dbGetCeNumbers[\s\S]{0,400}shicSavedBy/.test(db),
  'that filter is the whole cause of the collision');
ck('it falls back to the local cache offline', /dbGetCeNumbers[\s\S]{0,700}LS\.get\('history'\)/.test(db));

console.log('\nthe app loads and maintains the list:');
ck('it is fetched with the history', /dbGetCeNumbers\(\)\.then\(ns =>/.test(app));
ck('but never replaces it with an empty result', /if \(ns && ns\.length\) setCeNums\(ns\)/.test(app),
  'a failed query looks the same as an empty one, and would reset every number to 0001');
ck('a saved number is remembered for the rest of the session',
  /setCeNums\(p => p\.indexOf\(ceNum\) < 0 \? \[\.\.\.p, ceNum\] : p\)/.test(app),
  'otherwise the next New CE in the same session is handed the number just used');
for (const [what, re] of [
  ['New CE', /ceNum: nextCeNum\(history, null, ceNums\)/],
  ['Clone', /ceNum: nextCeNum\(history, null, ceNums\), date:/],
  ['a company change', /nextCeNumForCompany\(history, selCo, ceNums\)/]
]) ck(what + ' allocates from the full list', re.test(app));

console.log('\nand a refusal says what to use instead:');
ck('the next free number is worked out', /const _free = nextCeNum\(history, \(ceNum\.split\('-CE-'\)\[0\] \|\| null\), \[\.\.\.ceNums, ceNum\]\)/.test(app));
ck('and named in the message', /Next free: ' \+ _free/.test(app),
  '"use a unique CE Number" leaves the person to work out which one that is');
ck('it says who holds it', /dup\.savedBy \? ' by ' \+ dup\.savedBy/.test(app));
ck('and the taken number is remembered so the next attempt moves on',
  (app.match(/setCeNums\(p => p\.indexOf\(ceNum\) < 0/g) || []).length >= 2);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE numbering OK');
process.exit(bad ? 1 : 0);
