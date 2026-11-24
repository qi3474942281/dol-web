import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
const kind=process.argv[2]||'chromium';
const browser=await ({chromium,webkit}[kind]).launch(process.env.DOL_CONTAINER?{}:kind==='chromium'?{channel:'chrome'}:{});
const context=await browser.newContext({...devices['iPhone 13']});
const page=await context.newPage();
const base='http://127.0.0.1:8765/';
try{
 await page.goto(base+'backup.html');
 await page.evaluate(async()=>{
  localStorage.setItem('startup-save-sentinel','must-survive');
  sessionStorage.setItem('startup-session-sentinel','must-survive');
  for(const [name,store,key,value] of [
   ['degrees-of-lewdity','saves',7,{marker:'real-save-fixture'}],
   ['ModLoader_IndexDBLoader','ModLoader_IndexDBLoader','mod-archive',new Uint8Array(4*1024*1024)]]){
   await new Promise((resolve,reject)=>{
    const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);
    r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
   });
  }
  await DOLBackup.ensure();
  const snapshot=await DOLBackup.read();
  if(snapshot.saveDatabases['degrees-of-lewdity'].stores.saves[0][1].marker!=='real-save-fixture')throw Error('Save snapshot was not preserved');
  localStorage.setItem('backup-created-sentinel',snapshot.created);
  const cache=await caches.open('dol-web-dol-051213-chs101a-3');
  for(const path of ['game.html','mods/DoLWebArtPack.mod.zip']){
   await cache.put(new URL(path+'?build=dol-051213-chs101a-3',location.href),new Response('<!doctype html><meta charset="UTF-8"><p id="cached-fixture">Cached game fixture</p>',{headers:{'Content-Type':'text/html'}}));
  }
 });
 await context.addInitScript(()=>{
  const get=IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get=function(...args){if(this.name==='snapshots')throw Error('Startup deserialized the full backup');return get.apply(this,args);};
 });
 let requests=0;
 context.on('request',r=>{if(r.url().includes('upstream-release.json')||r.url().includes('/mods/DoLWebArtPack.mod.zip'))requests++;});
 await page.goto(base+'start.html?startup=5');
 await page.waitForURL(/game\.html\?build=dol-051213-chs101a-3/,{timeout:90000});
 await page.locator('#cached-fixture').waitFor();
 assert.equal(requests,0,'already cached game/art files must not be downloaded again');
 assert.equal(await page.evaluate(()=>localStorage.getItem('startup-save-sentinel')),'must-survive');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('startup-session-sentinel')),'must-survive');
 const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('degrees-of-lewdity');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('saves').objectStore('saves').get(7);q.onsuccess=()=>{db.close();resolve(q.result.marker);};q.onerror=()=>reject(q.error);};
 }));
 assert.equal(saved,'real-save-fixture');
 await context.close();
 const fallback=await browser.newContext({...devices['iPhone 13']});
 await fallback.addInitScript(()=>{
  localStorage.setItem('verifiedAge','true');
  localStorage.setItem('online-save-sentinel','preserved');
  if('serviceWorker' in navigator)navigator.serviceWorker.register=()=>Promise.reject(Error('Test: worker registration unavailable'));
 });
 const fp=await fallback.newPage();
 await fp.goto(base+'start.html?fallback-test=5');
 await fp.waitForURL(/online\.html\?build=dol-051213-chs101a-3/,{timeout:30000});
 await fp.waitForFunction(()=>window.SugarCube?.State?.passage||document.getElementById('dol-startup-error'),null,{timeout:240000});
 assert.equal(await fp.locator('#dol-startup-error').count(),0,'online game startup rejected');
 assert.equal(await fp.evaluate(()=>window.DOLWebArtReport?.images),32779);
 assert.equal(await fp.evaluate(()=>window.DOLWebCompatibilityReport?.length),6);
 assert.equal(await fp.evaluate(()=>window.modSC2DataManager.getLanguageManager().mainLanguage),'zh');
 assert.match(await fp.locator('#passages').innerText(),/[\u4e00-\u9fff]{3}/);
 assert.equal(await fp.evaluate(()=>localStorage.getItem('online-save-sentinel')),'preserved');
 await fallback.close();
 console.log('PASS '+kind+': new backup preserves IndexedDB saves; existing backup is not deserialized at startup; cached game/art reused; local/session saves intact; blocked worker registration boots real Chinese game with full artwork through online.html.');
}finally{await browser.close();}
