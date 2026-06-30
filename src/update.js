const APP_VERSION = '1.0.0';
const APP_BUILD = '20260528';
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