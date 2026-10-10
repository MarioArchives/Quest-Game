// Cloud Functions entry point: thin wrappers that build a Ctx and delegate to src/game/*.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest, type CallableOptions } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { Ctx } from './game/context.js';
import { endGame as doEndGame } from './game/endGame.js';
import { addEvidence as doAddEvidence } from './game/evidence.js';
import { fireGlobalQuest as doFireGlobalQuest, runTick } from './game/globals.js';
import { guessQuest as doGuessQuest } from './game/guesses.js';
import {
  handleAdminCreated,
  handleJoinRequestCreated,
  requestJoin as doRequestJoin,
  reviewJoinRequest as doReviewJoinRequest,
} from './game/join.js';
import { setPlayerLeft as doSetPlayerLeft } from './game/left.js';
import { adjustPoints as doAdjustPoints } from './game/points.js';
import { grantRerolls as doGrantRerolls } from './game/rerolls.js';
import { rerollQuest as doRerollQuest } from './game/quests.js';
import { recountReactions } from './game/reactions.js';
import {
  handleFeedCreated,
  makeSender,
  removePushToken as doRemovePushToken,
  savePushToken as doSavePushToken,
  sendPush,
  type PushSender,
} from './game/push.js';
import { resetGame as doResetGame } from './game/reset.js';
import { setGameStatus as doSetGameStatus } from './game/status.js';
import { handleSubmissionCreated, reviewSubmission as doReviewSubmission } from './game/submissions.js';
import {
  advanceGlobalQuest as doAdvanceGlobalQuest,
  castVote as doCastVote,
  checkEntry as doCheckEntry,
  enterSideQuest as doEnterSideQuest,
} from './game/votes.js';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'europe-west2', maxInstances: 10 });

/** onCall wrapper: builds the Ctx, passes HttpsErrors through and hides everything else behind 'internal'. */
function callable<T, R>(handler: (ctx: Ctx, data: T) => Promise<R>, opts: CallableOptions = {}) {
  return onCall<T, Promise<R>>(opts, async (req) => {
    const ctx: Ctx = {
      uid: req.auth?.uid ?? null,
      email: req.auth?.token?.email ?? null,
      now: new Date(),
      rng: Math.random,
    };
    try {
      return await handler(ctx, (req.data ?? {}) as T);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('Unhandled error in callable', err);
      throw new HttpsError('internal', 'Something went wrong.');
    }
  });
}

export const requestJoin = callable((ctx, data: Parameters<typeof doRequestJoin>[2]) => doRequestJoin(db, ctx, data));
export const reviewJoinRequest = callable((ctx, data: Parameters<typeof doReviewJoinRequest>[2]) =>
  doReviewJoinRequest(db, ctx, data),
);
export const rerollQuest = callable((ctx, data: Parameters<typeof doRerollQuest>[2]) => doRerollQuest(db, ctx, data));
export const guessQuest = callable((ctx, data: Parameters<typeof doGuessQuest>[2]) => doGuessQuest(db, ctx, data));
export const reviewSubmission = callable((ctx, data: Parameters<typeof doReviewSubmission>[2]) =>
  doReviewSubmission(db, ctx, data),
);
export const fireGlobalQuest = callable((ctx, data: Parameters<typeof doFireGlobalQuest>[2]) =>
  doFireGlobalQuest(db, ctx, data),
);
export const addEvidence = callable((ctx, data: Parameters<typeof doAddEvidence>[2]) => doAddEvidence(db, ctx, data));
export const enterSideQuest = callable((ctx, data: Parameters<typeof doEnterSideQuest>[2]) =>
  doEnterSideQuest(db, ctx, data),
);
export const castVote = callable((ctx, data: Parameters<typeof doCastVote>[2]) => doCastVote(db, ctx, data));
export const advanceGlobalQuest = callable((ctx, data: Parameters<typeof doAdvanceGlobalQuest>[2]) =>
  doAdvanceGlobalQuest(db, ctx, data),
);
// A rejected entrant hears about it once the check is saved.
export const checkEntry = callable(async (ctx, data: Parameters<typeof doCheckEntry>[2]) => {
  const { push, ...result } = await doCheckEntry(db, ctx, data);
  if (push) await sendPush(db, pushSender(), push);
  return result;
});
export const savePushToken = callable((ctx, data: { token?: unknown }) => doSavePushToken(db, ctx, data));
export const removePushToken = callable((ctx, data: { token?: unknown }) => doRemovePushToken(db, ctx, data));
// Claimants waiting on the player as witness hear about it once the change is saved.
export const setPlayerLeft = callable(async (ctx, data: Parameters<typeof doSetPlayerLeft>[2]) => {
  const { push, ...result } = await doSetPlayerLeft(db, ctx, data);
  if (push) await sendPush(db, pushSender(), push);
  return result;
});
export const adjustPoints = callable((ctx, data: Parameters<typeof doAdjustPoints>[2]) => doAdjustPoints(db, ctx, data));
export const grantRerolls = callable((ctx, data: Parameters<typeof doGrantRerolls>[2]) => doGrantRerolls(db, ctx, data));
export const setGameStatus = callable((ctx, data: Parameters<typeof doSetGameStatus>[2]) =>
  doSetGameStatus(db, ctx, data),
);
export const endGame = callable((ctx) => doEndGame(db, ctx), { timeoutSeconds: 120 });

/** Best effort: photos and avatars live in Storage, outside the Firestore wipe. */
async function wipeStorage(): Promise<void> {
  try {
    const bucket = getStorage().bucket();
    for (const prefix of ['submissions/', 'avatars/']) {
      try {
        await bucket.deleteFiles({ prefix, force: true });
      } catch (err) {
        logger.warn(`Could not delete storage objects under ${prefix}`, err);
      }
    }
  } catch (err) {
    logger.warn('Could not open the storage bucket; skipping storage cleanup', err);
  }
}

export const resetGame = callable(
  async (ctx, data: Parameters<typeof doResetGame>[2]) => {
    await doResetGame(db, ctx, data);
    await wipeStorage();
  },
  { timeoutSeconds: 300 },
);

// Push: the emulators log instead of calling FCM, so no test or local run ever reaches a real phone.
const pushSender = (): PushSender => makeSender({ emulator: process.env.FUNCTIONS_EMULATOR === 'true', log: (line) => logger.info(line) });

export const onSubmissionCreated = onDocumentCreated('submissions/{submissionId}', async (event) => {
  const plan = await handleSubmissionCreated(db, event.params.submissionId, new Date());
  if (plan) await sendPush(db, pushSender(), plan);
});

// GMs never need join approval: whoever is made a GM while their request waits becomes a player.
export const onAdminCreated = onDocumentCreated('admins/{uid}', async (event) => {
  await handleAdminCreated(db, event.params.uid, new Date());
});

// Every feed post (almost every game event) may buzz the players it is about; see functions/src/game/push.ts.
export const onFeedCreated = onDocumentCreated('feed/{feedId}', async (event) => {
  await handleFeedCreated(db, pushSender(), event.params.feedId);
});

// A new join request tells the GMs.
export const onJoinRequestCreated = onDocumentCreated('joinRequests/{uid}', async (event) => {
  const plan = await handleJoinRequestCreated(db, event.params.uid);
  if (plan) await sendPush(db, pushSender(), plan);
});

// Reactions are set, changed and removed by players; keep the post's reactionCount in step.
export const onFeedReactionWritten = onDocumentWritten('feed/{feedId}/reactions/{uid}', async (event) => {
  await recountReactions(db, event.params.feedId);
});

export const globalQuestTick = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Europe/London' }, async () => {
  await runTick(db, new Date(), Math.random);
});

// Dev only: the emulator never runs schedules, so expose the tick over HTTP there.
export const devTick =
  process.env.FUNCTIONS_EMULATOR === 'true'
    ? onRequest(async (_req, res) => {
        try {
          res.json(await runTick(db, new Date(), Math.random));
        } catch (err) {
          logger.error('devTick failed', err);
          res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
      })
    : undefined;
