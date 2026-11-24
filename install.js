(() => {
 const BUILD='dol-051213-chs101a-3',CACHE='dol-web-'+BUILD;
 const STARTUP='startup-5';
 const absolute=p=>new URL(p+'?build='+BUILD,location.href).href;
 const game=absolute('game.html'),art=absolute('mods/DoLWebArtPack.mod.zip');
 const $=id=>document.getElementById(id);
 const status=$('status'),detail=$('detail'),progress=$('progress'),retry=$('retry'),play=$('play');
 let running=false;
 function timeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer));}
 // The game/art build is unchanged. Any worker serving this build is usable;
 // shell-script revisions must not become a prerequisite for playing.
 function compatible(worker){
  if(!worker)return false;
  try{const u=new URL(worker.scriptURL);return u.origin===location.origin&&u.pathname===new URL('sw.js',location.href).pathname&&u.searchParams.get('build')===BUILD;}
  catch{return false;}
 }
 async function control(){
  if(!('serviceWorker' in navigator))return false;
  let pending;
  try{pending=navigator.serviceWorker.register('sw.js?build='+BUILD+'&startup='+STARTUP,{updateViaCache:'none'});pending.catch(()=>{});}
  catch{return false;}
  if(compatible(navigator.serviceWorker.controller))return true;
  try{
   const registration=await timeout(pending,5000,'worker registration timeout');
   const deadline=Date.now()+5000;
   while(Date.now()<deadline){
    if(compatible(navigator.serviceWorker.controller)||(registration.active?.state==='activated'&&compatible(registration.active)))return true;
    await new Promise(r=>setTimeout(r,100));
   }
  }catch{}
  return false;
 }
 function online(){
  status.textContent='离线缓存暂不可用，正在直接在线进入游戏……';
  detail.textContent='将直接从本站加载游戏和美化包，存档位置不变。';
  location.replace(absolute('online.html'));
 }
 function cacheShell(){navigator.serviceWorker?.controller?.postMessage('CACHE_SHELL');}
 if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',cacheShell);
 async function download(cache,item,completed,total){
   const target=absolute(item.path);if(await timeout(cache.match(target),15000,'读取本机缓存超时，请重试。'))return;
  const controller=new AbortController();let idle;
  const touch=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(),30000);};touch();
  try{
   const response=await fetch(target,{cache:'no-store',signal:controller.signal});
   if(!response.ok||!response.body)throw Error('文件下载失败（'+response.status+'）：'+item.path);
   const reader=response.body.getReader();let received=0;
   const stream=new ReadableStream({
    async pull(out){
     try{
      const chunk=await reader.read();touch();
      if(chunk.done){if(received!==item.bytes)throw Error('文件未下载完整，请重试。');clearTimeout(idle);out.close();return;}
      received+=chunk.value.byteLength;
      progress.value=Math.min(99,(completed+received)/total*100);
      detail.textContent=((completed+received)/1048576).toFixed(1)+' / '+(total/1048576).toFixed(1)+' MB · '+Math.floor((completed+received)/total*100)+'%';
      out.enqueue(chunk.value);
     }catch(e){clearTimeout(idle);out.error(e);}
    },cancel(){controller.abort();return reader.cancel();}
   });
   await cache.put(target,new Response(stream,{headers:{'Content-Type':item.path.endsWith('.html')?'text/html; charset=utf-8':'application/zip','X-DoL-Complete':'1'}}));
  }finally{clearTimeout(idle);}
 }
 async function start(){
  if(running)return;running=true;retry.hidden=true;play.hidden=true;$('error').textContent='';
  try{
   status.textContent='正在保留升级前存档和设置……';
   await timeout(DOLBackup.ensure(),30000,'存档备份超时。请先关闭其他游戏标签页，再重试；也可打开旧版导出存档。');
   status.textContent='正在检查离线缓存组件……';
   if(!await control()){online();return;}
   status.textContent='正在打开本机文件缓存……';
   let cache;
   try{cache=await timeout(caches.open(CACHE),5000,'打开本机文件缓存超时');}
   catch{online();return;}
   cacheShell();
   status.textContent='正在检查游戏和美化文件……';
   let cached;
   try{cached=await timeout(Promise.all([cache.match(game),cache.match(art)]),5000,'读取本机文件缓存超时');}
   catch{online();return;}
   if(cached.every(Boolean)){progress.value=100;status.textContent='汉化和美化均已缓存，正在进入……';location.replace(game);return;}
   status.textContent='正在读取已部署的版本信息……';
   const manifest=await timeout(fetch('upstream-release.json?build='+BUILD,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('版本清单下载失败');return r.json();}),20000,'版本清单下载超时，请重试。');
   if(manifest.build!==BUILD)throw Error('网站正在更新文件，请稍后重试。');
   const files=manifest.install_files;
   if(!Array.isArray(files)||files.length!==2||files.some(x=>!Number.isSafeInteger(x.bytes)||x.bytes<=0)||files[0].path!=='game.html'||files[1].path!=='mods/DoLWebArtPack.mod.zip')throw Error('安装包信息无效。');
   const total=files.reduce((n,f)=>n+f.bytes,0);let completed=0;
   for(const item of files){status.textContent=item.path.endsWith('.html')?'正在下载汉化游戏……':'正在下载 BESC＋UCB 美化图片……';await download(cache,item,completed,total);completed+=item.bytes;}
   progress.value=100;status.textContent='汉化和美化均已下载，正在初始化……';detail.textContent='后续进入会直接使用本机缓存。';
   if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
   play.hidden=false;location.replace(game);
  }catch(e){status.textContent='尚未完成加载';$('error').textContent=(e.name==='AbortError'?'网络连续 30 秒没有收到数据，请重试。':e.message)+'\n存档没有被清除，已下载完整的文件会保留。';retry.hidden=false;}
  finally{running=false;}
 }
 retry.onclick=start;play.onclick=()=>location.assign(game);start();
})();
