import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Google GenAI on the server
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper: safe date formatting
const todayIso = new Date().toISOString().split('T')[0];

// Endpoint: Multi-turn Chat for Get It Done
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { messages, tasksContext } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!apiKey) {
      return res.json({
        reply: "I'm running in local offline mode since no API key is configured. You can still manage all tasks, calendar events, and receive simulated voice briefings!",
        action: null,
      });
    }

    const tasksSummary = (tasksContext && Array.isArray(tasksContext))
      ? tasksContext.map((t: any) => `- [${t.completed ? 'COMPLETED' : 'PENDING'}] "${t.title}" (Due: ${t.dueDate || 'No date'} ${t.dueTime || ''}, Priority: ${t.priority || 'medium'}, Category: ${t.category || 'General'}, Location: ${t.location || 'None'})`).join('\n')
      : 'No tasks currently stored.';

    const systemInstruction = `You are "Get It Done" — the proactive, intelligent personal task and schedule manager assistant.
Today's date is ${todayIso}.
The user's current tasks list:
${tasksSummary}

Your objectives:
1. Provide concise, friendly, and actionable productivity advice and answers to their schedule.
2. If the user expresses intent to create, complete, reschedule, or delete a task, include a JSON action block at the very end of your response formatted like:
\`\`\`action
{
  "action": "CREATE_TASK" | "COMPLETE_TASK" | "DELETE_TASK" | "RESCHEDULE_TASK",
  "task": {
    "title": "Clear task title",
    "dueDate": "YYYY-MM-DD",
    "dueTime": "HH:mm or null",
    "priority": "low" | "medium" | "high",
    "category": "Personal" | "Work" | "Urgent" | "Health" | "Errands",
    "location": "location name or null"
  }
}
\`\`\`
If no task modification is intended, do not include the action block. Keep conversational responses under 3 sentences unless detailed breakdown is requested.`;

    const contents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    const replyText = response.text || "I've checked your schedule. How else can I help?";
    
    // Parse possible action block
    let actionData = null;
    const actionMatch = replyText.match(/```action\s*([\s\S]*?)\s*```/);
    let cleanReply = replyText;
    if (actionMatch && actionMatch[1]) {
      try {
        actionData = JSON.parse(actionMatch[1]);
        cleanReply = replyText.replace(/```action[\s\S]*?```/, '').trim();
      } catch (e) {
        console.warn('Failed to parse action json from model output:', e);
      }
    }

    res.json({
      reply: cleanReply,
      action: actionData,
    });
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: error.message || 'Chat generation failed' });
  }
});

// Endpoint: Smart Task Natural Language Parser
app.post('/api/parse-task', async (req: Request, res: Response) => {
  try {
    const { input } = req.body;
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Text input is required' });
    }

    if (!apiKey) {
      // Local fallback parsing
      return res.json({
        title: input,
        dueDate: todayIso,
        dueTime: null,
        priority: 'medium',
        category: 'Personal',
        location: null,
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Extract structured task attributes from this natural language input: "${input}".
Today's date is ${todayIso}.
Return STRICT JSON ONLY conforming to:
{
  "title": string,
  "dueDate": "YYYY-MM-DD" (calculate relative dates like "tomorrow", "Friday"),
  "dueTime": "HH:mm" (24-hour format) or null,
  "priority": "low" | "medium" | "high",
  "category": "Personal" | "Work" | "Urgent" | "Health" | "Errands",
  "location": string or null
}`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const jsonStr = response.text || '{}';
    const parsed = JSON.parse(jsonStr);
    res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/parse-task:', error);
    res.status(500).json({ error: error.message || 'Task parsing failed' });
  }
});

// Endpoint: Generate Morning/Scheduled Briefing Script
app.post('/api/briefing', async (req: Request, res: Response) => {
  try {
    const { tasks, callType = 'morning_brief', userName } = req.body;
    const taskList = Array.isArray(tasks) ? tasks : [];
    const pendingTasks = taskList.filter((t: any) => !t.completed);
    const todayTasks = pendingTasks.filter((t: any) => t.dueDate === todayIso);
    const urgentTasks = pendingTasks.filter((t: any) => t.priority === 'high');

    if (!apiKey) {
      const count = todayTasks.length;
      const script = `Good morning${userName ? ' ' + userName : ''}! You have ${count} ${count === 1 ? 'task' : 'tasks'} scheduled for today. Remember to stay focused and get it done!`;
      return res.json({ script, taskCount: count });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `You are generating a spoken phone call briefing script for the user for "Get It Done".
Call type: ${callType}.
Current local date: ${todayIso}.
Total pending tasks: ${pendingTasks.length}.
Tasks due today (${todayTasks.length}):
${todayTasks.map((t: any) => `- "${t.title}" at ${t.dueTime || 'anytime'} [${t.priority} priority, ${t.location ? 'Location: ' + t.location : 'no location'}]`).join('\n')}
Urgent tasks: ${urgentTasks.length}.

Write a warm, concise, professional spoken script suitable for a real phone call (around 40-70 words).
Greet the user naturally, clearly summarize what is due today and what requires immediate attention, and ask if they would like to start with the top priority item. No markdown formatting, pure natural dialogue for speech.`,
      config: {
        temperature: 0.4,
      },
    });

    const script = response.text?.trim() || `Good morning! You have ${todayTasks.length} tasks scheduled for today. Let's make it a productive day!`;
    res.json({ script, taskCount: todayTasks.length });
  } catch (error: any) {
    console.error('Error in /api/briefing:', error);
    res.status(500).json({ error: error.message || 'Briefing generation failed' });
  }
});

// Endpoint: Text to Speech (TTS) using gemini-3.8-flash-tts
app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const { text, voice = 'Puck' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string is required' });
    }

    if (!apiKey) {
      return res.json({ fallbackToSpeechSynthesis: true, text });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: text,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          return res.json({
            audioBase64: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'audio/mp3',
          });
        }
      }

      // If no audio returned, fallback
      res.json({ fallbackToSpeechSynthesis: true, text });
    } catch (ttsErr: any) {
      console.warn('Gemini TTS model error, falling back to Web Speech Synthesis:', ttsErr.message);
      res.json({ fallbackToSpeechSynthesis: true, text });
    }
  } catch (error: any) {
    console.error('Error in /api/tts:', error);
    res.status(500).json({ error: error.message || 'TTS generation failed' });
  }
});

// Endpoint: One-stop Pre-load Briefing & Voice Audio for Instant Call Pickup
app.post('/api/prepare-call', async (req: Request, res: Response) => {
  try {
    const { tasks, callType = 'morning_brief', userName = 'there', voice = 'Puck' } = req.body;
    const taskList = Array.isArray(tasks) ? tasks : [];
    const pendingTasks = taskList.filter((t: any) => !t.completed);
    const todayTasks = pendingTasks.filter((t: any) => t.dueDate === todayIso);
    const urgentTasks = pendingTasks.filter((t: any) => t.priority === 'high');

    let script = '';
    if (!apiKey) {
      const count = todayTasks.length;
      script = `Good morning${userName ? ' ' + userName : ''}! You have ${count} ${count === 1 ? 'task' : 'tasks'} scheduled for today. Let's make it a productive day!`;
    } else {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `You are generating a spoken phone call briefing script for the user for "Get It Done".
Call type: ${callType}.
Current local date: ${todayIso}.
Total pending tasks: ${pendingTasks.length}.
Tasks due today (${todayTasks.length}):
${todayTasks.map((t: any) => `- "${t.title}" at ${t.dueTime || 'anytime'} [${t.priority} priority]`).join('\n')}
Urgent tasks: ${urgentTasks.length}.

Write a warm, concise, professional spoken script suitable for a real phone call (around 35-55 words).
Greet the user naturally, clearly summarize what is due today and what requires immediate attention, and ask how they want to start. No markdown formatting, pure natural dialogue for speech.`,
          config: {
            temperature: 0.3,
          },
        });
        script = response.text?.trim() || '';
      } catch (err: any) {
        console.warn('Briefing script generation warning:', err.message);
      }
    }

    if (!script) {
      const count = todayTasks.length;
      const topTask = urgentTasks[0] || todayTasks[0];
      const timeStr = topTask?.dueTime ? ` at ${topTask.dueTime}` : '';
      script = `Good morning ${userName}! You have ${count} ${count === 1 ? 'task' : 'tasks'} scheduled for today${topTask ? `, starting with "${topTask.title}"${timeStr}` : ''}. Let's get it done!`;
    }

    // Immediately pre-generate TTS audio on the backend
    let audioBase64: string | null = null;
    let mimeType = 'audio/mp3';

    if (apiKey) {
      try {
        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: script,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice,
                },
              },
            },
          },
        });

        const parts = ttsResponse.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            audioBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || 'audio/mp3';
            break;
          }
        }
      } catch (ttsErr: any) {
        console.warn('TTS pre-synthesis warning:', ttsErr.message);
      }
    }

    res.json({
      script,
      audioBase64,
      mimeType,
      taskCount: todayTasks.length,
    });
  } catch (error: any) {
    console.error('Error in /api/prepare-call:', error);
    res.status(500).json({ error: error.message || 'Prepare call failed' });
  }
});

// Endpoint: Interactive Multi-turn Voice Call with Task Instructions (English & Bangla support)
app.post('/api/call-conversation', async (req: Request, res: Response) => {
  try {
    const { messages, tasks, userName = 'there', voice = 'Puck', language = 'auto' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const taskList = Array.isArray(tasks) ? tasks : [];
    const tasksSummary = taskList.length > 0
      ? taskList.map((t: any) => `[ID: ${t.id}] [${t.completed ? 'COMPLETED' : 'PENDING'}] "${t.title}" (Due: ${t.dueDate || 'No date'} ${t.dueTime || ''}, Priority: ${t.priority || 'medium'}, Category: ${t.category || 'General'}, Location: ${t.location || 'None'})`).join('\n')
      : 'No tasks currently stored.';

    if (!apiKey) {
      const lastUserMsg = messages[messages.length - 1]?.content || '';
      return res.json({
        reply: `Got it! I heard: "${lastUserMsg}". (Running in local offline mode).`,
        action: null,
        audioBase64: null,
      });
    }

    const systemInstruction = `You are "Get It Done" — an intelligent, friendly AI assistant on an interactive, live voice phone call with ${userName}.
You are speaking directly to the user over the phone, just like talking to Gemini live.
Current date: ${todayIso}.

Current User's Tasks:
${tasksSummary}

CRITICAL PHONE CALL GUIDELINES:
1. TONE & LENGTH:
   - Speak naturally like a real human assistant on a phone call.
   - Keep replies brief and conversational: 1 to 2 sentences (around 15-40 words).
   - NEVER use markdown, bullet points, numbered lists, asterisks (**), or emojis in your reply, as this text will be directly spoken aloud by the voice engine over the phone!

2. MULTILINGUAL & BANGLA (বাংলা / BANGLISH) SUPPORT:
   - The user may speak in English, Bangla (বাংলা), or Banglish (e.g., "ajke shondhay gym add koro", "kal sokal 10tay meeting reschedule koro", "kajta sesh hoyeche tick dao")!
   - Understand Bangla instructions fluently.
   - If the user speaks in Bangla or Banglish, RESPOND IN NATURAL, WARM BANGLA (বাংলা)!
   - If the user speaks in English, RESPOND IN NATURAL ENGLISH!
   - If user asks in Bangla, acknowledge and confirm the action in Bangla (e.g. "আমি আজকের জন্য কাজটা যোগ করে দিয়েছি। আর কিছু করতে হবে?").

3. EXECUTING INSTRUCTIONS DURING THE CALL:
   The user can instruct you to:
   - CREATE a task (e.g., "Add buy groceries at 5pm", "কালকে সকাল ৯টায় মিটিং অ্যাড করো")
   - MODIFY or RESCHEDULE a task (e.g., "Change doctor appointment to tomorrow 10am", "মিটিং কালকে নিয়ে যাও")
   - COMPLETE a task (e.g., "I finished review product proposal", "কাজটা শেষ হয়েছে", "টিক দিয়ে দাও")
   - DELETE a task (e.g., "Delete the gym task", "মুছে ফেলো")

   Whenever the user instructs any of these actions, append a JSON action block at the VERY END of your response formatted exactly as:
\`\`\`action
{
  "action": "CREATE_TASK" | "UPDATE_TASK" | "COMPLETE_TASK" | "DELETE_TASK",
  "taskId": "task-id-if-modifying-or-completing-or-deleting",
  "task": {
    "title": "Title of task",
    "dueDate": "YYYY-MM-DD",
    "dueTime": "HH:mm or null",
    "priority": "low" | "medium" | "high",
    "category": "Personal" | "Work" | "Urgent" | "Health" | "Errands",
    "location": "location name or null"
  },
  "updates": {
    "title": "New title if changed",
    "dueDate": "YYYY-MM-DD if rescheduled",
    "dueTime": "HH:mm or null",
    "priority": "low" | "medium" | "high",
    "location": "location or null"
  }
}
\`\`\`
   Note: Match the closest existing taskId from the user's tasks list when completing, updating, or deleting. If creating a new task, taskId can be omitted.
   If no task creation or modification is intended, DO NOT include an action block.`;

    const contents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents,
      config: {
        systemInstruction,
        temperature: 0.35,
      },
    });

    const replyRaw = response.text || "I've noted that. What else can I help you with?";

    // Extract action block
    let actionData = null;
    const actionMatch = replyRaw.match(/```action\s*([\s\S]*?)\s*```/);
    let spokenReply = replyRaw;
    if (actionMatch && actionMatch[1]) {
      try {
        actionData = JSON.parse(actionMatch[1]);
        spokenReply = replyRaw.replace(/```action[\s\S]*?```/, '').trim();
      } catch (e) {
        console.warn('Failed to parse action json:', e);
      }
    }

    spokenReply = spokenReply.replace(/[*#_~`]/g, '').trim();

    // Generate voice audio for the assistant's reply if voice is not Device-Local
    let audioBase64: string | null = null;
    let mimeType = 'audio/mp3';

    if (voice !== 'Device-Local') {
      try {
        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: spokenReply,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice,
                },
              },
            },
          },
        });

        const parts = ttsResponse.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            audioBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || 'audio/mp3';
            break;
          }
        }
      } catch (ttsErr: any) {
        console.warn('TTS response generation warning:', ttsErr.message);
      }
    }

    res.json({
      reply: spokenReply,
      action: actionData,
      audioBase64,
      mimeType,
    });
  } catch (error: any) {
    console.error('Error in /api/call-conversation:', error);
    res.status(500).json({ error: error.message || 'Call turn failed' });
  }
});

// Mount Vite or static server
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });

    // Provide a silent client stub for @vite/client with full style and context helpers
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}

export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}

export class ErrorOverlay extends (typeof HTMLElement !== 'undefined' ? HTMLElement : Object) {}
if (typeof customElements !== 'undefined' && !customElements.get('vite-error-overlay')) {
  customElements.define('vite-error-overlay', ErrorOverlay);
}

export function createHotContext() {
  return {
    accept: () => {},
    prune: () => {},
    dispose: () => {},
    decline: () => {},
    invalidate: () => {},
    on: () => {},
    send: () => {}
  };
}

export const injectQuery = (url) => url;
export default {};
`);
    });

    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        // Remove @vite/client script injection as HMR is disabled in AI Studio preview iframe
        template = template.replace(/<script type="module" src="\/@vite\/client"><\/script>/g, '');
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
