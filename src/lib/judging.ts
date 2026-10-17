// How a side quest is judged, in the words its card prints. Pure, so the rule lines are testable.
import type { GlobalQuest, Judging, Settings } from '../shared';

export type JudgedQuest = Pick<GlobalQuest, 'bonusPoints'> & Partial<Pick<GlobalQuest, 'judging' | 'gmChecks' | 'skipPenalty' | 'fastestBonus'>>;

/** Missing = 'vote'. */
export const judgingOf = (quest: Pick<GlobalQuest, 'judging'>): Judging => quest.judging ?? 'vote';

/** True when the GM checks the entries before the vote (missing = true; story missions turn it off). */
export const gmChecks = (quest: Pick<GlobalQuest, 'gmChecks'>): boolean => quest.gmChecks !== false;

/** The fine for not entering: the mission's own, else the setting. */
export const skipFine = (quest: Pick<GlobalQuest, 'skipPenalty'>, settings: Pick<Settings, 'sideQuestSkipPenalty'>): number =>
  quest.skipPenalty ?? settings.sideQuestSkipPenalty;

/** "the fastest entry +5", or '' when there is no bonus. */
export const fastestNote = (quest: Pick<GlobalQuest, 'fastestBonus'>): string => ((quest.fastestBonus ?? 0) > 0 ? `the fastest entry +${quest.fastestBonus}` : '');

/**
 * What a Submit mission pays, one sentence: "Every entry earns +10, the fastest entry +5 more. No entry costs −5."
 * (The fine is left out when it is 0.)
 */
export function submitRule(quest: JudgedQuest, settings: Pick<Settings, 'sideQuestSkipPenalty'>): string {
  const fastest = (quest.fastestBonus ?? 0) > 0 ? `, the fastest entry +${quest.fastestBonus} more` : '';
  const fine = skipFine(quest, settings);
  return `Every entry earns +${quest.bonusPoints}${fastest}.${fine > 0 ? ` No entry costs −${fine}.` : ''}`;
}

/** The ending of a Vote mission's rule: "+10 to the winner" and, with a bonus, "the fastest entry +5". */
export function voteReward(quest: JudgedQuest): string {
  const fastest = fastestNote(quest);
  return `+${quest.bonusPoints} to the winner${fastest ? ` · ${fastest}` : ''}`;
}
