import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './server/app';
import { startPushWorker } from './server/push';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();
const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(port, '0.0.0.0', () => console.log('Get It Done running on port', port));
const stopWorker = startPushWorker();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
  stopWorker(); server.close(() => process.exit(0));
});
