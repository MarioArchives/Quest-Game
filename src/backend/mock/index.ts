// The mock backend: the whole game in the browser on an in-memory store, with the real game rules.
import type { GamePack } from '../../../functions/src/shared/packs/types.ts';
import type { WatchableStore } from '../../../functions/src/shared/store/types.ts';
import { CALLABLES, type Services } from '../../../functions/src/game/callables.ts';
import type { Ctx } from '../../../functions/src/game/context.ts';
import { runPeriodics } from '../../../functions/src/game/checkins.ts';
import { periodicSeeds } from '../../../functions/src/shared/periodics.ts';
import { runTick } from '../../../functions/src/game/globals.ts';
import { buildDemo, type DemoGame } from '../../../functions/src/shared/demo/index.ts';
import { defaultSettingsFor } from '../../../functions/src/shared/packs/index.ts';
import { GameError } from '../../../functions/src/shared/store/errors.ts';
import { memoryStore } from '../../../functions/src/shared/store/memory.ts';
import { Stamp } from '../../../functions/src/shared/store/stamp.ts';
import { BackendError } from '../errors';
import type { Backend } from '../types';
import { createMockAuth, MOCK_GM_UID } from './auth';
import { createMockData } from './data';
import { createMockFiles } from './files';
import { attachTriggers } from './triggers';

export interface MockOptions {
  pack: GamePack;
  /** The clock (default: the real one). */
  now?: () => Date;
  /** Randomness (default Math.random). */
  rng?: () => number;
  /** Fill the store with the demo game (default true). */
  demo?: boolean;
  /** Run the side-quest tick every this many ms; null for never (tests call tick()). Default 20 000. */
  tickMs?: number | null;
}

export interface MockBackend extends Backend {
  kind: 'mock';
  /** The in-memory database (for tests and the dev tools). */
  store: WatchableStore;
  /** Runs the side-quest tick now. */
  tick(): Promise<void>;
  /** Waits until every trigger started by earlier writes has finished. */
  settle(): Promise<void>;
  /** Stops the tick timer and listeners. */
  dispose(): void;
}

const HOUR = 3_600_000;

/**
 * Fills the store: game state and settings, the quest catalogue, the GM and (optionally) the demo game.
 * The memory store applies a write the moment it is called, so everything is in place when this returns.
 */
function seed(store: WatchableStore, pack: GamePack, nowMs: number, demo: boolean): DemoGame {
  const put = (path: string, data: Record<string, unknown>) => {
    store.doc(path).set(data).catch((err: unknown) => console.error(`Mock seed failed at ${path}:`, err));
  };
  const settings = defaultSettingsFor(pack);
  put('game/state', {
    status: 'active',
    startedAt: Stamp.fromMillis(nowMs - 2 * HOUR),
    endedAt: null,
    nextGlobalQuestAt: Stamp.fromMillis(nowMs + 30 * 60_000),
    announcement: null,
    pack: pack.id,
  });
  put('game/settings', { ...settings });
  for (const q of pack.catalogue.personal) {
    put(`questTemplates/${q.id}`, {
      title: q.title,
      description: q.description,
      scope: 'personal',
      windowMin: null,
      active: true,
      ...(q.points != null ? { points: q.points } : {}),
    });
  }
  for (const q of pack.catalogue.global) {
    put(`questTemplates/${q.id}`, { title: q.title, description: q.description, scope: 'global', windowMin: q.windowMin ?? null, active: true });
  }
  for (const p of periodicSeeds(pack)) put(`periodics/${p.id}`, { ...p.data, createdAt: Stamp.fromMillis(nowMs - 2 * HOUR) });
  put(`admins/${MOCK_GM_UID}`, { email: 'gm@mock.local' });
  if (!demo) return { docs: [], files: [], players: [] };
  const game = buildDemo({ pack, settings, nowMs });
  for (const d of game.docs) put(d.path, d.data);
  return game;
}

export function createMockBackend({ pack, now = () => new Date(), rng = Math.random, demo = true, tickMs = 20_000 }: MockOptions): MockBackend {
  const store = memoryStore();
  const files = createMockFiles();
  const game = seed(store, pack, now().getTime(), demo);
  for (const f of game.files) files.putDemo(f);

  const photoOf = (uid: string) => {
    const doc = game.docs.find((d) => d.path === `players/${uid}`);
    return typeof doc?.data.photoURL === 'string' ? doc.data.photoURL : null;
  };
  const auth = createMockAuth(game.players.map((p) => ({ ...p, photoURL: photoOf(p.uid) })));
  const data = createMockData(store, now);

  const services: Services = {
    async sendPush() {
      console.debug('Mock backend: push is not supported, so nothing was sent.');
    },
    async wipeFiles(prefixes) {
      files.wipe(prefixes);
    },
  };

  // Attached after seeding, so filling the store fires nothing.
  const triggers = attachTriggers(store, () => ({ now: now(), rng, pack, services }));

  async function call<I, O>(name: string, input: I): Promise<O> {
    const def = Object.hasOwn(CALLABLES, name) ? CALLABLES[name] : undefined;
    if (!def) throw new BackendError('call', 'not-found', 'No such action.');
    const user = auth.api.current();
    const ctx: Ctx = { uid: user?.uid ?? null, email: user?.email ?? null, now: now(), rng, pack };
    try {
      return (await def.run(store, ctx, input, services)) as O;
    } catch (err) {
      if (err instanceof GameError) throw new BackendError('call', err.code, err.message, err.details);
      console.error(`Mock action ${name} failed:`, err);
      throw new BackendError('call', 'internal', 'Something went wrong.');
    }
  }

  async function tick() {
    await runTick(store, now(), rng, pack);
    await runPeriodics(store, now(), rng, pack);
    await triggers.settle();
  }

  const timer =
    tickMs === null
      ? null
      : setInterval(() => {
          tick().catch((err: unknown) => console.error('Mock tick failed:', err));
        }, tickMs);

  return {
    kind: 'mock',
    auth: auth.api,
    data,
    call,
    files,
    push: null,
    store,
    tick,
    settle: triggers.settle,
    dispose() {
      if (timer) clearInterval(timer);
      triggers.dispose();
      auth.dispose();
    },
  };
}
