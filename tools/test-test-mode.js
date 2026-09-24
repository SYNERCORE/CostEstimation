/* Test mode is a sandbox for trying the app out. Its whole promise is that
   nothing done inside it can reach SharePoint or the live browser store --
   so the things worth testing are the two walls, not the banner.

   The storage wall is tested by running the real shipped block against a fake
   localStorage: a live key is put in first, and after the swap the app must
   be unable to read it, count it, enumerate it or clear it away. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let fails = 0;
const ok = (cond, what) => { if (!cond) { console.error('  FAIL: ' + what); fails++; } };

/* ── a localStorage good enough to swap ─────────────────────────────── */
function fakeLS(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    key: i => (i >= 0 && i < m.size ? Array.from(m.keys())[i] : null),
    get length() { return m.size; },
    _raw: m
  };
}

/* Run only the test-mode block of constants.js, against a window we control. */
function runBlock(flagOn, seed) {
  const src = R('src/constants.js');
  const at = src.indexOf('/* ── Test mode');
  if (at < 0) { console.error('  FAIL: the test-mode block is gone from src/constants.js'); fails++; return null; }
  const block = src.slice(at);
  const store = fakeLS(Object.assign({}, seed, flagOn ? { 'shic.testmode': '1' } : {}));
  const win = { localStorage: store };
  /* window.localStorage is a getter in a real browser; the block redefines it,
     so the stand-in has to be redefinable too. */
  Object.defineProperty(win, 'localStorage', { value: store, configurable: true, writable: true });
  const api = new Function('window', block + '\nreturn {isTestMode:isTestMode,setTestMode:setTestMode,wipeTestData:wipeTestData,testDataKeys:testDataKeys,TEST_NS:TEST_NS,TEST_MODE_KEY:TEST_MODE_KEY};')(win);
  return { api, win, store };
}

console.log('Test mode');

/* 1. Off by default: the store is left exactly as it was found. */
{
  const r = runBlock(false, { 'shic:history': '[1,2,3]' });
  if (r) {
    ok(r.api.isTestMode() === false, 'test mode reads as on when the flag is absent');
    ok(r.win.localStorage === r.store, 'the store was swapped even though test mode is off');
    ok(r.win.localStorage.getItem('shic:history') === '[1,2,3]', 'live data is not readable with test mode off');
  }
}

/* 2. On: the live store is unreachable in every direction. */
{
  const r = runBlock(true, { 'shic:history': '[1,2,3]', 'shic:masterlist': '{}' });
  if (r) {
    const ls = r.win.localStorage;
    ok(r.api.isTestMode() === true, 'the flag was set but test mode reads as off');
    ok(ls !== r.store, 'localStorage was not swapped in test mode');

    ok(ls.getItem('shic:history') === null, 'LIVE DATA IS READABLE IN TEST MODE');
    ls.setItem('shic:history', 'test junk');
    ok(r.store._raw.get('shic:history') === '[1,2,3]', 'A TEST WRITE OVERWROTE LIVE DATA');
    ok(r.store._raw.get('shictest|shic:history') === 'test junk', 'a test write did not land under the test prefix');

    /* length and key() are what a quota sweep and the migration walk use. */
    const seen = [];
    for (let i = 0; i < ls.length; i++) seen.push(ls.key(i));
    ok(seen.indexOf('shic:masterlist') < 0, 'LIVE KEYS ARE ENUMERABLE IN TEST MODE');
    ok(seen.indexOf('shic:history') >= 0, 'a key written in test mode is not enumerable');
    ok(ls.length === 1, 'length counts something other than the test data (' + ls.length + ')');

    /* clear() inside the sandbox must not empty the real store. */
    ls.clear();
    ok(r.store._raw.get('shic:history') === '[1,2,3]', 'CLEAR() INSIDE TEST MODE DELETED LIVE DATA');
    ok(ls.length === 0, 'clear() did not empty the sandbox');
  }
}

/* 3. Wiping removes test data and only test data. */
{
  const r = runBlock(true, { 'shic:history': '[1,2,3]' });
  if (r) {
    r.win.localStorage.setItem('a', '1');
    r.win.localStorage.setItem('b', '2');
    const n = r.api.wipeTestData();
    ok(n === 2, 'wipeTestData reported ' + n + ' instead of 2');
    ok(r.store._raw.get('shic:history') === '[1,2,3]', 'WIPING TEST DATA DELETED LIVE DATA');
    ok(r.store._raw.get('shic.testmode') === '1', 'wiping test data cleared the test-mode flag');
  }
}

/* 4. Leaving test mode puts the live store back on the next load. */
{
  const r = runBlock(true, { 'shic:history': '[1,2,3]' });
  if (r) {
    r.api.setTestMode(false);
    ok(r.store._raw.get('shic.testmode') === undefined, 'leaving test mode left the flag behind');
    const again = runBlock(false, { 'shic:history': '[1,2,3]' });
    ok(again && again.win.localStorage.getItem('shic:history') === '[1,2,3]', 'live data did not come back after leaving test mode');
  }
}

/* ── the SharePoint wall ─────────────────────────────────────────────
   The sandbox is opened from the same address as the live app, so the
   /sites/ match inside getSiteURL is exactly the trap: without an explicit
   refusal a test CE would be written to the real site. */
{
  const sp = R('src/sp.js');
  const line = sp.split('\n').find(l => l.indexOf('function getSiteURL()') === 0);
  ok(!!line, 'getSiteURL is not where it was in src/sp.js');
  if (line) {
    ok(/isTestMode\(\)\s*\)\s*return\s*null/.test(line), 'getSiteURL does not refuse SharePoint in test mode');
    const mk = testOn => new Function('isTestMode', 'getSPConfig', 'window',
      line + '\nreturn getSiteURL();')(() => testOn, () => ({}), { location: { href: 'https://sy3.sharepoint.com/sites/SHIC/app/index.html' } });
    ok(mk(false) === 'https://sy3.sharepoint.com/sites/SHIC', 'getSiteURL stopped finding the site from the address');
    ok(mk(true) === null, 'TEST MODE STILL RESOLVES A SHAREPOINT SITE');
  }
}

/* ── on screen, on every page ────────────────────────────────────────
   The bar is plain DOM rather than React so that it also shows on the
   sign-in page, the first-run setup, and a screen that failed to mount. */
{
  const html = R('index.html');
  ok(html.indexOf('id="shic-testbar"') > 0, 'the test-mode bar is missing from index.html');
  ok(html.indexOf('shic-testbar-exit') > 0, 'the bar has no way to leave test mode');
  ok(html.indexOf('shic-testbar-wipe') > 0, 'the bar has no way to wipe test data');
  ok(/setTestMode\(false\);location\.reload\(\)/.test(html), 'leaving test mode does not reload');
  ok(html.indexOf('id="shic-testbar"') < html.indexOf('id="root"') || html.indexOf('position:fixed') > 0,
    'the bar is not fixed to the top of the page');
}

/* ── the way in ──────────────────────────────────────────────────────
   It has to sit on the sign-in page: the sandbox starts empty, so there is
   no account to sign in with until you are already inside it. */
{
  const lp = R('src/components/LoginPage.js');
  ok(lp.indexOf('"Test mode"') > 0, 'the sign-in page has no way into test mode');
  ok(/setTestMode\(true\)/.test(lp), 'the sign-in page does not turn test mode on');
  ok(/confirm\('Open test mode\?/.test(lp), 'test mode opens without saying what it does');
}

if (fails) { console.error('\n' + fails + ' failure(s)'); process.exit(1); }
console.log('  ok');
