#!/usr/bin/env node
/*
 * Every host the app fetches must be allowed by the page's connect-src.
 *
 * This check exists because of a real outage. The AI provider endpoints were
 * never added to the Content-Security-Policy, so every AI feature -- "Extract
 * Info with AI" and the scope generator -- was dead on the deployed site from
 * the day the CSP landed. The browser blocks the request before it is sent:
 *
 *   Refused to connect to 'https://api.groq.com/openai/v1/chat/completions'
 *   because it violates the document's Content Security Policy.
 *
 * Nothing in the app's own error handling can see that. The fetch rejects with
 * a bare TypeError, so the user got "AI failed: Failed to fetch" -- which reads
 * like a dead API key or a network problem, and sent everyone looking in the
 * wrong place. The policy is in index.html and the fetches are in src/*.js;
 * neither file gives any hint that the other one has to agree.
 *
 * Run: node tools/check-csp-connect.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = rd('index.html');

let fails = 0;
const bad = (msg, detail) => { console.log('  FAIL  ' + msg + (detail ? '  -> ' + detail : '')); fails++; };
const ok = msg => console.log('  PASS  ' + msg);

/* ---- the policy the page ships ------------------------------------------- */
const csp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/) || [])[1];
if (!csp) { console.error('no Content-Security-Policy meta tag in index.html'); process.exit(1); }
const connect = (csp.match(/connect-src ([^;]*)/) || [])[1];
if (!connect) { console.error('no connect-src directive in the CSP'); process.exit(1); }
const allowed = connect.trim().split(/\s+/);
console.log('connect-src allows ' + allowed.length + ' sources');

/* A source matches a host if it is identical, or a *. wildcard one level up.
   Mirrors the CSP host-matching rule closely enough for this purpose. */
const permits = host => allowed.some(src => {
  if (src === "'self'" || src === '*') return src === '*';
  const s = src.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (s === host) return true;
  if (s.startsWith('*.')) return host.endsWith(s.slice(1)) && host.length > s.length - 1;
  return false;
});

/* ---- every absolute URL the app fetches ---------------------------------- */
const SRC = ['src/ai.js', 'src/ai_models.js', 'src/db.js', 'src/sp.js'];
const found = [];
for (const f of SRC) {
  let body;
  try { body = rd(f); } catch (_) { continue; }
  /* fetch( and any wrapper around it, e.g. aiFetch( */
  for (const m of body.matchAll(/[Ff]etch\(\s*['"`](https?:\/\/[^'"`?\s]+)/g))
    found.push({ file: f, host: new URL(m[1]).host });
}
if (!found.length) { console.error('no absolute fetch() URLs found -- has the matcher gone stale?'); process.exit(1); }

const hosts = [...new Set(found.map(x => x.host))].sort();
console.log('\nHosts the app fetches (' + hosts.length + '):');
for (const h of hosts) {
  const where = found.filter(x => x.host === h)[0].file;
  if (permits(h)) ok(h + '  (' + where + ')');
  else bad(h + '  (' + where + ')', 'the browser will refuse to connect -- add it to connect-src in index.html');
}

/* The Azure OpenAI endpoint is typed in by the user, so it never appears as a
   literal in the source. It still has to be permitted or the Copilot provider
   is dead the same way -- and being user-supplied, it is the one nobody would
   think to check. */
console.log('\nThe provider whose endpoint is typed in at runtime:');
if (/getAzureEndpoint\(\)/.test(rd('src/ai.js'))) {
  const azure = ['x.openai.azure.com', 'x.cognitiveservices.azure.com', 'x.services.ai.azure.com'];
  const missing = azure.filter(h => !permits(h));
  if (missing.length) bad('Azure OpenAI hosts are not permitted', missing.join(', '));
  else ok('Azure OpenAI resource hosts are covered by a wildcard');
} else ok('no user-supplied endpoint provider');

/* Keep the policy honest in the other direction too: connect-src is the list
   of places this app may send data, and an entry nothing calls is one nobody
   has justified. Fonts are loaded by the stylesheet, not fetch(). */
console.log('\nNothing is allowed that nothing uses:');
const EXPECTED_UNCALLED = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const stale = allowed
  .filter(s => s !== "'self'")
  .map(s => s.replace(/^https?:\/\//, '').replace(/^\*\./, ''))
  .filter(h => !EXPECTED_UNCALLED.includes(h))
  .filter(h => !hosts.some(x => x === h || x.endsWith('.' + h)))
  .filter(h => !/azure\.com$/.test(h) && !/microsoftonline\.com$/.test(h) && !/sharepoint\.com$/.test(h));
if (stale.length) bad('allowed but never called', stale.join(', ') + ' -- remove it or explain it here');
else ok('every remaining source has a caller');


/* The policy being right is half of it. When a request IS blocked -- a new
   provider, a stricter host -- the app must say so instead of blaming the key. */
console.log('\nA blocked request explains itself:');
const aisrc = rd('src/ai.js');
const wrapped = (aisrc.match(/await aiFetch\(/g) || []).length;
const bare = (aisrc.match(/const r = await fetch\(/g) || []).length;
if (wrapped >= 6 && bare === 0) ok('all ' + wrapped + ' provider calls go through aiFetch');
else bad('provider calls bypass aiFetch', wrapped + ' wrapped, ' + bare + ' bare');
if (/name === ['"]TypeError['"]/.test(aisrc)) ok('a bare TypeError is recognised as a blocked request');
else bad('nothing catches the TypeError fetch throws on a CSP block');
if (/not your API key/.test(aisrc)) ok('and the message says it is not the API key');
else bad('the message must rule out the API key', 'that is where everyone looks first');
if (/navigator.onLine === false/.test(aisrc)) ok('being offline is told apart from being blocked');
else bad('offline and blocked give the same message');


/* A model id the provider has retired fails exactly like a bad key from the
   user's side: a 4xx and some vendor wording. Google shut gemini-2.0-flash
   down while it was still this app's DEFAULT provider, so the AI was broken
   out of the box and the toast relayed "Bad Request". Keep the ids in one
   table that can be checked against a deprecation page, and make the failure
   name the cause. */
console.log('\nModel ids are in one place, and failures say what to do:');
const models = (aisrc.match(/const AI_MODELS = \{([\s\S]*?)\};/) || [])[1] || '';
if (models) ok('AI_MODELS registry exists');
else bad('model ids are scattered through the fetch blocks', 'one per provider, six places to miss');
/* Code only -- the comment above AI_MODELS names the dead model deliberately,
   to say why the table is there. Stripping comments keeps the check honest
   without forbidding the explanation. */
const aiCode = aisrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
if (!/gemini-2\.0-flash/.test(aiCode)) ok('the shut-down gemini-2.0-flash is gone');
else bad('still calling gemini-2.0-flash', 'Google shut it down -- every Gemini call 400s');
const inlineModel = /model: '[a-z0-9][^']*'/.test(aisrc.replace(/const AI_MODELS[\s\S]*?\};/, ''));
if (!inlineModel) ok('no provider hardcodes its own model id');
else bad('a provider bypasses AI_MODELS', 'that is the one that goes stale unnoticed');
const throws = (aisrc.match(/throw aiHttpError\(/g) || []).length;
if (throws >= 6) ok('all ' + throws + ' provider failures go through aiHttpError');
else bad('a provider still throws the raw vendor message', throws + ' mapped');
for (const [what, re] of [['a rejected key says to replace the key', /API key was rejected\. Click the key button/],
                          /* Anchored to the 404 branch itself. The same wording also appears
                             in the 400 branch, so an unanchored match stayed green when the
                             404 guidance was removed. */
                          ['a 404 blames the model, not the user',
                           /status === 404\)[\s\S]{0,200}?has most likely been retired/],
                          ['a 429 mentions the free quota', /rate limiting or the free quota/],
                          ['a 5xx says it is their end', /trouble at their end/]])
  (re.test(aisrc) ? ok(what) : bad('missing: ' + what));
if (/status === 400 && \/api key/.test(aisrc)) ok('Gemini-style 400-for-a-bad-key is recognised');
else bad('a 400 that is really a bad key reads as a malformed request');
/* This is the branch the reported failure actually lands in: Gemini answers a
   retired model with 400, not 404, so without it the user is told only "Bad
   Request" for the one fault they cannot guess. */
if (/status === 400 &&[\s\S]{0,120}?deprecat[\s\S]{0,200}?has most likely been retired/.test(aisrc))
  ok('a 400 naming the model is reported as a retired model');
else bad('a retired model reported as 400 is not recognised', 'Gemini answers 400, not 404 -- this is the real case');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nCSP connect-src OK');
process.exit(fails ? 1 : 0);
