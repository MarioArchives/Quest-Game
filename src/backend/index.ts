// Picks the backend this build talks to (VITE_BACKEND=mock for the in-memory demo; Firebase otherwise).
// The branches are static, so Vite drops the one that isn't used: a mock build carries no Firebase SDK.
import { pack } from '../pack';
import type { Backend } from './types';

let current: Backend | null = null;

export async function initBackend(): Promise<Backend> {
  if (current) return current;
  if (import.meta.env.VITE_BACKEND === 'mock') {
    current = (await import('./mock')).createMockBackend({ pack });
  } else {
    current = (await import('./firebase')).createFirebaseBackend();
  }
  return current;
}

/** The backend initBackend() set up. */
export function backend(): Backend {
  if (!current) throw new Error('The backend is not ready: await initBackend() first.');
  return current;
}
