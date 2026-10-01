import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Sparkles, User, Check, Plus, Calendar, Phone } from 'lucide-react';
import { ChatMessage, Task } from '../types';

import { askAssistant } from '../services/assistantService';
import type { ActionResult } from '../shared/taskActions';

interface ChatAssistantViewProps {
  tasks: Task[];
  onAction: (input: unknown) => ActionResult;
  hybridMode: boolean;
  onTriggerCall: () => void;
}

export const ChatAssistantView: React.FC<ChatAssistantViewProps> = ({
  tasks,
  onAction,
  hybridMode,
  onTriggerCall,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm your Get It Done personal AI companion. You can ask me what's due, ask me to schedule tasks, or ask me to call you with a morning briefing!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMicListening, setIsMicListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => { controllerRef.current?.abort(); recognitionRef.current?.abort(); }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: query.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const controller = new AbortController();
      controllerRef.current = controller;
      const data = await askAssistant([...messages, userMsg].map(m => ({ role: m.role, content: m.content })), tasks, hybridMode, undefined, controller.signal);
      if (controller.signal.aborted) return;
      const result = data.action ? onAction(data.action) : null;
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: result && !result.ok ? result.message : data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: result?.ok ? data.action : null,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: "I'm currently unable to reach the server. Your tasks remain safely stored locally!",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMic = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'assistant',
          content: 'Voice speech recognition is not supported in this browser. You can type your request or task instructions directly in the input box below!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      return;
    }

    if (isMicListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsMicListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsMicListening(true);
      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((res: any) => res[0].transcript)
          .join('');
        setInput(transcript);
      };
      recognition.onerror = () => setIsMicListening(false);
      recognition.onend = () => setIsMicListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsMicListening(false);
    }
  };

  // Quick prompt suggestions
  const suggestions = [
    "What tasks are due today?",
    "Plan a 3-step schedule for tomorrow",
    "Add: Review project proposal tomorrow at 3pm urgent",
    "What is my highest priority task?",
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-4 pb-28 flex flex-col h-[calc(100vh-8rem)]">
      {/* Top Quick Actions Bar */}
      <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl px-4 py-2.5 mb-3 text-xs">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
          <Sparkles className="w-4 h-4" />
          <span className="font-medium">{hybridMode ? 'Cloud assistant with offline fallback' : 'On-device assistant'}</span>
        </div>
        <button
          onClick={onTriggerCall}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition active:scale-95 shadow-sm min-h-[36px]"
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Call Briefing</span>
        </button>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-3xl px-4 py-3 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none shadow-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* Action Badge if task was auto-created */}
              {msg.action?.action === 'CREATE_TASK' && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Check className="w-3.5 h-3.5" />
                  <span>Task automatically added to your list</span>
                </div>
              )}

              <span className={`block text-[10px] mt-1.5 text-right ${
                msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'
              }`}>
                {msg.timestamp}
              </span>
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 p-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
            <span>Thinking & checking your schedule...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="py-2 overflow-x-auto no-scrollbar flex items-center gap-1.5">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(s)}
            className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 hover:border-indigo-400 whitespace-nowrap transition min-h-[36px]"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="pt-1 flex items-center gap-2">
        <button
          onClick={toggleMic}
          className={`p-3 rounded-2xl transition min-h-[44px] min-w-[44px] flex items-center justify-center ${
            isMicListening
              ? 'bg-amber-500 text-white animate-pulse'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600'
          }`}
          title="Voice input"
        >
          {isMicListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask Get It Done or type tasks to add..."
          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm min-h-[44px]"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!input.trim() || isLoading}
          className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition active:scale-95 shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Send message"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
