// The polaroid vote's logic (the takeover's deck and cork board, design/mockups/mystery/voting-takeover): who is in
// the deck and in what order, the marks you've made, who goes on the board and how it is laid out. Pure, so it is
// testable.
import type { Judgement, VoteStyle } from '../../../shared';

export interface DeckEntry {
  id: string;
  uid: string;
}

/** A small seeded random generator (mulberry32) from a string, so a deck and a board are the same every time. */
function seeded(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everyone else's entries, in an order of this player's own (the same every time), never their own. */
export function deckOrder<E extends DeckEntry>(entries: readonly E[], uid: string, missionId: string): E[] {
  const others = entries.filter((e) => e.uid !== uid).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rand = seeded(`${uid}:${missionId}`);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  return others;
}

/** Pick one: the marks made on this device (right = maybe, left = not it). */
export type Shortlist = Record<string, 'maybe' | 'not'>;

/** Where a shortlist is kept: `mm:shortlist:{uid}:{missionId}`. */
export function shortlistKey(uid: string, missionId: string): string {
  return `mm:shortlist:${uid}:${missionId}`;
}

/** A stored shortlist; anything that isn't one (junk, other values) is dropped. */
export function parseShortlist(raw: string | null | undefined): Shortlist {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: Shortlist = {};
  for (const [id, v] of Object.entries(data)) if (v === 'maybe' || v === 'not') out[id] = v;
  return out;
}

/** The shortlist kept on this device (empty when storage is missing or throws). */
export function readShortlist(storage: Pick<Storage, 'getItem'> | null | undefined, uid: string, missionId: string): Shortlist {
  try {
    return parseShortlist(storage?.getItem(shortlistKey(uid, missionId)));
  } catch {
    return {};
  }
}

/** Keeps the shortlist on this device (quietly does nothing when storage is missing or throws). */
export function writeShortlist(storage: Pick<Storage, 'setItem'> | null | undefined, uid: string, missionId: string, list: Shortlist): void {
  try {
    storage?.setItem(shortlistKey(uid, missionId), JSON.stringify(list));
  } catch {
    /* storage is a convenience */
  }
}

/** A card's mark: pick one's maybe / not it, or a yes/no vote's judgement. */
export type Mark = 'maybe' | 'not' | Judgement;

/** The marks in force: the shortlist when picking one, the ballot (from the server) for yes/no. */
export function marksFor(style: VoteStyle, shortlist: Shortlist, ballot: Readonly<Record<string, Judgement>> | null | undefined): Record<string, Mark> {
  return style === 'yesno' ? { ...(ballot ?? {}) } : { ...shortlist };
}

export type DeckStart = { stage: 'deck'; index: number } | { stage: 'board' };

/** Where the vote opens: on the board once finished or every card is marked, else at the first card without a mark. */
export function startAt(deck: readonly DeckEntry[], marks: Readonly<Record<string, Mark>>, finished: boolean): DeckStart {
  if (finished) return { stage: 'board' };
  const index = deck.findIndex((e) => !marks[e.id]);
  return index < 0 ? { stage: 'board' } : { stage: 'deck', index };
}

/** A position kept within the deck (0 to its length, which means past the last card) when entries go mid-vote. */
export function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

/** The words under the deck's buttons, and on the stamps that fade in as you drag. */
export function deckLabels(style: VoteStyle): { left: string; right: string } {
  return style === 'yesno' ? { left: 'NO', right: 'YES' } : { left: 'NOT IT', right: 'MAYBE' };
}

/**
 * Who is pinned on the board, in deck order. Pick one: the maybes and the entry you voted for (everyone when there is
 * neither, so the board is never empty). Yes/no: everyone in the deck.
 */
export function boardEntries<E extends DeckEntry>(style: VoteStyle, deck: readonly E[], marks: Readonly<Record<string, Mark>>, pickedId: string | null): E[] {
  if (style === 'yesno') return [...deck];
  const some = deck.filter((e) => marks[e.id] === 'maybe' || e.id === pickedId);
  return some.length > 0 ? some : [...deck];
}

/** What a polaroid on the board wears: a yes/no stamp (? until judged), or pick one's MY VOTE / MAYBE tag. */
export function boardMark(style: VoteStyle, entryId: string, marks: Readonly<Record<string, Mark>>, pickedId: string | null): {
  stamp: 'YES' | 'NO' | '?' | null;
  tag: 'MY VOTE' | 'MAYBE' | null;
} {
  if (style === 'yesno') {
    const m = marks[entryId];
    return { stamp: m === 'yes' ? 'YES' : m === 'no' ? 'NO' : '?', tag: null };
  }
  if (entryId === pickedId) return { stamp: null, tag: 'MY VOTE' };
  return { stamp: null, tag: marks[entryId] === 'maybe' ? 'MAYBE' : null };
}

/** The string from the question card to a polaroid: red to your vote, twine, or faint (a no, or not judged yet). */
export function stringWeight(style: VoteStyle, entryId: string, marks: Readonly<Record<string, Mark>>, pickedId: string | null): 'red' | 'twine' | 'faint' {
  if (style === 'yesno') return marks[entryId] === 'yes' ? 'twine' : 'faint';
  return entryId === pickedId ? 'red' : 'twine';
}

/** "Choose one": the board's only words, in pick one until a vote is pinned. */
export function choosePrompt(style: VoteStyle, pickedId: string | null): string | null {
  return style === 'pick' && !pickedId ? 'Choose one' : null;
}

/** Done is open once the vote is in: pick one needs a vote, yes/no a judgement on every card in the deck. */
export function doneEnabled(style: VoteStyle, deck: readonly DeckEntry[], marks: Readonly<Record<string, Mark>>, pickedId: string | null): boolean {
  if (style === 'pick') return !!pickedId;
  return deck.every((e) => marks[e.id] === 'yes' || marks[e.id] === 'no');
}

/** A pinned polaroid's size on the board, and the question card's. */
export const POLAROID = { w: 128, h: 150 } as const;
export const QUESTION_CARD = { w: 108, h: 116 } as const;

export interface BoardSpot {
  /** The polaroid's top-left corner, and its tilt in degrees. */
  left: number;
  top: number;
  rot: number;
}

export interface BoardString {
  /** Starts at the hub; ends at the polaroid's centre. */
  length: number;
  /** Degrees, clockwise from pointing right. */
  angle: number;
}

export interface BoardLayout {
  width: number;
  /** At least `minHeight`; taller (the board scrolls) past six polaroids. */
  height: number;
  /** The question card's centre. */
  hub: { x: number; y: number };
  spots: BoardSpot[];
  strings: BoardString[];
}

// The mockup's hand-placed spots on a 390 × 610 board (PolaroidYesNo.dc.html), with a bottom-centre one for odd counts.
const TL: BoardSpot = { left: 14, top: 18, rot: -5 };
const TR: BoardSpot = { left: 248, top: 26, rot: 4 };
const ML: BoardSpot = { left: 6, top: 226, rot: 3 };
const MR: BoardSpot = { left: 256, top: 232, rot: -4 };
const BL: BoardSpot = { left: 20, top: 430, rot: -3 };
const BR: BoardSpot = { left: 242, top: 436, rot: 5 };
const BC: BoardSpot = { left: 131, top: 440, rot: 2 };
// One or two keep off the middle row, where they would crowd the question card on a phone narrower than the mockup.
const SPOT_SETS: BoardSpot[][] = [[], [BC], [TL, BR], [TL, TR, BC], [TL, TR, BL, BR], [TL, TR, ML, MR, BC], [TL, TR, ML, MR, BL, BR]];
const BASE_WIDTH = 390;

function stringTo(hub: { x: number; y: number }, s: BoardSpot): BoardString {
  const dx = s.left + POLAROID.w / 2 - hub.x;
  const dy = s.top + POLAROID.h / 2 - hub.y;
  return { length: Math.hypot(dx, dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/**
 * Where `n` polaroids are pinned on a board `width` wide: up to six in the mockup's hand-placed spots around the
 * question card (scaled to the width), more in a jittered two-column scatter below it that makes the board taller.
 * The same every time for the same n.
 */
export function boardLayout(n: number, width = BASE_WIDTH, minHeight = 610): BoardLayout {
  if (n <= 6) {
    const hub = { x: width / 2, y: 296 };
    // On another width each polaroid keeps its distance from its own side (the middle one stays centred), so the
    // gap to the question card shrinks no faster than the board does.
    const shift = (left: number) => {
      const centre = left + POLAROID.w / 2;
      if (Math.abs(centre - BASE_WIDTH / 2) < 8) return left + (width - BASE_WIDTH) / 2;
      return centre < BASE_WIDTH / 2 ? left : left + (width - BASE_WIDTH);
    };
    const spots = (SPOT_SETS[Math.max(0, n)] ?? []).map((s) => ({
      left: Math.max(0, Math.min(Math.round(shift(s.left)), width - POLAROID.w)),
      top: s.top,
      rot: s.rot,
    }));
    return { width, height: minHeight, hub, spots, strings: spots.map((s) => stringTo(hub, s)) };
  }
  const rand = seeded(`board:${n}`);
  const hub = { x: width / 2, y: 12 + QUESTION_CARD.h / 2 };
  const rowStep = 172;
  const firstTop = 12 + QUESTION_CARD.h + 28;
  const gutter = 14;
  const spots: BoardSpot[] = [];
  for (let i = 0; i < n; i++) {
    const right = i % 2 === 1;
    const row = Math.floor(i / 2);
    const jx = Math.round((rand() - 0.5) * 12);
    const jy = Math.round((rand() - 0.5) * 16);
    const base = right ? width - gutter - POLAROID.w - 6 : gutter + 6;
    spots.push({
      left: Math.max(0, Math.min(base + jx, width - POLAROID.w)),
      top: firstTop + row * rowStep + (right ? 36 : 0) + jy,
      rot: Math.round((rand() * 12 - 6) * 10) / 10,
    });
  }
  const bottom = Math.max(...spots.map((s) => s.top + POLAROID.h));
  return { width, height: Math.max(minHeight, bottom + 24), hub, spots, strings: spots.map((s) => stringTo(hub, s)) };
}
