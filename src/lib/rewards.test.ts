// Mystery plan edge cases 4 and 23 (app side): who the reward pop-up offers to frame, and which reward it shows.
import { describe, expect, it } from 'vitest';
import { Stamp } from '../../functions/src/shared/store/stamp.ts';
import type { Doc, Player, Reward } from '../shared';
import { frameTargets, pendingReward } from './rewards';

const p = (id: string, points: number, extra: Partial<Player> = {}): Doc<Player> =>
  ({ id, displayName: id, points, ...extra }) as Doc<Player>;
const r = (id: string, status: Reward['status'], min: number): Doc<Reward> =>
  ({ id, uid: 'me', submissionId: id, status, createdAt: Stamp.fromMillis(min * 60_000) }) as Doc<Reward>;

describe('frameTargets', () => {
  it('every other player still playing, highest score first, ties by name', () => {
    const players = [p('me', 50), p('cat', 10), p('bo', 90), p('al', 10), p('gone', 99, { left: 'out' }), p('ice', 80, { left: 'frozen' })];
    expect(frameTargets(players, 'me').map((x) => x.id)).toEqual(['bo', 'al', 'cat']);
  });

  it('is empty when you play alone', () => {
    expect(frameTargets([p('me', 0)], 'me')).toEqual([]);
  });
});

describe('pendingReward', () => {
  it('the oldest pending reward', () => {
    expect(pendingReward([r('b', 'pending', 20), r('a', 'pending', 10), r('c', 'cleaned', 1)])?.id).toBe('a');
  });

  it('null when none is pending', () => {
    expect(pendingReward([r('a', 'cleaned', 1), r('b', 'framed', 2), r('c', 'void', 3)])).toBeNull();
    expect(pendingReward([])).toBeNull();
  });
});
