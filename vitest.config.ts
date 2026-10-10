import { defineConfig } from 'vitest/config';

// One `vitest run` (inside `firebase emulators:exec`) covers every suite:
// - unit:      pure client helpers + the schedule-import transform (no emulator needed)
// - rules:     Firestore + Storage security rules against the emulators
// - functions: server game logic against the Firestore emulator (functions/vitest.config.ts)
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      'functions/vitest.config.ts',
    ],
  },
});
