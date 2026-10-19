// A dealt-player mission that writes motives (entry.writesMotive, the mystery pack's "Motive"): when it closes, what
// each player wrote about the player they were dealt becomes that player's motive (motives/{uid}), signed by the writer.
import { describe, expect, it } from 'vitest';
import { fireGlobalQuest, runTick } from '../src/game/globals.js';
import { enterSideQuest } from '../src/game/votes.js';
import { validatePack } from '../src/shared/packs/index.js';
import type { GamePack, StoryQuest } from '../src/shared/packs/types.js';
import { addMin, constRng, ctx, getData, seedAdmin, seedGame, seedPlayer, T0, toMillis, ts, useEmulatorDb } from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-motives');

const STORY: StoryQuest[] = [
  { id: 's-motive', title: 'Motive', description: 'Why did they do it?', judging: 'submit', windowMin: 30, entry: { media: 'text', tag: 'assigned', writesMotive: true }, points: 2, penalty: 2 },
  { id: 's-dealt', title: 'Dealt, no motive', description: 'Write about them', judging: 'submit', windowMin: 30, entry: { media: 'text', tag: 'assigned' }, points: 2, penalty: 2 },
];
const PACK: GamePack = testPack({ features: { characters: true }, catalogue: { ...lancaster().catalogue, story: STORY } });

async function setup() {
  await seedGame(db(), { settings: { quietHours: null } });
  await seedAdmin(db(), 'gm');
  for (const uid of ['alice', 'bob', 'carol']) await seedPlayer(db(), uid);
  // The GM's own motives from before the game: one is replaced, the others stay unless someone writes theirs.
  for (const uid of ['alice', 'bob', 'carol']) await db().doc(`motives/${uid}`).set({ text: `The GM's motive for ${uid}`, updatedAt: ts(addMin(T0, -60)) });
}

const as = (uid: string, now: Date = T0) => ctx(uid, now, constRng(0), undefined, PACK);
const fire = async (storyId: string, now: Date = T0) =>
  (await fireGlobalQuest(db(), as('gm', now), { mode: 'story', storyId } as never)).globalQuestId;
const write = (uid: string, questId: string, caption: string, now: Date) =>
  enterSideQuest(db(), as(uid, now), { globalQuestId: questId, caption } as never);
const targetOf = async (questId: string, uid: string) => (await getData(db(), `assignments/${questId}_${uid}`))!.targetUid as string;
const motive = (uid: string) => getData(db(), `motives/${uid}`);

describe('motives written about each other (entry.writesMotive)', () => {
  it("when it closes, what each player wrote becomes their target's motive, signed by the writer", async () => {
    await setup();
    const id = await fire('s-motive');
    await write('alice', id, 'Bob owed money to everyone', addMin(T0, 1));
    await write('bob', id, 'Jealous of the will', addMin(T0, 2));
    await write('carol', id, 'Wanted the house', addMin(T0, 3));
    for (const [writer, text] of [['alice', 'Bob owed money to everyone'], ['bob', 'Jealous of the will'], ['carol', 'Wanted the house']] as const) {
      const target = await targetOf(id, writer);
      const m = await motive(target);
      expect(m, `${writer} → ${target}`).toMatchObject({ text, byUid: writer, globalQuestId: id });
      expect(toMillis(m!.updatedAt)).toBeGreaterThanOrEqual(T0.getTime());
    }
  });

  it('while it is still open, nobody’s motive changes', async () => {
    await setup();
    const id = await fire('s-motive');
    await write('alice', id, 'Bob owed money', addMin(T0, 1));
    const target = await targetOf(id, 'alice');
    expect(await motive(target)).toMatchObject({ text: `The GM's motive for ${target}` });
  });

  it('a player nobody wrote about keeps the motive they had', async () => {
    await setup();
    const id = await fire('s-motive');
    await write('alice', id, 'A grudge', addMin(T0, 1));
    await runTick(db(), addMin(T0, 31), constRng(0), PACK);
    const written = await targetOf(id, 'alice');
    expect(await motive(written)).toMatchObject({ text: 'A grudge', byUid: 'alice' });
    for (const uid of ['alice', 'bob', 'carol'].filter((u) => u !== written)) {
      expect(await motive(uid), uid).toMatchObject({ text: `The GM's motive for ${uid}` });
      expect((await motive(uid))!.byUid ?? null).toBeNull();
    }
  });

  it('a dealt mission without writesMotive leaves every motive alone', async () => {
    await setup();
    const id = await fire('s-dealt');
    for (const [i, uid] of ['alice', 'bob', 'carol'].entries()) await write(uid, id, `About them ${i}`, addMin(T0, i + 1));
    await runTick(db(), addMin(T0, 31), constRng(0), PACK);
    for (const uid of ['alice', 'bob', 'carol']) expect(await motive(uid), uid).toMatchObject({ text: `The GM's motive for ${uid}` });
  });

  it('the pack check accepts writesMotive only on a dealt mission, as true or false', () => {
    const withStory = (story: unknown[]) => ({ ...PACK, catalogue: { ...PACK.catalogue, story: story as StoryQuest[] } });
    expect(validatePack(withStory(STORY))).toEqual([]);
    const notDealt = validatePack(withStory([{ ...STORY[0], entry: { media: 'text', writesMotive: true } }]));
    expect(notDealt.some((l) => l.includes('s-motive') && /motive/i.test(l)), notDealt.join('\n')).toBe(true);
    const notBool = validatePack(withStory([{ ...STORY[0], entry: { media: 'text', tag: 'assigned', writesMotive: 'yes' } }]));
    expect(notBool.some((l) => l.includes('s-motive') && /motive/i.test(l)), notBool.join('\n')).toBe(true);
  });
});
