// The mystery pack's night (plan "Mystery pack: minimal notifications, Bob's story arc, and the facts behind Case
// closed", edge cases 25 and 27): Bob is the victim, the story is the user's eight beats in order with the agreed
// scoring, and nothing in the pack still mentions Blackwood.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPack, validatePack } from '../src/shared/packs/index.js';
import type { StoryQuest } from '../src/shared/packs/types.js';

const mystery = () => getPack('mystery');
const story = (): StoryQuest[] => mystery().catalogue.story ?? [];
const beat = (id: string) => story().find((s) => s.id === id)!;

/** Every file of the mystery pack, both halves (rules and look). */
function packFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|json|css)$/.test(name)) out.push(path);
    }
  };
  walk('functions/src/shared/packs/mystery');
  walk('src/packs/mystery');
  return out;
}

describe("the mystery pack's story (edge case 25)", () => {
  it('is the eight beats, in order', () => {
    expect(story().map((s) => s.id)).toEqual([
      's-incriminating',
      's-motive',
      's-old-days',
      's-weapon',
      's-time-of-death',
      's-alibi',
      's-scene',
      's-reveal',
    ]);
    expect(story().map((s) => s.title)).toEqual([
      'Incriminating evidence',
      'Motive',
      'The good old days',
      'Murder weapon',
      'Time of death',
      "Couldn't be me",
      'The room where it happened',
      'New evidence is revealed!',
    ]);
  });

  it('opens with the photo that runs all night: a player tagged, 5 hours unless the GM says otherwise, scored by votes', () => {
    expect(beat('s-incriminating').kind ?? 'mission').toBe('mission');
    expect(beat('s-incriminating')).toMatchObject({
      judging: 'vote',
      longRun: true,
      windowMin: 300,
      entry: { tag: 'player' },
      points: 2,
      votePoints: 2,
      tieBonus: 1,
      penalty: 2,
    });
  });

  it('deals everyone another player to write a motive for: text only, +2 for writing, −2 if not, 30 minutes', () => {
    expect(beat('s-motive')).toMatchObject({ judging: 'submit', windowMin: 30, entry: { media: 'text', tag: 'assigned' }, points: 2, penalty: 2 });
  });

  it('The good old days: a photo with your miniature Bob, 2 a vote, +2 to the most voted (ties too), −2 if not', () => {
    const s = beat('s-old-days');
    expect(s).toMatchObject({ judging: 'vote', points: 2, votePoints: 2, penalty: 2 });
    expect(s.tieBonus ?? 2).toBe(2);
    expect(s.description).toMatch(/Bob/);
  });

  it('Murder weapon and The room where it happened: a photo and its story, ties +1, and the winners become the facts', () => {
    expect(beat('s-weapon')).toMatchObject({
      judging: 'vote', entry: { caption: 'required' }, points: 2, votePoints: 2, tieBonus: 1, penalty: 2, records: { key: 'weapon' },
    });
    expect(beat('s-scene')).toMatchObject({
      judging: 'vote', entry: { caption: 'required' }, points: 2, votePoints: 2, tieBonus: 1, penalty: 2, records: { key: 'scene' },
    });
  });

  it("Couldn't be me is a video alibi, scored like the others", () => {
    expect(beat('s-alibi')).toMatchObject({ judging: 'vote', entry: { media: 'video' }, points: 2, votePoints: 2, tieBonus: 1, penalty: 2 });
  });

  it('the time of death is an announcement that records 23:02; the last beat opens the vote on the incriminating photos', () => {
    expect(beat('s-time-of-death')).toMatchObject({ kind: 'announce', fact: { key: 'timeOfDeath', value: '23:02' } });
    expect(beat('s-time-of-death').description).toMatch(/Bob/);
    expect(beat('s-time-of-death').description).toMatch(/11:02/);
    expect(beat('s-reveal')).toMatchObject({ kind: 'announce', opensVoteOn: 's-incriminating' });
  });

  it('is a valid pack', () => {
    expect(validatePack(mystery())).toEqual([]);
  });
});

describe('Bob is the victim, everywhere in the pack (edge cases 25, 27)', () => {
  it('nothing in either half of the pack mentions Blackwood', () => {
    const offenders = packFiles().filter((f) => /Blackwood/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it("the pack's description and the demo characters' motives are about Bob", () => {
    expect(mystery().description).toMatch(/Bob/);
    const motives = (mystery().demoCharacters ?? []).map((c) => c.motive);
    expect(motives.length).toBeGreaterThan(0);
    expect(motives.some((m) => /Bob/.test(m))).toBe(true);
  });
});
