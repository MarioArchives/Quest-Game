// Typed wrappers around the server callables (functions region europe-west2).
import { backend } from './backend';
import { ApiError, toApiError } from './lib/apiError';
import type { GameStatus, GlobalQuestStatus, SubmissionStatus } from './shared';

export { ApiError, toApiError };

/** Message suitable for a toast or inline error, from anything thrown. */
export function friendlyError(err: unknown): string {
  return toApiError(err).message;
}

async function call<I, O>(name: string, data: I): Promise<O> {
  try {
    return await backend().call<I, O>(name, data);
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

/** Packs with rewardChoice: spend a reward on points to yourself ('clean') or points off another player ('frame'). */
export const resolveReward = (data: { rewardId: string; choice: 'clean' | 'frame'; targetUid?: string }) =>
  call<typeof data, { status: 'cleaned' | 'framed'; points: number }>('resolveReward', data);

// ---- GM ------------------------------------------------------------------------------------

export const reviewJoinRequest = (data: { uid: string; approve: boolean }) =>
  call<typeof data, { status: 'approved' | 'rejected' }>('reviewJoinRequest', data);

/** Photo and/or caption for an approved claim (or a side-quest entry while the quest is still live). */
export interface EvidenceInput {
  imagePath?: string;
  thumbPath?: string;
  caption?: string;
}

/** Answer the open check-in with a photo and/or a comment (once, before its time is up). */
export const answerCheckin = (data: { checkinId: string } & EvidenceInput) => call<typeof data, { ok: true }>('answerCheckin', data);

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
    }
  /** A template the GM drew and looked at first, as it is or with any of the fields changed. */
  | {
      mode: 'template';
      templateId: string;
      title?: string;
      description?: string;
      windowMin?: number;
      points?: number;
    };

export const fireGlobalQuest = (data: FireGlobalQuestInput) =>
  call<FireGlobalQuestInput, { globalQuestId: string }>('fireGlobalQuest', data);

export const adjustPoints = (data: { uid: string; delta: number; reason: string }) =>
  call<typeof data, { points: number }>('adjustPoints', data);

/** Packs with characters: who a player plays (public) and their motive (private). */
export const setCharacter = (data: { uid: string; name: string; role: string; motive: string }) =>
  call<typeof data, { ok: true }>('setCharacter', data);

/** What the GM sets on a periodic mission. */
export interface PeriodicFieldsInput {
  name: string;
  prompts: string[];
  intervalMin: number;
  windowMin: number;
  penalty: number;
  count: number;
}

/** GM: manage periodic missions (create, update, start, stop, fire the next one now, end an open one, delete). */
export type ManagePeriodicInput =
  | { action: 'create'; fields: PeriodicFieldsInput; start?: boolean }
  | { action: 'update'; id: string; fields: Partial<PeriodicFieldsInput> }
  | { action: 'start' | 'stop' | 'delete'; id: string }
  | { action: 'fire'; id: string; prompt?: string }
  | { action: 'end'; checkinId: string; charge: boolean };

export const managePeriodic = (data: ManagePeriodicInput) => call<ManagePeriodicInput, { id: string }>('managePeriodic', data);

export const savePushToken = (data: { token: string }) => call<typeof data, { ok: true }>('savePushToken', data);

export const removePushToken = (data: { token: string }) => call<typeof data, { ok: true }>('removePushToken', data);

export const grantRerolls = (data: { uid: string; delta: number }) =>
  call<typeof data, { extraRerolls: number; rerollsLeft: number }>('grantRerolls', data);

export const setGameStatus = (data: { status: Extract<GameStatus, 'active' | 'paused'> }) =>
  call<typeof data, { status: GameStatus }>('setGameStatus', data);

export const endGame = () => call<Record<string, never>, { players: number }>('endGame', {});

export const resetGame = (data: { confirm: 'RESET' }) => call<typeof data, void>('resetGame', data);
