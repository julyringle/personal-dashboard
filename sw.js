const CACHE='personal-dashboard-shell-v3';
const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest?v=2',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@8f74aeb62800c06a57d6e15eb0125dc0bebca006/styles.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@76c6828a396111511e099c4463204031a63523e1/backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@1567cb986cf637e80f8d13b933866ae7b24dc74a/page-backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@01ea40e3eb367dfa03f3d4150f05fa9e79bebaee/section-backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@0c9950df33d55ab6b7786e7f4a6a1909913ff152/standalone.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@7baf5614c8739128cf8d70c2f8291fec390a2456/standalone.js',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@17c57c8de8ef2b67728283bf459c7f1f96d1e765/app.js'
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
        const live=await fetch(req);
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
