#!/usr/bin/env node
/* Signing reads the CE back, merges the signature in, writes the CE, writes
   the Monitoring row and reloads the list -- seconds, over SharePoint, with
   the signature pad already closed. Nothing said so. The screen sat there
   looking exactly as it had, and the CE reappeared signed a moment later, by
   which time there was no telling whether the click had registered.

   Run: node tools/test-sign-indicator.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

ck('there is a state for it', app.includes('const [apvBusy, setApvBusy] = useState(null);'));
ck('it is raised the moment signing starts, and says which it is',
  app.includes("setApvBusy(action === 'return' ? 'Returning the CE to the estimator' : 'Signing the CE');"));
ck('and lowered however it ends, so a failure cannot leave it spinning',
  app.includes('finally { setApvBusy(null); }'));

/* the finally must belong to apvAct's own try, not to some inner one */
const act = app.slice(app.indexOf('  const apvAct = async (ceId, action, opt = {}) => {'), app.indexOf('  /* Whether it is my turn on the CE open in the viewer.'));
ck('the lowering is the last thing in the signing itself',
  /\} catch \(ex\) \{ showToast\('Could not record that[\s\S]{0,80}finally \{ setApvBusy\(null\); \}/.test(act));
ck('the error path still reports what went wrong', act.includes("showToast('Could not record that: ' + ex.message, true)"));

/* ---- it is said where it can be seen ---- */
ck('it is said over everything, since the pad it began from has closed',
  /apvBusy && [\s\S]{0,200}position:'fixed',inset:0/.test(app));
ck('above the signature pad, not behind it',
  (() => {
    const z = (app.match(/apvBusy && [\s\S]{0,260}?zIndex:(\d+)/) || [])[1];
    const pad = (app.match(/sigModal && [\s\S]{0,120}?zIndex:(\d+)/) || [])[1];
    return z && pad && Number(z) > Number(pad);
  })());
ck('it says what is happening and roughly how long',
  app.includes('Saving to SharePoint. This takes a few seconds \u2014 do not close the CE.'));
ck('and it turns, so a slow save does not read as a frozen one',
  app.includes("animation:'spin .7s linear infinite'"));
ck('using the animation the app already has', fs.readFileSync('index.html', 'utf8').includes('@keyframes spin'));

/* ---- and it cannot be set going twice ---- */
ck('a second click while it is working does nothing', app.includes("if (apvBusy) return false;"));
ck('the button in the editor says it is working',
  app.includes("mine && b(apvBusy ? '✍ Signing…' : '✍ Approve & Sign'"));
ck('the button in the viewer is disabled while it works',
  app.includes('disabled:!!apvBusy') && app.includes('onClick:()=>{if(!apvBusy)apvStartSign(viewCE.id);}'));
ck('and says so rather than just going dim',
  app.includes('apvBusy ? "\u270D Signing\u2026" : "\u270D Approve & Sign"'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nsign indicator OK');
process.exit(bad ? 1 : 0);
