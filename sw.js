const CACHE='shic-ce-v29';
const CDN=[
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js'
];
const SHELL=['./','./index.html','./manifest.json','./icon.svg'];
/* Every application script index.html loads, with the same ?v= query it uses.
   These were NOT precached before, so offline the shell loaded but none of the
   app did. Kept in step with index.html by tools/check-sw-precache.js.
   APP_START */
const APP=[
  './src/constants.js?v=29',
  './src/helpers.js?v=29',
  './src/ai.js?v=29',
  './src/config.js?v=29',
  './src/update.js?v=29',
  './src/sp.js?v=29',
  './src/idb.js?v=29',
  './src/db.js?v=29',
  './src/auth.js?v=29',
  './src/components/LoginPage.js?v=29',
  './src/components/RegisterPage.js?v=29',
  './src/components/CompanyDBPanel.js?v=29',
  './src/components/FbSetupPanel.js?v=29',
  './src/components/LocalToSPSync.js?v=29',
  './src/components/ChangePasswordModal.js?v=29',
  './src/components/UpdatePublisher.js?v=29',
  './src/components/AdminPanel.js?v=29',
  './src/components/ResTab.js?v=29',
  './src/App.js?v=29',
  './src/widgets.js?v=29',
  './src/tests.js?v=29',
  './src/ml_utils.js?v=29'
];
/* APP_END */
self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>
      /* App files decide whether the thing boots offline, so cache them first
         and let the CDN/shell attempts fail quietly. */
      c.addAll(APP)
        .catch(err=>{console.warn('SW: app precache failed',err);})
        /* Fetch the shell with cache:'reload'. c.addAll() goes through the
           browser's own http cache, so a stale index.html could be copied into
           the SW cache — and index.html is what pins the ?v= every script is
           loaded with. That produced a mixed-version app offline: a new App.js
           calling a helper that the old cached helpers.js did not define. */
        .then(()=>Promise.all(SHELL.map(u=>fetch(u,{cache:'reload'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{}))))
        .then(()=>c.addAll(CDN).catch(()=>{}))
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
  if(url.indexOf(self.registration.scope)===0&&/\/src\/.+\.js(\?|$)/.test(url)){
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
