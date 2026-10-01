import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { ScheduledCallAlarm } from '../types';
import { apiFetch } from '../services/apiClient';

const registration = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Install or reload the production app to enable background alerts.')), 5000)),
]);
export function useBackgroundReminders(user: User | null, alarms: ScheduledCallAlarm[], taskAlertsEnabled: boolean, authReady: boolean) {
  const [status, setStatus] = useState('Background alerts are off.');
  const [enabled, setEnabled] = useState(false);
  const subscription = useRef<PushSubscription | null>(null);
  const currentUid = useRef(user?.uid);
  currentUid.current = user?.uid;
  const schedule = () => ({ alarms, taskAlertsEnabled });
  const configure = async (sub: PushSubscription) => {
    const uid = user?.uid;
    if (!uid) return;
    const res = await apiFetch('/api/push/register', { subscription: sub.toJSON(), ...schedule() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (currentUid.current !== uid) { await sub.unsubscribe(); return; }
    subscription.current = sub;
    localStorage.setItem('getitdone_push_owner', uid);
    setEnabled(true); setStatus('Background alerts are enabled for this device.');
  };
  useEffect(() => {
    setEnabled(false); subscription.current = null; setStatus('Background alerts are off.');
    if (!authReady || !user || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    let active = true;
    void registration().then(async reg => {
      const sub = await reg.pushManager.getSubscription();
      if (!active || !sub) return;
      if (localStorage.getItem('getitdone_push_owner') !== user.uid) { await sub.unsubscribe(); return; }
      await configure(sub);
    }).catch(error => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, [user?.uid, authReady]);
  useEffect(() => {
    if (!enabled || !subscription.current || !user) return;
    const endpoint = subscription.current.endpoint;
    const uid = user.uid;
    let active = true;
    const sync = () => {
      if (!navigator.onLine) { setStatus('Background schedule changes will sync when you reconnect.'); return; }
      void apiFetch('/api/push/schedule', { endpoint, ...schedule() }).then(async res => {
        if (!res.ok) throw new Error((await res.json()).error);
        if (active && currentUid.current === uid) setStatus('Background alerts are enabled for this device.');
      }).catch(error => { if (active && currentUid.current === uid) setStatus(`${error.message} Schedule sync will retry.`); });
    };
    const timer = setTimeout(sync, 500);
    const retry = setInterval(sync, 60000);
    window.addEventListener('online', sync);
    return () => { active = false; clearTimeout(timer); clearInterval(retry); window.removeEventListener('online', sync); };
  }, [alarms, taskAlertsEnabled, enabled, user?.uid]);
  const enable = async () => {
    try {
      if (!user) throw new Error('Sign in to enable background alerts.');
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support background alerts.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in browser settings to enable alerts.');
      const res = await fetch('/api/push/config');
      const config = await res.json();
      if (!config.available) throw new Error('Background alerts need server configuration. In-app reminders remain available.');
      const reg = await registration();
      const existing = await reg.pushManager.getSubscription();
      const key = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(key), c => c.charCodeAt(0));
      const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      try { await configure(sub); }
      catch (error) { if (!existing) await sub.unsubscribe(); throw error; }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to enable alerts.'); }
  };
  const disable = async () => {
    try {
      const sub = subscription.current;
      if (sub) {
        if (!(await sub.unsubscribe())) throw new Error('Unable to unsubscribe.');
        void apiFetch('/api/push/unregister', { endpoint: sub.endpoint }).catch(() => {});
      }
      localStorage.removeItem('getitdone_push_owner'); subscription.current = null;
      setEnabled(false); setStatus('Background alerts are off.');
    } catch { setStatus('Unable to disable alerts. Please retry.'); }
  };
  return { status, enabled, enable, disable };
}
