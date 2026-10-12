// Small helpers for a player's case file: mission status tags, the nameplate and the "behind the glass" row.
import type { Quest } from '../../shared';

export interface MissionTag {
  tag: '[✓]' | '[~]' | '[ ]' | '[x]';
  tone: 'done' | 'pending' | 'open' | 'exposed';
  /** The line under the mission, upper case: "TOM · +100", "WAITING ON JONAS", "EXPOSED BY HANNAH · −50"; null for open. */
  sub: string | null;
}

const first = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0]!.toUpperCase();

/** The tag for a mission in the hand, or null for statuses that aren't shown (replaced). */
export function missionTag(
  quest: Pick<Quest, 'status'>,
  info: { witnessName?: string | null; points?: number | null; exposedByName?: string | null; exposePenalty?: number },
): MissionTag | null {
  const join = (parts: string[]) => parts.filter(Boolean).join(' · ');
  switch (quest.status) {
    case 'done': {
      const pts = info.points != null ? `+${info.points}` : '';
      return { tag: '[✓]', tone: 'done', sub: join([first(info.witnessName), pts]) || null };
    }
    case 'submitted':
      return { tag: '[~]', tone: 'pending', sub: info.witnessName ? `WAITING ON ${first(info.witnessName)}` : 'WAITING' };
    case 'active':
      return { tag: '[ ]', tone: 'open', sub: null };
    case 'exposed': {
      const by = info.exposedByName ? `EXPOSED BY ${first(info.exposedByName)}` : 'EXPOSED';
      const pen = info.exposePenalty ? `−${info.exposePenalty}` : '';
      return { tag: '[x]', tone: 'exposed', sub: join([by, pen]) };
    }
    default:
      return null;
  }
}

/** A stable case number for a uid: "NN · NNNNNN". */
export function caseNumber(uid: string): string {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) h = Math.imul(h ^ uid.charCodeAt(i), 16777619) >>> 0;
  const n = String(h % 100_000_000).padStart(8, '0');
  return `${n.slice(0, 2)} · ${n.slice(2)}`;
}

const TITLES = new Set(
  ['lady', 'lord', 'sir', 'dame', 'dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'colonel', 'captain', 'professor', 'prof', 'rev', 'reverend', 'inspector', 'major', 'sergeant', 'general', 'madame', 'monsieur', 'count', 'countess', 'baron', 'baroness', 'duke', 'duchess', 'father', 'sister', 'doctor', 'commander', 'admiral', 'judge', 'detective', 'constable'],
);

/** "Lady Violet Ashcombe" → "Ashcombe V": the surname plus the first given name's initial, skipping titles. */
export function surnameInitial(name: string): string {
  let words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && TITLES.has(words[0]!.replace(/\.$/, '').toLowerCase())) words = words.slice(1);
  if (words.length <= 1) return words[0] ?? '';
  return `${words[words.length - 1]} ${words[0]![0]!.toUpperCase()}`;
}

export type GlassTile = { kind: 'suspect'; uid: string } | { kind: 'you' } | { kind: 'more'; count: number };

/**
 * Up to six tiles: two other suspects, you, then up to three more; with more than five others it is two, you,
 * two, and "+N" for the rest. `others` is already in display order.
 */
export function behindTheGlass(othersUids: readonly string[]): GlassTile[] {
  const s = (uid: string): GlassTile => ({ kind: 'suspect', uid });
  const head = othersUids.slice(0, 2).map(s);
  const rest = othersUids.slice(2);
  const tail: GlassTile[] =
    rest.length <= 3 ? rest.map(s) : [...rest.slice(0, 2).map(s), { kind: 'more', count: rest.length - 2 }];
  return [...head, { kind: 'you' }, ...tail];
}
