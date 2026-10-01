import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc, 
  getDocFromServer,
  collection, 
  query, 
  where, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  Unsubscribe 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Task, CallSchedule } from '../types';

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with robust offline persistence cache & reliable long polling
let firestoreDb: any;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalForceLongPolling: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch (e) {
  // If already initialized or during hot reloading
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Connection health test per Firebase integration standard
export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase configuration notice: the client is operating in offline mode.');
    }
  }
}
testConnection().catch(() => {});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Auth Helpers
export async function signInWithGoogle(): Promise<FirebaseUser | null> {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  } catch (error: any) {
    // If the user cancelled or closed the sign-in popup dialog, handle gracefully
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('popup-closed-by-user') ||
      error?.message?.includes('cancelled-popup-request')
    ) {
      console.info('Google sign-in popup closed by user.');
      return null;
    }
    console.error('Sign-in error:', error);
    return null;
  }
}

export async function logOut(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub && !(await sub.unsubscribe())) throw new Error('Unable to disable background alerts. Please retry signing out.');
  }
  localStorage.removeItem('getitdone_push_owner');
  await signOut(auth);
}

// Subscribe to User Tasks in Real-Time with Offline Resilience
export function subscribeToUserTasks(
  userId: string,
  onTasksUpdated: (tasks: Task[]) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const path = 'tasks';
  const q = query(collection(db, path), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks: Task[] = [];
      snapshot.forEach((docSnap) => {
        tasks.push(docSnap.data() as Task);
      });
      // Sort tasks by due date and time
      tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const dateA = a.dueDate + (a.dueTime ? `T${a.dueTime}` : 'T23:59');
        const dateB = b.dueDate + (b.dueTime ? `T${b.dueTime}` : 'T23:59');
        return dateA.localeCompare(dateB);
      });
      onTasksUpdated(tasks);
    },
    (error: any) => {
      if (onError) onError(error);
      // Only throw security/permission errors to diagnose rules issues
      if (error?.code === 'permission-denied') {
        console.error('Task subscription permission denied.');
      } else {
        // Log gracefully for connection unavailable / offline transition
        console.warn('Firestore real-time connection status:', error?.message || 'offline mode');
      }
    }
  );
}

// Create Task
export async function saveTaskToFirestore(task: Task): Promise<void> {
  const path = `tasks/${task.id}`;
  try {
    await setDoc(doc(db, 'tasks', task.id), task);
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      handleFirestoreError(error, OperationType.CREATE, path);
    } else {
      throw error;
    }
  }
}

// Update Task
export async function updateTaskInFirestore(taskId: string, updates: Partial<Task>): Promise<void> {
  const path = `tasks/${taskId}`;
  try {
    await setDoc(
      doc(db, 'tasks', taskId),
      {
        ...updates,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } else {
      throw error;
    }
  }
}

// Delete Task
export async function deleteTaskFromFirestore(taskId: string): Promise<void> {
  const path = `tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'tasks', taskId));
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      handleFirestoreError(error, OperationType.DELETE, path);
    } else {
      throw error;
    }
  }
}

// Call Schedules
export async function saveCallSchedule(schedule: CallSchedule): Promise<void> {
  const path = `call_schedules/${schedule.id}`;
  try {
    await setDoc(doc(db, 'call_schedules', schedule.id), schedule);
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      handleFirestoreError(error, OperationType.WRITE, path);
    } else {
      console.warn('Schedule update queued offline:', error?.message);
    }
  }
}
