import { Task } from '../types';
import { localTaskCommand } from './localTaskCommands';
import { localDate } from '../shared/dates';
import type { TaskAction } from '../shared/taskActions';
import type { MLCEngine, InitProgressReport } from '@mlc-ai/web-llm';

export interface LocalGemmaResult {
  reply: string;
  action?: TaskAction | null;
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
    const today = localDate();
    const pendingTasks = tasks.filter((t) => !t.completed);
    const todayTasks = pendingTasks.filter((t) => t.dueDate === today);
    const urgentTasks = pendingTasks.filter((t) => t.priority === 'high');

    const command = localTaskCommand(userInput, tasks);
    if (command) return { ...command, isNativeOnDevice: true, engineUsed: 'Local task parser' };

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

        return {
          reply: replyText,
          isNativeOnDevice: true,
          engineUsed: `In-Browser WebGPU (${this.selectedModelId})`,
        };
      } catch (e) {
        console.warn('WebLLM generation error, falling back to bundled offline engine:', e);
      }
    }

    // 2. Bundled High-Performance On-Device Offline Engine (Zero download required)
    const input = userInput.trim().toLowerCase();

    // Natural conversation & small talk
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\b/i.test(input) || /হ্যালো|হাই|সালাম/.test(input)) {
      const pendingCount = pendingTasks.length;
      return {
        reply: `Hey! Good to hear from you. You have ${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'} on your list right now. What can I help you take care of?`,
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    if (/how are you|how('?s| is) it going|how r u|who are you|what('?s| is) your name/i.test(input) || /কেমন আছো|তোমার নাম কি/.test(input)) {
      return {
        reply: "I'm Aria, your personal assistant and chief of staff! I'm here to keep your schedule running smoothly and take care of your tasks. How are you feeling today?",
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    if (/what can you do|how can you help|features/i.test(input) || /কী করতে পারো|কি করতে পারো/.test(input)) {
      return {
        reply: "You can talk to me just like a human assistant! Tell me to add tasks, mark things done, reschedule items, or ask what's coming up next on your schedule.",
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    if (/thank|thanks|great job|appreciate it|awesome|perfect/i.test(input) || /ধন্যবাদ|থ্যাংকস/.test(input)) {
      return {
        reply: "You're very welcome! I'm always right here whenever you need me.",
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    if (/bye|goodbye|talk later|hang up|see ya|see you/i.test(input) || /বিদায়|বাই|পরে কথা হবে/.test(input)) {
      return {
        reply: "Take care and have a wonderful day! Call me whenever you're ready to get things done.",
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    if (/stress|overwhelm|exhaust|tired|too much|help me/i.test(input) || /ক্লান্ত|প্যারা|অনেক চাপ/.test(input)) {
      return {
        reply: "Take a deep breath — I've got your back. We don't have to tackle everything at once. Let's focus on just the single most important task right now, or push non-urgent items to tomorrow. What feels most critical?",
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    // Query: What's next / What should I do now?
    if (/what('?s| is) next|what should i do|what to do next|first task|top task/i.test(input) || /পরের কাজ|এখন কি করব/.test(input)) {
      const nextTask = urgentTasks[0] || todayTasks[0] || pendingTasks[0];
      if (!nextTask) {
        return {
          reply: "You have zero pending tasks! You're completely caught up. What would you like to plan next?",
          isNativeOnDevice: true,
          engineUsed: 'Natural Assistant Engine',
        };
      }
      return {
        reply: `Next up is "${nextTask.title}"${nextTask.dueTime ? ' at ' + nextTask.dueTime : ''}. Let me know once you finish it!`,
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    // Query: Completed tasks
    if (/completed|finished tasks|what did i do|what did i finish/i.test(input) || /শেষ করেছি|কমপ্লিট করেছি/.test(input)) {
      const completedList = tasks.filter((t) => t.completed);
      if (completedList.length === 0) {
        return {
          reply: "You haven't checked off any tasks yet today. Pick one from your list and let's get the momentum started!",
          isNativeOnDevice: true,
          engineUsed: 'Natural Assistant Engine',
        };
      }
      const recent = completedList.slice(0, 3).map((t) => t.title).join(', ');
      return {
        reply: `You've checked off ${completedList.length} ${completedList.length === 1 ? 'task' : 'tasks'} so far, including: ${recent}. Excellent job!`,
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    // Query: Tomorrow's tasks
    if (input.includes('tomorrow') || input.includes('কাল') || input.includes('আগামীকাল')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const list = pendingTasks.filter((t) => t.dueDate === localDate(tomorrow));
      if (!list.length) {
        return {
          reply: "Your schedule for tomorrow is completely clear! A blank slate. Would you like to add anything?",
          isNativeOnDevice: true,
          engineUsed: 'Natural Assistant Engine',
        };
      }
      const summary = list.map((t) => `${t.title}${t.dueTime ? ' at ' + t.dueTime : ''}`).join(', and ');
      return {
        reply: `Tomorrow you have ${list.length} ${list.length === 1 ? 'task' : 'tasks'} scheduled: ${summary}. Anything you want to adjust?`,
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    // Query: What's due today / schedule review
    if (
      input.includes('today') ||
      input.includes('what is due') ||
      input.includes('schedule') ||
      input.includes('agenda') ||
      input.includes('what do i have') ||
      input.includes('my tasks') ||
      input.includes('আজকে') ||
      input.includes('আজকের কাজ')
    ) {
      if (todayTasks.length === 0) {
        return {
          reply: "You have no tasks scheduled for today! Your day is wide open. Want to plan something new, or enjoy the free time?",
          isNativeOnDevice: true,
          engineUsed: 'Natural Assistant Engine',
        };
      }
      const summary = todayTasks.map((t) => `${t.title}${t.dueTime ? ' at ' + t.dueTime : ''}`).join(', and ');
      return {
        reply: `Today you have ${todayTasks.length} ${todayTasks.length === 1 ? 'task' : 'tasks'}: ${summary}. What would you like to start with?`,
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    // Query: Priority / Urgent tasks
    if (input.includes('urgent') || input.includes('priority') || input.includes('important') || input.includes('জরুরি')) {
      if (urgentTasks.length === 0) {
        return {
          reply: "Good news! You don't have any urgent or high-priority fires to put out right now. Everything is running smoothly.",
          isNativeOnDevice: true,
          engineUsed: 'Natural Assistant Engine',
        };
      }
      const top = urgentTasks[0];
      return {
        reply: `Your highest priority item is "${top.title}"${top.dueTime ? ' at ' + top.dueTime : ''}. Let me know when you want to knock that out!`,
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    // Progress summary
    if (input.includes('progress') || input.includes('how am i doing') || input.includes('stats')) {
      const completedCount = tasks.filter((t) => t.completed).length;
      const total = tasks.length;
      const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
      return {
        reply: `You've checked off ${completedCount} out of ${total} tasks so far, which is ${percent}% of your list. Great momentum! Keep going.`,
        isNativeOnDevice: true,
        engineUsed: 'Natural Assistant Engine',
      };
    }

    // General Assistant Guidance
    return {
      reply: `I'm right here! You have ${pendingTasks.length} ${pendingTasks.length === 1 ? 'task' : 'tasks'} on your radar. Tell me what you'd like to add, mark done, or check!`,
      isNativeOnDevice: true,
      engineUsed: 'Natural Assistant Engine',
    };
  }

  // Generate Proactive Work Update Message
  public generateProactiveCheckin(tasks: Task[]): { title: string; body: string; type: 'reminder' | 'urgent' } {
    const today = localDate();
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
