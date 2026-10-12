// Dealing personal quests: a player never gets a template they have ever held (any status).
import type { Txn } from '../shared/store/types.js';
import type { QuestTemplate } from '../shared/types.js';
import type { Db } from './context.js';
import { toTs } from './util.js';

export interface FreshTemplate {
  id: string;
  template: QuestTemplate;
}

/**
 * What dealing to a player needs: the active personal templates they have never held, and how many
 * quests they hold open (active + submitted). Callers adjust `open` as they close or replace quests.
 */
export interface Dealing {
  pool: FreshTemplate[];
  open: number;
}

/** Reads the player's dealing state. Reads only; call before any write. */
export async function readDealing(tx: Txn, db: Db, uid: string): Promise<Dealing> {
  const templates = await tx.get(
    db.collection('questTemplates').where('scope', '==', 'personal').where('active', '==', true),
  );
  const held = await tx.get(db.collection(`players/${uid}/quests`).select('templateId', 'status'));
  const heldIds = new Set(held.docs.map((d) => d.get('templateId') as string));
  const open = held.docs.filter((d) => d.get('status') === 'active' || d.get('status') === 'submitted').length;
  const pool = templates.docs
    .filter((d) => !heldIds.has(d.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => ({ id: d.id, template: d.data() as QuestTemplate }));
  return { pool, open };
}

/** Active personal templates the player has never held. Reads only; call before any write. */
export async function readFreshTemplates(tx: Txn, db: Db, uid: string): Promise<FreshTemplate[]> {
  return (await readDealing(tx, db, uid)).pool;
}

/**
 * Deals up to `count` active quests from `pool`, picked uniformly with `rng`. Picked templates are
 * removed from the pool so repeated calls in one transaction never duplicate. Returns the new quest ids.
 */
export function dealFrom(
  tx: Txn,
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
      ...(typeof picked.template.points === 'number' ? { points: picked.template.points } : {}),
    });
    ids.push(ref.id);
  }
  return ids;
}

/**
 * Deals one replacement quest, but only while the player's open quests are below `max` (the five
 * slots, settings.starterQuestCount). `dealing.open` must already reflect the quest being replaced.
 * Returns the new quest id, or null when nothing was dealt (full hand or no fresh template left).
 */
export function dealReplacement(
  tx: Txn,
  db: Db,
  now: Date,
  rng: () => number,
  uid: string,
  dealing: Dealing,
  max: number,
): string | null {
  if (dealing.open >= max) return null;
  const [id] = dealFrom(tx, db, now, rng, uid, dealing.pool, 1);
  if (!id) return null;
  dealing.open += 1;
  return id;
}
