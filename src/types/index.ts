export type TaskCategory = string;
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string | null; // HH:mm
  location?: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  completed: boolean;
  completedAt?: string | null;
  subtasks?: Subtask[];
  createdAt: string;
  updatedAt: string;
}

export type CallType = 'morning_brief' | 'afternoon_check' | 'evening_recap' | 'custom_alarm';

export interface ScheduledCallAlarm {
  id: string;
  label: string;
  time: string; // HH:mm
  enabled: boolean;
  callType: CallType;
}

export interface AutomatedMessage {
  id: string;
  type: 'reminder' | 'call' | 'briefing' | 'urgent';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  taskId?: string;
}

export interface CallSchedule {
  id: string;
  userId: string;
  scheduledTime: string; // HH:mm (e.g., "09:00")
  enabled: boolean;
  callType: CallType;
  lastCallDate?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  action?: import('../shared/taskActions').TaskAction | null;
}

export type ActiveCallState = 'idle' | 'ringing' | 'connected' | 'ended';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  morningBriefingTime: string;
  autoCallEnabled: boolean;
  voiceName: string;
  hybridAiMode: boolean;
}
