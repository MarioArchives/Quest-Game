import { classicScore, sharedRows } from './classic.ts';
import type { ScoringRules } from './types.ts';

const HOUR_MS = 3_600_000;

export const countdown: ScoringRules = {
  id: 'countdown',
  name: 'Countdown',
  summary: 'Completions pay less the longer the game has run, down to a floor.',
  params: [
    {
      key: 'decayPctPerHour',
      label: 'Decay per hour (%)',
      hint: 'How much of its full value a completion loses each hour since the game started.',
      default: 5,
      min: 0,
      max: 100,
    },
    {
      key: 'floorPct',
      label: 'Floor (%)',
      hint: 'A completion never pays less than this share of its full value.',
      default: 25,
      min: 0,
      max: 100,
    },
  ],
  score(event, ctx) {
    if (event.kind !== 'questApproved') return classicScore(event, ctx);
    const base = event.questPoints ?? ctx.settings.questPoints;
    const hours = ctx.startedAt && ctx.now > ctx.startedAt ? (ctx.now.getTime() - ctx.startedAt.getTime()) / HOUR_MS : 0;
    const pct = Math.max(ctx.params.floorPct!, 100 - ctx.params.decayPctPerHour! * hours);
    return [{ kind: 'points', uid: event.uid, delta: (base * pct) / 100, reason: 'quest' }];
  },
  describe(settings, params, t, features) {
    return [
      [`${t.quest.One} points`, `+${settings.questPoints}, losing ${params.decayPctPerHour}% per hour, never below ${params.floorPct}%`],
      ['Decay per hour', `${params.decayPctPerHour}%`],
      ['Lowest payout', `${params.floorPct}% of full value`],
      ...sharedRows(settings, t, features),
    ];
  },
};
