// Every reaction to a document write, by path pattern. functions/src/index.ts turns each into a Firestore trigger;
// the mock backend runs them from its store's onWrite.
import type { GamePack } from '../shared/packs/types.js';
import type { Services } from './callables.js';
import type { Db } from './context.js';
import { handleAdminCreated, handleJoinRequestCreated } from './join.js';
import { dialPoliceCall } from './policePhone.js';
import { planForFeed } from './push.js';
import { handlePlayerWritten } from './standing.js';
import { handleReactionWritten } from './reactions.js';
import { handleSubmissionCreated, handleSubmissionWritten } from './submissions.js';

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
  /** Uses the phone line, so the deployed function needs the Twilio secrets. */
  phone?: boolean;
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
  // The claimant asks someone else to witness a pending claim: the new witness hears about it.
  {
    name: 'onSubmissionWritten',
    pattern: 'submissions/{submissionId}',
    on: 'write',
    async run(db, params, env) {
      const plan = await handleSubmissionWritten(db, params.submissionId, env.now, env.rng, env.pack);
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
      const plan = await handleJoinRequestCreated(db, params.uid, env.pack);
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
  // A police check-in opened on the phone channel rings the player (packs with police, phone calls on). Dialled once.
  {
    name: 'onPoliceCallCreated',
    pattern: 'policeCalls/{callId}',
    on: 'create',
    phone: true,
    async run(db, params, env) {
      await dialPoliceCall(db, params.callId, env.now, env.pack, env.services.phone());
    },
  },
  // Reactions are set, changed and removed by players; keep the post's reactionCount (and, in a votes pack, its vote counts and game/top) in step.
  {
    name: 'onFeedReactionWritten',
    pattern: 'feed/{feedId}/reactions/{uid}',
    on: 'write',
    async run(db, params, env) {
      await handleReactionWritten(db, params.feedId, env.now, env.pack);
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
