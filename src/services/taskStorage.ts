import type { Task } from '../types';
import { taskSchema } from '../shared/taskActions';

export interface PendingWrite { id: string; version: string; task: Task | null }
export interface TaskCache { tasks: Task[]; pending: PendingWrite[] }
export function taskCacheKey(scope: string) { return `getitdone_tasks_v2:${scope}`; }
export function loadTaskCache(storage: Pick<Storage, 'getItem'>, scope: string): TaskCache {
  try {
    const saved = JSON.parse(storage.getItem(taskCacheKey(scope)) || 'null');
    const legacy = JSON.parse(storage.getItem('getitdone_tasks') || '[]');
    const owner = scope === 'guest' ? 'local-user' : scope;
    const source = saved?.tasks ?? (Array.isArray(legacy) ? legacy.filter((t: Task) => t?.userId === owner) : []);
    const tasks = (Array.isArray(source) ? source : []).filter((t: unknown) => taskSchema.safeParse(t).success);
    const owned = tasks.filter((t: Task) => t.userId === (scope === 'guest' ? 'local-user' : scope));
    const pending = (Array.isArray(saved?.pending) ? saved.pending : []).filter((p: PendingWrite) =>
      p && typeof p.id === 'string' && /^[\w-]{1,128}$/.test(p.id) && typeof p.version === 'string' && (p.task === null || taskSchema.safeParse(p.task).success && p.id === p.task.id && p.task.userId === owner));
    return { tasks: owned, pending };
  } catch { return { tasks: [], pending: [] }; }
}
export function mergeCloudTasks(cloud: Task[], pending: PendingWrite[]): Task[] {
  const merged = new Map(cloud.map(t => [t.id, t]));
  for (const write of pending) {
    if (write.task) merged.set(write.id, write.task);
    else merged.delete(write.id);
  }
  return [...merged.values()];
}
