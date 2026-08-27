const APP_VERSION = '1.0.0';
/* Derived, not typed. This was the literal '20260528' and nothing bumped it,
   so it named a build from months ago while the app served a newer one -- a
   version marker that lies is worse than none, because it is believed. Every
   script is loaded with the release's ?v=, so the tag that loaded THIS file
   already carries the answer. */
const APP_BUILD = (function () {
  try {
    const s = document.currentScript || document.querySelector('script[src*="update.js"]');
    const m = s && s.src.match(/[?&]v=([^&]+)/);
    return m ? m[1] : 'dev';
  } catch (e) { return 'dev'; }
})();
const UPDATE_CHECK_KEY = 'shic_update_cfg';
function getUpdateCfg() {
  try {
    const v = localStorage.getItem(UPDATE_CHECK_KEY);
    return v ? JSON.parse(v) : {
      enabled: false,
      url: ''
    };
  } catch {
    return {
      enabled: false,
      url: ''
    };
  }
}
function saveUpdateCfg(cfg) {
  try {
    localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify(cfg));
  } catch {}
}
async function checkForUpdate() {
  try {
    const cfg = getUpdateCfg();
    const tasks = [];
    if (cfg.enabled && cfg.url) tasks.push(fetch(cfg.url, {
      cache: 'no-store'
    }).then(r => r.json()).catch(() => null));
    tasks.push((async () => {
      try {
        return null; /* Firebase removed */
      } catch {
        return null;
      }
    })());
    const results = await Promise.all(tasks);
    for (const info of results) if (info && info.version && info.version !== APP_VERSION) return {
      available: true,
      ...info
    };
  } catch (e) {}
  return {
    available: false
  };
}