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
 console.log('PASS: WebKit started the standalone HTML with all subsequent HTTP requests blocked, and read the matching original body, both dress layers, and the town image.');
} finally {
 await browser.close();
}
