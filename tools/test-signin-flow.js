/* Sign in to Microsoft on a tablet. The Sign in button did nothing there: the app tried a
   silent sign-in first (slow), the tablet then refused the popup because the tap was
   too old, MSAL threw a code nobody handled, and the failure was swallowed without a
   word. This drives the real sp.js against a pretend MSAL and holds it to:
     - a blocked popup falls back to the full-page sign-in, on any device
     - a touch device or an installed app goes straight to the full-page sign-in
     - the work on screen is saved before the page leaves
     - a failure is reported, never silent
   Run: node tools/test-signin-flow.js */
'use strict';
const fs = require('fs'), vm = require('vm');
let bad = 0; const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

async function scenario({ interactive = true, ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', touch = 0, standalone = false, signedBefore = true, popup = 'ok', silentMs = 0, online = true, accounts = 1 }) {
  const log = { popup: 0, redirect: 0, silent: 0, saved: 0, order: [] };
  const store = { shic_sp_config: JSON.stringify({ clientId: 'cid', siteUrl: 'https://x.sharepoint.com/sites/s' }) };
  const err = (code, message) => Object.assign(new Error(message || code), { errorCode: code });
  class App {
    constructor() {}
    async initialize() {} async handleRedirectPromise() { return null; }
    getAllAccounts() { return accounts ? [{ username: 'u' }] : []; }
    async acquireTokenSilent() { log.silent++; log.order.push('silent'); await new Promise(r => setTimeout(r, silentMs)); throw err('interaction_required'); }
    async acquireTokenPopup() {
      log.popup++; log.order.push('popup');
      if (popup === 'blocked') throw err('empty_window_error', 'window.open returned null');
      if (popup === 'cancelled') throw err('user_cancelled');
      if (popup === 'busy') throw err('interaction_in_progress');
      return { accessToken: 'tok', expiresOn: new Date(Date.now() + 3600000) };
    }
    async acquireTokenRedirect() { log.redirect++; log.order.push('redirect'); }
  }
  const win = { location: { origin: 'https://synercore.github.io', pathname: '/CostEstimation/index.html' }, dispatchEvent() {}, _shicBeforeSignInRedirect: async () => { log.saved++; log.order.push('saved'); } };
  const ctx = {
    window: win, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    sessionStorage: { _k: { 'msal.interaction.status': 'x' }, removeItem(k) { delete this._k[k]; } },
    navigator: { userAgent: ua, maxTouchPoints: touch, onLine: online }, matchMedia: q => ({ matches: standalone && /standalone/.test(q) }),
    msal: { PublicClientApplication: App }, logSwallowed() {}, console: { warn() {}, error() {}, info() {}, log() {} }, setTimeout, clearTimeout, Date, Promise, Object, String, Event: class { },
    document: {}, isTestMode: () => false
  };
  ctx.sessionStorage.__proto__.removeItem = function (k) { delete this._k[k]; };
  Object.defineProperty(ctx.sessionStorage, 'length', { get() { return Object.keys(this._k).length; } });
  ctx.Object = Object;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('src/sp.js', 'utf8') + '\n;this.X={spSignIn,getSPToken};', ctx);
  if (signedBefore) vm.runInContext('_spNeedsSignIn=true;', ctx);
  let out, threw = null;
  try { out = interactive ? await ctx.X.spSignIn() : await ctx.X.getSPToken({}); } catch (e) { threw = e; }
  return { out, threw, log };
}

(async () => {
  let r;
  r = await scenario({ popup: 'ok', signedBefore: false, accounts: 1 });
  ck('desktop: a working popup signs in', r.out === 'tok' && r.log.popup === 1 && r.log.redirect === 0);

  r = await scenario({ popup: 'blocked', signedBefore: true });
  ck('desktop: the dead session is not tried silently first (that wasted the tap)', r.log.silent === 0, JSON.stringify(r.log.order));
  ck('a blocked popup (empty_window_error) falls back to the full-page sign-in', r.log.redirect === 1 && !r.threw, r.threw && r.threw.message);
  ck('and the work on screen is saved before the page leaves', r.log.order.join() === 'popup,saved,redirect', r.log.order.join());

  r = await scenario({ ua: 'Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/120 Safari/537.36', popup: 'ok' });
  ck('Android tablet: straight to the full-page sign-in, no popup attempted', r.log.popup === 0 && r.log.redirect === 1 && r.log.saved === 1, r.log.order.join());
  ck('which is not reported as a failure', !r.threw && r.out === null);

  r = await scenario({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', touch: 5, popup: 'ok' });
  ck('iPad (reports Macintosh, has touch): full-page sign-in', r.log.popup === 0 && r.log.redirect === 1);

  r = await scenario({ standalone: true, popup: 'ok' });
  ck('an installed app: full-page sign-in', r.log.popup === 0 && r.log.redirect === 1);

  r = await scenario({ popup: 'cancelled' });
  ck('closing the popup is reported, and does not take the page away', r.log.redirect === 0 && r.threw && /cancel/i.test(r.threw.message), r.threw && r.threw.message);

  r = await scenario({ popup: 'busy' });
  ck('a popup already open falls back to the full-page sign-in', r.log.redirect === 1);

  r = await scenario({ online: false });
  ck('offline: says so', r.threw && /offline/i.test(r.threw.message), r.threw && r.threw.message);

  /* Background reads must never open a window or take the page away. */
  r = await scenario({ interactive: false, signedBefore: false, popup: 'ok' });
  ck('a background read with a dead session opens nothing and moves nothing', r.out === null && r.log.popup === 0 && r.log.redirect === 0 && !r.threw, r.log.order.join());
  r = await scenario({ interactive: false, ua: 'Mozilla/5.0 (Linux; Android 13) Mobile', signedBefore: false });
  ck('not even on a tablet', r.log.popup === 0 && r.log.redirect === 0 && r.log.saved === 0);
  r = await scenario({ interactive: false, online: false });
  ck('offline, nothing is attempted at all', r.out === null && r.log.silent === 0 && r.log.popup === 0);

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nsign-in flow OK');
  process.exit(bad ? 1 : 0);
})();
