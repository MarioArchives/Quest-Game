// Vote reactions (packs with reactions: 'votes'): counts on the post, the pinned top entry (game/top), the reset
// and the wrap. Runs on both stores.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import { handleReactionWritten, recountReactions, recomputeTop } from '../src/game/reactions.js';
import { resetGame } from '../src/game/reset.js';
import { getPack, validatePack } from '../src/shared/packs/index.js';
import {
  addMin,
  ctx,
  getData,
  seedAdmin,
  seedGame,
  seedPlayer,
  seedSubmission,
  T0,
  ts,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-votes');
const mystery = getPack('mystery');
const lancaster = getPack('lancaster');

const at = (min: number) => addMin(T0, min);

async function post(id: string, extra: Record<string, unknown> = {}, minute = 0) {
  await db().doc(`feed/${id}`).set({ type: 'approved', text: id, uid: 'alice', ref: null, reactionCount: 0, createdAt: ts(at(minute)), ...extra });
}
/** Writes a vote doc and runs the trigger as the server would. */
async function vote(id: string, voter: string, v: 1 | -1 | null, now = T0, pack = mystery) {
  const ref = db().doc(`feed/${id}/reactions/${voter}`);
  if (v === null) await ref.delete();
  else await ref.set({ vote: v, createdAt: ts(now) });
  await handleReactionWritten(db(), id, now, pack);
}
const top = () => getData(db(), 'game/top');

describe('vote counts on the post', () => {
  it('sets up, down, score and votes, follows a switch and a removal, and counts every doc in reactionCount', async () => {
    await seedGame(db());
    await post('f1');
    await vote('f1', 'bob', 1);
    await vote('f1', 'carol', 1);
    await vote('f1', 'dave', -1);
    expect(await getData(db(), 'feed/f1')).toMatchObject({ up: 2, down: 1, score: 1, reactionCount: 3, votes: { bob: 1, carol: 1, dave: -1 } });
    await vote('f1', 'bob', -1);
    expect(await getData(db(), 'feed/f1')).toMatchObject({ up: 1, down: 2, score: -1, votes: { bob: -1, carol: 1, dave: -1 } });
    await vote('f1', 'bob', null);
    const p = (await getData(db(), 'feed/f1'))!;
    expect(p).toMatchObject({ up: 1, down: 1, score: 0, reactionCount: 2 });
    expect(p.votes).toEqual({ carol: 1, dave: -1 });
  });

  it('emoji docs count in reactionCount but never in up, down, score or votes', async () => {
    await seedGame(db());
    await post('f1');
    await db().doc('feed/f1/reactions/bob').set({ emoji: '🔥', createdAt: ts(T0) });
    await vote('f1', 'carol', 1);
    expect(await getData(db(), 'feed/f1')).toMatchObject({ reactionCount: 2, up: 1, down: 0, score: 1, votes: { carol: 1 } });
  });

  it('leaves a post with only emoji reactions without vote fields', async () => {
    await seedGame(db());
    await post('f1');
    await db().doc('feed/f1/reactions/bob').set({ emoji: '🔥', createdAt: ts(T0) });
    await recountReactions(db(), 'f1');
    const p = (await getData(db(), 'feed/f1'))!;
    expect(p.reactionCount).toBe(1);
    expect(p).not.toHaveProperty('score');
    expect(p).not.toHaveProperty('votes');
  });
});

describe('the top entry', () => {
  it('the first post with score 1 or more takes it', async () => {
    await seedGame(db());
    await post('a');
    await vote('a', 'bob', -1, at(1));
    expect(await top()).toBeUndefined();
    await vote('a', 'bob', 1, at(2));
    expect(await top()).toMatchObject({ feedId: 'a', score: 1, up: 1, down: 0, previousFeedId: null, previousSince: null });
    expect((await top())!.since.toMillis()).toBe(at(2).getTime());
  });

  it('a higher score takes it over, and remembers the old holder and when it took the top', async () => {
    await seedGame(db());
    await post('a');
    await post('b', {}, 1);
    await vote('a', 'bob', 1, at(2));
    await vote('b', 'bob', 1, at(3));
    expect((await top())!.feedId).toBe('a');
    await vote('b', 'carol', 1, at(4));
    const t = (await top())!;
    expect(t).toMatchObject({ feedId: 'b', score: 2, previousFeedId: 'a' });
    expect(t.since.toMillis()).toBe(at(4).getTime());
    expect(t.previousSince.toMillis()).toBe(at(2).getTime());
  });

  it('an equal score with fewer downs takes it over', async () => {
    await seedGame(db());
    await post('a');
    await post('b', {}, 1);
    await vote('a', 'bob', 1, at(2));
    await vote('a', 'carol', 1, at(2));
    await vote('a', 'dave', -1, at(2)); // a: up 2, down 1, score 1
    expect((await top())!.feedId).toBe('a');
    await vote('b', 'bob', 1, at(3)); // b: score 1, no downs
    expect(await top()).toMatchObject({ feedId: 'b', previousFeedId: 'a' });
  });

  it('a full tie keeps the holder', async () => {
    await seedGame(db());
    await post('a', {}, 5);
    await post('b', {}, 1); // earlier post, but not the holder
    await vote('a', 'bob', 1, at(6));
    await vote('b', 'bob', 1, at(7));
    expect((await top())!.feedId).toBe('a');
  });

  it('a tie with the holder gone goes to the earlier post', async () => {
    await seedGame(db());
    await post('a', {}, 5);
    await post('b', {}, 2);
    await post('c', {}, 1);
    await vote('c', 'bob', 1, at(6));
    await vote('a', 'bob', 1, at(7));
    await vote('b', 'bob', 1, at(7));
    expect((await top())!.feedId).toBe('c');
    await vote('c', 'bob', null, at(8));
    expect((await top())!.feedId).toBe('b');
  });

  it('the holder falling below another hands it over', async () => {
    await seedGame(db());
    await post('a');
    await post('b', {}, 1);
    await vote('a', 'bob', 1, at(2));
    await vote('a', 'carol', 1, at(2));
    await vote('b', 'bob', 1, at(3));
    await vote('a', 'carol', -1, at(4)); // a: score 0, b: score 1
    expect(await top()).toMatchObject({ feedId: 'b', previousFeedId: 'a' });
  });

  it('the holder falling to 0 with nothing else qualifying leaves no holder, keeping the last one', async () => {
    await seedGame(db());
    await post('a');
    await vote('a', 'bob', 1, at(2));
    await vote('a', 'bob', null, at(3));
    const t = (await top())!;
    expect(t).toMatchObject({ feedId: null, score: 0, up: 0, down: 0, since: null, previousFeedId: 'a' });
    expect(t.previousSince.toMillis()).toBe(at(2).getTime());
  });

  it("the holder's own new vote updates its numbers and keeps since", async () => {
    await seedGame(db());
    await post('a');
    await vote('a', 'bob', 1, at(2));
    await vote('a', 'carol', 1, at(9));
    const t = (await top())!;
    expect(t).toMatchObject({ feedId: 'a', score: 2, up: 2, down: 0, previousFeedId: null });
    expect(t.since.toMillis()).toBe(at(2).getTime());
  });

  it('a flagged post loses it when the top is recomputed', async () => {
    await seedGame(db());
    await post('a');
    await post('b', {}, 1);
    await vote('a', 'bob', 1, at(2));
    await vote('a', 'carol', 1, at(2));
    await vote('b', 'bob', 1, at(3));
    expect((await top())!.feedId).toBe('a');
    await db().doc('feed/a').update({ flagged: true });
    await recomputeTop(db(), at(5));
    expect(await top()).toMatchObject({ feedId: 'b', previousFeedId: 'a' });
  });

  it('a notice post never holds it, even with vote docs written straight to the store', async () => {
    await seedGame(db());
    await post('n', { type: 'story-beat' });
    await post('s', { type: 'standing' });
    await post('nouid', { uid: null });
    for (const id of ['n', 's', 'nouid']) {
      await db().doc(`feed/${id}/reactions/bob`).set({ vote: 1, createdAt: ts(T0) });
      await db().doc(`feed/${id}/reactions/carol`).set({ vote: 1, createdAt: ts(T0) });
      await handleReactionWritten(db(), id, at(1), mystery);
    }
    expect(await getData(db(), 'feed/n')).toMatchObject({ score: 2 });
    expect(await top()).toBeUndefined();
  });

  it("re-running the trigger doesn't move since", async () => {
    await seedGame(db());
    await post('a');
    await vote('a', 'bob', 1, at(2));
    await handleReactionWritten(db(), 'a', at(30), mystery);
    await recomputeTop(db(), at(40));
    expect((await top())!.since.toMillis()).toBe(at(2).getTime());
  });

  it('a pack with only emoji reactions never writes game/top', async () => {
    await seedGame(db());
    await post('a');
    await db().doc('feed/a/reactions/bob').set({ emoji: '🔥', createdAt: ts(T0) });
    await handleReactionWritten(db(), 'a', T0, lancaster);
    // Even vote docs in an emoji pack leave the top alone.
    await db().doc('feed/a/reactions/carol').set({ vote: 1, createdAt: ts(T0) });
    await handleReactionWritten(db(), 'a', T0, lancaster);
    expect(await top()).toBeUndefined();
  });
});

describe('reset and end', () => {
  it('a reset deletes game/top; ending the game keeps it', async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice');
    await post('a');
    await vote('a', 'bob', 1, at(2));
    expect(await top()).toBeDefined();
    await endGame(db(), ctx('gm', T0, undefined, undefined, mystery), {});
    expect(await top()).toBeDefined();
    await resetGame(db(), ctx('gm', T0, undefined, undefined, mystery), { confirm: 'RESET' });
    expect(await top()).toBeUndefined();
  });
});

describe('the wrap', () => {
  async function scenario(pack: typeof mystery) {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice');
    await seedPlayer(db(), 'bob');
    for (const [i, id] of ['s1', 's2', 's3'].entries()) {
      await seedSubmission(db(), id, { uid: 'alice', questId: 'q1', status: 'approved' });
      await post(`f${i + 1}`, { submissionId: id }, i);
    }
    // f1: 3 emoji reactions, score 0. f2: 1 up (score 1). f3: 1 up (score 1, later than f2).
    await db().doc('feed/f1').update({ reactionCount: 3 });
    await db().doc('feed/f2').update({ reactionCount: 1, score: 1, up: 1, down: 0 });
    await db().doc('feed/f3').update({ reactionCount: 1, score: 1, up: 1, down: 0 });
    await endGame(db(), ctx('gm', T0, undefined, undefined, pack), {});
    return (await getData(db(), 'wraps/alice'))!;
  }

  it('picks the highest score in a votes pack, ties to the earliest, with the score set', async () => {
    const w = await scenario(mystery);
    expect(w.topPhoto).toMatchObject({ submissionId: 's2', reactionCount: 1, score: 1 });
  });

  it('picks the most reactions in an emoji pack, with no score', async () => {
    const w = await scenario(lancaster);
    expect(w.topPhoto).toMatchObject({ submissionId: 's1', reactionCount: 3 });
    expect(w.topPhoto).not.toHaveProperty('score');
  });
});

describe('the reactions switch', () => {
  it('validatePack accepts both values and refuses others', () => {
    expect(validatePack({ ...lancaster, reactions: 'emoji' })).toEqual([]);
    expect(validatePack({ ...lancaster, reactions: 'votes' })).toEqual([]);
    expect(validatePack({ ...lancaster, reactions: 'likes' as never }).join(' ')).toMatch(/reactions/);
  });

  it('the mystery pack takes votes; lancaster and starter take emoji', () => {
    expect(mystery.reactions).toBe('votes');
    expect(lancaster.reactions ?? 'emoji').toBe('emoji');
    expect(getPack('starter').reactions ?? 'emoji').toBe('emoji');
  });
});
