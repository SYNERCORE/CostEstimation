#!/usr/bin/env node
/*
 * The spreadsheet, PDF and Word libraries (1.8 MB between them) are not loaded at startup; src/lazylib.js loads each the first
 * time anything reads it, so no call site had to change. This pins that: the page does not load them up front, the service worker
 * still caches them for offline, and the loader loads once, only on first use, and recovers from a failed fetch.
 *
 * Run: node tools/test-lazy-libs.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const html = R('index.html'), sw = R('sw.js');
const LIBS = ['xlsx.full.min.js', 'pdf.min.js', 'mammoth.browser.min.js'];

console.log('the page does not load them up front:');
LIBS.forEach(l => ck(l + ' is not a script tag', html.indexOf('vendor/' + l) < 0));
const tagAt = html.indexOf('src/lazylib.js');
ck('the loader is a script tag', tagAt > 0);
ck('and it comes before every script of the app', tagAt > 0 && tagAt < html.indexOf('src/constants.js'),
  'a library read before the loader runs would be undefined');
ck('after React, which it does not need', tagAt > html.indexOf('react-dom.production.min.js'));

console.log('\nbut they are still there offline:');
LIBS.forEach(l => {
  ck(l + ' ships in vendor/', fs.existsSync(path.join(__dirname, '..', 'vendor', l)));
  ck(l + ' is in the service worker\'s extra cache list', new RegExp("const EXTRA=\\[[^\\]]*'\\./vendor/" + l.replace(/\./g, '\\.') + "'").test(sw),
    'not a script tag any more, so only EXTRA keeps it for offline use');
});

console.log('\nthe loader:');
const code = R('src/lazylib.js');
let fetches = [], mode = 'ok';
global.window = {};
global.XMLHttpRequest = function () {
  const x = this;
  x.open = (m, u, async) => { x.url = u; x.async = async; };
  x.send = () => {
    fetches.push(x.url);
    if (mode === 'fail') { x.status = 404; x.responseText = ''; return; }
    const name = /xlsx/.test(x.url) ? 'XLSX' : /pdf/.test(x.url) ? 'pdfjsLib' : 'mammoth';
    x.status = 200; x.responseText = 'window.' + name + ' = { loaded: "' + name + '" };';
  };
};
new Function(code)();
ck('nothing is fetched while the page loads', fetches.length === 0);
ck('each name is defined, waiting', ['XLSX', 'pdfjsLib', 'mammoth'].every(n => Object.getOwnPropertyDescriptor(window, n) && Object.getOwnPropertyDescriptor(window, n).get));
ck('reading one loads it, from vendor/', window.XLSX.loaded === 'XLSX' && fetches.join() === './vendor/xlsx.full.min.js');
ck('and loads it synchronously (the call sites read it on the next line)', /x\.open\('GET', '\.\/vendor\/' \+ LIBS\[name\], false\)/.test(code),
  'an async fetch would hand back undefined to a caller that reads the library straight away');
const n1 = fetches.length;
void window.XLSX; void window.XLSX.loaded;
ck('a second read does not fetch again', fetches.length === n1);
ck('the others are still untouched', fetches.length === 1);
ck('typeof, as ml_utils guards with it, loads it too', (() => { const t = typeof window.pdfjsLib; return t === 'object' && fetches.length === 2; })());

mode = 'fail';
let err = null;
try { void window.mammoth; } catch (e) { err = e; }
ck('a file that cannot be fetched says so in plain words', err && /Word document library could not be loaded/.test(err.message) && /try again/.test(err.message), err && err.message);
ck('and the name is still waiting, not stuck', (() => { const d = Object.getOwnPropertyDescriptor(window, 'mammoth'); return !!(d && d.get); })());
mode = 'ok';
ck('the next read tries again and succeeds', window.mammoth.loaded === 'mammoth');
window.XLSX = { replaced: true };
ck('a library may still be assigned by hand', window.XLSX.replaced === true);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nlazy libraries OK');
process.exit(bad ? 1 : 0);
