import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { reminderLedger } from '../src/services/reminderLedger';

const source = readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8');
function worker(visible = false) {
  const notifications: any[] = [];
  const messages: any[] = [];
  const opened: string[] = [];
  const handlers: Record<string, (event: any) => void> = {};
  const clients = visible ? [{ visibilityState: 'visible', postMessage: (data: unknown) => messages.push(data), focus: async () => messages.push('focus') }] : [];
  const db = new IDBFactory();
  runInNewContext(source, {
    indexedDB: db, URL,
    self: {
      location: { origin: 'https://getitdone.test' },
      addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
      clients: { matchAll: async () => clients, openWindow: async (url: string) => opened.push(url) },
      registration: { showNotification: async (title: string, options: any) => notifications.push({ title, ...options }) },
    },
  });
  return {
    notifications, messages, opened, db,
    push: async (data: unknown) => {
      let completion: Promise<unknown> = Promise.resolve();
      handlers.push({ data: { json: () => data }, waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
      await completion;
    },
    click: async (data: unknown) => {
      let completion: Promise<unknown> = Promise.resolve();
      handlers.notificationclick({ notification: { close: () => {}, data }, waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
      await completion;
    },
  };
}
const alert = { uid: 'alice', id: 'task:test:2026-10-02:09:00', type: 'reminder', title: 'Task Due', body: 'Meeting', url: '/?view=tasks' };
test('closed-app push displays a tagged notification and ignores duplicates', async () => {
  const sw = worker();
  await sw.push(alert);
  await sw.push(alert);
  assert.equal(sw.notifications.length, 1);
  assert.equal(sw.notifications[0].tag, alert.id);
  assert.equal(sw.notifications[0].body, 'Meeting');
  await sw.click(sw.notifications[0].data);
  assert.deepEqual(sw.opened, ['https://getitdone.test/?view=tasks']);
});
test('foreground push is routed to the page with account context', async () => {
  const sw = worker(true);
  await sw.push(alert);
  assert.equal(sw.notifications.length, 0);
  assert.equal(sw.messages[0].type, 'reminder-push');
  assert.equal(sw.messages[0].event.uid, 'alice');
});
test('the page shares delivered IDs with the worker and isolates accounts', async () => {
  const sw = worker();
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = sw.db;
  try {
    await reminderLedger('alice', alert.id);
    await sw.push(alert);
    assert.equal(sw.notifications.length, 0);
    await sw.push({ ...alert, uid: 'bob' });
    assert.equal(sw.notifications.length, 1);
    assert.deepEqual(await reminderLedger('alice'), [alert.id]);
  } finally { globalThis.indexedDB = previous; }
});
test('notification click cannot navigate outside the app origin', async () => {
  const sw = worker();
  await sw.click({ url: 'https://evil.test' });
  assert.deepEqual(sw.opened, []);
});
