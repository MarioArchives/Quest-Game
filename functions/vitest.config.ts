import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'functions',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Emulator transactions can hold locks for a while under contention.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
