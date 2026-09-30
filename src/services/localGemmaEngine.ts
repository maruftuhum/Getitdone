import { Task } from '../types';
import { parseTaskLocally } from './localNlpParser';
import type { MLCEngine, InitProgressReport } from '@mlc-ai/web-llm';

export interface LocalGemmaResult {
  reply: string;
  action?: {
    action: string;
    task?: Partial<Task>;
  } | null;
  isNativeOnDevice: boolean;
  engineUsed: string;
}

export interface ModelDownloadProgress {
  status: 'idle' | 'downloading' | 'ready' | 'error';
  progress: number;
  text: string;
  modelId: string;
}

export const AVAILABLE_LOCAL_MODELS = [
  {
    id: 'gemma-2-2b-it-q4f32_1-MLC',
    name: 'Gemma 2B Instruct (Official Google)',
    size: '~1.4 GB',
    description: 'Full Google Gemma 2B model running locally on phone GPU',
    recommendedFor: 'Phones with 6GB+ RAM and WebGPU',
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M (Fast Mobile)',
    size: '~250 MB',
    description: 'Ultra-lightweight local model, downloads in seconds on mobile',
    recommendedFor: 'All Android phones & quick download',
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B (High Efficiency)',
    size: '~390 MB',
    description: 'Compact high-reasoning local model optimized for mobile tasks',
    recommendedFor: 'Recommended for standard Android devices',
  },
];

class LocalGemmaEngine {
  private webLlmEngine: MLCEngine | null = null;
  private selectedModelId = 'gemma-2-2b-it-q4f32_1-MLC';
  private downloadProgress: ModelDownloadProgress = {
    status: 'idle',
    progress: 0,
    text: '',
    modelId: 'gemma-2-2b-it-q4f32_1-MLC',
  };
  private progressListeners: Array<(p: ModelDownloadProgress) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedModel = localStorage.getItem('getitdone_selected_webllm_model');
        if (savedModel) this.selectedModelId = savedModel;
      } catch (e) {
        // ignore
      }
    }
  }

  public getSelectedModelId(): string {
    return this.selectedModelId;
  }

  public setSelectedModelId(id: string): void {
    this.selectedModelId = id;
    if (typeof window !== 'undefined') {
      localStorage.setItem('getitdone_selected_webllm_model', id);
    }
  }

  public getProgress(): ModelDownloadProgress {
    return { ...this.downloadProgress };
  }

  public subscribeProgress(cb: (p: ModelDownloadProgress) => void): () => void {
    this.progressListeners.push(cb);
    cb(this.downloadProgress);
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== cb);
    };
  }

  private notifyProgress(update: Partial<ModelDownloadProgress>) {
    this.downloadProgress = { ...this.downloadProgress, ...update };
    this.progressListeners.forEach((l) => l(this.downloadProgress));
  }

  // Check if device supports WebGPU for in-browser model running
  public isWebGPUSupported(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  // Download and initialize the local model directly inside the browser
  public async downloadAndLoadModel(modelId = this.selectedModelId): Promise<boolean> {
    this.selectedModelId = modelId;
    this.notifyProgress({
      status: 'downloading',
      progress: 0.05,
      text: 'Checking WebGPU hardware support...',
      modelId,
    });

    if (!this.isWebGPUSupported()) {
      this.notifyProgress({
        status: 'error',
        progress: 0,
        text: 'WebGPU is not enabled in this browser. You can enable it in chrome://flags/#enable-unsafe-webgpu or use the bundled offline engine.',
      });
      return false;
    }

    try {
      this.notifyProgress({
        status: 'downloading',
        progress: 0.1,
        text: 'Initializing download to device storage...',
      });

      // Dynamically import web-llm to keep bundle lean
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

      const engine = await CreateMLCEngine(modelId, {
        initProgressCallback: (report: InitProgressReport) => {
          this.notifyProgress({
            status: 'downloading',
            progress: report.progress || 0.1,
            text: report.text,
            modelId,
          });
        },
      });

      this.webLlmEngine = engine;
      this.notifyProgress({
        status: 'ready',
        progress: 1,
        text: `Model is fully loaded and cached in local phone storage! Runs 100% offline.`,
        modelId,
      });
      return true;
    } catch (err: any) {
      console.error('Failed to load local model via WebLLM:', err);
      this.notifyProgress({
        status: 'error',
        progress: 0,
        text: `Download error: ${err.message || 'GPU memory or network issue'}. Using bundled offline engine.`,
      });
      return false;
    }
  }

  public isModelReady(): boolean {
    return this.webLlmEngine !== null;
  }

  // Generate response: Priority: Real in-browser WebLLM model -> Fallback: Bundled instant offline engine
  public async generateResponse(userInput: string, tasks: Task[]): Promise<LocalGemmaResult> {
    const today = new Date().toISOString().split('T')[0];
    const pendingTasks = tasks.filter((t) => !t.completed);
    const todayTasks = pendingTasks.filter((t) => t.dueDate === today);
    const urgentTasks = pendingTasks.filter((t) => t.priority === 'high');

    // 1. If in-browser downloaded model is active, run real GPU inference!
    if (this.webLlmEngine) {
      try {
        const systemPrompt = `You are the Get It Done personal AI assistant running 100% locally on the user's Android phone.
Current date: ${today}.
Active tasks:
${pendingTasks.map((t) => `- ${t.title} [Due: ${t.dueDate}${t.dueTime ? ' ' + t.dueTime : ''}, Priority: ${t.priority}]`).join('\n')}

Instructions: Keep answers concise, helpful, and directly actionable for their schedule.`;

        const response = await this.webLlmEngine.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput },
          ],
          temperature: 0.6,
          max_tokens: 300,
        });

        const replyText = response.choices[0]?.message?.content || '';

        // If user wants to add task, also trigger local parsing action
        let action = null;
        const lower = userInput.toLowerCase();
        if (lower.startsWith('add ') || lower.startsWith('create ') || lower.startsWith('remind me')) {
          const parsed = parseTaskLocally(userInput);
          action = {
            action: 'CREATE_TASK',
            task: {
              title: parsed.title,
              dueDate: parsed.dueDate,
              dueTime: parsed.dueTime,
              priority: parsed.priority,
              category: parsed.category,
              location: parsed.location,
            },
          };
        }

        return {
          reply: replyText,
          action,
          isNativeOnDevice: true,
          engineUsed: `In-Browser WebGPU (${this.selectedModelId})`,
        };
      } catch (e) {
        console.warn('WebLLM generation error, falling back to bundled offline engine:', e);
      }
    }

    // 2. Bundled High-Performance On-Device Offline Engine (Zero download required)
    const input = userInput.trim().toLowerCase();

    // A. Detect Intent to add task
    if (
      input.startsWith('add ') ||
      input.startsWith('create ') ||
      input.startsWith('schedule ') ||
      input.startsWith('remind me to ') ||
      input.includes('tomorrow') ||
      input.includes('at ') ||
      input.includes('urgent')
    ) {
      const parsed = parseTaskLocally(userInput);
      const timeNote = parsed.dueTime ? ` at ${parsed.dueTime}` : '';
      const reply = `[Local Assistant] I've scheduled this task for you: "${parsed.title}" on ${parsed.dueDate}${timeNote} (${parsed.priority} priority).`;
      return {
        reply,
        action: {
          action: 'CREATE_TASK',
          task: {
            title: parsed.title,
            dueDate: parsed.dueDate,
            dueTime: parsed.dueTime,
            priority: parsed.priority,
            category: parsed.category,
            location: parsed.location,
          },
        },
        isNativeOnDevice: true,
        engineUsed: 'Bundled Local Engine (100% Offline)',
      };
    }

    // B. Query: What's due today?
    if (input.includes('today') || input.includes('what is due') || input.includes('schedule')) {
      if (todayTasks.length === 0) {
        return {
          reply: "[Local Assistant] You have no pending tasks scheduled for today! Would you like to schedule something new?",
          isNativeOnDevice: true,
          engineUsed: 'Bundled Local Engine (100% Offline)',
        };
      }
      const list = todayTasks
        .map((t, i) => `${i + 1}. "${t.title}" ${t.dueTime ? 'at ' + t.dueTime : ''} [${t.priority}]`)
        .join('\n');
      return {
        reply: `[Local Assistant] You have ${todayTasks.length} tasks scheduled for today:\n${list}\n\nLet me know which one you want to start or mark done!`,
        isNativeOnDevice: true,
        engineUsed: 'Bundled Local Engine (100% Offline)',
      };
    }

    // C. Query: Priority / Urgent tasks
    if (input.includes('urgent') || input.includes('priority') || input.includes('important')) {
      if (urgentTasks.length === 0) {
        return {
          reply: "[Local Assistant] Great news! You don't have any urgent or high-priority tasks flagged right now.",
          isNativeOnDevice: true,
          engineUsed: 'Bundled Local Engine (100% Offline)',
        };
      }
      const list = urgentTasks
        .map((t, i) => `${i + 1}. "${t.title}" (Due: ${t.dueDate} ${t.dueTime || ''})`)
        .join('\n');
      return {
        reply: `[Local Assistant] Here are your high-priority items that need attention:\n${list}`,
        isNativeOnDevice: true,
        engineUsed: 'Bundled Local Engine (100% Offline)',
      };
    }

    // D. Progress summary
    if (input.includes('progress') || input.includes('how am i doing') || input.includes('stats')) {
      const completedCount = tasks.filter((t) => t.completed).length;
      const total = tasks.length;
      const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
      return {
        reply: `[Local Assistant] Productivity Report:\n• Total tasks: ${total}\n• Completed: ${completedCount} (${percent}%)\n• Remaining: ${pendingTasks.length}\nKeep up the great work!`,
        isNativeOnDevice: true,
        engineUsed: 'Bundled Local Engine (100% Offline)',
      };
    }

    // E. General Assistant Guidance
    return {
      reply: `[Local Assistant] I am actively tracking your ${pendingTasks.length} pending tasks. You can tell me to "add doctor visit tomorrow at 3pm", "what is due today?", or "call me with my briefing"!`,
      isNativeOnDevice: true,
      engineUsed: 'Bundled Local Engine (100% Offline)',
    };
  }

  // Generate Proactive Work Update Message
  public generateProactiveCheckin(tasks: Task[]): { title: string; body: string; type: 'reminder' | 'urgent' } {
    const today = new Date().toISOString().split('T')[0];
    const pending = tasks.filter((t) => !t.completed);
    const todayTasks = pending.filter((t) => t.dueDate === today);
    const urgent = todayTasks.filter((t) => t.priority === 'high');

    if (urgent.length > 0) {
      return {
        title: 'Priority Work Update',
        body: `You have high-priority task "${urgent[0].title}" waiting. Let's get it done!`,
        type: 'urgent',
      };
    }

    if (todayTasks.length > 0) {
      const nextTask = todayTasks[0];
      return {
        title: 'Assistant Progress Check-in',
        body: `${todayTasks.length} tasks on your radar today. Next up: "${nextTask.title}"${nextTask.dueTime ? ' at ' + nextTask.dueTime : ''}.`,
        type: 'reminder',
      };
    }

    return {
      title: 'Schedule All Clear',
      body: 'All your tasks for today are checked off. Enjoy your day or plan tomorrow!',
      type: 'reminder',
    };
  }
}

export const localGemmaEngine = new LocalGemmaEngine();
