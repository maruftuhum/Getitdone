# Get It Done — Intelligent Task Manager & AI Voice Call Assistant

An intelligent, mobile-first task and schedule manager designed as an installable Android PWA, featuring Google Tasks-style simplicity, an integrated calendar, a Messenger-style floating chat head, and full simulated AI phone call briefings with realistic audio ringing and two-way voice dialogue.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices have been confirmed and will guide the implementation:

- **Confirmed Decision 1 (AI Briefing Call)**: Full simulated phone call experience featuring realistic incoming call audio ringing chime, caller screen with answer/decline sliders, in-call audio timer, animated voice frequency visualizer, and back-and-forth speech conversation using Gemini TTS (`gemini-3.8-flash-tts`) and voice recognition.
- **Confirmed Decision 2 (Data Storage & Sync)**: Firebase Firestore cloud sync with real-time listeners and offline-resilient local cache, enabling multi-device synchronization and instant offline access on Android phones.
- **Confirmed Decision 3 (AI Engine)**: Hybrid intelligence mode combining an instant zero-latency on-device regex/natural-language task parser (for offline commands like "meeting tomorrow at 3pm at cafe") with server-side Gemini 3.1 Flash-Lite for deep conversational scheduling, query handling, and task prioritization.
- **Confirmed Decision 4 (Floating Chat Head)**: A draggable Messenger-style floating bubble with unread task indicators that expands into a quick-input sheet from anywhere in the app to capture tasks by voice or typing.

---

## 1. Overview & Core Concept

- **What It Does**: "Get It Done" is a personal productivity companion for mobile that merges the streamlined clarity of Google Tasks with the active proactivity of an executive assistant. Users can manage tasks with dates, times, locations, and subtasks, view them across an interactive month/week/day calendar, chat naturally with an AI assistant to organize their schedule, tap a floating chat head for rapid task capture, and receive simulated voice calls from the AI that ring like an incoming phone call to deliver spoken morning briefings and reschedule tasks on the fly.
- **Target Audience / Persona**: Busy professionals, students, and mobile users on Android who want an effortless way to keep on top of their daily tasks without feeling overwhelmed, enjoying hands-free voice interactions and proactive check-ins.
- **Key Value**: Closes the loop between task creation and execution by actively engaging the user through natural voice calls and instant chat-head capture instead of letting to-do lists get forgotten.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Daily Dashboard & Task Operations**:
   - Clean view of tasks grouped by "Today", "Upcoming", and custom lists (Personal, Work, Urgent).
   - Checkbox completion with satisfying micro-animation and haptic-style sound toggle.
   - Quick date/time chips, location tags, priority flags, and reminder alerts.
2. **Interactive Calendar Schedule**:
   - Visual monthly grid and weekly timeline showing task load per day with status dots.
   - Tap any date to filter tasks or create scheduled items directly at specific time slots.
3. **Floating Chat Head (Messenger Style)**:
   - Draggable floating circular bubble docked to screen edges with task badge.
   - Single tap opens an overlay modal with speech-to-text microphone and quick natural language command input ("Call dentist at 4pm on Friday").
4. **Simulated AI Voice Call (Briefing & Check-in)**:
   - Triggerable on-demand ("Call Me Now") or via scheduled briefing alarms (e.g., 9:00 AM daily briefing).
   - Rings with an authentic phone ringtone chime and vibrating pulse.
   - Incoming call screen displays "Get It Done AI Assistant" with accept (green) and decline (red) actions.
   - Answering launches the active call interface: audio waves pulse as Gemini speaks a personalized spoken brief ("Good morning! You have 3 tasks due today...").
   - User speaks back or taps quick vocal prompts ("Mark 1st task done", "Reschedule to 5 PM", "What else is due?").
5. **Conversational Assistant Tab**:
   - Full multi-turn chat with conversation history to ask questions ("What is my busiest day this week?", "Help me break down my project into 5 steps").
   - Directly executes task operations (create, update, delete, search) via structured tools.
6. **PWA Android Installation**:
   - Prominent install banner and Android web app manifest configured with maskable icons and standalone mobile display mode.

### Visual Identity & Theme

- **Aesthetic Direction**: Google Material You / Utilitarian Zen with clean typography, high legibility, and refined spacing inspired by modern Android productivity apps.
- **Color Palette (60-30-10 Rule)**:
  - *60% Neutral Canvas*: Slate-50 (#F8FAFC) in light mode, Slate-950 (#020617) in dark mode.
  - *30% Structural Surfaces*: Pure white (#FFFFFF) / Slate-900 (#0F172A) cards with delicate 1px borders (#E2E8F0 / #1E293B).
  - *10% Vibrant Accents*: Indigo-600 (#4F46E5) primary accent, Emerald-600 (#059669) for completions, Coral/Amber (#F59E0B) for urgent deadlines.
- **Typography & Scale**:
  - *Headings & Display*: Plus Jakarta Sans (clean, geometric, contemporary).
  - *Body & Controls*: Inter / system sans-serif (balanced 15px body, tabular numbers for times/dates).
  - *Zero-Pill Discipline*: Text metadata formatted cleanly with subtle typographic dividers (`·` or `/`) rather than cluttered pill capsules.
- **Thumb-Zone Ergonomics**:
  - Fixed 5-item bottom navigation (Tasks, Calendar, AI Call, Chat, Settings).
  - Primary Add Task floating action button within immediate thumb reach.
  - Generous touch targets (minimum 44x44px hitbox) on all interactive controls.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Hybrid AI Processing Architecture**:
  - *Chosen Approach*: On-device natural language rule engine runs first (instant regex parsing for dates, times, priorities) + Server-side Gemini 3.1 Flash-Lite handles complex reasoning, context summarization, and conversation.
  - *Why*: Delivers instant sub-50ms feedback when creating tasks locally while still offering state-of-the-art LLM intelligence without lag.
  - *Alternatives Considered*: Pure cloud LLM (creates network latency for trivial tasks) vs. Pure local rules (lacks conversational depth and natural voice synthesis).
- **Decision 2: Realistic Phone Call Audio Synthesis**:
  - *Chosen Approach*: Synthesize authentic dual-tone telephone ringing using the Web Audio API oscillator nodes (guaranteeing zero external audio file latency or broken links), combined with server-side Gemini 3.8 Flash-TTS for clear speech playback.
  - *Why*: Works completely reliably offline and online, perfectly mimics native phone ringers, and provides high-fidelity spoken dialogue.
- **Decision 3: Firebase Persistence with Local Fallback**:
  - *Chosen Approach*: Firestore with user authentication and real-time synchronization, supplemented by IndexedDB/localStorage fallback so the app works seamlessly even without cloud credentials.
  - *Why*: Satisfies the user's explicit preference for Firebase while maintaining offline-first PWA resilience.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Mobile Browser / Android PWA                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────┐    ┌──────────────────────────────────────┐  │
│  │     PWA Shell & Worker    │    │      Messenger Floating Bubble       │  │
│  │ (Manifest, ServiceWorker) │    │  (Draggable Thumb Action & Mic Capture│  │
│  └─────────────┬─────────────┘    └──────────────────┬───────────────────┘  │
│                │                                     │                      │
│  ┌─────────────▼─────────────────────────────────────▼───────────────────┐  │
│  │                         React 19 App Engine                           │  │
│  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ │  │
│  │ │ Tasks View   │ │Calendar View │ │AI Call Studio│ │AI Chat Thread │ │  │
│  │ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └───────┬───────┘ │  │
│  │        │                │                │                 │         │  │
│  │ ┌──────▼────────────────▼────────────────▼─────────────────▼───────┐ │  │
│  │ │                  State Manager & Hybrid Task Engine               │ │  │
│  │ │   - Local Regex/Heuristic Parser (instant offline task parsing)  │ │  │
│  │ │   - Web Audio Ringtone Chime & Speech Recognition / Playback     │ │  │
│  │ └──────────────────────┬──────────────────────────┬────────────────┘ │  │
│  └────────────────────────┼──────────────────────────┼──────────────────┘  │
└───────────────────────────┼──────────────────────────┼─────────────────────┘
                            │                          │
              ┌─────────────▼────────────┐ ┌───────────▼───────────┐
              │    Firebase Firestore    │ │   Express Server API  │
              │  - tasks/{taskId}        │ │  - POST /api/chat     │
              │  - users/{userId}        │ │  - POST /api/tts      │
              │  - schedules/{scheduleId}│ │  - POST /api/briefing │
              └──────────────────────────┘ └───────────┬───────────┘
                                                       │
                                           ┌───────────▼───────────┐
                                           │    Google GenAI SDK   │
                                           │ - gemini-3.1-flash-lite
                                           │ - gemini-3.8-flash-tts│
                                           └───────────────────────┘
```

### Data Model & Firestore Schema

- **Collection `tasks`**:
  - `id`: string (UUID)
  - `userId`: string (owner reference)
  - `title`: string (task title, max 200 chars)
  - `description`: string (notes or details, max 1000 chars)
  - `dueDate`: string (ISO date string YYYY-MM-DD)
  - `dueTime`: string (optional HH:mm)
  - `location`: string (optional location name, e.g. "Office", "Home")
  - `category`: string ("Work" | "Personal" | "Urgent" | "Health" | "Errands")
  - `priority`: string ("low" | "medium" | "high")
  - `completed`: boolean
  - `completedAt`: string | null
  - `subtasks`: array of `{ id: string, title: string, completed: boolean }`
  - `createdAt`: server timestamp
  - `updatedAt`: server timestamp

- **Collection `call_schedules`**:
  - `id`: string
  - `userId`: string
  - `scheduledTime`: string (e.g. "09:00")
  - `enabled`: boolean
  - `callType`: "morning_brief" | "evening_recap" | "urgent_reminder"

---

## 5. Implementation Steps

1. **Firebase Provisioning & Security Hardening**:
   - Provision Firebase using the AI Studio setup workflow.
   - Configure `firebase-blueprint.json` and deploy hardened `firestore.rules` adhering to the Eight Pillars of security.
2. **PWA Mobile Foundation**:
   - Install and configure `vite-plugin-pwa` with manifest, theme colors, and icons.
   - Add install prompt hook and in-app button with Android and iOS guidance.
3. **Backend Express API & Gemini Endpoints**:
   - Set up `server.ts` with secure routes:
     - `/api/chat`: Multi-turn Gemini 3.1 Flash-Lite with task management tool execution.
     - `/api/tts`: Gemini 3.8 Flash-TTS returning base64 audio for briefing voice speech.
     - `/api/briefing`: Generates personalized briefing scripts based on current tasks.
4. **Core Task Manager & Calendar**:
   - Google Tasks-style interface with category tabs, search, filtering, and instant checkboxes.
   - Visual calendar component with month grid, task indicators, and date-based scheduling.
5. **Messenger Floating Chat Head**:
   - Draggable floating avatar bubble that can stay on screen or minimize.
   - Quick expansion into conversational capture card with voice recognition.
6. **Simulated AI Phone Call Experience**:
   - Web Audio synthesizer for standard telephone ringing cadence (US/Europe chime).
   - Incoming call full-screen modal with accept/decline buttons.
   - Active call screen with animated waveform, live audio playback, voice recognition mic input, and conversational task briefing.
7. **Verification & Testing**:
   - Run end-to-end compilation with `compile_applet` and linting to ensure zero build errors.
