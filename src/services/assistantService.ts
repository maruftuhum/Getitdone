import type { Task } from '../types';
import { apiFetch } from './apiClient';
import { localGemmaEngine } from './localGemmaEngine';

export interface ConversationMessage { role: 'user' | 'assistant'; content: string }
export async function askAssistant(messages: ConversationMessage[], tasks: Task[], hybridMode: boolean, call?: { userName: string; voice: string; language: string }, signal?: AbortSignal) {
  if (hybridMode && navigator.onLine) {
    try {
      const res = await apiFetch(call ? '/api/call-conversation' : '/api/chat', call ? { messages: messages.slice(-30), tasks, ...call } : { messages: messages.slice(-30), tasksContext: tasks }, signal);
      if (res.ok) {
        const data = await res.json();
        if (!data.offline && typeof data.reply === 'string') return { ...data, engineUsed: 'Cloud assistant' };
      }
    } catch (error) { if (signal?.aborted) throw error; }
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = await localGemmaEngine.generateResponse(messages.at(-1)?.content || '', tasks);
  return { ...result, audioBase64: null };
}
