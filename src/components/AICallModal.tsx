import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  Sparkles, 
  Check, 
  Clock, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  Languages, 
  Edit3, 
  Trash2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { ActiveCallState, Task } from '../types';
import { audioService } from '../services/audioService';
import { voiceCallService } from '../services/voiceCallService';
import { hapticService } from '../services/hapticService';

interface AICallModalProps {
  callState: ActiveCallState;
  onAnswerCall: () => void;
  onDeclineCall: () => void;
  onEndCall: () => void;
  tasks: Task[];
  userName?: string;
  onCompleteTask: (taskId: string) => void;
  onAddTask: (
    title: string, 
    dueDate: string, 
    dueTime?: string | null, 
    priority?: 'low' | 'medium' | 'high',
    category?: any,
    location?: string | null
  ) => void;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  onDeleteTask?: (taskId: string) => void;
  voiceName?: string;
}

export const AICallModal: React.FC<AICallModalProps> = ({
  callState,
  onAnswerCall,
  onDeclineCall,
  onEndCall,
  tasks,
  userName = 'there',
  onCompleteTask,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  voiceName = 'Puck',
}) => {
  const [callDuration, setCallDuration] = useState(0);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserListening, setIsUserListening] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const [userSpeechInput, setUserSpeechInput] = useState('');
  const [callStatusMessage, setCallStatusMessage] = useState('Connecting voice assistant...');
  const [isPreloaded, setIsPreloaded] = useState(false);
  
  // Interactive Gemini Call & Bangla Support States
  const [callLanguage, setCallLanguage] = useState<'en-US' | 'bn-BD'>('en-US');
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [actionNotice, setActionNotice] = useState<{ type: 'create' | 'update' | 'complete' | 'delete'; text: string } | null>(null);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);

  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const speechTranscriptRef = useRef<string>('');
  const tasksRef = useRef<Task[]>(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Manage Call Timer
  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0);
      timerRef.current = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setConversationHistory([]);
      setActionNotice(null);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // PROACTIVE PRE-PROCESSING: Load & process speech BEFORE the user answers (while ringing)
  useEffect(() => {
    if (callState === 'ringing') {
      setIsPreloaded(false);
      voiceCallService
        .prepareCall(tasks, userName, voiceName)
        .then((prep) => {
          setBriefingText(prep.script);
          setIsPreloaded(true);
        })
        .catch(() => {
          const fallback = voiceCallService.getInstantFallbackScript(tasks, userName);
          setBriefingText(fallback);
          setIsPreloaded(true);
        });
    } else if (callState === 'idle') {
      setIsPreloaded(false);
    }
  }, [callState, tasks, userName, voiceName]);

  // When user answers (connects): GID speaks immediately without delay!
  useEffect(() => {
    if (callState === 'connected') {
      playInstantBriefing();
    }
  }, [callState]);

  const playInstantBriefing = async () => {
    setCallStatusMessage(callLanguage === 'bn-BD' ? 'কথা বলছি...' : 'Speaking...');

    let scriptToSpeak = briefingText;
    if (!scriptToSpeak) {
      try {
        const prepPromise = voiceCallService.prepareCall(tasks, userName, voiceName);
        const timeoutPromise = new Promise<{ script: string }>((resolve) =>
          setTimeout(
            () => resolve({ script: voiceCallService.getInstantFallbackScript(tasks, userName) }),
            450
          )
        );
        const result = await Promise.race([prepPromise, timeoutPromise]);
        scriptToSpeak = result.script;
        setBriefingText(scriptToSpeak);
      } catch {
        scriptToSpeak = voiceCallService.getInstantFallbackScript(tasks, userName);
        setBriefingText(scriptToSpeak);
      }
    }

    // Set initial assistant message in conversation
    setConversationHistory([{ role: 'assistant', content: scriptToSpeak }]);

    await audioService.playPreloadedOrSpeak(
      scriptToSpeak,
      voiceName,
      () => setIsAiSpeaking(true),
      () => {
        setIsAiSpeaking(false);
        setCallStatusMessage(
          callLanguage === 'bn-BD'
            ? 'শুনছি... (কথা বলুন বা মাইক চাপুন)'
            : 'Listening... (speak instruction or tap mic)'
        );
      }
    );
  };

  // Toggle user voice recognition (supports Bangla 'bn-BD' and English 'en-US')
  const toggleSpeechRecognition = () => {
    hapticService.lightTap();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCallStatusMessage('Voice recognition is not supported in this browser. Use the quick buttons below.');
      return;
    }

    if (isUserListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsUserListening(false);
      return;
    }

    try {
      speechTranscriptRef.current = '';
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = callLanguage; // Dynamic language switch (English / বাংলা)

      recognition.onstart = () => {
        setIsUserListening(true);
        setCallStatusMessage(callLanguage === 'bn-BD' ? 'বাংলায় শুনছি...' : 'Listening to you...');
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((res: any) => res[0].transcript)
          .join('');
        speechTranscriptRef.current = transcript;
        setUserSpeechInput(transcript);

        // Auto-detect Bengali script in speech and adapt language indicator
        if (/[\u0980-\u09FF]/.test(transcript) && callLanguage !== 'bn-BD') {
          setCallLanguage('bn-BD');
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech error:', event.error);
        setIsUserListening(false);
        setCallStatusMessage(callLanguage === 'bn-BD' ? 'প্রস্তুত (মাইক চাপুন)' : 'Ready (tap mic to speak)');
      };

      recognition.onend = () => {
        setIsUserListening(false);
        const finalTranscript = speechTranscriptRef.current.trim();
        if (finalTranscript) {
          setCallStatusMessage(callLanguage === 'bn-BD' ? 'প্রসেস হচ্ছে...' : 'Processing instruction with Gemini...');
          handleConversationalVoiceTurn(finalTranscript);
          speechTranscriptRef.current = '';
        } else {
          setCallStatusMessage(callLanguage === 'bn-BD' ? 'প্রস্তুত (মাইক চাপুন)' : 'Ready (tap mic to speak)');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setIsUserListening(false);
      setCallStatusMessage('Microphone access unavailable');
    }
  };

  // Conversational Multi-turn AI Call: handles spoken instructions, modifying tasks, Bangla, etc.
  const handleConversationalVoiceTurn = async (spokenText: string) => {
    if (!spokenText.trim() || isProcessingTurn) return;
    setIsProcessingTurn(true);
    setUserSpeechInput('');

    const newHistory = [...conversationHistory, { role: 'user' as const, content: spokenText }];
    setConversationHistory(newHistory);

    try {
      const res = await fetch('/api/call-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          tasks: tasksRef.current,
          userName,
          voice: voiceName,
          language: callLanguage === 'bn-BD' ? 'bn' : 'en',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.reply || (callLanguage === 'bn-BD' ? 'আমি বিষয়টি নোট করেছি।' : 'I have noted that.');
        setBriefingText(reply);
        setConversationHistory((prev) => [...prev, { role: 'assistant', content: reply }]);

        // Execute instructed actions during the live phone call!
        if (data.action) {
          executeCallAction(data.action);
        }

        // Speak response out loud in the call
        if (data.audioBase64) {
          audioService.preloadAudioFromBase64(data.audioBase64, data.mimeType || 'audio/mp3', reply);
          await audioService.playPreloadedOrSpeak(
            reply,
            voiceName,
            () => setIsAiSpeaking(true),
            () => {
              setIsAiSpeaking(false);
              setCallStatusMessage(callLanguage === 'bn-BD' ? 'শুনছি...' : 'Listening... (tap mic)');
            }
          );
        } else {
          await audioService.speakBriefing(
            reply,
            voiceName,
            () => setIsAiSpeaking(true),
            () => {
              setIsAiSpeaking(false);
              setCallStatusMessage(callLanguage === 'bn-BD' ? 'শুনছি...' : 'Listening... (tap mic)');
            }
          );
        }
      } else {
        throw new Error('Call conversation endpoint failed');
      }
    } catch (err) {
      console.warn('Fallback to local call command parser:', err);
      handleLocalFallbackInstruction(spokenText);
    } finally {
      setIsProcessingTurn(false);
    }
  };

  // Execute Task Instruction returned by Gemini during call
  const executeCallAction = (actionObj: any) => {
    const { action, task, updates, taskId } = actionObj;
    const currentTasks = tasksRef.current;
    const today = new Date().toISOString().split('T')[0];

    if (action === 'CREATE_TASK' && task) {
      hapticService.taskCreate();
      onAddTask(
        task.title || 'New Task',
        task.dueDate || today,
        task.dueTime || null,
        task.priority || 'medium',
        task.category || 'Personal',
        task.location || null
      );
      setActionNotice({
        type: 'create',
        text: `Added: "${task.title}"${task.dueTime ? ` at ${task.dueTime}` : ''}`,
      });
    } else if (action === 'UPDATE_TASK') {
      hapticService.taskCreate();
      const target = currentTasks.find((t) => t.id === taskId) || currentTasks[0];
      if (target && onUpdateTask) {
        onUpdateTask(target.id, updates || {});
        setActionNotice({
          type: 'update',
          text: `Updated: "${target.title}"`,
        });
      }
    } else if (action === 'COMPLETE_TASK') {
      hapticService.taskComplete();
      const target = currentTasks.find((t) => t.id === taskId) || currentTasks.find((t) => !t.completed);
      if (target) {
        onCompleteTask(target.id);
        setActionNotice({
          type: 'complete',
          text: `Completed: "${target.title}"`,
        });
      }
    } else if (action === 'DELETE_TASK') {
      hapticService.taskDelete();
      const target = currentTasks.find((t) => t.id === taskId);
      if (target && onDeleteTask) {
        onDeleteTask(target.id);
        setActionNotice({
          type: 'delete',
          text: `Deleted: "${target.title}"`,
        });
      }
    }

    // Auto clear action badge after 4.5 seconds
    setTimeout(() => {
      setActionNotice(null);
    }, 4500);
  };

  // Local Bangla & English Offline Action Parser Fallback
  const handleLocalFallbackInstruction = (text: string) => {
    const lower = text.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    const pending = tasksRef.current.filter((t) => !t.completed);

    // Bangla & English Task Completion
    if (
      lower.includes('done') || 
      lower.includes('complete') || 
      lower.includes('finish') ||
      text.includes('শেষ') || 
      text.includes('কমপ্লিট') || 
      text.includes('টিক')
    ) {
      if (pending.length > 0) {
        const top = pending[0];
        onCompleteTask(top.id);
        const reply = callLanguage === 'bn-BD'
          ? `"${top.title}" কাজটি সম্পন্ন করা হয়েছে। খুব ভালো কাজ!`
          : `Marked "${top.title}" as completed. Great job!`;
        setBriefingText(reply);
        audioService.speakBriefing(reply, voiceName);
      }
      return;
    }

    // Bangla & English Task Creation
    if (
      lower.includes('add') || 
      lower.includes('create') || 
      lower.includes('schedule') ||
      text.includes('যোগ') || 
      text.includes('অ্যাড') || 
      text.includes('করতে হবে')
    ) {
      const cleanTitle = text
        .replace(/\b(add|create|schedule|remind me to)\b/gi, '')
        .replace(/(যোগ করো|অ্যাড করো|করতে হবে)/g, '')
        .trim();
      const finalTitle = cleanTitle || (callLanguage === 'bn-BD' ? 'নতুন কাজ' : 'Quick Task');
      onAddTask(finalTitle, today, null, 'medium');
      const reply = callLanguage === 'bn-BD'
        ? `আমি "${finalTitle}" টাস্ক লিস্টে যুক্ত করে দিয়েছি।`
        : `I've added "${finalTitle}" to your task list for today.`;
      setBriefingText(reply);
      audioService.speakBriefing(reply, voiceName);
      return;
    }

    // Default conversational reply
    const reply = callLanguage === 'bn-BD'
      ? 'আমি আপনার কথা শুনেছি। আর কোনো কাজ যোগ বা পরিবর্তন করতে চান?'
      : "I heard you! Let me know if you want to add, reschedule, or complete any task.";
    setBriefingText(reply);
    audioService.speakBriefing(reply, voiceName);
  };

  const handleQuickAction = (instruction: string) => {
    handleConversationalVoiceTurn(instruction);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const pendingCount = tasks.filter((t) => !t.completed).length;

  if (callState === 'idle') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-fade-in p-4">
      {/* INCOMING RINGING SCREEN */}
      {callState === 'ringing' && (
        <div className="w-full max-w-sm flex flex-col items-center justify-between min-h-[520px] py-10 px-6 text-white text-center">
          {/* Top Caller Information */}
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Incoming AI Briefing Call
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-white">Get It Done</h2>
            <p className="text-sm text-slate-300 animate-pulse">Personal Assistant Calling...</p>

            <div className="flex items-center justify-center pt-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                isPreloaded
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 animate-pulse'
              }`}>
                {isPreloaded ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Briefing Ready to Speak</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing what to say...</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Central Pulsing Avatar Ring */}
          <div className="relative my-6">
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
            <div className="absolute -inset-4 rounded-full bg-indigo-500/10 animate-pulse" />
            <div className="relative w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/40 border-4 border-white/20">
              <Phone className="w-12 h-12 text-white animate-bounce" />
            </div>
          </div>

          {/* Incoming Details & Answer / Decline Actions */}
          <div className="w-full space-y-6">
            <p className="text-xs text-slate-400">
              {pendingCount} tasks queued for briefing
            </p>

            <div className="flex items-center justify-around gap-6 pt-4">
              {/* Decline Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={onDeclineCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all touch-manipulation min-h-[64px] min-w-[64px]"
                  title="Decline Call"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-xs font-medium text-slate-400">Decline</span>
              </div>

              {/* Answer Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={onAnswerCall}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 transition-all animate-pulse touch-manipulation min-h-[64px] min-w-[64px]"
                  title="Answer Call"
                >
                  <Phone className="w-7 h-7" />
                </button>
                <span className="text-xs font-medium text-emerald-400 font-semibold">Answer</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONNECTED CALL SCREEN (Interactive Gemini Voice Call with Bangla & Actions) */}
      {callState === 'connected' && (
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-between min-h-[610px] text-white">
          {/* Header, Duration & Language Switcher */}
          <div className="w-full flex items-center justify-between border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-white">Gemini Voice Assistant</h3>
                <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Call · {formatTimer(callDuration)}
                </span>
              </div>
            </div>

            {/* Language Switcher (English / বাংলা) */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setCallLanguage('en-US')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                  callLanguage === 'en-US'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Speak English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setCallLanguage('bn-BD')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                  callLanguage === 'bn-BD'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="বাংলায় কথা বলুন"
              >
                বাংলা
              </button>
            </div>
          </div>

          {/* Action Notification Banner (when task is created/updated/deleted) */}
          {actionNotice && (
            <div className="w-full mt-2 p-2 rounded-xl bg-indigo-950/70 border border-indigo-500/40 flex items-center gap-2 text-xs text-indigo-200 animate-in fade-in slide-in-from-top-2">
              {actionNotice.type === 'create' && <Plus className="w-4 h-4 text-emerald-400 shrink-0" />}
              {actionNotice.type === 'update' && <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />}
              {actionNotice.type === 'complete' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
              {actionNotice.type === 'delete' && <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />}
              <span className="truncate font-medium">{actionNotice.text}</span>
            </div>
          )}

          {/* Central Voice Visualizer & Animated Waveform */}
          <div className="flex flex-col items-center my-4 space-y-3">
            <div className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              isAiSpeaking
                ? 'bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-xl shadow-indigo-500/50 scale-105 ring-4 ring-indigo-500/20'
                : isUserListening
                ? 'bg-amber-500 shadow-xl shadow-amber-500/40 scale-105 ring-4 ring-amber-500/20'
                : 'bg-slate-800 border border-slate-700'
            }`}>
              {isAiSpeaking ? (
                <Volume2 className="w-10 h-10 text-white animate-pulse" />
              ) : isUserListening ? (
                <Mic className="w-10 h-10 text-white animate-pulse" />
              ) : (
                <Sparkles className="w-9 h-9 text-slate-400" />
              )}
            </div>

            {/* Audio Wave Bars */}
            <div className="flex items-center justify-center gap-1.5 h-7">
              {[40, 70, 90, 60, 100, 75, 45, 80, 50].map((height, i) => (
                <span
                  key={i}
                  style={{
                    height: isAiSpeaking || isUserListening ? `${height}%` : '20%',
                    transition: 'height 0.15s ease-in-out',
                  }}
                  className={`w-1 rounded-full ${
                    isAiSpeaking ? 'bg-indigo-400' : isUserListening ? 'bg-amber-400' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>

            <p className="text-xs font-mono text-indigo-300/90 text-center px-4">
              {callStatusMessage}
            </p>
          </div>

          {/* Live Spoken Dialogue Box */}
          <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 text-left my-2 max-h-36 overflow-y-auto space-y-2">
            {userSpeechInput && (
              <div className="p-2 rounded-xl bg-slate-800/50 text-[11px] text-amber-300 font-mono">
                🎤 You: "{userSpeechInput}"
              </div>
            )}
            <p className="text-xs text-slate-200 leading-relaxed font-sans">
              "{briefingText || (callLanguage === 'bn-BD' ? 'কীভাবে সাহায্য করতে পারি বলুন...' : 'How can I help you today?')}"
            </p>
          </div>

          {/* Quick Spoken Instruction Chips (English & Bangla) */}
          <div className="w-full py-1.5">
            <div className="flex flex-wrap gap-1.5 justify-center">
              {callLanguage === 'bn-BD' ? (
                <>
                  <button
                    onClick={() => handleQuickAction('আজকের প্রথম কাজ শেষ হয়েছে')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Check className="w-3 h-3 text-emerald-400" />
                    কাজ শেষ (Done)
                  </button>
                  <button
                    onClick={() => handleQuickAction('আজকে বিকেল ৫টায় বাজার করার টাস্ক অ্যাড করো')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Plus className="w-3 h-3 text-indigo-400" />
                    টাস্ক যোগ করো
                  </button>
                  <button
                    onClick={() => handleQuickAction('কালকে সকাল ১০টায় মিটিং শিডিউল করো')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Calendar className="w-3 h-3 text-sky-400" />
                    শিডিউল করো
                  </button>
                  <button
                    onClick={() => handleQuickAction('আজকে আমার আর কি কি কাজ বাকি আছে?')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Clock className="w-3 h-3 text-amber-400" />
                    বাকি কাজ কি?
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleQuickAction('Mark top task as completed')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Check className="w-3 h-3 text-emerald-400" />
                    Done top task
                  </button>
                  <button
                    onClick={() => handleQuickAction('Add task buy groceries today at 5pm')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Plus className="w-3 h-3 text-indigo-400" />
                    Add task
                  </button>
                  <button
                    onClick={() => handleQuickAction('Reschedule meeting to tomorrow at 10am')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Calendar className="w-3 h-3 text-sky-400" />
                    Reschedule
                  </button>
                  <button
                    onClick={() => handleQuickAction('What tasks are pending for today?')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 flex items-center gap-1 transition active:scale-95"
                  >
                    <Clock className="w-3 h-3 text-amber-400" />
                    What's left?
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Controls: Microphone + Replay + End Call */}
          <div className="w-full pt-4 flex items-center justify-around border-t border-slate-800">
            {/* Repeat Briefing / Reply Button */}
            <button
              onClick={playInstantBriefing}
              title="Repeat speech"
              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700"
            >
              <RefreshCw className="w-5 h-5" />
            </button>

            {/* User Speech Mic Button (Push or toggle to speak) */}
            <button
              onClick={toggleSpeechRecognition}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-md touch-manipulation min-h-[64px] min-w-[64px] ${
                isUserListening
                  ? 'bg-amber-500 text-white animate-pulse shadow-amber-500/40 ring-4 ring-amber-500/20 scale-105'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
              }`}
              title={isUserListening ? 'Stop listening' : 'Tap to speak instruction'}
            >
              {isUserListening ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
            </button>

            {/* End Call Hangup */}
            <button
              onClick={onEndCall}
              className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all touch-manipulation min-h-[48px] min-w-[48px]"
              title="Hang Up"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
