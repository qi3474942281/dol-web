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
 const ctx={document:{getElementById:id=>nodes[id]},location:{href:'https://example.test/dol-web/launch.html',replace:url=>destination=url,assign(){}},
  DOLBackup:{ensure:()=>fault==='backup'?pending():Promise.resolve()},
  navigator:{serviceWorker:{controller:{postMessage(message,ports){if(fault!=='worker')ports[0].reply('startup-4');}},register(url){registration=url;return pending();}}},
  caches:{open:()=>fault==='cache'?pending():Promise.resolve(cache)},
  URL,MessageChannel:Channel,Promise,Date,Error,
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,15)),clearTimeout};
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
for(const [fault,stage,error] of [
 ['backup','存档','存档备份超时'],['worker','组件','离线缓存组件加载超时'],
 ['cache','缓存','打开本机文件缓存超时'],['match','缓存','读取本机文件缓存超时']]){
 const result=await run(fault);
 assert.equal(result.destination,undefined);
 assert.ok(result.nodes.error.textContent.includes(error),fault+': '+result.nodes.error.textContent);
 assert.equal(result.nodes.retry.hidden,false);
}
console.log('PASS: snapshot metadata-only check, existing game/art cache reused, backup/worker/cache-open/cache-read timeouts offer retry.');
