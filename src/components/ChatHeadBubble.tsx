import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  Sparkles, 
  Phone, 
  ExternalLink,
  Minimize2,
  Cpu,
  Bot
} from 'lucide-react';
import { Task } from '../types';
import { askAssistant } from '../services/assistantService';
import type { ActionResult } from '../shared/taskActions';

interface ChatHeadBubbleProps {
  tasks: Task[];
  onAction: (input: unknown) => ActionResult;
  onTriggerCall: () => void;
  latestWorkUpdate?: string;
  hybridMode: boolean;
}

export const ChatHeadBubble: React.FC<ChatHeadBubbleProps> = ({
  tasks,
  onAction,
  onTriggerCall,
  latestWorkUpdate,
  hybridMode,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDismissZone, setIsOverDismissZone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);

  // Position state (defaults to right edge, 30% from bottom)
  const [position, setPosition] = useState({ x: window.innerWidth - 72, y: window.innerHeight - 180 });
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const didDragRef = useRef(false);

  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; model?: string }>>([
    {
      sender: 'ai',
      text: "Hey! I'm your Get It Done assistant powered by Local Local Assistant. What are we working on next?",
      model: 'Local Assistant',
    },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const recognitionRef = useRef<any>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => { controllerRef.current?.abort(); recognitionRef.current?.abort(); }, []);

  const pendingCount = tasks.filter((t) => !t.completed).length;

  // React to proactive work updates
  useEffect(() => {
    if (latestWorkUpdate) {
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: `[Work Update] ${latestWorkUpdate}`, model: 'Task Assistant' },
      ]);
    }
  }, [latestWorkUpdate]);

  // Touch & Mouse Drag handlers (Messenger Chat Head physics)
  const handleStart = (clientX: number, clientY: number) => {
    didDragRef.current = false;
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: position.x,
      initialY: position.y,
    };
    setIsDragging(true);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!dragStartRef.current) return;
    const deltaX = clientX - dragStartRef.current.startX;
    const deltaY = clientY - dragStartRef.current.startY;

    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
      didDragRef.current = true;
    }

    const newX = Math.max(8, Math.min(window.innerWidth - 64, dragStartRef.current.initialX + deltaX));
    const newY = Math.max(50, Math.min(window.innerHeight - 80, dragStartRef.current.initialY + deltaY));

    setPosition({ x: newX, y: newY });

    // Check if dragged over bottom dismiss zone (Messenger X circle)
    const isNearBottomCenter = newY > window.innerHeight - 130 && Math.abs(newX - (window.innerWidth / 2 - 28)) < 80;
    setIsOverDismissZone(isNearBottomCenter);
  };

  const handleEnd = () => {
    if (!dragStartRef.current) return;
    setIsDragging(false);

    if (isOverDismissZone) {
      setIsDismissed(true);
      dragStartRef.current = null;
      return;
    }

    // Snap to nearest screen edge (left or right) like Facebook Messenger!
    const midScreen = window.innerWidth / 2;
    const snapX = position.x < midScreen ? 12 : window.innerWidth - 68;

    setPosition((prev) => ({ ...prev, x: snapX }));
    dragStartRef.current = null;
  };

  // Document Picture-in-Picture: "Float Over Other Apps"
  const popOutOverOtherApps = async () => {
    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
      try {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 360,
          height: 520,
        });

        // Copy styles
        Array.from(document.styleSheets).forEach((styleSheet) => {
          try {
            const cssRules = Array.from(styleSheet.cssRules)
              .map((rule) => rule.cssText)
              .join('');
            const style = pipWindow.document.createElement('style');
            style.textContent = cssRules;
            pipWindow.document.head.appendChild(style);
          } catch (e) {
            const link = pipWindow.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = (styleSheet as any).href;
            pipWindow.document.head.appendChild(link);
          }
        });

        // Add container
        const container = pipWindow.document.createElement('div');
        container.id = 'pip-chat-root';
        container.innerHTML = `
          <div style="font-family: sans-serif; padding: 16px; background: #0f172a; color: white; min-height: 100vh;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">
              <h3 style="margin: 0; font-size: 14px; font-weight: bold;">Get It Done Floating Head</h3>
              <span style="font-size: 11px; color: #818cf8;">Floating Over Apps</span>
            </div>
            <p style="font-size: 12px; color: #cbd5e1; margin-top: 14px;">
              This window stays on top of other apps (YouTube, WhatsApp, home screen).
            </p>
            <div style="margin-top: 20px; padding: 12px; background: #1e293b; border-radius: 12px;">
              <strong style="font-size: 12px; display: block; margin-bottom: 6px;">Pending Tasks (${pendingCount}):</strong>
              ${tasks.filter(t => !t.completed).slice(0, 4).map(t => `<div style="font-size: 11px; margin-bottom: 4px;">• ${t.title.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))}</div>`).join('')}
            </div>
          </div>
        `;
        pipWindow.document.body.appendChild(container);
        setIsPipActive(true);

        pipWindow.addEventListener('pagehide', () => {
          setIsPipActive(false);
        });
      } catch (e) {
        console.warn('Document PiP failed or dismissed:', e);
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: 'Picture-in-Picture window is available on supported Chromium browsers. You can keep using this floating bubble right inside the app!',
            model: 'Local Assistant',
          },
        ]);
      }
    } else {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Document Picture-in-Picture is not supported in this browser. This floating chat head stays accessible on your screen throughout the app!',
          model: 'Local Assistant',
        },
      ]);
    }
  };

  // Submit chat query using Local Local Assistant
  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    const userText = input.trim();
    setInput('');
    setIsGenerating(true);

    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);

    try {
      const history = messages.map(m => ({ role: m.sender === 'user' ? 'user' as const : 'assistant' as const, content: m.text }));
      const controller = new AbortController();
      controllerRef.current = controller;
      const result = await askAssistant([...history, { role: 'user', content: userText }], tasks, hybridMode, undefined, controller.signal);
      if (controller.signal.aborted) return;
      const action = result.action ? onAction(result.action) : null;
      setMessages(prev => [...prev, { sender: 'ai', text: action && !action.ok ? action.message : result.reply, model: result.engineUsed }]);
    } catch {
      setMessages(prev => [...prev, { sender: 'ai', text: 'Please try that instruction again.' }]);
    } finally { setIsGenerating(false); }
  };

  const toggleMic = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Voice speech recognition is not supported in this browser. Please type your message in the chat box!',
          model: 'Local Assistant',
        },
      ]);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((res: any) => res[0].transcript)
          .join('');
        setInput(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  if (isDismissed) {
    return (
      <button
        onClick={() => {
          setIsDismissed(false);
          setPosition({ x: window.innerWidth - 68, y: window.innerHeight - 180 });
        }}
        className="fixed bottom-20 right-4 z-40 px-2.5 py-1 rounded-full bg-slate-800 text-[10px] text-slate-300 border border-slate-700 shadow-md"
      >
        Restore Chat Head
      </button>
    );
  }

  return (
    <>
      {/* 1. Messenger Floating Bubble (Draggable & Snappable) */}
      {!isOpen && (
        <div
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          className="fixed top-0 left-0 z-40 touch-none select-none"
          onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => isDragging && handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
        >
          <div
            onClick={() => {
              if (!didDragRef.current) setIsOpen(true);
            }}
            className="group relative w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-white shadow-2xl shadow-indigo-600/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer border-2 border-white/30"
          >
            <Bot className="w-7 h-7 text-white fill-white/20" />

            {/* Local LLM indicator dot */}
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" title="Local Assistant Local Model Active" />

            {/* Pending Tasks Badge */}
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. Messenger Bottom Dismiss Target ("X" Circle) during Drag */}
      {isDragging && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 pointer-events-none transition-transform">
          <div
            className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${
              isOverDismissZone
                ? 'bg-rose-600 border-rose-400 scale-125 shadow-xl shadow-rose-600/50 text-white'
                : 'bg-slate-900/80 border-slate-600 text-slate-300'
            }`}
          >
            <X className="w-6 h-6 stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-semibold text-slate-400">
            {isOverDismissZone ? 'Release to close' : 'Drag here to dismiss'}
          </span>
        </div>
      )}

      {/* 3. Expanded Chat Window (Floating Drawer) */}
      {isOpen && (
        <div className="fixed right-3 bottom-20 z-50 w-80 sm:w-96 max-h-[500px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold leading-none">Task Assistant</h4>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 font-mono">
                    {hybridMode ? 'Hybrid' : 'Local'}
                  </span>
                </div>
                <span className="text-[10px] text-indigo-100 opacity-90 block mt-0.5">
                  Floating Assistant · Auto Work Updates
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Picture-in-Picture: Float over other apps */}
              <button
                onClick={popOutOverOtherApps}
                title="Float Over Other Apps (Picture-in-Picture)"
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onTriggerCall}
                title="AI Voice Call Briefing"
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <Phone className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsOpen(false)}
                title="Minimize chat head"
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Chat Stream */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5 max-h-64 text-xs">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.model && (
                    <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                      {msg.model}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {isGenerating && (
              <div className="flex items-center gap-1.5 text-xs text-indigo-400 p-2">
                <Cpu className="w-3.5 h-3.5 animate-spin" />
                <span>Local Assistant local reasoning...</span>
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => {
                setInput("What is due today?");
              }}
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 whitespace-nowrap"
            >
              What is due today?
            </button>
            <button
              onClick={() => {
                setInput("How is my progress today?");
              }}
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 whitespace-nowrap"
            >
              Progress stats
            </button>
            <button
              onClick={popOutOverOtherApps}
              className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold whitespace-nowrap"
            >
              Float over other apps
            </button>
          </div>

          {/* Input & Microphone Bar */}
          <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
            <button
              onClick={toggleMic}
              className={`p-2 rounded-xl transition min-h-[40px] min-w-[40px] flex items-center justify-center ${
                isListening
                  ? 'bg-amber-500 text-white animate-pulse'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Voice dictation"
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask Gemma or type task to add..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            <button
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
