const BUILD='dol-051213-chs101a-3',CACHE='dol-web-'+BUILD;
const STARTUP='startup-5';
const base=new URL('./',self.location.href);
const page=name=>new URL(name,base).href;
const game=page('game.html?build='+BUILD),art=page('mods/DoLWebArtPack.mod.zip?build='+BUILD);
// Activation must never depend on downloading the optional offline shell.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function cached(key){
 let timer;
 try{return await Promise.race([(async()=>await(await caches.open(CACHE)).match(key))(),new Promise(resolve=>timer=setTimeout(()=>resolve(null),1500))]);}
 catch{return null;}finally{clearTimeout(timer);}
}
async function cacheShell(){
 const cache=await caches.open(CACHE);
 const files=['index.html','play.html','launch.html','start.html','install.js?build='+BUILD+'&startup='+STARTUP,'save-backup.js?build='+BUILD+'&startup='+STARTUP,'backup.html'];
 await Promise.allSettled(files.map(async name=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetch(page(name),{cache:'no-store',signal:controller.signal});if(r.ok)await cache.put(page(name),r);}
  finally{clearTimeout(timer);}
 }));
}
self.addEventListener('message',event=>{
 if(event.data==='GET_BUILD')event.ports[0]?.postMessage(BUILD);
 // Preserve the old installer's handshake while replacing its blocking worker.
 if(event.data==='GET_VERSION')event.ports[0]?.postMessage('startup-4');
 if(event.data==='CACHE_SHELL')event.waitUntil(cacheShell().catch(()=>{}));
});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||event.request.method!=='GET')return;
 const isArt=u.pathname===new URL('mods/DoLWebArtPack.mod.zip',base).pathname;
 if(isArt||['game.html','online.html'].some(n=>u.pathname===new URL(n,base).pathname)){
  if(u.searchParams.get('build')&&u.searchParams.get('build')!==BUILD)return;
  event.respondWith((async()=>await cached(isArt?art:game)||fetch(event.request))());return;
 }
 if([base.pathname,...['index.html','play.html','launch.html','start.html'].map(n=>new URL(n,base).pathname)].includes(u.pathname)){
  event.respondWith((async()=>{try{return await fetch(event.request);}catch(e){const response=await cached(page('index.html'));if(response)return response;throw e;}})());return;
 }
 if(['install.js','save-backup.js','backup.html'].some(n=>u.pathname===new URL(n,base).pathname)){
  event.respondWith((async()=>await cached(event.request)||fetch(event.request))());
 }
});
