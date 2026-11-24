import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const kind=process.argv[2]||'chromium';
const browser=await ({chromium,webkit}[kind]).launch();
const context=await browser.newContext({...devices['iPhone 13']});
await context.addInitScript(()=>{
 localStorage.setItem('verifiedAge','true');
 if(location.pathname.endsWith('/mobile.html')){
  if('serviceWorker' in navigator)navigator.serviceWorker.register=()=>Promise.reject(Error('Test: service workers unavailable'));
  if(window.caches)caches.open=()=>Promise.reject(Error('Test: CacheStorage unavailable'));
 }
});
const page=await context.newPage();const base='http://127.0.0.1:8765/';
let phase='legacy',reset=false,chunkRequests=0;const forbidden=[],errors=[],images=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')console.log('browser-error:',m.text().slice(0,500));});
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(phase==='mobile'){
  if(['/game.html','/online.html','/mods/DoLWebArtPack.mod.zip'].includes(u.pathname)){forbidden.push(u.pathname);await route.abort('connectionreset');return;}
  if(/\/mobile\/(core|mods)\/.+\.bin$/.test(u.pathname)){
   chunkRequests++;
   if(!reset){reset=true;await route.abort('connectionreset');return;}
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
 await page.goto(base+'mobile.html?mobile=6',{waitUntil:'domcontentloaded',timeout:30000});await ready();
 assert.equal(await page.evaluate(()=>window.modSC2DataManager.getLanguageManager().mainLanguage),'zh');
 assert.equal(await page.evaluate(()=>window.DOLWebArtReport?.delivery),'static-on-demand');
 assert.equal(await page.evaluate(()=>window.DOLWebArtReport?.images),32779);
 assert.equal(await page.evaluate(()=>window.DOLWebCompatibilityReport?.length),6);
 assert.equal(await page.evaluate(()=>window.DOLMobileLoadReport?.complete),true);
 assert.ok(await page.evaluate(()=>window.DOLMobileLoadReport.retries)>=1,'dropped chunk was retried');
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
 const manifest=JSON.parse(await fs.readFile('mobile/manifest.json','utf8'));
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
 await fs.writeFile('verification/mobile-'+kind+'.json',JSON.stringify({browser:kind,saveId,samples,chunkRequests,artRequests:new Set(images).size,report:await page.evaluate(()=>window.DOLMobileLoadReport)},null,2));
 console.log('PASS',kind,'real old local/IndexedDB saves preserved; Chinese + 32779 lazy art entries; interrupted chunk retried; no worker/cache dependency or monolithic HTML/ZIP download.');
}catch(error){
 console.log('FAILURE PAGE',page.url());console.log(await page.evaluate(()=>({body:document.body?.innerText.slice(0,1800),check:window.DOLBootCheck,report:window.DOLMobileLoadReport})).catch(()=>({})));
 throw error;
}finally{await browser.close();}
