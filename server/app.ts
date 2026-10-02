import express, { type Request, type Response, type NextFunction } from 'express';
import { apiLimiter, requireAuth } from './security.ts';
import { createAiRouter } from './aiApi.ts';
import { createPushRouter, pushConfig } from './push.ts';

export function createApp(verify?: (token: string) => Promise<string>) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/push/config', (_req, res) => res.json(pushConfig()));
  app.use('/api', apiLimiter(), requireAuth(verify));
  app.use('/api/push', createPushRouter());
  app.use('/api', createAiRouter());
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Request is too large.' }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid JSON.' }); return; }
    next(error);
  });
  return app;
}
