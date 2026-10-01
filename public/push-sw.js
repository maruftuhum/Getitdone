function ledger(scope, id) {
  return new Promise(resolve => {
    const request = indexedDB.open('getitdone-reminders', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('delivered', { keyPath: 'scope' });
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('delivered', id ? 'readwrite' : 'readonly');
      const store = tx.objectStore('delivered');
      const get = store.get(scope);
      let ids = [];
      get.onsuccess = () => {
        ids = get.result?.ids || [];
        if (id) { ids = [...new Set([...ids, id])].slice(-2000); store.put({ scope, ids }); }
      };
      tx.oncomplete = () => { db.close(); resolve(ids); };
      tx.onerror = () => { db.close(); resolve([]); };
    };
  });
}
self.addEventListener('push', event => {
  let data;
  try { data = event.data.json(); } catch { return; }
  event.waitUntil((async () => {
    if ((await ledger(data.uid)).includes(data.id)) return;
    await ledger(data.uid, data.id);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.filter(client => client.visibilityState === 'visible');
    if (visible.length) { visible.forEach(client => client.postMessage({ type: 'reminder-push', event: data })); return; }
    await self.registration.showNotification(data.title || 'Get It Done', {
      body: data.body, icon: '/pwa-192x192.png', badge: '/icon.svg', tag: data.id,
      data: { url: data.url || '/', uid: data.uid, event: data },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url || '/', self.location.origin);
    if (url.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows[0]) {
      windows[0].postMessage({ type: 'open-reminder', event: event.notification.data?.event });
      await windows[0].focus();
    } else await self.clients.openWindow(url.href);
  })());
});
