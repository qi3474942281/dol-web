/* Keep prepared game data separate from every game and backup database. */
(() => {
 const open = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('DoLMobileResources', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('startup');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
 });

 async function access(mode, operation) {
  const db = await open();
  try {
   return await new Promise((resolve, reject) => {
    const transaction = db.transaction('startup', mode);
    const request = operation(transaction.objectStore('startup'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
   });
  } finally {
   db.close();
  }
 }

 let artwork;
 function artCache() {
  artwork ??= Promise.resolve().then(() => caches.open('dol-mobile-art-v1')).catch(() => null);
  return artwork;
 }

 window.DOLMobileCache = {
  read(build) { return access('readonly', store => store.get(build)); },
  write(build, data) {
   return access('readwrite', store => {
    // Build and mods are committed together, so an interrupted write keeps the old copy.
    store.clear();
    return store.put(data, build);
   });
  },
  async readArt(url) {
   const cache = await artCache();
   const response = await cache?.match(url);
   return response && new Uint8Array(await response.arrayBuffer());
  },
  async writeArt(url, bytes, mime) {
   const cache = await artCache();
   if (cache) await cache.put(url, new Response(bytes, {headers: {'Content-Type': mime}}));
  },
 };
})();
