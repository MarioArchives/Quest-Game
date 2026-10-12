// What a claim looks like on the wire. The security rules check this exact field list
// (hasOnly / hasAll), so it is decided in one place.
import { backend } from '../backend';
import { SERVER_TIME } from '../backend/types';

export interface ClaimInput {
  uid: string;
  /** The quest doc id (players/{uid}/quests/{id}). */
  questId: string;
  /** The other player who is asked to approve it (never the claimant). */
  witnessUid: string;
}

/**
 * A claim is created pending with no photo, caption or location: evidence is added after approval.
 * Exactly {uid, kind, questId, witnessUid, createdAt, status}; side-quest entries go through enterSideQuest.
 */
export function buildSubmissionDoc({ uid, questId, witnessUid }: ClaimInput) {
  return {
    uid,
    kind: 'personal' as const,
    questId,
    witnessUid,
    createdAt: SERVER_TIME,
    status: 'pending' as const,
  };
}

/** A fresh submission id (so a retry after a network blip writes the same document). */
export function newSubmissionId(): string {
  return backend().data.newId('submissions');
}

/** The ONE place that writes a claim (a server trigger then processes it). */
export function writeSubmission(id: string, data: ReturnType<typeof buildSubmissionDoc>): Promise<void> {
  return backend().data.set(`submissions/${id}`, data);
}
