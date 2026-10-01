export interface AutomatedMessage {
  id: string;
  type: 'reminder' | 'call' | 'briefing' | 'urgent';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  taskId?: string;
}

class NotificationService {
  private permission: NotificationPermission = 'default';

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  public getPermissionStatus(): NotificationPermission {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  }

  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    try {
      const res = await Notification.requestPermission();
      this.permission = res;
      return res === 'granted';
    } catch (e) {
      console.error('Error requesting notification permission:', e);
      return false;
    }
  }

  public sendNotification(title: string, body: string, onClick?: () => void, tag = `alert-${Date.now()}`): boolean {
    // 1. Play alert sound chime
    this.playNotificationBeep();

    // 2. Trigger vibration on mobile
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (e) {
        // ignore
      }
    }

    // 3. System Notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        void navigator.serviceWorker.getRegistration().then(reg => reg?.showNotification(title, { body, icon: '/pwa-192x192.png', badge: '/icon.svg', tag, data: { url: '/' } })).catch(() => {});
        return true;
      }
      try {
        const notif = new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/icon.svg',
          tag,
          silent: false,
        });

        if (onClick) {
          notif.onclick = () => {
            window.focus();
            onClick();
            notif.close();
          };
        }
        return true;
      } catch (e) {
        console.warn('System notification error, fallback to in-app:', e);
      }
    }

    return false;
  }

  public playNotificationBeep(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = () => { void ctx.close(); };
    } catch (e) {
      // ignore
    }
  }
}

export const notificationService = new NotificationService();
