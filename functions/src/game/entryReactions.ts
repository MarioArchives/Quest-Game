// The onEntryReactionWritten trigger's work: keeps a side-quest entry's reactions (submission.entryReactions) in step
// with its entryReactions docs.
import { ENTRY_REACTIONS } from '../shared/entryReactions.js';
import { StoreError } from '../shared/store/errors.js';
import type { EntryReactionCounts } from '../shared/types.js';
import type { Db } from './context.js';

/**
 * Recount a side-quest entry's reactions from submissions/{id}/entryReactions/*: the sorted uids that gave an eye and
 * a heart, never the entrant's own. Idempotent; a submission that has gone is left alone.
 */
export async function recountEntryReactions(db: Db, submissionId: string): Promise<void> {
  const ref = db.doc(`submissions/${submissionId}`);
  const sub = await ref.get();
  if (!sub.exists) return;
  const owner = (sub.data() as { uid?: string }).uid;
  const docs = (await ref.collection('entryReactions').get()).docs;
  const counts = Object.fromEntries(ENTRY_REACTIONS.map((kind) => [kind, [] as string[]])) as unknown as EntryReactionCounts;
  for (const d of docs) {
    if (d.id === owner) continue;
    const data = d.data() as Record<string, unknown>;
    for (const kind of ENTRY_REACTIONS) if (data[kind] === true) counts[kind].push(d.id);
  }
  for (const kind of ENTRY_REACTIONS) counts[kind].sort();
  try {
    await ref.update({ entryReactions: counts });
  } catch (err) {
    if (err instanceof StoreError && err.code === 'not-found') return;
    throw err;
  }
}
