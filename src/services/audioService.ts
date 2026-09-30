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
      const blob = new Blob([bytes], { type: mimeType || 'audio/mp3' });
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
    if (!text || !text.trim()) return false;
    if (this.preloadedAudio && this.preloadedText === text) {
      return true;
    }

    if (voiceName === 'Device-Local') {
      return true; // Local speech synthesis is always available on-device
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceName }),
      });

      if (res.ok) {
        const data = await res.json();
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
        this.fallbackSpeechSynthesis(text, onStart, onEnd);
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
    this.initContext();

    if (voiceName === 'Device-Local') {
      this.fallbackSpeechSynthesis(text, onStart, onEnd);
      return;
    }

    try {
      // 1. Attempt Gemini TTS from server
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceName }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const binary = atob(data.audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: data.mimeType || 'audio/mp3' });
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
    this.fallbackSpeechSynthesis(text, onStart, onEnd);
  }

  private fallbackSpeechSynthesis(text: string, onStart?: () => void, onEnd?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const isBangla = /[\u0980-\u09FF]/.test(text);
    utterance.lang = isBangla ? 'bn-BD' : 'en-US';

    // Pick pleasant natural voice or Bangla voice if available
    const voices = window.speechSynthesis.getVoices();
    if (isBangla) {
      const bnVoice = voices.find(
        (v) => v.lang.startsWith('bn') || v.name.toLowerCase().includes('bangla') || v.name.toLowerCase().includes('bengali')
      );
      if (bnVoice) {
        utterance.voice = bnVoice;
      }
    } else {
      const preferredVoice = voices.find(
        (v) => v.name.includes('Natural') || v.name.includes('Google') || v.lang.startsWith('en')
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
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
