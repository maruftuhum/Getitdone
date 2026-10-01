import { z } from 'zod';
import type { Task } from '../types';
import { isCalendarDate } from './dates';

export const dateSchema = z.string().refine(isCalendarDate, 'Invalid calendar date');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const taskFields = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: dateSchema,
  dueTime: timeSchema.nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  description: z.string().max(2000).optional(),
  category: z.enum(['Personal', 'Work', 'Urgent', 'Health', 'Errands']),
  priority: z.enum(['low', 'medium', 'high']),
});
export const taskSchema = taskFields.extend({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), userId: z.string().min(1).max(128),
  completed: z.boolean(), completedAt: z.string().nullable().optional(),
  createdAt: z.string(), updatedAt: z.string(),
  subtasks: z.array(z.object({ id: z.string(), title: z.string().max(200), completed: z.boolean() })).max(100).optional(),
});
const updatesSchema = taskFields.partial().strict().refine(v => Object.keys(v).length > 0, 'No updates supplied');
export const taskActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CREATE_TASK'), task: taskFields }),
  z.object({ action: z.literal('COMPLETE_TASK'), taskId: z.string().min(1) }),
  z.object({ action: z.literal('DELETE_TASK'), taskId: z.string().min(1) }),
  z.object({ action: z.literal('UPDATE_TASK'), taskId: z.string().min(1), updates: updatesSchema }),
  z.object({ action: z.literal('RESCHEDULE_TASK'), taskId: z.string().min(1), updates: updatesSchema }),
]);
export type TaskAction = z.infer<typeof taskActionSchema>;
export interface TaskActionHandlers {
  add: (task: z.infer<typeof taskFields>) => void;
  update: (id: string, updates: Partial<Task>) => void;
  complete: (id: string) => void;
  delete: (id: string) => void;
}
export interface ActionResult { ok: boolean; message: string }

export function executeTaskAction(input: unknown, tasks: Task[], handlers: TaskActionHandlers): ActionResult {
  const parsed = taskActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'The task instruction was invalid. Please specify the task and the change.' };
  const action = parsed.data;
  if (action.action === 'CREATE_TASK') {
    handlers.add(action.task);
    return { ok: true, message: `Added: ${action.task.title}` };
  }
  const target = tasks.find(t => t.id === action.taskId);
  if (!target) return { ok: false, message: 'That task could not be found. Please name an existing task.' };
  if (action.action === 'COMPLETE_TASK') {
    if (!target.completed) handlers.complete(target.id);
    return { ok: true, message: `Completed: ${target.title}` };
  }
  if (action.action === 'DELETE_TASK') handlers.delete(target.id);
  else handlers.update(target.id, action.updates);
  return { ok: true, message: `${action.action === 'DELETE_TASK' ? 'Deleted' : 'Updated'}: ${target.title}` };
}
