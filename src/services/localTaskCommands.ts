import type { Task } from '../types';
import type { TaskAction } from '../shared/taskActions';
import { parseTaskLocally } from './localNlpParser';

// Normalize words for matching
function cleanWords(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['the', 'and', 'for', 'with', 'from', 'task', 'please', 'aria', 'my'].includes(w));
}

// Find matching task with exact, substring, or keyword scoring
function findMatchingTasks(targetText: string, tasks: Task[]): Task[] {
  const query = targetText.trim().toLowerCase();
  if (!query) return [];

  // 1. Direct ID match
  const byId = tasks.filter((t) => t.id.toLowerCase() === query);
  if (byId.length > 0) return byId;

  // 2. Full title exact or contains match
  const exactTitle = tasks.filter((t) => t.title.toLowerCase() === query);
  if (exactTitle.length > 0) return exactTitle;

  const containsTitle = tasks.filter(
    (t) => query.includes(t.title.toLowerCase()) || t.title.toLowerCase().includes(query)
  );
  if (containsTitle.length === 1) return containsTitle;

  // 3. Keyword token scoring
  const queryTokens = cleanWords(query);
  if (queryTokens.length === 0) return [];

  const scored = tasks.map((task) => {
    const taskTokens = cleanWords(task.title);
    let matchCount = 0;
    for (const q of queryTokens) {
      if (taskTokens.some((t) => t.includes(q) || q.includes(t))) {
        matchCount++;
      }
    }
    const score = matchCount / Math.max(queryTokens.length, 1);
    return { task, score, matchCount };
  });

  const best = scored.filter((s) => s.matchCount > 0).sort((a, b) => b.score - a.score);
  if (best.length === 0) return [];

  const topScore = best[0].score;
  const topMatches = best.filter((s) => s.score === topScore);

  if (topMatches.length === 1 && topScore >= 0.3) {
    return [topMatches[0].task];
  }

  return topMatches.map((m) => m.task);
}

export function localTaskCommand(text: string, tasks: Task[]): { reply: string; action?: TaskAction } | null {
  const input = text.trim();
  const lower = input.toLowerCase();

  // Any queries, questions or schedule reviews should be answered conversationally, not as mutating commands
  const isQuestion =
    /^(what|when|which|how|show|list|do i|can you show|tell me|read me)\b/i.test(input) ||
    /^(কী|কি|কখন|কোন|দেখাও|বলো)\b/.test(input) ||
    lower.includes('what are') ||
    lower.includes('what tasks') ||
    lower.includes('what is due') ||
    lower.includes('urgent tasks') ||
    lower.includes('highest priority');
  if (isQuestion) return null;

  // Detect Action Intents
  const deleting =
    /\b(delete|remove|cancel|get rid of|drop)\b/i.test(lower) ||
    /মুছে|ডিলিট|বাতিল/.test(input);

  const completing =
    /\b(complete|completed|finish|finished|done with|mark.*done|mark.*completed|check off|cross off|tick)\b/i.test(lower) ||
    /শেষ|কমপ্লিট|টিক|সম্পন্ন/.test(input);

  const updating =
    /\b(reschedule|move|postpone|change|update|push|delay)\b/i.test(lower) ||
    /সরাও|পরিবর্তন|নিয়ে যাও|পিছিয়ে/.test(input);

  // 1. Deleting, Completing, or Rescheduling
  if (deleting || completing || updating) {
    // Extract target task reference by stripping out command action words
    const strippedTarget = input
      .replace(/^(?:please\s+|can you\s+|could you\s+|hey aria\s+|aria\s+)?(?:delete|remove|cancel|get rid of|drop|complete|finish|mark|check off|cross off|reschedule|move|postpone|change|update)\s*(?:the\s+task\s+|the\s+|task\s+)?/i, '')
      .replace(/\s+(?:as\s+done|as\s+completed|done|completed|off|finished)\s*$/i, '')
      .replace(/মুছে|ডিলিট|বাতিল|শেষ|কমপ্লিট|টিক|সরাও|পরিবর্তন/g, '')
      .trim();

    // Check if target references "first", "top", or "next" task
    let targetTask: Task | null = null;
    const isFirstOrTop = /\b(first|top|next|current)\s*(?:task|item)?\b/i.test(strippedTarget);

    if (isFirstOrTop && tasks.length > 0) {
      const pending = tasks.filter((t) => !t.completed);
      targetTask = pending[0] || tasks[0];
    } else {
      const matches = findMatchingTasks(strippedTarget || input, tasks);
      if (matches.length > 1) {
        const titles = matches.map((m) => `"${m.title}"`).join(' or ');
        return {
          reply: `I see multiple matching tasks: ${titles}. Which specific one did you mean?`,
        };
      }
      if (matches.length === 1) {
        targetTask = matches[0];
      }
    }

    if (!targetTask) {
      if (deleting) return { reply: "I couldn't find that task to delete. Could you specify which one you'd like removed?" };
      if (completing) return { reply: "I couldn't find that task on your list. Which one did you finish?" };
      return { reply: "Which task would you like me to reschedule?" };
    }

    if (deleting) {
      return {
        reply: `Got it! Removed "${targetTask.title}" from your to-do list.`,
        action: { action: 'DELETE_TASK', taskId: targetTask.id },
      };
    }

    if (completing) {
      return {
        reply: `Awesome! I've marked "${targetTask.title}" as completed.`,
        action: { action: 'COMPLETE_TASK', taskId: targetTask.id },
      };
    }

    // Updating / Rescheduling
    const instruction = input.replace(new RegExp(targetTask.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
    const parsed = parseTaskLocally(instruction);
    const updates: Partial<Task> = {};
    if (/today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|আজ|কাল|পরশু|\d{4}-\d{2}-\d{2}/i.test(instruction)) {
      updates.dueDate = parsed.dueDate;
    }
    if (parsed.dueTime) updates.dueTime = parsed.dueTime;
    if (/urgent|important|low priority|optional|জরুরি|গুরুত্বপূর্ণ/i.test(instruction)) {
      updates.priority = parsed.priority;
    }
    if (!Object.keys(updates).length) {
      return { reply: `Sure, what new date or time should I set for "${targetTask.title}"?` };
    }
    return {
      reply: `All set! Updated "${targetTask.title}" on your schedule.`,
      action: { action: 'UPDATE_TASK', taskId: targetTask.id, updates },
    };
  }

  // 2. Add / Create Task
  const adding =
    /^(?:please\s+|can you\s+|could you\s+|i need to\s+|i want to\s+|don't forget to\s+|remember to\s+)?(?:add|create|schedule|set up|remind me to|put)\b/i.test(input) ||
    /^(?:remind me|put)\b/i.test(input) ||
    /যোগ করো|অ্যাড করো|করতে হবে|মনে রেখো/.test(input);

  if (adding) {
    let title = input
      .replace(/^(?:please\s+|can you\s+|could you\s+|i need to\s+|i want to\s+|don't forget to\s+|remember to\s+)?(?:add:?|create|schedule|set up|remind me to|put)\s*(?:a\s+task\s+to|a\s+reminder\s+to|a\s+to-do\s+to|to)?\s*/i, '')
      .replace(/\s+(?:on|to)\s+(?:my\s+)?(?:list|schedule|to-do\s+list|calendar)\s*$/i, '')
      .replace(/যোগ করো|অ্যাড করো|করতে হবে|মনে রেখো/g, '')
      .trim();

    if (!title) return { reply: 'What task would you like me to add for you?' };

    const task = parseTaskLocally(title);
    return {
      reply: `Done! Added "${task.title}" for ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ''}.`,
      action: { action: 'CREATE_TASK', task },
    };
  }

  return null;
}

