import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  auth, 
  signInWithGoogle, 
  logOut, 
  subscribeToUserTasks, 
  saveTaskToFirestore, 
  updateTaskInFirestore, 
  deleteTaskFromFirestore
} from './services/firebase';
import { localGemmaEngine } from './services/localGemmaEngine';
import { Task, ActiveCallState, TaskCategory, TaskPriority, ScheduledCallAlarm, AutomatedMessage } from './types';
import { audioService } from './services/audioService';
import { voiceCallService } from './services/voiceCallService';
import { notificationService } from './services/notificationService';
import { hapticService } from './services/hapticService';
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

const getInitialTasks = (): Task[] => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return [
    {
      id: 'task-1',
      userId: 'local-user',
      title: 'Review quarterly product milestones',
      description: 'Check team backlog and confirm deliverable deadlines.',
      dueDate: today,
      dueTime: '10:00',
      location: 'Conference Room B',
      category: 'Work',
      priority: 'high',
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subtasks: [
        { id: 'sub-1', title: 'Prepare slide deck', completed: true },
        { id: 'sub-2', title: 'Confirm budget alignment', completed: false },
      ],
    },
    {
      id: 'task-2',
      userId: 'local-user',
      title: 'Pick up groceries at Green Supermarket',
      description: 'Almond milk, whole wheat bread, fresh apples, olive oil.',
      dueDate: today,
      dueTime: '17:30',
      location: 'Green Supermarket',
      category: 'Errands',
      priority: 'medium',
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'task-3',
      userId: 'local-user',
      title: 'Evening gym cardio session',
      description: '30 mins treadmill interval running + stretch routine.',
      dueDate: today,
      dueTime: '19:00',
      location: 'Fitness Center',
      category: 'Health',
      priority: 'low',
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'task-4',
      userId: 'local-user',
      title: 'Dentist routine checkup',
      description: 'Annual cleaning and check dental x-ray records.',
      dueDate: tomorrow,
      dueTime: '14:30',
      location: 'Downtown Dental Clinic',
      category: 'Health',
      priority: 'high',
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
};

const defaultAlarms: ScheduledCallAlarm[] = [
  { id: 'alarm-1', label: 'Morning Briefing Call', time: '09:00', enabled: true, callType: 'morning_brief' },
  { id: 'alarm-2', label: 'Afternoon Check-in', time: '14:00', enabled: false, callType: 'afternoon_check' },
  { id: 'alarm-3', label: 'Evening Recap Call', time: '20:00', enabled: true, callType: 'evening_recap' },
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('tasks');
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem('getitdone_tasks');
      return saved ? JSON.parse(saved) : getInitialTasks();
    } catch {
      return getInitialTasks();
    }
  });

  // Scheduled Call Alarms
  const [alarms, setAlarms] = useState<ScheduledCallAlarm[]>(() => {
    try {
      const saved = localStorage.getItem('getitdone_call_alarms');
      return saved ? JSON.parse(saved) : defaultAlarms;
    } catch {
      return defaultAlarms;
    }
  });

  // Automated Messages
  const [automatedMessages, setAutomatedMessages] = useState<AutomatedMessage[]>(() => {
    try {
      const saved = localStorage.getItem('getitdone_auto_messages');
      return saved ? JSON.parse(saved) : [
        {
          id: 'welcome-msg',
          type: 'briefing',
          title: 'Welcome to Get It Done',
          body: 'Your AI assistant is active and ready to keep you updated on all your daily tasks.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read: false,
        }
      ];
    } catch {
      return [];
    }
  });
  const [isMessagesDrawerOpen, setIsMessagesDrawerOpen] = useState(false);
  const [isGemmaModalOpen, setIsGemmaModalOpen] = useState(false);

  // Settings
  const [taskAlertsEnabled, setTaskAlertsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('getitdone_task_alerts') !== 'false';
  });
  const [voiceName, setVoiceName] = useState<string>(() => {
    return localStorage.getItem('getitdone_voice') || 'Puck';
  });
  const [hybridMode, setHybridMode] = useState<boolean>(() => {
    return localStorage.getItem('getitdone_hybrid_mode') !== 'false';
  });

  // Call & AI Briefing State
  const [callState, setCallState] = useState<ActiveCallState>('idle');
  const [activeAlarmLabel, setActiveAlarmLabel] = useState<string>('Daily Briefing');
  const [latestWorkUpdate, setLatestWorkUpdate] = useState<string>('');

  const lastCheckedMinute = useRef<string>('');
  const notifiedTasksRef = useRef<Set<string>>(new Set());
  const lastProactiveCheckRef = useRef<number>(Date.now());

  // Local persistence
  useEffect(() => {
    try {
      localStorage.setItem('getitdone_tasks', JSON.stringify(tasks));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem('getitdone_call_alarms', JSON.stringify(alarms));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, [alarms]);

  useEffect(() => {
    try {
      localStorage.setItem('getitdone_auto_messages', JSON.stringify(automatedMessages));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, [automatedMessages]);

  // Boot: Listen to Auth state
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsFirebaseConnected(!!firebaseUser);
    });

    return () => unsubAuth();
  }, []);

  // Listen to Firestore tasks if authenticated
  useEffect(() => {
    if (!user) return;

    const unsub = subscribeToUserTasks(
      user.uid,
      (cloudTasks) => {
        if (cloudTasks.length > 0) {
          setTasks(cloudTasks);
        } else {
          tasks.forEach((t) => {
            saveTaskToFirestore({ ...t, userId: user.uid });
          });
        }
      },
      (err) => {
        console.warn('Firestore subscription notice, fallback to local:', err);
      }
    );

    return () => unsub();
  }, [user]);

  // Automated Alarm Scheduler & Due Task Watcher
  useEffect(() => {
    const runSchedulerCheck = () => {
      const now = new Date();
      const currentHhMm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const todayIso = now.toISOString().split('T')[0];

      // 1. Check Scheduled Call Alarms
      if (callState === 'idle') {
        // Pre-warm & load speech 1 minute before scheduled alarm
        const nextMin = new Date(now.getTime() + 60 * 1000);
        const nextMinHhMm = `${String(nextMin.getHours()).padStart(2, '0')}:${String(nextMin.getMinutes()).padStart(2, '0')}`;
        const upcomingAlarm = alarms.find((a) => a.enabled && a.time === nextMinHhMm);
        if (upcomingAlarm) {
          voiceCallService.prepareCall(tasks, user?.displayName || 'there', voiceName);
        }

        if (lastCheckedMinute.current !== currentHhMm) {
          const matchingAlarm = alarms.find((a) => a.enabled && a.time === currentHhMm);
          if (matchingAlarm) {
            lastCheckedMinute.current = currentHhMm;
            setActiveAlarmLabel(matchingAlarm.label);

            // Automated System Message
            const newMsg: AutomatedMessage = {
              id: `call-${Date.now()}`,
              type: 'call',
              title: `Incoming Call: ${matchingAlarm.label}`,
              body: `Scheduled briefing call triggered at ${matchingAlarm.time}. Ringing your phone...`,
              timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              read: false,
            };
            setAutomatedMessages((prev) => [newMsg, ...prev]);

            // Push Notification
            notificationService.sendNotification(
              `📞 AI Call: ${matchingAlarm.label}`,
              `Your daily task briefing is calling you. Tap to answer.`,
              () => handleTriggerCall(matchingAlarm.label)
            );

            // Trigger simulated incoming phone call
            handleTriggerCall(matchingAlarm.label);
            return;
          }
        }
      }

      // 2. Check Due Tasks (Automated Reminders)
      if (taskAlertsEnabled) {
        tasks.forEach((task) => {
          if (!task.completed && task.dueDate === todayIso && task.dueTime === currentHhMm) {
            const key = `${task.id}-${todayIso}-${currentHhMm}`;
            if (!notifiedTasksRef.current.has(key)) {
              notifiedTasksRef.current.add(key);

              // Automated Message
              const autoRem: AutomatedMessage = {
                id: `task-rem-${Date.now()}-${task.id}`,
                type: task.priority === 'high' ? 'urgent' : 'reminder',
                title: `Task Due: ${task.title}`,
                body: `Scheduled for ${task.dueTime}${task.location ? ` at ${task.location}` : ''}. Time to get it done!`,
                timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                read: false,
                taskId: task.id,
              };
              setAutomatedMessages((prev) => [autoRem, ...prev]);

              // Push Notification
              notificationService.sendNotification(
                `⏰ Task Due: ${task.title}`,
                `Scheduled for ${task.dueTime}. Tap to complete.`,
                () => setActiveTab('tasks')
              );
            }
          }
        });
      }

      // 3. Proactive Assistant Work Update (Time to time check-in)
      const nowMs = Date.now();
      if (nowMs - lastProactiveCheckRef.current > 30 * 60 * 1000) {
        lastProactiveCheckRef.current = nowMs;
        const checkin = localGemmaEngine.generateProactiveCheckin(tasks);
        setLatestWorkUpdate(checkin.body);
        notificationService.sendNotification(`🤖 ${checkin.title}`, checkin.body);

        setAutomatedMessages((prev) => [
          {
            id: `proactive-${nowMs}`,
            type: checkin.type,
            title: checkin.title,
            body: checkin.body,
            timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: false,
          },
          ...prev,
        ]);
      }
    };

    const interval = setInterval(runSchedulerCheck, 12000);
    return () => clearInterval(interval);
  }, [alarms, tasks, callState, taskAlertsEnabled]);

  // Call Handlers
  const handleTriggerCall = (label = 'AI Call Briefing') => {
    setActiveAlarmLabel(label);
    setCallState('ringing');
    audioService.startIncomingRingtone();
    hapticService.startIncomingCallVibration();
    // Proactively pre-process and load what GID will say right as the phone begins ringing
    voiceCallService.prepareCall(tasks, user?.displayName || 'there', voiceName);
  };

  const handleAnswerCall = () => {
    audioService.stopIncomingRingtone();
    audioService.playConnectChime();
    hapticService.callAnswer();
    setCallState('connected');
  };

  const handleDeclineCall = () => {
    audioService.stopIncomingRingtone();
    voiceCallService.clear();
    hapticService.callEnd();
    setCallState('idle');
  };

  const handleEndCall = () => {
    audioService.stopSpeaking();
    audioService.playDisconnectTone();
    voiceCallService.clear();
    hapticService.callEnd();
    setCallState('idle');
  };

  // Task Mutators
  const handleToggleTask = (taskId: string, currentCompleted: boolean) => {
    // Distinct light vibration feedback on completion / uncheck
    if (!currentCompleted) {
      hapticService.taskComplete();
    } else {
      hapticService.taskUncheck();
    }

    const updated = tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            completed: !currentCompleted,
            completedAt: !currentCompleted ? new Date().toISOString() : null,
            updatedAt: new Date().toISOString(),
          }
        : t
    );
    setTasks(updated);

    if (user) {
      updateTaskInFirestore(taskId, {
        completed: !currentCompleted,
        completedAt: !currentCompleted ? new Date().toISOString() : null,
      });
    }
  };

  const handleAddTask = (
    title: string,
    dueDate: string,
    dueTime?: string | null,
    priority: TaskPriority = 'medium',
    category: TaskCategory = 'Personal',
    location?: string | null,
    description?: string
  ) => {
    hapticService.taskCreate();

    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: user?.uid || 'local-user',
      title,
      description: description || '',
      dueDate,
      dueTime: dueTime || null,
      location: location || null,
      category,
      priority,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTasks((prev) => [newTask, ...prev]);

    if (user) {
      saveTaskToFirestore(newTask);
    }
  };

  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t))
    );

    if (user) {
      updateTaskInFirestore(taskId, updates);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    hapticService.taskDelete();

    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    if (user) {
      deleteTaskFromFirestore(taskId);
    }
  };

  const handleCompleteTaskFromCall = (taskId: string) => {
    handleToggleTask(taskId, false);
  };

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const unreadMessagesCount = automatedMessages.filter((m) => !m.read).length;

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
                  Your AI assistant rings your phone with an incoming call at your scheduled times, reads your agenda out loud, and lets you speak commands hands-free.
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
                  Next: {alarms.find((a) => a.enabled)?.time || 'None'}
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
            tasks={tasks}
            onAddTask={handleAddTask}
            onCompleteTask={handleCompleteTaskFromCall}
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
          />
        )}
      </main>

      {/* Floating Messenger-Style Chat Head Bubble */}
      <ChatHeadBubble
        tasks={tasks}
        onAddTask={handleAddTask}
        onTriggerCall={() => handleTriggerCall('Chat Head Call')}
        latestWorkUpdate={latestWorkUpdate}
        useLocalGemma={true}
      />

      {/* Full Simulated Phone Call Modal */}
      <AICallModal
        callState={callState}
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
        voiceName={voiceName}
      />

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
