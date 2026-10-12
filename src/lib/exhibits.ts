// A player's exhibits: the photos they entered in side quests that went to the vote.
import type { Doc, GlobalQuest, Submission } from '../shared';

export interface Exhibit {
  submissionId: string;
  imagePath: string;
  thumbPath: string | null;
  /** The side quest's title. */
  caption: string;
}

/** Newest first. Only `uid`'s side-quest entries with a photo whose status is 'approved' (they went to the vote). */
export function exhibitsFor(
  uid: string,
  submissions: ReadonlyArray<Doc<Submission>>,
  globalQuests: ReadonlyArray<Doc<GlobalQuest>>,
): Exhibit[] {
  const titles = new Map(globalQuests.map((q) => [q.id, q.title]));
  return submissions
    .filter((s) => s.uid === uid && s.kind === 'global' && s.status === 'approved' && s.imagePath)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    .map((s) => ({
      submissionId: s.id,
      imagePath: s.imagePath as string,
      thumbPath: s.thumbPath ?? null,
      caption: titles.get(s.questId) ?? s.caption ?? '',
    }));
}
