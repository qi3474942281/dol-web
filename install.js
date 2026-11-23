(() => {
 const BUILD='dol-051213-chs101a-2',CACHE='dol-web-'+BUILD;
 const game=new URL('game.html?build='+BUILD,location.href).href;
 const $=id=>document.getElementById(id);
 const status=$('status'),detail=$('detail'),progress=$('progress'),retry=$('retry'),play=$('play');
 let running=false;
 function timeout(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer));}
 async function control(){
  if(!('serviceWorker' in navigator))throw Error('当前浏览器不支持离线网页缓存。可下载下面的完整 ZIP，或换用 Safari/Chrome 打开原网址。');
  await timeout(navigator.serviceWorker.register('sw.js'),20000,'离线缓存组件加载超时，请重试。');
  await timeout(navigator.serviceWorker.ready,20000,'离线缓存组件未就绪，请重试。');
  if(!navigator.serviceWorker.controller)await timeout(new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),10000,'请刷新本页后继续。');
 }
 async function start(){
  if(running)return;running=true;retry.hidden=true;play.hidden=true;$('error').textContent='';
  try{
   status.textContent='正在保留升级前存档和设置……';
   await timeout(DOLBackup.ensure(),30000,'存档备份超时。请先关闭其他游戏标签页，再重试；也可打开旧版导出存档。');
   await control();
   const cache=await caches.open(CACHE);
   if(await cache.match(game)){
    progress.value=100;status.textContent='完整汉化游戏已下载，正在进入……';location.replace(game);return;
   }
   status.textContent='正在下载完整汉化游戏……';
   const manifest=await timeout(fetch('upstream-release.json?build='+BUILD,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('版本清单下载失败');return r.json();}),20000,'版本清单下载超时，请重试。');
   if(manifest.build!==BUILD)throw Error('网站正在更新文件，请稍后重试。');
   const total=manifest.game_bytes;
   if(!Number.isSafeInteger(total)||total<=0)throw Error('安装包大小信息无效。');
   const controller=new AbortController();let idle;
   const touch=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(),30000);};touch();
   let reader;
   try{
    const response=await fetch(game,{cache:'no-store',signal:controller.signal});
    if(!response.ok||!response.body)throw Error('游戏文件下载失败（'+response.status+'）');
    reader=response.body.getReader();let received=0;
    const stream=new ReadableStream({
     async pull(out){
      try{
       const chunk=await reader.read();touch();
       if(chunk.done){if(received!==total)throw Error('文件没有下载完整，请重试。');clearTimeout(idle);out.close();return;}
       received+=chunk.value.byteLength;
       progress.value=Math.min(99,received/total*100);
       detail.textContent=(received/1048576).toFixed(1)+' / '+(total/1048576).toFixed(1)+' MB · '+Math.floor(received/total*100)+'%';
       out.enqueue(chunk.value);
      }catch(e){clearTimeout(idle);out.error(e);}
     },cancel(){controller.abort();return reader.cancel();}
    });
    await cache.put(game,new Response(stream,{headers:{'Content-Type':'text/html; charset=utf-8','X-DoL-Complete':'1'}}));
   }finally{clearTimeout(idle);}
   progress.value=100;status.textContent='完整汉化游戏已下载，正在初始化……';detail.textContent='汉化和图片均已内置，进入游戏时无需再下载 Mod。';
   if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
   play.hidden=false;location.replace(game);
  }catch(e){
   status.textContent='尚未完成加载';$('error').textContent=(e.name==='AbortError'?'网络已连续 30 秒没有收到数据，请重试。':e.message)+'\n存档没有被清除。';retry.hidden=false;
  }finally{running=false;}
 }
 retry.onclick=start;play.onclick=()=>location.assign(game);start();
})();
