// The store conformance cases against Firestore (the emulator) through firestoreStore.
import { beforeAll, beforeEach } from 'vitest';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { afterAll } from 'vitest';
import { firestoreStore } from '../src/firebase/store.js';
import type { Store } from '../src/shared/store/types.js';
import { storeConformance } from './store/conformance.js';

const PROJECT = 'demo-fq-store';
let app: App;
let current: Store;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via `npm test`.');
  app = initializeApp({ projectId: PROJECT }, PROJECT);
  current = firestoreStore(getFirestore(app));
});

beforeEach(async () => {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear emulator: ${res.status}`);
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

storeConformance(() => current);
