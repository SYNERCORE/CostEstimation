const CACHE='shic-ce-v11';
const CDN=[
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js'
];
const SHELL=['./','./index.html','./manifest.json','./icon.svg'];
self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>
      c.addAll(CDN).catch(()=>{}).then(()=>c.addAll(SHELL).catch(()=>{}))
    ).then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  /* Cache-first for CDN scripts */
  if(CDN.some(u=>e.request.url.startsWith(u))){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));return res;
    })));
    return;
  }
  /* Network-first for app shell so updates propagate, fall back to cache offline */
  /* Only intercept same-origin GET requests matching explicit shell paths */
  const url=e.request.url;
  const isShell=e.request.method==='GET'&&(
    url===self.location.origin+'/'||
    url.endsWith('/index.html')||
    url.endsWith('/manifest.json')||
    url.endsWith('/icon.svg')
  )&&!url.includes('/_api/')&&!url.includes('/_layouts/');
  if(isShell){
    e.respondWith(fetch(e.request).then(res=>{
      if(res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}
      return res;
    }).catch(()=>caches.match(e.request)));
  }
});
