const CACHE='personal-dashboard-shell-v13';
const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest?v=2',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@d0d51608c896788ee6afd48ecc5360a5c69e24b8/styles.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@76c6828a396111511e099c4463204031a63523e1/backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@1567cb986cf637e80f8d13b933866ae7b24dc74a/page-backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@01ea40e3eb367dfa03f3d4150f05fa9e79bebaee/section-backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@0c9950df33d55ab6b7786e7f4a6a1909913ff152/standalone.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@891856465093d469794ad8a2511daee49ddaccf9/standalone.js',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@1b21e950fca495689b42326f90dac77e6bf45cf1/app.js'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const url of SHELL){
      try{await cache.add(url)}catch(e){}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('personal-dashboard-shell-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const req=event.request;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const live=await fetch(req,{cache:'no-store'});
        const cache=await caches.open(CACHE);
        cache.put('./index.html',live.clone()).catch(()=>{});
        return live;
      }catch(e){
        return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();
      }
    })());
    return;
  }
  const url=new URL(req.url);
  const cacheable=url.origin===self.location.origin||url.hostname==='cdn.jsdelivr.net';
  if(!cacheable)return;
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached)return cached;
    try{
      const live=await fetch(req);
      const cache=await caches.open(CACHE);cache.put(req,live.clone()).catch(()=>{});
      return live;
    }catch(e){
      return Response.error();
    }
  })());
});
