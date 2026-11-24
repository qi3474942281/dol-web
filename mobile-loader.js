/* Reuse a verified assembly when local storage is available. */
(() => {
 const $=id=>document.getElementById(id);
 const status=$('status'),detail=$('detail'),progress=$('progress');
 const state={build:'dol-mobile-9',received:0,retries:0,resources:0};window.DOLMobileLoadReport=state;
 let total=1;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function bound(p,ms,message){let timer;return Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer));}
 const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 function update(){progress.value=Math.min(99,state.received/total*100);detail.textContent=(state.received/1048576).toFixed(1)+' / '+(total/1048576).toFixed(1)+' MB · 已校验 '+state.resources+' 个资源'+(state.retries?' · 自动重试 '+state.retries+' 次':'');}
 async function resource(item){
  for(let attempt=0;attempt<4;attempt++){
   try{
    const data=await window.DOLHttpQueue.read(item.path,{timeoutMs:45000,cache:attempt?'reload':'force-cache'});
    if(data.length!==item.bytes||await hash(data)!==item.sha256)throw Error('资源长度或校验不符');
    state.received+=data.length;state.resources++;update();return data;
   }catch(error){
    if(error.rateLimited)throw error;
    if(attempt===3)throw Error('资源多次加载失败：'+item.path+'\n'+error.message);
    state.retries++;detail.textContent='连接中断，正在重试当前小文件……';await pause(500*(attempt+1));
   }
  }
 }
 async function parallel(items,fn){
  const result=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
   while(next<items.length){const index=next++;result[index]=await fn(items[index],index);}
  }));return result;
 }
 function base64(bytes){const parts=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(parts.join(''));}
 function start({core, mods}){
  state.complete=true;progress.value=100;status.textContent='资源已就绪，正在进入游戏……';
  window.__DOLMobilePreparedMods=mods;
  // Keep the game on the same origin and reuse its existing save identifiers.
  return pause(0).then(()=>{document.open();document.write(core);document.close();});
 }
 async function main(){
  $('retry').onclick=()=>location.reload();
  if(!window.DOLHttpQueue)throw Error('加载组件暂不可用，请稍后重新打开本页，不要连续刷新。');
  if(!window.DecompressionStream||!crypto?.subtle)throw Error('当前浏览器缺少资源解压或校验功能，请使用新版 Safari/Chrome。');
  status.textContent='正在检查已有存档备份……';
  await bound(DOLBackup.ensure(),30000,'存档备份检查超时。原存档未清除，请关闭其他游戏标签页再重试。');
  status.textContent='正在读取本机游戏缓存……';
  const cached=await bound(window.DOLMobileCache.read(state.build),2500,'读取本机资源超时').catch(()=>null);
  if(typeof cached?.core==='string'&&/^<!doctype html>/i.test(cached.core)&&
     cached.mods?.length===26&&cached.mods.every(mod=>typeof mod==='string')){
   state.cached=true;
   return start(cached);
  }
  status.textContent='正在读取资源清单……';
  const manifest=JSON.parse(new TextDecoder().decode(await window.DOLHttpQueue.read('mobile/manifest-9.json?mobile=9',{cache:'no-cache',timeoutMs:20000})));
  if(manifest.build!==state.build||manifest.mods.length!==26||!manifest.core.length)throw Error('手机资源版本不符，请稍后重试。');
  total=manifest.core.reduce((n,p)=>n+p.bytes,0)+manifest.mods.reduce((n,m)=>n+m.bytes,0);
  status.textContent='正在分批加载游戏……';
  const chunks=await parallel(manifest.core,async item=>{
   const data=await resource(item);
   const raw=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
   if(raw.length!==item.raw_bytes)throw Error('游戏分块解压长度不符');return raw;
  });
  const decoder=new TextDecoder('utf-8',{fatal:true}),text=[];
  for(let i=0;i<chunks.length;i++){text.push(decoder.decode(chunks[i],{stream:true}));chunks[i]=null;}
  text.push(decoder.decode());const core=text.join('');text.length=0;
  status.textContent='正在分批加载汉化与模组……';
  const prepared=[];
  for(const mod of manifest.mods){
   status.textContent='正在加载：'+(mod.name==='ModI18N'?'中文汉化包':mod.name==='DoLWebArtPack'?'BESC/UCB 图片索引':mod.name);
   const pieces=await parallel(mod.parts,resource);const bytes=new Uint8Array(mod.bytes);let offset=0;
   for(let i=0;i<pieces.length;i++){bytes.set(pieces[i],offset);offset+=pieces[i].length;pieces[i]=null;}
   if(offset!==mod.bytes||await hash(bytes)!==mod.sha256)throw Error('模组校验失败：'+mod.name);
   prepared.push(base64(bytes));
  }
  const assembly={core,mods:prepared};
  status.textContent='正在保存已校验的资源，下次可直接读取……';
  state.saved=await bound(window.DOLMobileCache.write(state.build,assembly),4000,'保存本机资源超时')
   .then(()=>true,()=>false);
  return start(assembly);
 }
 main().catch(error=>{status.textContent='尚未完成加载';$('error').textContent=error.message+'\n原存档未清除。已收到的小文件可由浏览器缓存复用。';$('retry').hidden=false;console.error(error);});
})();
