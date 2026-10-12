import { Stamp } from '../shared/store/stamp.js';
import type { Batch } from '../shared/store/types.js';
import type { Feature, Features, AwardCopy } from '../shared/packs/types.js';
import { termForms } from '../shared/packs/terms.js';
import { competitionRanks } from '../shared/ranking.js';
import { rerollAllowance } from '../shared/rerolls.js';
import { VENUE_RADIUS_M } from '../shared/settings.js';
import type {
  Award,
  AwardKey,
  FeedItem,
  FinalStandings,
  GlobalQuest,
  Guess,
  LedgerEntry,
  Player,
  Quest,
  QuestTemplate,
  Standing,
  Submission,
  Venue,
  Wrap,
} from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, loadSettings, loadState, requireGM } from './guards.js';
import { settleOpenQuests } from './voting.js';

export interface PlayerStats {
  uid: string;
  points: number;
  /** Correct guesses made. */
  hits: number;
  guessesMade: number;
  /** Times this player's quests were exposed. */
  exposedCount: number;
  approvedPhotos: number;
  /** Epoch ms of the player's latest approved submission, or null. */
  lastSubmissionAt: number | null;
  sideQuestsWon: number;
  venuesCount: number;
  rerollsUsed: number;
}

interface AwardRule {
  award: Award;
  /** Players who can win this award; the best `metric` among them takes it. */
  metric: (s: PlayerStats) => number | null;
  /** The optional part of the game this award is about; skipped when the pack switches it off. */
  requires?: Feature;
}

// Priority order: earlier awards pick first.
const AWARD_RULES: AwardRule[] = [
  {
    award: { key: 'sharpshooter', title: 'Sharpshooter', description: 'Most secret quests exposed' },
    requires: 'guesses',
    metric: (s) => (s.hits > 0 ? s.hits : null),
  },
  {
    award: { key: 'untouchable', title: 'Untouchable', description: 'Nobody cracked your hand' },
    requires: 'guesses',
    metric: (s) => (s.exposedCount === 0 ? 0 : null),
  },
  {
    award: { key: 'paparazzo', title: 'Paparazzo', description: 'Most approved photos' },
    metric: (s) => (s.approvedPhotos > 0 ? s.approvedPhotos : null),
  },
  {
    award: { key: 'night-owl', title: 'Night Owl', description: 'Last photo of the night' },
    metric: (s) => s.lastSubmissionAt,
  },
  {
    award: { key: 'side-hustler', title: 'Side Hustler', description: 'Side-quest winner' },
    requires: 'sideQuests',
    metric: (s) => (s.sideQuestsWon > 0 ? s.sideQuestsWon : null),
  },
  {
    award: { key: 'globetrotter', title: 'Globetrotter', description: 'Posted from the most venues' },
    requires: 'map',
    metric: (s) => (s.venuesCount > 0 ? s.venuesCount : null),
  },
  {
    award: { key: 'detective', title: 'Detective', description: 'Most guesses made' },
    requires: 'guesses',
    metric: (s) => (s.guessesMade > 0 ? s.guessesMade : null),
  },
  {
    award: { key: 'gambler', title: 'Gambler', description: 'Most rerolls' },
    metric: (s) => (s.rerollsUsed > 0 ? s.rerollsUsed : null),
  },
];

const GOOD_SPORT: Award = { key: 'good-sport', title: 'Good Sport', description: 'Here for the vibes' };

const byUid = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One award per player, assigned in priority order (sharpshooter, untouchable, paparazzo,
 * night-owl, then extras); ties go to higher points, then lower uid; leftovers get good-sport.
 */
export function computeAwards(
  stats: PlayerStats[],
  opts: { features?: Features; copy?: Partial<Record<AwardKey, AwardCopy>> } = {},
): Record<string, Award> {
  const { features, copy = {} } = opts;
  const worded = (award: Award): Award => ({ ...award, ...copy[award.key] });
  const awards = new Map<string, Award>();
  for (const { award, metric, requires } of AWARD_RULES) {
    if (requires && features && !features[requires]) continue;
    const candidates = stats
      .filter((s) => !awards.has(s.uid))
      .flatMap((s) => {
        const m = metric(s);
        return m === null ? [] : [{ s, m }];
      })
      .sort((a, b) => b.m - a.m || b.s.points - a.s.points || byUid(a.s.uid, b.s.uid));
    if (candidates.length > 0) awards.set(candidates[0].s.uid, worded(award));
  }
  return Object.fromEntries(stats.map((s) => [s.uid, awards.get(s.uid) ?? worded(GOOD_SPORT)]));
}

type Doc<T> = T & { id: string };

/** Epoch ms of a Stamp (or Date); 0 when missing. */
function ms(v: unknown): number {
  if (v instanceof Stamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function nearestVenue(venues: Venue[], lat: number, lng: number): Venue | null {
  let best: Venue | null = null;
  let bestDist = VENUE_RADIUS_M;
  for (const v of venues) {
    if (v.lat === null || v.lng === null || v.lat === undefined || v.lng === undefined) continue;
    const d = distanceM(lat, lng, v.lat, v.lng);
    if (d <= bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

const BATCH_LIMIT = 500;

async function commitInBatches(db: Db, ops: Array<(batch: Batch) => void>): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

async function docs<T>(db: Db, path: string): Promise<Array<Doc<T>>> {
  const snap = await db.collection(path).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

/** GM ends the game: freeze standings, close globals, delete locations, write every wrap (players put out get none). */
export async function endGame(db: Db, ctx: Ctx, opts: { venues?: Venue[] } = {}): Promise<{ players: number }> {
  await requireGM(db, ctx);
  const state = await loadState(db);
  if (state.status === 'ended') fail('failed-precondition', 'The game has already ended.');

  // Without the map there are no venues to visit, count or award.
  const venues = ctx.pack.features.map ? (opts.venues ?? ctx.pack.venues) : [];
  const settings = await loadSettings(db);
  const endedAt = Stamp.fromDate(ctx.now);

  // Decide every open side quest first (tally the votes, pay the winners) so the standings include it.
  await settleOpenQuests(db, ctx.now, ctx.pack);

  const [everyone, submissions, guesses, ledger, globals, templates, locations, feed] = await Promise.all([
    docs<Player>(db, 'players'),
    docs<Submission>(db, 'submissions'),
    docs<Guess>(db, 'guesses'),
    docs<LedgerEntry>(db, 'pointsLedger'),
    docs<GlobalQuest>(db, 'globalQuests'),
    docs<QuestTemplate>(db, 'questTemplates'),
    db.collection('locations').listDocuments(),
    docs<FeedItem>(db, 'feed'),
  ]);
  // Players the GM put out of the game get no place in the standings and no wrap; frozen ones keep both.
  const players = everyone.filter((p) => p.left !== 'out');
  const submissionById = new Map(submissions.map((s) => [s.id, s]));
  const questsByUid = new Map(
    await Promise.all(players.map(async (p) => [p.id, await docs<Quest>(db, `players/${p.id}/quests`)] as const)),
  );

  const playerById = new Map(players.map((p) => [p.id, p]));
  const templateTitle = new Map(templates.map((t) => [t.id, t.title]));
  const byTime = <T extends { createdAt?: unknown }>(a: T, b: T) => ms(a.createdAt) - ms(b.createdAt);

  const standings: Standing[] = competitionRanks(
    players.map((p) => ({ uid: p.id, displayName: p.displayName, photoURL: p.photoURL ?? null, points: p.points ?? 0 })),
    (p) => p.points,
  );
  const rankOf = new Map(standings.map((s) => [s.uid, s.rank]));

  // First pass: everything per player except the award, which needs everyone's stats.
  const wraps = new Map<string, Omit<Wrap, 'award'>>();
  const stats: PlayerStats[] = [];

  for (const player of players) {
    const uid = player.id;
    const quests = questsByUid.get(uid) ?? [];
    const questById = new Map(quests.map((q) => [q.id, q]));

    const entries = ledger.filter((l) => l.uid === uid).sort(byTime);
    let running = 0;
    const pointsSeries = [{ t: ms(player.joinedAt), points: 0 }];
    for (const e of entries) {
      running += e.delta;
      pointsSeries.push({ t: ms(e.createdAt), points: running });
    }

    const approved = submissions.filter((s) => s.uid === uid && s.status === 'approved').sort(byTime);
    // Claims no longer carry a photo until the owner adds evidence.
    const photos = approved.filter((s) => s.imagePath);
    const completed = approved
      .filter((s) => s.kind === 'personal')
      .map((s) => ({
        submissionId: s.id,
        title: questById.get(s.questId)?.title ?? s.questTitle ?? '',
        thumbPath: s.thumbPath ?? null,
        imagePath: s.imagePath ?? null,
        caption: s.caption ?? null,
      }));

    const won = globals
      .filter((g) => g.winnerUids?.includes(uid))
      .sort((a, b) => ms(a.startsAt) - ms(b.startsAt))
      .map((g) => ({ globalQuestId: g.id, title: g.title }));

    const hand = quests
      .filter((q) => q.status !== 'replaced')
      .sort((a, b) => ms(a.assignedAt) - ms(b.assignedAt) || byUid(a.id, b.id))
      .map((q) => ({ templateId: q.templateId, title: q.title, description: q.description, status: q.status }));

    const made = guesses.filter((g) => g.guesserUid === uid);
    const hits = made.filter((g) => g.correct).length;
    const exposures = guesses.filter((g) => g.targetUid === uid && g.correct).sort(byTime);
    const exposedBy = exposures.map((g) => ({
      uid: g.guesserUid,
      displayName: playerById.get(g.guesserUid)?.displayName ?? 'Someone',
      title:
        templateTitle.get(g.templateId) ?? quests.find((q) => q.templateId === g.templateId)?.title ?? g.templateId,
    }));

    // The player's most-reacted approved post; ties go to the earliest.
    let top: { sub: Doc<Submission>; reactionCount: number } | null = null;
    const posts = feed
      .filter((f) => f.type === 'approved' && f.uid === uid && f.submissionId)
      .sort(byTime);
    for (const post of posts) {
      const sub = submissionById.get(post.submissionId as string);
      if (!sub || sub.uid !== uid || sub.status !== 'approved') continue;
      const reactionCount = post.reactionCount ?? 0;
      if (!top || reactionCount > top.reactionCount) top = { sub, reactionCount };
    }

    const visited: Venue[] = [];
    for (const s of approved) {
      if (!s.location) continue;
      const v = nearestVenue(venues, s.location.lat, s.location.lng);
      if (v && !visited.some((x) => x.id === v.id)) visited.push(v);
    }

    const lastSubmissionAt = photos.length > 0 ? ms(photos[photos.length - 1].createdAt) : null;
    stats.push({
      uid,
      points: player.points ?? 0,
      hits,
      guessesMade: made.length,
      exposedCount: exposures.length,
      approvedPhotos: photos.length,
      lastSubmissionAt,
      sideQuestsWon: won.length,
      venuesCount: visited.length,
      rerollsUsed: player.rerollsUsed ?? 0,
    });

    wraps.set(uid, {
      uid,
      displayName: player.displayName,
      photoURL: player.photoURL ?? null,
      rank: rankOf.get(uid) ?? standings.length,
      points: player.points ?? 0,
      playerCount: players.length,
      pointsSeries,
      completed,
      sideQuestsWon: won,
      hand,
      guessStats: { made: made.length, hits, pointsTaken: hits * settings.exposePenalty },
      exposedBy,
      topPhoto: top && {
        submissionId: top.sub.id,
        thumbPath: top.sub.thumbPath ?? null,
        imagePath: top.sub.imagePath ?? null,
        caption: top.sub.caption ?? null,
        reactionCount: top.reactionCount,
      },
      venues: visited.map((v) => ({ id: v.id, name: v.name })),
      rerollsUsed: player.rerollsUsed ?? 0,
      rerollAllowance: rerollAllowance(settings.rerollLimit, player),
    });
  }

  const awards = computeAwards(stats, { features: ctx.pack.features, copy: ctx.pack.awards });

  const final: FinalStandings = { standings, endedAt };
  const ops: Array<(batch: Batch) => void> = [];
  for (const [uid, wrap] of wraps) {
    const doc: Wrap = { ...wrap, award: awards[uid] };
    ops.push((b) => b.set(db.doc(`wraps/${uid}`), doc));
  }
  ops.push((b) => b.set(db.doc('game/final'), final));
  for (const ref of locations) ops.push((b) => b.delete(ref));
  await commitInBatches(db, ops);

  // The state flip goes last so a failure part-way leaves the game un-ended and endGame can be retried.
  await commitInBatches(db, [
    (b) => b.set(db.doc('game/state'), { status: 'ended', endedAt }, { merge: true }),
    (b) =>
      b.set(db.collection('feed').doc(), {
        type: 'status',
        text: `Game over! ${termForms(ctx.pack.terms).wrap.Many} are ready.`,
        uid: null,
        ref: null,
        reactionCount: 0,
        createdAt: endedAt,
      }),
  ]);

  return { players: players.length };
}
