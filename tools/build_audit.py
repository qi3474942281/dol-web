#!/usr/bin/env python3
"""Package the tested v9 mobile renderer and assets as one self-contained HTML file."""
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
        if path not in ordinary_images:
            continue
        data = original.read(path)
        if data != art.read(path):
            variants[path] = 'img/dol-original/' + path[4:]
        elif path.startswith('img/clothes/') and path.endswith('/full.png') and data.startswith(b'\x89PNG') and int.from_bytes(data[20:24],'big') == 128:
            legacy_clothes.append(path.removesuffix('/full.png'))
    match_clothing = """
  matchClothing(layers){
   const mapMask=mask=>typeof mask==='string'?originalSrc(mask):mask?.path?{...mask,path:originalSrc(mask.path)}:mask;
   return layers.map(layer=>{
    if(layer.show===false)return layer;
    return {...layer,src:originalSrc(layer.src),
     masksrc:Array.isArray(layer.masksrc)?layer.masksrc.map(mapMask):mapMask(layer.masksrc)};
   });
  },
"""
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
  const grouped=Array.from({length:26},()=>[]);
  for(const chunk of document.querySelectorAll('script[data-offline-mod]')){
   grouped[Number(chunk.dataset.offlineMod)].push(chunk.textContent);
   chunk.remove();
  }
  for(const chunks of grouped){
   if(!chunks.length)throw Error('离线模组数据不完整');
   window.modDataValueZipList.push(chunks.join(''));
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
assert "data-offline-mod" in source
# Separate opaque data from executable JavaScript and bound each parser token.
blocks=[]
chunk_bytes=768*1024
for i,archive in enumerate(archives):
    for offset in range(0,len(archive),chunk_bytes):
        data=base64.b64encode(archive[offset:offset+chunk_bytes]).decode()
        blocks.append(f'<script type="application/octet-stream" data-offline-mod="{i}">{data}</script>')
assert source.count('</tw-storydata>')==1
source=source.replace('</tw-storydata>','</tw-storydata>'+''.join(blocks),1)
guide = '''DoL 0.5.12.13-chs-1.0.1a · 离线修复版 v9

本包带有 BESC/UCB 美化、城镇底图和衣柜容量修复。商店及侧栏人物使用配套原版服装与身体图层；场景保留美化。
游戏及全部模组内置在「开始游戏.html」里。打开后请等待初始化完成。

iPhone：先解压，TinyServer 选择解压后包含「开始游戏.html」的文件夹。
启动服务，点 Open Browser。如果看到文件列表，点「开始游戏.html」。
Windows 或 Mac：解压后用支持 JavaScript 的浏览器打开「开始游戏.html」。

迁移网页或旧本地版进度：先在旧版「存档 → 导出/载入 → 导出存档」，
再在此版选择「从文件载入」。同一地址、同一浏览器通常可直接读取原来的本地存档。
'''
destination.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as result:
    result.writestr('开始游戏.html',source)
    result.writestr('使用说明.txt',guide)
    for name in ('LICENSE','CREDITS.md'):
        result.write(root/name,name)
with zipfile.ZipFile(destination) as result:
    assert result.testzip() is None
    assert len(result.namelist()) == 4
with zipfile.ZipFile(io.BytesIO(archives[-1])) as result:
    assert result.testzip() is None
    for path, alias in variants.items():
        assert alias in result.namelist()
print(json.dumps({'filename':destination.name,'size':destination.stat().st_size,'sha256':sha(destination.read_bytes()),'original_variants':len(variants),'images':len(ordinary_images),'mods':len(archives)},ensure_ascii=False))
