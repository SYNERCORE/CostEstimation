#!/usr/bin/env node
/*
 * CE Monitoring attachments: stored on SharePoint, reachable by everyone.
 *
 * The storage was always right -- they are real SharePoint list attachments on
 * SHICCE_Monitoring, one set per CE, shared by anyone with access to the list.
 * The LINKS were not.
 *
 * SharePoint answers with a SERVER-relative url: /sites/TSG/Lists/... . This
 * app is served from synercore.github.io, so using one straight as an href
 * resolved it against github.io:
 *
 *   https://synercore.github.io/sites/TSG/Lists/.../drawing.pdf   -> 404
 *
 * and the source-document link, which put the site url in front of it, doubled
 * the path SharePoint had already included:
 *
 *   https://…sharepoint.com/sites/TSG/sites/TSG/Lists/.../drawing.pdf -> 404
 *
 * So every attachment uploaded was stored correctly and could be opened by
 * nobody, including the person who uploaded it. Only the ORIGIN belongs in
 * front of a server-relative path.
 *
 * Run: node tools/test-attachments.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const sp = fs.readFileSync('src/sp.js', 'utf8');
const raw = fs.readFileSync('src/App.js', 'utf8');
const app = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const db = fs.readFileSync('src/db.js', 'utf8');
const reg = fs.readFileSync('src/components/RegisterPage.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* --- run the real url builder --- */
const SITE = 'https://synercore.sharepoint.com/sites/TSG';
const ctx = {URL, getSiteURL: () => SITE};
vm.createContext(ctx);
vm.runInContext((sp.match(/function spAbsUrl\(u\)\{[\s\S]*?\n\}/) || [''])[0] + ';globalThis._a=spAbsUrl;', ctx);
const A = ctx._a;

console.log('a server-relative url is resolved against the SITE, not this app:');
const rel = '/sites/TSG/Lists/SHICCE_Monitoring/Attachments/42/drawing.pdf';
ck('the origin is put in front', A(rel) === SITE.replace('/sites/TSG', '') + rel, A(rel));
ck('and the path is NOT doubled', !/\/sites\/TSG\/sites\/TSG/.test(A(rel)),
  'site url + server-relative path repeats the part SharePoint already gave');
ck('it points at SharePoint, not the host the app is served from',
  A(rel).indexOf('sharepoint.com') > 0 && A(rel).indexOf('github.io') < 0);
ck('an absolute url is left alone', A('https://x.com/a.pdf') === 'https://x.com/a.pdf');
ck('a blank one is blank, not "undefined"', A('') === '' && A(null) === '' && A(undefined) === '');

console.log('\nevery link to a stored file goes through it:');
ck('the Monitoring attachment list', /href: spAbsUrl\(f\.ServerRelativeUrl\)/.test(app));
ck('the source document, in both places',
  (app.match(/href: spAbsUrl\(docFile\.spUrl\)/g) || []).length === 2);
ck('and no raw server-relative href is left',
  !/href: f\.ServerRelativeUrl/.test(app) && !/href: SITE_URL \+ /.test(app),
  'one left behind is one link that silently 404s');

console.log('\nthey are stored on SharePoint, not in this browser:');
ck('uploaded as a real list attachment',
  /spAddAttachment\(spList\('Monitoring'\), spId, file\.name, buf\)/.test(app));
ck('against the CE\'s own monitoring item', /let spId = _monSpIdCache\[ceId\];/.test(app));
ck('and the item is created first if it has none',
  /await dbSaveMonEntry\(ceId, ceNum, monData\[ceId\] \|\| \{\}\)/.test(app),
  'no monitoring record means nowhere to hang the file');
ck('nothing is kept in localStorage instead',
  !/LS\.set\('attach/.test(app) && !/localStorage.*attach/i.test(app),
  'a file in one browser is a file nobody else can open');

console.log('\nand the list they hang on is shared, not per-user:');
ck('the monitoring read has no user filter',
  /spGet\(spList\('Monitoring'\),"Title ne 'config'"/.test(db),
  'filtering by savedBy here would hide every other estimator\'s attachments');
ck('the SP item id is cached for every CE read back',
  /_monSpIdCache\[cid\]=item\.Id/.test(db));
ck('the list is created as a generic list, which allows attachments',
  /BaseTemplate:100/.test(reg));

console.log('\nan unreadable list is not reported as an empty one:');
ck('a failed read throws rather than returning []',
  /if\(!r\.ok\) throw new Error\('SP attachments '\+r\.status\);/.test(sp),
  'returning [] made a failure indistinguishable from a CE with no documents');
ck('so does a missing token', /if\(!tok\) throw new Error\('not signed in to SharePoint'\);/.test(sp));
ck('the panel keeps the reason', /const \[attachErr, setAttachErr\] = React\.useState\(''\)/.test(app));
ck('and shows it instead of "No attachments yet"',
  /attachList\.length === 0 && !attachBusy && !attachErr &&/.test(app));
ck('the empty state is only shown when the read actually succeeded',
  /attachErr && !attachBusy &&/.test(app));
ck('and it says the files are still there',
  /have not been deleted/.test(raw),
  'someone told their drawings are gone will re-upload them');
ck('the error is cleared when the panel is reopened',
  /setAttachPanel\(ceId\); setAttachList\(\[\]\); setAttachErr\(''\);/.test(app),
  'a stale error would stick to the next CE opened');

console.log('\ndeleting one follows the same rule as deleting the CE:');
/* Against the comment-stripped copy, so /*#__PURE__*\/ is not in the way. */
ck('the button is admin/owner only',
  /isAdmin && React\.createElement\("button", \{\s*style:\{\.\.\.btn\('danger',true\),fontSize:10,padding:'2px 6px'/.test(app),
  'an attachment on a saved CE is a drawing or a TOR the estimate was built from');
ck('and the handler refuses regardless of the button',
  /if \(!isAdmin\) \{ showToast\('Only an admin or the owner can delete an attachment\.', true\); return; \}/.test(app),
  'the UI is not a permission boundary and this call reaches SharePoint');
ck('the check runs before the SharePoint delete',
  app.indexOf('Only an admin or the owner can delete an attachment') <
  app.indexOf("spDeleteAttachment(spList('Monitoring')"),
  'a guard after the call is not a guard');
ck('isAdmin is the owner-inclusive test', /const isAdmin = hasAdminPowers\(currentUser\.role\)/.test(app),
  'hasAdminPowers is owner OR admin, so the owner is never locked out');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nattachments OK');
process.exit(bad ? 1 : 0);
