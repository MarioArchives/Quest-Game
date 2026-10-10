import { Icon } from '../../components/Icon';
import { useGame } from '../../data/GameProvider';

/** Collapsible, read-only view of the game settings the GM has chosen. */
export function HouseRules() {
  const { settings: s } = useGame();
  const quiet = s.quietHours ? `${s.quietHours.start}–${s.quietHours.end} (UK time)` : 'None';
  const rows: [string, string][] = [
    ['Secret quests dealt', String(s.starterQuestCount)],
    ['Rerolls per player', String(s.rerollLimit)],
    ['Quest points', `+${s.questPoints}`],
    ['Claim rejected', `you lose ${s.rejectPenalty} and get a fresh quest`],
    ['Side quest win', `+${s.sideQuestPoints} for the most votes (ties all win)`],
    ['Side quest entry', s.globalEntryPoints ? `+${s.globalEntryPoints}` : 'No points'],
    ['Right guess', `they lose ${s.exposePenalty}, you gain ${s.correctGuessReward}`],
    ['Wrong guess', `you lose ${s.wrongGuessCost}`],
    ['Guess cooldown', `1 per player every ${s.guessCooldownMin} min`],
    ['New quest after a win', s.refillOnComplete ? 'Yes, you get a fresh one' : 'No'],
    ['Quest named in the feed', s.revealOnComplete ? 'Yes' : 'No'],
    ['Points can go below zero', s.pointsFloorZero ? 'No, floor at 0' : 'Yes'],
    ['Side quests drop', `every ${s.globalIntervalMin}–${s.globalIntervalMax} min, open ${s.globalWindowMin} min, then ${s.voteWindowMin} min of voting`],
    ['Quiet hours (no drops)', quiet],
    ['Who approves a claim', 'A friend you name as witness (never yourself)'],
    ['Overruled as fraud', `GM takes the points back, plus a ${s.fraudPenalty} fine`],
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
