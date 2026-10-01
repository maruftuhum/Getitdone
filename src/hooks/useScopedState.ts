import { useEffect, useRef, useState } from 'react';

export function useScopedState<T>(scope: string, name: string, initial: () => T) {
  const key = `getitdone_v2:${scope}:${name}`;
  const read = () => {
    try {
      const legacy: Record<string, string> = { alarms: 'getitdone_call_alarms', messages: 'getitdone_auto_messages', alerts: 'getitdone_task_alerts', voice: 'getitdone_voice', hybrid: 'getitdone_hybrid_mode' };
      const saved = localStorage.getItem(key) ?? (scope === 'guest' && legacy[name] ? localStorage.getItem(legacy[name]) : null);
      if (!saved) return initial();
      const parsed = name === 'voice' && !saved.startsWith('"') ? saved : JSON.parse(saved);
      const defaultValue = initial();
      if (Array.isArray(defaultValue) ? !Array.isArray(parsed) : typeof parsed !== typeof defaultValue) return defaultValue;
      return parsed as T;
    } catch { return initial(); }
  };
  const [value, setValue] = useState<T>(read);
  const activeKey = useRef(key);
  // Switch before persistence so another account's value is never written to this key.
  if (activeKey.current !== key) { activeKey.current = key; setValue(read()); }
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* task persistence reports storage errors separately */ } }, [key, value]);
  return [value, setValue] as const;
}
