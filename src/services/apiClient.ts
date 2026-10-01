import { auth } from './firebase';

export async function apiFetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...(body as object), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
}
