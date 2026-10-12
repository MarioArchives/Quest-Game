// Runs the game's Firestore-style triggers (functions/src/game/triggers.ts) off the in-memory store's writes.
import { matchPattern, TRIGGERS, type TriggerEnv } from '../../../functions/src/game/triggers.ts';
import type { WatchableStore } from '../../../functions/src/shared/store/types.ts';

export interface TriggerRunner {
  /** Waits until nothing is running, including triggers fired by other triggers' writes. */
  settle(): Promise<void>;
  /** Stops listening for writes. */
  dispose(): void;
}

/** Starts listening; `env` is read afresh for each run so the clock stays current. */
export function attachTriggers(store: WatchableStore, env: () => TriggerEnv): TriggerRunner {
  const pending = new Set<Promise<void>>();

  const unsubscribe = store.onWrite((change) => {
    for (const trigger of TRIGGERS) {
      const params = matchPattern(trigger.pattern, change.path);
      if (!params) continue;
      if (trigger.on === 'create' && !(change.before === undefined && change.after !== undefined)) continue;
      const run: Promise<void> = Promise.resolve()
        .then(() => trigger.run(store, params, env()))
        .catch((err: unknown) => console.error(`Trigger ${trigger.name} failed:`, err))
        .finally(() => pending.delete(run));
      pending.add(run);
    }
  });

  return {
    async settle() {
      while (pending.size) await Promise.all([...pending]);
    },
    dispose: unsubscribe,
  };
}
