import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
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
  Bot,
  Send,
  Radio,
  Minimize2,
  Maximize2
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
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);

  // Floating Picture-in-Picture (PiP / Voice Chat Head) State
  const [isPiPMode, setIsPiPMode] = useState(false);
  const [pipPosition, setPipPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(12, window.innerWidth - 330) : 20,
    y: typeof window !== 'undefined' ? Math.max(70, window.innerHeight - 170) : 100,
  }));
  const [isDraggingPip, setIsDraggingPip] = useState(false);
  const pipDragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const didPipDragRef = useRef(false);

  // Live Audio Spectrum & Volume from Web Audio API Analyser
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<number[]>([18, 25, 32, 28, 40, 30, 22, 18, 15]);

  // Interactive Call & Multi-language States
  const [callLanguage, setCallLanguage] = useState<'en-US' | 'bn-BD'>('en-US');
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [actionNotice, setActionNotice] = useState<{ type: 'create' | 'update' | 'complete' | 'delete'; text: string } | null>(null);

  // Refs for precise synchronous state management (prevents race conditions and echo loops)
  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const speechTranscriptRef = useRef<string>('');
  const lastTranscriptTextRef = useRef<string>(''); // Prevents clearing silence timer on identical interim frames
  const tasksRef = useRef<Task[]>(tasks);
  const turnController = useRef<AbortController | null>(null);
  const isMutedRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const isProcessingTurnRef = useRef(false);
  const callStateRef = useRef(callState);
  const silenceTimerRef = useRef<any>(null);
  const autoRestartTimerRef = useRef<any>(null);
  const lastAiSpeechEndTimeRef = useRef<number>(0);
  const turnWatchdogRef = useRef<any>(null);

  // Web Audio Analyser Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (callState === 'idle') {
      setIsPiPMode(false);
    }
  }, [callState]);

  // PiP Drag Physics & Smooth Edge Snapping
  const handlePipDragStart = (clientX: number, clientY: number) => {
    didPipDragRef.current = false;
    pipDragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: pipPosition.x,
      initialY: pipPosition.y,
    };
    setIsDraggingPip(true);
  };

  const handlePipDragMove = (clientX: number, clientY: number) => {
    if (!pipDragStartRef.current) return;
    const deltaX = clientX - pipDragStartRef.current.startX;
    const deltaY = clientY - pipDragStartRef.current.startY;
    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
      didPipDragRef.current = true;
    }
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 640;
    const pillWidth = 320;
    const pillHeight = 72;
    const newX = Math.max(8, Math.min(screenWidth - pillWidth, pipDragStartRef.current.initialX + deltaX));
    const newY = Math.max(40, Math.min(screenHeight - pillHeight - 16, pipDragStartRef.current.initialY + deltaY));
    setPipPosition({ x: newX, y: newY });
  };

  const handlePipDragEnd = () => {
    if (!pipDragStartRef.current) return;
    setIsDraggingPip(false);
    pipDragStartRef.current = null;
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const pillWidth = 320;
    const margin = 12;
    setPipPosition((prev) => ({
      ...prev,
      x: prev.x < screenWidth / 2 ? margin : Math.max(margin, screenWidth - pillWidth - margin),
    }));
  };

  useEffect(() => {
    if (!isDraggingPip) return;
    const onMove = (e: MouseEvent) => handlePipDragMove(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 1) handlePipDragMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onEnd = () => handlePipDragEnd();

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouch, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [isDraggingPip]);

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
    lastTranscriptTextRef.current = '';
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

  // Start Real-Time Web Audio Analyser (Live Voice Frequency & Energy)
  const startAudioAnalyser = async () => {
    try {
      if (micStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current && AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current?.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      if (audioCtxRef.current) {
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let bargeInConsecutiveFrames = 0;
        let quietConsecutiveFrames = 0;

        const updateMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          // Calculate RMS volume level
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          const normalizedVol = Math.min(100, Math.round((avg / 128) * 100));
          setAudioVolume(normalizedVol);

          // Sample 9 harmonic frequency bands for visualizer bars
          const bands: number[] = [];
          const step = Math.floor(bufferLength / 9) || 1;
          for (let i = 0; i < 9; i++) {
            const val = dataArray[i * step] || 0;
            bands.push(Math.max(15, Math.min(100, Math.round((val / 255) * 100))));
          }
          setFrequencyData(bands);

          // True Gemini Live Voice-Activated Barge-In:
          // If Aria is speaking and user starts talking, detect volume spike and yield immediately
          if (isAiSpeakingRef.current && normalizedVol > 24) {
            bargeInConsecutiveFrames++;
            if (bargeInConsecutiveFrames >= 3) {
              bargeInConsecutiveFrames = 0;
              handleVoiceBargeIn();
            }
          } else {
            bargeInConsecutiveFrames = 0;
          }

          // Voice Activity Silence Detection (Zero-wait turnaround):
          // If user was speaking (transcript has content), and microphone audio drops below silence threshold for ~330ms (approx 20 frames at 60fps), trigger turn submission!
          if (
            !isAiSpeakingRef.current &&
            !isProcessingTurnRef.current &&
            speechTranscriptRef.current.trim().length > 0 &&
            normalizedVol < 14
          ) {
            quietConsecutiveFrames++;
            if (quietConsecutiveFrames >= 20) {
              quietConsecutiveFrames = 0;
              const textToSend = speechTranscriptRef.current.trim();
              if (textToSend) {
                stopListening();
                speechTranscriptRef.current = '';
                lastTranscriptTextRef.current = '';
                setCallStatusMessage(
                  callLanguage === 'bn-BD' ? 'ভাবছি...' : 'Aria is thinking...'
                );
                handleConversationalVoiceTurn(textToSend);
              }
            }
          } else {
            quietConsecutiveFrames = 0;
          }

          rafIdRef.current = requestAnimationFrame(updateMeter);
        };

        rafIdRef.current = requestAnimationFrame(updateMeter);
      }
    } catch (e) {
      console.warn('Microphone stream access not granted for visualizer:', e);
    }
  };

  const stopAudioAnalyser = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    setAudioVolume(0);
  };

  // Immediate Voice Barge-In: interrupt Aria mid-sentence
  const handleVoiceBargeIn = () => {
    if (turnWatchdogRef.current) {
      clearTimeout(turnWatchdogRef.current);
      turnWatchdogRef.current = null;
    }
    audioService.stopSpeaking();
    isAiSpeakingRef.current = false;
    setIsAiSpeaking(false);
    isProcessingTurnRef.current = false; // CRITICAL: release turn lock on barge-in
    setIsProcessingTurn(false);
    isMutedRef.current = false;
    setIsMuted(false);
    speechTranscriptRef.current = '';
    lastTranscriptTextRef.current = '';
    hapticService.lightTap();
    setCallStatusMessage(callLanguage === 'bn-BD' ? 'শুনছি... বলুন' : "Listening... I'm right here");
    startAutoListening();
  };

  useEffect(() => {
    return () => {
      turnController.current?.abort();
      stopListening();
      stopAudioAnalyser();
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
      startAudioAnalyser();
      timerRef.current = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      stopListening();
      stopAudioAnalyser();
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

  // Pre-load what Aria will say before the user answers
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
        // Echo isolation: if Aria just finished speaking within 180ms, ignore residual speaker echo
        if (Date.now() - lastAiSpeechEndTimeRef.current < 180) {
          return;
        }

        // If Aria is speaking and speech recognized, trigger barge-in!
        if (isAiSpeakingRef.current) {
          handleVoiceBargeIn();
        }

        let interim = '';
        let final = '';
        let hasFinalResult = false;
        for (let i = 0; i < event.results.length; i++) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcriptChunk + ' ';
            hasFinalResult = true;
          } else {
            interim += transcriptChunk;
          }
        }
        const combined = (final + interim).trim();
        if (!combined) return;

        const isNewText = combined !== lastTranscriptTextRef.current;
        lastTranscriptTextRef.current = combined;
        speechTranscriptRef.current = combined;
        setUserSpeechInput(combined);

        // Auto-detect Bengali script in speech and adapt language indicator
        if (/[\u0980-\u09FF]/.test(combined) && callLanguage !== 'bn-BD') {
          setCallLanguage('bn-BD');
        }

        // Only reset silence timer when text actually changes or final chunk arrived!
        // This stops duplicate interim frames from indefinitely postponing the timer.
        if (isNewText || hasFinalResult || !silenceTimerRef.current) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Snappy turnaround: 280ms if final result, 350ms for complete sentence, 420ms for natural pause
          const isCompleteThought = hasFinalResult || /[.?!]$/.test(combined) || combined.split(/\s+/).length >= 4;
          const silenceDelay = hasFinalResult ? 280 : isCompleteThought ? 350 : 420;

          silenceTimerRef.current = setTimeout(() => {
            const textToSend = speechTranscriptRef.current.trim();
            if (textToSend && !isProcessingTurnRef.current && !isAiSpeakingRef.current) {
              stopListening();
              speechTranscriptRef.current = '';
              lastTranscriptTextRef.current = '';
              setCallStatusMessage(
                callLanguage === 'bn-BD' ? 'ভাবছি...' : 'Aria is thinking...'
              );
              handleConversationalVoiceTurn(textToSend);
            }
          }, silenceDelay);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition notice:', event.error);
        }
      };

      recognition.onend = () => {
        setIsUserListening(false);
        recognitionRef.current = null;

        // If there is an unsent transcript, send it immediately
        const pendingText = speechTranscriptRef.current.trim();
        if (pendingText && !isProcessingTurnRef.current && !isAiSpeakingRef.current) {
          speechTranscriptRef.current = '';
          lastTranscriptTextRef.current = '';
          setCallStatusMessage(
            callLanguage === 'bn-BD' ? 'ভাবছি...' : 'Aria is thinking...'
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
          }, 150);
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
            350
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

    const onSpeechStart = () => {
      isAiSpeakingRef.current = true;
      setIsAiSpeaking(true);
      stopListening();
    };

    const onSpeechEnd = () => {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      lastAiSpeechEndTimeRef.current = Date.now();
      setCallStatusMessage(
        callLanguage === 'bn-BD'
          ? 'শুনছি... কথা বলুন'
          : 'Listening... speak freely'
      );
      // Guard delay (180ms) before re-arming speech recognition prevents speaker feedback
      setTimeout(() => {
        startAutoListening();
      }, 180);
    };

    await audioService.playPreloadedOrSpeak(
      scriptToSpeak,
      voiceName,
      onSpeechStart,
      onSpeechEnd
    );
  };

  // Toggle Mute / Barge-in to Interrupt Aria
  const toggleMuteOrInterrupt = () => {
    hapticService.lightTap();

    // If Aria is speaking, tapping mic interrupts her immediately and opens mic!
    if (isAiSpeaking) {
      handleVoiceBargeIn();
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
    const cleanText = spokenText.trim();
    if (!cleanText || isProcessingTurnRef.current) return;
    isProcessingTurnRef.current = true;
    setIsProcessingTurn(true);
    stopListening();
    setUserSpeechInput('');
    speechTranscriptRef.current = '';
    lastTranscriptTextRef.current = '';

    // Safety watchdog: ensure turn lock is NEVER permanently stuck (e.g. dropped TTS or network hang)
    if (turnWatchdogRef.current) clearTimeout(turnWatchdogRef.current);
    turnWatchdogRef.current = setTimeout(() => {
      if (isProcessingTurnRef.current) {
        console.warn('Voice turn watchdog timeout - resetting turn lock');
        isProcessingTurnRef.current = false;
        setIsProcessingTurn(false);
        isAiSpeakingRef.current = false;
        setIsAiSpeaking(false);
        startAutoListening();
      }
    }, 12000);

    const newHistory = [...conversationHistory, { role: 'user' as const, content: cleanText }];
    setConversationHistory(newHistory);

    try {
      turnController.current = new AbortController();
      const data = await askAssistant(
        newHistory,
        tasksRef.current,
        hybridMode,
        {
          userName,
          voice: voiceName,
          language: callLanguage === 'bn-BD' ? 'bn' : 'en',
        },
        turnController.current.signal
      );
      if (turnController.current?.signal.aborted) {
        isProcessingTurnRef.current = false;
        setIsProcessingTurn(false);
        return;
      }

      const outcome = data.action ? onAction(data.action) : null;
      if (outcome && !outcome.ok) {
        data.reply = outcome.message;
        data.audioBase64 = null;
      }
      if (outcome?.ok) {
        setActionNotice({
          type:
            data.action.action === 'CREATE_TASK'
              ? 'create'
              : data.action.action === 'COMPLETE_TASK'
              ? 'complete'
              : data.action.action === 'DELETE_TASK'
              ? 'delete'
              : 'update',
          text: outcome.message,
        });
        hapticService.taskCreate();
      }

      const reply = data.reply || (callLanguage === 'bn-BD' ? 'ঠিক আছে, আমি খেয়াল রাখছি।' : "Got it, I've got you covered!");
      setBriefingText(reply);
      setConversationHistory((prev) => [...prev, { role: 'assistant', content: reply }]);

      // Speak response out loud in the call & automatically resume listening when done
      const onSpeechStart = () => {
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        stopListening();
        setCallStatusMessage(callLanguage === 'bn-BD' ? 'কথা বলছি...' : 'Aria is speaking...');
      };

      const onSpeechEnd = () => {
        if (turnWatchdogRef.current) {
          clearTimeout(turnWatchdogRef.current);
          turnWatchdogRef.current = null;
        }
        isAiSpeakingRef.current = false;
        setIsAiSpeaking(false);
        isProcessingTurnRef.current = false;
        setIsProcessingTurn(false);
        lastAiSpeechEndTimeRef.current = Date.now();
        setCallStatusMessage(
          callLanguage === 'bn-BD'
            ? 'শুনছি... কথা বলুন'
            : 'Listening... speak freely'
        );
        setTimeout(() => {
          startAutoListening();
        }, 180);
      };

      if (data.audioBase64) {
        audioService.preloadAudioFromBase64(data.audioBase64, data.mimeType || 'audio/mp3', reply);
        await audioService.playPreloadedOrSpeak(reply, voiceName, onSpeechStart, onSpeechEnd);
      } else {
        await audioService.speakBriefing(reply, voiceName, onSpeechStart, onSpeechEnd);
      }
    } catch (err) {
      console.warn('Voice turn error:', err);
      setCallStatusMessage("I'm right here. Could you say that again?");
      isProcessingTurnRef.current = false;
      setIsProcessingTurn(false);
      startAutoListening();
    } finally {
      if (!isAiSpeakingRef.current) {
        isProcessingTurnRef.current = false;
        setIsProcessingTurn(false);
      }
    }
  };

  // Instant Tap-To-Send / Done Speaking
  const handleInstantSend = () => {
    const textToSend = speechTranscriptRef.current.trim() || userSpeechInput.trim();
    if (textToSend) {
      hapticService.lightTap();
      stopListening();
      speechTranscriptRef.current = '';
      lastTranscriptTextRef.current = '';
      setCallStatusMessage(callLanguage === 'bn-BD' ? 'ভাবছি...' : 'Aria is thinking...');
      handleConversationalVoiceTurn(textToSend);
    } else if (isAiSpeaking) {
      handleVoiceBargeIn();
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

  // FLOATING PICTURE-IN-PICTURE (VOICE CHAT HEAD) SCREEN
  if (isPiPMode && callState === 'connected') {
    return (
      <div
        style={{
          left: `${pipPosition.x}px`,
          top: `${pipPosition.y}px`,
          touchAction: 'none',
        }}
        className={`fixed z-50 select-none ${isDraggingPip ? 'cursor-grabbing' : 'cursor-grab'} animate-in fade-in zoom-in-95 duration-200`}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest('button')) return;
          handlePipDragStart(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          if (e.touches.length === 1) {
            handlePipDragStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
      >
        {/* Real-time floating Action Notice (e.g. Task Added / Completed) */}
        {actionNotice && (
          <div className="mb-2 p-2 px-3 rounded-xl bg-slate-900/95 border border-indigo-500/50 flex items-center gap-2 text-xs text-indigo-200 shadow-xl backdrop-blur-xl animate-in slide-in-from-bottom-2">
            {actionNotice.type === 'create' && <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            {actionNotice.type === 'update' && <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            {actionNotice.type === 'complete' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            {actionNotice.type === 'delete' && <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
            <span className="truncate max-w-[200px] font-semibold">{actionNotice.text}</span>
          </div>
        )}

        {/* Floating Voice Chat Head Capsule */}
        <div className="flex items-center gap-3 p-2.5 pr-3 bg-slate-900/95 backdrop-blur-2xl border border-indigo-500/40 rounded-full shadow-2xl shadow-black/70 max-w-[330px] text-white">
          {/* Avatar Orb with Live Audio Halo */}
          <div
            onClick={handleInstantSend}
            className="relative cursor-pointer shrink-0"
            title={isAiSpeaking ? 'Tap to interrupt' : userSpeechInput ? 'Tap to send' : 'Tap to talk'}
          >
            {/* Halo wave ring */}
            <div
              style={{
                transform: `scale(${1 + (audioVolume / 100) * 0.4})`,
                opacity: isMuted ? 0.1 : isAiSpeaking ? 0.7 : 0.4 + (audioVolume / 100) * 0.5,
              }}
              className={`absolute -inset-1.5 rounded-full blur-md ${
                isMuted
                  ? 'bg-rose-500'
                  : isAiSpeaking
                  ? 'bg-gradient-to-tr from-indigo-500 to-cyan-400'
                  : isProcessingTurn
                  ? 'bg-cyan-500'
                  : 'bg-emerald-500'
              }`}
            />
            <div
              className={`relative w-11 h-11 rounded-full flex items-center justify-center border shadow-md ${
                isAiSpeaking
                  ? 'bg-gradient-to-tr from-indigo-600 to-cyan-500 border-indigo-300/40 shadow-indigo-500/50'
                  : isMuted
                  ? 'bg-slate-900 border-rose-500/50 text-rose-400 shadow-rose-950/40'
                  : isProcessingTurn
                  ? 'bg-gradient-to-tr from-slate-900 to-cyan-900 border-cyan-400/50 shadow-cyan-500/30'
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-500 border-emerald-300/40 shadow-emerald-500/40'
              }`}
            >
              {isAiSpeaking ? (
                <Radio className="w-5 h-5 text-white animate-pulse" />
              ) : isMuted ? (
                <MicOff className="w-5 h-5 text-rose-400" />
              ) : isProcessingTurn ? (
                <Sparkles className="w-5 h-5 text-cyan-300 animate-spin" />
              ) : (
                <Mic className="w-5 h-5 text-white animate-pulse" />
              )}
            </div>
          </div>

          {/* Central Info: Click to Expand back to Full-Screen */}
          <div
            onClick={() => {
              if (!didPipDragRef.current) {
                setIsPiPMode(false);
                hapticService.lightTap();
              }
            }}
            className="flex-1 min-w-0 cursor-pointer text-left pr-1"
            title="Tap to expand to full screen"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white tracking-wide">Aria</span>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {formatTimer(callDuration)}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate max-w-[145px] font-medium mt-0.5">
              {userSpeechInput
                ? `"${userSpeechInput}"`
                : isAiSpeaking
                ? (briefingText || 'Speaking...')
                : isProcessingTurn
                ? 'Thinking...'
                : isMuted
                ? 'Muted'
                : 'Listening...'}
            </p>
          </div>

          {/* Chat Head Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Mute / Interrupt */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMuteOrInterrupt();
              }}
              className={`p-2 rounded-full transition active:scale-95 ${
                isMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : isAiSpeaking
                  ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-400/40'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title={isMuted ? 'Unmute' : isAiSpeaking ? 'Interrupt Aria' : 'Mute mic'}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            {/* Maximize to Full Screen */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsPiPMode(false);
                hapticService.lightTap();
              }}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 border border-slate-700"
              title="Expand to Full Screen"
            >
              <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
            </button>

            {/* End Call */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEndCall();
              }}
              className="p-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white transition active:scale-95 shadow-md shadow-rose-600/30"
              title="End Call"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-3xl animate-fade-in p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && callState === 'connected') {
          setIsPiPMode(true);
        }
      }}
    >
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

      {/* CONNECTED CALL SCREEN (Gemini Live Experience) */}
      {callState === 'connected' && (
        <div className="w-full max-w-md bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-slate-900/95 border border-slate-800/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-between min-h-[640px] text-white backdrop-blur-2xl relative overflow-hidden">
          
          {/* Ambient Lighting Orbs */}
          <div className="absolute -top-24 -left-24 w-56 h-56 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-56 h-56 rounded-full bg-cyan-600/15 blur-3xl pointer-events-none" />

          {/* Top Bar: Aria Identity, Live Badge, PiP Mode Button & Language Switcher */}
          <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/25">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  Aria
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Gemini Live
                  </span>
                </h3>
                <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Voice · {formatTimer(callDuration)}
                </span>
              </div>
            </div>

            {/* Header Right Actions: PiP Mode & Language Switcher */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPiPMode(true);
                  hapticService.lightTap();
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700/60 shadow-sm transition active:scale-95"
                title="Minimize to Floating Chat Head (PiP)"
              >
                <Minimize2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">PiP Mode</span>
              </button>

              {/* Language Switcher */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setCallLanguage('en-US');
                    hapticService.lightTap();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    callLanguage === 'en-US'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="English"
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCallLanguage('bn-BD');
                    hapticService.lightTap();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    callLanguage === 'bn-BD'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="বাংলা"
                >
                  বাংলা
                </button>
              </div>
            </div>
          </div>

          {/* Action Notification Card (Floating Real-time Update) */}
          {actionNotice && (
            <div className="w-full mt-2 p-3 rounded-2xl bg-gradient-to-r from-indigo-950/90 to-slate-900/90 border border-indigo-500/40 flex items-center gap-2.5 text-xs text-indigo-200 shadow-lg shadow-indigo-950/50 animate-in fade-in slide-in-from-top-2 relative z-10">
              {actionNotice.type === 'create' && <Plus className="w-4 h-4 text-emerald-400 shrink-0" />}
              {actionNotice.type === 'update' && <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />}
              {actionNotice.type === 'complete' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
              {actionNotice.type === 'delete' && <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />}
              <span className="truncate font-semibold tracking-wide">{actionNotice.text}</span>
            </div>
          )}

          {/* Central Gemini Live Dynamic Aura Orb */}
          <div className="flex flex-col items-center my-4 space-y-4 relative z-10 w-full">
            <button
              onClick={handleInstantSend}
              className="relative group focus:outline-none"
              title={isAiSpeaking ? 'Tap to interrupt Aria' : userSpeechInput ? 'Tap to send immediately' : 'Tap to talk'}
            >
              {/* Outer Energy Halo (Scales dynamically with real microphone RMS volume!) */}
              <div 
                style={{
                  transform: `scale(${1 + (audioVolume / 100) * 0.45})`,
                  opacity: isMuted ? 0.1 : isAiSpeaking ? 0.7 : 0.4 + (audioVolume / 100) * 0.5,
                  transition: 'transform 0.08s ease-out, opacity 0.15s ease-out',
                }}
                className={`absolute -inset-4 rounded-full blur-xl ${
                  isMuted
                    ? 'bg-rose-500'
                    : isAiSpeaking
                    ? 'bg-gradient-to-tr from-indigo-500 via-violet-500 to-cyan-400'
                    : isProcessingTurn
                    ? 'bg-cyan-500'
                    : 'bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-500'
                }`}
              />

              {/* Pulsing Core Sphere */}
              <div
                style={{
                  transform: `scale(${1 + (audioVolume / 100) * 0.15})`,
                  transition: 'transform 0.08s ease-out',
                }}
                className={`relative w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl border-2 ${
                  isAiSpeaking
                    ? 'bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 border-indigo-300/40 shadow-indigo-500/50'
                    : isMuted
                    ? 'bg-slate-900 border-rose-500/50 shadow-rose-950/50 text-rose-400'
                    : isProcessingTurn
                    ? 'bg-gradient-to-tr from-slate-900 via-cyan-900 to-slate-900 border-cyan-400/50 shadow-cyan-500/30'
                    : 'bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-600 border-emerald-300/40 shadow-emerald-500/50'
                }`}
              >
                {isAiSpeaking ? (
                  <Radio className="w-12 h-12 text-white animate-pulse" />
                ) : isMuted ? (
                  <MicOff className="w-12 h-12 text-rose-400" />
                ) : isProcessingTurn ? (
                  <Sparkles className="w-12 h-12 text-cyan-300 animate-spin" />
                ) : (
                  <Mic className="w-12 h-12 text-white animate-pulse" />
                )}

                <span className="text-[10px] font-bold tracking-wider uppercase mt-1 text-white/90">
                  {isAiSpeaking ? 'Aria' : isProcessingTurn ? 'Thinking' : isMuted ? 'Muted' : 'Live'}
                </span>
              </div>
            </button>

            {/* Real-time Frequency Spectrum Bars (Web Audio API Analyser) */}
            <div className="flex items-center justify-center gap-1.5 h-8 w-48 px-2">
              {frequencyData.map((height, i) => (
                <span
                  key={i}
                  style={{
                    height: isMuted ? '12%' : `${Math.max(15, height)}%`,
                    transition: 'height 0.08s ease-out',
                  }}
                  className={`w-1.5 rounded-full ${
                    isMuted
                      ? 'bg-slate-700'
                      : isAiSpeaking
                      ? 'bg-gradient-to-t from-indigo-500 to-cyan-400 shadow-sm shadow-indigo-400'
                      : isProcessingTurn
                      ? 'bg-cyan-400/60'
                      : 'bg-gradient-to-t from-emerald-500 to-teal-300 shadow-sm shadow-emerald-400'
                  }`}
                />
              ))}
            </div>

            {/* Status Pill Badge */}
            <div className="flex flex-col items-center gap-1">
              <span className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition-all border shadow-sm ${
                isMuted
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : isAiSpeaking
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-indigo-500/20'
                  : isProcessingTurn
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/20'
              }`}>
                {!isMuted && !isAiSpeaking && !isProcessingTurn && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
                {isMuted
                  ? 'Muted · Tap mic to speak'
                  : isAiSpeaking
                  ? '✨ Aria Speaking · Speak to interrupt'
                  : isProcessingTurn
                  ? '🌀 Aria is thinking...'
                  : '🎙️ Gemini Live · Listening...'}
              </span>
              <p className="text-[11px] font-medium text-slate-400 text-center px-4">
                {callStatusMessage}
              </p>
            </div>
          </div>

          {/* Gemini Live HUD: Real-Time Subtitles & Transcript Stream */}
          <div className="w-full bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 text-left my-2 max-h-36 overflow-y-auto space-y-2 relative z-10 backdrop-blur-md">
            {/* Live Streaming User Speech */}
            {userSpeechInput ? (
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 text-xs text-emerald-300 font-sans flex items-center justify-between gap-2 animate-in fade-in">
                <span className="truncate">🗣️ <strong className="text-white">You:</strong> "{userSpeechInput}"</span>
                <button
                  onClick={handleInstantSend}
                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 shrink-0 shadow-sm"
                  title="Send now"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                {isAiSpeaking ? 'Aria is speaking...' : 'Listening in real-time... speak naturally'}
              </p>
            )}

            {/* Aria's Current Spoken Response */}
            <p className="text-sm text-slate-100 leading-relaxed font-sans font-medium pt-1">
              "{briefingText || (callLanguage === 'bn-BD' ? 'কীভাবে সাহায্য করতে পারি বলুন...' : "How's your day going? How can I help?")}"
            </p>
          </div>

          {/* Quick Natural Conversational Chips */}
          <div className="w-full py-1 relative z-10">
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

          {/* Bottom Dock: Repeat + Hands-Free Mic / Barge-In + Hang Up */}
          <div className="w-full pt-3 flex items-center justify-around border-t border-slate-800/80 relative z-10">
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
