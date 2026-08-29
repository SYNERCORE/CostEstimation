#!/usr/bin/env node
/*
 * Default notes and signatories, per CE type and discipline.
 *
 * The roster was hardcoded in App.js twice -- the initial state AND handleNew
 * -- so every CE started with the same five names whoever was estimating and
 * whatever kind of job it was. Presets configured in the Users tab replace it.
 *
 * The dangerous half is re-applying. Changing the CE type must NOT throw away
 * notes and names an estimator has just typed, and a loaded CE or a resumed
 * draft carries its own -- neither may be overwritten by a preset.
 *
 * Run: node tools/test-ce-defaults.js
 */
'use strict';

const fs = require('fs');
const cfgSrc = fs.readFileSync('src/config.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');
const panel = fs.readFileSync('src/components/CeDefaultsPanel.js', 'utf8');

let fails = 0;
const ck = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + extra : '')); fails++; }
};

/* ---- the matcher, run for real ------------------------------------------ */
const g = {};
new Function('g', 'with(g){' + cfgSrc + '\ng.ceDefaultFor=ceDefaultFor;g.CE_FALLBACK_APPROVERS=CE_FALLBACK_APPROVERS;g.CE_DISCIPLINES=CE_DISCIPLINES;}')(g);

const P = [
  {id: 1, ceType: 'ANY', discipline: 'ANY', tag: 'catch-all'},
  {id: 2, ceType: 'ANY', discipline: 'Mechanical', tag: 'any+mech'},
  {id: 3, ceType: 'onsite', discipline: 'ANY', tag: 'onsite+any'},
  {id: 4, ceType: 'onsite', discipline: 'Mechanical', tag: 'onsite+mech'}
];
const pick = (t, d) => { const r = g.ceDefaultFor(P, t, d); return r ? r.tag : '(none)'; };

console.log('most specific preset wins:');
ck('Onsite + Mechanical takes the exact match', pick('onsite', 'Mechanical') === 'onsite+mech', pick('onsite', 'Mechanical'));
ck('Onsite + Civil falls back to the type', pick('onsite', 'Civil') === 'onsite+any', pick('onsite', 'Civil'));
ck('Supply + Mechanical falls back to the discipline', pick('supply', 'Mechanical') === 'any+mech', pick('supply', 'Mechanical'));
ck('Supply + Civil lands on the catch-all', pick('supply', 'Civil') === 'catch-all', pick('supply', 'Civil'));
ck('nothing configured matches nothing', g.ceDefaultFor([], 'onsite', 'Civil') === null,
  'returning a preset here would invent signatories nobody set');
ck('a tie keeps the one entered first',
  g.ceDefaultFor([{ceType: 'onsite', discipline: 'Civil', tag: 'first'}, {ceType: 'onsite', discipline: 'Civil', tag: 'second'}], 'onsite', 'Civil').tag === 'first',
  'otherwise reordering the admin list would silently change which applies');
ck('an unknown discipline still reaches the catch-all', pick('onsite', 'Marine') === 'onsite+any', pick('onsite', 'Marine'));

console.log('\nthe hardcoded roster is gone from App.js:');
for (const n of ['Kenneth Mendoza', 'Fernando Bautista', 'Warren Maralit'])
  ck('no "' + n + '" written into the CE state', !new RegExp("name: '" + n + "'").test(app),
    'a name in two places drifts, and cannot be changed without a deploy');
ck('the fallback lives in config.js, once', (cfgSrc.match(/CE_FALLBACK_APPROVERS/g) || []).length === 1);
ck('and both the initial state and handleNew go through it',
  /useState\(JSON\.parse\(JSON\.stringify\(CE_FALLBACK_APPROVERS\)\)\)/.test(app) && /applyCeDefaults\(ceType, BLANK_INFO\.projType, true\)/.test(app));

console.log('\nre-applying never destroys typed work:');
ck('it re-applies on CE type and discipline change', /\}, \[ceType, info\.projType, ceDefaults\]\);/.test(app));
ck('but only while nothing has been edited since', /if \(_defaultsUntouched\(\)\) applyCeDefaults/.test(app),
  'switching Onsite to Supply would otherwise wipe notes just typed');
ck('"untouched" compares the actual content, not a flag',
  /_defaultsSig\.current === JSON\.stringify\(\{n: notes\.map/.test(app));
ck('a loaded CE is marked as owning its own', /_defaultsSig\.current = '';[\s\S]{0,120}resumed draft|came from the CE, not from a preset/.test(app));
ck('so is a resumed draft', /a resumed draft owns its notes and signatories/.test(app));
ck('and the manual button confirms before discarding edits',
  /if \(!_defaultsUntouched\(\) && !confirm\(/.test(app));
ck('it says so when no preset matches, rather than blanking the CE',
  /No preset matches this CE type and discipline/.test(app));

/* Setting up the next pairing means copying a roster and changing a name or
   two. Retyping seven signatories per preset is how a roster ends up wrong. */
console.log('\nsetting up the next preset:');
ck('a preset can be duplicated', /\}, 'Duplicate'\)/.test(panel));
ck('the copy is independent, not a shared reference',
  /JSON\.parse\(JSON\.stringify\(p\)\)/.test(panel),
  'editing the copy would otherwise edit the original too');
ck('and gets its own id', /copy\.id = 'd' \+ Date\.now\(\)/.test(panel),
  'a duplicate React key sends edits to the wrong card');
ck('it lands next to the one it came from', /x\.slice\(0, i \+ 1\), copy/.test(panel));

/* The preset is shared with everyone, so it cannot name the preparer -- that
   is whoever is signed in. Leaving it blank meant CEs went out with an unnamed
   "Prepared By" unless the estimator remembered to type it. */
console.log('\nprepared by:');
ck('the signed-in user fills in Prepared By',
  /if \(\/prepared\/i\.test\(a\.role \|\| ''\) && !String\(a\.name \|\| ''\)\.trim\(\)\) a\.name = _me;/.test(app));
ck('from their full name, falling back to the username',
  /currentUser\.name \|\| currentUser\.username/.test(app));
ck('a preset that already names someone is left alone',
  /!String\(a\.name \|\| ''\)\.trim\(\)/.test(app));
ck('and the fill happens before the untouched-signature is taken',
  app.indexOf('a.name = _me') < app.indexOf('_defaultsSig.current = JSON.stringify'),
  'otherwise a new CE looks edited the moment it opens, and the preset stops re-applying');

console.log('\nstorage:');
ck('presets go to SharePoint so everyone shares them', /async function dbSaveCeDefaults/.test(db));
ck('on the Companies list, which every site already has', /spList\('Companies'\),"Title eq '"\+CE_DEFAULTS_KEY/.test(db),
  'a new list would need "Repair lists & columns" run before the feature worked');
ck('mirrored locally first, so a SharePoint failure does not lose them',
  /localStorage\.setItem\('shic:ce_defaults'[\s\S]{0,200}if\(USE_SP\|\|getSiteURL\(\)\)/.test(db));
ck('and the panel says when it only reached this browser',
  /SharePoint did not accept it/.test(panel));
ck('blank notes and nameless signatories are dropped on save',
  /\.filter\(Boolean\)/.test(panel) && /a\.role \|\| ''\)\.trim\(\) \|\| \(a\.name/.test(panel),
  'a preset of blanks fills every new CE with blanks');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nCE defaults OK');
process.exit(fails ? 1 : 0);
