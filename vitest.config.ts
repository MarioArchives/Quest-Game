import { defineConfig } from 'vitest/config';

// One `vitest run` (inside `firebase emulators:exec`) covers every suite:
// - unit:      pure client helpers, the seed plan, pack scripts and the engine guard (no emulator needed)
// - rules:     Firestore + Storage security rules against the emulators
// - functions: server game logic against the Firestore emulator (functions/vitest.config.ts)
// - functions-memory: the same game-logic tests against the in-memory store (STORE=memory), no emulator needed,
//   which keeps the mock backend behaving exactly like the real game
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/engine/**/*.test.ts'],
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
      {
        test: {
          name: 'functions-memory',
          root: 'functions',
          include: ['test/**/*.test.ts'],
          exclude: ['test/store-firestore.test.ts'],
          environment: 'node',
          env: { STORE: 'memory' },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
