import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const kind=process.argv[2]||'chromium';
const browser=await ({chromium,webkit}[kind]).launch();
const context=await browser.newContext({...devices['iPhone 13']});
await context.addInitScript(()=>{
 localStorage.setItem('verifiedAge','true');
 if(location.pathname.endsWith('/mobile.html')){
  if('serviceWorker' in navigator)navigator.serviceWorker.register=()=>Promise.reject(Error('Test: service workers unavailable'));

 }
});
const page=await context.newPage();const base='http://127.0.0.1:8765/';
let phase='legacy',warmRequests=0,warmDressRequests=0,dressAsset,reset=false,rateLimited=false,limitedURL,limitedAt,retriedAt,chunkRequests=0;const forbidden=[],errors=[],images=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')console.log('browser-error:',m.text().slice(0,500));});
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(phase==='warm'&&u.pathname===dressAsset){
  warmDressRequests++;
  await route.abort('connectionreset');
  return;
 }
 if(phase==='warm'&&/\/mobile\/(core|mods|manifest)/.test(u.pathname)){
  warmRequests++;
  await route.abort('connectionreset');
  return;
 }
 if(phase==='mobile'){
  if(['/game.html','/online.html','/mods/DoLWebArtPack.mod.zip'].includes(u.pathname)){forbidden.push(u.pathname);await route.abort('connectionreset');return;}
  if(/\/mobile\/(core|mods)\/.+\.bin$/.test(u.pathname)){
   chunkRequests++;
   if(!reset){reset=true;await route.abort('connectionreset');return;}
   if(!rateLimited){rateLimited=true;limitedURL=u.href;limitedAt=Date.now();await route.fulfill({status:429,headers:{'Retry-After':'1'},contentType:'text/html',body:'Too many requests'});return;}
   if(u.href===limitedURL&&retriedAt===undefined)retriedAt=Date.now();
  }
  if(u.pathname.startsWith('/mobile/art/'))images.push(u.pathname);
 }
 await route.continue();
});
const script=source=>page.evaluate(s=>SugarCube.Wikifier.wikifyEval('<<script>>'+s+'<</script>>'),source);
async function ready(){
 await page.waitForFunction(()=>window.SugarCube?.State?.passage||document.getElementById('dol-startup-error')||document.getElementById('error')?.textContent,null,{timeout:300000});
 if(await page.locator('#dol-startup-error').count())throw Error('Game rejected: '+JSON.stringify(await page.evaluate(()=>window.DOLBootCheck)));
 if(await page.locator('#error').count()&&await page.locator('#error').textContent())throw Error(await page.locator('#error').textContent());
}
try{
 await page.goto(base+'legacy.html',{waitUntil:'domcontentloaded',timeout:180000});await ready();
 await script("Engine.play('Start2');");
 await script("V.intro=0;V.money=123456;V.mobilePreserveMarker='keep-mobile-save';V.saveName='手机版验证';Engine.play('Bedroom');State.create(State.passage);window.__saved=Save.slots.save(0,'手机版验证');window.__oldSaveId=Config.saves.id;");
 assert.equal(await page.evaluate(()=>window.__saved),true);
 await page.waitForFunction(()=>window.idb&&!idb.lock,null,{timeout:30000});
 assert.equal(await page.evaluate(()=>idb.saveState(3)),true);
 const saveId=await page.evaluate(()=>window.__oldSaveId);
 await page.evaluate(()=>{localStorage.setItem('mobile-preserve-local','keep');sessionStorage.setItem('mobile-preserve-session','keep');});
 phase='mobile';errors.length=0;
 const coldStart=Date.now();
 await page.goto(base+'mobile.html?mobile=10',{waitUntil:'domcontentloaded',timeout:30000});await ready();
 const coldMs=Date.now()-coldStart;
 assert.equal(await page.evaluate(()=>window.modSC2DataManager.getLanguageManager().mainLanguage),'zh');
 assert.equal(await page.evaluate(()=>window.DOLWebArtReport?.delivery),'static-on-demand');
 assert.equal(await page.evaluate(()=>window.DOLWebArtReport?.images),32779);
 assert.equal(await page.evaluate(()=>window.DOLWebCompatibilityReport?.length),6);
 assert.equal(await page.evaluate(()=>window.DOLMobileLoadReport?.complete),true);
 assert.ok(await page.evaluate(()=>window.DOLMobileLoadReport.retries)>=1,'dropped chunk was retried');
 assert.equal(rateLimited,true);assert.ok(retriedAt-limitedAt>=1000,'server Retry-After respected');
 assert.ok(await page.evaluate(()=>window.DOLHttpQueue.rateLimitCount)>=1);
 assert.equal(forbidden.length,0,'no monolithic HTML or artwork ZIP request');
 assert.equal(await page.evaluate(()=>localStorage.getItem('mobile-preserve-local')),'keep');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('mobile-preserve-session')),'keep');
 await script('window.__newSaveId=Config.saves.id;window.__version=StartConfig.version;window.__loaded=Save.slots.load(0);');
 assert.equal(await page.evaluate(()=>window.__newSaveId),saveId);
 assert.equal(await page.evaluate(()=>window.__version),'0.5.12.13');
 assert.equal(await page.evaluate(()=>window.__loaded),true);
 await script("window.__saveState={money:V.money,marker:V.mobilePreserveMarker};");
 assert.deepEqual(await page.evaluate(()=>window.__saveState),{money:123456,marker:'keep-mobile-save'});
 await page.evaluate(async()=>{await idb.getSaveDetails();await idb.loadState(3);});
 await page.waitForTimeout(300);
 await script("window.__saveState={money:V.money,marker:V.mobilePreserveMarker};");
 assert.deepEqual(await page.evaluate(()=>window.__saveState),{money:123456,marker:'keep-mobile-save'});
 assert.match(await page.locator('#passages').innerText(),/[\u4e00-\u9fff]{3}/);
 const manifest=JSON.parse(await fs.readFile('mobile/manifest-10.json','utf8'));
 const samples=await page.evaluate(async items=>{
  const result={};
  for(const [name,item] of Object.entries(items)){
   const url=await modImgLoaderHooker.getImage(item.path);
   if(!url.startsWith('data:image/'))throw Error('Image provider did not preserve the data URI contract: '+item.path);
   const data=Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));const digest=await crypto.subtle.digest('SHA-256',data);
   const img=new Image();img.src=url;await img.decode();
   result[name]={hash:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),width:img.naturalWidth,height:img.naturalHeight};
  }return result;
 },manifest.artwork.samples);
 for(const [name,item] of Object.entries(manifest.artwork.samples)){assert.equal(samples[name].hash,item.sha256);assert.ok(samples[name].width>0&&samples[name].height>0);}
 const shopPreview=await page.evaluate(async()=>{
  const host=document.createElement('div');
  document.body.append(host);
  const original=Renderer.composeLayers;
  let timer;
  try {
   return await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Milkmaid shop mannequin did not finish: '+host.textContent)),35000);
    Renderer.composeLayers=(ctx,layers,frames,listener)=>{
     const paths=layers.filter(layer=>layer.show!==false).map(layer=>layer.src);
     if(!paths.some(src=>String(src).includes('milkmaid dress')))return original(ctx,layers,frames,listener);
     return original(ctx,layers,frames,{...listener,renderingDone(time){
      listener?.renderingDone?.(time);
      const pixels=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data;
      resolve({paths,visible:pixels.some((value,i)=>i%4===3&&value>0)});
     }});
    };
    new SugarCube.Wikifier(host,'<<mannequin "upper" 218 "black" "white">>');
   });
  } finally { clearTimeout(timer); Renderer.composeLayers=original; host.remove(); }
 });
 assert.equal(shopPreview.visible,true);
 assert.ok(shopPreview.paths.includes('dol-original:img/body/mannequin/base-body.png'),'the real shop mannequin uses the original body');
 for(const slot of ['upper','lower']){
  assert.ok(shopPreview.paths.some(path=>typeof path==='string'&&path.replace(/^dol-original:/,'').startsWith('img/clothes/'+slot+'/milkmaid dress/')),'preview draws the matching dress '+slot);
 }
 const clothingRegression=await page.evaluate(async()=>{
  const config=SugarCube.setup||window.setup;
  const model=Renderer.locateModel('main');
  const results=[];
  for(const [slot,name] of [['upper','diving'],['legs','nursesocks'],['feet','trainers']]){
   const index=config.clothes[slot].findIndex(item=>item.variable===name);
   const item=config.clothes[slot][index];
   const prefix='dol-original:img/clothes/'+slot+'/'+name+'/';
   const image=new Image();
   image.src=await DOLMobileArt.source(prefix+'full.png');
   await image.decode();
   const sprite=document.createElement('canvas');
   sprite.width=image.naturalWidth;
   sprite.height=image.naturalHeight;
   const ctx=sprite.getContext('2d');
   ctx.drawImage(image,0,0);
   const pixels=ctx.getImageData(0,0,sprite.width,sprite.height).data;
   if(sprite.width!==256||sprite.height!==128||!pixels.some((a,i)=>i%4===3&&a>0)){
    throw Error('Expected a visible original two-frame sprite: '+name);
   }
   for(const mannequin of [true,false]){
    model.reset();
    const options=model.defaultOptions();
    Object.assign(options,{mannequin,show_face:false,show_hair:false,breasts:'default',breast_size:3,alt_override:mannequin?1:0});
    Object.assign(options.worn[slot],{
     index,colour:item.colour_options?.[0]||'',accColour:item.accessory_colour_options?.[0]||'',pattern:item.pattern_options?.[0]||'',
    });
    for(const [secondary,linkedName] of Object.entries(item.outfitPrimary||{})){
     const linked=config.clothes[secondary]?.findIndex(clothing=>clothing.name===linkedName);
     if(linked>0&&options.worn[secondary])options.worn[secondary].index=linked;
    }
    const layers=model.compile(options).filter(layer=>layer.show!==false);
    if(!layers.some(layer=>String(layer.src).startsWith(prefix)))throw Error('Original clothing layer was not selected: '+name+' / '+mannequin);
    if(!layers.some(layer=>String(layer.src).startsWith('dol-original:img/body/')))throw Error('Original body layer was not selected: '+name+' / '+mannequin);
    const canvas=model.createCanvas(true);
    await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('Garment did not finish rendering: '+name+' / '+mannequin)),35000);
     Renderer.composeLayers(canvas,layers,model.frames,{
      renderingDone(){
       clearTimeout(timer);
       const pixels=canvas.getImageData(0,0,canvas.canvas.width,canvas.canvas.height).data;
       if(pixels.some((a,i)=>i%4===3&&a>0))resolve();
       else reject(Error('Empty garment composition: '+name+' / '+mannequin));
      },
      error(error){clearTimeout(timer);reject(error);}
     });
    });
    results.push({name,mannequin});
   }
  }
  return results;
 });
 assert.equal(clothingRegression.length,6);
 console.log('PASS diving suit, nurse socks and trainers on shop mannequin and player model.');
 const fallbackComposition=await page.evaluate(async()=>{
  const target=document.createElement('canvas').getContext('2d');
  const source=document.createElement('canvas');
  source.getContext('2d').fillRect(0,0,12,12);
  const loader=Renderer.ImageLoader;
  const failure='img/clothes/test-unavailable/full.png';
  let timer;
  try {
   Renderer.ImageLoader={loadImage(src,layer,ok,fail){
    if(src===failure){ queueMicrotask(()=>fail(src,layer,{dolArtwork:true}));return; }
    loader.loadImage(src,layer,ok,fail);
   }};
   return await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('A failed garment blocked the remaining layers')),5000);
    const model={name:'main',height:target.canvas.height,width:target.canvas.width};
    Renderer.composeLayers(target,[{src:source,z:0,model},{src:failure,z:1,model}],1,{
     renderingDone(){resolve(target.getImageData(4,4,1,1).data[3]);},
     error:reject
    });
   });
  } finally { clearTimeout(timer); Renderer.ImageLoader=loader; }
 });
 assert.equal(fallbackComposition,255,'a failed garment does not hide the remaining canvas');
 const town=await page.evaluate(async()=>{
  const image=await ImageCache.getOrCreate('img/misc/locations/town/base.png');
  return {embedded:image.src.startsWith('data:image/png;base64,'),width:image.width,height:image.height};
 });
 assert.ok(town.embedded&&town.width>0&&town.height>0,'town background is available without an image request');
 const dressLayers=['img/clothes/upper/tie front dress/full.png','img/clothes/lower/tie front dress/full.png'];
 const otherClothes={
  'img/clothes/face/gasmask/full.png':512,
  'img/clothes/head/newsboy/full.png':512,
  'img/clothes/upper/exorcisthabit/full.png':512,
  'img/clothes/lower/exorcisthabit/full.png':512,
  'img/clothes/lower/gingham/full.png':512,
  'img/clothes/under-lower/latexleotard/full.png':512,
  'img/clothes/feet/trainers/full.png':256,
 };
 const dressTiming=await page.evaluate(async paths=>{
  const start=performance.now();
  const layer={scale:true,model:{name:'main',height:256,width:256}};
  const rendered=await Promise.all(paths.map(path=>new Promise((resolve,reject)=>{
   Renderer.DefaultImageLoader.loadImage(path,layer,(_,__,image)=>{
    const pixels=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
    let top=image.height,bottom=0;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]){
     const y=Math.floor((i-3)/4/image.width);
     top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    resolve({width:image.width,height:image.height,top,bottom});
   },(_,__,error)=>reject(error));
  })));
  return {elapsedMs:performance.now()-start,rendered};
 },[...dressLayers,...Object.keys(otherClothes)]);
 assert.deepEqual(dressTiming.rendered.slice(0,2),[
  {width:512,height:256,top:94,bottom:139},
  {width:512,height:256,top:112,bottom:175},
 ],'shop dress layers retain both frames and align in the 256-pixel model');
 for(const [i,[path,width]] of Object.entries(otherClothes).entries()){
  const actual=dressTiming.rendered[i+2];
  assert.equal(actual.width,width,'whole-frame width: '+path);
  assert.equal(actual.height,256,'model height: '+path);
  assert.ok(actual.top<actual.bottom,'visible artwork: '+path);
 }
 const locationLights=await page.evaluate(async()=>{
  const results=await Promise.all(['emissive-evening.png','red.png'].map(file=>ImageCache.getOrCreate('img/misc/locations/office/'+file)));
  return results.map(image=>[image.width,image.height]);
 });
 assert.ok(locationLights.every(([width,height])=>width>1&&height>1));
 await script("window.__profile={upper:clone(V.worn.upper),hair:V.hairtype};window.__hair=setup.hairstyles.sides.map(h=>h.variable).filter(h=>typeof h==='string'&&h!==V.hairtype)[0];V.hairtype=window.__hair;Engine.play('Bedroom');");
 await page.waitForTimeout(700);
 assert.deepEqual(await page.locator('#passages .error').allTextContents(),[]);
 await script("V.worn.upper=window.__profile.upper;V.hairtype=window.__profile.hair;Engine.play('Bedroom');");
 await page.waitForTimeout(400);
 assert.deepEqual(errors,[],'no uncaught game errors');
 assert.ok(new Set(images).size<500,'images load on demand rather than prefetching the entire pack');
 const backup=await page.evaluate(async()=>{
  const snapshot=await DOLBackup.read();return {local:snapshot.localStorage['mobile-preserve-local'],saveRows:snapshot.saveDatabases['degrees-of-lewdity'].stores.saves.length};
 });
 assert.equal(backup.local,'keep');assert.ok(backup.saveRows>=1);
 // Open the real Chinese Other tab and operate the new controls.
 assert.deepEqual(await page.evaluate(()=>window.DOLWardrobeCapacity?.patchReport),{menu:true,furniture:true});
 const openWardrobe=async()=>{
  await script('closeOverlay();UIBar.unstow(true);');
  await page.getByRole('button',{name:/^(作弊|CHEATS)$/i}).click();
  await page.getByRole('button',{name:/^(其它|其他|Other)$/}).click();
  await page.locator('#dol-wardrobe-capacity-controls').waitFor();
 };
 await openWardrobe();
 assert.ok((await page.locator('#customOverlayContent').innerText()).includes('时间与天气'),'existing cheat translation retained');
 const control=page.locator('#dol-wardrobe-capacity-controls');
 const capacity=async()=>Number(await page.locator('#dol-wardrobe-capacity-value').textContent());
 const originalCapacity=await capacity();
 await control.getByRole('link',{name:'+1',exact:true}).click();assert.equal(await capacity(),originalCapacity+1);
 await control.getByRole('link',{name:'+10',exact:true}).click();assert.equal(await capacity(),originalCapacity+11);
 await control.getByRole('link',{name:'−1',exact:true}).click();assert.equal(await capacity(),originalCapacity+10);
 await control.getByRole('link',{name:'−10',exact:true}).click();assert.equal(await capacity(),originalCapacity);
 await control.getByRole('link',{name:'+10',exact:true}).click();
 await control.getByRole('link',{name:'+10',exact:true}).click();
 await script('Furniture.in("bedroom");Furniture.wardrobeUpdate();window.__wardrobeSpace=V.wardrobe.space;window.__wardrobeSaved=Save.slots.save(0,"衣柜容量验证");');
 assert.equal(await page.evaluate(()=>window.__wardrobeSpace),originalCapacity+20,'furniture recalculation preserves cheat capacity');
 assert.equal(await page.evaluate(()=>window.__wardrobeSaved),true);
 await script('window.DOLWardrobeCapacity.change(State.variables,3);Save.slots.load(0);');
 await script('Furniture.in("bedroom");Furniture.wardrobeUpdate();window.__wardrobeSpace=V.wardrobe.space;');
 assert.equal(await page.evaluate(()=>window.__wardrobeSpace),originalCapacity+20,'saved capacity restored');
 await script('V.wardrobe.upper=Array.from({length:25},()=>clone(V.worn.upper));window.__capacityFloor=window.DOLWardrobeCapacity.info(State.variables).minimum;window.DOLWardrobeCapacity.change(State.variables,window.__capacityFloor+3-V.wardrobe.space);window.__wardrobeItems=JSON.stringify(setup.clothes_all_slots.map(slot=>V.wardrobe[slot]));');
 await openWardrobe();
 await control.getByRole('link',{name:'−10',exact:true}).click();
 assert.equal(await capacity(),await page.evaluate(()=>window.__capacityFloor),'decrease stops at occupied slots');
 assert.equal(await control.getByRole('link',{name:'−1',exact:true}).count(),0);
 assert.equal(await control.getByRole('link',{name:'−10',exact:true}).count(),0);
 await script('window.__wardrobeAfter=JSON.stringify(setup.clothes_all_slots.map(slot=>V.wardrobe[slot]));');
 assert.equal(await page.evaluate(()=>window.__wardrobeAfter),await page.evaluate(()=>window.__wardrobeItems),'no clothing removed or changed');
 assert.deepEqual(await page.locator('#customOverlayContent .error').allTextContents(),[]);
 assert.deepEqual(errors,[]);
 console.log('PASS wardrobe controls: real Other tab, +/-1 and +/-10, furniture recalculation, save/load and occupied-slot floor without clothing deletion.');
 await fs.mkdir('verification',{recursive:true});
 await page.screenshot({path:'verification/mobile-'+kind+'.png',fullPage:true});
 const coldReport=await page.evaluate(()=>window.DOLMobileLoadReport);
 const dressData=await page.evaluate(path=>modImgLoaderHooker.getImage(path),dressLayers[0]);
 const dressHash=createHash('sha256').update(Buffer.from(dressData.split(',')[1],'base64')).digest('hex');
 dressAsset='/mobile/art/'+dressHash+'.png';
 // Close the page and reopen with all boot data requests denied.
 phase='warm';
 await page.close();
 const warmPage=await context.newPage();
 const warmStart=Date.now();
 await warmPage.goto(base+'mobile.html?mobile=10',{waitUntil:'domcontentloaded'});
 await warmPage.waitForFunction(()=>window.SugarCube?.State?.passage,null,{timeout:90000});
 const warmMs=Date.now()-warmStart;
 assert.equal(warmRequests,0);
 assert.equal(await warmPage.evaluate(()=>DOLMobileLoadReport.cached),true);
 const cachedArt=await warmPage.evaluate(async path=>{
  const image=await modImgLoaderHooker.getImage(path);
  return image?.startsWith('data:image/');
 },dressLayers[0]);
 assert.equal(cachedArt,true);
 assert.equal(warmDressRequests,0,'the same dress layer loads with its network route disabled');
 await fs.writeFile('verification/mobile-'+kind+'.json',JSON.stringify({browser:kind,saveId,samples,chunkRequests,artRequests:new Set(images).size,coldMs,warmMs,dressTiming,report:coldReport},null,2));
 console.log('PASS cached reopen',JSON.stringify({coldMs,warmMs,warmRequests,dressTiming}));
 console.log('PASS',kind,'real old local/IndexedDB saves preserved; Chinese + 32779 lazy art entries; interrupted chunk retried; no worker/cache dependency or monolithic HTML/ZIP download.');
}catch(error){
 console.log('FAILURE PAGE',page.url());console.log(await page.evaluate(()=>({body:document.body?.innerText.slice(0,1800),check:window.DOLBootCheck,report:window.DOLMobileLoadReport,wardrobePatch:window.DOLWardrobeCapacity&&{keys:Object.keys(window.DOLWardrobeCapacity),error:window.DOLWardrobeCapacity.patchError}})).catch(()=>({})));
 throw error;
}finally{await browser.close();}
