import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
const kind=process.argv[2]||'chromium';
const browser=await ({chromium,webkit}[kind]).launch(kind==='chromium'?{channel:'chrome'}:{});
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
 await page.goto(base+'launch.html?startup=4');
 await page.waitForURL(/game\.html\?build=dol-051213-chs101a-3/,{timeout:90000});
 await page.locator('#cached-fixture').waitFor();
 assert.equal(requests,0,'already cached game/art files must not be downloaded again');
 assert.equal(await page.evaluate(()=>localStorage.getItem('startup-save-sentinel')),'must-survive');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('startup-session-sentinel')),'must-survive');
 const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('degrees-of-lewdity');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('saves').objectStore('saves').get(7);q.onsuccess=()=>{db.close();resolve(q.result.marker);};q.onerror=()=>reject(q.error);};
 }));
 assert.equal(saved,'real-save-fixture');
 console.log('PASS '+kind+': new backup preserves IndexedDB saves; existing backup is not deserialized at startup; cached game/art reused; local/session saves intact.');
}finally{await browser.close();}
