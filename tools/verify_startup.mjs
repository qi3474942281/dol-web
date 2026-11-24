import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const backup=await fs.readFile('save-backup.js','utf8');
const installer=await fs.readFile('install.js','utf8');
// Existing large snapshots must never be read just to test their existence.
let closes=0,counts=0;
const sandbox={window:{},indexedDB:{open(){const req={};queueMicrotask(()=>{req.result={transaction(){return {objectStore(){return {count(){counts++;const r={};queueMicrotask(()=>{r.result=1;r.onsuccess();});return r;},get(){throw Error('Full snapshot read during startup');}};}};},close(){closes++;}};req.onsuccess();});return req;}}};
vm.runInNewContext(backup,sandbox);
await sandbox.window.DOLBackup.ensure();
assert.equal(counts,1);assert.equal(closes,1);
async function run(fault){
 const nodes=Object.fromEntries(['status','detail','progress','retry','play','error'].map(id=>[id,{textContent:'',hidden:false}]));
 let destination,registration;
 const hits=[];
 class Channel {
  constructor(){this.port1={close(){}};this.port2={reply:data=>queueMicrotask(()=>this.port1.onmessage({data}))};}
 }
 const pending=()=>new Promise(()=>{});
 const cache={match:async key=>{hits.push(key);return fault==='match'?pending():{};}};
 const ctx={document:{getElementById:id=>nodes[id]},location:{href:'https://example.test/dol-web/start.html',origin:'https://example.test',replace:url=>destination=url,assign(){}},
  DOLBackup:{ensure:()=>fault==='backup'?pending():Promise.resolve()},
  navigator:{serviceWorker:{controller:{scriptURL:'https://example.test/dol-web/sw.js?build='+(fault==='worker'?'old-build':'dol-051213-chs101a-3'),postMessage(){}},addEventListener(){},register(url){registration=url;return pending();}}},
  caches:{open:()=>fault==='cache'?pending():Promise.resolve(cache)},
  URL,MessageChannel:Channel,Promise,Date,Error,
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,15)),clearTimeout};
 if(fault==='no-worker')delete ctx.navigator.serviceWorker;
 vm.runInNewContext(installer,ctx);
 for(let i=0;i<100;i++){
  if(destination||nodes.error.textContent)break;
  await new Promise(r=>setTimeout(r,3));
 }
 return {nodes,destination,hits,registration};
}
const cached=await run();
assert.match(cached.destination,/game\.html\?build=dol-051213-chs101a-3$/);
assert.equal(cached.hits.length,2);assert.equal(cached.nodes.progress.value,100);
const backupTimeout=await run('backup');
assert.equal(backupTimeout.destination,undefined);
assert.match(backupTimeout.nodes.error.textContent,/存档备份超时/);
assert.equal(backupTimeout.nodes.retry.hidden,false);
for(const fault of ['worker','no-worker','cache','match']){
 const result=await run(fault);
 assert.match(result.destination,/online\.html\?build=dol-051213-chs101a-3$/,fault);
}
// Service worker installation must succeed even if every cache operation fails.
const events={};let cacheTouches=0;
vm.runInNewContext(await fs.readFile('sw.js','utf8'),{
 self:{location:{href:'https://example.test/dol-web/sw.js'},addEventListener:(name,cb)=>events[name]=cb,skipWaiting:()=>Promise.resolve(),clients:{claim:()=>Promise.resolve()}},
 URL,Promise,setTimeout,clearTimeout,caches:{open(){cacheTouches++;throw Error('Storage unavailable');}}
});
let installed;events.install({waitUntil:p=>installed=p});await installed;
assert.equal(cacheTouches,0);
console.log('PASS: snapshot metadata-only check; same-build worker accepted without messaging; game/art cache reused; worker/cache failures use online entry; backup timeout offers retry; worker activation does not download shell files.');
