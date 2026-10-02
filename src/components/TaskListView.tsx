import { localDate } from '../shared/dates';
import React, { useState, useMemo } from 'react';
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
  ListTodo,
  Tag,
  X
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

const STORAGE_TAGS_KEY = 'getitdone_custom_tags';
const legacyPresets = new Set(['work', 'personal', 'urgent', 'health', 'errands', 'general']);

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

  // Custom Tags State
  const [customTags, setCustomTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TAGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((t: any) => typeof t === 'string' && t.trim() && !legacyPresets.has(t.trim().toLowerCase()));
        }
      }
    } catch {}
    return [];
  });

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [selectedQuickTag, setSelectedQuickTag] = useState<string>('General');
  const [isCreatingModalTag, setIsCreatingModalTag] = useState(false);
  const [newModalTagName, setNewModalTagName] = useState('');

  const todayIso = localDate();

  // Combine user-created tags with any non-preset tags already present on tasks
  const allTags = useMemo(() => {
    const set = new Set<string>(customTags);
    tasks.forEach((t) => {
      const cat = (t.category || '').trim();
      if (cat && !legacyPresets.has(cat.toLowerCase())) {
        set.add(cat);
      }
    });
    return Array.from(set);
  }, [customTags, tasks]);

  const saveCustomTags = (newTags: string[]) => {
    setCustomTags(newTags);
    try {
      localStorage.setItem(STORAGE_TAGS_KEY, JSON.stringify(newTags));
    } catch {}
  };

  const handleCreateTag = (name: string) => {
    const cleaned = name.trim().replace(/^#/, '');
    if (!cleaned || legacyPresets.has(cleaned.toLowerCase())) return;
    if (!allTags.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      const updated = [...allTags, cleaned];
      saveCustomTags(updated);
    }
  };

  const handleDeleteTag = (tagToDelete: string) => {
    const updated = customTags.filter((t) => t.toLowerCase() !== tagToDelete.toLowerCase());
    saveCustomTags(updated);
    if (activeCategory.toLowerCase() === tagToDelete.toLowerCase()) {
      setActiveCategory('All');
    }
    if (selectedQuickTag.toLowerCase() === tagToDelete.toLowerCase()) {
      setSelectedQuickTag('General');
    }
  };

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
      const taskCat = (task.category || '').toLowerCase();
      if (taskCat !== activeCategory.toLowerCase()) return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description?.toLowerCase().includes(q);
      const matchLoc = task.location?.toLowerCase().includes(q);
      const matchCat = (task.category || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchLoc && !matchCat) return false;
    }

    return true;
  });

  const parsedPreview = quickInput.trim() ? parseTaskLocally(quickInput) : null;

  const handleQuickSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickInput.trim()) return;

    const parsed = parseTaskLocally(quickInput);

    let finalCategory = 'General';
    if (parsed.category && parsed.category !== 'General') {
      finalCategory = parsed.category;
      handleCreateTag(finalCategory);
    } else if (selectedQuickTag !== 'General') {
      finalCategory = selectedQuickTag;
    } else if (allTags.some((t) => t.toLowerCase() === activeCategory.toLowerCase())) {
      finalCategory = activeCategory;
    }

    onAddTask(
      parsed.title,
      parsed.dueDate,
      parsed.dueTime,
      parsed.priority,
      finalCategory,
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

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-4 pb-28 space-y-4">
      {/* Category & Custom Tags Bar (Google Tasks Filter Bar) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-medium">
        {/* Core System Views */}
        {[
          { id: 'All', label: 'All' },
          { id: 'Today', label: 'Today' },
          { id: 'Upcoming', label: 'Upcoming' },
          { id: 'Completed', label: 'Completed' },
        ].map((view) => {
          const count = tasks.filter((t) => {
            if (view.id === 'All') return true;
            if (view.id === 'Today') return t.dueDate === todayIso && !t.completed;
            if (view.id === 'Upcoming') return t.dueDate > todayIso && !t.completed;
            if (view.id === 'Completed') return t.completed;
            return false;
          }).length;

          const isActive = activeCategory === view.id;

          return (
            <button
              key={view.id}
              onClick={() => setActiveCategory(view.id)}
              className={`px-3 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 touch-manipulation min-h-[44px] ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 font-semibold'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{view.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-indigo-700/60 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Separator */}
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 my-auto shrink-0 mx-0.5" />

        {/* User-Defined Custom Tags */}
        {allTags.map((tag) => {
          const count = tasks.filter((t) => (t.category || '').toLowerCase() === tag.toLowerCase() && !t.completed).length;
          const isActive = activeCategory.toLowerCase() === tag.toLowerCase();

          return (
            <div
              key={tag}
              className={`group/tag rounded-xl whitespace-nowrap transition-all flex items-center touch-manipulation min-h-[44px] pl-3 pr-2 py-1.5 gap-1.5 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 font-semibold'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveCategory(tag)}
                className="flex items-center gap-1.5 text-left focus:outline-none"
              >
                <Tag className={`w-3 h-3 ${isActive ? 'text-indigo-200' : 'text-indigo-500'}`} />
                <span>#{tag}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-indigo-700/60 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTag(tag);
                }}
                className={`p-1 rounded-md transition ${
                  isActive
                    ? 'hover:bg-indigo-700/80 text-indigo-200 hover:text-white'
                    : 'text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={`Delete tag #${tag}`}
                aria-label={`Delete tag ${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Add Tag Button or Inline Input */}
        {isAddingTag ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = newTagInput.trim().replace(/^#/, '');
              if (val) {
                handleCreateTag(val);
                setActiveCategory(val);
                setNewTagInput('');
                setIsAddingTag(false);
              }
            }}
            className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-indigo-500 rounded-xl px-2.5 py-1 shrink-0 shadow-sm min-h-[44px]"
          >
            <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <input
              type="text"
              autoFocus
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              placeholder="Tag name..."
              className="w-24 bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsAddingTag(false);
                  setNewTagInput('');
                }
              }}
            />
            <button
              type="submit"
              disabled={!newTagInput.trim()}
              className="p-1.5 rounded-lg bg-indigo-600 disabled:opacity-40 text-white hover:bg-indigo-700 transition"
              title="Add tag"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingTag(false);
                setNewTagInput('');
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingTag(true)}
            className="px-3 py-2 rounded-xl whitespace-nowrap border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all flex items-center gap-1 touch-manipulation min-h-[44px] text-xs font-medium"
            title="Create your own tag"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tag</span>
          </button>
        )}
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
            placeholder="Add task... (e.g. Prepare presentation tomorrow 2pm #project)"
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

        {/* Quick Tag Selector */}
        <div className="flex items-center gap-1.5 px-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] overflow-x-auto no-scrollbar">
          <span className="text-slate-400 flex items-center gap-1 shrink-0 font-medium">
            <Tag className="w-3 h-3" /> Tag:
          </span>
          <button
            type="button"
            onClick={() => setSelectedQuickTag('General')}
            className={`px-2 py-0.5 rounded-lg border text-[11px] transition whitespace-nowrap ${
              selectedQuickTag === 'General'
                ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 border-transparent font-medium shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            None
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedQuickTag(tag)}
              className={`px-2 py-0.5 rounded-lg border text-[11px] transition whitespace-nowrap ${
                selectedQuickTag.toLowerCase() === tag.toLowerCase()
                  ? 'bg-indigo-600 text-white border-transparent font-medium shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              #{tag}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsAddingTag(true)}
            className="text-indigo-600 dark:text-indigo-400 hover:underline px-1.5 py-0.5 flex items-center gap-0.5 shrink-0"
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>

        {/* Real-time NLP parse feedback chip */}
        {parsedPreview && (
          <div className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[11px] text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
            <span className="truncate">
              Smart Extract: <strong>{parsedPreview.title}</strong> · {parsedPreview.dueDate} {parsedPreview.dueTime ? `at ${parsedPreview.dueTime}` : ''} {parsedPreview.location ? `· ${parsedPreview.location}` : ''} {parsedPreview.category && parsedPreview.category !== 'General' ? `· #${parsedPreview.category}` : ''} · [{parsedPreview.priority}]
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
                    ? 'border-slate-100 dark:border-slate-800/60 opacity-60'
                    : isOverdue
                    ? 'border-red-200 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Custom Checkbox Button */}
                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id, task.completed)}
                    className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition touch-manipulation min-w-[24px] ${
                      task.completed
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'border-2 border-slate-300 dark:border-slate-600 hover:border-indigo-600 text-transparent'
                    }`}
                    aria-label={task.completed ? 'Mark incomplete' : 'Mark completed'}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        onClick={() => setEditingTask(task)}
                        className={`text-sm font-semibold truncate cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                        title="Click to edit task"
                      >
                        {task.title}
                      </h4>

                      {/* Action buttons (Edit, Delete) */}
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTask(task);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="Edit Task"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTask(task.id);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                          title="Delete Task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p 
                        onClick={() => setEditingTask(task)}
                        className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                        title="Click to edit task"
                      >
                        {task.description}
                      </p>
                    )}

                    {/* Metadata Badges & Custom Tag */}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                      {/* Due Date & Time */}
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          isOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : isDueToday
                            ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {isDueToday ? 'Today' : task.dueDate}
                          {task.dueTime ? ` at ${task.dueTime}` : ''}
                        </span>
                      </span>

                      {/* Priority */}
                      {task.priority === 'high' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                          <AlertCircle className="w-3 h-3" />
                          <span>High</span>
                        </span>
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

                      {/* User Custom Tag */}
                      {task.category && task.category !== 'General' && !legacyPresets.has(task.category.toLowerCase()) && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCategory(task.category);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition"
                            title={`Filter by tag #${task.category}`}
                          >
                            <Tag className="w-2.5 h-2.5" />
                            <span>#{task.category}</span>
                          </button>
                        </>
                      )}
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
                                    const updated = (task.subtasks || []).map((s) =>
                                      s.id === sub.id ? { ...s, completed: !s.completed } : s
                                    );
                                    onUpdateTask(task.id, { subtasks: updated });
                                  }}
                                  className="w-3.5 h-3.5 rounded text-indigo-600"
                                />
                                <span className={sub.completed ? 'line-through text-slate-400' : ''}>{sub.title}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-indigo-600" />
                <span>Edit Task</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Title</label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500">Description</label>
                <textarea
                  rows={2}
                  value={editingTask.description || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-500">Tag</label>
                    {!isCreatingModalTag && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingModalTag(true)}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" /> New
                      </button>
                    )}
                  </div>
                  {isCreatingModalTag ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="text"
                        autoFocus
                        value={newModalTagName}
                        onChange={(e) => setNewModalTagName(e.target.value)}
                        placeholder="Tag name..."
                        className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const tag = newModalTagName.trim().replace(/^#/, '');
                            if (tag) {
                              handleCreateTag(tag);
                              setEditingTask({ ...editingTask, category: tag });
                              setNewModalTagName('');
                              setIsCreatingModalTag(false);
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const tag = newModalTagName.trim().replace(/^#/, '');
                          if (tag) {
                            handleCreateTag(tag);
                            setEditingTask({ ...editingTask, category: tag });
                            setNewModalTagName('');
                          }
                          setIsCreatingModalTag(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewModalTagName('');
                          setIsCreatingModalTag(false);
                        }}
                        className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editingTask.category && !legacyPresets.has(editingTask.category.toLowerCase()) ? editingTask.category : 'General'}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCreatingModalTag(true);
                        } else {
                          setEditingTask({ ...editingTask, category: e.target.value });
                        }
                      }}
                      className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                    >
                      <option value="General">No Tag</option>
                      {allTags.map((tag) => (
                        <option key={tag} value={tag}>#{tag}</option>
                      ))}
                      <option value="__NEW__">+ Create new tag...</option>
                    </select>
                  )}
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
