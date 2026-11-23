#!/usr/bin/env python3
"""Reproducible, hash-verified deployment of the official Chinese release."""
import argparse,base64,hashlib,html,io,json,re,subprocess,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUILD='dol-051213-chs101a-2'
BASE='c3cb029bfdb5ac5f620786bed7201a2bc47ef716'
RELEASE='https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization/releases/download/v0.5.12.13-chs-1.0.1a/'
ASSETS={
 'DoL-ModLoader-0.5.12.13-v2.101.1.zip':'2d4636840220cd4ca8cd4c7a1104fb5483f207a44383b9d56cc77a6d2b033917',
 'ModI18N-0.5.12.13-chs-1.0.1a.mod.zip':'af3950ec751442dbf6af5dac42ae3cee0fea67fc1944a836ffc8c3a8e5407be3',
 'GameOriginalImagePack-0.5.12.13.mod.zip':'2281b8784f034ab8eb027cdca77019b626fbc50905bc2b18229f5e40ef152076'}
def digest(b):return hashlib.sha256(b).hexdigest()
def hook(remote,isolate=False):
 keys={'modList.json':remote}
 if isolate:
  for k in ['modDataIndexDBZipList','modDataIndexDBZipListHidden','modDataIndexDBZipPrefix','modDataLocalStorageZipList','modDataLocalStorageZipPrefix']:
   keys[k]='DoL051213_'+k
 return '<script>window.modLoaderKeyConfigWinHookFunction=function(c){'+''.join('c.config.set('+json.dumps(k)+','+json.dumps(v)+');' for k,v in keys.items())+'};</script>'
def archive(files):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  for name,data in sorted(files.items()):
   info=zipfile.ZipInfo(name,(2026,11,23,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
 return out.getvalue()
def main():
 args=argparse.ArgumentParser();args.add_argument('--assets-dir',type=Path);opt=args.parse_args()
 assets={}
 for name,sha in ASSETS.items():
  b=(opt.assets_dir/name).read_bytes() if opt.assets_dir else urllib.request.urlopen(RELEASE+name,timeout=180).read()
  if digest(b)!=sha:raise ValueError('Asset checksum mismatch: '+name)
  assets[name]=b
 old=subprocess.check_output(['git','show',BASE+':index.html'],cwd=ROOT).decode()
 embedded=json.loads(re.search(r'window\.modDataValueZipList\s*=\s*(\[.*?\]);',old,re.S)[1])
 mods=ROOT/'mods';legacy=mods/'legacy';legacy.mkdir(parents=True,exist_ok=True)
 legacy_mods={}
 for value in embedded:
  b=base64.b64decode(value);z=zipfile.ZipFile(io.BytesIO(b));boot=json.loads(z.read('boot.json'))
  if boot['name'] in ['Cheat-Lyra','CombatStatusDisplay-Lyra']:
   legacy_mods[boot['name']]=z;(legacy/(boot['name']+'.mod.zip')).write_bytes(b)
 legacy_remote="\"modDataRemoteListPath\", 'modList.json'"
 assert old.count(legacy_remote)==1
 legacy_html=old.replace(legacy_remote,"\"modDataRemoteListPath\", 'legacy-modList.json'",1)
 (ROOT/'legacy.html').write_text(legacy_html)
 (ROOT/'legacy-modList.json').write_text('[]\n')
 z=zipfile.ZipFile(io.BytesIO(assets['DoL-ModLoader-0.5.12.13-v2.101.1.zip']))
 for source,target in [('LICENSE','LICENSE'),('CREDITS.md','CREDITS.md'),('README.md','UPSTREAM-README.md')]:
  (ROOT/target).write_bytes(z.read(source))
 game=z.read('Degrees of Lewdity.html').decode()
 assert 'version: "0.5.12.13"' in game
 stories=re.findall(r'<tw-storydata[^>]*>',game);assert len(stories)==1
 old_ifid=re.search(r'<tw-storydata[^>]+ifid="([^"]+)"',old)[1]
 new_ifid=re.search(r'<tw-storydata[^>]+ifid="([^"]+)"',game)[1]
 assert old_ifid==new_ifid
 passages={html.unescape(a):html.unescape(b) for a,b in re.findall(r'<tw-passagedata[^>]*name="([^"]+)"[^>]*>(.*?)</tw-passagedata>',game,re.S)}
 fixes=[{'passage':'StoryCaption','from':'and $cheatsEnabled is true or $debug is 1','to':'or $debug is 1'}]
 for passage in ['Widgets variablesStart2','Widgets variablesVersionUpdate','Widgets Settings']:
  fixes.append({'passage':passage,'from':'<<set $feats.locked to true>>','to':'<!-- DoLWeb: retain pre-existing Cheat-Lyra feat behavior -->'})
 combat=legacy_mods['CombatStatusDisplay-Lyra']
 for source,file in [('<<if $enemyanger gte $enemyangermax>>','assets/AP.twee'),('<<if $enemyarousal gte $enemyarousalmax>>','assets/HP.twee')]:
  fixes.append({'passage':'Widgets State Man','from':source,'to':combat.read(file).decode()})
 for f in fixes:assert f['from'] in passages[f['passage']],f['passage']
 js='''(() => {
 const fixes=FIXES;
 const manager=window.modSC2DataManager,cache=manager.getSC2DataInfoAfterPatch(),patched=cache.cloneSC2DataInfo();
 const report=[];
 for(const fix of fixes){
  const p=patched.passageDataItems.items.find(p=>p.name===fix.passage);
  if(!p||!p.content.includes(fix.from))throw Error('DoL compatibility fragment missing: '+fix.passage);
  p.content=p.content.split(fix.from).join(fix.to);report.push(fix.passage);
 }
 patched.passageDataItems.fillMap();manager.getModUtils().replaceFollowSC2DataInfo(patched,cache);
 window.DOLWebCompatibilityReport=report;
})();'''.replace('FIXES',json.dumps(fixes,ensure_ascii=False))
 boot={'name':'DoLWebCompatibility','version':'0.5.12.13.1','scriptFileList_earlyload':['earlyload.js'],'scriptFileList':[],
       'styleFileList':[],'tweeFileList':[],'imgFileList':[],
       'dependenceInfo':[{'modName':'ModLoader','version':'^2.101.1'},{'modName':'ModI18N','version':'>=0.0.0'},{'modName':'GameVersion','version':'=0.5.12.13'}]}
 (mods/'DoLWebCompatibility.mod.zip').write_bytes(archive({'boot.json':json.dumps(boot).encode(),'earlyload.js':js.encode()}))
 (mods/'ModI18N.mod.zip').write_bytes(assets['ModI18N-0.5.12.13-chs-1.0.1a.mod.zip'])
 (mods/'GameOriginalImagePack.mod.zip').write_bytes(assets['GameOriginalImagePack-0.5.12.13.mod.zip'])
 # Ship every required archive inside the game, so boot never fetches remote ZIPs.
 local_match=re.search(r'window\.modDataValueZipList\s*=\s*(\[.*?\]);',game,re.S)
 local_mods=json.loads(local_match[1])
 for name in ['ModI18N.mod.zip','GameOriginalImagePack.mod.zip','DoLWebCompatibility.mod.zip']:
  local_mods.append(base64.b64encode((mods/name).read_bytes()).decode())
 game=game[:local_match.start(1)]+json.dumps(local_mods,separators=(',',':'))+game[local_match.end(1):]
 remote='_ModLoader__WEBPACK_IMPORTED_MODULE_1__.ModDataLoadType.Remote,'
 assert game.count(remote)==1
 game=game.replace(remote,'/* DoLWeb: required mods are embedded; remote loader disabled. */',1)
 game=game.replace('<head>','<head>'+hook('modList.json?build='+BUILD,True),1)
 # Browsers must be able to report startup failure instead of leaving a permanent spinner.
 failure='catch(err => {console.error(err);});'
 assert game.count(failure)==1
 error_js="""catch(err => {console.error(err);const box=document.createElement('div');box.style='position:fixed;z-index:2147483647;inset:0;background:#111;color:white;padding:24px';box.textContent='游戏初始化失败。请返回首页重试，或打开旧版导出存档。';for(const [href,label] of [['index.html','返回首页'],['legacy.html','打开旧版']]){const a=document.createElement('a');a.href=href;a.textContent=label;a.style='display:block;color:#9cf;padding:12px';box.append(a);}document.body.prepend(box);});"""
 game=game.replace(failure,error_js,1)
 main='window.mainStart();window.initI10n(l10nStrings);}).catch'
 assert game.count(main)==1
 game=game.replace(main,"if(!window.modI18N||window.modSC2DataManager.getLanguageManager().mainLanguage!=='zh'||!window.DOLWebCompatibilityReport)throw Error('内置汉化未完成初始化');"+main,1)
 assert len(game.encode())<100*1024*1024, 'GitHub file size limit'

 (ROOT/'game.html').write_text(game)
 offline_readme='''DoL 0.5.12.13-chs-1.0.1a 完整整合包

先解压，再用支持 JavaScript 的浏览器打开「开始游戏.html」。汉化、原版图片、兼容 Mod 已内置，不需要下载额外 ZIP。

网页版与本地文件的存档空间不同。继续旧进度，请先在原网页的「存档」菜单导出标准存档文件，再在离线游戏中导入。不要清理浏览器网站数据。
iPhone 的「文件」预览通常不能运行这种 HTML 游戏；iPhone 推荐使用原网址下载缓存后的网页版，可在断网后打开。

首次启动仍需在设备上解压和初始化 Mod，请等待页面完成加载。
'''
 (ROOT/'dol-0.5.12.13-chs-1.0.1a-offline.zip').write_bytes(archive({'开始游戏.html':game.encode(),'使用说明.txt':offline_readme.encode(),'LICENSE':z.read('LICENSE'),'CREDITS.md':z.read('CREDITS.md')}))
 (ROOT/'modList.json').write_text(json.dumps([],indent=2)+'\n')
 release={'tag':'v0.5.12.13-chs-1.0.1a','build':BUILD,'source':'https://github.com/Eltirosto/Degrees-of-Lewdity-Chinese-Localization/releases/tag/v0.5.12.13-chs-1.0.1a',
          'game_bytes':len(game.encode()),'offline_bytes':(ROOT/'dol-0.5.12.13-chs-1.0.1a-offline.zip').stat().st_size,'previous_commit':BASE,'previous_version':'0.5.0.6-chs-2.1.0a','ifid':new_ifid,
          'assets':{n:{'url':RELEASE+n,'sha256':sha} for n,sha in ASSETS.items()},
          'deployed':{n:digest((ROOT/n).read_bytes()) for n in ['game.html','dol-0.5.12.13-chs-1.0.1a-offline.zip','legacy.html','mods/ModI18N.mod.zip','mods/GameOriginalImagePack.mod.zip','mods/DoLWebCompatibility.mod.zip']}}
 (ROOT/'upstream-release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'version':release['tag'],'ifid_preserved':True,'legacy_mods':list(legacy_mods),'compatibility_patches':len(fixes),'game_bytes':len(game.encode())}))
if __name__=='__main__':main()
