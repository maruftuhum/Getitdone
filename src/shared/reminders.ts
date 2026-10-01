import type { Task, ScheduledCallAlarm } from '../types';
import { zonedClock } from './dates';

export interface ReminderEvent { id: string; type: 'call' | 'reminder' | 'urgent'; title: string; body: string; taskId?: string; alarmId?: string; fromPush?: boolean }
// Compare clock minutes in the user's zone. Checking elapsed minutes also catches suspension and DST.
export function dueReminders(tasks: Task[], alarms: ScheduledCallAlarm[], alerts: boolean, from: number, to: number, timeZone: string): ReminderEvent[] {
  const events = new Map<string, ReminderEvent>();
  const start = Math.max(from, to - 24 * 60 * 60 * 1000);
  for (let minute = Math.floor(start / 60000) * 60000; minute <= to; minute += 60000) {
    const clock = zonedClock(new Date(minute), timeZone);
    if (alerts) for (const task of tasks) {
      if (task.completed || task.dueDate !== clock.date || task.dueTime !== clock.time) continue;
      const id = `task:${task.id}:${clock.date}:${clock.time}`;
      events.set(id, { id, type: task.priority === 'high' ? 'urgent' : 'reminder', title: `Task Due: ${task.title}`, body: `Scheduled for ${task.dueTime}${task.location ? ` at ${task.location}` : ''}.`, taskId: task.id });
    }
    for (const alarm of alarms) {
      if (!alarm.enabled || alarm.time !== clock.time) continue;
      const id = `alarm:${alarm.id}:${clock.date}:${clock.time}`;
      events.set(id, { id, type: 'call', title: `AI Briefing: ${alarm.label}`, body: 'Your task briefing is ready. Open the app to start your call.', alarmId: alarm.id });
    }
  }
  return [...events.values()];
}
