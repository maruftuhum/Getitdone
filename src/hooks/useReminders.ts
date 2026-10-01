import { useEffect, useRef } from 'react';
import { dueReminders, type ReminderEvent } from '../shared/reminders';
import type { Task, ScheduledCallAlarm } from '../types';
import { reminderLedger } from '../services/reminderLedger';

export function useReminders(scope: string, tasks: Task[], alarms: ScheduledCallAlarm[], enabled: boolean, onEvent: (event: ReminderEvent) => void, active = true) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  useEffect(() => {
    if (!active) return;
    let live = true;
    let running = false;
    const key = `getitdone_reminders:${scope}`;
    let state: { checked: number; delivered: string[] };
    try { state = JSON.parse(localStorage.getItem(key) || 'null') || { checked: Date.now() - 60000, delivered: [] }; }
    catch { state = { checked: Date.now() - 60000, delivered: [] }; }
    const run = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      const now = Date.now();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const seen = new Set(state.delivered);
      for (const id of await reminderLedger(scope)) seen.add(id);
      if (!live) return;
      for (const event of dueReminders(tasks, alarms, enabled, state.checked, now, zone)) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        await reminderLedger(scope, event.id);
        if (!live) return;
        callback.current(event);
      }
      state = { checked: now, delivered: [...seen].slice(-2000) };
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* keep in-memory deduplication */ }
      running = false;
    };
    const receive = (message: MessageEvent) => {
      const data = message.data;
      if (data?.type !== 'reminder-push' || data.event?.uid !== scope) return;
      const event = data.event as ReminderEvent;
      if (!state.delivered.includes(event.id)) {
        state.delivered.push(event.id);
        callback.current({ ...event, fromPush: true });
      }
    };
    run();
    const timer = setInterval(run, 12000);
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    navigator.serviceWorker?.addEventListener('message', receive);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', run); window.removeEventListener('focus', run); navigator.serviceWorker?.removeEventListener('message', receive); };
  }, [scope, tasks, alarms, enabled, active]);
}
