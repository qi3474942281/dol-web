import base64, hashlib, io, json, re, subprocess, zipfile, sys
from pathlib import Path
root=Path(sys.argv[1])
with zipfile.ZipFile('DoL-0.5.12.13-BESC-UCB-Offline-Single-HTML-v9.zip') as z:
    html=z.read('开始游戏.html').decode()
    assert z.namelist()==['开始游戏.html','使用说明.txt','LICENSE','CREDITS.md']
chunks=[[] for _ in range(26)]
for chunk in re.finditer(r'<script type="application/octet-stream" data-offline-mod="(\d+)">([A-Za-z0-9+/=]+)</script>',html):
    chunks[int(chunk[1])].append(chunk[2])
assert all(chunks)
mods=[''.join(parts) for parts in chunks]
baseline=(root/'game.html').read_text()
assert re.search(r'<tw-storydata[^>]*>',html)[0]==re.search(r'<tw-storydata[^>]*>',baseline)[0]
assert len(mods)==26
assert all(zipfile.ZipFile(io.BytesIO(base64.b64decode(b))).testzip() is None for b in mods)
with zipfile.ZipFile(io.BytesIO(base64.b64decode(mods[-1]))) as z:
    boot=json.loads(z.read('boot.json'))
    preload=z.read('dist/preload/preload.js').decode()
    files={p:base64.b64encode(z.read(p)).decode() for p in [
        'img/body/mannequin/base-body.png',
        'img/dol-original/body/mannequin/base-body.png',
        'img/clothes/upper/milkmaid dress/full.png',
        'img/clothes/lower/milkmaid dress/full.png',
        'img/misc/locations/town/base.png',
    ]}
with zipfile.ZipFile(root/'mods/GameOriginalImagePack.mod.zip') as z:
    assert base64.b64decode(files['img/dol-original/body/mannequin/base-body.png'])==z.read('img/body/mannequin/base-body.png')
with zipfile.ZipFile(io.BytesIO(base64.b64decode(mods[-2]))) as z:
    assert 'wardrobe-cheat.js' in z.namelist()
for needle in ('window.DOLMobileArt.matchClothing(compiled)','failedLayers.add(layer)',"script[data-offline-mod]"):
    assert needle in html
script='''
const assert=require('node:assert/strict'), vm=require('node:vm');
const fs=require('node:fs');
const {paths,files,preload}=JSON.parse(fs.readFileSync(0,'utf8'));
const url=path=>'data:image/png;base64,'+files[path];
const selfImg=new Map(paths.map(path=>[path,{getter:{getBase64Image:async()=>url(path)}}]));
const window={
 modGameOriginalImagePack:{init(){},selfImg},
 modImgLoaderHooker:{normalizePath:path=>path,getImage:path=>selfImg.get(path)?.getter.getBase64Image()},
};
(async()=>{
 await vm.runInNewContext(preload,{window,fetch(){throw Error('Unexpected network');}});
 assert.equal(window.DOLWebArtReport.clothingFix,'dol-mobile-9');
 assert.equal(selfImg.size,32779);
 const body='img/body/mannequin/base-body.png', top='img/clothes/upper/milkmaid dress/full.png',
  bottom='img/clothes/lower/milkmaid dress/full.png',town='img/misc/locations/town/base.png';
 const art=window.DOLMobileArt;
 const layers=art.matchClothing([body,top,bottom].map(src=>({src})));
 assert.equal(layers[0].src,'dol-original:'+body);
 assert.equal(await art.source(layers[0].src),url('img/dol-original/body/mannequin/base-body.png'));
 for(const path of [top,bottom,town])assert.equal(await art.source(path),url(path));
 console.log('Offline archive and bundled renderer verified: original body, both dress layers, town base, old save identity, no network access in asset lookups.');
})().catch(error=>{console.error(error);process.exitCode=1;});
'''
subprocess.run(['node','-e',script],input=json.dumps({'paths':boot['imgFileList'],'files':files,'preload':preload}).encode(),check=True)
