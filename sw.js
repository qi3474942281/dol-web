const BUILD='dol-051213-chs101a-2',CACHE='dol-web-'+BUILD;
const base=new URL('./',self.location.href);
const page=name=>new URL(name,base).href;
const game=page('game.html?build='+BUILD);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(['index.html','install.js?build='+BUILD,'save-backup.js?build='+BUILD,'backup.html'].map(page));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||event.request.method!=='GET')return;
 if(u.pathname===new URL('game.html',base).pathname){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(game)||fetch(event.request);})());return;
 }
 if(u.pathname===base.pathname||u.pathname===new URL('index.html',base).pathname){
  event.respondWith((async()=>{try{return await fetch(event.request);}catch(e){const response=await (await caches.open(CACHE)).match(page('index.html'));if(response)return response;throw e;}})());return;
 }
 if(['install.js','save-backup.js','backup.html'].some(n=>u.pathname===new URL(n,base).pathname)){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(event.request)||fetch(event.request);})());
 }
});
