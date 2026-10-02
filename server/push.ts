import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { z } from 'zod';
import { adminDatabase } from './firebaseAdmin.ts';
import { alarmSchema, timeZoneSchema, validate } from './security.ts';
import { dueReminders } from '../src/shared/reminders.ts';
import type { Task } from '../src/types/index.ts';

export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname) ||
      url.protocol === 'https:' && !url.username && !url.password && !url.port && /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  } catch { return false; }
}
const endpointSchema = z.string().max(3000).refine(validPushEndpoint, 'Unsupported push provider');
const subscriptionSchema = z.object({ endpoint: endpointSchema, expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().regex(/^[\w-]{80,150}$/), auth: z.string().regex(/^[\w-]{20,30}$/) }) });
const scheduleSchema = z.object({ timeZone: timeZoneSchema, alarms: z.array(alarmSchema).max(30), taskAlertsEnabled: z.boolean() });
const DEFAULT_VAPID_PUBLIC = 'BC2O4qO4EIUEC3oVr9S5-N3wcCs0L-wBsWjUk6x-MTM8ermVAgmSEWrwbzsrhNb0NgetOosq4Q2eAnomD3s6284';
const DEFAULT_VAPID_PRIVATE = 'SGIt3_h77nbvYogbpcg-V_PJojpgQ-_sklojlRr8gC4';
const DEFAULT_VAPID_SUBJECT = 'mailto:mhtahim@gmail.com';

const vapidPublic = () => process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC;
const vapidPrivate = () => process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE;
const vapidSubject = () => process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;
const ready = () => process.env.ENABLE_BACKGROUND_REMINDERS !== 'false' && !!vapidPublic() && !!vapidPrivate() && !!vapidSubject();
function deviceId(uid: string, endpoint: string) { return createHash('sha256').update(`${uid}:${endpoint}`).digest('hex'); }

export function pushConfig() { return { available: ready(), publicKey: ready() ? vapidPublic() : null }; }
export function createPushRouter() {
  const router = express.Router();
  router.use((_req, res, next) => { if (!ready()) { res.status(503).json({ error: 'Background reminders are not configured on this server.' }); return; } next(); });
  router.post('/register', validate(scheduleSchema.extend({ subscription: subscriptionSchema })), async (req, res) => {
    try {
      const uid: string = res.locals.uid;
      const ref = adminDatabase().collection('push_devices').doc(deviceId(uid, req.body.subscription.endpoint));
      await adminDatabase().runTransaction(async tx => {
        const current = await tx.get(ref);
        tx.set(ref, { ...req.body, uid, active: true, lastChecked: current.data()?.active ? current.data()!.lastChecked : Date.now(), delivered: current.data()?.delivered || [], leaseUntil: current.data()?.leaseUntil || 0 }, { merge: true });
      });
      res.json({ ok: true });
    } catch { res.status(503).json({ error: 'Unable to save background alerts. Check server Firebase credentials.' }); }
  });
  router.post('/schedule', validate(scheduleSchema.extend({ endpoint: endpointSchema })), async (req, res) => {
    try {
      const ref = adminDatabase().collection('push_devices').doc(deviceId(res.locals.uid, req.body.endpoint));
      if (!(await ref.get()).exists) { res.status(404).json({ error: 'Enable background alerts first.' }); return; }
      const { endpoint: _endpoint, ...schedule } = req.body;
      await ref.update(schedule);
      res.json({ ok: true });
    } catch { res.status(503).json({ error: 'Unable to update background alerts.' }); }
  });
  router.post('/unregister', validate(z.object({ endpoint: endpointSchema, timeZone: timeZoneSchema })), async (req, res) => {
    try { await adminDatabase().collection('push_devices').doc(deviceId(res.locals.uid, req.body.endpoint)).set({ active: false }, { merge: true }); res.json({ ok: true }); }
    catch { res.status(503).json({ error: 'Unable to disable background alerts on the server.' }); }
  });
  return router;
}

// Firestore leases prevent concurrent workers from sending the same event.
export function startPushWorker() {
  if (!ready()) return () => {};
  webpush.setVapidDetails(vapidSubject(), vapidPublic(), vapidPrivate());
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const db = adminDatabase();
      const devices = await db.collection('push_devices').where('active', '==', true).get();
      for (const doc of devices.docs) {
        const now = Date.now();
        const lease = randomUUID();
        const device = await db.runTransaction(async tx => {
          const fresh = await tx.get(doc.ref);
          const data = fresh.data();
          if (!data?.active || data.leaseUntil > now) return null;
          tx.update(doc.ref, { lease, leaseUntil: now + 120000 });
          return data;
        });
        if (!device) continue;
        let completed = false;
        const delivered = new Set<string>(device.delivered || []);
        try {
          const snapshot = await db.collection('tasks').where('userId', '==', device.uid).get();
          const tasks = snapshot.docs.map(d => d.data() as Task);
          const events = dueReminders(tasks, device.alarms, device.taskAlertsEnabled, device.lastChecked, now, device.timeZone);
          for (const event of events) {
            if (delivered.has(event.id)) continue;
            const ownsLease = await db.runTransaction(async tx => {
              const current = await tx.get(doc.ref);
              if (!current.data()?.active || current.data()?.lease !== lease) return false;
              tx.update(doc.ref, { leaseUntil: Date.now() + 120000 });
              return true;
            });
            if (!ownsLease) break;
            await webpush.sendNotification(device.subscription, JSON.stringify({ ...event, uid: device.uid, url: event.type === 'call' ? '/?view=call' : '/?view=tasks' }), { TTL: 86400, timeout: 10000 });
            delivered.add(event.id);
            await doc.ref.update({ delivered: [...delivered].slice(-2000) });
          }
          completed = true;
        } catch (error: any) {
          if (error.statusCode === 404 || error.statusCode === 410) await doc.ref.update({ active: false });
          else console.warn('Background notification delivery will retry.');
        } finally {
          await db.runTransaction(async tx => {
            const current = await tx.get(doc.ref);
            if (current.data()?.lease !== lease) return;
            tx.update(doc.ref, { leaseUntil: 0, delivered: [...delivered].slice(-2000), ...(completed ? { lastChecked: now } : {}) });
          });
        }
      }
    } catch (error) { console.warn('Background reminder worker unavailable:', error instanceof Error ? error.message : 'unknown'); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 30000);
  return () => clearInterval(timer);
}
