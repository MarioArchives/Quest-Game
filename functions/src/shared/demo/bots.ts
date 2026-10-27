// The four demo players and what they did, the newcomer who has only just been let in, plus the small deterministic
// helpers that deal their hands.
import type { Particulars } from '../types.ts';

export interface Bot {
  uid: string;
  name: string;
  /** Quests claimed, then approved by a bot witness; `evidence` is what the player added afterwards
   *  ('photo' = photo + caption, 'caption' = comment only, null = none yet). */
  done: Array<{ evidence: 'photo' | 'caption' | null; caption: string | null; note: string | null }>;
  /** A claim still waiting for its witness. */
  submitted?: { witness: string };
  /** A claim its witness turned down. */
  rejected?: { witness: string; note: string };
  rerolls: number;
  /** Map pin offset from the pack's centre: [lat, lng]. */
  offset: [number, number];
  /** What they told the onboarding (they're all through it). */
  particulars: Particulars;
  /** Which of the pack's booking relations they gave (an index into its list, wrapped), in packs that have one. */
  relationAt: number;
}

export const BOTS: Bot[] = [
  {
    uid: 'demo-maya',
    name: 'Maya',
    done: [
      { evidence: 'photo', caption: 'Found it tucked behind the amps.', note: 'Saw the whole thing. Legend.' },
      { evidence: 'photo', caption: 'Absolutely worth the queue.', note: null },
      { evidence: null, caption: null, note: 'Heard it with my own ears.' },
    ],
    rerolls: 0,
    offset: [0.0003, -0.0007],
    particulars: { heightCm: 168, drink: 'Gin', marks: 'A laugh you can hear across the room' },
    relationAt: 0,
  },
  {
    uid: 'demo-sam',
    name: 'Sam',
    done: [
      { evidence: 'photo', caption: 'Ten out of ten, would repeat.', note: null },
      { evidence: 'caption', caption: 'No photo, but trust me, it happened.', note: 'I was there, it did.' },
    ],
    rerolls: 1,
    offset: [-0.0004, 0.0005],
    particulars: { heightCm: 183, drink: 'Pint', marks: 'Never without his green jacket' },
    relationAt: 3,
  },
  {
    uid: 'demo-priya',
    name: 'Priya',
    done: [
      { evidence: 'photo', caption: 'Everyone was very nice about it.', note: 'Very nice about it, I can confirm.' },
      { evidence: 'photo', caption: 'The crowd loved it.', note: null },
    ],
    submitted: { witness: 'demo-maya' },
    rerolls: 0,
    offset: [0.0008, 0.0004],
    particulars: { heightCm: 160, drink: 'Cocktail', marks: null },
    relationAt: 6,
  },
  {
    uid: 'demo-jonah',
    name: 'Jonah',
    done: [{ evidence: 'photo', caption: 'Easier than expected, honestly.', note: null }],
    rejected: { witness: 'demo-sam', note: 'That was a different band. Try again!' },
    rerolls: 2,
    offset: [-0.0009, -0.0003],
    particulars: { heightCm: 191, drink: 'Soft', marks: 'A scar through his left eyebrow' },
    relationAt: 1,
  },
];

/**
 * Let in a few minutes ago and not through the pack's onboarding yet (`bookedAt` null), with a fresh hand and nothing
 * done: in the mock, sign in as them to try a pack's onboarding.
 */
export const NEWCOMER = { uid: 'demo-alex', name: 'Alex' } as const;

/** Reactions on feed posts: post id -> [voter uid, emoji]. Only applied to posts that get created. */
export const REACTIONS: Record<string, Array<[string, string]>> = {
  'approved-demo-maya-1': [['demo-sam', '🔥'], ['demo-priya', '😍'], ['demo-jonah', '👏']],
  'approved-demo-maya-2': [['demo-priya', '🤘']],
  'approved-demo-sam-1': [['demo-maya', '😂'], ['demo-jonah', '🔥']],
  'approved-demo-priya-1': [['demo-maya', '👏']],
  'rejected-demo-jonah-rejected': [['demo-maya', '😮'], ['demo-priya', '😂']],
  'entry-demo-maya-side': [['demo-priya', '🔥'], ['demo-jonah', '🤘']],
  'entry-demo-sam-side': [['demo-maya', '👏']],
};

/**
 * The same for packs with vote reactions (`reactions: 'votes'`): post id -> [voter uid, 1 (Credible) or -1 (Doubtful)].
 * Only posts that take votes count (never the voter's own); some are left unvoted on purpose.
 */
export const VOTES: Record<string, Array<[string, 1 | -1]>> = {
  // A witness's vote on what they confirmed is dropped (takesVote). Alex's votes give these three a verdict's worth
  // (3), so the demo shows a credible and a doubtful verdict, and Maya paid for agreeing.
  'approved-demo-maya-1': [['demo-sam', 1], ['demo-priya', 1], ['demo-jonah', -1], ['demo-alex', 1]],
  'approved-demo-sam-1': [['demo-maya', 1], ['demo-jonah', 1], ['demo-priya', 1], ['demo-alex', 1]],
  'approved-demo-priya-1': [['demo-maya', -1], ['demo-sam', -1], ['demo-alex', -1]],
  'entry-demo-maya-side': [['demo-priya', 1], ['demo-jonah', 1]],
  'entry-demo-sam-side': [['demo-maya', -1], ['demo-priya', 1]],
};

/** Small deterministic PRNG so the bots always get the same hands. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function shuffled<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A bot's particulars: in a pack with relations the drink gives way to a relation id; otherwise as written. */
export function particularsFor(bot: Bot, relations: ReadonlyArray<{ id: string }> | undefined): Particulars {
  if (!relations?.length) return bot.particulars;
  return { ...bot.particulars, drink: null, relation: relations[bot.relationAt % relations.length].id };
}
