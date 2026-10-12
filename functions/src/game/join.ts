import type { JoinRequest, Settings } from '../shared/types.js';
import { DISPLAY_NAME_MAX } from '../shared/settings.js';
import type { Txn } from '../shared/store/types.js';
import type { Ctx, Db } from './context.js';
import { GM_CONSOLE, type PushPlan } from './push.js';
import { dealFrom, readFreshTemplates, type FreshTemplate } from './deal.js';
import { addFeed } from './feed.js';
import { fail, isGM, loadSettings, loadState, requireGM, requireUid } from './guards.js';
import { asId, isId, toTs } from './util.js';

export interface RequestJoinInput {
  displayName?: unknown;
  photoURL?: unknown;
}

const PHOTO_URL_MAX = 2048;

/** What admitting a player needs from the database. Reads only: call before any write. */
async function readAdmission(
  tx: Txn,
  db: Db,
  uid: string,
): Promise<{ settings: Settings; pool: FreshTemplate[] }> {
  const settings = await loadSettings(db, tx);
  const pool = await readFreshTemplates(tx, db, uid);
  return { settings, pool };
}

/** Makes someone a player: the player doc, the starter hand and the join post. Writes only. */
function admitPlayer(
  tx: Txn,
  db: Db,
  now: Date,
  rng: () => number,
  uid: string,
  who: { displayName: string; photoURL: string | null },
  admission: { settings: Settings; pool: FreshTemplate[] },
): void {
  tx.create(db.doc(`players/${uid}`), {
    displayName: who.displayName,
    photoURL: who.photoURL,
    joinedAt: toTs(now),
    points: 0,
    rerollsUsed: 0,
    questsCompleted: 0,
  });
  dealFrom(tx, db, now, rng, uid, admission.pool, admission.settings.starterQuestCount);
  addFeed(tx, db, now, {
    type: 'join',
    text: `${who.displayName} joined the game`,
    uid,
    ref: null,
    photoURL: who.photoURL,
  });
}

/**
 * Anyone signed in may ask to join; a GM must approve before they become a player. GMs never need
 * approval: a GM's request makes them a player at once.
 */
export async function requestJoin(
  db: Db,
  ctx: Ctx,
  data: RequestJoinInput,
): Promise<{ status: 'pending' | 'already-player' | 'approved' }> {
  const uid = requireUid(ctx);
  const rng = ctx.rng ?? Math.random;

  if (typeof data.displayName !== 'string') fail('invalid-argument', 'Enter a display name.');
  const displayName = data.displayName.trim();
  if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX) {
    fail('invalid-argument', `Display name must be 1 to ${DISPLAY_NAME_MAX} characters.`);
  }
  let photoURL: string | null = null;
  if (data.photoURL !== undefined && data.photoURL !== null) {
    if (typeof data.photoURL !== 'string' || data.photoURL.length > PHOTO_URL_MAX) {
      fail('invalid-argument', 'Invalid photo URL.');
    }
    photoURL = data.photoURL || null;
  }

  return db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    const playerSnap = await tx.get(db.doc(`players/${uid}`));
    const reqRef = db.doc(`joinRequests/${uid}`);
    const reqSnap = await tx.get(reqRef);

    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    if (playerSnap.exists) return { status: 'already-player' as const };

    const existing = reqSnap.data() as Partial<JoinRequest> | undefined;
    const now = toTs(ctx.now);

    if (await isGM(db, uid, tx)) {
      const admission = await readAdmission(tx, db, uid);
      tx.set(reqRef, {
        uid,
        displayName,
        photoURL,
        email: ctx.email ?? null,
        status: 'approved',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        reviewedBy: uid,
        reviewedAt: now,
      });
      admitPlayer(tx, db, ctx.now, rng, uid, { displayName, photoURL }, admission);
      return { status: 'approved' as const };
    }

    if (existing?.status === 'rejected') fail('permission-denied', 'Your request to join was declined.');

    tx.set(reqRef, {
      uid,
      displayName,
      photoURL,
      email: ctx.email ?? null,
      status: 'pending',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return { status: 'pending' as const };
  });
}

/** GM approves (creates the player and deals the starter hand) or rejects a join request. */
export async function reviewJoinRequest(
  db: Db,
  ctx: Ctx,
  data: { uid?: unknown; approve?: unknown },
): Promise<{ status: 'approved' | 'rejected' }> {
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    const by = await requireGM(db, ctx, tx);
    const uid = asId(data.uid, 'uid');
    if (typeof data.approve !== 'boolean') fail('invalid-argument', 'approve must be true or false.');

    const reqRef = db.doc(`joinRequests/${uid}`);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) fail('not-found', 'No join request from that user.');
    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');

    const now = toTs(ctx.now);
    const review = { reviewedBy: by, reviewedAt: now };

    if (!data.approve) {
      tx.update(reqRef, { status: 'rejected', ...review });
      return { status: 'rejected' as const };
    }

    const playerRef = db.doc(`players/${uid}`);
    if ((await tx.get(playerRef)).exists) {
      // Already a player (approved earlier): no second hand, no second announcement.
      tx.update(reqRef, { status: 'approved', ...review });
      return { status: 'approved' as const };
    }

    const admission = await readAdmission(tx, db, uid);
    const req = reqSnap.data() as JoinRequest;
    admitPlayer(tx, db, ctx.now, rng, uid, { displayName: req.displayName, photoURL: req.photoURL ?? null }, admission);
    tx.update(reqRef, { status: 'approved', ...review });
    return { status: 'approved' as const };
  });
}

/**
 * Firestore onCreate for admins/{uid}: GMs never need approval, so a user who is made GM while their
 * join request is pending (or was rejected) becomes a player at once. No-op otherwise; idempotent.
 */
export async function handleAdminCreated(
  db: Db,
  uid: string,
  now: Date,
  rng: () => number = Math.random,
): Promise<void> {
  if (!isId(uid)) return;
  await db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    const playerSnap = await tx.get(db.doc(`players/${uid}`));
    const reqRef = db.doc(`joinRequests/${uid}`);
    const reqSnap = await tx.get(reqRef);
    if (state.status === 'ended' || playerSnap.exists || !reqSnap.exists) return;
    const req = reqSnap.data() as JoinRequest;
    if (req.status !== 'pending' && req.status !== 'rejected') return;

    const admission = await readAdmission(tx, db, uid);
    admitPlayer(tx, db, now, rng, uid, { displayName: req.displayName, photoURL: req.photoURL ?? null }, admission);
    tx.update(reqRef, { status: 'approved', reviewedBy: uid, reviewedAt: toTs(now) });
  });
}

/** Firestore onCreate for joinRequests/{uid}: a new pending request tells the GMs. Quiet for GMs (approved at once). */
export async function handleJoinRequestCreated(db: Db, uid: string): Promise<PushPlan | null> {
  const snap = await db.doc(`joinRequests/${uid}`).get();
  if (!snap.exists || snap.get('status') !== 'pending') return null;
  const name = (snap.get('displayName') as string | undefined) ?? 'Someone';
  return { to: 'gms', message: { title: 'Join request', body: `${name} asked to join`, link: GM_CONSOLE } };
}
