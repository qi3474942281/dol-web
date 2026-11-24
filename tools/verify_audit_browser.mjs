import {devices, webkit} from 'playwright';
import assert from 'node:assert/strict';

const browser = await webkit.launch();
try {
 const context = await browser.newContext(devices['iPhone 13']);
 const url = 'http://127.0.0.1:8765';
 await context.route('**/*', route => {
  const request=new URL(route.request().url());
  if (request.protocol === 'data:' || request.protocol === 'blob:') return route.continue();
  if (request.origin === url && route.request().isNavigationRequest()) return route.continue();
  return route.abort();
 });
 await context.addInitScript(() => localStorage.setItem('verifiedAge','true'));
 const page = await context.newPage();
 page.on('pageerror',error=>console.log('Page error:',error.message.slice(0,500)));
 page.on('console',message=>{if(message.type()==='error')console.log('Browser error:',message.text().slice(0,500));});
 await page.goto(url+'/开始游戏.html', {waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(() => window.SugarCube?.State?.passage || document.getElementById('dol-startup-error'),null,{timeout:180000});
 console.log('Game startup reached');
 const result = await page.evaluate(async () => {
  const body = 'img/body/mannequin/base-body.png';
  const upper = 'img/clothes/upper/milkmaid dress/full.png';
  const lower = 'img/clothes/lower/milkmaid dress/full.png';
  const paths = [body,upper,lower].map(src=>({src}));
  const layers = DOLMobileArt.matchClothing(paths);
  const sources = await Promise.all([...layers.map(layer=>layer.src),'img/misc/locations/town/base.png'].map(path=>DOLMobileArt.source(path)));
  return {report:DOLBootCheck, body:layers[0].src, embedded:sources.every(src=>src?.startsWith('data:image/'))};
 });
 assert.equal(result.report?.language,'zh');
 assert.equal(result.report?.mods,26);
 assert.equal(result.body,'dol-original:img/body/mannequin/base-body.png');
 assert.equal(result.embedded,true);
 const audit=await page.evaluate(async()=>{
  const config=SugarCube.setup||window.setup;
  const model=Renderer.locateModel('main');
  const stats={items:0,drawn:0,noImage:[],missing:[],reportedExamples:{}};
  const noImage=new Set(), missing=new Set();
  for(const slot of config.clothes_all_slots){
   const catalog=config.clothes[slot];
   if(!Array.isArray(catalog))continue;
   for(let index=1;index<catalog.length;index++){
    const item=catalog[index];
    if(!item||!item.variable)continue;
    const key=slot+'/'+item.variable;
    stats.items++;
    for(const mannequin of [true,false]){
     model.reset();
     const options=model.defaultOptions();
     Object.assign(options,{mannequin,show_face:false,show_hair:false,breasts:'default',breast_size:3,alt_override:mannequin?1:0});
     options.worn[slot].index=index;
     options.worn[slot].colour=item.colour_options?.[0]||'';
     options.worn[slot].accColour=item.accessory_colour_options?.[0]||'';
     options.worn[slot].pattern=item.pattern_options?.[0]||'';
     const hold=item.holdPosition;
     if(slot==='handheld'||hold){
      options.arm_right=['left_cover','left_idle','left_hold','idle_both'].includes(hold)?'idle':(['right_cover','cover_both'].includes(hold)?'cover':'hold');
      options.arm_left=hold==='left_hold'?'hold':(['left_cover','cover_both','clutch'].includes(hold)?'cover':'idle');
     }
     for(const [secondary,name] of Object.entries(item.outfitPrimary||{})){
      const linked=config.clothes[secondary]?.findIndex(x=>x.name===name);
      if(linked>0&&options.worn[secondary])options.worn[secondary].index=linked;
     }
     const layers=model.compile(options).filter(l=>l.show!==false);
     const matching=layers.filter(l=>String(l.src).includes('/'+slot+'/'+item.variable+'/'));
     if(!matching.length)noImage.add(key);
     const paths=[...new Set(layers.flatMap(l=>[l.src,...[l.masksrc].flat().map(m=>m?.path??m)]).filter(p=>typeof p==='string'&&(p.startsWith('img/clothes/')||p.startsWith('dol-original:img/clothes/'))))];
     for(const path of paths){
      if(!await DOLMobileArt.source(path)?.catch(()=>null))missing.add(key+': '+path);
     }
     if(!matching.length)continue;
     await new Promise((resolve,reject)=>{
      const canvas=model.createCanvas(true);
      const timeout=setTimeout(()=>reject(Error('Render did not finish: '+key+' / '+mannequin)),8000);
      Renderer.composeLayers(canvas,layers,model.frames,{
       renderingDone(){
        clearTimeout(timeout);
        const data=canvas.getImageData(0,0,canvas.canvas.width,canvas.canvas.height).data;
        if(!data.some((a,i)=>i%4===3&&a>0)){reject(Error('Empty frame: '+key));return;}
        stats.drawn++;
        if(['upper/diving','legs/nursesocks','feet/trainers'].includes(key)){
         stats.reportedExamples[key]=(stats.reportedExamples[key]||0)+1;
        }
        resolve();
       },
       error(error){clearTimeout(timeout);reject(error);}
      });
     });
    }
   }
  }
  stats.noImage=[...noImage];
  stats.missing=[...missing];
  return stats;
 });
 for(const key of ['upper/diving','legs/nursesocks','feet/trainers'])assert.equal(audit.reportedExamples[key],2,key);
 await (await import('node:fs/promises')).writeFile('clothing-audit-refined.json',JSON.stringify(audit,null,2)+'\n');
 console.log('Unavailable paths:',JSON.stringify(audit.missing));
 console.log('Clothing combinations checked:',audit.items,'rendered:',audit.drawn,'no dedicated layer:',audit.noImage.length,'unresolved paths:',audit.missing.length);
 console.log('PASS: WebKit started the standalone HTML with all subsequent HTTP requests blocked, and read the matching original body, both dress layers, and the town image.');
} finally {
 await browser.close();
}
