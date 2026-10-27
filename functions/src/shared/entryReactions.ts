// The two reactions a player can give a side-quest entry while it is up for a vote, apart from the log book's votes:
// an eye (suspicious) and a heart. Kept in submissions/{id}/entryReactions/{uid}; firestore.rules mirrors the list
// and canReact (a test checks the rules' fields agree).
import type { Submission } from './types.ts';

export const ENTRY_REACTIONS = ['eye', 'heart'] as const;
export type EntryReactionKind = (typeof ENTRY_REACTIONS)[number];

/** Whether `uid` may react to this submission: an approved side-quest entry that isn't theirs. */
export function canReact(sub: Pick<Submission, 'kind' | 'status' | 'uid'> | null | undefined, uid: string | null | undefined): boolean {
  return !!sub && !!uid && sub.kind === 'global' && sub.status === 'approved' && sub.uid !== uid;
}
