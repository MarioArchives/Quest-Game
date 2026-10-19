// Cloud Functions entry point: thin wrappers that build a Ctx and delegate to src/game/*.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { fcmSender } from './firebase/push-sender.js';
import { toHttpsError } from './firebase/errors.js';
import { firestoreStore } from './firebase/store.js';
import { wipeFiles } from './firebase/storage.js';
import { twilioLine, voiceHandler, voiceUrlFor } from './firebase/twilio.js';
import { CALLABLES, type Services } from './game/callables.js';
import type { Ctx } from './game/context.js';
import { runPeriodics } from './game/checkins.js';
import { runTick } from './game/globals.js';
import { runPolice } from './game/police.js';
import type { PhoneLine } from './game/phoneLine.js';
import { runSwitchboard } from './game/phones.js';
import { handlePoliceVoice } from './game/policePhone.js';
import { simulatedLine } from './game/simulatedLine.js';
import { renderTwiml, voiceOf } from './game/voice.js';
import { runStandings } from './game/standing.js';
import { makeSender, sendPush, type PushSender } from './game/push.js';
import { TRIGGERS, type TriggerDef, type TriggerEnv } from './game/triggers.js';
import { getPack, validatePack } from './shared/packs/index.js';

// The only place the environment is read: which game this deployment runs (functions/.env sets GAME_PACK), and the
// police phone line's config below.
const PACK = getPack(process.env.GAME_PACK);
const packProblems = validatePack(PACK);
if (packProblems.length > 0) throw new Error(`Game pack "${PACK.id}" is invalid:\n- ${packProblems.join('\n- ')}`);

initializeApp();
const db = firestoreStore(getFirestore());
const REGION = 'europe-west2';
setGlobalOptions({ region: REGION, maxInstances: 10 });

// Police phone calls (Twilio; see design/twilio-setup.md). The two keys are secrets (Secret Manager); the caller ID,
// the webhook's URL and the recordings' address are plain config in functions/.env.<project id>, read here only:
// POLICE_CALLER_ID (the verified number the police ring from, E.164; without it there are no phone calls, no secrets
// to set and no policeVoice function), POLICE_VOICE_URL (blank: the cloudfunctions.net address) and POLICE_AUDIO_URL
// (where the pack's recorded lines are served, e.g. https://…/audio/police; blank: every line is read out). The
// emulators never ring anyone: they have the simulated line, where the app plays the phone.
const POLICE_CALLER_ID = process.env.POLICE_CALLER_ID?.trim() ?? '';
const PHONE_CALLS = POLICE_CALLER_ID !== '' && process.env.FUNCTIONS_EMULATOR !== 'true';
// Declared only with phone calls on: the CLI asks for every declared secret at deploy time, so a deployment without
// Twilio (no POLICE_CALLER_ID, e.g. police calls on Telegram from services/telegram-police) has none to set.
const TWILIO_ACCOUNT_SID = PHONE_CALLS ? defineSecret('TWILIO_ACCOUNT_SID') : null;
const TWILIO_AUTH_TOKEN = PHONE_CALLS ? defineSecret('TWILIO_AUTH_TOKEN') : null;
const phoneSecrets = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN] : [];
const POLICE_AUDIO_URL = (process.env.POLICE_AUDIO_URL?.trim() ?? '').replace(/\/+$/, '');

const voiceUrl = (): string => process.env.POLICE_VOICE_URL?.trim() || `https://${REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/policeVoice`;

const SIMULATED_LINE = process.env.FUNCTIONS_EMULATOR === 'true' ? simulatedLine() : null;

/** The phone line, for functions that declared the secrets: Twilio's, the simulated one in the emulators, or null. */
const phoneLine = (): PhoneLine | null =>
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilioLine({ accountSid: TWILIO_ACCOUNT_SID.value(), authToken: TWILIO_AUTH_TOKEN.value(), callerId: POLICE_CALLER_ID, voiceUrl: voiceUrl() })
    : SIMULATED_LINE;

// Push: the emulators log instead of calling FCM, so no test or local run ever reaches a real phone.
const pushSender = (): PushSender =>
  makeSender({ emulator: process.env.FUNCTIONS_EMULATOR === 'true', log: (line) => logger.info(line), fcm: fcmSender });

const services: Services = {
  sendPush: async (plan) => {
    await sendPush(db, pushSender(), plan);
  },
  wipeFiles,
  phone: phoneLine,
};

/** onCall for a registry entry: builds the Ctx, maps game errors to HttpsErrors and hides everything else. */
function callable(name: keyof typeof CALLABLES & string) {
  const def = CALLABLES[name];
  const options = { ...(def.timeoutSeconds ? { timeoutSeconds: def.timeoutSeconds } : {}), ...(def.phone ? { secrets: phoneSecrets } : {}) };
  return onCall<unknown, Promise<unknown>>(options, async (req) => {
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
export const bookIn = callable('bookIn');
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
export const answerCheckin = callable('answerCheckin');
export const managePeriodic = callable('managePeriodic');
export const answerPoliceCall = callable('answerPoliceCall');
export const tipOffPolice = callable('tipOffPolice');
export const setPoliceLine = callable('setPoliceLine');
export const testPoliceLine = callable('testPoliceLine');
export const setSwitchboard = callable('setSwitchboard');
// Only where the simulated line is (the emulators): a deployment's calls are Twilio's, answered on real phones.
export const simulateCall = SIMULATED_LINE ? callable('simulateCall') : undefined;
export const endGame = callable('endGame');
export const resetGame = callable('resetGame');

export const onSubmissionCreated = onDocumentCreated(trigger('onSubmissionCreated').pattern, async (event) => {
  await trigger('onSubmissionCreated').run(db, event.params, triggerEnv());
});
export const onSubmissionWritten = onDocumentWritten(trigger('onSubmissionWritten').pattern, async (event) => {
  await trigger('onSubmissionWritten').run(db, event.params, triggerEnv());
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
export const onPlayerWritten = onDocumentWritten(trigger('onPlayerWritten').pattern, async (event) => {
  await trigger('onPlayerWritten').run(db, event.params, triggerEnv());
});
export const onPoliceCallCreated = onDocumentCreated(
  { document: trigger('onPoliceCallCreated').pattern, secrets: phoneSecrets },
  async (event) => {
    await trigger('onPoliceCallCreated').run(db, event.params, triggerEnv());
  },
);
export const onFeedReactionWritten = onDocumentWritten(trigger('onFeedReactionWritten').pattern, async (event) => {
  await trigger('onFeedReactionWritten').run(db, event.params, triggerEnv());
});

export const globalQuestTick = onSchedule({ schedule: 'every 5 minutes', timeZone: PACK.timeZone, secrets: phoneSecrets }, async () => {
  await runTick(db, new Date(), Math.random, PACK);
  await runPeriodics(db, new Date(), Math.random, PACK);
  await runStandings(db, new Date(), PACK);
  await runPolice(db, new Date(), Math.random, PACK);
  await runSwitchboard(db, new Date(), PACK, phoneLine());
});

// Twilio's webhook for the police phone calls: what to say, the keypad answer and every status change. Twilio signs
// each request with the auth token; anything unsigned is refused.
export const policeVoice = TWILIO_AUTH_TOKEN
  ? onRequest(
      { secrets: phoneSecrets, invoker: 'public', timeoutSeconds: 30 },
      voiceHandler({
        authToken: () => TWILIO_AUTH_TOKEN.value(),
        voiceUrl,
        handle: (req) => handlePoliceVoice(db, new Date(), PACK, req),
        render: (reply) => {
          const recorded = new Set(PACK.policeVoice?.recordings ?? []);
          return renderTwiml(reply, {
            action: (query) => voiceUrlFor(voiceUrl(), query),
            voice: voiceOf(PACK),
            recording: (line) => (POLICE_AUDIO_URL && recorded.has(line) ? `${POLICE_AUDIO_URL}/${line}.mp3` : null),
          });
        },
        log: (message, err) => (err ? logger.error(message, err) : logger.warn(message)),
      }),
    )
  : undefined;

// Dev only: the emulator never runs schedules, so expose the tick over HTTP there.
export const devTick =
  process.env.FUNCTIONS_EMULATOR === 'true'
    ? onRequest(async (_req, res) => {
        try {
          const sideQuests = await runTick(db, new Date(), Math.random, PACK);
          const checkins = await runPeriodics(db, new Date(), Math.random, PACK);
          const standings = await runStandings(db, new Date(), PACK);
          const police = await runPolice(db, new Date(), Math.random, PACK);
          const switchboard = await runSwitchboard(db, new Date(), PACK, phoneLine());
          res.json({ ...sideQuests, checkins, standings, police, switchboard });
        } catch (err) {
          logger.error('devTick failed', err);
          res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
      })
    : undefined;
