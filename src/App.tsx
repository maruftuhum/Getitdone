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
import { Phone, Sparkles, CheckCircle2, Clock, Calendar as CalendarIcon, Bell } from 'lucide-react';

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

        {activeTab === 'call' && (
          <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-28 space-y-6">
            <div className="bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-800 text-white rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-md">
                  Simulated Voice Assistant
                </span>
                <span className="text-xs text-indigo-100 font-mono">
                  Autonomous Phone Caller
                </span>
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight">AI Voice Call Briefings</h2>
                <p className="text-xs text-indigo-100 mt-1 max-w-md leading-relaxed">
                  Scheduled briefings ring while the app is open. Enable background alerts in Settings to receive notifications when it is closed. Open an alert to start a hands-free briefing.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleTriggerCall('Instant Voice Briefing')}
                  className="w-full py-3.5 px-6 rounded-2xl bg-white text-indigo-900 font-bold text-sm shadow-lg hover:bg-indigo-50 active:scale-98 transition flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <Phone className="w-4 h-4 fill-current animate-bounce text-indigo-600" />
                  <span>Call Me Now (Simulate Call)</span>
                </button>
              </div>
            </div>

            {/* Quick Status Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Pending Tasks</span>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {pendingCount}
                </p>
                <span className="text-[11px] text-slate-400 mt-1 block">Ready for briefing</span>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Active Call Alarms</span>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                  {alarms.filter((a) => a.enabled).length} Active
                </p>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Times follow your device timezone.
                </span>
              </div>
            </div>

            {/* Active Alarms Preview List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Scheduled Calling Times</span>
              </h3>

              <div className="space-y-2">
                {alarms.map((alarm) => (
                  <div
                    key={alarm.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {alarm.time}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">
                        {alarm.label}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      alarm.enabled
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}>
                      {alarm.enabled ? 'Calls Automatically' : 'Off'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
