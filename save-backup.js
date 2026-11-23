/* Local-only, immutable snapshot before the 0.5.12.13-chs-1.0.1a engine or mod update runs. */
(() => {
  const DB = 'DoLUpgradeBackups';
  const STORE = 'snapshots';
  const KEY = 'before-0.5.12.13-chs-1';
  function open(name, store) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('备份数据库被其他页面占用，请关闭其他游戏标签页再重试'));
    });
  }
  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function storageCopy(storage) {
    return Object.fromEntries(Array.from({length:storage.length}, (_, i) => {
      const key = storage.key(i);
      return [key, storage.getItem(key)];
    }));
  }
  async function read() {
    const db = await open(DB, STORE);
    try { return await request(db.transaction(STORE).objectStore(STORE).get(KEY)); }
    finally { db.close(); }
  }
  async function ensure() {
    if (await read()) return;
    // Capture browser storage before even downloading/replacing bundled mods.
    const snapshot = {
      schema: 1, target: '0.5.12.13-chs-1.0.1a', created: new Date().toISOString(),
      origin: location.origin,
      localStorage: storageCopy(localStorage),
      sessionStorage: storageCopy(sessionStorage),
      modCache: [],
      saveDatabases: {}
    };
    // DoL stores normal saves in its own IndexedDB, independently of SugarCube slots.
    for (const name of ['degrees-of-lewdity', 'ModLoader_IndexDBLoader']) {
      const data = await new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        let absent = false;
        req.onupgradeneeded = () => { absent = true; req.transaction.abort(); };
        req.onerror = () => absent ? resolve(null) : reject(req.error);
        req.onsuccess = () => {
          const source = req.result;
          const stores = Array.from(source.objectStoreNames);
          const output = {version:source.version, stores:{}};
          if (!stores.length) { source.close(); resolve(output); return; }
          const tx = source.transaction(stores);
          for (const store of stores) {
            const rows = output.stores[store] = [];
            const cursor = tx.objectStore(store).openCursor();
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (c) { rows.push([c.key,c.value]); c.continue(); }
            };
          }
          tx.oncomplete = () => { source.close(); resolve(output); };
          tx.onerror = () => { source.close(); reject(tx.error); };
          tx.onabort = () => { source.close(); reject(tx.error || new Error('读取旧存档备份失败')); };
        };
      });
      if (data) snapshot.saveDatabases[name] = data;
    }
    snapshot.modCache = snapshot.saveDatabases.ModLoader_IndexDBLoader?.stores.ModLoader_IndexDBLoader || [];
    const db = await open(DB, STORE);
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const req = store.get(KEY);
        req.onsuccess = () => { if (!req.result) store.add(snapshot, KEY); };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('保存升级前备份失败'));
      });
    } finally { db.close(); }
    if (!(await read())) throw new Error('升级前备份校验失败');
  }
  function download(snapshot) {
    // Preserve binary mod archives, too. This is a recovery bundle, not a
    // SugarCube .save file; a normal in-game export remains recommended.
    const text = JSON.stringify(snapshot, (_, v) =>
      v instanceof Uint8Array ? {type:'Uint8Array', bytes:Array.from(v)} :
      v instanceof ArrayBuffer ? {type:'Uint8Array', bytes:Array.from(new Uint8Array(v))} : v);
    const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dol-before-051213-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  window.DOLBackup = {ensure, read, download};
})();
