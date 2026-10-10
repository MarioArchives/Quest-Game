/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** The public Web Push key (Cloud Messaging › Web Push certificates). Not secret. */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  /** "true" to talk to the local Firebase Emulator Suite from a production build. */
  readonly VITE_USE_EMULATORS?: string;
  /** Emulator host and ports; default 127.0.0.1 and the firebase.json ports. */
  readonly VITE_EMULATOR_HOST?: string;
  readonly VITE_AUTH_EMULATOR_PORT?: string;
  readonly VITE_FIRESTORE_EMULATOR_PORT?: string;
  readonly VITE_STORAGE_EMULATOR_PORT?: string;
  readonly VITE_FUNCTIONS_EMULATOR_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
