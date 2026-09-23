#!/usr/bin/env node
/* An uncaught "SyntaxError: Unexpected end of input" appeared on load and said
   nothing else -- no file, no line. It could not be reproduced from a clean
   cache, nor across a version bump; it was seen only while a stale service
   worker was serving an older build alongside a newer one.

   So: the two things that can serve a browser something that is not the
   JavaScript it asked for are closed, and whatever happens next names itself
   rather than arriving as four words in a console nobody reads.

   Run: node tools/test-load-errors.js */
'use strict';
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const sp = fs.readFileSync('src/sp.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- the error names itself ---- */
const rep = (html.match(/<script>\/\* An uncaught SyntaxError[\s\S]*?<\/script>/) || [''])[0];
ck('there is a reporter, and it is in the page', !!rep);
ck('it runs before anything it is there to catch',
  html.indexOf(rep) < html.indexOf('<script src='), );
ck('it parses', (() => { try { new Function(rep.replace(/^<script>/, '').replace(/<\/script>$/, '')); return true; } catch (e) { return false; } })());
ck('it is one line, so nothing in it can be cut in half by a newline', rep.indexOf('\n') < 0);
ck('it reports the file and the line', rep.includes("(e&&e.filename)||''") && rep.includes("(e&&e.lineno)||0"));
ck('and the first lines of the stack', rep.includes('.slice(0,3)'));
ck('a script that could not be fetched at all is told apart from one that would not parse',
  rep.includes("e.target.tagName==='SCRIPT'&&!e.message"));
ck('a promise nobody caught is reported too', rep.includes("addEventListener('unhandledrejection'"));
ck('the same error twice does not fill the console', rep.includes('if(seen[k])return;seen[k]=1;'));
ck('and when it is a script the app needs, it says so where it will be read',
  rep.includes('A script of the app did not load properly') && rep.includes('Reload the page'));
ck('it says that clearing the site data is the cure for the stubborn case',
  rep.includes('clear the site data'));
ck('it never throws on its way to reporting', rep.includes('try{') && rep.includes('}catch(e){}'));

/* ---- a half-cached script cannot be stored, or served ---- */
ck('only a whole response is cached at install',
  sw.includes("r.status===200?c.put(u,r):Promise.reject(r.status)"));
ck('206 Partial Content is not "ok" enough, and the comment says why',
  sw.includes('206 Partial Content is "ok" and is half a') && !/if\(res&&res\.ok\)\{const clone/.test(sw));
ck('a partial response already in the cache is not served',
  sw.includes("caches.match(e.request).then(r=>(r&&r.status===200)?r:fetch(e.request)"));
ck('and what is fetched is only stored when it is whole',
  sw.includes('if(res&&res.status===200){const clone=res.clone();'));
ck('the worker reports its own failures, which reached nobody before',
  sw.includes("self.addEventListener('error'") && sw.includes("self.addEventListener('unhandledrejection'"));

/* ---- a library that comes back as a web page ---- */
ck('a remote library that neither runs nor fails is given up on',
  sp.includes("setTimeout(()=>end(false,'no answer in 15s -- blocked, or not JavaScript'),15000);"));
ck('it settles once, whichever happens first', sp.includes('let done=false;') && sp.includes('if(done)return;done=true;'));
ck('one that loads and defines nothing is a failure, not a success',
  sp.includes("throw new Error('loaded but defined nothing"));
ck('and the next source is tried, with the reason named',
  sp.includes("console.warn('MSAL CDN failed:',url,(e&&e.message)||e);"));
ck('it is still a script tag, so the fallback needs no CORS to work',
  sp.includes("const s=document.createElement('script');") && sp.includes('s.src=url;'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nload errors OK');
process.exit(bad ? 1 : 0);
