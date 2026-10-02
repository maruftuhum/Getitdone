import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
let server: Server;
let url: string;
before(async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.ENABLE_BACKGROUND_REMINDERS = 'false';
  const app = createApp(async token => { if (token !== 'test-user-token') throw new Error('Invalid'); return 'alice'; });
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address();
  url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
after(() => new Promise<void>(resolve => server.close(() => resolve())));
function post(path: string, body: unknown, token = 'test-user-token') {
  return fetch(`${url}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
test('API rejects missing and invalid Firebase tokens', async () => {
  assert.equal((await post('/chat', {}, '')).status, 401);
  assert.equal((await post('/chat', {}, 'wrong')).status, 401);
});
test('valid session without Gemini configuration requests the local fallback', async () => {
  const res = await post('/chat', { messages: [{ role: 'user', content: 'What is due today?' }], tasksContext: [], timeZone: 'Asia/Dhaka' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).offline, true);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});
test('invalid timezone, messages and task context are rejected before model requests', async () => {
  for (const body of [{ timeZone: 'Mars/Base', messages: [] }, { timeZone: 'Asia/Dhaka', messages: [{ role: 'system', content: 'bad' }] }, { timeZone: 'Asia/Dhaka', messages: [{ role: 'user', content: 'hi' }], tasksContext: [{ title: 'invalid' }] }]) assert.equal((await post('/chat', body)).status, 400);
});
test('request size limits and malformed JSON produce JSON errors', async () => {
  assert.equal((await post('/chat', { text: 'x'.repeat(300000) })).status, 413);
  const res = await fetch(`${url}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
  assert.equal(res.status, 400);
});
test('briefing fallback uses the request timezone and device TTS returns local speech', async () => {
  const briefing = await post('/prepare-call', { tasks: [], timeZone: 'Asia/Dhaka', voice: 'Device-Local', userName: 'Alice' });
  assert.equal(briefing.status, 200);
  assert.equal((await briefing.json()).taskCount, 0);
  const tts = await post('/tts', { text: 'Hello', voice: 'Device-Local', timeZone: 'Asia/Dhaka' });
  assert.equal((await tts.json()).fallbackToSpeechSynthesis, true);
});
test('background configuration is public; unavailable backend reports a useful status', async () => {
  assert.equal((await (await fetch(`${url}/api/push/config`)).json()).available, false);
  assert.equal((await post('/push/register', {})).status, 503);
});
test('rate limit prevents an authenticated client from exhausting model quota', async () => {
  let limited = false;
  for (let i = 0; i < 35; i++) {
    const res = await post('/chat', { messages: [{ role: 'user', content: 'Hello' }], timeZone: 'Asia/Dhaka' });
    if (res.status === 429) { limited = true; break; }
  }
  assert.equal(limited, true);
});
