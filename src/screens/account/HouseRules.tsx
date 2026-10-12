import { resolveParams, resolveRules } from '../../../functions/src/shared/scoring/engine';
import { Icon } from '../../components/Icon';
import { useGame } from '../../data/GameProvider';
import { features, pack, t, zone } from '../../pack';

/** A zone id like "Europe/Paris" → "Paris time". */
const zoneName = `${(zone.timeZone.split('/').pop() ?? zone.timeZone).replace(/_/g, ' ')} time`;
const FRAUD = 'Overruled as fraud';

/** Collapsible, read-only view of the game settings the GM has chosen. */
export function HouseRules() {
  const { settings: s } = useGame();
  const quiet = s.quietHours ? `${s.quietHours.start}–${s.quietHours.end} (${zoneName})` : 'None';
  const rules = resolveRules(s, pack);
  // The rule set words the points rows; the fraud row stays last, where it always was.
  const points = rules.describe(s, resolveParams(rules, s.scoringParams), t, features);
  const rows: [string, string][] = [
    [`Secret ${t.quest.many} dealt`, String(s.starterQuestCount)],
    ['Rerolls per player', String(s.rerollLimit)],
    ['Scoring', rules.name],
    ...points.filter(([label]) => label !== FRAUD),
    ...(features.guesses ? ([['Guess cooldown', `1 per player every ${s.guessCooldownMin} min`]] as [string, string][]) : []),
    [
      `New ${t.quest.many}`,
      s.refillOnComplete
        ? 'A fresh one each time you complete one'
        : `${s.starterQuestCount} for the whole game; more only after ${features.guesses ? 'a rejection, an exposure or a reroll' : 'a rejection or a reroll'}`,
    ],
    [`${t.quest.One} named in the feed`, s.revealOnComplete ? 'Yes' : 'No'],
    ['Points can go below zero', s.pointsFloorZero ? 'No, floor at 0' : 'Yes'],
    ...(features.sideQuests
      ? ([
          [
            `${t.sideQuest.Many} drop`,
            `every ${s.globalIntervalMin}–${s.globalIntervalMax} min, open ${s.globalWindowMin} min (late entries count until the ${t.gm.One} starts the vote), then ${s.voteWindowMin} min of voting`,
          ],
          ['Quiet hours (no drops)', quiet],
        ] as [string, string][])
      : []),
    [`Who approves a ${t.claim.one}`, `A friend you name as ${t.witness.one} (never yourself)`],
    ...points.filter(([label]) => label === FRAUD),
  ];
  return (
    <details className="rules">
      <summary>
        <h2>House rules</h2>
        <Icon name="chevronDown" size={22} />
      </summary>
      <dl className="rules__list">
        {rows.map(([label, value]) => (
          <div key={label} className="rules__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
