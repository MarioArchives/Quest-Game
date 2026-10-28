// The six editions of the Evening Post that land on the desk, one per milestone of the investigation: Bob found dead,
// the suspects recruited, the weapon, the time of death, the scene and the verdict. Built from the story's facts and
// the case file; an edition whose mission never ran is left out. Pure.
import type { CaseVerdict } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { capitalise, listed, numberWord, plural, possessive } from './words';

export interface PaperPerson {
  uid: string;
  name: string;
  bookedAt: number | null;
}

/** A winning entry recorded on a fact (facts/{key}.entries). */
export interface PaperEntry {
  uid: string;
  displayName: string;
  caption: string | null;
  imagePath: string | null;
  thumbPath: string | null;
  votes: number;
}

export interface PaperInput {
  /** Everyone in the case, in standings order. */
  people: PaperPerson[];
  startedAt: number | null;
  endedAt: number;
  /** The first stop on the route, where Bob was found. */
  firstStop: string | null;
  weapon: { entries: PaperEntry[]; at: number } | null;
  scene: { entries: PaperEntry[]; at: number } | null;
  timeOfDeath: { value: string; at: number } | null;
  /** Where the crawl was at the time of death. */
  deathStop: string | null;
  /** The last roll-call answer before it. */
  lastSeen: { uid: string; at: number } | null;
  verdict: CaseVerdict;
  /** "23:02" in the pack's zone. */
  time: (ms: number) => string;
  /** "Saturday 24 October", the night's date. */
  day: string;
  caseNo: (uid: string) => string;
}

export type PaperVisual =
  | { kind: 'bob' }
  | { kind: 'lineup'; count: number }
  | { kind: 'photo'; imagePath: string | null; thumbPath: string | null }
  | { kind: 'clock'; time: string; day: string }
  | { kind: 'mug'; uid: string }
  | { kind: 'unknown' };

export type PaperId = 'murder' | 'recruit' | 'weapon' | 'time' | 'scene' | 'verdict';

export interface Paper {
  id: PaperId;
  /** The edition's time. */
  at: number;
  kicker: string;
  headline: string;
  /** The verdict prints its headline in red. */
  red: boolean;
  visual: PaperVisual;
  caption: string;
  /** The piece beside the photo: its heading, its sentences, and one more after the blacked-out lines. */
  side: string;
  stand: string;
  more: string | null;
}

const votes = (n: number) => plural(n, 'vote');

/** A story mission's winners as one paper: the top entry's photo, every tied entry named. */
function winners(entries: PaperEntry[]): { names: string[]; top: PaperEntry } | null {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => b.votes - a.votes);
  return { names: sorted.map((e) => e.displayName), top: sorted[0] };
}

const quote = (caption: string | null) => (caption ? `“${caption.trim().replace(/[.!?]+$/, '')}”` : 'an untitled photo');
const pictured = (e: PaperEntry) => `${e.caption ? e.caption.trim().replace(/[.!?]+$/, '') : 'Untitled'}. Picture: ${e.displayName} · ${votes(e.votes)}`;

export function papers(input: PaperInput): Paper[] {
  const out: Paper[] = [];
  const n = input.people.length;
  const name = (uid: string) => input.people.find((p) => p.uid === uid)?.name ?? 'Someone';
  const bookedAt = (uid: string) => input.people.find((p) => p.uid === uid)?.bookedAt ?? null;
  const booked = input.people.map((p) => p.bookedAt).filter((t): t is number => t !== null).sort((a, b) => a - b);
  const opened = input.startedAt ?? booked[booked.length - 1] ?? input.endedAt;

  out.push({
    id: 'murder',
    at: booked[0] ?? opened,
    kicker: 'Breaking',
    headline: 'Bob found dead',
    red: false,
    visual: { kind: 'bob' },
    caption: 'Bob, from his last passport photo',
    side: 'Police baffled',
    stand: `Local man found dead${input.firstStop ? ` near ${input.firstStop}` : ''}. Police are baffled and short-staffed.`,
    more: `Officers were called at ${input.time(booked[0] ?? opened)}.`,
  });

  out.push({
    id: 'recruit',
    at: opened,
    kicker: 'Police',
    headline: `Police recruit ${numberWord(n)} locals to aid inquiry`,
    red: false,
    visual: { kind: 'lineup', count: n },
    caption: booked.length
      ? `The ${numberWord(n)}, booked in at the desk ${input.time(booked[0])}${booked.length > 1 ? `–${input.time(booked[booked.length - 1])}` : ''}`
      : `The ${numberWord(n)}`,
    side: `${capitalise(numberWord(n))} answer the call`,
    stand: `Manchester Metropolitan Police enlist ${numberWord(n)} of Bob’s nearest. “They knew him best,” a spokesman said.`,
    more: 'Each was booked in and handed a miniature Bob.',
  });

  const weapon = input.weapon && winners(input.weapon.entries);
  if (input.weapon && weapon) {
    const tie = weapon.names.length > 1;
    out.push({
      id: 'weapon',
      at: input.weapon.at,
      kicker: 'Exclusive',
      headline: tie ? `Weapon shock: police find ${numberWord(weapon.names.length)}` : 'Police name the murder weapon',
      red: false,
      visual: { kind: 'photo', imagePath: weapon.top.imagePath, thumbPath: weapon.top.thumbPath },
      caption: pictured(weapon.top),
      side: tie ? 'A tie at the bar' : 'Exhibit A',
      stand: tie
        ? `Readers couldn’t split ${listed(weapon.names.map(possessive))} entries. All of them are now the weapon.`
        : `Readers picked ${possessive(weapon.top.displayName)} entry, ${quote(weapon.top.caption)}, with ${votes(weapon.top.votes)}.`,
      more: tie ? `${capitalise(votes(weapon.top.votes))} each.` : 'Police say it has been bagged.',
    });
  }

  if (input.timeOfDeath) {
    const seen = input.lastSeen;
    out.push({
      id: 'time',
      at: input.timeOfDeath.at,
      kicker: 'Police',
      headline: `Time of death: ${input.timeOfDeath.value}`,
      red: false,
      visual: { kind: 'clock', time: input.timeOfDeath.value, day: input.day },
      caption: seen ? `Last seen: ${name(seen.uid)}, at roll call, ${input.time(seen.at)}` : 'Bob’s last minute',
      side: input.deathStop ? `All ${numberWord(n)} at ${input.deathStop}` : 'The clock stopped',
      stand: `New evidence fixes the moment.${input.deathStop ? ` All ${numberWord(n)} suspects were drinking at ${input.deathStop}.` : ''}`,
      more: seen ? `${name(seen.uid)} answered roll call at ${input.time(seen.at)}.` : null,
    });
  }

  const scene = input.scene && winners(input.scene.entries);
  if (input.scene && scene) {
    const tie = scene.names.length > 1;
    out.push({
      id: 'scene',
      at: input.scene.at,
      kicker: 'Crime scene',
      headline: tie ? 'Two scenes, one body' : 'Scene of the crime found',
      red: false,
      visual: { kind: 'photo', imagePath: scene.top.imagePath, thumbPath: scene.top.thumbPath },
      caption: pictured(scene.top),
      side: tie ? 'Readers split' : 'Taped off',
      stand: tie
        ? `${listed(scene.names.map(possessive))} photos tied. Police are taping off all of them.`
        : `${possessive(scene.top.displayName)} photo, ${quote(scene.top.caption)}, is the scene of the crime.`,
      more: `${capitalise(votes(scene.top.votes))}${tie ? ' each' : ''}.`,
    });
  }

  const v = input.verdict;
  const ranked = Object.entries(v.tally).sort((a, b) => b[1] - a[1]);
  const runner = ranked.find(([uid, n]) => !v.uids.includes(uid) && n > 0);
  if (v.uids.length) {
    const top = v.uids[0];
    const count = v.tally[top] ?? 0;
    const tie = v.uids.length > 1;
    out.push({
      id: 'verdict',
      at: input.endedAt,
      kicker: 'Case closed',
      headline: tie ? `It was ${listed(v.uids.map(name))}` : `It was ${name(top)}`,
      red: true,
      visual: { kind: 'mug', uid: top },
      caption: `${name(top)}, booked ${bookedAt(top) !== null ? `in at ${input.time(bookedAt(top)!)}` : 'in'}. Case ${input.caseNo(top)}`,
      side: capitalise(plural(count, 'vote', 'votes', true)),
      stand: tie
        ? `Tied on ${votes(count)} each on the incriminating photos. Police are charging them together.`
        : `Most incriminated, with ${votes(count)} on the ${plural(v.photos[top] ?? 0, 'photo', 'photos', true)} that tag them.`,
      more: runner ? `${name(runner[0])} second, on ${runner[1]}.` : null,
    });
  } else {
    out.push({
      id: 'verdict',
      at: input.endedAt,
      kicker: 'Case closed',
      headline: 'The case goes cold',
      red: false,
      visual: { kind: 'unknown' },
      caption: 'Wanted: anyone',
      side: 'Nobody charged',
      stand: v.opened ? 'No incriminating photo pointed at anyone. Police have nobody to charge.' : 'The incriminating photos were never revealed. Police have nobody to charge.',
      more: null,
    });
  }

  return out;
}
