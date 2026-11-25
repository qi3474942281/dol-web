(async () => {
 /* Preserve a user-selected bedroom wardrobe capacity through furniture updates. */
 const slots=['over_upper','over_lower','upper','lower','under_upper','under_lower','over_head','head','face','neck','hands','handheld','legs','feet','genitals'];
 const info=vars=>{
  const wardrobe=vars.wardrobe;
  if(!wardrobe||typeof wardrobe!=='object')throw Error('衣柜尚未初始化');
  const minimum=Math.max(1,...slots.map(slot=>Array.isArray(wardrobe[slot])?wardrobe[slot].length:0));
  const capacity=Number.isSafeInteger(wardrobe.space)&&wardrobe.space>0?wardrobe.space:20;
  return {capacity,minimum};
 };
 const apply=vars=>{
  if(!Number.isSafeInteger(vars.dolWardrobeCapacity)||vars.dolWardrobeCapacity<1)return;
  vars.wardrobe.space=Math.max(vars.dolWardrobeCapacity,info(vars).minimum);
 };
 const change=(vars,delta)=>{
  if(!Number.isSafeInteger(delta))return;
  const current=info(vars);
  vars.dolWardrobeCapacity=Math.max(current.minimum,Math.min(Number.MAX_SAFE_INTEGER,current.capacity+delta));
  apply(vars);
 };
 // This SugarCube fork saves the entry snapshot, not live overlay variables.
 // Copy only this explicit cheat setting into the current saved frame.
 const writeToSave=(vars,save)=>{
  if(!Number.isSafeInteger(vars.dolWardrobeCapacity)||vars.dolWardrobeCapacity<1)return;
  const saved=save?.state?.history?.[save.state.index]?.variables;
  if(!saved?.wardrobe)return;
  saved.dolWardrobeCapacity=vars.dolWardrobeCapacity;
  apply(saved);
 };
 window.DOLWardrobeCapacity={info,apply,change,writeToSave};
 try {
 const manager=window.modSC2DataManager,previous=manager.getSC2DataInfoAfterPatch(),patched=previous.cloneSC2DataInfo();
 const cheats=patched.passageDataItems.items.find(p=>p.name==='Cheats');
 const marker='<<widget "cheats-other">>';
 if(!cheats||!cheats.content.includes(marker))throw Error('Wardrobe cheat menu target missing');
 const section=`\n<div class="settingsGrid"><div class="settingsHeader options">衣柜容量</div><div class="settingsToggleItemWide" id="dol-wardrobe-capacity-controls"><<dolWardrobeCapacity>></div></div><hr>\n`;
 const widget=`
<<widget "dolWardrobeCapacity">>
 <<if !_inWardrobe and State.passage isnot "Wardrobe">>
  <<if $combat is 1 or $event isnot undefined or $tryOn?.autoReset is false>>
   <span class="description">结束当前事件或试穿后可打开衣柜。</span>
  <<else>>
   <<button "打开衣柜" "Wardrobe">>
    <<set $dolWardrobeShortcut to {passage: State.passage, location: $wardrobe_location}>>
    <<run closeOverlay(); UIBar.stow(true)>>
   <</button>>
  <</if>>
  <br><br>
 <</if>>
 <<set _dolWardrobeInfo to window.DOLWardrobeCapacity.info(State.variables)>>
 <span class="gold">卧室衣柜：</span><strong id="dol-wardrobe-capacity-value"><<= _dolWardrobeInfo.capacity>></strong> 格（每类衣物）<br>
 <div style="display:flex;gap:1em;align-items:center;flex-wrap:wrap;margin:.6em 0">
  <<if _dolWardrobeInfo.capacity gt _dolWardrobeInfo.minimum>>
   <<link "−10">><<run window.DOLWardrobeCapacity.change(State.variables,-10)>><<replace "#dol-wardrobe-capacity-controls">><<dolWardrobeCapacity>><</replace>><</link>>
   <<link "−1">><<run window.DOLWardrobeCapacity.change(State.variables,-1)>><<replace "#dol-wardrobe-capacity-controls">><<dolWardrobeCapacity>><</replace>><</link>>
  <<else>><span class="grey" aria-disabled="true">−10</span><span class="grey" aria-disabled="true">−1</span><</if>>
  <<link "+1">><<run window.DOLWardrobeCapacity.change(State.variables,1)>><<replace "#dol-wardrobe-capacity-controls">><<dolWardrobeCapacity>><</replace>><</link>>
  <<link "+10">><<run window.DOLWardrobeCapacity.change(State.variables,10)>><<replace "#dol-wardrobe-capacity-controls">><<dolWardrobeCapacity>><</replace>><</link>>
 </div>
 <span class="description">不能低于任一类已有衣物的数量（当前至少 <<= _dolWardrobeInfo.minimum>> 格）。修改后照常存档即可保留。</span>
<</widget>>`;
 cheats.content=cheats.content.replace(marker,marker+section)+widget;
 const wardrobe=patched.passageDataItems.items.find(passage=>passage.name==='Widgets Wardrobe');
 const bedroom=patched.passageDataItems.items.find(passage=>passage.name==='Bedroom');
 const close=/(<<case "Wardrobe">>\s*)(<<link \[\[[^\]\n]+\|Bedroom\]\]>><<cleanupOnWardrobeExit>><<\/link>>)/;
 const entrance=/(<<link \[\[[^\]\n]+\|Wardrobe\]\]>>)(<<\/link>>)/;
 if(!wardrobe||!close.test(wardrobe.content)||!bedroom||!entrance.test(bedroom.content))throw Error('Wardrobe shortcut links missing');
 wardrobe.content=wardrobe.content.replace(close,(_,heading,defaultClose)=>heading+`
   <<if $dolWardrobeShortcut and Story.has($dolWardrobeShortcut.passage)>>
    <<link "关闭衣柜，返回原处" $dolWardrobeShortcut.passage>>
     <<cleanupOnWardrobeExit>>
     <<set $wardrobe_location to $dolWardrobeShortcut.location>>
     <<unset $dolWardrobeShortcut>>
    <</link>>
   <<else>>
    ${defaultClose}
   <</if>>`);
 // Entering normally from the bedroom clears any shortcut left by a history jump.
 bedroom.content=bedroom.content.replace(entrance,'$1<<unset $dolWardrobeShortcut>>$2');
 const start='function wardrobeSpaceUpdater() {';
 const scripts=patched.scriptFileItems.items.filter(item=>item.content.includes(start));
 if(scripts.length!==1)throw Error('Wardrobe furniture updater target missing');
 const script=scripts[0],begin=script.content.indexOf(start),end=script.content.indexOf('\n\t}',begin);
 if(end<0||!script.content.slice(begin,end).includes('wardrobe.space = 20;'))throw Error('Wardrobe furniture updater changed');
 script.content=script.content.slice(0,end)+'\n\t\twindow.DOLWardrobeCapacity.apply(V);'+script.content.slice(end);
 const saveStart='function onSave(save, details) {';
 const saveScripts=patched.scriptFileItems.items.filter(item=>item.content.includes(saveStart));
 if(saveScripts.length!==1)throw Error('Wardrobe save hook target missing');
 saveScripts[0].content=saveScripts[0].content.replace(saveStart,saveStart+'\n\twindow.DOLWardrobeCapacity.writeToSave(V,save);');
 patched.passageDataItems.fillMap();patched.scriptFileItems.fillMap();
 manager.getModUtils().replaceFollowSC2DataInfo(patched,previous);
 window.DOLWardrobeCapacity.patchReport={menu:true,furniture:true};
 } catch(error) {window.DOLWardrobeCapacity.patchError=error.message;console.error("Wardrobe capacity patch:",error);throw error;}
})();
