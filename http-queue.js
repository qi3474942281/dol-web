/* Share one bounded request queue across downloads and on-demand images. */
(function(root){
 function createHttpQueue(options={}){
  const fetcher=options.fetcher||root.fetch.bind(root),now=options.now||Date.now;
  const sleep=options.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const concurrency=options.concurrency??2,gap=options.gapMs??150;
  const storage=options.storage,key='dol-http-cooldown-v1';
  let blockedUntil=0;try{blockedUntil=Number(storage?.getItem(key))||0;}catch{}
  let active=0,pumping=false,nextStart=0,strikes=0,rateLimits=0,halted=false;const waiting=[];
  function rateError(){const e=Error('网站暂时限制访问频率，请等待限制解除后重试，不要连续刷新。');e.rateLimited=true;e.retryAt=blockedUntil;return e;}
  function notify(){options.onCooldown?.({until:blockedUntil,halted});}
  function rateLimit(response){
   strikes++;rateLimits++;
   const value=response.headers.get('Retry-After');let ms=NaN;
   if(value!==null&&value.trim()!=='')ms=/^\d+(?:\.\d+)?$/.test(value.trim())?Number(value)*1000:Date.parse(value)-now();
   if(!Number.isFinite(ms))ms=Math.min(300000,60000*2**(strikes-1));
   blockedUntil=Math.max(blockedUntil,now()+Math.max(1000,ms));
   try{storage?.setItem(key,String(blockedUntil));}catch{}
   if(strikes>=3)halted=true;
   notify();
  }
  async function run(job){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),job.options.timeoutMs??45000);
   try{
    const r=await fetcher(job.url,{cache:job.rateRetries?'reload':job.options.cache||'force-cache',signal:controller.signal});
    if(r.status===429){
     rateLimit(r);try{await r.body?.cancel();}catch{}
     if(halted||job.rateRetries>=2){job.reject(rateError());if(halted)for(const item of waiting.splice(0))item.reject(rateError());}
     else{job.rateRetries++;waiting.unshift(job);}
     return;
    }
    if(!r.ok)throw Error('HTTP '+r.status);
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(now()>=blockedUntil)strikes=0;
    job.resolve(bytes);
   }catch(error){job.reject(error);}
   finally{clearTimeout(timer);active--;void pump();}
  }
  async function pump(){
   if(pumping)return;pumping=true;
   try{
    while(waiting.length&&active<concurrency&&!halted){
     const delay=Math.max(blockedUntil,nextStart)-now();
     if(delay>0){if(blockedUntil>now())notify();await sleep(delay);continue;}
     const important=waiting.findIndex(item=>item.options.priority!=='background');
     const [job]=waiting.splice(Math.max(important,0),1);nextStart=now()+gap;active++;void run(job);
    }
   }finally{pumping=false;if(waiting.length&&active<concurrency&&!halted)void pump();}
  }
  return {read(url,requestOptions={}){
   if(halted)return Promise.reject(rateError());
   return new Promise((resolve,reject)=>{waiting.push({url,options:requestOptions,resolve,reject,rateRetries:0});void pump();});
  },get rateLimitCount(){return rateLimits;},get retryAt(){return blockedUntil;},get halted(){return halted;}};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={createHttpQueue};return;}
 let timer;
 function banner({until,halted}){
  clearInterval(timer);
  const render=()=>{
   const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));let box=document.getElementById('dol-rate-limit-notice');
   if(!seconds&&!halted){box?.remove();clearInterval(timer);return;}
   if(!document.body)return;
   if(!box){box=document.createElement('div');box.id='dol-rate-limit-notice';box.setAttribute('role','status');box.style='position:fixed;z-index:2147483647;left:8px;right:8px;bottom:8px;padding:12px;background:#4b231c;color:white;border:1px solid #e9b0a0;font:15px/1.5 system-ui';document.body.append(box);}
   box.textContent=halted?'网站连续限流，已停止发送请求。请先存档，等待限制解除后再重新打开游戏。':'网站暂时限流，等待 '+seconds+' 秒后自动继续。请不要连续刷新，存档不受影响。';
  };render();if(!halted)timer=setInterval(render,1000);
 }
 let storage;try{storage=root.sessionStorage;}catch{}
 root.DOLHttpQueue=createHttpQueue({storage,onCooldown:banner,concurrency:4,gapMs:100});
})(typeof window==='undefined'?globalThis:window);
