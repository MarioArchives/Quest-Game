// Every game action a client can call, by name. functions/src/index.ts turns each into an onCall function;
// the mock backend runs them directly. Names match src/api.ts.
import type { Ctx, Db } from './context.js';
import { endGame } from './endGame.js';
import { addEvidence } from './evidence.js';
import { fireGlobalQuest } from './globals.js';
import { setCharacter } from './characters.js';
import { answerCheckin, managePeriodic } from './checkins.js';
import { answerPoliceCall, tipOffPolice } from './police.js';
import { guessQuest } from './guesses.js';
import { requestJoin, reviewJoinRequest } from './join.js';
import { setPlayerLeft } from './left.js';
import { adjustPoints } from './points.js';
import { removePushToken, savePushToken, type PushPlan } from './push.js';
import { rerollQuest } from './quests.js';
import { grantRerolls } from './rerolls.js';
import { resetGame } from './reset.js';
import { resolveReward } from './rewards.js';
import { setGameStatus } from './status.js';
import { reviewSubmission } from './submissions.js';
import { advanceGlobalQuest, castVote, checkEntry, enterSideQuest } from './votes.js';

/** What actions and triggers may need besides the store, provided by whichever backend runs them. */
export interface Services {
  /** Sends a push plan (the mock and the emulators only log). Never throws. */
  sendPush(plan: PushPlan): Promise<void>;
  /** Deletes every stored file under these path prefixes, best effort. */
  wipeFiles(prefixes: string[]): Promise<void>;
}

export type CallableHandler = (db: Db, ctx: Ctx, data: unknown, services: Services) => Promise<unknown>;

export interface CallableDef {
  run: CallableHandler;
  /** Longer than the default (60 s) for the heavy ones. */
  timeoutSeconds?: number;
}

/** A plain action: the handler's own data type is what the client is trusted to send (each validates it). */
const plain =
  <T>(fn: (db: Db, ctx: Ctx, data: T) => Promise<unknown>): CallableHandler =>
  (db, ctx, data) =>
    fn(db, ctx, data as T);

/** An action that hands back a push plan: it is sent once the change is saved, and the caller gets the rest. */
const withPush =
  <T>(fn: (db: Db, ctx: Ctx, data: T) => Promise<{ push?: PushPlan | null }>): CallableHandler =>
  async (db, ctx, data, services) => {
    const { push, ...result } = await fn(db, ctx, data as T);
    if (push) await services.sendPush(push);
    return result;
  };

export const CALLABLES: Readonly<Record<string, CallableDef>> = {
  requestJoin: { run: plain(requestJoin) },
  reviewJoinRequest: { run: plain(reviewJoinRequest) },
  rerollQuest: { run: plain(rerollQuest) },
  guessQuest: { run: plain(guessQuest) },
  reviewSubmission: { run: plain(reviewSubmission) },
  fireGlobalQuest: { run: plain(fireGlobalQuest) },
  addEvidence: { run: plain(addEvidence) },
  enterSideQuest: { run: plain(enterSideQuest) },
  castVote: { run: plain(castVote) },
  advanceGlobalQuest: { run: plain(advanceGlobalQuest) },
  // A rejected entrant hears about it once the check is saved.
  checkEntry: { run: withPush(checkEntry) },
  savePushToken: { run: plain(savePushToken) },
  removePushToken: { run: plain(removePushToken) },
  // Claimants waiting on the player as witness hear about it once the change is saved.
  setPlayerLeft: { run: withPush(setPlayerLeft) },
  adjustPoints: { run: plain(adjustPoints) },
  grantRerolls: { run: plain(grantRerolls) },
  setGameStatus: { run: plain(setGameStatus) },
  resolveReward: { run: plain(resolveReward) },
  setCharacter: { run: plain(setCharacter) },
  answerCheckin: { run: plain(answerCheckin) },
  managePeriodic: { run: plain(managePeriodic) },
  answerPoliceCall: { run: plain(answerPoliceCall) },
  tipOffPolice: { run: plain(tipOffPolice) },
  endGame: { run: (db, ctx) => endGame(db, ctx), timeoutSeconds: 120 },
  resetGame: {
    run: async (db, ctx, data, services) => {
      await resetGame(db, ctx, data as { confirm?: unknown });
      // Photos and avatars live in file storage, outside the document wipe.
      await services.wipeFiles(['submissions/', 'avatars/']);
    },
    timeoutSeconds: 300,
  },
};
