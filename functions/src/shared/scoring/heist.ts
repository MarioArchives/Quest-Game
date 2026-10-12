import { classicScore, sharedRows } from './classic.ts';
import type { ScoringRules } from './types.ts';

export const heist: ScoringRules = {
  id: 'heist',
  name: 'Heist',
  summary: 'Guesses move points between players, and the approver earns a reward.',
  params: [
    {
      key: 'witnessReward',
      label: 'Approver reward',
      hint: 'Points earned by whoever approves a completion.',
      default: 10,
      min: 0,
      max: 1000,
    },
  ],
  score(event, ctx) {
    const s = ctx.settings;
    switch (event.kind) {
      case 'questApproved': {
        const lines = classicScore(event, ctx);
        const reward = ctx.params.witnessReward!;
        if (event.approver !== null && reward > 0) {
          lines.push({ kind: 'points', uid: event.approver, delta: reward, reason: 'witness' });
        }
        return lines;
      }
      case 'guessRight':
        return [
          { kind: 'transfer', from: event.target, to: event.guesser, amount: s.exposePenalty, fromReason: 'exposed', toReason: 'guess-correct' },
        ];
      case 'guessWrong':
        return [
          { kind: 'transfer', from: event.guesser, to: event.target, amount: s.wrongGuessCost, fromReason: 'guess-wrong', toReason: 'bounty' },
        ];
      default:
        return classicScore(event, ctx);
    }
  },
  describe(settings, params, t, features) {
    return [
      [`${t.quest.One} points`, `+${settings.questPoints}`],
      [`${t.witness.One} reward`, `+${params.witnessReward} for approving a ${t.claim.one}`],
      ...sharedRows(settings, t, features).map(([label, value]): [string, string] =>
        label === 'Right guess'
          ? [label, `you steal ${settings.exposePenalty} from them`]
          : label === 'Wrong guess'
            ? [label, `you pay ${settings.wrongGuessCost} to them`]
            : [label, value],
      ),
    ];
  },
};
