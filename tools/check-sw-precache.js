#!/usr/bin/env node
/*
 * Keeps the service worker's precache list identical to the scripts index.html
 * actually loads, including the ?v= cache-busting query.
 *
 * Why: sw.js precached only the shell (4 files) while index.html loads 21
 * application scripts. Offline, the page came back but none of the app did.
 * And because ?v= changes every release, a stale precache list would silently
 * cache the previous build's files forever.
 *
 *   node tools/check-sw-precache.js        verify (used in CI)
 *   node tools/check-sw-precache.js --fix  rewrite sw.js from index.html
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FIX = process.argv.includes('--fix');

const htmlPath = path.join(ROOT, 'index.html');
const swPath = path.join(ROOT, 'sw.js');
const html = fs.readFileSync(htmlPath, 'utf8');
let sw = fs.readFileSync(swPath, 'utf8');

/* Local scripts index.html loads, in order, with their query strings. */
const wanted = [];
const re = /<script src="(\.\/[^"]+)"><\/script>/g;
let m;
while ((m = re.exec(html))) wanted.push(m[1]);
if (!wanted.length) { console.error('no local <script src> tags found in index.html'); process.exit(1); }

/* Every referenced file must exist. */
const missing = wanted.filter(u => !fs.existsSync(path.join(ROOT, u.split('?')[0].replace(/^\.\//, ''))));
if (missing.length) {
  console.error('index.html references files that do not exist:\n  ' + missing.join('\n  '));
  process.exit(1);
}

/* The ?v= in index.html and the sw CACHE version must agree, or a new build
   would be served out of the previous build's cache bucket. */
const htmlVer = (wanted[0].match(/\?v=([^"&]+)/) || [])[1] || null;
const swVer = (sw.match(/const CACHE='shic-ce-v([^']+)'/) || [])[1] || null;
const allSameVer = wanted.every(u => (u.match(/\?v=([^"&]+)/) || [])[1] === htmlVer);

const block = 'const APP=[\n' + wanted.map(u => "  '" + u + "'").join(',\n') + '\n];';

if (FIX) {
  sw = sw.replace(/const APP=\[[\s\S]*?\n\];/, block);
  if (htmlVer && swVer !== htmlVer) sw = sw.replace(/const CACHE='shic-ce-v[^']+'/, "const CACHE='shic-ce-v" + htmlVer + "'");
  fs.writeFileSync(swPath, sw);
  console.log('sw.js precache list rewritten from index.html (' + wanted.length + ' scripts, v' + htmlVer + ')');
  process.exit(0);
}

const problems = [];
if (!allSameVer) problems.push('index.html mixes ?v= values; every script tag should carry the same one');
if (htmlVer && swVer && htmlVer !== swVer) problems.push("index.html uses ?v=" + htmlVer + " but sw.js CACHE is shic-ce-v" + swVer + " — bump them together");

const cur = (sw.match(/const APP=\[([\s\S]*?)\n\];/) || [, ''])[1];
const have = [...cur.matchAll(/'([^']+)'/g)].map(x => x[1]);
const missingFromSw = wanted.filter(u => !have.includes(u));
const extraInSw = have.filter(u => !wanted.includes(u));
if (missingFromSw.length) problems.push('sw.js does not precache:\n     ' + missingFromSw.join('\n     '));
if (extraInSw.length) problems.push('sw.js precaches files index.html no longer loads:\n     ' + extraInSw.join('\n     '));

/* The build marker the UI shows must be derived from the release, not typed.
   It was the literal '20260528' and nothing ever bumped it, so the app told
   you it was running a build from months earlier than it was. A version marker
   that lies is worse than none, because it gets believed -- two bug reports
   were filed against builds that had already been fixed, and the only reliable
   way to tell which build was live was reading ?v= off a DevTools stack
   trace. */
try {
  const upd = fs.readFileSync(path.join(ROOT, 'src/update.js'), 'utf8');
  const lit = upd.match(/const APP_BUILD\s*=\s*['"][^'"]+['"]/);
  if (lit) problems.push('src/update.js hardcodes ' + lit[0].trim() + ' — derive it from the script tag\'s ?v= instead, or it goes stale the first time nobody bumps it');
  else if (!/const APP_BUILD\s*=\s*\(/.test(upd)) problems.push('src/update.js no longer defines APP_BUILD; the UI build marker will read "?"');
} catch (_) { /* update.js is optional */ }

if (problems.length) {
  console.error('\nservice worker precache is out of step with index.html:\n');
  problems.forEach(p => console.error('  - ' + p));
  console.error('\nRun: node tools/check-sw-precache.js --fix\n');
  process.exit(1);
}
console.log('sw precache OK (' + wanted.length + ' scripts, v' + htmlVer + ')');
