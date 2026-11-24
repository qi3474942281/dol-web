#!/usr/bin/env python3
"""Package the tested v9 mobile renderer and assets for a local HTTP server."""
from pathlib import Path
import base64
import hashlib
import io
import json
import re
import sys
import zipfile

root = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
sys.path.insert(0, str(root/'tools'))
from mobile_render import patch_renderers

def sha(data):
    return hashlib.sha256(data).hexdigest()

manifest = json.loads((root/'mobile/manifest-9.json').read_text())
assert manifest['build'] == 'dol-mobile-9'
archives = []
for mod in manifest['mods'][:-1]:
    pieces = []
    for part in mod['parts']:
        data = (root/part['path']).read_bytes()
        assert sha(data) == part['sha256'] and len(data) == part['bytes']
        pieces.append(data)
    data = b''.join(pieces)
    assert sha(data) == mod['sha256']
    archives.append(data)
assert len(archives) == 25

with zipfile.ZipFile(root/'mods/DoLWebArtPack.mod.zip') as art, zipfile.ZipFile(root/'mods/GameOriginalImagePack.mod.zip') as original:
    boot = json.loads(art.read('boot.json'))
    ordinary_images = set(boot['imgFileList'])
    variants = {}
    legacy_clothes = []
    for path in original.namelist():
        if path not in ordinary_images or not path.startswith(('img/body/','img/face/','img/hair/','img/clothes/','img/transformations/','img/genitals/')):
            continue
        data = original.read(path)
        if data != art.read(path):
            variants[path] = 'img/dol-original/' + path[4:]
        elif path.startswith('img/clothes/') and path.endswith('/full.png') and data.startswith(b'\x89PNG') and int.from_bytes(data[20:24],'big') == 128:
            legacy_clothes.append(path.removesuffix('/full.png'))
    mobile = (root/'mobile-art.js').read_text()
    start = mobile.index('  matchClothing(layers){')
    end = mobile.index('  // Canvas requests', start)
    match_clothing = mobile[start:end]
    report = manifest['artwork'] | {'delivery':'offline-embedded','clothingFix':'dol-mobile-9'}
    preload = '''(async()=>{
 const pack=window.modGameOriginalImagePack;
 pack.init();
 const originals=new Map();
 for(const [path,entry] of ORIGINAL_ENTRIES){
  const image=pack.selfImg.get(entry);
  if(!image)throw Error('Original clothing entry missing: '+path);
  originals.set(path,image.getter);
  pack.selfImg.delete(entry);
 }
 const legacyClothes=new Set(LEGACY_CLOTHES);
 const originalPrefix='dol-original:';
 const originalSrc=path=>originals.has(path)?originalPrefix+path:path;
 const loadOriginal=path=>originals.get(path)?.getBase64Image();
 window.DOLMobileArt={
 MATCH_CLOTHING
  source(path){
   if(typeof path!=='string')return null;
   if(path.startsWith(originalPrefix))return loadOriginal(path.slice(originalPrefix.length))||null;
   const hook=window.modImgLoaderHooker;
   const normalized=hook?.normalizePath(path);
   if(!pack.selfImg.has(normalized))return null;
   return hook.getImage(normalized).then(src=>{
    if(!src)throw Object.assign(Error('Embedded image could not be read: '+path),{dolArtwork:true});
    return src;
   });
  },
 };
 window.DOLWebArtReport=REPORT;
})();'''.replace('ORIGINAL_ENTRIES',json.dumps(list(variants.items()),separators=(',',':'))).replace('LEGACY_CLOTHES',json.dumps(legacy_clothes,separators=(',',':'))).replace('MATCH_CLOTHING',match_clothing).replace('REPORT',json.dumps(report,separators=(',',':')))
    boot['version']='0.5.12.13.4'
    boot['imgFileList'] += list(variants.values())
    container = io.BytesIO()
    with zipfile.ZipFile(container,'w',zipfile.ZIP_DEFLATED,compresslevel=5) as pack:
        for name in art.namelist():
            if name in {'boot.json','dist/preload/preload.js'} or name.endswith('/'):
                continue
            pack.writestr(name,art.read(name))
        for path,target in variants.items():
            pack.writestr(target,original.read(path))
        pack.writestr('boot.json',json.dumps(boot,separators=(',',':')))
        pack.writestr('dist/preload/preload.js',preload)
    archives.append(container.getvalue())

source = (root/'game.html').read_bytes()
assert sha(source) == manifest['source_game_sha256']
source = patch_renderers(source.decode())
story = re.search(r'<tw-storydata[^>]*>',source)[0]
mods = re.search(r'window\.modDataValueZipList\s*=\s*(\[.*?\]);',source,re.S)
source = source[:mods.start(1)] + '[]' + source[mods.end(1):]
original_prepare = '<script>'+(root/'art-preload.js').read_text()+'</script>'
assert source.count(original_prepare)==1
prepare = """<script>
window.dolPrepareArtPack=async()=>{
 const status=document.createElement('p');
 status.textContent='正在读取本机模组……';
 status.style='position:fixed;inset:0;z-index:2147483646;background:#111;color:white;padding:24px;font:18px system-ui';
 document.body.append(status);
 try {
  for(let i=0;i<26;i++){
   status.textContent='正在读取本机模组 '+(i+1)+' / 26……';
   const path='mods/'+String(i).padStart(2,'0')+'.zip';
   const response=await fetch(path);
   if(!response.ok)throw Error('模组读取失败：'+path+' HTTP '+response.status);
   const blob=await response.blob();
   const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
   });
   window.modDataValueZipList.push(data);
  }
  status.textContent='正在初始化游戏……';
  const timer=setInterval(()=>{
   if(window.DOLBootCheck||document.getElementById('dol-startup-error')){
    clearInterval(timer);
    status.remove();
   }
  },300);
 }catch(error){status.remove();throw error;}
};
</script>"""
source = source.replace(original_prepare,prepare,1)
assert story == re.search(r'<tw-storydata[^>]*>',source)[0]
assert "const path='mods/'" in source
guide = '''DoL 0.5.12.13-chs-1.0.1a · 离线修复版 v9

本包带有 BESC/UCB 美化、v9 服装与人物身形匹配、城镇底图和衣柜容量修复。
游戏与模组已打包。启动时仍需要在设备上初始化内置模组。

iPhone：先解压，TinyServer 选择解压后包含「开始游戏.html」的文件夹。
启动服务，点 Open Browser。如果看到文件列表，点「开始游戏.html」。
Windows 或 Mac：解压后从本机 HTTP 服务打开同名文件。请保留 mods 文件夹。

迁移网页或旧本地版进度：先在旧版「存档 → 导出/载入 → 导出存档」，
再在此版选择「从文件载入」。同一地址、同一浏览器通常可直接读取原来的本地存档。
'''
index = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>DoL 离线修复版</title></head><body><a href="开始游戏.html">开始游戏</a><script>location.replace('开始游戏.html');</script></body></html>'''
destination.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as result:
    result.writestr('index.html',index)
    result.writestr('开始游戏.html',source)
    result.writestr('使用说明.txt',guide)
    for i,archive in enumerate(archives):
        result.writestr(f'mods/{i:02}.zip',archive,compress_type=zipfile.ZIP_STORED)
    for name in ('LICENSE','CREDITS.md'):
        result.write(root/name,name)
with zipfile.ZipFile(destination) as result:
    assert result.testzip() is None
    assert len(result.namelist()) == 31
with zipfile.ZipFile(io.BytesIO(archives[-1])) as result:
    assert result.testzip() is None
    for path, alias in variants.items():
        assert alias in result.namelist()
print(json.dumps({'filename':destination.name,'size':destination.stat().st_size,'sha256':sha(destination.read_bytes()),'original_variants':len(variants),'images':len(ordinary_images),'mods':len(archives)},ensure_ascii=False))
