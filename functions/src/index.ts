// Cloud Functions entry point: thin wrappers that build a Ctx and delegate to src/game/*.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { fcmSender } from './firebase/push-sender.js';
import { toHttpsError } from './firebase/errors.js';
import { firestoreStore } from './firebase/store.js';
import { wipeFiles } from './firebase/storage.js';
import { CALLABLES, type Services } from './game/callables.js';
import type { Ctx } from './game/context.js';
import { runTick } from './game/globals.js';
import { makeSender, sendPush, type PushSender } from './game/push.js';
import { TRIGGERS, type TriggerDef, type TriggerEnv } from './game/triggers.js';
import { getPack, validatePack } from './shared/packs/index.js';

// The only place the environment is read: which game this deployment runs (functions/.env sets GAME_PACK).
const PACK = getPack(process.env.GAME_PACK);
const packProblems = validatePack(PACK);
if (packProblems.length > 0) throw new Error(`Game pack "${PACK.id}" is invalid:\n- ${packProblems.join('\n- ')}`);

initializeApp();
const db = firestoreStore(getFirestore());
setGlobalOptions({ region: 'europe-west2', maxInstances: 10 });

// Push: the emulators log instead of calling FCM, so no test or local run ever reaches a real phone.
const pushSender = (): PushSender =>
  makeSender({ emulator: process.env.FUNCTIONS_EMULATOR === 'true', log: (line) => logger.info(line), fcm: fcmSender });

const services: Services = {
  sendPush: async (plan) => {
    await sendPush(db, pushSender(), plan);
  },
  wipeFiles,
};

/** onCall for a registry entry: builds the Ctx, maps game errors to HttpsErrors and hides everything else. */
function callable(name: keyof typeof CALLABLES & string) {
  const def = CALLABLES[name];
  return onCall<unknown, Promise<unknown>>(def.timeoutSeconds ? { timeoutSeconds: def.timeoutSeconds } : {}, async (req) => {
    const ctx: Ctx = {
      uid: req.auth?.uid ?? null,
      email: req.auth?.token?.email ?? null,
      now: new Date(),
      rng: Math.random,
      pack: PACK,
    };
    try {
      return await def.run(db, ctx, req.data ?? {}, services);
    } catch (err) {
      const mapped = toHttpsError(err);
      if (mapped.code === 'internal') logger.error(`Unhandled error in ${name}`, err);
      throw mapped;
    }
  });
}

const triggerEnv = (): TriggerEnv => ({ now: new Date(), rng: Math.random, pack: PACK, services });
const trigger = (name: string): TriggerDef => TRIGGERS.find((t) => t.name === name)!;

export const requestJoin = callable('requestJoin');
export const reviewJoinRequest = callable('reviewJoinRequest');
export const rerollQuest = callable('rerollQuest');
export const guessQuest = callable('guessQuest');
export const reviewSubmission = callable('reviewSubmission');
export const fireGlobalQuest = callable('fireGlobalQuest');
export const addEvidence = callable('addEvidence');
export const enterSideQuest = callable('enterSideQuest');
export const castVote = callable('castVote');
export const advanceGlobalQuest = callable('advanceGlobalQuest');
export const checkEntry = callable('checkEntry');
export const savePushToken = callable('savePushToken');
export const removePushToken = callable('removePushToken');
export const setPlayerLeft = callable('setPlayerLeft');
export const adjustPoints = callable('adjustPoints');
export const grantRerolls = callable('grantRerolls');
export const setGameStatus = callable('setGameStatus');
export const resolveReward = callable('resolveReward');
export const setCharacter = callable('setCharacter');
export const endGame = callable('endGame');
export const resetGame = callable('resetGame');

export const onSubmissionCreated = onDocumentCreated(trigger('onSubmissionCreated').pattern, async (event) => {
  await trigger('onSubmissionCreated').run(db, event.params, triggerEnv());
});
export const onAdminCreated = onDocumentCreated(trigger('onAdminCreated').pattern, async (event) => {
  await trigger('onAdminCreated').run(db, event.params, triggerEnv());
});
export const onFeedCreated = onDocumentCreated(trigger('onFeedCreated').pattern, async (event) => {
  await trigger('onFeedCreated').run(db, event.params, triggerEnv());
});
export const onJoinRequestCreated = onDocumentCreated(trigger('onJoinRequestCreated').pattern, async (event) => {
  await trigger('onJoinRequestCreated').run(db, event.params, triggerEnv());
});
export const onFeedReactionWritten = onDocumentWritten(trigger('onFeedReactionWritten').pattern, async (event) => {
  await trigger('onFeedReactionWritten').run(db, event.params, triggerEnv());
});

export const globalQuestTick = onSchedule({ schedule: 'every 15 minutes', timeZone: PACK.timeZone }, async () => {
  await runTick(db, new Date(), Math.random, PACK);
});

// Dev only: the emulator never runs schedules, so expose the tick over HTTP there.
export const devTick =
  process.env.FUNCTIONS_EMULATOR === 'true'
    ? onRequest(async (_req, res) => {
        try {
          res.json(await runTick(db, new Date(), Math.random, PACK));
        } catch (err) {
          logger.error('devTick failed', err);
          res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
      })
    : undefined;
