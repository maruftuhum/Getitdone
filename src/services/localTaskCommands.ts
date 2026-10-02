import type { Task } from '../types';
import type { TaskAction } from '../shared/taskActions';
import { parseTaskLocally } from './localNlpParser';

export function localTaskCommand(text: string, tasks: Task[]): { reply: string; action?: TaskAction } | null {
  const input = text.trim();
  const lower = input.toLocaleLowerCase();
  const isQuestion = /^(what|when|which|how|show|list|do i|can you show)\b/i.test(input);
  if (isQuestion) return null;
  const deleting = /^(delete|remove)\b/i.test(input) || /মুছে|ডিলিট/.test(input);
  const completing = /^(complete|finish|mark|i (?:finished|completed))\b/i.test(input) || /শেষ|কমপ্লিট|টিক/.test(input);
  const updating = /^(reschedule|move|change|update)\b/i.test(input) || /সরাও|পরিবর্তন|নিয়ে যাও/.test(input);
  if (deleting || completing || updating) {
    const matches = tasks.filter(t => lower.includes(t.id.toLowerCase()) || lower.includes(t.title.toLocaleLowerCase()));
    if (matches.length !== 1) return { reply: "I see multiple matching tasks on your list. Could you give me the specific title so I change the right one?" };
    const target = matches[0];
    if (deleting) return { reply: `Got it, removed "${target.title}" from your to-do list.`, action: { action: 'DELETE_TASK', taskId: target.id } };
    if (completing) return { reply: `Awesome! I've marked "${target.title}" as completed.`, action: { action: 'COMPLETE_TASK', taskId: target.id } };
    const instruction = input.replace(new RegExp(target.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
    const parsed = parseTaskLocally(instruction);
    const updates: Partial<Task> = {};
    if (/today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|আজ|কাল|পরশু|\d{4}-\d{2}-\d{2}/i.test(instruction)) updates.dueDate = parsed.dueDate;
    if (parsed.dueTime) updates.dueTime = parsed.dueTime;
    if (/urgent|important|low priority|optional|জরুরি|গুরুত্বপূর্ণ/i.test(instruction)) updates.priority = parsed.priority;
    if (!Object.keys(updates).length) return { reply: 'Sure, what new date or time should I set for that task?' };
    return { reply: `All set! Updated "${target.title}" on your schedule.`, action: { action: 'UPDATE_TASK', taskId: target.id, updates } };
  }
  if (/^(add|create|schedule)\b|^remind me to\b/i.test(input) || /যোগ করো|অ্যাড করো|করতে হবে/.test(input)) {
    const title = input.replace(/^(?:add:?|create|schedule|remind me to)\s*/i, '').replace(/যোগ করো|অ্যাড করো|করতে হবে/g, '').trim();
    if (!title) return { reply: 'What task would you like me to add for you?' };
    const task = parseTaskLocally(title);
    return { reply: `Done! Added "${task.title}" for ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ''}.`, action: { action: 'CREATE_TASK', task } };
  }
  return null;
}
