/* Read only a complete, verified artwork cache before the ModLoader starts. */
window.dolPrepareArtPack=async()=>{
 if(window.DOLWebArtInline)return;
 const build='dol-051213-chs101a-3',key=new URL('mods/DoLWebArtPack.mod.zip?build='+build,location.href).href;
 let response;
 if(typeof caches!=='undefined')response=await (await caches.open('dol-web-'+build)).match(key);
 if(!response){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),180000);
  try{response=await fetch(key,{signal:controller.signal});if(!response.ok)throw Error('美化包下载失败，请从首页完整下载后进入。');const bytes=new Uint8Array(await response.arrayBuffer());response=new Response(bytes);}
  finally{clearTimeout(timeout);}
 }
 const bytes=new Uint8Array(await response.arrayBuffer());
 const parts=[];for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
 window.modDataValueZipList.push(btoa(parts.join('')));
};
