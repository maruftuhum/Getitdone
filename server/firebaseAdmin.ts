import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import config from '../firebase-applet-config.json';

function adminApp() {
  return getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || config.projectId });
}
export async function verifyToken(token: string) { return (await getAuth(adminApp()).verifyIdToken(token, true)).uid; }
export function adminDatabase() { return getFirestore(adminApp(), config.firestoreDatabaseId || '(default)'); }
