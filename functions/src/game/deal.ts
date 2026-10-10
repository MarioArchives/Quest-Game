// Dealing personal quests: a player never gets a template they have ever held (any status).
import type { Transaction } from 'firebase-admin/firestore';
import type { QuestTemplate } from '../shared/types.js';
import type { Db } from './context.js';
import { toTs } from './util.js';

export interface FreshTemplate {
  id: string;
  template: QuestTemplate;
}

/** Active personal templates the player has never held. Reads only; call before any write. */
export async function readFreshTemplates(tx: Transaction, db: Db, uid: string): Promise<FreshTemplate[]> {
  const templates = await tx.get(
    db.collection('questTemplates').where('scope', '==', 'personal').where('active', '==', true),
  );
  const held = await tx.get(db.collection(`players/${uid}/quests`).select('templateId'));
  const heldIds = new Set(held.docs.map((d) => d.get('templateId') as string));
  return templates.docs
    .filter((d) => !heldIds.has(d.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => ({ id: d.id, template: d.data() as QuestTemplate }));
}

/**
 * Deals up to `count` active quests from `pool`, picked uniformly with `rng`. Picked templates are
 * removed from the pool so repeated calls in one transaction never duplicate. Returns the new quest ids.
 */
export function dealFrom(
  tx: Transaction,
  db: Db,
  now: Date,
  rng: () => number,
  uid: string,
  pool: FreshTemplate[],
  count: number,
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    const [picked] = pool.splice(idx, 1);
    const ref = db.collection(`players/${uid}/quests`).doc();
    tx.create(ref, {
      templateId: picked.id,
      title: picked.template.title,
      description: picked.template.description,
      status: 'active',
      assignedAt: toTs(now),
      submissionId: null,
    });
    ids.push(ref.id);
  }
  return ids;
}
