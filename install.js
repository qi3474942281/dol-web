(() => {
 const BUILD='dol-051213-chs101a-3',CACHE='dol-web-'+BUILD;
 const absolute=p=>new URL(p+'?build='+BUILD,location.href).href;
 const game=absolute('game.html'),art=absolute('mods/DoLWebArtPack.mod.zip');
 const $=id=>document.getElementById(id);
 const status=$('status'),detail=$('detail'),progress=$('progress'),retry=$('retry'),play=$('play');
 let running=false;
 function timeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer));}
 async function workerBuild(){
  if(!navigator.serviceWorker.controller)return null;
  return new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>resolve(null),700);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};navigator.serviceWorker.controller.postMessage('GET_BUILD',[channel.port2]);});
 }
 async function control(){
  if(!('serviceWorker' in navigator))throw Error('当前浏览器不支持离线网页缓存，请用 Safari/Chrome 打开原网址。');
  if(await workerBuild()===BUILD)return;
  await timeout(navigator.serviceWorker.register('sw.js?build='+BUILD,{updateViaCache:'none'}),20000,'离线缓存组件加载超时，请重试。');
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){if(await workerBuild()===BUILD)return;await new Promise(r=>setTimeout(r,250));}
  throw Error('缓存组件尚未更新，请重新打开本页后重试。');
 }
 async function download(cache,item,completed,total){
  const target=absolute(item.path);if(await cache.match(target))return;
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
   await control();const cache=await caches.open(CACHE);
   if(await cache.match(game)&&await cache.match(art)){progress.value=100;status.textContent='汉化和美化均已缓存，正在进入……';location.replace(game);return;}
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
