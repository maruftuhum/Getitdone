import { useEffect, useState } from 'react';
import { signInWithGoogle, logOut } from './services/firebase';
import { localGemmaEngine } from './services/localGemmaEngine';
import { notificationService } from './services/notificationService';
import { hapticService } from './services/hapticService';
import { useTasks } from './hooks/useTasks';
import { useScopedState } from './hooks/useScopedState';
import { useReminders } from './hooks/useReminders';
import { useVoiceCall } from './hooks/useVoiceCall';
import { useBackgroundReminders } from './hooks/useBackgroundReminders';
import { executeTaskAction, taskFields } from './shared/taskActions';
import { Task, TaskCategory, TaskPriority, ScheduledCallAlarm, AutomatedMessage } from './types';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { TaskListView } from './components/TaskListView';
import { CalendarView } from './components/CalendarView';
import { ChatAssistantView } from './components/ChatAssistantView';
import { CallScheduleSettings } from './components/CallScheduleSettings';
import { AICallModal } from './components/AICallModal';
import { ChatHeadBubble } from './components/ChatHeadBubble';
import { AutomatedMessagesDrawer } from './components/AutomatedMessagesDrawer';
import { LocalGemmaModal } from './components/LocalGemmaModal';
import { audioService } from './services/audioService';
import { Phone, Sparkles, CheckCircle2, Clock, Calendar as CalendarIcon, Bell, Bot, Volume2, Sun, Moon, Sunrise, Flame, Check } from 'lucide-react';

const defaultAlarms: ScheduledCallAlarm[] = [
  { id: 'alarm-1', label: 'Morning Briefing Call', time: '09:00', enabled: true, callType: 'morning_brief' },
  { id: 'alarm-2', label: 'Afternoon Check-in', time: '14:00', enabled: false, callType: 'afternoon_check' },
  { id: 'alarm-3', label: 'Evening Recap Call', time: '20:00', enabled: true, callType: 'evening_recap' },
];

export default function App() {
  const store = useTasks();
  const { user, tasks, scope } = store;
  const isFirebaseConnected = !!user && !store.syncError && store.pendingCount === 0;
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(location.search).get('view') === 'call' ? 'call' : 'tasks');
  const [alarms, setAlarms] = useScopedState(scope, 'alarms', () => defaultAlarms);
  const [automatedMessages, setAutomatedMessages] = useScopedState<AutomatedMessage[]>(scope, 'messages', () => []);
  const [taskAlertsEnabled, setTaskAlertsEnabled] = useScopedState(scope, 'alerts', () => true);
  const [voiceName, setVoiceName] = useScopedState(scope, 'voice', () => 'Puck');
  const [hybridMode, setHybridMode] = useScopedState(scope, 'hybrid', () => true);
  const [isMessagesDrawerOpen, setIsMessagesDrawerOpen] = useState(false);
  const [isGemmaModalOpen, setIsGemmaModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [latestWorkUpdate, setLatestWorkUpdate] = useState('');
  const call = useVoiceCall(tasks, user?.displayName || 'there', hybridMode ? voiceName : 'Device-Local', scope);
  const { callState, triggerCall: handleTriggerCall, answerCall: handleAnswerCall, declineCall: handleDeclineCall, endCall: handleEndCall } = call;
  const background = useBackgroundReminders(user, alarms, taskAlertsEnabled, store.authReady);
  useEffect(() => { localStorage.setItem('getitdone_hybrid_mode', String(hybridMode)); }, [hybridMode]);
  useEffect(() => { setLatestWorkUpdate(''); setNotice(''); setIsMessagesDrawerOpen(false); setIsGemmaModalOpen(false); }, [scope]);

  const handleAddTask = (title: string, dueDate: string, dueTime?: string | null, priority: TaskPriority = 'medium', category: TaskCategory = 'General', location?: string | null, description = '') => {
    const parsed = taskFields.safeParse({ title, dueDate, dueTime: dueTime || null, priority, category, location: location || null, description });
    if (!parsed.success) { setNotice('Please enter a valid title, date, and time.'); return; }
    store.addTask(parsed.data); hapticService.taskCreate();
  };
  const handleUpdateTask = (id: string, updates: Partial<Task>) => {
    const current = tasks.find(t => t.id === id);
    if (!current || !taskFields.safeParse({ ...current, ...updates }).success) { setNotice('That task change is invalid.'); return; }
    store.updateTask(id, updates);
  };
  const handleCompleteTaskFromCall = (id: string) => {
    if (tasks.some(t => t.id === id && !t.completed)) { store.updateTask(id, { completed: true, completedAt: new Date().toISOString() }); hapticService.taskComplete(); }
  };
  const handleToggleTask = (id: string, completed: boolean) => {
    if (!tasks.some(t => t.id === id)) return;
    store.updateTask(id, { completed: !completed, completedAt: completed ? null : new Date().toISOString() });
    completed ? hapticService.taskUncheck() : hapticService.taskComplete();
  };
  const handleDeleteTask = (id: string) => { store.deleteTask(id); hapticService.taskDelete(); };
  const onAction = (input: unknown) => executeTaskAction(input, tasks, {
    add: t => handleAddTask(t.title, t.dueDate, t.dueTime, t.priority, t.category, t.location, t.description),
    update: handleUpdateTask, complete: handleCompleteTaskFromCall, delete: handleDeleteTask,
  });
  useReminders(scope, tasks, alarms, taskAlertsEnabled, event => {
    setAutomatedMessages(prev => [{ ...event, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false }, ...prev].slice(0, 500));
    if (!event.fromPush) notificationService.sendNotification(event.title, event.body, () => setActiveTab(event.type === 'call' ? 'call' : 'tasks'), event.id);
    if (event.type === 'call') {
      const alarm = alarms.find(a => a.id === event.alarmId);
      if (alarm) handleTriggerCall(alarm.label, alarm.callType);
    }
  }, store.authReady);
  useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (message.data?.type === 'open-reminder' && message.data.event?.uid === scope) setActiveTab(message.data.event.type === 'call' ? 'call' : 'tasks');
    };
    navigator.serviceWorker?.addEventListener('message', receive);
    return () => navigator.serviceWorker?.removeEventListener('message', receive);
  }, [scope]);
  useEffect(() => {
    const timer = setInterval(() => {
      const checkin = localGemmaEngine.generateProactiveCheckin(tasks);
      setLatestWorkUpdate(checkin.body);
    }, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [tasks, scope]);
  if (!store.authReady) return <div className="p-8 text-center">Loading your task workspace…</div>;
  const pendingCount = tasks.filter(t => !t.completed).length;
  const unreadMessagesCount = automatedMessages.filter(m => !m.read).length;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract (Wordmark, Status, CTA, Profile, Notifications) */}
      <TopBar
        user={user}
        onOpenSignIn={user ? logOut : signInWithGoogle}
        onTriggerTestCall={() => handleTriggerCall('Manual Briefing Call')}
        onOpenMessages={() => {
          setIsMessagesDrawerOpen(true);
          setAutomatedMessages((prev) => prev.map((m) => ({ ...m, read: true })));
        }}
        unreadMessagesCount={unreadMessagesCount}
        isFirebaseConnected={isFirebaseConnected}
        activeTab={activeTab}
      />

      {(notice || store.syncError) && <div role="status" className="max-w-4xl mx-auto p-3 text-sm text-amber-700">{notice || store.syncError}</div>}
      {store.guestCount > 0 && <div className="max-w-4xl mx-auto p-3 text-sm"><span>{store.guestCount} guest tasks are saved separately on this device. </span><button className="text-indigo-600" onClick={store.importGuestTasks}>Copy into this account</button></div>}
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-2 sm:px-4">
        {activeTab === 'tasks' && (
          <TaskListView
            tasks={tasks}
            onToggleTask={handleToggleTask}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            tasks={tasks}
            onToggleTask={handleToggleTask}
            onAddTask={(title, dueDate, dueTime, priority) =>
              handleAddTask(title, dueDate, dueTime, priority)
            }
          />
        )}

        {activeTab === 'call' && (() => {
          const hour = new Date().getHours();
          const firstName = user?.displayName ? user.displayName.split(' ')[0] : '';
          let timeGreeting = 'Hey there';
          if (hour < 12) timeGreeting = firstName ? `Good morning, ${firstName}` : 'Good morning';
          else if (hour < 17) timeGreeting = firstName ? `Good afternoon, ${firstName}` : 'Good afternoon';
          else if (hour < 21) timeGreeting = firstName ? `Good evening, ${firstName}` : 'Good evening';
          else timeGreeting = firstName ? `Good night, ${firstName}` : 'Good evening';

          const todayIso = new Date().toISOString().split('T')[0];
          const todayTasks = tasks.filter(t => !t.completed && t.dueDate === todayIso);
          const topTask = todayTasks.find(t => t.priority === 'high') || todayTasks[0];

          return (
            <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-28 space-y-6">
              {/* Hero Personal Assistant Card */}
              <div className="relative overflow-hidden bg-gradient-to-tr from-indigo-700 via-indigo-600 to-violet-800 text-white rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-600/30 space-y-5 border border-white/10">
                <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold backdrop-blur-md border border-white/20">
                    <Bot className="w-4 h-4 text-indigo-200" />
                    <span>Aria · Personal Assistant</span>
                  </div>
                  <span className="text-[11px] text-indigo-100 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Hands-Free Voice Active
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {timeGreeting}!
                  </h2>
                  <p className="text-sm text-indigo-100/90 mt-1 max-w-md leading-relaxed font-normal">
                    I'm right here to walk through your schedule, reschedule items, or organize new to-dos with you over a voice call.
                  </p>
                </div>

                {/* Main Call Action */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    onClick={() => handleTriggerCall('Personal Voice Briefing')}
                    className="w-full sm:flex-1 py-4 px-6 rounded-2xl bg-white hover:bg-indigo-50 active:scale-98 text-indigo-900 font-bold text-base shadow-xl shadow-indigo-950/20 transition-all flex items-center justify-center gap-3 min-h-[52px]"
                  >
                    <div className="relative">
                      <span className="absolute -inset-1 rounded-full bg-indigo-500/20 animate-ping" />
                      <Phone className="w-5 h-5 text-indigo-600 fill-current animate-bounce" />
                    </div>
                    <span>Talk with Aria</span>
                  </button>

                  <button
                    onClick={() => {
                      audioService.speakBriefing(
                        `Hey ${firstName || 'there'}! I'm Aria, your executive assistant. I'm ready to keep your schedule organized and make sure you get things done today.`,
                        voiceName
                      );
                    }}
                    title="Preview Voice"
                    className="w-full sm:w-auto py-3.5 px-4 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-98 text-white font-semibold text-xs backdrop-blur-md border border-white/15 transition flex items-center justify-center gap-2"
                  >
                    <Volume2 className="w-4 h-4 text-indigo-200" />
                    <span>Preview Voice</span>
                  </button>
                </div>

                {/* Quick Assistant Conversation Modes */}
                <div className="pt-2 border-t border-white/10">
                  <span className="text-[11px] font-semibold text-indigo-200 block mb-2">
                    Quick Call Topics:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleTriggerCall('Morning Briefing Call', 'morning_brief')}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Sunrise className="w-3.5 h-3.5 text-amber-300" />
                      <span>Morning Briefing</span>
                    </button>
                    <button
                      onClick={() => handleTriggerCall('Afternoon Check-in', 'afternoon_check')}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Sun className="w-3.5 h-3.5 text-yellow-300" />
                      <span>Afternoon Check</span>
                    </button>
                    <button
                      onClick={() => handleTriggerCall('Evening Recap Call', 'evening_recap')}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-medium flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Moon className="w-3.5 h-3.5 text-indigo-300" />
                      <span>Evening Recap</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Today's Focus Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span>Today's Primary Focus</span>
                  </h3>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {todayTasks.length} {todayTasks.length === 1 ? 'task' : 'tasks'} today
                  </span>
                </div>

                {topTask ? (
                  <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-white block">
                        {topTask.title}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {topTask.dueTime && (
                          <span className="flex items-center gap-1 font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                            <Clock className="w-3 h-3" />
                            {topTask.dueTime}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 font-medium text-[10px] border border-slate-200 dark:border-slate-700">
                          {topTask.category || 'Personal'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleTask(topTask.id, false)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Done</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center py-6">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      No pending tasks for today!
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Your schedule is clear. Call Aria anytime to add new tasks.
                    </p>
                  </div>
                )}
              </div>

              {/* Scheduled Daily Calls */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Daily Assistant Check-in Calls</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Device Timezone
                  </span>
                </div>

                <div className="space-y-2.5">
                  {alarms.map((alarm) => (
                    <div
                      key={alarm.id}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                          {alarm.time}
                        </span>
                        <div>
                          <span className="text-slate-800 dark:text-slate-200 font-semibold block">
                            {alarm.label}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {alarm.callType === 'morning_brief' ? 'Morning planning' : alarm.callType === 'afternoon_check' ? 'Mid-day check' : 'Evening review'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...a, enabled: !a.enabled } : a));
                          hapticService.lightTap();
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition active:scale-95 ${
                          alarm.enabled
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        }`}
                      >
                        {alarm.enabled ? 'Active' : 'Off'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'chat' && (
          <ChatAssistantView
            key={scope}
            tasks={tasks}
            onAction={onAction}
            hybridMode={hybridMode}
            onTriggerCall={() => handleTriggerCall('Chat Triggered Call')}
          />
        )}

        {activeTab === 'settings' && (
          <CallScheduleSettings
            user={user}
            onSignIn={signInWithGoogle}
            onSignOut={logOut}
            onTriggerTestCall={() => handleTriggerCall('Test Call Alarm')}
            alarms={alarms}
            onUpdateAlarms={setAlarms}
            taskAlertsEnabled={taskAlertsEnabled}
            onToggleTaskAlerts={(val) => {
              setTaskAlertsEnabled(val);
              localStorage.setItem('getitdone_task_alerts', String(val));
            }}
            voiceName={voiceName}
            onSelectVoice={(v) => {
              setVoiceName(v);
              localStorage.setItem('getitdone_voice', v);
            }}
            hybridMode={hybridMode}
            onToggleHybridMode={(val) => {
              setHybridMode(val);
              localStorage.setItem('getitdone_hybrid_mode', String(val));
            }}
            onOpenGemmaModal={() => setIsGemmaModalOpen(true)}
            backgroundStatus={background.status}
            backgroundEnabled={background.enabled}
            onEnableBackground={background.enable}
            onDisableBackground={background.disable}
          />
        )}
      </main>

      {/* Floating Messenger-Style Chat Head Bubble */}
      <ChatHeadBubble
        tasks={tasks}
        onAction={onAction}
        onTriggerCall={() => handleTriggerCall('Chat Head Call')}
        latestWorkUpdate={latestWorkUpdate}
        key={scope}
        hybridMode={hybridMode}
      />

      {/* Full Simulated Phone Call Modal */}
      {callState !== 'idle' && (
        <AICallModal
          callState={callState}
          callType={call.callType}
          onAnswerCall={handleAnswerCall}
          onDeclineCall={handleDeclineCall}
          onEndCall={handleEndCall}
          tasks={tasks}
          userName={user?.displayName || 'Friend'}
          onCompleteTask={handleCompleteTaskFromCall}
          onAddTask={(title, dueDate, dueTime, priority, category, location) =>
            handleAddTask(title, dueDate, dueTime, priority, category, location)
          }
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          voiceName={hybridMode ? voiceName : 'Device-Local'}
          hybridMode={hybridMode}
          onAction={onAction}
        />
      )}

      {/* Automated Messages Drawer */}
      <AutomatedMessagesDrawer
        isOpen={isMessagesDrawerOpen}
        onClose={() => setIsMessagesDrawerOpen(false)}
        messages={automatedMessages}
        onClearMessages={() => setAutomatedMessages([])}
        onTriggerCall={() => handleTriggerCall('Messages Triggered Call')}
        onCompleteTask={handleCompleteTaskFromCall}
      />

      {/* Local Gemma 4B Setup Modal */}
      <LocalGemmaModal
        isOpen={isGemmaModalOpen}
        onClose={() => setIsGemmaModalOpen(false)}
      />

      {/* Fixed Bottom Navigation (Thumb-Zone) */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingCount}
      />
    </div>
  );
}
