import {chromium, webkit, devices} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const kind=process.argv[2]||'chromium';
const browser=await ({chromium,webkit}[kind]).launch({headless:true,...(process.env.DOL_CHROME?{executablePath:process.env.DOL_CHROME,args:['--no-sandbox']}:kind==='chromium'?{channel:'chrome'}: {})});
const context=await browser.newContext({...devices['iPhone 13'],isMobile:true});
await context.addInitScript(()=>localStorage.setItem('verifiedAge','true'));
const page=await context.newPage();let activePage=page;
const modRequests=[];context.on('request',r=>{if(/\/mods\/.*\.zip/.test(r.url()))modRequests.push(r.url());});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') console.log('browser-error:',m.text().slice(0,500));});
const url='http://127.0.0.1:8765/';
await fs.mkdir('verification',{recursive:true});
const script=async source=>page.evaluate(source=>SugarCube.Wikifier.wikifyEval('<<script>>'+source+'<</script>>'),source);
async function ready(path){
 await page.goto(url+path,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.SugarCube?.State?.passage||document.getElementById('dol-startup-error')||document.getElementById('error')?.textContent,null,{timeout:240000});
 if(await page.locator('#dol-startup-error').count())throw Error('Startup rejected: '+JSON.stringify(await page.evaluate(()=>window.DOLBootCheck)));
 if(await page.locator('#error').count()&&await page.locator('#error').textContent())throw Error(await page.locator('#error').textContent());
 console.log('ready:',path,await page.evaluate(()=>SugarCube.State.passage));
}
async function clean(label){
 const bad=await page.locator('#passages .error').allTextContents();
 assert.deepEqual(bad,[],label+': passage errors');
 assert.deepEqual(errors,[],label+': uncaught errors');
}
try{
 await ready('legacy.html');
 await script("Engine.play('Start2');");
 await script("V.intro=0;V.money=123456;V.dolUpgradeMarker='preserve-this-save';V.saveName='升级验证';Engine.play('Bedroom');");
 await clean('old character');
 await script("State.create(State.passage);window.__oldId=Config.saves.id;window.__saved=Save.slots.save(0,'升级验证');");
 assert.equal(await page.evaluate(()=>window.__saved),true);
 await page.waitForFunction(()=>window.idb&&!idb.lock,null,{timeout:30000});
 assert.equal(await page.evaluate(()=>idb.saveState(3)),true);
 const previous=await page.evaluate(()=>({id:window.__oldId,db:idb.dbName,details:localStorage.getItem('degrees-of-lewdity.save') }));
 console.log('old identifiers:',previous);
 assert.equal(previous.db,'degrees-of-lewdity');
 await page.evaluate(()=>{
  localStorage.setItem('dol-upgrade-preserve','old-value');
  sessionStorage.setItem('dol-upgrade-session','old-session');
  return new Promise((resolve,reject)=>{
   const r=indexedDB.open('ModLoader_IndexDBLoader');
   r.onsuccess=()=>{const db=r.result;const tx=db.transaction('ModLoader_IndexDBLoader','readwrite');const store=tx.objectStore('ModLoader_IndexDBLoader');store.put(['must-not-load'],'modDataIndexDBZipList');store.put(new Uint8Array([1,2,3]),'modDataIndexDBZipPrefixmust-not-load');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  });
 });
 await ready('');
 assert.match(page.url(),/game\.html\?build=dol-051213-chs101a-3/);
 assert.equal(await page.evaluate(()=>window.DOLWebCompatibilityReport?.length),6);
 await script("window.__configId=Config.saves.id;window.__gameVersion=StartConfig.version;window.__cheatPatched=!Story.get('StoryCaption').text.includes('and $cheatsEnabled is true or $debug is 1');");
 assert.equal(await page.evaluate(()=>window.__gameVersion),'0.5.12.13');
 assert.equal(await page.evaluate(()=>window.__configId),previous.id);
 assert.equal(await page.evaluate(()=>window.__cheatPatched),true);
 await clean('new start');
 assert.match(await page.locator('#passages').innerText(),/[\u4e00-\u9fff]{3}/);
 await script("window.__loaded=Save.slots.load(0);");
 assert.equal(await page.evaluate(()=>window.__loaded),true);
 await page.waitForTimeout(1000);
 await clean('localStorage save migration');
 await script("window.__fixture={marker:V.dolUpgradeMarker,money:V.money,name:V.saveName};");
 assert.deepEqual(await page.evaluate(()=>window.__fixture),{marker:'preserve-this-save',money:123456,name:'升级验证'});
 await page.evaluate(async()=>{await idb.getSaveDetails();await idb.loadState(3);});
 await page.waitForTimeout(1000);
 await clean('IndexedDB save migration');
 await script("window.__fixture={marker:V.dolUpgradeMarker,money:V.money};");
 assert.deepEqual(await page.evaluate(()=>window.__fixture),{marker:'preserve-this-save',money:123456});
 await page.addScriptTag({url:url+'save-backup.js'});
 const backup=await page.evaluate(async()=>{
  const first=await DOLBackup.read();localStorage.setItem('dol-upgrade-preserve','new-value');await DOLBackup.ensure();const last=await DOLBackup.read();
  return {created:first.created,same:first.created===last.created,sentinel:last.localStorage['dol-upgrade-preserve'],session:last.sessionStorage['dol-upgrade-session'],saveKeys:Object.keys(last.saveDatabases['degrees-of-lewdity'].stores),saves:last.saveDatabases['degrees-of-lewdity'].stores.saves.length,mods:last.modCache.some(([k])=>k==='modDataIndexDBZipList'),current:localStorage.getItem('dol-upgrade-preserve')};
 });
 assert.equal(backup.same,true);assert.equal(backup.sentinel,'old-value');assert.equal(backup.session,'old-session');assert.ok(backup.saves>=1);assert.equal(backup.mods,true);assert.equal(backup.current,'new-value');
 assert.equal(new Set(modRequests).size,1,'one artwork download URL');
 assert.ok(modRequests[0].includes('/mods/DoLWebArtPack.mod.zip'),'only the complete artwork pack is downloaded');
 const artManifest=JSON.parse(await fs.readFile('art-manifest.json','utf8'));
 assert.equal(await page.evaluate(()=>window.DOLWebArtReport?.mode),'BESC+UCB');
 const artSamples=await page.evaluate(async samples=>{
  const result={};
  for(const [kind,item] of Object.entries(samples)){
   const image=window.modGameOriginalImagePack.selfImg.get(item.path);
   if(!image)throw Error('Art asset unavailable: '+item.path);
   const data=await image.getter.getBase64Image();
   const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   const decoded=new Image();decoded.src=data;await decoded.decode();
   result[kind]={hash,width:decoded.naturalWidth,height:decoded.naturalHeight};
  }
  return result;
 },artManifest.samples);
 for(const [kind,item] of Object.entries(artManifest.samples)){assert.equal(artSamples[kind].hash,item.sha256);assert.ok(artSamples[kind].width>0);assert.ok(artSamples[kind].height>0);}
 // Render ordinary clothed profiles after swapping both garment templates and hair styles.
 await script("window.__artProfile={upper:clone(V.worn.upper),hair:V.hairtype};window.__hairVariants=setup.hairstyles.sides.map(h=>h.variable).filter(h=>typeof h==='string'&&h!==V.hairtype).slice(0,2);window.__shirtVariants=setup.clothes.upper.filter(c=>['school shirt','t-shirt','hoodie'].includes(c.name)).slice(0,2).map(c=>c.name);if(window.__shirtVariants.length<2)throw Error('Missing wardrobe fixtures');");
 for(let i=0;i<2;i++){
  await script("V.worn.upper=clone(setup.clothes.upper.find(c=>c.name===window.__shirtVariants["+i+"]));V.hairtype=window.__hairVariants["+i+"];Engine.play('Bedroom');");
  await page.waitForTimeout(800);await clean('clothing and hair variation '+i);
 }
 await script("V.worn.upper=window.__artProfile.upper;V.hairtype=window.__artProfile.hair;Engine.play('Bedroom');");
 await clean('restored character');
 console.log('verified actual artwork assets:',JSON.stringify(artSamples));
 const images=await page.evaluate(()=>Array.from(document.images).filter(i=>i.complete&&i.naturalWidth>0).length);
 assert.ok(images>0,'official images loaded');
 await page.screenshot({path:'verification/'+kind+'.png',fullPage:true});
 const fresh=await browser.newContext({...devices['iPhone 13'],isMobile:true});
 await fresh.addInitScript(()=>{localStorage.setItem('verifiedAge','true');});
 const fp=await fresh.newPage();activePage=fp;
 const freshErrors=[],freshModRequests=[];
 fp.on('pageerror',e=>freshErrors.push(e.message));
 fresh.on('request',r=>{if(/\/mods\/.*\.zip/.test(r.url()))freshModRequests.push(r.url());});
 await fp.goto(url,{waitUntil:'domcontentloaded'});
 await fp.waitForFunction(()=>window.SugarCube?.State?.passage||document.getElementById('dol-startup-error')||document.getElementById('error')?.textContent,null,{timeout:240000});
 const initial=await fp.locator('#passages').innerText();
 console.log('fresh-start:',initial.replace(/\s+/g,' ').trim().slice(0,650));
 assert.ok((initial.match(/[\u4e00-\u9fff]/g)||[]).length>100,'fresh start and character settings translated');
 assert.ok(!initial.includes('This work of fiction contains content of a sexual nature'),'English intro must be translated');
 assert.equal(await fp.evaluate(()=>window.DOLWebCompatibilityReport?.length),6);
 assert.equal(new Set(freshModRequests).size,1);assert.ok(freshModRequests[0].includes('/mods/DoLWebArtPack.mod.zip'));
 assert.deepEqual(freshErrors,[]);
 await fp.screenshot({path:'verification/'+kind+'-fresh-Chinese.png',fullPage:true});
 console.log('offline-cache:',await fp.evaluate(async()=>({controlled:!!navigator.serviceWorker.controller,caches:await caches.keys()})));
 // Playwright WebKit's offline emulation rejects even literal service-worker responses.
 // Stop the real origin instead, and prove it is unreachable outside the browser cache.
 const offlineMode=kind==='webkit'?'origin-server-stopped':'browser-offline';
 if(kind==='webkit'){
  process.kill(Number((await fs.readFile('/tmp/dol-server.pid','utf8')).trim()),'SIGTERM');
  await new Promise(r=>setTimeout(r,250));
  await assert.rejects(fetch(url,{signal:AbortSignal.timeout(3000)}),'origin must be unreachable');
 }else await fresh.setOffline(true);
 await fp.goto(url,{waitUntil:'domcontentloaded'});
 await fp.waitForFunction(()=>window.SugarCube?.State?.passage||document.getElementById('dol-startup-error')||document.getElementById('error')?.textContent,null,{timeout:240000});
 assert.match(await fp.locator('#passages').innerText(),/[\u4e00-\u9fff]{3}/);
 assert.equal(await fp.evaluate(()=>window.DOLWebCompatibilityReport?.length),6);
 assert.deepEqual(freshErrors,[]);
 console.log('PASS cached offline restart',kind,offlineMode);
 await fresh.close();
 if(kind==='chromium'){
  execFileSync('python',['-c',"import json,zipfile,hashlib;from pathlib import Path;p=Path('release-download/dol-0.5.12.13-chs-1.0.1a-BESC-UCB-offline.zip');m=json.loads(Path('upstream-release.json').read_text());assert hashlib.sha256(p.read_bytes()).hexdigest()==m['deployed'][p.name];z=zipfile.ZipFile(p);Path('/tmp/dol-offline-smoke.html').write_bytes(z.read('开始游戏.html'))"]);
  const disk=await browser.newContext();await disk.setOffline(true);
  await disk.addInitScript(()=>{try{localStorage.setItem('verifiedAge','true');}catch{}});
  const dp=await disk.newPage();
  await dp.goto('file:///tmp/dol-offline-smoke.html',{waitUntil:'domcontentloaded',timeout:120000});
  await dp.waitForFunction(()=>window.SugarCube?.State?.passage||document.getElementById('dol-startup-error')||document.getElementById('error')?.textContent,null,{timeout:240000});
  const text=await dp.locator('#passages').innerText();
  assert.ok(!text.includes('This work of fiction contains content of a sexual nature'));
  assert.ok((text.match(/[\u4e00-\u9fff]/g)||[]).length>100,'standalone HTML Chinese');
  assert.equal(await dp.evaluate(()=>window.DOLWebCompatibilityReport?.length),6);
  console.log('PASS standalone HTML without network');await disk.close();
 }
 await fs.writeFile('verification/'+kind+'.json',JSON.stringify({browser:kind,version:'0.5.12.13-chs-1.0.1a',bothSaveFormatsLoaded:true,freshChinese:true,offlineRestart:true,offlineMode,artworkCachedBeforeStartup:true,backup,images,errors},null,2));
 console.log('PASS',kind,JSON.stringify({backup,images,freshChinese:true,offlineRestart:true}));
}catch(e){
 console.log('FAIL',kind,e.stack);
 console.log('location:',activePage.url());
 console.log('boot-check:',await activePage.evaluate(()=>window.DOLBootCheck).catch(()=>null));
 console.log('page-text:',(await activePage.locator('body').innerText().catch(()=>'' )).slice(0,1800));
 await activePage.screenshot({path:'verification/'+kind+'-failure.png',fullPage:true}).catch(()=>{});
 throw e;
}finally{await browser.close();}
