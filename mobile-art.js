(async()=>{
 const pack=window.modGameOriginalImagePack;
 pack.init();
 const root=new URL('mobile/art/',document.baseURI);
 const mapping=MAPPING;
 const byPath=new Map(mapping);
 const originals=new Map(Object.entries(ORIGINAL_VARIANTS));
 const legacyClothes=new Set(LEGACY_CLOTHES);
 const embedded=EMBEDDED_IMAGES;
 const originalPrefix='dol-original:';
 const originalSrc=path=>originals.has(path)?originalPrefix+path:path;
 const pending=new Map();
 const recent=new Map();
 const types={png:'image/png',gif:'image/gif',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'};

 function load(file, priority){
  if(embedded[file])return Promise.resolve(embedded[file]);
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
    try {
     bytes=await window.DOLHttpQueue.read(url,{timeoutMs:15000,priority});
    } catch(error) {
     if(error.rateLimited)throw error;
     bytes=await window.DOLHttpQueue.read(url,{timeoutMs:10000,priority,cache:'reload'});
    }
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
  matchClothing(layers){
   const wardrobe=layers.filter(layer=>layer.show!==false&&typeof layer.src==='string'&&layer.src.startsWith('img/clothes/'));
   if(!wardrobe.some(layer=>legacyClothes.has(layer.src.split('/').slice(0,4).join('/'))))return layers;
   return layers.map(layer=>{
    if(layer.show===false)return layer;
    const mapMask=mask=>typeof mask==='string'?originalSrc(mask):mask?.path?{...mask,path:originalSrc(mask.path)}:mask;
    return {
     ...layer,
     src:originalSrc(layer.src),
     masksrc:Array.isArray(layer.masksrc)?layer.masksrc.map(mapMask):mapMask(layer.masksrc),
    };
   });
  },
  // Canvas requests keep the ModLoader's explicit image overrides. Other paths
  // in the bundled pack use cached data URLs allowed by the game's policy.
  source(path){
   const hook=window.modImgLoaderHooker;
   if(typeof path==='string'&&path.startsWith(originalPrefix)){
    const file=originals.get(path.slice(originalPrefix.length));
    return file?load(file,'visible').catch(error=>{error.dolArtwork=true;throw error;}):null;
   }
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
