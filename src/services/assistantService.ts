import type { Task } from '../types';
import { apiFetch } from './apiClient';
import { localGemmaEngine } from './localGemmaEngine';

export interface ConversationMessage { role: 'user' | 'assistant'; content: string }

async function callDirectGemini(
  messages: ConversationMessage[],
  tasks: Task[],
  apiKey: string,
  call?: { userName: string; voice: string; language: string },
  signal?: AbortSignal
) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const systemInstruction = `You are Aria, a warm, articulate, and highly capable executive personal assistant speaking live with ${call?.userName || 'your client'} over the phone. Today is ${today} in ${timeZone}.

VOICE & PERSONALITY:
- Speak naturally, warmly, and conversationally like a sharp, trusted chief of staff.
- Use natural spoken contractions (I'll, let's, we've, you're, got it) and friendly acknowledgments ("Got it!", "All done!", "Consider it done.").
- Keep responses brief (1 to 2 concise spoken sentences). Avoid robotic monologues or robotic disclaimers.
- Never say "I have noted that", "As an AI language model", or "I could not validate that instruction".
- If the user engages in small talk, greetings, or expresses stress, respond with genuine warmth and empathy first, then smoothly transition to how you can support them.
- Never use markdown formatting (no asterisks, bullet points, headers, or brackets) because your response will be read aloud over audio.
- If the user speaks in Bengali, reply in warm, natural conversational Bengali (বাংলা).

CURRENT SCHEDULE & TASKS:
${JSON.stringify(tasks)}

ACTION INSTRUCTIONS:
If the user asks to add, complete, delete, rename, edit, or reschedule a task, confirm it warmly in spoken speech and append a fenced action block at the end:
\`\`\`action
{"action":"CREATE_TASK","task":{"title":"title","dueDate":"YYYY-MM-DD","dueTime":null,"priority":"medium","category":"Personal","location":null}}
\`\`\`
Or:
\`\`\`action
{"action":"COMPLETE_TASK","taskId":"exact-existing-id"}
\`\`\`
Or:
\`\`\`action
{"action":"DELETE_TASK","taskId":"exact-existing-id"}
\`\`\`
Or (for editing title, date, time, priority, or category):
\`\`\`action
{"action":"UPDATE_TASK","taskId":"exact-existing-id","updates":{"title":"new title","dueDate":"YYYY-MM-DD","dueTime":"HH:mm","priority":"high"}}
\`\`\`
If the user refers to the last task or says "that", "it", or "change it to...", identify the target task and emit the UPDATE_TASK action with the requested fields.
If multiple tasks match and you are not sure which one, ask naturally: "Did you mean [task A] or [task B]?"`;

    const contents = messages.slice(-30).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const timeoutSignal = AbortSignal.timeout(15000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const res = await fetch(url, {
      method: 'POST',
      signal: combinedSignal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.3 }
      })
    });

    if (!res.ok) return null;
    const json = await res.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText.trim()) return null;

    const match = rawText.match(/```action\s*([\s\S]*?)\s*```/);
    let action = null;
    let reply = rawText.replace(/```action[\s\S]*?```/g, '').trim();

    if (match) {
      try {
        const { taskActionSchema } = await import('../shared/taskActions');
        const parsed = taskActionSchema.safeParse(JSON.parse(match[1]));
        if (parsed.success) {
          const candidate = parsed.data;
          if (candidate.action === 'CREATE_TASK' || tasks.some(t => t.id === candidate.taskId)) {
            action = candidate;
          } else {
            reply = "I couldn't find that specific task on your list. Could you clarify which one you'd like to update?";
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      reply,
      action,
      audioBase64: null,
      engineUsed: 'Gemini Direct API (Custom Key)',
      isNativeOnDevice: false
    };
  } catch {
    return null;
  }
}

export async function askAssistant(
  messages: ConversationMessage[],
  tasks: Task[],
  hybridMode: boolean,
  call?: { userName: string; voice: string; language: string },
  signal?: AbortSignal
) {
  const lastContent = messages.at(-1)?.content || '';

  // 1. Primary Cloud AI Path: Used whenever hybridMode is enabled and device is online
  if (hybridMode && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const callTimeoutSignal = AbortSignal.timeout(15000);
      const combinedSignal = signal ? AbortSignal.any([signal, callTimeoutSignal]) : callTimeoutSignal;
      const res = await apiFetch(
        call ? '/api/call-conversation' : '/api/chat',
        call ? { messages: messages.slice(-30), tasks, ...call } : { messages: messages.slice(-30), tasksContext: tasks },
        combinedSignal
      );
      if (res.ok) {
        const data = await res.json();
        if (!data.offline && typeof data.reply === 'string' && data.reply.trim()) {
          return { ...data, engineUsed: 'Cloud Gemini Live API' };
        }
      }

      // If backend returned offline or failed, check if user provided custom Gemini key in settings:
      const customKey = typeof window !== 'undefined' ? localStorage.getItem('getitdone_gemini_api_key')?.trim() : null;
      if (customKey && customKey.startsWith('AIza')) {
        const direct = await callDirectGemini(messages, tasks, customKey, call, signal);
        if (direct) return direct;
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      // Network failed or server error: seamless fallback to smart local AI below
    }
  }

  // 2. Smart Local AI Engine: Only used when offline, when "Local AI Only" is enabled in settings, or upon network failure
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = await localGemmaEngine.generateResponse(lastContent, tasks);
  return { ...result, audioBase64: null };
}
