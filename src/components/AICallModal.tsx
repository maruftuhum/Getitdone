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
  RotateCcw, 
  CheckCircle2, 
  Edit3, 
  Trash2,
  Calendar,
  Zap,
  Bot
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
  voiceName = 'Puck',
}) => {
  const [callDuration, setCallDuration] = useState(0);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserListening, setIsUserListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const [userSpeechInput, setUserSpeechInput] = useState('');
  const [callStatusMessage, setCallStatusMessage] = useState('Connecting with Aria...');
  const [isPreloaded, setIsPreloaded] = useState(false);
  
  // Interactive Call & Multi-language States
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

  // Pre-load what Aria will say before the user picks up
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
      setCallStatusMessage('Voice recognition is unavailable on this browser. Tap quick actions below.');
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
            ? 'শুনছি... কথা বলুন'
            : 'Listening... speak freely'
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

        // When user pauses speaking for 950ms, send turn smoothly
        if (combined.length > 0) {
          silenceTimerRef.current = setTimeout(() => {
            const textToSend = speechTranscriptRef.current.trim();
            if (textToSend && !isProcessingTurnRef.current) {
              stopListening();
              speechTranscriptRef.current = '';
              setCallStatusMessage(
                callLanguage === 'bn-BD'
                  ? 'ভাবছি...'
                  : 'Aria is thinking...'
              );
              handleConversationalVoiceTurn(textToSend);
            }
          }, 950);
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
              ? 'ভাবছি...'
              : 'Aria is thinking...'
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
          }, 200);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Failed to start speech recognition loop:', e);
      setIsUserListening(false);
    }
  };

  // When user answers: Aria speaks immediately with warmth
  useEffect(() => {
    if (callState === 'connected') {
      playInstantBriefing();
    }
  }, [callState]);

  const playInstantBriefing = async () => {
    stopListening();
    setCallStatusMessage(callLanguage === 'bn-BD' ? 'কথা বলছি...' : 'Aria is speaking...');

    let scriptToSpeak = briefingText;
    if (!scriptToSpeak) {
      try {
        const prepPromise = voiceCallService.prepareCall(tasks, userName, voiceName, callType);
        const timeoutPromise = new Promise<{ script: string }>((resolve) =>
          setTimeout(
            () => resolve({ script: voiceCallService.getInstantFallbackScript(tasks, userName) }),
            400
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
            ? 'শুনছি... কথা বলুন'
            : 'Listening... speak freely'
        );
        startAutoListening();
      }
    );
  };

  // Toggle Mute / Barge-in to Interrupt Aria
  const toggleMuteOrInterrupt = () => {
    hapticService.lightTap();

    // If Aria is speaking, tapping mic interrupts her immediately and opens mic!
    if (isAiSpeaking) {
      audioService.stopSpeaking();
      setIsAiSpeaking(false);
      setIsMuted(false);
      isMutedRef.current = false;
      setUserSpeechInput('');
      setCallStatusMessage(callLanguage === 'bn-BD' ? 'বলুন, শুনছি...' : "Go ahead, I'm listening...");
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
          ? 'মাইক্রোফোন মিউট করা হয়েছে'
          : 'Microphone muted (tap to unmute)'
      );
    } else {
      setIsMuted(false);
      isMutedRef.current = false;
      startAutoListening();
    }
  };

  // Conversational Multi-turn Voice Turn
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
        const reply = data.reply || (callLanguage === 'bn-BD' ? 'ঠিক আছে, আমি খেয়াল রাখছি।' : "Got it, I've got you covered!");
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
                  ? 'শুনছি... কথা বলুন'
                  : 'Listening... speak freely'
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
                  ? 'শুনছি... কথা বলুন'
                  : 'Listening... speak freely'
              );
              startAutoListening();
            }
          );
        }
      }
    } catch (err) {
      console.warn('Fallback to local assistant turn:', err);
      setCallStatusMessage("I'm right here. Could you say that again?");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-2xl animate-fade-in p-4 select-none">
      {/* INCOMING RINGING SCREEN */}
      {callState === 'ringing' && (
        <div className="w-full max-w-sm flex flex-col items-center justify-between min-h-[540px] py-10 px-6 text-white text-center">
          {/* Top Caller Information */}
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30 shadow-sm shadow-indigo-500/10">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Personal Chief of Staff</span>
            </span>
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">Aria</h2>
              <p className="text-xs text-indigo-200/80 font-medium mt-1">Get It Done Assistant</p>
            </div>

            <div className="flex items-center justify-center pt-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                isPreloaded
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 animate-pulse'
              }`}>
                {isPreloaded ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Briefing Ready</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                    <span>Preparing your day...</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Central Pulsing Avatar Ring */}
          <div className="relative my-8">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/30 to-violet-500/30 animate-ping duration-1000" />
            <div className="absolute -inset-6 rounded-full bg-indigo-500/15 animate-pulse" />
            <div className="relative w-32 h-32 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex flex-col items-center justify-center shadow-2xl shadow-indigo-500/50 border-4 border-white/20">
              <Bot className="w-12 h-12 text-white drop-shadow-md" />
              <span className="text-[10px] font-bold tracking-widest text-indigo-200 mt-1 uppercase">Aria</span>
            </div>
          </div>

          {/* Incoming Details & Answer / Decline Actions */}
          <div className="w-full space-y-6">
            <p className="text-xs text-slate-400 font-medium">
              {pendingCount === 0 ? 'Schedule is clear' : `${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'} to review with you`}
            </p>

            <div className="flex items-center justify-around gap-6 pt-2">
              {/* Decline Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={onDeclineCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-rose-600/30 transition-all touch-manipulation"
                  title="Decline"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-xs font-medium text-slate-400">Decline</span>
              </div>

              {/* Answer Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={onAnswerCall}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-emerald-500/40 transition-all animate-pulse touch-manipulation"
                  title="Answer"
                >
                  <Phone className="w-7 h-7" />
                </button>
                <span className="text-xs font-semibold text-emerald-400">Answer</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONNECTED CALL SCREEN (Natural Conversational Assistant) */}
      {callState === 'connected' && (
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-between min-h-[620px] text-white backdrop-blur-xl">
          {/* Header, Duration & Language Switcher */}
          <div className="w-full flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Aria
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Chief of Staff
                  </span>
                </h3>
                <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Call · {formatTimer(callDuration)}
                </span>
              </div>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <button
                type="button"
                onClick={() => setCallLanguage('en-US')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  callLanguage === 'en-US'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setCallLanguage('bn-BD')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  callLanguage === 'bn-BD'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="বাংলা"
              >
                বাংলা
              </button>
            </div>
          </div>

          {/* Action Notification Toast */}
          {actionNotice && (
            <div className="w-full mt-2 p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/40 flex items-center gap-2 text-xs text-indigo-200 animate-in fade-in slide-in-from-top-2">
              {actionNotice.type === 'create' && <Plus className="w-4 h-4 text-emerald-400 shrink-0" />}
              {actionNotice.type === 'update' && <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />}
              {actionNotice.type === 'complete' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
              {actionNotice.type === 'delete' && <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />}
              <span className="truncate font-medium">{actionNotice.text}</span>
            </div>
          )}

          {/* Central Living Orb Visualizer */}
          <div className="flex flex-col items-center my-4 space-y-3">
            <div className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
              isAiSpeaking
                ? 'bg-gradient-to-tr from-indigo-500 via-violet-500 to-indigo-600 shadow-2xl shadow-indigo-500/60 scale-105 ring-8 ring-indigo-500/20'
                : isMuted
                ? 'bg-slate-800 border-2 border-rose-500/40 text-rose-300'
                : isUserListening
                ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-2xl shadow-emerald-500/50 scale-105 ring-8 ring-emerald-500/20'
                : 'bg-slate-800 border border-slate-700'
            }`}>
              {isAiSpeaking ? (
                <Volume2 className="w-12 h-12 text-white animate-pulse" />
              ) : isMuted ? (
                <MicOff className="w-11 h-11 text-rose-400" />
              ) : isUserListening ? (
                <Mic className="w-12 h-12 text-white animate-pulse" />
              ) : (
                <Sparkles className="w-10 h-10 text-indigo-300 animate-spin" />
              )}
            </div>

            {/* Reactive Sound Bars */}
            <div className="flex items-center justify-center gap-1.5 h-6">
              {[35, 75, 95, 60, 100, 80, 50, 85, 45].map((height, i) => (
                <span
                  key={i}
                  style={{
                    height: isAiSpeaking || isUserListening ? `${height}%` : '20%',
                    transition: 'height 0.15s ease-in-out',
                  }}
                  className={`w-1 rounded-full ${
                    isAiSpeaking
                      ? 'bg-indigo-400 shadow-sm shadow-indigo-400'
                      : isMuted
                      ? 'bg-slate-700'
                      : isUserListening
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                      : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>

            {/* Hands-Free State Badge */}
            <div className="flex flex-col items-center gap-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                isMuted
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : isAiSpeaking
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/10'
                  : isProcessingTurn
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
              }`}>
                {!isMuted && !isAiSpeaking && !isProcessingTurn && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
                {isMuted
                  ? 'Muted · Tap mic to speak'
                  : isAiSpeaking
                  ? 'Aria Speaking · Tap mic to interrupt'
                  : isProcessingTurn
                  ? 'Thinking...'
                  : '🎙️ Hands-Free Live · Speak naturally'}
              </span>
              <p className="text-[11px] font-mono text-slate-400 text-center px-4">
                {callStatusMessage}
              </p>
            </div>
          </div>

          {/* Natural Dialogue Stream Box */}
          <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 text-left my-2 max-h-36 overflow-y-auto space-y-2">
            {userSpeechInput && (
              <div className="p-2 rounded-xl bg-slate-800/80 border border-emerald-500/30 text-xs text-emerald-300 font-mono animate-in fade-in">
                🗣️ You: "{userSpeechInput}"
              </div>
            )}
            <p className="text-sm text-slate-200 leading-relaxed font-sans font-medium">
              "{briefingText || (callLanguage === 'bn-BD' ? 'কীভাবে সাহায্য করতে পারি বলুন...' : "How's your day going? How can I help?")}"
            </p>
          </div>

          {/* Thought Suggestions */}
          <div className="w-full py-1">
            <div className="flex flex-wrap gap-1.5 justify-center">
              {callLanguage === 'bn-BD' ? (
                <>
                  <button
                    onClick={() => handleQuickAction('আজকের প্রথম কাজ শেষ হয়েছে')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    কাজ শেষ
                  </button>
                  <button
                    onClick={() => handleQuickAction('আজকে বিকেল ৫টায় বাজার করার টাস্ক অ্যাড করো')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    টাস্ক যোগ করো
                  </button>
                  <button
                    onClick={() => handleQuickAction('আজকে আমার আর কি কি কাজ বাকি আছে?')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    বাকি কাজ কি?
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleQuickAction("What's on my schedule today?")}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    What's on my schedule?
                  </button>
                  <button
                    onClick={() => handleQuickAction('Mark top task as completed')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Mark first task done
                  </button>
                  <button
                    onClick={() => handleQuickAction('Reschedule my next task to tomorrow')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                  >
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    Push to tomorrow
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Controls: Replay / Repeat + Hands-Free Mic / Barge-In + Hang Up */}
          <div className="w-full pt-3 flex items-center justify-around border-t border-slate-800">
            {/* Repeat Briefing / Reply Button */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={playInstantBriefing}
                title="Repeat speech"
                className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700 shadow-sm"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <span className="text-[10px] text-slate-400 font-medium">Repeat</span>
            </div>

            {/* User Speech Mic Button (Direct Voice Active / Mute / Interrupt) */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={toggleMuteOrInterrupt}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl touch-manipulation min-h-[64px] min-w-[64px] ${
                  isMuted
                    ? 'bg-slate-800 border-2 border-rose-500/60 text-rose-400 hover:bg-rose-500/20'
                    : isAiSpeaking
                    ? 'bg-indigo-600 border-2 border-indigo-400 text-white animate-pulse shadow-indigo-600/50'
                    : isUserListening
                    ? 'bg-emerald-500 text-white animate-pulse shadow-emerald-500/50 ring-4 ring-emerald-500/30 scale-105'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/40'
                }`}
                title={
                  isMuted
                    ? 'Unmute microphone'
                    : isAiSpeaking
                    ? 'Tap to interrupt Aria'
                    : 'Tap to mute microphone'
                }
              >
                {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
              </button>
              <span className="text-[11px] font-semibold text-slate-300">
                {isMuted ? 'Muted' : isAiSpeaking ? 'Interrupt' : 'Direct Voice'}
              </span>
            </div>

            {/* End Call Hangup */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={onEndCall}
                className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all touch-manipulation"
                title="Hang Up"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
              <span className="text-[10px] text-slate-400 font-medium">End Call</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
