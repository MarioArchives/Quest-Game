import { describe, expect, it } from 'vitest';
import { fastestNote, gmChecks, judgingOf, skipFine, submitRule, voteReward } from './judging';

const settings = { sideQuestSkipPenalty: 3 };

describe('judging', () => {
  it('defaults to a vote with GM checks', () => {
    expect(judgingOf({})).toBe('vote');
    expect(judgingOf({ judging: 'submit' })).toBe('submit');
    expect(gmChecks({})).toBe(true);
    expect(gmChecks({ gmChecks: false })).toBe(false);
  });

  it('takes the mission fine, else the setting', () => {
    expect(skipFine({ skipPenalty: 5 }, settings)).toBe(5);
    expect(skipFine({ skipPenalty: 0 }, settings)).toBe(0);
    expect(skipFine({}, settings)).toBe(3);
    expect(skipFine({ skipPenalty: null }, settings)).toBe(3);
  });

  it('words a Submit mission', () => {
    expect(submitRule({ bonusPoints: 10, fastestBonus: 5, skipPenalty: 4 }, settings)).toBe('Every entry earns +10, the fastest entry +5 more. No entry costs −4.');
    expect(submitRule({ bonusPoints: 10 }, { sideQuestSkipPenalty: 0 })).toBe('Every entry earns +10.');
  });

  it('words a Vote mission reward', () => {
    expect(voteReward({ bonusPoints: 10 })).toBe('+10 to the winner');
    expect(voteReward({ bonusPoints: 10, fastestBonus: 5 })).toBe('+10 to the winner · the fastest entry +5');
    expect(fastestNote({})).toBe('');
  });
});
