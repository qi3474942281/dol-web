(async()=>{
 const pack=window.modGameOriginalImagePack;
 pack.init();
 const root=new URL('mobile/art/',document.baseURI);
 const mapping=MAPPING;
 const byPath=new Map(mapping);
 const pending=new Map();
 const recent=new Map();
 const types={png:'image/png',gif:'image/gif',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'};

 function load(file, priority){
  if(pending.has(file))return pending.get(file);
  const existing=recent.get(file);
  if(existing){
   recent.delete(file);
   recent.set(file,existing);
   return Promise.resolve(existing);
  }
  const task=(async()=>{
   const url=new URL(file,root).href;
   const mime=types[file.split('.').pop()]||'application/octet-stream';
   let bytes=await window.DOLMobileCache.readArt(url).catch(()=>null);
   if(!bytes){
    bytes=await window.DOLHttpQueue.read(url,{timeoutMs:15000,priority});
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const sha=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(sha!==file.split('.')[0])throw Error('Artwork integrity error: '+file);
    void window.DOLMobileCache.writeArt(url,bytes).catch(()=>{});
   }
   const urlData=await dataURL(new Blob([bytes],{type:mime}));
   recent.set(file,urlData);
   if(recent.size>256)recent.delete(recent.keys().next().value);
   return urlData;
  })().finally(()=>pending.delete(file));
  pending.set(file,task);
  return task;
 }

 function dataURL(blob){
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(reader.error);
   reader.readAsDataURL(blob);
  });
 }

 for(const [path,file] of mapping){
  pack.selfImg.set(path,{path,getter:{invalid:false,getBase64Image:()=>load(file,'background')}});
 }

 window.DOLMobileArt={
  // Canvas requests keep the ModLoader's explicit image overrides. Other paths
  // in the bundled pack use cached data URLs allowed by the game's policy.
  source(path){
   const hook=window.modImgLoaderHooker;
   const normalized=typeof path==='string'&&hook?.normalizePath(path);
   const file=byPath.get(normalized);
   if(!file)return null;
   if(hook.imgLookupTable?.has(normalized)){
    return hook.getImage(normalized).then(src=>src||path);
   }
   return load(file,'visible').catch(error=>{
    error.dolArtwork=true;
    throw error;
   });
  },
 };
 window.DOLWebArtReport=REPORT;
})();
