#!/usr/bin/env python3
"""Build a small, retryable mobile entry with lazy, version-matched artwork."""
from pathlib import Path
import base64,gzip,hashlib,io,json,re,zipfile
from mobile_render import patch_renderers
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'mobile';OUT.mkdir(exist_ok=True)
LIMIT=1024*1024
sha=lambda b:hashlib.sha256(b).hexdigest()
def packed(files):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for name,data in sorted(files.items()):
   info=zipfile.ZipInfo(name,(2026,11,24,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
 return out.getvalue()
def parts(data,kind,compressed=False):
 result=[]
 def emit(raw):
  b=gzip.compress(raw,compresslevel=9,mtime=0) if compressed else raw
  if len(b)>LIMIT:
   mid=len(raw)//2;emit(raw[:mid]);emit(raw[mid:]);return
  name=f'{kind}/{sha(b)}.bin';p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
  result.append({'path':'mobile/'+name,'bytes':len(b),'sha256':sha(b),'raw_bytes':len(raw),'gzip':compressed})
 for i in range(0,len(data),4*1024*1024 if compressed else LIMIT):emit(data[i:i+(4*1024*1024 if compressed else LIMIT)])
 return result
s=(ROOT/'game.html').read_text()
m=re.search(r'window\.modDataValueZipList\s*=\s*(\[.*?\]);',s,re.S);assert m
original_mods=[base64.b64decode(x) for x in json.loads(m[1])]
assert len(original_mods)==25
# Keep the existing compatibility fixes and add the custom cheat controls.
for index,blob in enumerate(original_mods):
 z=zipfile.ZipFile(io.BytesIO(blob));metadata=json.loads(z.read('boot.json'))
 if metadata['name']=='DoLWebCompatibility':
  files={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
  metadata['version']='0.5.12.13.3'
  metadata['scriptFileList_preload']=['wardrobe-cheat.js','freeze-time-cheat.js']
  files['boot.json']=json.dumps(metadata,ensure_ascii=False,separators=(',',':')).encode()
  files['wardrobe-cheat.js']=(ROOT/'wardrobe-cheat.js').read_bytes()
  files['freeze-time-cheat.js']=(ROOT/'freeze-time-cheat.js').read_bytes()
  original_mods[index]=packed(files)
  break
else:raise ValueError('Existing compatibility mod missing')
art=zipfile.ZipFile(ROOT/'mods/DoLWebArtPack.mod.zip');boot=json.loads(art.read('boot.json'))
images=boot['imgFileList'];assert len(images)==32779
mapping=[];unique={}
def publish_image(path, data):
 ext=Path(path).suffix.lower()
 ext=ext if ext in {'.png','.gif','.jpg','.jpeg','.webp','.svg'} else '.txt'
 name=sha(data)+ext
 if name not in unique:
  p=OUT/'art'/name;p.parent.mkdir(exist_ok=True);p.write_bytes(data);unique[name]=len(data)
 return name
for path in images:
 mapping.append([path,publish_image(path,art.read(path))])
mobile_files=dict(mapping)
original=zipfile.ZipFile(ROOT/'mods/GameOriginalImagePack.mod.zip')
variants={}
for path in original.namelist():
 if path not in mobile_files:
  continue
 data=original.read(path)
 if sha(data)!=mobile_files[path].split('.')[0]:
  variants[path]=publish_image(path,data)
town='img/misc/locations/town/base.png'
embedded={mobile_files[town]:'data:image/png;base64,'+base64.b64encode(art.read(town)).decode()}
files={n:art.read(n) for n in art.namelist() if not n.startswith('img/') and not n.endswith('/') and not n.endswith('.map')}
boot['imgFileList']=[]
boot['version']='0.5.12.13.5'
files['boot.json']=json.dumps(boot,ensure_ascii=False,separators=(',',':')).encode()
report=json.loads((ROOT/'art-manifest.json').read_text());report['delivery']='static-on-demand'
preload=(ROOT/'mobile-art.js').read_text().replace('MAPPING',json.dumps(mapping,ensure_ascii=False,separators=(',',':'))).replace('ORIGINAL_VARIANTS',json.dumps(variants,separators=(',',':'))).replace('EMBEDDED_IMAGES',json.dumps(embedded,separators=(',',':'))).replace('REPORT',json.dumps(report,ensure_ascii=False,separators=(',',':')))
files['dist/preload/preload.js']=preload.encode()
static_art=packed(files)
mods=[]
for b in original_mods+[static_art]:
 z=zipfile.ZipFile(io.BytesIO(b));name=json.loads(z.read('boot.json'))['name']
 mods.append({'name':name,'bytes':len(b),'sha256':sha(b),'parts':parts(b,'mods')})
# Only the bundled archives and the pre-init artwork function change. All
# passages, scripts, game IDs and save code otherwise remain the verified build.
s=s[:m.start(1)]+'[]'+s[m.end(1):]
old='<script>'+(ROOT/'art-preload.js').read_text()+'</script>';assert s.count(old)==1
prepare='''<script>
window.dolPrepareArtPack=async()=>{
 const mods=window.__DOLMobilePreparedMods;
 if(!Array.isArray(mods)||mods.length!==26)throw Error('Mobile resources were not prepared');
 window.modDataValueZipList.push(...mods);delete window.__DOLMobilePreparedMods;
 const box=document.createElement('div');box.id='dol-mobile-initializing';box.style='position:fixed;inset:0;z-index:2147483646;background:#111;color:#eee;padding:32px;font:20px/1.7 system-ui';box.textContent='资源已准备好，正在初始化汉化和模组……';document.body.append(box);
 const timer=setInterval(()=>{const check=window.DOLBootCheck;if((check?.language==='zh'&&check?.artImages===32779)||document.getElementById('dol-startup-error')){clearInterval(timer);box.remove();}},300);
};
</script>'''
s=s.replace(old,prepare,1)
assert re.search(r'<tw-storydata[^>]*>',s)[0]==re.search(r'<tw-storydata[^>]*>',(ROOT/'game.html').read_text())[0]
core=patch_renderers(s).encode();core_parts=parts(core,'core',True)
manifest={'build':'dol-mobile-11','source_game_sha256':sha((ROOT/'game.html').read_bytes()),'core_sha256':sha(core),'core_bytes':len(core),'core':core_parts,'mods':mods,'artwork':report,'static_images':len(images),'unique_images':len(unique),'static_image_bytes':sum(unique.values()),'max_resource_bytes':LIMIT}
(OUT/'manifest-11.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
assert all(p['bytes']<=LIMIT for item in mods for p in item['parts'])
assert all(p['bytes']<=LIMIT for p in core_parts)
(OUT/'BUILD-CREDITS.md').write_text('Same 0.5.12.13 Chinese game and BESC+UCB artwork as game.html. Original credits and licenses are retained in the artwork provider. Artwork is served on demand without modifying image bytes.\n')
page='''<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoL 手机加载入口</title><style>body{background:#111;color:#eee;font:18px/1.7 system-ui;max-width:38em;margin:auto;padding:24px}a{color:#9cf}progress{width:100%;height:24px}button{font:inherit;padding:12px;background:#333;color:white;border:1px solid #aaa}#error{color:#ffbba8;white-space:pre-wrap}</style></head><body><h1>DoL 汉化＋BESC/UCB</h1><p id="status" role="status">正在准备手机版资源……</p><progress id="progress" value="0" max="100"></progress><p id="detail"></p><p id="error" role="alert"></p><button id="retry" hidden>重试加载（保留存档）</button><p>资源分批加载，图片按显示需要读取。游戏和存档位置保持不变。</p><p><a href="backup.html">存档备份</a> · <a href="legacy.html">旧版导出存档</a> · <a href="online.html?build=dol-051213-chs101a-3">完整整合包入口</a></p><script src="save-backup.js?mobile=6"></script><script>HTTP_QUEUE_INLINE</script><script src="mobile-cache.js?mobile=11"></script><script src="mobile-loader.js?mobile=11"></script></body></html>'''
page=page.replace('HTTP_QUEUE_INLINE',(ROOT/'http-queue.js').read_text())
(ROOT/'mobile.html').write_text(page)
# New visitors use the small shell; old binaries and offline downloads remain.
entry='''<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoL 汉化美化版</title></head><body style="background:#111;color:#eee;font:18px/1.7 system-ui;padding:24px"><h1>DoL 汉化＋BESC/UCB</h1><p><a href="mobile.html?mobile=11" style="color:#9cf">打开手机版加载入口</a></p><p>正在进入。资源分批加载，图片按需读取，原存档位置不变。</p><p><a href="backup.html" style="color:#9cf">存档备份</a> · <a href="online.html?build=dol-051213-chs101a-3" style="color:#9cf">完整整合包入口</a></p><script>location.replace('mobile.html?mobile=11');</script></body></html>'''
for name in ['index.html','play.html','launch.html','start.html']:(ROOT/name).write_text(entry)
summary={k:manifest[k] for k in ['build','source_game_sha256','core_bytes','static_images','unique_images','static_image_bytes','max_resource_bytes']}
summary.update(core_download_bytes=sum(p['bytes'] for p in core_parts),mod_download_bytes=sum(m['bytes'] for m in mods),html_entry_bytes=len(page.encode()))
print(json.dumps(summary,ensure_ascii=False,indent=2))
