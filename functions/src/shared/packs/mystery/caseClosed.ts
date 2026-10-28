// The case file: what the mystery pack's closing hook works out once, as the GM closes the case, for the desk the
// app draws (src/packs/mystery/caseClosed/). The verdict (who the incriminating photos point at), the night's
// awards, every points line and the time of death as an instant. Stored as game/final.closing, so players read the
// sums of what they can't read themselves (frames, motive authors, police calls) but never who framed whom. Pure.
import { TOP_FEED_TYPES } from '../../feedVotes.ts';
import { standingOf } from '../../standing.ts';
import type { LedgerReason } from '../../types.ts';
import type { ClosingInput } from '../types.ts';

/** The story missions and the fact the case file reads (quests.json). */
export const CASE_STORY = {
  incriminating: 's-incriminating',
  alibi: 's-alibi',
  weapon: 's-weapon',
  scene: 's-scene',
  oldDays: 's-old-days',
} as const;
export const DEATH_FACT = 'timeOfDeath';

/** Every award, in the order the profile and the honours list print them. */
export const AWARD_IDS = [
  'murderer',
  'innocent',
  'called',
  'unresponsive',
  'popular',
  'snitch',
  'hustler',
  'disliked',
  'puppet',
  'sidepiece',
  'champion',
  'spoon',
  'early',
  'brink',
  'sharp',
  'alibi',
  'pen',
  'untouchable',
  'fallguy',
  'weapon',
  'scout',
  'farewell',
  'lastseen',
  'present',
  'loyal',
  'pet',
] as const;
export type AwardId = (typeof AWARD_IDS)[number];

/** An award and everyone who won it (ties all win), with the numbers its words need, per winner. */
export interface CaseAward {
  id: AwardId;
  uids: string[];
  n: Record<string, Record<string, number>>;
}

/**
 * The verdict: votes on the incriminating photos (the damning votes in a yes/no vote) summed per player they tag.
 * `uids` is everyone on the most, with at least one vote: one is the killer, several are accomplices, none leaves the
 * case open (also when the vote never opened, so nothing was revealed).
 */
export interface CaseVerdict {
  opened: boolean;
  tally: Record<string, number>;
  /** How many revealed photos tag each player. */
  photos: Record<string, number>;
  uids: string[];
  /** Who wrote the motive filed against each of them, where a player did. */
  motiveBy: Record<string, string>;
}

/** One points line: who, when, how much and why; the GM's note only on their own adjustments. */
export interface CaseLine {
  uid: string;
  t: number;
  delta: number;
  reason: LedgerReason;
  note: string | null;
}

export type CaseFile = {
  verdict: CaseVerdict;
  awards: CaseAward[];
  timeline: CaseLine[];
  /** The time of death as an instant on the night, when the story fixed one. */
  deathAt: number | null;
};

const DAY = 24 * 60 * 60 * 1000;

/** How far the zone's wall clock runs ahead of UTC at `at`, in ms. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(at / 1000) * 1000;
}

/** The last time the zone's clock read "HH:MM" at or before `to`, if that was not before `from`; null otherwise. */
export function clockInstant(hhmm: string, from: number, to: number, timeZone: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  let best: number | null = null;
  for (let back = 0; back <= 2; back++) {
    const day = new Date(to - back * DAY + zoneOffset(to - back * DAY, timeZone));
    const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Number(m[1]), Number(m[2]));
    const at = wall - zoneOffset(wall - zoneOffset(wall, timeZone), timeZone);
    if (at <= to && (best === null || at > best)) best = at;
  }
  return best !== null && best >= from ? best : null;
}

/** Everyone on the most, if that is at least `min`; in `order`. */
function most(values: Map<string, number>, order: string[], min = 1): string[] {
  let best = -Infinity;
  for (const v of values.values()) best = Math.max(best, v);
  if (best < min) return [];
  return order.filter((uid) => values.get(uid) === best);
}

function count<T>(items: T[], key: (item: T) => string | null, keep: (item: T) => boolean = () => true): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k !== null && keep(item)) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** The latest fired story mission with this id, if any. */
function story(night: ClosingInput, storyId: string) {
  return night.globals.filter((g) => g.storyId === storyId).sort((a, b) => b.startsAt - a.startsAt)[0] ?? null;
}

/** The votes an entry got: the damning (yes) votes in a yes/no vote, else its count. */
function votesOf(g: ClosingInput['globals'][number], submissionId: string): number {
  return Math.max(0, g.yesNo?.[submissionId]?.yes ?? g.tally?.[submissionId] ?? 0);
}

export function verdictOf(night: ClosingInput): CaseVerdict {
  const order = night.players.map((p) => p.uid);
  const inGame = new Set(order);
  const inc = story(night, CASE_STORY.incriminating);
  const opened = Boolean(inc && inc.status === 'closed' && inc.tally);
  const tally = new Map<string, number>();
  const photos: Record<string, number> = {};
  if (inc && opened) {
    for (const s of night.submissions) {
      if (s.questId !== inc.id || s.status !== 'approved' || s.checked === 'rejected') continue;
      if (!s.taggedUid || !inGame.has(s.taggedUid)) continue;
      tally.set(s.taggedUid, (tally.get(s.taggedUid) ?? 0) + votesOf(inc, s.id));
      photos[s.taggedUid] = (photos[s.taggedUid] ?? 0) + 1;
    }
  }
  const uids = most(tally, order);
  const motiveBy: Record<string, string> = {};
  for (const uid of uids) {
    const by = night.motives.find((m) => m.uid === uid)?.byUid;
    if (by && inGame.has(by) && by !== uid) motiveBy[uid] = by;
  }
  return { opened, tally: Object.fromEntries(tally), photos, uids, motiveBy };
}

/** Everyone's points after each moment something changed, oldest first. */
function steps(night: ClosingInput): Array<{ t: number; points: Map<string, number> }> {
  const points = new Map(night.players.map((p) => [p.uid, 0]));
  const out: Array<{ t: number; points: Map<string, number> }> = [];
  const lines = [...night.ledger].sort((a, b) => a.t - b.t);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (points.has(l.uid)) points.set(l.uid, (points.get(l.uid) ?? 0) + l.delta);
    if (i === lines.length - 1 || lines[i + 1].t !== l.t) out.push({ t: l.t, points: new Map(points) });
  }
  return out;
}

export function awardsOf(night: ClosingInput, verdict: CaseVerdict, deathAt: number | null): CaseAward[] {
  const order = night.players.map((p) => p.uid);
  const inGame = new Set(order);
  const awards: CaseAward[] = [];
  const give = (id: AwardId, uids: string[], n: (uid: string) => Record<string, number> = () => ({})) => {
    const winners = order.filter((uid) => uids.includes(uid));
    if (winners.length) awards.push({ id, uids: winners, n: Object.fromEntries(winners.map((uid) => [uid, n(uid)])) });
  };
  const byPlayer = <T extends { uid: string }>(items: T[]) => items.filter((i) => inGame.has(i.uid));
  const ledger = byPlayer(night.ledger);
  const lines = (uid: string, reason: LedgerReason) => ledger.filter((l) => l.uid === uid && l.reason === reason);
  const sum = (uid: string, keep: (l: (typeof ledger)[number]) => boolean) =>
    ledger.filter((l) => l.uid === uid && keep(l)).reduce((a, l) => a + l.delta, 0);
  const final = new Map(night.players.map((p) => [p.uid, p.points]));
  const rank = new Map(night.players.map((p) => [p.uid, p.rank]));
  const lastRank = Math.max(0, ...night.players.map((p) => p.rank));
  const timeline = steps(night);

  // The verdict and the motives behind it.
  give('murderer', verdict.uids, (uid) => ({ votes: verdict.tally[uid] ?? 0, photos: verdict.photos[uid] ?? 0 }));
  if (verdict.uids.length) {
    const rest = new Map(Object.entries(verdict.tally).filter(([uid]) => !verdict.uids.includes(uid)));
    give('innocent', most(rest, order), (uid) => ({ votes: verdict.tally[uid] ?? 0 }));
  }

  // The police.
  const calls = night.policeCalls.filter((c) => inGame.has(c.uid) && ['passed', 'failed', 'missed'].includes(c.status));
  const callsOf = (uid: string, status?: string) => calls.filter((c) => c.uid === uid && (!status || c.status === status)).length;
  give('called', most(count(calls, (c) => c.uid), order, 2), (uid) => ({
    calls: callsOf(uid),
    passed: callsOf(uid, 'passed'),
    failed: callsOf(uid, 'failed'),
    missed: callsOf(uid, 'missed'),
  }));
  const rollMissed = (uid: string) => night.checkins.filter((c) => c.missedUids.includes(uid)).length;
  const silence = new Map(order.map((uid) => [uid, callsOf(uid, 'missed') + rollMissed(uid) + lines(uid, 'skipped').length]));
  give('unresponsive', most(silence, order), (uid) => ({
    police: callsOf(uid, 'missed'),
    rollCalls: rollMissed(uid),
    skipped: lines(uid, 'skipped').length,
  }));

  // The log book.
  const top = night.top?.uid && inGame.has(night.top.uid) ? night.top : null;
  if (top?.uid) give('popular', [top.uid], () => ({ up: top.up, down: top.down }));

  const tips = night.policeCalls.filter((c) => c.kind === 'tip' && c.byUid && inGame.has(c.byUid));
  give('snitch', most(count(tips, (c) => c.byUid), order), (uid) => ({
    tips: tips.filter((c) => c.byUid === uid).length,
    landed: tips.filter((c) => c.byUid === uid && (c.status === 'failed' || c.status === 'missed')).length,
  }));

  const earned = new Map(order.map((uid) => [uid, sum(uid, (l) => l.delta > 0)]));
  give('hustler', most(earned, order), (uid) => ({ earned: earned.get(uid) ?? 0, lost: 0 - sum(uid, (l) => l.delta < 0) }));

  const own = night.feed.filter((f) => f.uid && inGame.has(f.uid) && (TOP_FEED_TYPES as readonly string[]).includes(f.type));
  const doubtful = new Map<string, number>();
  for (const f of own) doubtful.set(f.uid as string, (doubtful.get(f.uid as string) ?? 0) + f.down);
  give('disliked', most(doubtful, order), (uid) => ({
    doubtful: doubtful.get(uid) ?? 0,
    posts: own.filter((f) => f.uid === uid && f.down > 0).length,
  }));

  // Frames: only ever counts. Who framed whom stays in rewards.
  const frames = night.rewards.filter((r) => r.status === 'framed' && inGame.has(r.uid));
  give('puppet', most(count(frames, (r) => r.uid), order), (uid) => ({ frames: frames.filter((r) => r.uid === uid).length }));

  give('sidepiece', night.players.filter((p) => p.relation === 'sidepiece').map((p) => p.uid));

  // The table.
  if (night.players.length) {
    give('champion', order.filter((uid) => rank.get(uid) === 1), (uid) => {
      const below = night.players.filter((p) => p.rank > 1).map((p) => p.points);
      return { points: final.get(uid) ?? 0, lead: below.length ? (final.get(uid) ?? 0) - Math.max(...below) : 0 };
    });
  }
  if (lastRank > 1) give('spoon', order.filter((uid) => rank.get(uid) === lastRank), (uid) => ({ points: final.get(uid) ?? 0 }));

  // Led (on more than nothing) at some moment, and bottom at the close.
  const peak = new Map<string, { points: number; t: number }>();
  for (const s of timeline) {
    const best = Math.max(...s.points.values());
    if (best <= 0) continue;
    for (const [uid, v] of s.points) if (v === best && v > (peak.get(uid)?.points ?? -Infinity)) peak.set(uid, { points: v, t: s.t });
  }
  if (night.players.length >= 3 && lastRank > 1) {
    give(
      'early',
      order.filter((uid) => rank.get(uid) === lastRank && peak.has(uid)),
      (uid) => ({ peak: peak.get(uid)?.points ?? 0, at: peak.get(uid)?.t ?? 0, lost: (peak.get(uid)?.points ?? 0) - (final.get(uid) ?? 0) }),
    );
  }

  // A person of interest at some moment, and a trusted confidant at the close.
  const low = new Map<string, { points: number; t: number }>();
  for (const s of timeline) {
    for (const [uid, v] of s.points) if (standingOf(v, night.settings) === 'poi' && v < (low.get(uid)?.points ?? Infinity)) low.set(uid, { points: v, t: s.t });
  }
  give(
    'brink',
    order.filter((uid) => low.has(uid) && standingOf(final.get(uid) ?? 0, night.settings) === 'confidant'),
    (uid) => ({ low: low.get(uid)?.points ?? 0, at: low.get(uid)?.t ?? 0, points: final.get(uid) ?? 0 }),
  );

  // Charges.
  const upheld = night.guesses.filter((g) => g.correct && inGame.has(g.guesserUid));
  give('sharp', most(count(upheld, (g) => g.guesserUid), order), (uid) => ({
    upheld: upheld.filter((g) => g.guesserUid === uid).length,
    made: night.guesses.filter((g) => g.guesserUid === uid).length,
  }));

  // The story's winners.
  const winners = (storyId: string, id: AwardId) => {
    const g = story(night, storyId);
    if (!g || g.status !== 'closed') return;
    give(id, g.winnerUids, (uid) => {
      const subs = g.winningSubmissionIds.filter((sid) => night.submissions.find((s) => s.id === sid)?.uid === uid);
      return { votes: Math.max(0, ...subs.map((sid) => votesOf(g, sid))) };
    });
  };
  winners(CASE_STORY.alibi, 'alibi');

  give('pen', [...new Set(Object.values(verdict.motiveBy))]);

  const missions = count(night.submissions, (s) => s.uid, (s) => s.kind === 'personal' && s.status === 'approved');
  const exposed = new Set(night.guesses.filter((g) => g.correct).map((g) => g.targetUid));
  const framed = count(ledger, (l) => l.uid, (l) => l.reason === 'framed');
  give(
    'untouchable',
    order.filter((uid) => (missions.get(uid) ?? 0) >= 2 && !exposed.has(uid) && !framed.has(uid)),
    (uid) => ({ missions: missions.get(uid) ?? 0 }),
  );
  give('fallguy', most(framed, order, 2), (uid) => ({ framed: framed.get(uid) ?? 0 }));

  winners(CASE_STORY.weapon, 'weapon');
  winners(CASE_STORY.scene, 'scout');
  winners(CASE_STORY.oldDays, 'farewell');

  // Roll calls: the last answer before the time of death, and everyone who answered every one.
  if (deathAt !== null) {
    const before = night.checkins.flatMap((c) => c.answers).filter((a) => a.t <= deathAt && inGame.has(a.uid));
    const last = Math.max(-Infinity, ...before.map((a) => a.t));
    give('lastseen', before.filter((a) => a.t === last).map((a) => a.uid), () => ({ at: last }));
  }
  const player = new Map(night.players.map((p) => [p.uid, p]));
  const closed = night.checkins.filter((c) => c.status === 'closed');
  const held = (uid: string) => {
    const from = player.get(uid)?.bookedAt ?? player.get(uid)?.joinedAt ?? 0;
    return closed.filter((c) => c.startsAt >= from);
  };
  give(
    'present',
    order.filter((uid) => held(uid).length > 0 && held(uid).every((c) => c.answers.some((a) => a.uid === uid))),
    (uid) => ({ answered: held(uid).length }),
  );

  // Every story mission that took entries, entered.
  const takingEntries = night.globals.filter((g) => g.storyId && g.kind === 'mission' && g.status === 'closed');
  const ran = (uid: string) => takingEntries.filter((g) => g.startsAt >= (player.get(uid)?.joinedAt ?? 0));
  give(
    'loyal',
    order.filter((uid) => ran(uid).length > 0 && ran(uid).every((g) => night.submissions.some((s) => s.questId === g.id && s.uid === uid))),
    (uid) => ({ missions: ran(uid).length }),
  );

  const bonus = new Map(order.map((uid) => [uid, sum(uid, (l) => l.reason === 'adjust' && l.delta > 0)]));
  give('pet', most(bonus, order), (uid) => ({ points: bonus.get(uid) ?? 0 }));

  const at = (id: AwardId) => AWARD_IDS.indexOf(id);
  return awards.sort((a, b) => at(a.id) - at(b.id));
}

/** The mystery pack's closing hook. */
export function closeCase(night: ClosingInput): CaseFile {
  const verdict = verdictOf(night);
  const death = night.facts.find((f) => f.key === DEATH_FACT)?.value ?? null;
  const from = night.startedAt ?? night.endedAt - DAY;
  const deathAt = death ? clockInstant(death, from, night.endedAt, night.timeZone) : null;
  const inGame = new Set(night.players.map((p) => p.uid));
  const timeline = night.ledger
    .filter((l) => inGame.has(l.uid))
    .sort((a, b) => a.t - b.t)
    .map((l) => ({ uid: l.uid, t: l.t, delta: l.delta, reason: l.reason, note: l.reason === 'adjust' ? l.note : null }));
  return { verdict, awards: awardsOf(night, verdict, deathAt), timeline, deathAt };
}
