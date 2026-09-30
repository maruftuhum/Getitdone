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

  // Build an immediate instant local fallback script so there is 0ms delay under any condition
  public getInstantFallbackScript(tasks: Task[], userName = 'there'): string {
    const todayIso = new Date().toISOString().split('T')[0];
    const pending = tasks.filter((t) => !t.completed);
    const todayTasks = pending.filter((t) => t.dueDate === todayIso);
    const urgentTasks = pending.filter((t) => t.priority === 'high');

    if (todayTasks.length === 0) {
      if (pending.length === 0) {
        return `Hello ${userName}! All your tasks are completed. You have a clean schedule today. Enjoy your day!`;
      }
      return `Hello ${userName}! You have no tasks due today, and ${pending.length} upcoming tasks this week. What would you like to review?`;
    }

    const topTask = urgentTasks[0] || todayTasks[0];
    const timeDetail = topTask.dueTime ? ` at ${topTask.dueTime}` : '';
    return `Good morning ${userName}! You have ${todayTasks.length} ${todayTasks.length === 1 ? 'task' : 'tasks'} scheduled for today. Top priority is "${topTask.title}"${timeDetail}. Are you ready to get it done?`;
  }

  // Pre-process and pre-load what GID will say BEFORE the user answers or before the call rings
  public prepareCall(
    tasks: Task[],
    userName = 'there',
    voiceName = 'Puck',
    callType = 'morning_brief'
  ): Promise<PreparedCallData> {
    if (this.currentPreparation) {
      return this.currentPreparation;
    }

    const instantFallback = this.getInstantFallbackScript(tasks, userName);
    const todayIso = new Date().toISOString().split('T')[0];
    const pending = tasks.filter((t) => !t.completed);
    const todayTasks = pending.filter((t) => t.dueDate === todayIso);

    this.currentPreparation = (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2600);

        const res = await fetch('/api/prepare-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tasks,
            userName,
            voice: voiceName,
            callType,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
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
    this.currentPreparation = null;
    this.cachedData = null;
    audioService.clearPreload();
  }
}

export const voiceCallService = new VoiceCallService();
