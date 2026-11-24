const BUILD='dol-051213-chs101a-3',CACHE='dol-web-'+BUILD;
const base=new URL('./',self.location.href);
const page=name=>new URL(name,base).href;
const game=page('game.html?build='+BUILD),art=page('mods/DoLWebArtPack.mod.zip?build='+BUILD);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(['index.html','play.html','install.js?build='+BUILD,'save-backup.js?build='+BUILD,'backup.html'].map(page));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data==='GET_BUILD')event.ports[0]?.postMessage(BUILD);});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||event.request.method!=='GET')return;
 if([new URL('game.html',base).pathname,new URL('mods/DoLWebArtPack.mod.zip',base).pathname].includes(u.pathname)){
  if(u.searchParams.get('build')&&u.searchParams.get('build')!==BUILD)return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(u.pathname.endsWith('.html')?game:art)||fetch(event.request);})());return;
 }
 if([base.pathname,new URL('index.html',base).pathname,new URL('play.html',base).pathname].includes(u.pathname)){
  event.respondWith((async()=>{try{return await fetch(event.request);}catch(e){const response=await(await caches.open(CACHE)).match(page('index.html'));if(response)return response;throw e;}})());return;
 }
 if(['install.js','save-backup.js','backup.html'].some(n=>u.pathname===new URL(n,base).pathname)){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(event.request)||fetch(event.request);})());
 }
});
