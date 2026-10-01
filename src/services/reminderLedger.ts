// Shared origin database: both the page and service worker record delivered alerts.
export async function reminderLedger(scope: string, id?: string): Promise<string[]> {
  if (!('indexedDB' in globalThis)) return [];
  return new Promise(resolve => {
    const request = indexedDB.open('getitdone-reminders', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('delivered', { keyPath: 'scope' });
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('delivered', id ? 'readwrite' : 'readonly');
      const store = tx.objectStore('delivered');
      const get = store.get(scope);
      let ids: string[] = [];
      get.onsuccess = () => {
        ids = get.result?.ids || [];
        if (id) { ids = [...new Set([...ids, id])].slice(-2000); store.put({ scope, ids }); }
      };
      tx.oncomplete = () => { db.close(); resolve(ids); };
      tx.onerror = () => { db.close(); resolve([]); };
    };
  });
}
