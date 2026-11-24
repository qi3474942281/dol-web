/* Keep cached bytes separate from every game and backup database. */
(() => {
 function database(name, storeName) {
  let connection;
  return function open() {
   connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
     const db = request.result;
     db.onversionchange = () => { db.close(); connection = null; };
     resolve(db);
    };
   }).catch(error => { connection = null; throw error; });
   return connection;
  };
 }

 const startup = database('DoLMobileResources', 'startup');
 const art = database('DoLMobileArtwork', 'images');

 async function access(open, storeName, mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
   const transaction = db.transaction(storeName, mode);
   const request = operation(transaction.objectStore(storeName));
   transaction.oncomplete = () => resolve(request.result);
   transaction.onabort = () => reject(transaction.error);
  });
 }

 window.DOLMobileCache = {
  read(build) { return access(startup, 'startup', 'readonly', store => store.get(build)); },
  write(build, data) {
   return access(startup, 'startup', 'readwrite', store => {
    // Commit the game and mods together, so an interrupted write keeps the old copy.
    store.clear();
    return store.put(data, build);
   });
  },
  readArt(url) { return access(art, 'images', 'readonly', store => store.get(url)); },
  writeArt(url, bytes) {
   return access(art, 'images', 'readwrite', store => store.put(bytes, url));
  },
 };
})();
