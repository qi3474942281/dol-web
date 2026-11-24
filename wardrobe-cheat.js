/* Preserve a user-selected bedroom wardrobe capacity through furniture updates. */
(async () => {
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
 window.DOLWardrobeCapacity={info,apply,change};
 const manager=window.modSC2DataManager,previous=manager.getSC2DataInfoAfterPatch(),patched=previous.cloneSC2DataInfo();
 const cheats=patched.passageDataItems.items.find(p=>p.name==='Cheats');
 const marker='<<widget "cheats-other">>';
 if(!cheats||!cheats.content.includes(marker))throw Error('Wardrobe cheat menu target missing');
 const section=`\n<div class="settingsGrid"><div class="settingsHeader options">衣柜容量</div><div class="settingsToggleItemWide" id="dol-wardrobe-capacity-controls"><<dolWardrobeCapacity>></div></div><hr>\n`;
 const widget=`
<<widget "dolWardrobeCapacity">>
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
 const start='function wardrobeSpaceUpdater() {';
 const scripts=patched.scriptFileItems.items.filter(item=>item.content.includes(start));
 if(scripts.length!==1)throw Error('Wardrobe furniture updater target missing');
 const script=scripts[0],begin=script.content.indexOf(start),end=script.content.indexOf('\n\t}',begin);
 if(end<0||!script.content.slice(begin,end).includes('wardrobe.space = 20;'))throw Error('Wardrobe furniture updater changed');
 script.content=script.content.slice(0,end)+'\n\t\twindow.DOLWardrobeCapacity.apply(V);'+script.content.slice(end);
 patched.passageDataItems.fillMap();patched.scriptFileItems.fillMap();
 manager.getModUtils().replaceFollowSC2DataInfo(patched,previous);
 window.DOLWardrobeCapacity.patchReport={menu:true,furniture:true};
})();
