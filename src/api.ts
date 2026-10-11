// Typed wrappers around the server callables (functions region europe-west2).
import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { GameStatus, GlobalQuestStatus, SubmissionStatus } from './shared';

/** An error from a callable, with a message that is safe to show to a player. */
export class ApiError extends Error {
  readonly code: string;
  /** Epoch ms when a rate-limited action becomes available again ('resource-exhausted'). */
  readonly retryAt: number | null;

  constructor(code: string, message: string, retryAt: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryAt = retryAt;
  }
}

const FALLBACK: Record<string, string> = {
  unauthenticated: 'You need to sign in again.',
  'permission-denied': "You're not allowed to do that.",
  'failed-precondition': "That isn't possible right now.",
  'invalid-argument': "Something about that request wasn't right.",
  'not-found': "We couldn't find that. It may have changed, so try refreshing.",
  'already-exists': 'That has already been done.',
  'resource-exhausted': 'Slow down a little and try again shortly.',
  unavailable: "Can't reach the server. Check your signal and try again.",
  'deadline-exceeded': 'That took too long. Try again.',
  unimplemented: "That isn't available yet.",
  cancelled: 'Cancelled.',
  aborted: 'That clashed with another change. Try again.',
};

/** Codes whose server-written message is already phrased for people. */
const SERVER_MESSAGE_CODES = new Set([
  'permission-denied',
  'failed-precondition',
  'invalid-argument',
  'not-found',
  'already-exists',
  'resource-exhausted',
  'unauthenticated',
]);

function stripPrefix(code: string): string {
  return code.replace(/^functions\//, '');
}

function retryAtFrom(details: unknown): number | null {
  if (details && typeof details === 'object' && 'retryAt' in details) {
    const value = Number((details as { retryAt: unknown }).retryAt);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/** Messages for errors thrown by the client SDKs (Firestore / Storage), not by our callables. */
const CLIENT_FALLBACK: Record<string, string> = {
  'permission-denied': "That isn't allowed right now. Is the game running?",
  'storage/unauthorized': "That upload isn't allowed right now. Is the game running?",
  'storage/canceled': 'The upload was cancelled.',
  'storage/retry-limit-exceeded': 'The upload kept failing. Check your signal and try again.',
  'storage/quota-exceeded': 'The photo storage is full. Tell the GM.',
  unavailable: "Can't reach the server. Check your signal and try again.",
  'resource-exhausted': 'Slow down a little and try again shortly.',
  'unauthenticated': 'You need to sign in again.',
  'not-found': "We couldn't find that. It may have changed.",
};

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof FirebaseError) {
    const fromCallable = err.code.startsWith('functions/');
    const code = stripPrefix(err.code);
    if (!fromCallable) {
      return new ApiError(code, CLIENT_FALLBACK[err.code] ?? 'Something went wrong. Try again in a moment.');
    }
    const retryAt = retryAtFrom((err as FirebaseError & { details?: unknown }).details);
    // The Functions SDK appends the HTTP status to the server's text ("The game has ended. [400]").
    const server = (err.message ?? '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
    const looksHuman = server.length > 0 && server.length < 200 && !/^internal$/i.test(server) && !server.includes('Firebase:');
    let message: string;
    if (SERVER_MESSAGE_CODES.has(code) && looksHuman) message = server;
    else message = FALLBACK[code] ?? 'Something went wrong on our side. Try again in a moment.';
    if (code === 'resource-exhausted' && retryAt) {
      const mins = Math.max(1, Math.ceil((retryAt - Date.now()) / 60_000));
      message = `Too soon. You can try again in ${mins} min.`;
    }
    return new ApiError(code, message, retryAt);
  }
  if (err instanceof Error) return new ApiError('unknown', err.message || 'Something went wrong.');
  return new ApiError('unknown', 'Something went wrong.');
}

/** Message suitable for a toast or inline error, from anything thrown. */
export function friendlyError(err: unknown): string {
  return toApiError(err).message;
}

async function call<I, O>(name: string, data: I): Promise<O> {
  try {
    const result = await httpsCallable<I, O>(functions, name)(data);
    return result.data;
  } catch (err) {
    throw toApiError(err);
  }
}

// ---- players -------------------------------------------------------------------------------

/** 'approved': the caller is a GM, so they are a player straight away; 'pending': a GM has to let them in. */
export type JoinStatus = 'pending' | 'approved' | 'already-player';

export const requestJoin = (data: { displayName: string; photoURL: string | null }) =>
  call<typeof data, { status: JoinStatus }>('requestJoin', data);

export const rerollQuest = (data: { questId: string }) => call<typeof data, { questId: string }>('rerollQuest', data);

export const guessQuest = (data: { targetUid: string; templateId: string }) =>
  call<typeof data, { correct: boolean }>('guessQuest', data);

// ---- GM ------------------------------------------------------------------------------------

export const reviewJoinRequest = (data: { uid: string; approve: boolean }) =>
  call<typeof data, { status: 'approved' | 'rejected' }>('reviewJoinRequest', data);

/** Photo and/or caption for an approved claim (or a side-quest entry while the quest is still live). */
export interface EvidenceInput {
  imagePath?: string;
  thumbPath?: string;
  caption?: string;
}

export const addEvidence = (data: EvidenceInput & { submissionId: string }) =>
  call<typeof data, { ok?: boolean }>('addEvidence', data);

/** Enter a side quest: no witness. The last player in closes entries: the GM checks them (or voting opens). */
export const enterSideQuest = (data: EvidenceInput & { globalQuestId: string }) =>
  call<typeof data, { submissionId: string; checking: boolean; late: boolean }>('enterSideQuest', data);

/** Vote for an entry (not your own). Re-voting replaces your vote; `closed` is true if that was the last vote. */
export const castVote = (data: { globalQuestId: string; submissionId: string }) =>
  call<typeof data, { closed: boolean }>('castVote', data);

/** GM: live -> checking (or voting, or closed if nobody entered), checking -> voting, or voting -> closed (tally). */
export const advanceGlobalQuest = (data: { globalQuestId: string }) =>
  call<typeof data, { status: GlobalQuestStatus }>('advanceGlobalQuest', data);

/** GM: accept or reject (no fine) a side-quest entry while its side quest is checking. Returns where the quest is now. */
export const checkEntry = (data: { submissionId: string; accept: boolean; note?: string }) =>
  call<typeof data, { checked: 'accepted' | 'rejected'; status: GlobalQuestStatus }>('checkEntry', data);

/** GM: mark a player who has left ('frozen' keeps them on the leaderboard, 'out' hides them), or bring them back (null). */
export const setPlayerLeft = (data: { uid: string; left: 'frozen' | 'out' | null }) =>
  call<typeof data, { left: 'frozen' | 'out' | null }>('setPlayerLeft', data);

export const reviewSubmission = (data: { submissionId: string; approve: boolean; note?: string }) =>
  call<typeof data, { status: SubmissionStatus }>('reviewSubmission', data);

export type FireGlobalQuestInput =
  | { mode: 'random' }
  | {
      mode: 'custom';
      title: string;
      description: string;
      windowMin: number;
      points: number;
    };

export const fireGlobalQuest = (data: FireGlobalQuestInput) =>
  call<FireGlobalQuestInput, { globalQuestId: string }>('fireGlobalQuest', data);

export const adjustPoints = (data: { uid: string; delta: number; reason: string }) =>
  call<typeof data, { points: number }>('adjustPoints', data);

export const savePushToken = (data: { token: string }) => call<typeof data, { ok: true }>('savePushToken', data);

export const removePushToken = (data: { token: string }) => call<typeof data, { ok: true }>('removePushToken', data);

export const grantRerolls = (data: { uid: string; delta: number }) =>
  call<typeof data, { extraRerolls: number; rerollsLeft: number }>('grantRerolls', data);

export const setGameStatus = (data: { status: Extract<GameStatus, 'active' | 'paused'> }) =>
  call<typeof data, { status: GameStatus }>('setGameStatus', data);

export const endGame = () => call<Record<string, never>, { players: number }>('endGame', {});

export const resetGame = (data: { confirm: 'RESET' }) => call<typeof data, void>('resetGame', data);
