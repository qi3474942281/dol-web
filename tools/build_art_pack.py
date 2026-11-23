"""Build one image provider, using the version-matched Lyra BESC+UCB artwork."""
import hashlib,io,json,zipfile
from pathlib import Path
SOURCE_URL='https://github.com/DoL-Lyra/Lyra/releases/download/v0.5.12.13-1.0.1a-1004.1/DoL-0.5.12.13-Lyra-1.0.1a-besc-ucb-1004.1.zip'
SOURCE_SHA='47a793b1c06c36aea5388d9743d50f1ab2557deae6c4155f92cded5a237b7b70'
SOURCE_TAG='v0.5.12.13-1.0.1a-1004.1'
def build_art_pack(original,source):
 assert hashlib.sha256(source).hexdigest()==SOURCE_SHA
 base=zipfile.ZipFile(io.BytesIO(original));art=zipfile.ZipFile(io.BytesIO(source))
 boot=json.loads(base.read('boot.json'))
 exts={'.png','.gif','.jpg','.jpeg','.webp','.svg'}
 images={n:art.read(n) for n in art.namelist() if n.startswith('img/') and Path(n).suffix.lower() in exts}
 old_images=set(boot['imgFileList']);assert old_images<=set(art.namelist()),'matching version must retain original image paths'
 for name in old_images-images.keys():images[name]=art.read(name)
 changed=[n for n in sorted(old_images) if images[n]!=base.read(n)]
 samples={}
 for category in ['body','face','hair','clothes','sex']:
  name=next(n for n in changed if n.startswith('img/'+category+'/') and n.endswith('.png'))
  samples[category]={'path':name,'sha256':hashlib.sha256(images[name]).hexdigest()}
 boot.update(name='DoLWebArtPack',version='0.5.12.13.1',nickName='BESC + UCB',imgFileList=sorted(images))
 report={'mode':'BESC+UCB','source':SOURCE_URL,'tag':SOURCE_TAG,'source_sha256':SOURCE_SHA,'images':len(images),'replaced_original_images':len(changed),'samples':samples}
 files={n:base.read(n) for n in base.namelist() if not n.startswith('img/') and not n.endswith('/')}
 files['LYRA-SOURCE-README.md']=art.read('README.md')
 files['LYRA-SOURCE-LICENSE']=art.read('LICENSE')
 files['LYRA-SOURCE-CREDITS.md']=art.read('CREDITS.md')
 files['boot.json']=json.dumps(boot,ensure_ascii=False,separators=(',',':')).encode()
 files['dist/preload/preload.js']+=('\nwindow.DOLWebArtReport='+json.dumps(report,ensure_ascii=False)+';\n').encode()
 files['BESC-UCB-CREDITS.md']=("Artwork from the version-matched DoL-Lyra BESC+UCB distribution.\nSources: https://gitgud.io/Frostberg/beeesss-community-compilation-revived and https://github.com/site098/mysterious\n").encode()
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:
  for n,data in sorted({**files,**images}.items()):
   info=zipfile.ZipInfo(n,(2026,11,23,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
 return out.getvalue(),report
