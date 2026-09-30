import React from 'react';
import { Phone, Cloud, CloudOff, User, Bell, Download, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { User as FirebaseUser } from 'firebase/auth';

interface TopBarProps {
  user: FirebaseUser | null;
  onOpenSignIn: () => void;
  onTriggerTestCall: () => void;
  onOpenMessages: () => void;
  unreadMessagesCount: number;
  isFirebaseConnected: boolean;
  activeTab: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  user,
  onOpenSignIn,
  onTriggerTestCall,
  onOpenMessages,
  unreadMessagesCount,
  isFirebaseConnected,
  activeTab,
}) => {
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Zone 1: Wordmark Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20">
            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white leading-none">
              Get It Done
            </span>
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-tight">
              {activeTab === 'tasks' && 'Tasks & Schedule'}
              {activeTab === 'calendar' && 'Calendar View'}
              {activeTab === 'call' && 'AI Voice Briefing'}
              {activeTab === 'chat' && 'Assistant Chat'}
              {activeTab === 'settings' && 'App & Alarms'}
            </span>
          </div>
        </div>

        {/* Zone 2: Sync and Connectivity Status */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {isOnline ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Cloud className="w-3.5 h-3.5" />
              <span>{isFirebaseConnected ? 'Cloud Synced' : 'Online'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <CloudOff className="w-3.5 h-3.5" />
              <span>100% Offline Mode</span>
            </span>
          )}
        </div>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-1.5">
          {/* In-App PWA / APK Install Button */}
          {isInstallable && !isInstalled && (
            <button
              onClick={install}
              title="Install Android App"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition active:scale-95 touch-manipulation min-h-[44px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install APK</span>
            </button>
          )}

          {/* Automated Messages Bell */}
          <button
            onClick={onOpenMessages}
            title="Automated Messages"
            className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Bell className="w-4 h-4" />
            {unreadMessagesCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          {/* Quick AI Call Button */}
          <button
            onClick={onTriggerTestCall}
            title="Start AI Call Briefing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 font-medium text-xs transition-colors active:scale-95 touch-manipulation min-h-[44px]"
          >
            <Phone className="w-3.5 h-3.5 fill-current animate-bounce" />
            <span className="hidden xs:inline">Call Me</span>
          </button>

          {/* User Auth Profile */}
          <button
            onClick={onOpenSignIn}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px]"
            title={user ? `Signed in as ${user.displayName || user.email}` : 'Sign in for cloud sync'}
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-8 h-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
