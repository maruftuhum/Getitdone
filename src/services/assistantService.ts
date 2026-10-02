import type { Task } from '../types';
import { apiFetch } from './apiClient';
import { localGemmaEngine } from './localGemmaEngine';
import { localTaskCommand } from './localTaskCommands';

export interface ConversationMessage { role: 'user' | 'assistant'; content: string }

export async function askAssistant(
  messages: ConversationMessage[],
  tasks: Task[],
  hybridMode: boolean,
  call?: { userName: string; voice: string; language: string },
  signal?: AbortSignal
) {
  const lastContent = messages.at(-1)?.content || '';

  // 1. Instant execution path for task actions (0ms network delay for voice calls)
  if (call) {
    const directAction = localTaskCommand(lastContent, tasks);
    if (directAction && directAction.action) {
      return {
        reply: directAction.reply,
        action: directAction.action,
        audioBase64: null,
        engineUsed: 'Instant Local Assistant',
        isNativeOnDevice: true,
      };
    }
  }

  // 2. Cloud Path with responsive deadline (2.4s max for live calls to prevent dead silence)
  if (hybridMode && navigator.onLine) {
    try {
      const callTimeoutSignal = call ? AbortSignal.timeout(2400) : AbortSignal.timeout(15000);
      const combinedSignal = signal ? AbortSignal.any([signal, callTimeoutSignal]) : callTimeoutSignal;
      const res = await apiFetch(
        call ? '/api/call-conversation' : '/api/chat',
        call ? { messages: messages.slice(-30), tasks, ...call } : { messages: messages.slice(-30), tasksContext: tasks },
        combinedSignal
      );
      if (res.ok) {
        const data = await res.json();
        if (!data.offline && typeof data.reply === 'string' && data.reply.trim()) {
          return { ...data, engineUsed: 'Cloud assistant' };
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      // Network slow or unauthenticated: seamlessly fall through to instant local response
    }
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = await localGemmaEngine.generateResponse(lastContent, tasks);
  return { ...result, audioBase64: null };
}

