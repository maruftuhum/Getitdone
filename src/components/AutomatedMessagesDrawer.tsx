import React from 'react';
import { Bell, Check, Phone, Trash2, X, AlertCircle, Clock, Sparkles } from 'lucide-react';
import { AutomatedMessage } from '../types';

interface AutomatedMessagesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: AutomatedMessage[];
  onClearMessages: () => void;
  onTriggerCall: () => void;
  onCompleteTask?: (taskId: string) => void;
}

export const AutomatedMessagesDrawer: React.FC<AutomatedMessagesDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  onClearMessages,
  onTriggerCall,
  onCompleteTask,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-sm h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Automated Messages
              </h3>
              <p className="text-[11px] text-slate-500">
                Scheduled notifications & reminders
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={onClearMessages}
                title="Clear all messages"
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close drawer"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Bell className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs">No automatic messages right now.</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Get It Done will automatically send you reminders when tasks are due or when your scheduled call triggers!
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-indigo-300 dark:hover:border-indigo-800 transition space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {msg.type === 'call' ? (
                      <span className="p-1 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600">
                        <Phone className="w-3.5 h-3.5" />
                      </span>
                    ) : msg.type === 'urgent' ? (
                      <span className="p-1 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-600">
                        <Clock className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {msg.title}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {msg.timestamp}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {msg.body}
                </p>

                {/* Context actions */}
                <div className="pt-1 flex items-center gap-2">
                  {msg.type === 'call' && (
                    <button
                      onClick={() => {
                        onClose();
                        onTriggerCall();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] flex items-center gap-1 transition"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Start Call</span>
                    </button>
                  )}

                  {msg.taskId && onCompleteTask && (
                    <button
                      onClick={() => onCompleteTask(msg.taskId!)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1 transition"
                    >
                      <Check className="w-3 h-3" />
                      <span>Mark Done</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
