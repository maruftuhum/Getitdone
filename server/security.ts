import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { verifyToken } from './firebaseAdmin';
import { taskSchema, timeSchema } from '../src/shared/taskActions';
import { isTimeZone } from '../src/shared/dates';

export const timeZoneSchema = z.string().max(100).refine(isTimeZone);
export const alarmSchema = z.object({ id: z.string().regex(/^[\w-]{1,128}$/), label: z.string().trim().min(1).max(200), time: timeSchema, enabled: z.boolean(), callType: z.enum(['morning_brief', 'afternoon_check', 'evening_recap', 'custom_alarm']) });
const messages = z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) })).min(1).max(30);
const taskList = z.array(taskSchema).max(500);
const voice = z.enum(['Puck', 'Aoede', 'Fenrir', 'Kore', 'Device-Local']).default('Puck');
export const routeSchemas: Record<string, z.ZodType> = {
  '/chat': z.object({ messages, tasksContext: taskList.default([]), timeZone: timeZoneSchema }),
  '/call-conversation': z.object({ messages, tasks: taskList.default([]), userName: z.string().max(200).default('there'), voice, language: z.enum(['auto', 'en', 'bn']).default('auto'), timeZone: timeZoneSchema }),
  '/parse-task': z.object({ input: z.string().trim().min(1).max(2000), timeZone: timeZoneSchema }),
  '/briefing': z.object({ tasks: taskList.default([]), callType: z.enum(['morning_brief', 'afternoon_check', 'evening_recap', 'custom_alarm']).default('morning_brief'), userName: z.string().max(200).default('there'), timeZone: timeZoneSchema }),
  '/prepare-call': z.object({ tasks: taskList.default([]), callType: z.enum(['morning_brief', 'afternoon_check', 'evening_recap', 'custom_alarm']).default('morning_brief'), userName: z.string().max(200).default('there'), voice, timeZone: timeZoneSchema }),
  '/tts': z.object({ text: z.string().trim().min(1).max(5000), voice, timeZone: timeZoneSchema }),
};
export function apiLimiter() { return rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }); }
export function requireAuth(verify = verifyToken) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const match = req.headers.authorization?.match(/^Bearer (\S+)$/);
    if (!match) { res.status(401).json({ error: 'Sign in to use cloud features.' }); return; }
    try { res.locals.uid = await verify(match[1]); next(); }
    catch { res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
  };
}
export function validate(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid request', fields: parsed.error.issues.map(i => i.path.join('.')) }); return; }
    req.body = parsed.data;
    next();
  };
}
