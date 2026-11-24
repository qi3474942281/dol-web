const {createHttpQueue}=require('../http-queue.js');
const assert=require('node:assert/strict');
(async()=>{
 let clock=100000,calls=[],count=0;const store=new Map();
 const q=createHttpQueue({now:()=>clock,sleep:async ms=>{clock+=ms;},gapMs:0,storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},fetcher:async()=>{
  calls.push(clock);return ++count===1?new Response('limited',{status:429,headers:{'Retry-After':'2'}}):new Response(new Uint8Array([7,8]));
 }});
 assert.deepEqual(Array.from(await q.read('a')),[7,8]);assert.ok(calls[1]-calls[0]>=2000);assert.equal(Number(store.get('dol-http-cooldown-v1')),102000);
 // A new page must respect a cooldown recorded by a previous page.
 clock=101000;let first;
 const resumed=createHttpQueue({now:()=>clock,sleep:async ms=>{clock+=ms;},gapMs:0,storage:{getItem:k=>store.get(k)},fetcher:async()=>{first=clock;return new Response('ok');}});
 await resumed.read('b');assert.ok(first>=102000);
 // An HTTP date is also a valid server retry deadline.
 clock=100000;count=0;calls=[];
 const dated=createHttpQueue({now:()=>clock,sleep:async ms=>{clock+=ms;},gapMs:0,fetcher:async()=>{calls.push(clock);return ++count===1?new Response('',{status:429,headers:{'Retry-After':new Date(105000).toUTCString()}}):new Response('ok');}});
 await dated.read('c');assert.ok(calls[1]>=105000);
 // Repeated limiting stops requests instead of adding rapid retries forever.
 clock=100000;count=0;
 const stopped=createHttpQueue({now:()=>clock,sleep:async ms=>{clock+=ms;},gapMs:0,fetcher:async()=>{count++;return new Response('',{status:429});}});
 await assert.rejects(stopped.read('d'),e=>e.rateLimited===true);assert.equal(count,3);assert.equal(stopped.halted,true);
 await assert.rejects(stopped.read('e'),e=>e.rateLimited===true);assert.equal(count,3);
 // All callers share the same concurrency bound.
 let active=0,max=0;
 const limited=createHttpQueue({gapMs:0,fetcher:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return new Response('ok');}});
 await Promise.all(Array.from({length:12},(_,i)=>limited.read(String(i))));assert.equal(max,2);
 console.log('PASS: Retry-After seconds/date, shared cooldown across reload, bounded rate-limit retries and concurrency.');
})().catch(e=>{console.error(e);process.exitCode=1;});
