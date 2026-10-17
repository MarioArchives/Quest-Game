// Every reaction to a document write, by path pattern. functions/src/index.ts turns each into a Firestore trigger;
// the mock backend runs them from its store's onWrite.
import type { GamePack } from '../shared/packs/types.js';
import type { Services } from './callables.js';
import type { Db } from './context.js';
import { handleAdminCreated, handleJoinRequestCreated } from './join.js';
import { planForFeed } from './push.js';
import { handlePlayerWritten } from './standing.js';
import { recountReactions } from './reactions.js';
import { handleSubmissionCreated } from './submissions.js';

export interface TriggerEnv {
  now: Date;
  rng: () => number;
  pack: GamePack;
  services: Services;
}

export interface TriggerDef {
  /** The exported function name in functions/src/index.ts. */
  name: string;
  /** Alternating collection names and {params}: "submissions/{submissionId}", "feed/{feedId}/reactions/{uid}". */
  pattern: string;
  /** 'create': only new documents; 'write': any create, update or delete. */
  on: 'create' | 'write';
  run(db: Db, params: Record<string, string>, env: TriggerEnv): Promise<void>;
}

export const TRIGGERS: readonly TriggerDef[] = [
  {
    name: 'onSubmissionCreated',
    pattern: 'submissions/{submissionId}',
    on: 'create',
    async run(db, params, env) {
      const plan = await handleSubmissionCreated(db, params.submissionId, env.now, env.rng, env.pack);
      if (plan) await env.services.sendPush(plan);
    },
  },
  // GMs never need join approval: whoever is made a GM while their request waits becomes a player.
  {
    name: 'onAdminCreated',
    pattern: 'admins/{uid}',
    on: 'create',
    async run(db, params, env) {
      await handleAdminCreated(db, params.uid, env.now, env.rng);
    },
  },
  // Every feed post (almost every game event) may buzz the players it is about; see ./push.ts.
  {
    name: 'onFeedCreated',
    pattern: 'feed/{feedId}',
    on: 'create',
    async run(db, params, env) {
      const plan = await planForFeed(db, params.feedId, env.pack);
      if (plan) await env.services.sendPush(plan);
    },
  },
  // A new join request tells the GMs.
  {
    name: 'onJoinRequestCreated',
    pattern: 'joinRequests/{uid}',
    on: 'create',
    async run(db, params, env) {
      const plan = await handleJoinRequestCreated(db, params.uid);
      if (plan) await env.services.sendPush(plan);
    },
  },
  // Keeps each player's standing (and, with police, their watch check-in) in step with their points. Loop-safe: it
  // writes only when the standing changes.
  {
    name: 'onPlayerWritten',
    pattern: 'players/{uid}',
    on: 'write',
    async run(db, params, env) {
      await handlePlayerWritten(db, params.uid, env.now, env.rng, env.pack);
    },
  },
  // Reactions are set, changed and removed by players; keep the post's reactionCount in step.
  {
    name: 'onFeedReactionWritten',
    pattern: 'feed/{feedId}/reactions/{uid}',
    on: 'write',
    async run(db, params) {
      await recountReactions(db, params.feedId);
    },
  },
];

/** The params when `path` matches `pattern` exactly (same depth, same collection names), else null. */
export function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/');
  const have = path.split('/');
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const name = /^\{(.+)\}$/.exec(want[i])?.[1];
    if (name) params[name] = have[i];
    else if (want[i] !== have[i]) return null;
  }
  return params;
}
