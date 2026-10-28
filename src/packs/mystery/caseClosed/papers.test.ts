import { describe, expect, it } from 'vitest';
import type { CaseVerdict } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { papers, type PaperEntry, type PaperInput } from './papers';

const MIN = 60_000;
const OPEN: CaseVerdict = { opened: false, tally: {}, photos: {}, uids: [], motiveBy: {} };
const entry = (uid: string, displayName: string, caption: string | null, votes: number): PaperEntry => ({ uid, displayName, caption, imagePath: `p/${uid}.jpg`, thumbPath: null, votes });

function input(over: Partial<PaperInput> = {}): PaperInput {
  return {
    people: [
      { uid: 'maya', name: 'Maya', bookedAt: 41 * MIN },
      { uid: 'sam', name: 'Sam', bookedAt: 52 * MIN },
      { uid: 'jonah', name: 'Jonah', bookedAt: 58 * MIN },
    ],
    startedAt: 60 * MIN,
    endedAt: 400 * MIN,
    firstStop: 'Big Hands',
    weapon: null,
    scene: null,
    timeOfDeath: null,
    deathStop: null,
    lastSeen: null,
    verdict: OPEN,
    time: (ms) => `T${ms / MIN}`,
    day: 'Saturday 24 October',
    caseNo: (uid) => `#${uid}`,
    ...over,
  };
}

describe('the editions', () => {
  it('always prints Bob found dead and the recruits; a mission that never ran prints nothing', () => {
    const out = papers(input());
    expect(out.map((p) => p.id)).toEqual(['murder', 'recruit', 'verdict']);
    expect(out[0]).toMatchObject({ headline: 'Bob found dead', at: 41 * MIN, stand: expect.stringContaining('near Big Hands') });
    expect(out[1]).toMatchObject({
      headline: 'Police recruit three locals to aid inquiry',
      at: 60 * MIN,
      visual: { kind: 'lineup', count: 3 },
      caption: 'The three, booked in at the desk T41–T58',
    });
  });

  it('runs in story order: weapon, time, scene, then the verdict', () => {
    const out = papers(
      input({
        weapon: { entries: [entry('sam', 'Sam', 'A corkscrew.', 2)], at: 200 * MIN },
        timeOfDeath: { value: '23:02', at: 250 * MIN },
        scene: { entries: [entry('maya', 'Maya', 'The cellar steps', 3)], at: 300 * MIN },
      }),
    );
    expect(out.map((p) => p.id)).toEqual(['murder', 'recruit', 'weapon', 'time', 'scene', 'verdict']);
  });

  it('names one weapon from its entry, or every tied entry', () => {
    const one = papers(input({ weapon: { entries: [entry('sam', 'Sam', 'A corkscrew.', 2)], at: 1 } })).find((p) => p.id === 'weapon')!;
    expect(one).toMatchObject({
      headline: 'Police name the murder weapon',
      stand: 'Readers picked Sam’s entry, “A corkscrew”, with 2 votes.',
      caption: 'A corkscrew. Picture: Sam · 2 votes',
      visual: { kind: 'photo', imagePath: 'p/sam.jpg' },
    });
    const two = papers(input({ weapon: { entries: [entry('sam', 'Sam', 'Corkscrew', 2), entry('maya', 'Maya', 'Slow pint', 2)], at: 1 } })).find((p) => p.id === 'weapon')!;
    expect(two.headline).toBe('Weapon shock: police find two');
    expect(two.stand).toBe('Readers couldn’t split Sam’s and Maya’s entries. All of them are now the weapon.');
  });

  it('skips a weapon or scene fact nobody won', () => {
    expect(papers(input({ weapon: { entries: [], at: 1 }, scene: { entries: [], at: 2 } })).map((p) => p.id)).toEqual(['murder', 'recruit', 'verdict']);
  });

  it('fixes the time of death with where the crawl was and who was last seen', () => {
    const t = papers(input({ timeOfDeath: { value: '23:02', at: 9 }, deathStop: 'Flok', lastSeen: { uid: 'maya', at: 238 * MIN } })).find((p) => p.id === 'time')!;
    expect(t).toMatchObject({
      headline: 'Time of death: 23:02',
      visual: { kind: 'clock', time: '23:02', day: 'Saturday 24 October' },
      side: 'All three at Flok',
      caption: 'Last seen: Maya, at roll call, T238',
    });
    const bare = papers(input({ timeOfDeath: { value: '23:02', at: 9 } })).find((p) => p.id === 'time')!;
    expect(bare).toMatchObject({ side: 'The clock stopped', more: null, stand: 'New evidence fixes the moment.' });
  });

  it('closes on the verdict in red with the mugshot, the runner-up underneath', () => {
    const v: CaseVerdict = { opened: true, tally: { jonah: 5, maya: 2, sam: 0 }, photos: { jonah: 2, maya: 1, sam: 1 }, uids: ['jonah'], motiveBy: {} };
    const out = papers(input({ verdict: v })).at(-1)!;
    expect(out).toMatchObject({
      id: 'verdict',
      headline: 'It was Jonah',
      red: true,
      visual: { kind: 'mug', uid: 'jonah' },
      side: 'Five votes',
      stand: 'Most incriminated, with 5 votes on the two photos that tag them.',
      more: 'Maya second, on 2.',
      caption: 'Jonah, booked in at T58. Case #jonah',
      at: 400 * MIN,
    });
  });

  it('names accomplices on a tie, and goes cold with no verdict', () => {
    const tie: CaseVerdict = { opened: true, tally: { jonah: 2, sam: 2 }, photos: { jonah: 1, sam: 1 }, uids: ['sam', 'jonah'], motiveBy: {} };
    expect(papers(input({ verdict: tie })).at(-1)!.headline).toBe('It was Sam and Jonah');
    expect(papers(input()).at(-1)).toMatchObject({ headline: 'The case goes cold', red: false, visual: { kind: 'unknown' } });
    expect(papers(input({ verdict: { ...OPEN, opened: true } })).at(-1)!.stand).toContain('No incriminating photo pointed at anyone');
  });
});
