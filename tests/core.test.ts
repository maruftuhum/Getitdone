import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeTaskAction, taskActionSchema } from '../src/shared/taskActions';
import { localDate, zonedClock, isCalendarDate } from '../src/shared/dates';
import { dueReminders } from '../src/shared/reminders';
import { parseTaskLocally } from '../src/services/localNlpParser';
import { localTaskCommand } from '../src/services/localTaskCommands';
import { loadTaskCache, mergeCloudTasks, taskCacheKey } from '../src/services/taskStorage';
import { audioBlob } from '../src/shared/audio';
import { validPushEndpoint } from '../server/push';
import type { Task, ScheduledCallAlarm } from '../src/types';

const task: Task = { id: 'target', userId: 'alice', title: 'Dentist appointment', dueDate: '2026-10-02', dueTime: '09:00', category: 'Health', priority: 'high', completed: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
const other = { ...task, id: 'other', title: 'Team meeting' };
function actionHarness() {
  const calls: unknown[] = [];
  const handlers = { add: (t: unknown) => calls.push(['add', t]), complete: (id: string) => calls.push(['complete', id]), delete: (id: string) => calls.push(['delete', id]), update: (id: string, updates: unknown) => calls.push(['update', id, updates]) };
  return { calls, handlers };
}
test('completion targets the supplied ID even when another task is first', () => {
  const { calls, handlers } = actionHarness();
  assert.equal(executeTaskAction({ action: 'COMPLETE_TASK', taskId: task.id }, [other, task], handlers).ok, true);
  assert.deepEqual(calls, [['complete', task.id]]);
});
test('unknown, missing and ambiguous task targets never mutate', () => {
  const { calls, handlers } = actionHarness();
  for (const action of ['COMPLETE_TASK', 'DELETE_TASK', 'UPDATE_TASK']) {
    assert.equal(executeTaskAction({ action, taskId: 'missing', updates: { dueDate: '2026-10-03' } }, [other, task], handlers).ok, false);
    assert.equal(executeTaskAction({ action }, [other, task], handlers).ok, false);
  }
  assert.deepEqual(calls, []);
});
test('complete is idempotent, delete and reschedule use the same executor', () => {
  const { calls, handlers } = actionHarness();
  executeTaskAction({ action: 'COMPLETE_TASK', taskId: task.id }, [{ ...task, completed: true }], handlers);
  executeTaskAction({ action: 'DELETE_TASK', taskId: task.id }, [task], handlers);
  executeTaskAction({ action: 'RESCHEDULE_TASK', taskId: other.id, updates: { dueDate: '2026-10-04', dueTime: '16:00' } }, [task, other], handlers);
  assert.deepEqual(calls, [['delete', task.id], ['update', other.id, { dueDate: '2026-10-04', dueTime: '16:00' }]]);
});
test('reject impossible dates, time, priority, empty title and protected field changes', () => {
  for (const patch of [{ dueDate: '2026-02-30' }, { dueTime: '24:00' }, { priority: 'extreme' }, { title: '' }, { userId: 'bob' }, {}]) {
    assert.equal(taskActionSchema.safeParse({ action: 'UPDATE_TASK', taskId: task.id, updates: patch }).success, false);
  }
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2026-02-29'), false);
});
test('Dhaka date rolls over before UTC midnight and recomputes every request', () => {
  assert.deepEqual(zonedClock(new Date('2026-10-01T18:15:00Z'), 'Asia/Dhaka'), { date: '2026-10-02', time: '00:15' });
  assert.equal(zonedClock(new Date('2026-10-02T18:15:00Z'), 'Asia/Dhaka').date, '2026-10-03');
  const date = new Date(2026, 9, 2, 0, 15);
  assert.equal(localDate(date), '2026-10-02');
});
test('relative date parser matches longest phrases first', () => {
  const now = new Date(2026, 9, 2, 12);
  assert.equal(parseTaskLocally('Dentist day after tomorrow at 3pm', now).dueDate, '2026-10-04');
  assert.equal(parseTaskLocally('Dentist tomorrow at 3pm', now).dueDate, '2026-10-03');
  assert.equal(parseTaskLocally('মিটিং আগামীকাল সকাল ১০টা', now).title, 'মিটিং');
  assert.equal(parseTaskLocally('মিটিং পরশুদিন বিকেল ৫টা', now).dueDate, '2026-10-04');
  assert.equal(parseTaskLocally('Meeting on 2026-11-05 at 14:30', now).dueDate, '2026-11-05');
  assert.equal(parseTaskLocally('ডাক্তার আজ বিকেল ৫:৯৯', now).dueTime, null);
});
test('queries containing tomorrow or urgent never create tasks', () => {
  assert.equal(localTaskCommand('What tasks are due tomorrow at 3pm?', [task]), null);
  assert.equal(localTaskCommand('Show urgent tasks', [task]), null);
  assert.equal(localTaskCommand('What is my highest priority task?', [task]), null);
});
test('local commands create, complete, delete and reschedule specific tasks', () => {
  assert.equal(localTaskCommand('Add buy groceries tomorrow at 5pm', [])?.action?.action, 'CREATE_TASK');
  assert.deepEqual(localTaskCommand('Complete Dentist appointment', [other, task])?.action, { action: 'COMPLETE_TASK', taskId: 'target' });
  assert.deepEqual(localTaskCommand('Delete Dentist appointment', [other, task])?.action, { action: 'DELETE_TASK', taskId: 'target' });
  assert.equal(localTaskCommand('Reschedule Dentist appointment to tomorrow at 4pm', [other, task])?.action?.action, 'UPDATE_TASK');
  assert.equal(localTaskCommand('Complete the task', [other, task])?.action, undefined);
  assert.equal(localTaskCommand('Delete Dentist appointment', [task, { ...task, id: 'duplicate' }])?.action, undefined);
});
test('missed reminders are caught up, completed tasks excluded and events deduplicated', () => {
  const from = Date.parse('2026-10-02T02:59:00Z');
  const to = Date.parse('2026-10-02T03:05:00Z');
  const alarm: ScheduledCallAlarm = { id: 'morning', label: 'Morning', time: '09:00', enabled: true, callType: 'morning_brief' };
  const events = dueReminders([task, { ...other, completed: true }], [alarm], true, from, to, 'Asia/Dhaka');
  assert.equal(events.length, 2);
  assert.equal(events[0].taskId, 'target');
  assert.equal(dueReminders([task], [alarm], false, from, to, 'Asia/Dhaka').length, 1);
  assert.equal(dueReminders([task], [{ ...alarm, enabled: false }], false, from, to, 'Asia/Dhaka').length, 0);
});
test('repeated DST hour produces one alarm event per local day', () => {
  const alarm: ScheduledCallAlarm = { id: 'dst', label: 'DST', time: '01:30', enabled: true, callType: 'custom_alarm' };
  const events = dueReminders([], [alarm], false, Date.parse('2026-11-01T05:00:00Z'), Date.parse('2026-11-01T07:00:00Z'), 'America/New_York');
  assert.equal(events.length, 1);
});
test('an empty cloud snapshot stays empty; pending local edits and tombstones survive', () => {
  assert.deepEqual(mergeCloudTasks([], []), []);
  assert.deepEqual(mergeCloudTasks([task, other], [{ id: task.id, version: 'delete', task: null }]), [other]);
  assert.deepEqual(mergeCloudTasks([], [{ id: task.id, version: 'add', task }]), [task]);
});
test('storage isolates guests and accounts, and refuses other owners in a cache', () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) || null };
  saved.set('getitdone_tasks', JSON.stringify([task, { ...other, userId: 'local-user' }]));
  assert.deepEqual(loadTaskCache(storage, 'guest').tasks.map(t => t.id), [other.id]);
  assert.deepEqual(loadTaskCache(storage, 'bob').tasks, []);
  saved.set(taskCacheKey('alice'), JSON.stringify({ tasks: [task, { ...other, userId: 'bob' }], pending: [] }));
  assert.deepEqual(loadTaskCache(storage, 'alice').tasks, [task]);
  saved.set(taskCacheKey('bob'), 'invalid JSON');
  assert.deepEqual(loadTaskCache(storage, 'bob'), { tasks: [], pending: [] });
});
test('Gemini PCM audio is wrapped in a playable WAV container', async () => {
  const blob = audioBlob(new Uint8Array([1, 2, 3, 4]), 'audio/L16;codec=pcm;rate=24000');
  assert.equal(blob.type, 'audio/wav');
  const bytes = await blob.arrayBuffer();
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(new DataView(bytes).getUint32(24, true), 24000);
  assert.equal(new DataView(bytes).getUint32(40, true), 4);
});
test('push endpoint validation blocks localhost, private networks, custom ports and credentials', () => {
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/x', 'https://fcm.googleapis.com.evil.test/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:3000/x']) assert.equal(validPushEndpoint(endpoint), false);
  assert.equal(validPushEndpoint('https://fcm.googleapis.com/fcm/send/test'), true);
  assert.equal(validPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/test'), true);
});
