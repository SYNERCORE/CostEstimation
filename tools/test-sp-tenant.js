/* Sign-in goes to the tenant the SharePoint site lives in, not to whichever
   tenant the account happens to belong to. Run: node tools/test-sp-tenant.js */
'use strict';
const sp = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'sp.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || x === undefined ? '' : '  -> ' + x)); if (!c) bad++; };
const a = sp.indexOf('function spAuthorityTenant');
const t = new Function(sp.slice(a, sp.indexOf('function spSetupLink')) + '; return spAuthorityTenant;')();
const SITE = 'https://365synercore.sharepoint.com/sites/SHICPORTAL';
ck('derived from a SharePoint Online address', t({}, SITE) === '365synercore.onmicrosoft.com', t({}, SITE));
ck('read from the saved config when only that has the address', t({ siteUrl: SITE }) === '365synercore.onmicrosoft.com');
ck('an explicit tenant id always wins', t({ tenantId: 'aaaa-bbbb' }, SITE) === 'aaaa-bbbb');
ck('a site that is not *.sharepoint.com falls back to common', t({}, 'https://intranet.example.com/sites/x') === 'common');
ck('no site and no tenant falls back to common, not a crash', t({}, '') === 'common');
ck('upper case in the address does not matter', t({}, 'https://365SynerCore.SharePoint.com/sites/x') === '365synercore.onmicrosoft.com');
ck('a lookalike host is not trusted', t({}, 'https://365synercore.sharepoint.com.evil.test/') === 'common');
ck('sign-in uses it', sp.indexOf('login.microsoftonline.com/\'+spAuthorityTenant(cfg,su)') > 0);
ck('the setup link carries a configured tenant', sp.indexOf('{t: c.tenantId}') > 0 && sp.indexOf('tenantId: String(j.t)') > 0);
console.log(bad ? bad + ' FAILURE(S)' : 'sp tenant OK');
process.exit(bad ? 1 : 0);
