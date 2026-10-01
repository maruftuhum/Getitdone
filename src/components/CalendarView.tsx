import { localDate } from '../shared/dates';
import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  Check, 
  MapPin, 
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { Task, TaskPriority } from '../types';

interface CalendarViewProps {
  tasks: Task[];
  onToggleTask: (taskId: string, currentCompleted: boolean) => void;
  onAddTask: (title: string, dueDate: string, dueTime?: string | null, priority?: TaskPriority) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  onToggleTask,
  onAddTask,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateIso, setSelectedDateIso] = useState(
    localDate()
  );
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('09:00');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // First day of month & total days
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDateIso(localDate(now));
  };

  const handleDateClick = (day: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    setSelectedDateIso(`${year}-${m}-${d}`);
  };

  const handleQuickSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleTitle.trim()) return;
    onAddTask(newScheduleTitle.trim(), selectedDateIso, newScheduleTime, 'medium');
    setNewScheduleTitle('');
  };

  // Selected date tasks
  const selectedDateTasks = tasks.filter((t) => t.dueDate === selectedDateIso);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-4 pb-28 space-y-6">
      {/* Calendar Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
              <span>{monthNames[month]} {year}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select any date to view and organize time slots
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToday}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
            >
              Today
            </button>
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-400 dark:text-slate-500 py-1">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Month Day Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty prefix cells */}
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="h-10 sm:h-12 rounded-xl bg-transparent" />
          ))}

          {/* Month Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const m = String(month + 1).padStart(2, '0');
            const d = String(dayNum).padStart(2, '0');
            const dateStr = `${year}-${m}-${d}`;
            const isSelected = selectedDateIso === dateStr;
            const isToday = localDate() === dateStr;

            // Tasks due on this day
            const dayTasks = tasks.filter((t) => t.dueDate === dateStr);
            const hasPending = dayTasks.some((t) => !t.completed);
            const hasHighPriority = dayTasks.some((t) => !t.completed && t.priority === 'high');

            return (
              <button
                key={dayNum}
                onClick={() => handleDateClick(dayNum)}
                className={`relative h-10 sm:h-12 rounded-2xl flex flex-col items-center justify-center transition-all touch-manipulation min-h-[44px] ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                    : isToday
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-800'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                <span className="text-xs">{dayNum}</span>

                {/* Dot Indicators */}
                {dayTasks.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isSelected
                        ? 'bg-white'
                        : hasHighPriority
                        ? 'bg-rose-500'
                        : hasPending
                        ? 'bg-indigo-500'
                        : 'bg-emerald-400'
                    }`} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Schedule & Hourly Timeline */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Schedule for {selectedDateIso}
            </h3>
            <span className="text-xs text-slate-500">
              {selectedDateTasks.length} {selectedDateTasks.length === 1 ? 'task' : 'tasks'} scheduled
            </span>
          </div>

          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300">
            Timeline View
          </span>
        </div>

        {/* Quick Add for Selected Day */}
        <form onSubmit={handleQuickSchedule} className="flex items-center gap-2">
          <input
            type="time"
            value={newScheduleTime}
            onChange={(e) => setNewScheduleTime(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none min-h-[44px]"
          />
          <input
            type="text"
            value={newScheduleTitle}
            onChange={(e) => setNewScheduleTitle(e.target.value)}
            placeholder="Schedule event or task..."
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[44px]"
          />
          <button
            type="submit"
            disabled={!newScheduleTitle.trim()}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium text-xs flex items-center gap-1 transition shadow-sm min-h-[44px]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </form>

        {/* Timeline Slots */}
        <div className="space-y-2 pt-2">
          {selectedDateTasks.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center italic">
              No tasks scheduled for this day yet. Type above to add one!
            </p>
          ) : (
            selectedDateTasks.map((task) => (
              <div
                key={task.id}
                className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                  task.completed
                    ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggleTask(task.id, task.completed)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition min-h-[44px] min-w-[44px] ${
                      task.completed
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-400 text-transparent'
                    }`}
                  >
                    <Check className={`w-3 h-3 stroke-[3] ${task.completed ? 'text-white' : 'opacity-0'}`} />
                  </button>

                  <div>
                    <span className={`text-xs font-semibold ${task.completed ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                      {task.title}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                      {task.dueTime ? (
                        <span className="font-mono flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                          <Clock className="w-3 h-3" />
                          {task.dueTime}
                        </span>
                      ) : (
                        <span>Anytime</span>
                      )}
                      {task.location && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            {task.location}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{task.category}</span>
                    </div>
                  </div>
                </div>

                {task.priority === 'high' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                    High
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
