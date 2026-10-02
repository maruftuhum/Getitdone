import { localDate } from '../shared/dates';
import { apiFetch } from './apiClient';
import { Task } from '../types';
import { audioService } from './audioService';

export interface PreparedCallData {
  script: string;
  isAudioReady: boolean;
  taskCount: number;
}

class VoiceCallService {
  private currentPreparation: Promise<PreparedCallData> | null = null;
  private cachedData: PreparedCallData | null = null;
  private fingerprint = '';
  private generation = 0;
  private controller: AbortController | null = null;

  // Build an immediate instant local fallback script so there is 0ms delay under any condition
  public getInstantFallbackScript(tasks: Task[], userName = 'there'): string {
    const todayIso = localDate();
    const pending = tasks.filter((t) => !t.completed);
    const todayTasks = pending.filter((t) => t.dueDate === todayIso);
    const urgentTasks = pending.filter((t) => t.priority === 'high');

    const name = userName && userName !== 'there' ? userName : '';
    const hour = new Date().getHours();
    let timeGreeting = 'Hey there!';
    if (hour < 12) timeGreeting = name ? `Good morning, ${name}!` : 'Good morning!';
    else if (hour < 17) timeGreeting = name ? `Good afternoon, ${name}!` : 'Good afternoon!';
    else if (hour < 21) timeGreeting = name ? `Good evening, ${name}!` : 'Good evening!';
    else timeGreeting = name ? `Hey ${name}!` : 'Hey there!';

    if (todayTasks.length === 0) {
      if (pending.length === 0) {
        return `${timeGreeting} You're completely caught up with zero pending tasks. Everything's done! How can I help you today?`;
      }
      return `${timeGreeting} You've got no tasks due today, and ${pending.length} upcoming items later on. What would you like to work on?`;
    }

    const topTask = urgentTasks[0] || todayTasks[0];
    const timeDetail = topTask.dueTime ? ` at ${topTask.dueTime}` : '';
    if (todayTasks.length === 1) {
      return `${timeGreeting} You have one task scheduled for today: "${topTask.title}"${timeDetail}. What's the plan?`;
    }

    return `${timeGreeting} You have ${todayTasks.length} tasks lined up today. The main one is "${topTask.title}"${timeDetail}. What would you like to start with?`;
  }

  // Pre-process and pre-load what GID will say BEFORE the user answers or before the call rings
  public prepareCall(
    tasks: Task[],
    userName = 'there',
    voiceName = 'Puck',
    callType = 'morning_brief'
  ): Promise<PreparedCallData> {
    const fingerprint = JSON.stringify([tasks, userName, voiceName, callType]);
    if (this.currentPreparation && this.fingerprint === fingerprint) return this.currentPreparation;
    this.clear();
    this.fingerprint = fingerprint;
    const generation = this.generation;

    const instantFallback = this.getInstantFallbackScript(tasks, userName);
    const todayIso = localDate();
    const pending = tasks.filter((t) => !t.completed);
    const todayTasks = pending.filter((t) => t.dueDate === todayIso);

    this.currentPreparation = (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2600);

        this.controller = controller;
        if (voiceName === 'Device-Local' || !navigator.onLine) throw new Error('Using device speech');
        const res = await apiFetch('/api/prepare-call', { tasks, userName, voice: voiceName, callType }, controller.signal);
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (generation !== this.generation) return { script: instantFallback, isAudioReady: false, taskCount: todayTasks.length };
          const finalScript = data.script?.trim() || instantFallback;

          if (data.audioBase64) {
            audioService.preloadAudioFromBase64(data.audioBase64, data.mimeType || 'audio/mp3', finalScript);
            this.cachedData = {
              script: finalScript,
              isAudioReady: true,
              taskCount: todayTasks.length,
            };
            return this.cachedData;
          }

          // In case audio wasn't generated on backend, attempt background TTS preload
          audioService.preloadAudio(finalScript, voiceName);
          this.cachedData = {
            script: finalScript,
            isAudioReady: false,
            taskCount: todayTasks.length,
          };
          return this.cachedData;
        }
      } catch (err) {
        console.info('Pre-loading via prepare-call timed out or offline, using instant local script:', err);
      }

      if (generation !== this.generation) return { script: instantFallback, isAudioReady: false, taskCount: todayTasks.length };
      // Offline or network timeout fallback:
      audioService.preloadAudio(instantFallback, voiceName);
      this.cachedData = {
        script: instantFallback,
        isAudioReady: false,
        taskCount: todayTasks.length,
      };
      return this.cachedData;
    })();

    return this.currentPreparation;
  }

  public getCachedData(): PreparedCallData | null {
    return this.cachedData;
  }

  public clear(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.currentPreparation = null;
    this.cachedData = null;
    audioService.clearPreload();
  }
}

export const voiceCallService = new VoiceCallService();
