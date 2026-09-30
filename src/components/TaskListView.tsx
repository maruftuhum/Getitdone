import React, { useState } from 'react';
import { 
  Check, 
  Plus, 
  Calendar, 
  Clock, 
  MapPin, 
  AlertCircle, 
  Trash2, 
  Edit3, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Mic, 
  MicOff, 
  Sparkles,
  ListTodo
} from 'lucide-react';
import { Task, TaskCategory, TaskPriority } from '../types';
import { parseTaskLocally } from '../services/localNlpParser';
import { hapticService } from '../services/hapticService';

interface TaskListViewProps {
  tasks: Task[];
  onToggleTask: (taskId: string, currentCompleted: boolean) => void;
  onAddTask: (
    title: string,
    dueDate: string,
    dueTime?: string | null,
    priority?: TaskPriority,
    category?: TaskCategory,
    location?: string | null,
    description?: string
  ) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onDeleteTask: (taskId: string) => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  onToggleTask,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [isMicActive, setIsMicActive] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

  const todayIso = new Date().toISOString().split('T')[0];

  // Filter Tasks
  const filteredTasks = tasks.filter((task) => {
    // Category or View filter
    if (activeCategory === 'Today') {
      if (task.dueDate !== todayIso) return false;
    } else if (activeCategory === 'Upcoming') {
      if (task.dueDate <= todayIso || task.completed) return false;
    } else if (activeCategory === 'Completed') {
      if (!task.completed) return false;
    } else if (activeCategory !== 'All') {
      if (task.category !== activeCategory) return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description?.toLowerCase().includes(q);
      const matchLoc = task.location?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchLoc) return false;
    }

    return true;
  });

  const parsedPreview = quickInput.trim() ? parseTaskLocally(quickInput) : null;

  const handleQuickSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickInput.trim()) return;

    const parsed = parseTaskLocally(quickInput);
    onAddTask(
      parsed.title,
      parsed.dueDate,
      parsed.dueTime,
      parsed.priority,
      parsed.category,
      parsed.location
    );
    setQuickInput('');
  };

  const toggleMic = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setQuickInput('Voice recognition is not supported in this browser. Please type here.');
      return;
    }

    if (isMicActive) {
      setIsMicActive(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsMicActive(true);
      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((res: any) => res[0].transcript)
          .join('');
        setQuickInput(transcript);
      };
      recognition.onerror = () => setIsMicActive(false);
      recognition.onend = () => setIsMicActive(false);

      recognition.start();
    } catch (e) {
      console.error(e);
      setIsMicActive(false);
    }
  };

  // Categories list
  const categoryFilters = ['All', 'Today', 'Upcoming', 'Work', 'Personal', 'Urgent', 'Health', 'Errands', 'Completed'];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-4 pb-28 space-y-4">
      {/* Category Tabs (Google Tasks Filter Bar) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-medium">
        {categoryFilters.map((cat) => {
          const count = tasks.filter((t) => {
            if (cat === 'All') return true;
            if (cat === 'Today') return t.dueDate === todayIso && !t.completed;
            if (cat === 'Upcoming') return t.dueDate > todayIso && !t.completed;
            if (cat === 'Completed') return t.completed;
            return t.category === cat && !t.completed;
          }).length;

          const isActive = activeCategory === cat;

          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 touch-manipulation min-h-[44px] ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 font-semibold'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{cat}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                isActive ? 'bg-indigo-700/60 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tasks, notes, or locations..."
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      {/* Quick Add Task Input Card (Docked / Prominent) */}
      <form onSubmit={handleQuickSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Add task... (e.g., Team meeting tomorrow 2pm urgent)"
            className="flex-1 bg-transparent px-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />

          <button
            type="button"
            onClick={toggleMic}
            className={`p-2 rounded-xl transition min-h-[44px] min-w-[44px] flex items-center justify-center ${
              isMicActive
                ? 'bg-amber-500 text-white animate-pulse'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Dictate task with voice"
          >
            {isMicActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            type="submit"
            disabled={!quickInput.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm touch-manipulation min-h-[44px]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>

        {/* Real-time NLP parse feedback chip */}
        {parsedPreview && (
          <div className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[11px] text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
            <span className="truncate">
              Smart Extract: <strong>{parsedPreview.title}</strong> · {parsedPreview.dueDate} {parsedPreview.dueTime ? `at ${parsedPreview.dueTime}` : ''} {parsedPreview.location ? `· ${parsedPreview.location}` : ''} · [{parsedPreview.priority}]
            </span>
            <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 ml-2 shrink-0">
              Ready
            </span>
          </div>
        )}
      </form>

      {/* Task List */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-3xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
              <ListTodo className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {activeCategory === 'Completed' ? 'No completed tasks yet' : 'All caught up!'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              {activeCategory === 'Completed'
                ? 'Check off tasks as you finish them to see your progress.'
                : 'Type above or use the voice assistant to add your next task.'}
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isDueToday = task.dueDate === todayIso;
            const isOverdue = task.dueDate < todayIso && !task.completed;
            const hasSubtasks = task.subtasks && task.subtasks.length > 0;
            const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0;
            const isExpanded = !!expandedSubtasks[task.id];

            return (
              <div
                key={task.id}
                className={`group bg-white dark:bg-slate-900 border rounded-2xl p-3.5 transition-all shadow-sm ${
                  task.completed
                    ? 'border-slate-200 dark:border-slate-800 opacity-60'
                    : isOverdue
                    ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Circular Checkbox (Google Tasks Style) */}
                  <button
                    onClick={() => onToggleTask(task.id, task.completed)}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all touch-manipulation min-h-[44px] min-w-[44px] ${
                      task.completed
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-400 hover:border-indigo-600 dark:border-slate-600 text-transparent'
                    }`}
                    title={task.completed ? 'Mark pending' : 'Mark completed'}
                  >
                    <Check className={`w-3.5 h-3.5 stroke-[3] ${task.completed ? 'text-white' : 'opacity-0'}`} />
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium leading-snug break-words ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </span>

                      {/* Priority Flag */}
                      {task.priority === 'high' && (
                        <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                          High
                        </span>
                      )}
                    </div>

                    {/* Description Notes */}
                    {task.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata details: Date, Time, Location, Category (Zero-Pill discipline) */}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {/* Date */}
                      <span className={`inline-flex items-center gap-1 ${
                        isOverdue ? 'text-rose-600 font-semibold' : isDueToday ? 'text-indigo-600 dark:text-indigo-400 font-medium' : ''
                      }`}>
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{isDueToday ? 'Today' : task.dueDate}</span>
                      </span>

                      {/* Time */}
                      {task.dueTime && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{task.dueTime}</span>
                          </span>
                        </>
                      )}

                      {/* Location */}
                      {task.location && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="inline-flex items-center gap-1 truncate max-w-[120px]">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">{task.location}</span>
                          </span>
                        </>
                      )}

                      {/* Category */}
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-[11px] text-slate-400">{task.category}</span>
                    </div>

                    {/* Subtasks Progress / Expander */}
                    {hasSubtasks && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                        <button
                          onClick={() => setExpandedSubtasks((prev) => ({ ...prev, [task.id]: !isExpanded }))}
                          className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span>{completedSubtasks} of {task.subtasks?.length} subtasks done</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-2 pl-4 space-y-1.5 border-l-2 border-indigo-200 dark:border-indigo-900">
                            {task.subtasks?.map((sub) => (
                              <label key={sub.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={sub.completed}
                                  onChange={() => {
                                    if (!sub.completed) {
                                      hapticService.taskComplete();
                                    } else {
                                      hapticService.taskUncheck();
                                    }
                                    const updated = task.subtasks?.map((s) =>
                                      s.id === sub.id ? { ...s, completed: !s.completed } : s
                                    );
                                    onUpdateTask(task.id, { subtasks: updated });
                                  }}
                                  className="rounded text-indigo-600 focus:ring-0"
                                />
                                <span className={sub.completed ? 'line-through text-slate-400' : ''}>
                                  {sub.title}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions: Edit & Delete */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingTask(task)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Edit task"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteTask(task.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Edit Task</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Title</label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Notes / Details</label>
                <textarea
                  rows={2}
                  value={editingTask.description || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Optional details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500">Due Date</label>
                  <input
                    type="date"
                    value={editingTask.dueDate}
                    onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value })}
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Due Time</label>
                  <input
                    type="time"
                    value={editingTask.dueTime || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, dueTime: e.target.value || null })}
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-500">Category</label>
                  <select
                    value={editingTask.category}
                    onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value as TaskCategory })}
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="Personal">Personal</option>
                    <option value="Work">Work</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Health">Health</option>
                    <option value="Errands">Errands</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Priority</label>
                  <select
                    value={editingTask.priority}
                    onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as TaskPriority })}
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Location</label>
                <input
                  type="text"
                  value={editingTask.location || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, location: e.target.value || null })}
                  placeholder="e.g. Office, Home, Downtown"
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateTask(editingTask.id, editingTask);
                  setEditingTask(null);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
