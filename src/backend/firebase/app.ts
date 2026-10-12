import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

/** Emulator fallbacks so a fresh checkout runs with no .env at all. */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'demo-quest-game.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'demo-quest-game',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'demo-quest-game.appspot.com',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? 'demo-app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

export const useEmulators = import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true';
export const FUNCTIONS_REGION = 'europe-west2';

// Vite HMR re-evaluates this module; the Firebase SDK keeps its own singletons, so remember
// what we already connected on globalThis to avoid "already started" errors.
const flags = globalThis as typeof globalThis & { __fqEmulatorsConnected?: boolean };

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);

function createFirestore(): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: useEmulators
        ? memoryLocalCache()
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialised (HMR re-evaluation).
    return getFirestore(app);
  }
}

export const auth: Auth = getAuth(app);
export const db: Firestore = createFirestore();
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app, FUNCTIONS_REGION);

/** A port from the environment (so a second stack can run beside the default one), else the default. */
function port(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

if (useEmulators && !flags.__fqEmulatorsConnected) {
  flags.__fqEmulatorsConnected = true;
  const host = import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:${port(import.meta.env.VITE_AUTH_EMULATOR_PORT, 9099)}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, port(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT, 8080));
  connectStorageEmulator(storage, host, port(import.meta.env.VITE_STORAGE_EMULATOR_PORT, 9199));
  connectFunctionsEmulator(functions, host, port(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT, 5001));
}

export { app };
