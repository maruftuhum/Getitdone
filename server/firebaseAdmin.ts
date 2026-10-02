import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

function adminApp() {
  return getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || config.projectId });
}
export async function verifyToken(token: string) { return (await getAuth(adminApp()).verifyIdToken(token, true)).uid; }
export function adminDatabase() { return getFirestore(adminApp(), config.firestoreDatabaseId || '(default)'); }
