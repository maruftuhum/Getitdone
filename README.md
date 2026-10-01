# Get It Done

A React 19 / TypeScript task manager with a calendar, chat assistant, in-app
voice briefings, optional Firebase sync, and a production PWA. Express serves the
app and authenticated Gemini APIs. Local task parsing supports English and Bangla.

## Run locally

Use Node 22.12 or newer. Run `npm ci`, copy `.env.example` to `.env`, then run
`npm run dev`. Open http://localhost:3000. A Gemini key is optional: guest and
offline task management use the local assistant. Cloud AI requires Google sign-in.
Configure the Firebase project in `firebase-applet-config.json`, enable Google
authentication and authorize your hosting domain in Firebase Authentication.
Deploy `firestore.rules` to that project's configured database.

`npm run lint` checks TypeScript, `npm test` runs regression tests, and
`npm run build` creates `dist/`. For production, set `NODE_ENV=production` in
your hosting environment and run `npm start`. Production starts with `tsx`, so
the server requires development dependencies to be installed. Use `npm ci`,
not `npm ci --omit=dev`. The build does not include a separate server bundle.

## Data and accounts

Tasks, settings, alerts, and messages are cached separately for each account.
Signing out returns to the guest workspace. Guest tasks are never uploaded
automatically; use **Copy into this account** to copy each guest task once into a signed-in
account. The original guest tasks remain available. Firestore streams replace
cloud state, including empty lists, while a durable local pending-write queue
preserves unsynced edits and deletions. Failed writes retry on reconnect and
every 30 seconds. Old unscoped storage is retained; only tasks owned by
`local-user` are treated as guest tasks. No arbitrary account's data is imported.

Chat, floating chat, and voice calls share one action validator and executor.
Changes to existing tasks require an exact task ID; ambiguous local commands
ask for the full task title. Queries do not create tasks. The hybrid setting
enables cloud AI with a local fallback; switching it off keeps inference and
speech local. Speech recognition depends on browser support and may use a
browser-provided network service. Downloading a WebLLM model requires network
access and WebGPU; the built-in task parser requires neither.

## Reminders and background alerts

In-app reminders use the device's IANA timezone, persist delivered event IDs,
and catch up to 24 hours of missed reminders when the page resumes. Briefings
are simulated calls inside the app. Background alerts are notifications that
open the app; they do not place telephone calls or start background microphone
recording. Delivery depends on browser/OS permissions and network availability.

To enable closed-app notifications:

1. Deploy the built PWA over HTTPS (localhost works for development). Keep the
   Express process running. A hosting platform that scales idle instances to zero
   must keep at least one instance running for the polling worker to operate.
2. Supply Firebase Admin credentials using the deployment service account or
   `GOOGLE_APPLICATION_CREDENTIALS`. Grant access to the configured Firestore
   database. Never put a service-account file in this repository.
3. Generate VAPID keys with `npm run push:keys`. Set `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `ENABLE_BACKGROUND_REMINDERS=true`
   in server secrets. Keep the keys stable across deployments.
4. Sign in, install or load the production PWA, and choose **Enable background
   alerts** in Settings. Changes to alarm times and task alerts update the device's
   server schedule. Task reminders read the current Firestore task list.

The worker polls every 30 seconds. Device schedules and delivered event IDs are
stored in server-only `push_devices` documents, with Firestore leases to prevent
multiple instances from processing a device together. Expired subscriptions are
disabled. Sign-out unsubscribes the browser so account notifications stop. Each
device needs its own opt-in. Background credentials/keys are not included in
the project; an unconfigured server reports this clearly in Settings. The page
and service worker share an IndexedDB delivery ledger so resuming the app does
not repeat a notification already shown in the background.

## API protection

Cloud routes verify Firebase ID tokens, limit request bodies to 256 KiB, validate
input/output schemas, and apply a 30-request/minute/IP limit. API responses are
not cached. Model names are server environment settings. Only recognized public
push providers are accepted. The in-memory API limiter applies per process; a
multi-instance deployment should also enforce limits at its gateway.

## Project map

- `src/App.tsx`: composes views and validated task handlers.
- `src/hooks/useTasks.ts`: authentication, account caches, pending writes, cloud sync.
- `src/hooks/useReminders.ts`: in-app scheduler and missed-reminder recovery.
- `src/hooks/useVoiceCall.ts`: call lifecycle and cleanup.
- `src/services/assistantService.ts`: shared cloud/local assistant routing.
- `src/shared/`: task schemas, action execution, dates, reminder selection, PCM audio.
- `server/`: authenticated AI endpoints, validation, and Web Push scheduler.
- `public/push-sw.js`: background notification and click handlers, loaded by Workbox.
- `tests/`: action targeting, date/parser, account sync, reminder, and API regressions.

Live Google sign-in, Gemini speech, WebGPU inference, and actual Web Push delivery
require their respective credentials, browser support, and device permissions.
