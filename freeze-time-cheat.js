(async () => {
 const manager=window.modSC2DataManager;
 const previous=manager.getSC2DataInfoAfterPatch();
 const patched=previous.cloneSC2DataInfo();
 const cheats=patched.passageDataItems.items.find(passage=>passage.name==='Cheats');
 const timeSection=/<div class="settingsHeader options">\s*(?:Time and Weather|时间与天气)\s*<\/div>/;
 if(!cheats||!timeSection.test(cheats.content))throw Error('Time and Weather cheat section missing');
 const control=`
  <div class="settingsToggleItemWide">
   <label><<checkbox "$dolTimeFrozen" false true autocheck>> <strong>时间不流逝</strong></label>
   <br><span class="description">开启后，行动和等待会暂停游戏时钟。需要推进时间时，关闭此开关。</span>
  </div>`;
 cheats.content=cheats.content.replace(timeSection,match=>match+control);

 const timeStart='function pass(seconds) {\n\t\tif (seconds < 0) return;';
 const timeScripts=patched.scriptFileItems.items.filter(script=>script.content.includes(timeStart));
 if(timeScripts.length!==1)throw Error('Game clock advance function missing');
 timeScripts[0].content=timeScripts[0].content.replace(timeStart,timeStart+'\n\t\tif (V.dolTimeFrozen === true) return;');

 // The save's active history frame can predate the checkbox change.
 const saveStart='function onSave(save, details) {';
 const saveScripts=patched.scriptFileItems.items.filter(script=>script.content.includes(saveStart));
 if(saveScripts.length!==1)throw Error('Time cheat save hook missing');
 saveScripts[0].content=saveScripts[0].content.replace(saveStart,saveStart+`
 if (typeof V.dolTimeFrozen === 'boolean') {
  const saved = save?.state?.history?.[save.state.index]?.variables;
  if (saved) saved.dolTimeFrozen = V.dolTimeFrozen;
 }`);

 patched.passageDataItems.fillMap();
 patched.scriptFileItems.fillMap();
 manager.getModUtils().replaceFollowSC2DataInfo(patched,previous);
})();
