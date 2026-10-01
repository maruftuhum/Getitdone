import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, subscribeToUserTasks, saveTaskToFirestore, deleteTaskFromFirestore } from '../services/firebase';
import { loadTaskCache, mergeCloudTasks, taskCacheKey, type TaskCache } from '../services/taskStorage';
import type { Task } from '../types';

export function useTasks() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cache, setCache] = useState<TaskCache>(() => loadTaskCache(localStorage, 'guest'));
  const [syncError, setSyncError] = useState('');
  const state = useRef({ scope: 'guest', cache });
  const inFlight = useRef(new Set<string>());
  const scope = user?.uid || 'guest';
  const [retry, setRetry] = useState(0);

  const commit = (next: TaskCache) => {
    state.current.cache = next;
    setCache(next);
    try { localStorage.setItem(taskCacheKey(state.current.scope), JSON.stringify(next)); }
    catch { setSyncError('Device storage is full or unavailable. Export your tasks before closing this page.'); }
  };

  useEffect(() => onAuthStateChanged(auth, nextUser => {
    const nextScope = nextUser?.uid || 'guest';
    if (nextScope !== state.current.scope) {
      const next = loadTaskCache(localStorage, nextScope);
      state.current = { scope: nextScope, cache: next };
      setCache(next);
      setSyncError('');
    }
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return subscribeToUserTasks(uid, cloud => {
      if (state.current.scope !== uid) return;
      commit({ ...state.current.cache, tasks: mergeCloudTasks(cloud, state.current.cache.pending) });
    }, () => { if (state.current.scope === uid) setSyncError('Cloud sync is unavailable. Changes are saved on this device and will retry.'); });
  }, [user]);

  useEffect(() => {
    const online = () => setRetry(v => v + 1);
    window.addEventListener('online', online);
    const interval = setInterval(online, 30000);
    return () => { window.removeEventListener('online', online); clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!user || !navigator.onLine) return;
    const uid = user.uid;
    for (const write of cache.pending) {
      const key = `${uid}:${write.id}`;
      if (inFlight.current.has(key)) continue;
      inFlight.current.add(key);
      const operation = write.task ? saveTaskToFirestore(write.task) : deleteTaskFromFirestore(write.id);
      operation.then(() => {
        if (state.current.scope !== uid) return;
        commit({ ...state.current.cache, pending: state.current.cache.pending.filter(p => p.version !== write.version) });
        setSyncError('');
      }).catch(() => {
        if (state.current.scope === uid) setSyncError('Cloud sync failed. Your changes remain saved locally and will retry.');
      }).finally(() => {
        inFlight.current.delete(key);
        if (state.current.scope === uid && state.current.cache.pending.some(p => p.id === write.id && p.version !== write.version)) setRetry(v => v + 1);
      });
    }
  }, [cache.pending, user, retry]);

  const mutate = (id: string, task: Task | null) => {
    if (state.current.scope !== scope) return;
    const current = state.current.cache;
    const tasks = task ? [task, ...current.tasks.filter(t => t.id !== id)] : current.tasks.filter(t => t.id !== id);
    const pending = state.current.scope === 'guest' ? [] : [
      ...current.pending.filter(p => p.id !== id), { id, task, version: crypto.randomUUID() },
    ];
    commit({ tasks, pending });
  };
  const addTask = (fields: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'completed'>) => {
    const now = new Date().toISOString();
    const task: Task = { ...fields, id: `task-${crypto.randomUUID()}`, userId: user?.uid || 'local-user', completed: false, createdAt: now, updatedAt: now };
    mutate(task.id, task);
  };
  const updateTask = (id: string, updates: Partial<Task>) => {
    const current = state.current.cache.tasks.find(t => t.id === id);
    if (current) mutate(id, { ...current, ...updates, id: current.id, userId: current.userId, updatedAt: new Date().toISOString() });
  };
  const importGuestTasks = () => {
    if (!user) return;
    const marker = `getitdone_guest_imported:${user.uid}`;
    let imported: string[] = [];
    try { const saved = JSON.parse(localStorage.getItem(marker) || '[]'); imported = Array.isArray(saved) ? saved : []; } catch { /* preserve guest source */ }
    for (const guest of loadTaskCache(localStorage, 'guest').tasks) {
      if (imported.includes(guest.id)) continue;
      const now = new Date().toISOString();
      const task = { ...guest, id: `task-${crypto.randomUUID()}`, userId: user.uid, updatedAt: now };
      mutate(task.id, task);
      imported.push(guest.id);
    }
    localStorage.setItem(marker, JSON.stringify(imported));
    setRetry(v => v + 1);
  };
  let imported: string[] = [];
  try { imported = JSON.parse(localStorage.getItem(`getitdone_guest_imported:${user?.uid}`) || '[]'); } catch { /* treat as not imported */ }
  const guestCount = user ? loadTaskCache(localStorage, 'guest').tasks.filter(t => !Array.isArray(imported) || !imported.includes(t.id)).length : 0;
  return { user, authReady, scope, tasks: cache.tasks, addTask, updateTask, deleteTask: (id: string) => mutate(id, null), syncError, pendingCount: cache.pending.length, guestCount, importGuestTasks };
}
