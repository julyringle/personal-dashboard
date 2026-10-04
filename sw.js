const CACHE='personal-dashboard-shell-v3';
const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest?v=2',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@a160393509e47691ba6a2aedfb97f3a1e9d73c09/styles.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@76c6828a396111511e099c4463204031a63523e1/backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@1567cb986cf637e80f8d13b933866ae7b24dc74a/page-backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@01ea40e3eb367dfa03f3d4150f05fa9e79bebaee/section-backgrounds.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@0c9950df33d55ab6b7786e7f4a6a1909913ff152/standalone.css',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@b63725c481672afee43c17d7148aaa883d26397d/standalone.js',
  'https://cdn.jsdelivr.net/gh/julyringle/personal-dashboard@c014cb1b493b785c5829443d7ffec9c5394a30b9/app.js'
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
