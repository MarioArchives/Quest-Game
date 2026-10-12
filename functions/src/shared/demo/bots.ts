// The four demo players and what they did, plus the small deterministic helpers that deal their hands.

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
  },
  {
    uid: 'demo-jonah',
    name: 'Jonah',
    done: [{ evidence: 'photo', caption: 'Easier than expected, honestly.', note: null }],
    rejected: { witness: 'demo-sam', note: 'That was a different band. Try again!' },
    rerolls: 2,
    offset: [-0.0009, -0.0003],
  },
];

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
