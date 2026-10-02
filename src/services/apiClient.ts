import { auth } from './firebase';
import { signInAnonymously } from 'firebase/auth';

function getApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const isNative = typeof window !== 'undefined' && (
    Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && !window.location.port)
  );
  const baseUrl = isNative ? 'https://gidruf.vercel.app' : '';
  return `${baseUrl}${path}`;
}

export async function apiFetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let user = auth.currentUser;
  if (!user && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const cred = await signInAnonymously(auth);
      user = cred.user;
    } catch {
      // ignore
    }
  }
  const token = await user?.getIdToken();
  const customKey = typeof window !== 'undefined' ? localStorage.getItem('getitdone_gemini_api_key')?.trim() : null;
  const url = getApiUrl(path);

  return fetch(url, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
    },
    body: JSON.stringify({ ...(body as object), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
}

