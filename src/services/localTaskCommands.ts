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

let lastActionedTaskId: string | null = null;

export function setLastActionedTaskId(id: string | null) {
  lastActionedTaskId = id;
}

export function getLastActionedTaskId(): string | null {
  return lastActionedTaskId;
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
    /\b(reschedule|move|postpone|change|update|push|delay|edit|rename|make|set)\b/i.test(lower) ||
    /সরাও|পরিবর্তন|নিয়ে যাও|পিছিয়ে|বদলাও|এডিট/.test(input);

  // 1. Deleting, Completing, or Rescheduling / Editing
  if (deleting || completing || updating) {
    // Check if target is a contextual follow-up ("that", "it", "the task", "this")
    const isContextualFollowup = /\b(that|it|this|last task|previous task)\b/i.test(input) ||
      (/^(?:actually\s+|please\s+)?(?:change|move|reschedule|push|edit|make|set)\s+(?:it|that|time|date|to)\b/i.test(input) && !tasks.some(t => lower.includes(t.title.toLowerCase())));

    let targetTask: Task | null = null;

    if (isContextualFollowup) {
      if (lastActionedTaskId) {
        targetTask = tasks.find(t => t.id === lastActionedTaskId) || null;
      }
      if (!targetTask && tasks.length > 0) {
        const pending = tasks.filter(t => !t.completed);
        targetTask = pending[0] || tasks[0];
      }
    }

    if (!targetTask) {
      // Extract target task reference by stripping out command action words
      const strippedTarget = input
        .replace(/^(?:please\s+|can you\s+|could you\s+|hey aria\s+|aria\s+)?(?:delete|remove|cancel|get rid of|drop|complete|finish|mark|check off|cross off|reschedule|move|postpone|change|update|edit|rename|make|set)\s*(?:the\s+task\s+|the\s+|task\s+)?/i, '')
        .replace(/\s+(?:as\s+done|as\s+completed|done|completed|off|finished|urgent|critical|high priority|low priority|important)\s*$/i, '')
        .replace(/মুছে|ডিলিট|বাতিল|শেষ|কমপ্লিট|টিক|সরাও|পরিবর্তন|বদলাও/g, '')
        .trim();

      // Check if target references "first", "top", or "next" task
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
    }

    if (!targetTask) {
      if (deleting) return { reply: "I couldn't find that task to delete. Could you specify which one you'd like removed?" };
      if (completing) return { reply: "I couldn't find that task on your list. Which one did you finish?" };
      return { reply: "Which task would you like me to edit or reschedule?" };
    }

    if (deleting) {
      setLastActionedTaskId(null);
      return {
        reply: `Got it! Removed "${targetTask.title}" from your to-do list.`,
        action: { action: 'DELETE_TASK', taskId: targetTask.id },
      };
    }

    if (completing) {
      setLastActionedTaskId(targetTask.id);
      return {
        reply: `Awesome! I've marked "${targetTask.title}" as completed.`,
        action: { action: 'COMPLETE_TASK', taskId: targetTask.id },
      };
    }

    // -------------------------------------------------------------
    // Comprehensive Task Editing (Title, Date, Time, Priority, Category)
    // -------------------------------------------------------------
    setLastActionedTaskId(targetTask.id);
    const updates: Partial<Task> = {};
    const instruction = input.replace(new RegExp(targetTask.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');

    // A. Title / Renaming Detection
    let newTitleCandidate: string | null = null;

    // Pattern 1: Explicit "rename [that/it/task] to [new title]" or "rename to [new title]"
    const renameExplicit = input.match(/\brename\s+(?:(?:that|it|the\s+task|["']?.+?["']?)\s+to|to)\s+["']?([^"'.\n]+)["']?/i);
    if (renameExplicit && renameExplicit[1]) {
      newTitleCandidate = renameExplicit[1].trim();
    }

    // Pattern 2: Explicit "change title/name (of ...) to [new title]"
    const titleExplicit = input.match(/\b(?:change\s+(?:the\s+)?(?:title|name)\s+(?:of\s+.*?\s+)?to)\s+["']?([^"'.\n]+)["']?/i);
    if (!newTitleCandidate && titleExplicit && titleExplicit[1]) {
      newTitleCandidate = titleExplicit[1].trim();
    }

    // Pattern 3: Contextual title replacement: e.g. "change that to buy organic milk", "change it to buy groceries", "actually buy bread"
    if (!newTitleCandidate && isContextualFollowup) {
      const changeToMatch = input.match(/^(?:actually\s+|please\s+)?(?:change|edit|make|set)\s+(?:that|it|this|the\s+task)?\s*(?:to|:)?\s+([^"'.\n]+)$/i);
      if (changeToMatch && changeToMatch[1]) {
        const candidate = changeToMatch[1].trim();
        // Check if candidate is purely date, time or priority (e.g. "tomorrow at 5pm", "urgent")
        const isPureDateTimeOrPriority =
          /^(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|urgent|critical|high priority|low priority|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|at\s+\d{1,2}|কাল|আজ|পরশু)\b/i.test(candidate) &&
          !/(?:buy|call|meeting|visit|email|finish|check|clean|read|write|cook|pay|go to|meet|pickup|pick up|doctor|dentist)/i.test(candidate);
        if (!isPureDateTimeOrPriority) {
          newTitleCandidate = candidate;
        }
      }
    }

    // Pattern 4: Bengali title renaming: "নাম পরিবর্তন করে ... রাখো", "টাইটেল বদলাও: ...", "টাইটেল ... করো"
    const bnRename = input.match(/(?:নাম\s+পরিবর্তন\s+করে|টাইটেল\s+বদলাও|টাইটেল)\s*[:]?\s*([^\n.,]+)/);
    if (!newTitleCandidate && bnRename && bnRename[1]) {
      newTitleCandidate = bnRename[1].replace(/রাখো|করো/g, '').trim();
    }

    if (newTitleCandidate) {
      const parsedCandidate = parseTaskLocally(newTitleCandidate);
      const cleaned = parsedCandidate.title.replace(/^(?:to|as|the\s+task)\s+/i, '').trim();
      if (cleaned && cleaned.toLowerCase() !== targetTask.title.toLowerCase()) {
        updates.title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      if (/today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|আজ|কাল|পরশু/i.test(newTitleCandidate)) {
        updates.dueDate = parsedCandidate.dueDate;
      }
      if (parsedCandidate.dueTime) {
        updates.dueTime = parsedCandidate.dueTime;
      }
      if (parsedCandidate.priority !== 'medium') {
        updates.priority = parsedCandidate.priority;
      }
    }

    // B. Date & Time Detection
    const parsed = parseTaskLocally(instruction || input);
    if (/today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|আজ|কাল|পরশু|\d{4}-\d{2}-\d{2}/i.test(instruction || input)) {
      updates.dueDate = parsed.dueDate;
    }
    if (parsed.dueTime) {
      updates.dueTime = parsed.dueTime;
    }

    // C. Priority Detection
    if (/\b(urgent|critical|high priority|asap)\b/i.test(input) || /(জরুরি|জরুরী|গুরুত্বপূর্ণ)/.test(input)) {
      updates.priority = 'high';
    } else if (/\b(low priority|optional|whenever|someday)\b/i.test(input)) {
      updates.priority = 'low';
    } else if (/\b(medium priority|normal priority)\b/i.test(input)) {
      updates.priority = 'medium';
    }

    // D. Category Detection
    const categoryMatch = input.match(/\b(?:category|tag)\s+(?:to\s+)?(personal|work|urgent|health|errands|finance)\b/i) ||
      input.match(/\b(personal|work|urgent|health|errands|finance)\s+category\b/i);
    if (categoryMatch) {
      const cat = categoryMatch[1].toLowerCase();
      updates.category = cat.charAt(0).toUpperCase() + cat.slice(1);
    }

    if (!Object.keys(updates).length) {
      return { reply: `I'm ready to update "${targetTask.title}". You can tell me to change the title, reschedule the date or time, or set it to urgent.` };
    }

    let confirmation = `All set! Updated "${targetTask.title}" on your schedule.`;
    if (updates.title && (updates.dueDate || updates.dueTime)) {
      confirmation = `Done! Renamed to "${updates.title}" and rescheduled for ${updates.dueDate || targetTask.dueDate}${updates.dueTime ? ' at ' + updates.dueTime : ''}.`;
    } else if (updates.title) {
      confirmation = `Done! Renamed "${targetTask.title}" to "${updates.title}".`;
    } else if (updates.dueDate || updates.dueTime) {
      confirmation = `All set! Rescheduled "${targetTask.title}" for ${updates.dueDate || targetTask.dueDate}${updates.dueTime ? ' at ' + updates.dueTime : ''}.`;
    } else if (updates.priority) {
      confirmation = `Done! Marked "${targetTask.title}" as ${updates.priority} priority.`;
    }

    return {
      reply: confirmation,
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


