import { TaskCategory, TaskPriority } from '../types';
import { isCalendarDate } from '../shared/dates';

export interface ParsedTaskResult {
  title: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string | null; // HH:mm
  location: string | null;
  category: TaskCategory;
  priority: TaskPriority;
}

export function parseTaskLocally(rawInput: string, now = new Date()): ParsedTaskResult {
  let text = rawInput.trim();
  
  // Format Date to YYYY-MM-DD
  const formatIsoDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  let targetDate = new Date(now);
  let dueTime: string | null = null;
  let priority: TaskPriority = 'medium';
  let category: TaskCategory = 'General';
  let location: string | null = null;

  // Convert Bengali numerals to Western digits (০-৯ -> 0-9)
  text = text.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d).toString());

  // Check for hashtag custom tags (e.g. #finance, #groceries, #project)
  const hashTagMatch = text.match(/#([a-zA-Z0-9_\-\u0980-\u09FF]+)/);
  if (hashTagMatch) {
    category = hashTagMatch[1];
    text = text.replace(hashTagMatch[0], '').trim();
  }

  // 1. Detect Priority (English & Bangla)
  if (/\b(urgent|asap|important|critical|p1|emergency)\b/i.test(text) || /(জরুরি|জরুরী|গুরুত্বপূর্ণ)/.test(text)) {
    priority = 'high';
    text = text
      .replace(/\b(urgent|asap|important|critical|p1|emergency)\b/gi, '')
      .replace(/(জরুরি|জরুরী|গুরুত্বপূর্ণ)/g, '')
      .trim();
  } else if (/\b(low priority|whenever|someday|p3|optional)\b/i.test(text) || /(কম গুরুত্বপূর্ণ)/.test(text)) {
    priority = 'low';
    text = text.replace(/\b(low priority|whenever|someday|p3|optional)\b/gi, '').trim();
  }

  // 3. Detect Relative Days (English & Bangla)
  const explicitDate = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (explicitDate && isCalendarDate(explicitDate[0])) {
    targetDate = new Date(`${explicitDate[0]}T12:00:00`);
    text = text.replace(explicitDate[0], '').trim();
  } else if (/\bday after tomorrow\b/i.test(text) || /(পরশুদিন|পরশু)/.test(text)) {
    targetDate.setDate(targetDate.getDate() + 2);
    text = text.replace(/\bday after tomorrow\b/gi, '').replace(/(পরশুদিন|পরশু)/g, '').trim();
  } else if (/\b(today|tonight)\b/i.test(text) || /(আজকে|আজ)/.test(text)) {
    targetDate = new Date(now);
    text = text.replace(/\b(today|tonight)\b/gi, '').replace(/(আজকে|আজ)/g, '').trim();
  } else if (/\btomorrow\b/i.test(text) || /(আগামীকাল|কালকে|(?<![\u0980-\u09ff])কাল(?![\u0980-\u09ff]))/.test(text)) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
    text = text.replace(/\btomorrow\b/gi, '').replace(/(আগামীকাল|কালকে|(?<![\u0980-\u09ff])কাল(?![\u0980-\u09ff]))/g, '').trim();
  } else if (/\bday after tomorrow\b/i.test(text) || /(পরশু|পরশুদিন)/.test(text)) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 2);
    text = text.replace(/\bday after tomorrow\b/gi, '').replace(/(পরশু|পরশুদিন)/g, '').trim();
  } else {
    // Weekday match (e.g., "next monday", "on friday")
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekdayMatch = text.match(/\b(?:next\s+|on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (weekdayMatch) {
      const targetDayIndex = days.indexOf(weekdayMatch[1].toLowerCase());
      if (targetDayIndex !== -1) {
        const currentDayIndex = now.getDay();
        let daysToAdd = (targetDayIndex - currentDayIndex + 7) % 7;
        if (daysToAdd === 0) daysToAdd = 7; // next week if same day
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        text = text.replace(weekdayMatch[0], '').trim();
      }
    }
  }

  // 4. Detect Time (English "4pm", "3:30 pm", "14:00" & Bangla "বিকেল ৫টা", "সকাল ১০টায়", "রাত ৮টা")
  const banglaPeriodMatch = text.match(/(সকাল|দুপুর|বিকেল|সন্ধ্যা|রাত)\s*(\d{1,2})(?::(\d{2}))?\s*(?:টায়|টা)?/);
  if (banglaPeriodMatch) {
    const period = banglaPeriodMatch[1];
    let hour = parseInt(banglaPeriodMatch[2], 10);
    const minute = banglaPeriodMatch[3] ? parseInt(banglaPeriodMatch[3], 10) : 0;

    if ((period === 'দুপুর' || period === 'বিকেল' || period === 'সন্ধ্যা' || period === 'রাত') && hour < 12) {
      hour += 12;
    }
    if (period === 'রাত' && hour === 24) hour = 0;

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      text = text.replace(banglaPeriodMatch[0], '').trim();
    }
  } else {
    const timeMatch = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|টা|টায়)?\b/i);
    if (timeMatch && (timeMatch[3] || text.includes(':') || /\bat\s+\d/i.test(text))) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;

      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        text = text.replace(timeMatch[0], '').trim();
      }
    }
  }

  // 5. Detect Location (e.g. "at Starbucks", "in office", "at City Hall")
  const locationMatch = text.match(/\b(?:at|in)\s+([A-Z][a-zA-Z0-9\s]+?)(?:$|\s+(?:tomorrow|today|urgent|at))/);
  if (locationMatch && locationMatch[1]) {
    location = locationMatch[1].trim();
    text = text.replace(locationMatch[0], '').trim();
  }

  // Clean trailing prepositions & extra spaces
  let cleanTitle = text
    .replace(/\b(at|on|by|in|for|due)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanTitle) {
    cleanTitle = rawInput.trim();
  }

  return {
    title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
    dueDate: formatIsoDate(targetDate),
    dueTime,
    location,
    category,
    priority,
  };
}
