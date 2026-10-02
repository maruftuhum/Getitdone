import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { taskActionSchema, taskFields } from '../src/shared/taskActions';
import { zonedClock } from '../src/shared/dates';
import { routeSchemas, validate } from './security';
import type { Task } from '../src/types';

export function createAiRouter() {
  const router = express.Router();
  const key = process.env.GEMINI_API_KEY;
  const ai = key ? new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 18000 } }) : null;
  const textModel = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
  const speechModel = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  async function text(contents: any, systemInstruction?: string, json = false) {
    const response = await ai!.models.generateContent({ model: textModel, contents, config: { systemInstruction, temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) } });
    return response.text || '';
  }
  async function speech(content: string, voice = 'Puck') {
    if (!ai || voice === 'Device-Local') return { audioBase64: null, fallbackToSpeechSynthesis: true };
    try {
      const response = await ai.models.generateContent({ model: speechModel, contents: content, config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } });
      const audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
      return audio ? { audioBase64: audio.data, mimeType: audio.mimeType || 'audio/L16;rate=24000' } : { audioBase64: null, fallbackToSpeechSynthesis: true };
    } catch { return { audioBase64: null, fallbackToSpeechSynthesis: true }; }
  }
  for (const [path, schema] of Object.entries(routeSchemas)) {
    router.post(path, validate(schema), async (req, res) => {
      try {
        const body = req.body;
        const today = zonedClock(new Date(), body.timeZone).date;
        const tasks: Task[] = body.tasks || body.tasksContext || [];
        if (path === '/tts') { res.json({ text: body.text, ...await speech(body.text, body.voice) }); return; }
        if (path === '/chat' || path === '/call-conversation') {
          if (!ai) { res.json({ offline: true, reply: '', action: null }); return; }
          const instruction = `You are Aria, a warm, articulate, and highly capable executive personal assistant speaking live with ${body.userName || 'your client'} over the phone. Today is ${today} in ${body.timeZone}.

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
If the user asks to add, complete, delete, or reschedule a task, confirm it warmly in spoken speech and append a fenced action block at the end:
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
Or:
\`\`\`action
{"action":"UPDATE_TASK","taskId":"exact-existing-id","updates":{"dueDate":"YYYY-MM-DD","dueTime":"HH:mm"}}
\`\`\`
If multiple tasks match and you are not sure which one, ask naturally: "Did you mean [task A] or [task B]?"`;
          const raw = await text(body.messages.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })), instruction);
          const match = raw.match(/```action\s*([\s\S]*?)\s*```/);
          let action = null;
          let reply = raw.replace(/```action[\s\S]*?```/g, '').trim();
          if (match) {
            let parsed;
            try { parsed = taskActionSchema.safeParse(JSON.parse(match[1])); } catch { parsed = null; }
            if (parsed?.success) {
              const candidate = parsed.data;
              if (candidate.action === 'CREATE_TASK' || tasks.some(t => t.id === candidate.taskId)) action = candidate;
              else reply = "I couldn't find that specific task on your list. Could you clarify which one you'd like to update?";
            } else reply = "I caught that, but could you tell me once more what change you'd like to make?";
          }
          res.json({ reply, action, ...(path === '/call-conversation' ? await speech(reply, body.voice) : {}) });
          return;
        }
        if (path === '/parse-task') {
          if (!ai) { res.json({ offline: true }); return; }
          const raw = await text(`Extract the task from ${JSON.stringify(body.input)}. Today is ${today} in ${body.timeZone}. Return JSON with title, dueDate YYYY-MM-DD, dueTime HH:mm or null, location string or null, category Personal/Work/Urgent/Health/Errands, priority low/medium/high.`, undefined, true);
          const parsed = taskFields.safeParse(JSON.parse(raw));
          if (!parsed.success) { res.status(422).json({ error: 'Could not parse that task.' }); return; }
          res.json(parsed.data); return;
        }
        const due = tasks.filter(t => !t.completed && t.dueDate === today);
        const name = body.userName && body.userName !== 'there' ? body.userName : '';
        const greeting = name ? `Hey ${name}!` : 'Hey there!';
        let script = due.length === 0
          ? `${greeting} You're all clear today with no urgent tasks. Would you like to plan anything new, or are you taking it easy?`
          : `${greeting} You have ${due.length} ${due.length === 1 ? 'task' : 'tasks'} on your radar today. Next up is ${due[0].title}${due[0].dueTime ? ` at ${due[0].dueTime}` : ''}. Ready to jump in?`;
        if (ai) {
          try {
            script = (await text(`You are Aria, an executive assistant calling ${body.userName || 'your client'}.
Write a warm, spoken ${body.callType} briefing (30 to 45 words max, no markdown, no robot tone).
Today is ${today} in ${body.timeZone}.
Pending tasks for today: ${JSON.stringify(due)}.
Speak naturally, enthusiastically, and conversationally like a trusted personal chief of staff.`)).trim() || script;
          } catch { /* use deterministic warm briefing */ }
        }
        res.json({ script, taskCount: due.length, ...(path === '/prepare-call' ? await speech(script, body.voice) : {}) });
      } catch (error) {
        console.error('AI request failed:', error instanceof Error ? error.message : 'unknown');
        res.status(502).json({ error: 'The cloud assistant is unavailable. Try the local assistant.' });
      }
    });
  }
  return router;
}
