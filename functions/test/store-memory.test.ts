// The store conformance cases against the in-memory store (no emulator needed).
import { beforeEach } from 'vitest';
import { memoryStore } from '../src/shared/store/memory.js';
import type { Store } from '../src/shared/store/types.js';
import { storeConformance } from './store/conformance.js';

let current: Store;
beforeEach(() => {
  current = memoryStore();
});

storeConformance(() => current);
