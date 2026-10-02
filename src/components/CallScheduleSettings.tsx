import React, { useState } from 'react';
import { 
  Phone, 
  Clock, 
  Volume2, 
  Sparkles, 
  Bell, 
  User, 
  LogOut, 
  LogIn, 
  Cloud, 
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  Smartphone,
  ShieldCheck,
  Vibrate
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ScheduledCallAlarm } from '../types';
import { notificationService } from '../services/notificationService';
import { audioService } from '../services/audioService';
import { hapticService } from '../services/hapticService';

interface CallScheduleSettingsProps {
  backgroundStatus: string;
  backgroundEnabled: boolean;
  onEnableBackground: () => Promise<void>;
  onDisableBackground: () => Promise<void>;
  user: FirebaseUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onTriggerTestCall: () => void;
  alarms: ScheduledCallAlarm[];
  onUpdateAlarms: (alarms: ScheduledCallAlarm[]) => void;
  taskAlertsEnabled: boolean;
  onToggleTaskAlerts: (enabled: boolean) => void;
  voiceName: string;
  onSelectVoice: (voice: string) => void;
  hybridMode: boolean;
  onToggleHybridMode: (enabled: boolean) => void;
  onOpenGemmaModal?: () => void;
}

export const CallScheduleSettings: React.FC<CallScheduleSettingsProps> = ({
  user,
  onSignIn,
  onSignOut,
  onTriggerTestCall,
  alarms,
  onUpdateAlarms,
  taskAlertsEnabled,
  onToggleTaskAlerts,
  voiceName,
  onSelectVoice,
  hybridMode,
  onToggleHybridMode,
  onOpenGemmaModal,
  backgroundStatus,
  backgroundEnabled,
  onEnableBackground,
  onDisableBackground,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showApkGuide, setShowApkGuide] = useState(false);
  const [newAlarmTime, setNewAlarmTime] = useState('14:00');
  const [newAlarmLabel, setNewAlarmLabel] = useState('Afternoon Check-in');
  const [notificationStatus, setNotificationStatus] = useState<string>(
    notificationService.getPermissionStatus()
  );
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState(() => {
    try {
      return localStorage.getItem('getitdone_gemini_api_key') || '';
    } catch {
      return '';
    }
  });
  const [isApiKeySaved, setIsApiKeySaved] = useState(false);

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (trimmed) {
      localStorage.setItem('getitdone_gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('getitdone_gemini_api_key');
    }
    setIsApiKeySaved(true);
    hapticService.lightTap();
    setTimeout(() => setIsApiKeySaved(false), 2500);
  };

  const voiceOptions = [
    { id: 'Puck', label: 'Puck (Natural, Energetic)', isOffline: false },
    { id: 'Aoede', label: 'Aoede (Smooth, Clear)', isOffline: false },
    { id: 'Fenrir', label: 'Fenrir (Deep, Direct)', isOffline: false },
    { id: 'Kore', label: 'Kore (Calm, Attentive)', isOffline: false },
    { id: 'Device-Local', label: 'Native Device Engine (100% Offline)', isOffline: true },
  ];

  const handlePreviewVoice = (vId: string) => {
    if (previewingVoiceId) {
      audioService.stopSpeaking();
      setPreviewingVoiceId(null);
      return;
    }
    setPreviewingVoiceId(vId);
    audioService.speakBriefing(
      "Good morning! You have 3 tasks scheduled for today. Let's get it done!",
      vId,
      () => setPreviewingVoiceId(vId),
      () => setPreviewingVoiceId(null)
    );
  };

  const handleRequestNotifications = async () => {
    const granted = await notificationService.requestPermission();
    setNotificationStatus(granted ? 'granted' : 'denied');
    if (granted) {
      notificationService.sendNotification(
        'Get It Done Automated Alerts Active!',
        'You will now receive automatic messages when tasks are due and when scheduled calls trigger.'
      );
    }
  };

  const handleToggleAlarm = (id: string, currentEnabled: boolean) => {
    const updated = alarms.map((a) =>
      a.id === id ? { ...a, enabled: !currentEnabled } : a
    );
    onUpdateAlarms(updated);
  };

  const handleTimeChange = (id: string, time: string) => {
    const updated = alarms.map((a) =>
      a.id === id ? { ...a, time } : a
    );
    onUpdateAlarms(updated);
  };

  const handleDeleteAlarm = (id: string) => {
    onUpdateAlarms(alarms.filter((a) => a.id !== id));
  };

  const handleAddAlarm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlarmTime) return;
    const newEntry: ScheduledCallAlarm = {
      id: `alarm-${Date.now()}`,
      label: newAlarmLabel.trim() || 'Custom Call Alarm',
      time: newAlarmTime,
      enabled: true,
      callType: 'custom_alarm',
    };
    onUpdateAlarms([...alarms, newEntry]);
    setNewAlarmLabel('');
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4 pb-28 space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <h3 className="text-sm font-bold">Background alerts</h3>
        <p role="status" className="text-xs text-slate-500">{backgroundStatus}</p>
        <p className="text-xs text-slate-500">Receive due-task and briefing notifications while the app is closed. Open a briefing notification to start the in-app call. Delivery depends on browser permissions, network access, and a running reminder server.</p>
        <button onClick={backgroundEnabled ? onDisableBackground : onEnableBackground} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs">{backgroundEnabled ? 'Disable background alerts' : 'Enable background alerts'}</button>
      </div>
      {/* 1. Android Native APK & App Installation Card */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-indigo-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Android Native App & APK Installation</h3>
              <p className="text-xs text-indigo-200">
                Install the real native Android APK or add to home screen
              </p>
            </div>
          </div>
          <a
            href="https://github.com/maruftuhum/Getitdone/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-300 hover:text-white underline"
          >
            Releases ↗
          </a>
        </div>

        {/* Primary Download: Real Compiled Android APK */}
        <div className="space-y-2">
          <a
            href="https://github.com/maruftuhum/Getitdone/releases/latest/download/GetItDone-app-debug.apk"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98 shadow-md min-h-[48px]"
          >
            <Download className="w-4 h-4" />
            <span>Download Native Android APK (GetItDone-app-debug.apk)</span>
          </a>

          <div className="p-3 rounded-2xl bg-white/10 text-xs text-indigo-100 space-y-1">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Real Native Android Application (.apk)
            </p>
            <p className="text-[11px] text-indigo-200 leading-relaxed">
              Compiled with Java 21 &amp; Android SDK 36. Includes automatic microphone permissions, native alarms, background services, and offline caching. Download the .apk file and tap to install on any Android phone.
            </p>
          </div>
        </div>

        {/* Alternative 1-Tap Browser WebAPK */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
          <span className="text-indigo-200 text-[11px]">Or install as lightweight web app:</span>
          {isInstalled ? (
            <span className="text-emerald-300 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Installed
            </span>
          ) : isInstallable ? (
            <button
              onClick={install}
              className="text-xs text-white font-bold underline hover:text-indigo-200"
            >
              1-Tap Browser Install
            </button>
          ) : isIOS ? (
            <button
              onClick={() => setShowIosGuide(true)}
              className="text-xs text-white font-bold underline hover:text-indigo-200"
            >
              iPhone Guide
            </button>
          ) : (
            <span className="text-indigo-300 text-[11px]">Menu (⋮) &gt; Install App</span>
          )}
        </div>

        {showIosGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-slate-900 dark:bg-slate-900 dark:text-white space-y-3">
              <h3 className="text-base font-bold">Install on iPhone / iPad</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button at the bottom of Safari.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
                3. Tap <strong>Add</strong> in the top right.
              </p>
              <button
                onClick={() => setShowIosGuide(false)}
                className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 min-h-[44px]"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Automated Messages & System Notifications */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Automated Messages & Notifications
              </h3>
              <p className="text-xs text-slate-500">
                Pushes reminders to your phone when tasks are due
              </p>
            </div>
          </div>

          {notificationStatus === 'granted' ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Active
            </span>
          ) : (
            <button
              onClick={handleRequestNotifications}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition shadow-sm min-h-[40px]"
            >
              Enable Notifications
            </button>
          )}
        </div>

        {/* Task Due Notifications Toggle */}
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
              Automated Task Due Reminders
            </span>
            <span className="text-[11px] text-slate-500">
              Alerts you automatically with sound & notification when scheduled task times arrive
            </span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={taskAlertsEnabled}
              onChange={(e) => onToggleTaskAlerts(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
          </label>
        </div>
      </div>

      {/* 3. Scheduled AI Phone Calls Configuration */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Scheduled AI Phone Calls
              </h3>
              <p className="text-xs text-slate-500">
                In-app calls with optional background notifications
              </p>
            </div>
          </div>

          <button
            onClick={onTriggerTestCall}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm min-h-[40px]"
          >
            <Phone className="w-3.5 h-3.5 fill-current animate-bounce" />
            <span>Test Ring Now</span>
          </button>
        </div>

        {/* Alarms List */}
        <div className="space-y-2.5">
          {alarms.map((alarm) => (
            <div
              key={alarm.id}
              className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={alarm.time}
                  onChange={(e) => handleTimeChange(alarm.id, e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none min-h-[36px]"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    {alarm.label}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {alarm.enabled ? 'Active · Calls automatically' : 'Paused'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={alarm.enabled}
                    onChange={() => handleToggleAlarm(alarm.id, alarm.enabled)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                </label>

                <button
                  onClick={() => handleDeleteAlarm(alarm.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  title="Delete scheduled alarm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add New Scheduled Call */}
        <form onSubmit={handleAddAlarm} className="pt-2 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800/60">
          <input
            type="time"
            value={newAlarmTime}
            onChange={(e) => setNewAlarmTime(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none min-h-[44px]"
          />
          <input
            type="text"
            value={newAlarmLabel}
            onChange={(e) => setNewAlarmLabel(e.target.value)}
            placeholder="Label (e.g., Evening Recap)"
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none min-h-[44px]"
          />
          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1 transition shadow-sm min-h-[44px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Alarm</span>
          </button>
        </form>

        {/* Voice Selector & Local Offline Engine */}
        <div className="border-t border-slate-100 dark:border-slate-800/60 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
              AI Assistant Voice & Speech Engine
            </label>
            <span className="text-[11px] text-slate-500">
              {voiceName === 'Device-Local' ? '100% Offline (Zero Data)' : 'Studio Neural Voice'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {voiceOptions.map((v) => {
              const isSelected = voiceName === v.id;
              const isSpeakingThis = previewingVoiceId === v.id;

              return (
                <div
                  key={v.id}
                  onClick={() => onSelectVoice(v.id)}
                  className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                        {v.label.split('(')[0]}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        v.isOffline
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                      }`}>
                        {v.isOffline ? 'Offline' : 'Cloud'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {v.isOffline ? 'Uses installed browser voices' : 'Cloud speech with device fallback'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewVoice(v.id);
                    }}
                    title="Preview sample speech"
                    className={`p-2 rounded-xl transition min-h-[36px] min-w-[36px] flex items-center justify-center ${
                      isSpeakingThis
                        ? 'bg-indigo-600 text-white animate-pulse'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Volume2 className={`w-3.5 h-3.5 ${isSpeakingThis ? 'animate-bounce' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 pt-1 leading-relaxed">
            Selecting <strong className="text-slate-700 dark:text-slate-300">Native Device Engine</strong> speaks briefings completely offline without sending any audio or text requests to the network.
          </p>
        </div>

        {/* Haptic Feedback Patterns & Vibration Test */}
        <div className="border-t border-slate-100 dark:border-slate-800/60 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Vibrate className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                Haptic Feedback Patterns
              </label>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
              navigator.vibrate active
            </span>
          </div>

          <p className="text-[11px] text-slate-500">
            Tactile vibrations give physical confirmation for completing tasks and distinct ring cadences for incoming AI calls.
          </p>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => hapticService.taskComplete()}
              className="px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex flex-col items-center gap-1 transition active:scale-95"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Task Done</span>
            </button>

            <button
              type="button"
              onClick={() => {
                hapticService.startIncomingCallVibration();
                setTimeout(() => hapticService.stopIncomingCallVibration(), 3500);
              }}
              className="px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex flex-col items-center gap-1 transition active:scale-95"
            >
              <Phone className="w-3.5 h-3.5 text-indigo-500" />
              <span>Incoming Call</span>
            </button>

            <button
              type="button"
              onClick={() => hapticService.alarmAlert()}
              className="px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex flex-col items-center gap-1 transition active:scale-95"
            >
              <Bell className="w-3.5 h-3.5 text-amber-500" />
              <span>Alarm Alert</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. AI Assistant Engine & Cloud / Local AI Mode */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                AI Assistant Engine & Calling Mode
              </h3>
              <p className="text-xs text-slate-500">
                {hybridMode ? 'Cloud AI (Gemini Live API) with offline fallback' : 'Local AI Only mode enabled'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={!hybridMode}
              onChange={(e) => onToggleHybridMode(!e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
              Local AI Only Mode
            </span>
            <span className="text-[11px] text-slate-500">
              When switched on, all voice calls and chat stay 100% on this device. When switched off, calls use Google Gemini Live via cloud API with automatic offline fallback.
            </span>
          </div>
        </div>

        {/* Gemini API Key Configuration */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
              Gemini Live API Key (Google AI Studio)
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Get Free API Key ↗
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Paste your AIza... Gemini API key"
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={handleSaveApiKey}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition shadow-sm ${
                isApiKeySaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isApiKeySaved ? 'Saved ✓' : 'Save Key'}
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            Saved securely in your device's browser storage. Used for zero-latency, natural conversational Gemini 2.0 Flash voice calls.
          </p>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
              Optional On-Device WebGPU Model
            </span>
            <span className="text-[11px] text-slate-500">
              Download Google Gemma 2B or SmolLM to run on your phone GPU via WebLLM
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenGemmaModal}
            className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs transition shadow-sm"
          >
            Configure Local Gemma
          </button>
        </div>
      </div>

      {/* 5. Account & Firebase Sync */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Firebase Cloud Sync
              </h3>
              <p className="text-xs text-slate-500">
                {user ? `Connected: ${user.email}` : 'Signed out (data stored locally)'}
              </p>
            </div>
          </div>

          {user ? (
            <button
              onClick={onSignOut}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition min-h-[44px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              onClick={onSignIn}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm min-h-[44px]"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In with Google</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
