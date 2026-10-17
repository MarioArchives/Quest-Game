// Push notifications (Web Push through FCM): who hears about what, the device tokens, and sending.
// Messages are data-only; the service worker (public/push-sw.js) shows them and opens the link on tap.
import { getPack } from '../shared/packs/index.js';
import { sha256Hex } from '../shared/store/sha256.js';
import { termForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import type { FeedItem, SubmissionKind } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, isGM, requireUid } from './guards.js';
import { toTs } from './util.js';

/** What a notification says, and the in-app hash route a tap opens (e.g. '#/account'). */
export interface PushMessage {
  title: string;
  body: string;
  link: string;
}

/** Who a push goes to: every player, every GM, or the listed players; `exclude` (the actor) never gets it. */
export interface PushPlan {
  to: 'players' | 'gms' | string[];
  exclude?: string | null;
  message: PushMessage;
}

/** One FCM answer per token, in order: ok, or the FCM error code. */
export interface PushResult {
  ok: boolean;
  code?: string;
}

/** Sends one batch of messages. Injected so tests (and the emulators) never call FCM. */
export interface PushSender {
  send(batch: Array<{ token: string; message: PushMessage }>): Promise<PushResult[]>;
}

/** FCM error codes that mean a token will never work again (uninstalled, permission revoked, ...). */
export const DEAD_TOKEN_CODES: readonly string[] = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

export const PUSH_TOKEN_MAX = 4096;

const HOME = '#/';
const ACCOUNT = '#/account';
const MAP = '#/map';
export const GM_CONSOLE = '#/gm';

/** pushTokens/{id}: a stable, path-safe id for a device token. */
export function pushTokenId(token: string): string {
  return sha256Hex(token);
}

/** Who hears about a feed post and what they read; null = no push. `submissionKind`: the post's submission's kind. */
export function pushFor(post: FeedItem, submissionKind?: SubmissionKind | null, pack: GamePack = getPack()): PushPlan | null {
  const t = termForms(pack.terms);
  const quest = post.questTitle ?? '';
  switch (post.type) {
    case 'global-open':
      return { to: 'players', message: { title: `New ${t.sideQuest.one}`, body: `New ${t.sideQuest.one}: ${quest}`, link: HOME } };
    case 'checkin-open':
      // Everyone has to answer this one, so everyone hears about it.
      // The post reads "Roll call: Show us what you're drinking".
      return { to: 'players', message: { title: 'Answer now', body: post.text, link: HOME } };
    case 'checking':
      // Entries closed: the GMs check them before the vote (players hear when voting opens).
      return { to: 'gms', exclude: post.actorUid ?? null, message: { title: 'Entries to check', body: `Check the entries for ${quest}`, link: GM_CONSOLE } };
    case 'voting-open':
      return { to: 'players', message: { title: 'Voting is open', body: `Vote now: ${quest}`, link: HOME } };
    case 'global-won':
      return { to: 'players', message: { title: `${t.sideQuest.One} won`, body: post.text, link: HOME } };
    case 'global-scored':
      // A mission judged by submission was scored: the post sums up who entered and who was fastest.
      return { to: 'players', message: { title: `${t.sideQuest.One} scored`, body: post.text, link: HOME } };
    case 'standing':
      if (!post.uid) return null;
      return { to: [post.uid], message: { title: 'Your standing changed', body: post.text, link: HOME } };
    case 'police-call':
    case 'police-tip':
      // Only the player being checked hears about it; the answer box is on Home.
      if (!post.uid) return null;
      return { to: [post.uid], message: { title: `${t.policeCall.One}: answer now`, body: post.text, link: HOME } };
    case 'announcement':
      return { to: 'players', message: { title: 'Announcement', body: post.text, link: HOME } };
    case 'stop-revealed':
      return { to: 'players', exclude: post.actorUid ?? null, message: { title: 'New location', body: post.text, link: MAP } };
    case 'status':
      return { to: 'players', message: { title: pack.name, body: post.text, link: HOME } };
    case 'approved':
      // A side-quest entry is hidden until voting, so its "entered" post stays quiet.
      if (submissionKind === 'global' || !post.uid) return null;
      return { to: [post.uid], exclude: post.actorUid ?? null, message: { title: `${t.claim.One} approved`, body: post.text, link: ACCOUNT } };
    case 'rejected':
      if (!post.uid) return null;
      return { to: [post.uid], exclude: post.actorUid ?? null, message: { title: `${t.claim.One} rejected`, body: post.text, link: ACCOUNT } };
    case 'fraud':
      if (!post.uid) return null;
      return { to: [post.uid], exclude: post.actorUid ?? null, message: { title: 'Fraud override', body: post.text, link: ACCOUNT } };
    case 'exposed':
      if (!post.uid) return null;
      return { to: [post.uid], exclude: post.actorUid ?? null, message: { title: `Your ${t.quest.one} was exposed`, body: post.text, link: ACCOUNT } };
    case 'framed':
      // Anonymous: the post has no actor, so nobody is excluded and nobody is named.
      if (!post.uid) return null;
      return { to: [post.uid], message: { title: 'You were framed', body: post.text, link: ACCOUNT } };
    case 'adjust':
      if (!post.uid) return null;
      return { to: [post.uid], exclude: post.actorUid ?? null, message: { title: 'Points changed', body: post.text, link: ACCOUNT } };
    default:
      // join, and anything else that is not worth a buzz.
      return null;
  }
}

const IN_QUERY_MAX = 30;

const chunks = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** The uids a plan is addressed to, minus the excluded actor. */
async function recipientsOf(db: Db, plan: PushPlan): Promise<string[]> {
  let uids: string[];
  if (plan.to === 'players') {
    // Players the GM marked as left hear nothing more from the game.
    uids = (await db.collection('players').get()).docs.filter((d) => !d.get('left')).map((d) => d.id);
  } else if (plan.to === 'gms') {
    uids = (await db.collection('admins').get()).docs.map((d) => d.id);
  } else {
    uids = [...plan.to];
  }
  return uids.filter((uid) => uid !== plan.exclude);
}

/** Sends a plan to every device of its recipients and deletes dead tokens. Never throws. */
export async function sendPush(db: Db, sender: PushSender, plan: PushPlan): Promise<{ sent: number; pruned: number }> {
  const uids = await recipientsOf(db, plan);
  if (uids.length === 0) return { sent: 0, pruned: 0 };

  const tokens: Array<{ id: string; token: string }> = [];
  for (const batch of chunks(uids, IN_QUERY_MAX)) {
    const snap = await db.collection('pushTokens').where('uid', 'in', batch).get();
    for (const d of snap.docs) tokens.push({ id: d.id, token: d.get('token') as string });
  }
  if (tokens.length === 0) return { sent: 0, pruned: 0 };

  let results: PushResult[];
  try {
    results = await sender.send(tokens.map(({ token }) => ({ token, message: plan.message })));
  } catch {
    // A broken FCM call must not break the game action that triggered it; the tokens are kept.
    return { sent: 0, pruned: 0 };
  }

  let sent = 0;
  let pruned = 0;
  for (let i = 0; i < tokens.length; i++) {
    const result = results[i];
    if (result?.ok) {
      sent++;
    } else if (result?.code && DEAD_TOKEN_CODES.includes(result.code)) {
      await db.doc(`pushTokens/${tokens[i].id}`).delete();
      pruned++;
    }
  }
  return { sent, pruned };
}

/** Who hears about feed/{id} and what they read; null = no push (or the post is gone). */
export async function planForFeed(db: Db, feedId: string, pack: GamePack = getPack()): Promise<PushPlan | null> {
  const snap = await db.doc(`feed/${feedId}`).get();
  if (!snap.exists) return null;
  const post = snap.data() as FeedItem;
  let submissionKind: SubmissionKind | null = null;
  if (post.submissionId) {
    const sub = await db.doc(`submissions/${post.submissionId}`).get();
    submissionKind = (sub.get('kind') as SubmissionKind | undefined) ?? null;
  }
  return pushFor(post, submissionKind, pack);
}

/** Feed onCreate: work out who hears about the post, then send it. */
export async function handleFeedCreated(
  db: Db,
  sender: PushSender,
  feedId: string,
  pack: GamePack = getPack(),
): Promise<{ sent: number; pruned: number }> {
  const plan = await planForFeed(db, feedId, pack);
  return plan ? sendPush(db, sender, plan) : { sent: 0, pruned: 0 };
}

/** Callable: a player or GM registers this device. A token saved by someone else moves to the caller. */
export async function savePushToken(db: Db, ctx: Ctx, data: { token?: unknown }): Promise<{ ok: true }> {
  const uid = requireUid(ctx);
  const token = data.token;
  if (typeof token !== 'string' || token.length < 1 || token.length > PUSH_TOKEN_MAX) {
    fail('invalid-argument', 'Invalid notification token.');
  }
  const isPlayer = (await db.doc(`players/${uid}`).get()).exists;
  if (!isPlayer && !(await isGM(db, uid))) fail('permission-denied', 'Only players can do that.');

  const now = toTs(ctx.now);
  const ref = db.doc(`pushTokens/${pushTokenId(token)}`);
  const existing = await ref.get();
  // The same device re-registering (tokens are refreshed on every app start) keeps its first-seen time.
  const createdAt = existing.exists && existing.get('uid') === uid ? existing.get('createdAt') : now;
  await ref.set({ uid, token, createdAt, updatedAt: now });
  return { ok: true };
}

/** Callable: the caller forgets this device. Only their own token is removed. */
export async function removePushToken(db: Db, ctx: Ctx, data: { token?: unknown }): Promise<{ ok: true }> {
  const uid = requireUid(ctx);
  if (typeof data.token !== 'string' || data.token.length < 1 || data.token.length > PUSH_TOKEN_MAX) return { ok: true };
  const ref = db.doc(`pushTokens/${pushTokenId(data.token)}`);
  const snap = await ref.get();
  if (snap.exists && snap.get('uid') === uid) await ref.delete();
  return { ok: true };
}

/** The sender for this environment: one that only logs in the emulators, otherwise the injected FCM sender. */
export function makeSender(opts: { emulator: boolean; log(line: string): void; fcm?: PushSender }): PushSender {
  if (opts.emulator || !opts.fcm) {
    return {
      async send(batch) {
        for (const { token, message } of batch) opts.log(`push to ${token.slice(0, 12)}…: ${message.title} — ${message.body} (${message.link})`);
        return batch.map(() => ({ ok: true }));
      },
    };
  }
  return opts.fcm;
}
