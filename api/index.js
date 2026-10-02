// server/app.ts
import express3 from "express";

// server/security.ts
import { rateLimit } from "express-rate-limit";
import { z as z2 } from "zod";

// server/firebaseAdmin.ts
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import path from "node:path";
var config = JSON.parse(readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
function adminApp() {
  return getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || config.projectId });
}
async function verifyToken(token) {
  return (await getAuth(adminApp()).verifyIdToken(token, true)).uid;
}
function adminDatabase() {
  return getFirestore(adminApp(), config.firestoreDatabaseId || "(default)");
}

// src/shared/taskActions.ts
import { z } from "zod";

// src/shared/dates.ts
var formatters = /* @__PURE__ */ new Map();
function zonedClock(date, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    if (formatters.size >= 64) formatters.delete(formatters.keys().next().value);
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
function isTimeZone(value) {
  try {
    zonedClock(/* @__PURE__ */ new Date(), value);
    return true;
  } catch {
    return false;
  }
}
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// src/shared/taskActions.ts
var dateSchema = z.string().refine(isCalendarDate, "Invalid calendar date");
var timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var taskFields = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: dateSchema,
  dueTime: timeSchema.nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  description: z.string().max(2e3).optional(),
  category: z.string().trim().min(1).max(50),
  priority: z.enum(["low", "medium", "high"])
});
var taskSchema = taskFields.extend({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  userId: z.string().min(1).max(128),
  completed: z.boolean(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  subtasks: z.array(z.object({ id: z.string(), title: z.string().max(200), completed: z.boolean() })).max(100).optional()
});
var updatesSchema = taskFields.partial().strict().refine((v) => Object.keys(v).length > 0, "No updates supplied");
var taskActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CREATE_TASK"), task: taskFields }),
  z.object({ action: z.literal("COMPLETE_TASK"), taskId: z.string().min(1) }),
  z.object({ action: z.literal("DELETE_TASK"), taskId: z.string().min(1) }),
  z.object({ action: z.literal("UPDATE_TASK"), taskId: z.string().min(1), updates: updatesSchema }),
  z.object({ action: z.literal("RESCHEDULE_TASK"), taskId: z.string().min(1), updates: updatesSchema })
]);

// server/security.ts
var timeZoneSchema = z2.string().max(100).refine(isTimeZone);
var alarmSchema = z2.object({ id: z2.string().regex(/^[\w-]{1,128}$/), label: z2.string().trim().min(1).max(200), time: timeSchema, enabled: z2.boolean(), callType: z2.enum(["morning_brief", "afternoon_check", "evening_recap", "custom_alarm"]) });
var messages = z2.array(z2.object({ role: z2.enum(["user", "assistant"]), content: z2.string().min(1).max(4e3) })).min(1).max(30);
var taskList = z2.array(taskSchema).max(500);
var voice = z2.enum(["Puck", "Aoede", "Fenrir", "Kore", "Device-Local"]).default("Puck");
var routeSchemas = {
  "/chat": z2.object({ messages, tasksContext: taskList.default([]), timeZone: timeZoneSchema }),
  "/call-conversation": z2.object({ messages, tasks: taskList.default([]), userName: z2.string().max(200).default("there"), voice, language: z2.enum(["auto", "en", "bn"]).default("auto"), timeZone: timeZoneSchema }),
  "/parse-task": z2.object({ input: z2.string().trim().min(1).max(2e3), timeZone: timeZoneSchema }),
  "/briefing": z2.object({ tasks: taskList.default([]), callType: z2.enum(["morning_brief", "afternoon_check", "evening_recap", "custom_alarm"]).default("morning_brief"), userName: z2.string().max(200).default("there"), timeZone: timeZoneSchema }),
  "/prepare-call": z2.object({ tasks: taskList.default([]), callType: z2.enum(["morning_brief", "afternoon_check", "evening_recap", "custom_alarm"]).default("morning_brief"), userName: z2.string().max(200).default("there"), voice, timeZone: timeZoneSchema }),
  "/tts": z2.object({ text: z2.string().trim().min(1).max(5e3), voice, timeZone: timeZoneSchema })
};
function apiLimiter() {
  return rateLimit({ windowMs: 6e4, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
}
function requireAuth(verify = verifyToken) {
  return async (req, res, next) => {
    const match = req.headers.authorization?.match(/^Bearer (\S+)$/);
    if (!match) {
      res.status(401).json({ error: "Sign in to use cloud features." });
      return;
    }
    try {
      res.locals.uid = await verify(match[1]);
      next();
    } catch {
      res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
  };
}
function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", fields: parsed.error.issues.map((i) => i.path.join(".")) });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

// server/aiApi.ts
import express from "express";
import { GoogleGenAI } from "@google/genai";
function createAiRouter() {
  const router = express.Router();
  const key = process.env.GEMINI_API_KEY;
  const ai = key ? new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 18e3 } }) : null;
  const textModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.0-flash";
  const speechModel = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  async function text(contents, systemInstruction, json = false) {
    const response = await ai.models.generateContent({ model: textModel, contents, config: { systemInstruction, temperature: 0.2, ...json ? { responseMimeType: "application/json" } : {} } });
    return response.text || "";
  }
  async function speech(content, voice2 = "Puck") {
    if (!ai || voice2 === "Device-Local") return { audioBase64: null, fallbackToSpeechSynthesis: true };
    try {
      const response = await ai.models.generateContent({ model: speechModel, contents: content, config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice2 } } } } });
      const audio = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      return audio ? { audioBase64: audio.data, mimeType: audio.mimeType || "audio/L16;rate=24000" } : { audioBase64: null, fallbackToSpeechSynthesis: true };
    } catch {
      return { audioBase64: null, fallbackToSpeechSynthesis: true };
    }
  }
  for (const [path2, schema] of Object.entries(routeSchemas)) {
    router.post(path2, validate(schema), async (req, res) => {
      try {
        const body = req.body;
        const today = zonedClock(/* @__PURE__ */ new Date(), body.timeZone).date;
        const tasks = body.tasks || body.tasksContext || [];
        if (path2 === "/tts") {
          res.json({ text: body.text, ...await speech(body.text, body.voice) });
          return;
        }
        if (path2 === "/chat" || path2 === "/call-conversation") {
          if (!ai) {
            res.json({ offline: true, reply: "", action: null });
            return;
          }
          const instruction = `You are Aria, a warm, articulate, and highly capable executive personal assistant speaking live with ${body.userName || "your client"} over the phone. Today is ${today} in ${body.timeZone}.

VOICE & PERSONALITY:
- Speak naturally, warmly, and conversationally like a sharp, trusted chief of staff.
- Use natural spoken contractions (I'll, let's, we've, you're, got it) and friendly acknowledgments ("Got it!", "All done!", "Consider it done.").
- Keep responses brief (1 to 2 concise spoken sentences). Avoid robotic monologues or robotic disclaimers.
- Never say "I have noted that", "As an AI language model", or "I could not validate that instruction".
- If the user engages in small talk, greetings, or expresses stress, respond with genuine warmth and empathy first, then smoothly transition to how you can support them.
- Never use markdown formatting (no asterisks, bullet points, headers, or brackets) because your response will be read aloud over audio.
- If the user speaks in Bengali, reply in warm, natural conversational Bengali (\u09AC\u09BE\u0982\u09B2\u09BE).

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
          const raw = await text(body.messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })), instruction);
          const match = raw.match(/```action\s*([\s\S]*?)\s*```/);
          let action = null;
          let reply = raw.replace(/```action[\s\S]*?```/g, "").trim();
          if (match) {
            let parsed;
            try {
              parsed = taskActionSchema.safeParse(JSON.parse(match[1]));
            } catch {
              parsed = null;
            }
            if (parsed?.success) {
              const candidate = parsed.data;
              if (candidate.action === "CREATE_TASK" || tasks.some((t) => t.id === candidate.taskId)) action = candidate;
              else reply = "I couldn't find that specific task on your list. Could you clarify which one you'd like to update?";
            } else reply = "I caught that, but could you tell me once more what change you'd like to make?";
          }
          res.json({ reply, action, ...path2 === "/call-conversation" ? await speech(reply, body.voice) : {} });
          return;
        }
        if (path2 === "/parse-task") {
          if (!ai) {
            res.json({ offline: true });
            return;
          }
          const raw = await text(`Extract the task from ${JSON.stringify(body.input)}. Today is ${today} in ${body.timeZone}. Return JSON with title, dueDate YYYY-MM-DD, dueTime HH:mm or null, location string or null, category Personal/Work/Urgent/Health/Errands, priority low/medium/high.`, void 0, true);
          const parsed = taskFields.safeParse(JSON.parse(raw));
          if (!parsed.success) {
            res.status(422).json({ error: "Could not parse that task." });
            return;
          }
          res.json(parsed.data);
          return;
        }
        const due = tasks.filter((t) => !t.completed && t.dueDate === today);
        const name = body.userName && body.userName !== "there" ? body.userName : "";
        const greeting = name ? `Hey ${name}!` : "Hey there!";
        let script = due.length === 0 ? `${greeting} You're all clear today with no urgent tasks. Would you like to plan anything new, or are you taking it easy?` : `${greeting} You have ${due.length} ${due.length === 1 ? "task" : "tasks"} on your radar today. Next up is ${due[0].title}${due[0].dueTime ? ` at ${due[0].dueTime}` : ""}. Ready to jump in?`;
        if (ai) {
          try {
            script = (await text(`You are Aria, an executive assistant calling ${body.userName || "your client"}.
Write a warm, spoken ${body.callType} briefing (30 to 45 words max, no markdown, no robot tone).
Today is ${today} in ${body.timeZone}.
Pending tasks for today: ${JSON.stringify(due)}.
Speak naturally, enthusiastically, and conversationally like a trusted personal chief of staff.`)).trim() || script;
          } catch {
          }
        }
        res.json({ script, taskCount: due.length, ...path2 === "/prepare-call" ? await speech(script, body.voice) : {} });
      } catch (error) {
        console.error("AI request failed:", error instanceof Error ? error.message : "unknown");
        res.status(502).json({ error: "The cloud assistant is unavailable. Try the local assistant." });
      }
    });
  }
  return router;
}

// server/push.ts
import express2 from "express";
import { createHash, randomUUID } from "node:crypto";
import webpush from "web-push";
import { z as z3 } from "zod";
function validPushEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) || url.protocol === "https:" && !url.username && !url.password && !url.port && /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  } catch {
    return false;
  }
}
var endpointSchema = z3.string().max(3e3).refine(validPushEndpoint, "Unsupported push provider");
var subscriptionSchema = z3.object({ endpoint: endpointSchema, expirationTime: z3.number().nullable().optional(), keys: z3.object({ p256dh: z3.string().regex(/^[\w-]{80,150}$/), auth: z3.string().regex(/^[\w-]{20,30}$/) }) });
var scheduleSchema = z3.object({ timeZone: timeZoneSchema, alarms: z3.array(alarmSchema).max(30), taskAlertsEnabled: z3.boolean() });
var DEFAULT_VAPID_PUBLIC = "BC2O4qO4EIUEC3oVr9S5-N3wcCs0L-wBsWjUk6x-MTM8ermVAgmSEWrwbzsrhNb0NgetOosq4Q2eAnomD3s6284";
var DEFAULT_VAPID_PRIVATE = "SGIt3_h77nbvYogbpcg-V_PJojpgQ-_sklojlRr8gC4";
var DEFAULT_VAPID_SUBJECT = "mailto:mhtahim@gmail.com";
var vapidPublic = () => process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC;
var vapidPrivate = () => process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE;
var vapidSubject = () => process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;
var ready = () => process.env.ENABLE_BACKGROUND_REMINDERS !== "false" && !!vapidPublic() && !!vapidPrivate() && !!vapidSubject();
function deviceId(uid, endpoint) {
  return createHash("sha256").update(`${uid}:${endpoint}`).digest("hex");
}
function pushConfig() {
  return { available: ready(), publicKey: ready() ? vapidPublic() : null };
}
function createPushRouter() {
  const router = express2.Router();
  router.use((_req, res, next) => {
    if (!ready()) {
      res.status(503).json({ error: "Background reminders are not configured on this server." });
      return;
    }
    next();
  });
  router.post("/register", validate(scheduleSchema.extend({ subscription: subscriptionSchema })), async (req, res) => {
    try {
      const uid = res.locals.uid;
      const ref = adminDatabase().collection("push_devices").doc(deviceId(uid, req.body.subscription.endpoint));
      await adminDatabase().runTransaction(async (tx) => {
        const current = await tx.get(ref);
        tx.set(ref, { ...req.body, uid, active: true, lastChecked: current.data()?.active ? current.data().lastChecked : Date.now(), delivered: current.data()?.delivered || [], leaseUntil: current.data()?.leaseUntil || 0 }, { merge: true });
      });
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "Unable to save background alerts. Check server Firebase credentials." });
    }
  });
  router.post("/schedule", validate(scheduleSchema.extend({ endpoint: endpointSchema })), async (req, res) => {
    try {
      const ref = adminDatabase().collection("push_devices").doc(deviceId(res.locals.uid, req.body.endpoint));
      if (!(await ref.get()).exists) {
        res.status(404).json({ error: "Enable background alerts first." });
        return;
      }
      const { endpoint: _endpoint, ...schedule } = req.body;
      await ref.update(schedule);
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "Unable to update background alerts." });
    }
  });
  router.post("/unregister", validate(z3.object({ endpoint: endpointSchema, timeZone: timeZoneSchema })), async (req, res) => {
    try {
      await adminDatabase().collection("push_devices").doc(deviceId(res.locals.uid, req.body.endpoint)).set({ active: false }, { merge: true });
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "Unable to disable background alerts on the server." });
    }
  });
  return router;
}

// server/app.ts
function createApp(verify) {
  const app2 = express3();
  app2.disable("x-powered-by");
  app2.use(express3.json({ limit: "256kb" }));
  app2.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app2.get("/api/health", (_req, res) => res.json({ ok: true }));
  app2.get("/api/push/config", (_req, res) => res.json(pushConfig()));
  app2.use("/api", apiLimiter(), requireAuth(verify));
  app2.use("/api/push", createPushRouter());
  app2.use("/api", createAiRouter());
  app2.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
  app2.use((error, _req, res, next) => {
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large." });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    next(error);
  });
  return app2;
}

// server/apiHandler.ts
var app = createApp();
function handler(req, res) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  return app(req, res);
}
export {
  handler as default
};
