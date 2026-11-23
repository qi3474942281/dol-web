import {chromium, webkit, devices} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const kind=process.argv[2]||'chromium';
const browser=await ({chromium,webkit}[kind]).launch({headless:true});
const context=await browser.newContext({...devices['iPhone 13'],isMobile:true});
await context.addInitScript(()=>localStorage.setItem('verifiedAge','true'));
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') console.log('browser-error:',m.text().slice(0,500));});
const url='http://127.0.0.1:8765/';
await fs.mkdir('verification',{recursive:true});
const script=async source=>page.evaluate(source=>SugarCube.Wikifier.wikifyEval('<<script>>'+source+'<</script>>'),source);
async function ready(path){
 await page.goto(url+path,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.SugarCube?.State?.passage,{timeout:240000});
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
 await page.waitForFunction(()=>window.idb&&!idb.lock,{timeout:30000});
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
 assert.match(page.url(),/game\.html\?build=dol-051213-chs101a-1/);
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
 assert.equal(await page.evaluate(()=>idb.loadState(3)),true);
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
 const images=await page.evaluate(()=>Array.from(document.images).filter(i=>i.complete&&i.naturalWidth>0).length);
 assert.ok(images>0,'official images loaded');
 await page.screenshot({path:'verification/'+kind+'.png',fullPage:true});
 await fs.writeFile('verification/'+kind+'.json',JSON.stringify({browser:kind,version:'0.5.12.13-chs-1.0.1a',bothSaveFormatsLoaded:true,backup,images,errors},null,2));
 console.log('PASS',kind,JSON.stringify({backup,images}));
}catch(e){
 console.log('FAIL',kind,e.stack);
 console.log('location:',page.url());
 console.log('passage:',(await page.locator('#passages').innerText().catch(()=>'' )).slice(0,1800));
 await page.screenshot({path:'verification/'+kind+'-failure.png',fullPage:true}).catch(()=>{});
 throw e;
}finally{await browser.close();}
