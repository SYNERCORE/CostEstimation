const CACHE='shic-ce-v87';
/* The libraries now ship in ./vendor and are precached as part of APP, so the
   app no longer needs the public internet at all after its first load. Only
   MSAL is still fetched remotely, and only as a fallback behind the local copy
   -- it is used solely to reach SharePoint, which implies being online. */
const CDN=[
  'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js'
];
const SHELL=['./','./index.html','./manifest.json','./icon.svg'];
/* Vendored libraries that are NOT <script> tags in index.html, so the precache
   generator cannot see them: pdf.js loads its worker at runtime, and msal is
   injected on demand. Both must be cached or the feature dies offline. */
const EXTRA=['./vendor/pdf.worker.min.js','./vendor/msal-browser.min.js'];
/* Every application script index.html loads, with the same ?v= query it uses.
   These were NOT precached before, so offline the shell loaded but none of the
   app did. Kept in step with index.html by tools/check-sw-precache.js.
   APP_START */
const APP=[
  './vendor/react.production.min.js?v=87',
  './vendor/react-dom.production.min.js?v=87',
  './vendor/xlsx.full.min.js?v=87',
  './vendor/pdf.min.js?v=87',
  './vendor/mammoth.browser.min.js?v=87',
  './src/constants.js?v=87',
  './src/helpers.js?v=87',
  './src/xlsx-styled.js?v=87',
  './src/ai.js?v=87',
  './src/ai_models.js?v=87',
  './src/config.js?v=87',
  './src/update.js?v=87',
  './src/sp.js?v=87',
  './src/idb.js?v=87',
  './src/db.js?v=87',
  './src/auth.js?v=87',
  './src/components/LoginPage.js?v=87',
  './src/components/RegisterPage.js?v=87',
  './src/components/CompanyDBPanel.js?v=87',
  './src/components/FbSetupPanel.js?v=87',
  './src/components/LocalToSPSync.js?v=87',
  './src/components/ChangePasswordModal.js?v=87',
  './src/components/UpdatePublisher.js?v=87',
  './src/components/AdminPanel.js?v=87',
  './src/components/ResTab.js?v=87',
  './src/App.js?v=87',
  './src/widgets.js?v=87',
  './src/tests.js?v=87',
  './src/ml_utils.js?v=87'
];
/* APP_END */
self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>
      /* App files decide whether the thing boots offline, so cache them first
         and let the CDN/shell attempts fail quietly. */
      /* One request per file, NOT c.addAll(APP). addAll is atomic: a single
         404 or flaky response rejects the whole batch and leaves NOTHING
         cached, so one bad entry silently cost the app its entire offline
         capability. Cache what we can and report what we could not. */
      Promise.all(APP.concat(EXTRA).map(u=>fetch(u,{cache:'reload'}).then(r=>r.ok?c.put(u,r):Promise.reject(r.status)).catch(err=>{console.warn('SW: precache failed for',u,err);})))
        /* Fetch the shell with cache:'reload'. c.addAll() goes through the
           browser's own http cache, so a stale index.html could be copied into
           the SW cache — and index.html is what pins the ?v= every script is
           loaded with. That produced a mixed-version app offline: a new App.js
           calling a helper that the old cached helpers.js did not define. */
        .then(()=>Promise.all(SHELL.map(u=>fetch(u,{cache:'reload'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{}))))
        .then(()=>Promise.all(CDN.map(u=>caches.open(CACHE).then(cc=>cc.add(u)).catch(()=>{}))))
    ).then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=e.request.url;
  /* Never touch SharePoint or auth traffic */
  if(url.includes('/_api/')||url.includes('/_layouts/')||url.includes('login.microsoftonline.com'))return;

  /* Cache-first for CDN scripts */
  if(CDN.some(u=>url.startsWith(u))){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));return res;
    })));
    return;
  }

  /* Cache-first for versioned app scripts. The ?v= query changes on every
     release, so a cached entry is always the build it belongs to and can be
     served without revalidation; a miss falls through to the network and is
     stored for next time. */
  if(url.indexOf(self.registration.scope)===0&&/\/(src|vendor)\/.+\.js(\?|$)/.test(url)){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      if(res&&res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}
      return res;
    }).catch(()=>caches.match(e.request))));
    return;
  }

  /* Network-first for the shell so a new index.html (and its new ?v=) is picked
     up as soon as the user is online, falling back to cache when offline. */
  const isShell=(
    url===self.location.origin+'/'||
    url.endsWith('/index.html')||
    url.endsWith('/manifest.json')||
    url.endsWith('/icon.svg')||
    url===self.registration.scope
  );
  if(isShell){
    /* cache:'reload' bypasses the browser's OWN http cache. Plain fetch() here
       is still allowed to return a stale index.html from the disk cache, and
       since index.html is what carries the new ?v= query, that pinned users to
       an old build indefinitely — network-first bought nothing. */
    e.respondWith(fetch(e.request,{cache:'reload'}).catch(()=>fetch(e.request)).then(res=>{
      if(res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}
      return res;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
  }
});
