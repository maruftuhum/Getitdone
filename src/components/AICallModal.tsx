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
import { ActiveCallState, Task, CallType } from '../types';
import { audioService } from '../services/audioService';
import { voiceCallService } from '../services/voiceCallService';
import { hapticService } from '../services/hapticService';

import { askAssistant } from '../services/assistantService';
import type { ActionResult } from '../shared/taskActions';

interface AICallModalProps {
  onAction: (input: unknown) => ActionResult;
  hybridMode: boolean;
  callState: ActiveCallState;
  callType: CallType;
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
  callType,
  onAction,
  hybridMode,
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
  const [isMuted, setIsMuted] = useState(false);
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
  const turnController = useRef<AbortController | null>(null);
  const isMutedRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const isProcessingTurnRef = useRef(false);
  const callStateRef = useRef(callState);
  const silenceTimerRef = useRef<any>(null);
  const autoRestartTimerRef = useRef<any>(null);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  useEffect(() => {
    isProcessingTurnRef.current = isProcessingTurn;
  }, [isProcessingTurn]);

  // Clean stop for speech recognition
  const stopListening = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (autoRestartTimerRef.current) {
      clearTimeout(autoRestartTimerRef.current);
      autoRestartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsUserListening(false);
  };

  useEffect(() => {
    return () => {
      turnController.current?.abort();
      stopListening();
      audioService.stopSpeaking();
    };
  }, []);

  // Manage Call Timer & Lifecycle
  useEffect(() => {
    callStateRef.current = callState;
    if (callState === 'connected') {
      setCallDuration(0);
      setIsMuted(false);
      isMutedRef.current = false;
      timerRef.current = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      stopListening();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setConversationHistory([]);
      setActionNotice(null);
      setIsMuted(false);
      isMutedRef.current = false;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopListening();
    };
  }, [callState]);

  // PROACTIVE PRE-PROCESSING: Load & process speech BEFORE the user answers (while ringing)
  useEffect(() => {
    if (callState === 'ringing') {
      setIsPreloaded(false);
      voiceCallService
        .prepareCall(tasks, userName, voiceName, callType)
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
  }, [callState, tasks, userName, voiceName, callType]);

  // Hands-Free Direct Speech Auto-Listening
  const startAutoListening = () => {
    if (
      callStateRef.current !== 'connected' ||
      isMutedRef.current ||
      isAiSpeakingRef.current ||
      isProcessingTurnRef.current
    ) {
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCallStatusMessage('Voice recognition is not supported in this browser. Use the quick buttons below.');
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    try {
      speechTranscriptRef.current = '';
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = callLanguage;

      recognition.onstart = () => {
        setIsUserListening(true);
        setCallStatusMessage(
          callLanguage === 'bn-BD'
            ? 'শুনছি... সরাসরি কথা বলুন'
            : 'Listening... speak directly'
        );
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcriptChunk + ' ';
          } else {
            interim += transcriptChunk;
          }
        }
        const combined = (final + interim).trim();
        speechTranscriptRef.current = combined;
        setUserSpeechInput(combined);

        // Auto-detect Bengali script in speech and adapt language indicator
        if (/[\u0980-\u09FF]/.test(combined) && callLanguage !== 'bn-BD') {
          setCallLanguage('bn-BD');
        }

        // Reset silence timer on every spoken word
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // When user pauses speaking for 1.2s, auto-send turn to Gemini!
        if (combined.length > 0) {
          silenceTimerRef.current = setTimeout(() => {
            const textToSend = speechTranscriptRef.current.trim();
            if (textToSend && !isProcessingTurnRef.current) {
              stopListening();
              speechTranscriptRef.current = '';
              setCallStatusMessage(
                callLanguage === 'bn-BD'
                  ? 'প্রসেস হচ্ছে...'
                  : 'Processing your instruction...'
              );
              handleConversationalVoiceTurn(textToSend);
            }
          }, 1200);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('Speech recognition notice:', event.error);
        }
      };

      recognition.onend = () => {
        setIsUserListening(false);
        recognitionRef.current = null;

        // If there is an unsent transcript, send it
        const pendingText = speechTranscriptRef.current.trim();
        if (pendingText && !isProcessingTurnRef.current && !isAiSpeakingRef.current) {
          speechTranscriptRef.current = '';
          setCallStatusMessage(
            callLanguage === 'bn-BD'
              ? 'প্রসেস হচ্ছে...'
              : 'Processing your instruction...'
          );
          handleConversationalVoiceTurn(pendingText);
          return;
        }

        // Otherwise keep listening loop alive while call is connected and unmuted
        if (
          callStateRef.current === 'connected' &&
          !isMutedRef.current &&
          !isAiSpeakingRef.current &&
          !isProcessingTurnRef.current
        ) {
          autoRestartTimerRef.current = setTimeout(() => {
            startAutoListening();
          }, 250);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Failed to start speech recognition loop:', e);
      setIsUserListening(false);
    }
  };

  // When user answers (connects): GID speaks immediately without delay!
  useEffect(() => {
    if (callState === 'connected') {
      playInstantBriefing();
    }
  }, [callState]);

  const playInstantBriefing = async () => {
    stopListening();
    setCallStatusMessage(callLanguage === 'bn-BD' ? 'কথা বলছি...' : 'Speaking...');

    let scriptToSpeak = briefingText;
    if (!scriptToSpeak) {
      try {
        const prepPromise = voiceCallService.prepareCall(tasks, userName, voiceName, callType);
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
      () => {
        setIsAiSpeaking(true);
        stopListening();
      },
      () => {
        setIsAiSpeaking(false);
        setCallStatusMessage(
          callLanguage === 'bn-BD'
            ? 'শুনছি... সরাসরি কথা বলুন'
            : 'Listening... speak directly'
        );
        startAutoListening();
      }
    );
  };

  // Toggle Mute / Interrupt AI Speech
  const toggleMuteOrInterrupt = () => {
    hapticService.lightTap();

    // If AI is currently speaking, user tapping mic interrupts the AI (barge-in) and opens mic!
    if (isAiSpeaking) {
      audioService.stopSpeaking();
      setIsAiSpeaking(false);
      setIsMuted(false);
      isMutedRef.current = false;
      setUserSpeechInput('');
      setCallStatusMessage(callLanguage === 'bn-BD' ? 'বলুন, শুনছি...' : 'Go ahead, listening...');
      startAutoListening();
      return;
    }

    // Otherwise toggle Mute / Unmute
    if (!isMuted) {
      setIsMuted(true);
      isMutedRef.current = true;
      stopListening();
      setCallStatusMessage(
        callLanguage === 'bn-BD'
          ? 'মাইক্রোফোন মিউট করা হয়েছে (আনমিউট করতে ট্যাপ করুন)'
          : 'Microphone muted (tap to unmute)'
      );
    } else {
      setIsMuted(false);
      isMutedRef.current = false;
      startAutoListening();
    }
  };

  // Conversational Multi-turn AI Call: handles spoken instructions, modifying tasks, Bangla, etc.
  const handleConversationalVoiceTurn = async (spokenText: string) => {
    if (!spokenText.trim() || isProcessingTurn) return;
    setIsProcessingTurn(true);
    stopListening();
    setUserSpeechInput('');

    const newHistory = [...conversationHistory, { role: 'user' as const, content: spokenText }];
    setConversationHistory(newHistory);

    try {
      turnController.current = new AbortController();
      const data = await askAssistant(newHistory, tasksRef.current, hybridMode, {
        userName, voice: voiceName, language: callLanguage === 'bn-BD' ? 'bn' : 'en',
      }, turnController.current.signal);
      if (turnController.current.signal.aborted) return;
      {
        const outcome = data.action ? onAction(data.action) : null;
        if (outcome && !outcome.ok) { data.reply = outcome.message; data.audioBase64 = null; }
        if (outcome?.ok) setActionNotice({ type: data.action.action === 'CREATE_TASK' ? 'create' : data.action.action === 'COMPLETE_TASK' ? 'complete' : data.action.action === 'DELETE_TASK' ? 'delete' : 'update', text: outcome.message });
        const reply = data.reply || (callLanguage === 'bn-BD' ? 'আমি বিষয়টি নোট করেছি।' : 'I have noted that.');
        setBriefingText(reply);
        setConversationHistory((prev) => [...prev, { role: 'assistant', content: reply }]);

        // Speak response out loud in the call & automatically resume listening when done
        if (data.audioBase64) {
          audioService.preloadAudioFromBase64(data.audioBase64, data.mimeType || 'audio/mp3', reply);
          await audioService.playPreloadedOrSpeak(
            reply,
            voiceName,
            () => {
              setIsAiSpeaking(true);
              stopListening();
            },
            () => {
              setIsAiSpeaking(false);
              setCallStatusMessage(
                callLanguage === 'bn-BD'
                  ? 'শুনছি... সরাসরি কথা বলুন'
                  : 'Listening... speak directly'
              );
              startAutoListening();
            }
          );
        } else {
          await audioService.speakBriefing(
            reply,
            voiceName,
            () => {
              setIsAiSpeaking(true);
              stopListening();
            },
            () => {
              setIsAiSpeaking(false);
              setCallStatusMessage(
                callLanguage === 'bn-BD'
                  ? 'শুনছি... সরাসরি কথা বলুন'
                  : 'Listening... speak directly'
              );
              startAutoListening();
            }
          );
        }
      }
    } catch (err) {
      console.warn('Fallback to local call command parser:', err);
      setCallStatusMessage('Please try that instruction again.');
      startAutoListening();
    } finally {
      setIsProcessingTurn(false);
    }
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
          <div className="flex flex-col items-center my-3 space-y-2.5">
            <div className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              isAiSpeaking
                ? 'bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-xl shadow-indigo-500/50 scale-105 ring-4 ring-indigo-500/20'
                : isMuted
                ? 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
                : isUserListening
                ? 'bg-emerald-500 shadow-xl shadow-emerald-500/40 scale-105 ring-4 ring-emerald-500/20'
                : 'bg-slate-800 border border-slate-700'
            }`}>
              {isAiSpeaking ? (
                <Volume2 className="w-10 h-10 text-white animate-pulse" />
              ) : isMuted ? (
                <MicOff className="w-10 h-10 text-rose-400" />
              ) : isUserListening ? (
                <Mic className="w-10 h-10 text-white animate-pulse" />
              ) : (
                <Sparkles className="w-9 h-9 text-slate-400" />
              )}
            </div>

            {/* Audio Wave Bars */}
            <div className="flex items-center justify-center gap-1.5 h-6">
              {[40, 70, 90, 60, 100, 75, 45, 80, 50].map((height, i) => (
                <span
                  key={i}
                  style={{
                    height: isAiSpeaking || isUserListening ? `${height}%` : '20%',
                    transition: 'height 0.15s ease-in-out',
                  }}
                  className={`w-1 rounded-full ${
                    isAiSpeaking
                      ? 'bg-indigo-400'
                      : isMuted
                      ? 'bg-slate-700'
                      : isUserListening
                      ? 'bg-emerald-400'
                      : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>

            {/* Hands-Free Live Status Badge */}
            <div className="flex flex-col items-center gap-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                isMuted
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : isAiSpeaking
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : isProcessingTurn
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
              }`}>
                {!isMuted && !isAiSpeaking && !isProcessingTurn && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
                {isMuted
                  ? 'Muted (Tap mic to talk)'
                  : isAiSpeaking
                  ? 'AI Speaking (Tap mic to interrupt)'
                  : isProcessingTurn
                  ? 'Thinking...'
                  : '🎙️ Hands-Free Live • Speak directly'}
              </span>
              <p className="text-[11px] font-mono text-slate-400 text-center px-4">
                {callStatusMessage}
              </p>
            </div>
          </div>

          {/* Live Spoken Dialogue Box */}
          <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 text-left my-1.5 max-h-36 overflow-y-auto space-y-2">
            {userSpeechInput && (
              <div className="p-2 rounded-xl bg-slate-800/60 border border-emerald-500/30 text-[11px] text-emerald-300 font-mono animate-in fade-in">
                🗣️ You: "{userSpeechInput}"
              </div>
            )}
            <p className="text-xs text-slate-200 leading-relaxed font-sans">
              "{briefingText || (callLanguage === 'bn-BD' ? 'কীভাবে সাহায্য করতে পারি বলুন...' : 'How can I help you today?')}"
            </p>
          </div>

          {/* Quick Spoken Instruction Chips (English & Bangla) */}
          <div className="w-full py-1">
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

          {/* Controls: Replay + Hands-Free Mic / Mute + End Call */}
          <div className="w-full pt-3 flex items-center justify-around border-t border-slate-800">
            {/* Repeat Briefing / Reply Button */}
            <button
              onClick={playInstantBriefing}
              title="Repeat speech"
              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700"
            >
              <RefreshCw className="w-5 h-5" />
            </button>

            {/* User Speech Mic Button (Direct Voice Active / Mute / Interrupt) */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={toggleMuteOrInterrupt}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-md touch-manipulation min-h-[64px] min-w-[64px] ${
                  isMuted
                    ? 'bg-slate-800 border-2 border-rose-500/60 text-rose-400 hover:bg-rose-500/20'
                    : isAiSpeaking
                    ? 'bg-indigo-600/70 border-2 border-indigo-400 text-white animate-pulse'
                    : isUserListening
                    ? 'bg-emerald-500 text-white animate-pulse shadow-emerald-500/40 ring-4 ring-emerald-500/25 scale-105'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                }`}
                title={
                  isMuted
                    ? 'Unmute microphone'
                    : isAiSpeaking
                    ? 'Tap to interrupt AI'
                    : 'Tap to mute microphone'
                }
              >
                {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
              </button>
              <span className="text-[10px] text-slate-400 font-medium">
                {isMuted ? 'Muted' : isAiSpeaking ? 'Interrupt' : 'Direct Voice'}
              </span>
            </div>

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
