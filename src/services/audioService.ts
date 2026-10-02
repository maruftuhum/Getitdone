import { apiFetch } from './apiClient';
import { audioBlob } from '../shared/audio';
import { hapticService } from './hapticService';

class AudioService {
  private ctx: AudioContext | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: number | null = null;
  private isRinging: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  // Preloaded audio state for instant call pickup
  private preloadedAudio: HTMLAudioElement | null = null;
  private preloadedBlobUrl: string | null = null;
  private preloadedText: string = '';
  private speechGeneration = 0;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play realistic incoming phone ringtone with synchronized distinct vibration
  public startIncomingRingtone(): void {
    if (this.isRinging) return;
    this.isRinging = true;
    this.initContext();

    // Trigger distinct incoming call vibration pattern
    hapticService.startIncomingCallVibration();

    const playRingCycle = () => {
      if (!this.isRinging || !this.ctx) return;

      const now = this.ctx.currentTime;
      // Dual-frequency phone ring: 440Hz + 480Hz
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      // Volume envelope: 2 seconds ring, then fade
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.setValueAtTime(0.25, now + 1.8);
      gain.gain.linearRampToValueAtTime(0, now + 2.0);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.0);
      osc2.stop(now + 2.0);

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([400, 200, 400, 1200]);
        } catch (e) {
          // ignore
        }
      }
    };

    // Play first ring immediately
    playRingCycle();
    // Repeat every 4 seconds (2s ring + 2s pause)
    this.ringInterval = window.setInterval(playRingCycle, 4000);
  }

  public stopIncomingRingtone(): void {
    this.isRinging = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    hapticService.stopIncomingCallVibration();
  }

  // Play short connect chime
  public playConnectChime(): void {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.3); // G5

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  // Play short disconnect hangup tone
  public playDisconnectTone(): void {
    this.initContext();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(425, now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Preload audio directly from base64 string
  public preloadAudioFromBase64(audioBase64: string, mimeType: string, text: string): void {
    try {
      this.clearPreload();
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = audioBlob(bytes, mimeType);
      this.preloadedBlobUrl = URL.createObjectURL(blob);
      const audio = new Audio(this.preloadedBlobUrl);
      audio.preload = 'auto';
      audio.load();
      this.preloadedAudio = audio;
      this.preloadedText = text;
    } catch (e) {
      console.warn('Failed to buffer base64 audio:', e);
    }
  }

  // Preload audio by requesting TTS API in advance
  public async preloadAudio(text: string, voiceName = 'Puck'): Promise<boolean> {
    const generation = this.speechGeneration;
    if (!text || !text.trim()) return false;
    if (this.preloadedAudio && this.preloadedText === text) {
      return true;
    }

    if (voiceName === 'Device-Local' || !navigator.onLine || localStorage.getItem('getitdone_hybrid_mode') === 'false') {
      return true; // Local speech synthesis is always available on-device
    }

    try {
      const res = await apiFetch('/api/tts', { text, voice: voiceName });

      if (res.ok) {
        const data = await res.json();
        if (generation !== this.speechGeneration) return false;
        if (data.audioBase64) {
          this.preloadAudioFromBase64(data.audioBase64, data.mimeType || 'audio/mp3', text);
          return true;
        }
      }
    } catch (e) {
      console.warn('Preload audio fetch error:', e);
    }
    return false;
  }

  public isAudioPreloaded(text?: string): boolean {
    if (!this.preloadedAudio) return false;
    if (text) return this.preloadedText === text;
    return true;
  }

  public clearPreload(): void {
    if (this.preloadedBlobUrl) {
      URL.revokeObjectURL(this.preloadedBlobUrl);
      this.preloadedBlobUrl = null;
    }
    this.preloadedAudio = null;
    this.preloadedText = '';
  }

  // Instant Play: plays buffered preloaded audio with 0ms delay, or synthesizes if not ready
  public async playPreloadedOrSpeak(
    text: string,
    voiceName = 'Puck',
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    this.stopSpeaking();
    const generation = this.speechGeneration;
    this.initContext();

    if (this.preloadedAudio && (!text || this.preloadedText === text || !this.preloadedText)) {
      const audio = this.preloadedAudio;
      const currentUrl = this.preloadedBlobUrl;
      this.currentAudio = audio;
      this.preloadedAudio = null;
      this.preloadedBlobUrl = null;
      this.preloadedText = '';

      audio.onplay = () => {
        if (onStart) onStart();
      };
      audio.onended = () => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        this.currentAudio = null;
        if (onEnd) onEnd();
      };
      audio.onerror = () => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        this.currentAudio = null;
        if (generation === this.speechGeneration) this.fallbackSpeechSynthesis(text, onStart, onEnd);
      };

      try {
        await audio.play();
        return;
      } catch (err) {
        console.warn('Preloaded audio play interrupted, falling back to speech synthesis:', err);
      }
    }

    // Otherwise standard speak
    return this.speakBriefing(text, voiceName, onStart, onEnd);
  }

  // Play spoken briefing via Gemini TTS or Web Speech Synthesis
  public async speakBriefing(
    text: string,
    voiceName = 'Puck',
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    this.stopSpeaking();
    const generation = this.speechGeneration;
    this.initContext();

    if (voiceName === 'Device-Local' || !navigator.onLine || localStorage.getItem('getitdone_hybrid_mode') === 'false') {
      this.fallbackSpeechSynthesis(text, onStart, onEnd);
      return;
    }

    try {
      // 1. Attempt Gemini TTS from server
      const res = await apiFetch('/api/tts', { text, voice: voiceName });

      if (generation !== this.speechGeneration) return;

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          if (generation !== this.speechGeneration) return;
          const binary = atob(data.audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = audioBlob(bytes, data.mimeType);
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          this.currentAudio = audio;

          audio.onplay = () => {
            if (onStart) onStart();
          };
          audio.onended = () => {
            URL.revokeObjectURL(url);
            this.currentAudio = null;
            if (onEnd) onEnd();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            this.currentAudio = null;
            this.fallbackSpeechSynthesis(text, onStart, onEnd);
          };

          await audio.play();
          return;
        }
      }
    } catch (e) {
      console.warn('Gemini TTS fetch failed, using Web Speech API fallback', e);
    }

    // 2. Fallback to Web Speech API
    if (generation !== this.speechGeneration) return;
    this.fallbackSpeechSynthesis(text, onStart, onEnd);
  }

  // Clean raw text so it sounds completely human when spoken aloud
  public static cleanSpokenText(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/\[(?:Local\s+)?Assistant\]/gi, '')
      .replace(/```[\s\S]*?```/g, '') // strip fenced blocks
      .replace(/\[.*?\]/g, '') // strip bracket tags
      .replace(/[*_#`~]/g, '') // strip markdown
      .replace(/^\s*[-•*]\s+/gm, '') // strip bullet markers
      .replace(/^\s*\d+\.\s+/gm, '') // strip numbered list prefixes
      .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '') // strip emojis
      .replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h, min) => {
        const hour = parseInt(h, 10);
        const period = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        return min === '00' ? `${h12} ${period}` : `${h12}:${min} ${period}`;
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private fallbackSpeechSynthesis(text: string, onStart?: () => void, onEnd?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    const cleanedText = AudioService.cleanSpokenText(text);
    if (!cleanedText) {
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.rate = 1.02; // lively conversational cadence
    utterance.pitch = 1.02; // warm natural tone

    const isBangla = /[\u0980-\u09FF]/.test(cleanedText);
    utterance.lang = isBangla ? 'bn-BD' : 'en-US';

    // Intelligently score and select the most human, natural voice
    const voices = window.speechSynthesis.getVoices();
    if (isBangla) {
      const bnVoice = voices.find(
        (v) => v.lang.startsWith('bn') || v.name.toLowerCase().includes('bangla') || v.name.toLowerCase().includes('bengali')
      );
      if (bnVoice) utterance.voice = bnVoice;
    } else {
      const scoreVoice = (v: SpeechSynthesisVoice): number => {
        const name = v.name.toLowerCase();
        let score = 0;
        if (v.lang.startsWith('en')) score += 10;
        if (v.lang.startsWith('en-US')) score += 10;
        if (name.includes('natural') || name.includes('online')) score += 50;
        if (name.includes('neural')) score += 40;
        if (name.includes('google')) score += 30;
        if (name.includes('enhanced') || name.includes('premium')) score += 30;
        if (name.includes('aria') || name.includes('jenny') || name.includes('guy')) score += 20;
        if (name.includes('desktop') || name.includes('legacy')) score -= 20;
        return score;
      };

      const sortedVoices = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
      if (sortedVoices.length > 0 && scoreVoice(sortedVoices[0]) > 0) {
        utterance.voice = sortedVoices[0];
      }
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };
    utterance.onend = () => {
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };
    utterance.onerror = () => {
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  public stopSpeaking(): void {
    this.speechGeneration++;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }
}

export const audioService = new AudioService();
