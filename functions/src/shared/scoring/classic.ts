import type { TermForms } from '../packs/terms.ts';
import type { Features } from '../packs/types.ts';
import type { Settings } from '../types.ts';
import type { ScoreContext, ScoreEvent, ScoreLine, ScoringRules } from './types.ts';

/** Today's numbers; the other rule sets call this for the events they do not change. */
export function classicScore(event: ScoreEvent, ctx: ScoreContext): ScoreLine[] {
  const s = ctx.settings;
  switch (event.kind) {
    case 'questApproved':
      return [{ kind: 'points', uid: event.uid, delta: event.questPoints ?? s.questPoints, reason: 'quest' }];
    case 'claimRejected':
      return [{ kind: 'points', uid: event.uid, delta: -s.rejectPenalty, reason: 'rejected' }];
    case 'fraudFine':
      return [{ kind: 'points', uid: event.uid, delta: -s.fraudPenalty, reason: 'fraud' }];
    case 'guessRight':
      return [
        { kind: 'points', uid: event.target, delta: -s.exposePenalty, reason: 'exposed' },
        { kind: 'points', uid: event.guesser, delta: s.correctGuessReward, reason: 'guess-correct' },
      ];
    case 'guessWrong':
      return [{ kind: 'points', uid: event.guesser, delta: -s.wrongGuessCost, reason: 'guess-wrong' }];
    case 'sideQuestWon':
      return [{ kind: 'points', uid: event.uid, delta: event.bonus, reason: 'global-win' }];
    case 'sideQuestSkipped':
      return [{ kind: 'points', uid: event.uid, delta: -s.sideQuestSkipPenalty, reason: 'skipped' }];
    case 'rewardClean':
      return [{ kind: 'points', uid: event.uid, delta: s.cleanPoints, reason: 'cleared' }];
    case 'rewardFrame':
      return [{ kind: 'points', uid: event.target, delta: -s.framePoints, reason: 'framed' }];
  }
}


const ALL_ON: Features = { guesses: true, sideQuests: true, map: true };

/** Rows for everything except how a finished quest pays. */
export function sharedRows(s: Settings, t: TermForms, features: Features = ALL_ON): Array<[string, string]> {
  return [
    [`${t.claim.One} rejected`, `you lose ${s.rejectPenalty} and get a fresh ${t.quest.one}`],
    ...(features.sideQuests ? [[`${t.sideQuest.One} win`, `+${s.sideQuestPoints} for the most votes (ties all win)`] as [string, string]] : []),
    ...(features.sideQuests && s.sideQuestSkipPenalty > 0
      ? [[`${t.sideQuest.One} skipped`, `you lose ${s.sideQuestSkipPenalty} if you don't enter`] as [string, string]]
      : []),
    ...(features.rewardChoice
      ? [
          ['Clear your name', `+${s.cleanPoints} for you`] as [string, string],
          ['Frame someone', `they lose ${s.framePoints}, and nobody learns it was you`] as [string, string],
        ]
      : []),
    ...(features.guesses
      ? [
          ['Right guess', `they lose ${s.exposePenalty}, you gain ${s.correctGuessReward}`] as [string, string],
          ['Wrong guess', `you lose ${s.wrongGuessCost}`] as [string, string],
        ]
      : []),
    ['Overruled as fraud', `${t.gm.One} takes the points back, plus a ${s.fraudPenalty} fine`],
  ];
}

export const classic: ScoringRules = {
  id: 'classic',
  name: 'Classic',
  summary: 'Fixed points for everything; guesses cost the target and reward the guesser.',
  params: [],
  score: classicScore,
  describe(settings, _params, t, features) {
    return [[`${t.quest.One} points`, `+${settings.questPoints}`], ...sharedRows(settings, t, features)];
  },
};
