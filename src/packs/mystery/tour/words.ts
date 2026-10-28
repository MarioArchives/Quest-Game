// What each stop's tag says, worded from tonight's settings: the points (every move worth 5 in the pack's defaults),
// what agreeing with the log book's majority pays, what a tampering mission pays, whether there are rerolls and what a
// charge moves either way. A rule set other than classic moves points its own way, so then the tags give no numbers.
// The lines for a trusted confidant and a person of interest never give one either: the GM moves them. In the text,
// {heart} and {eye} are drawn as the log book's two marks. The specimen screens keep the demo's own numbers.
import { resolveRules } from '../../../../functions/src/shared/scoring/engine.ts';
import type { GamePack } from '../../../../functions/src/shared/packs/types.ts';
import type { Settings } from '../../../shared';
import { STOPS, type SayId, type Stop } from './stops';

export interface TourStop extends Stop {
  /** What the tag says, in handwriting. */
  text: string;
}

const plus = (n: number) => `+${n}`;
const minus = (n: number) => `−${n}`;

/** Sentences, the empty ones left out. */
const lines = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/** "they lose 5 and you gain 5": what one outcome moves, or null when it moves nothing. */
const both = (...parts: Array<string | false>) => parts.filter(Boolean).join(' and ') || null;

type Rules = Pick<
  Settings,
  | 'scoring'
  | 'questPoints'
  | 'cleanPoints'
  | 'framePoints'
  | 'rerollLimit'
  | 'sideQuestSkipPenalty'
  | 'verdictPoints'
  | 'correctGuessReward'
  | 'exposePenalty'
  | 'wrongGuessCost'
>;

type PackRules = Pick<GamePack, 'scoring' | 'features'>;

/** Every stop with its words for tonight. */
export function stopsFor(settings: Rules, pack: PackRules): TourStop[] {
  const s = settings;
  // Numbers only where the classic rules pay the settings' amounts as they stand.
  const n = resolveRules(s, pack).id === 'classic';
  const right = n ? both(s.exposePenalty > 0 && `they lose ${s.exposePenalty}`, s.correctGuessReward > 0 && `you gain ${s.correctGuessReward}`) : 'they lose points';
  const wrong = n ? (s.wrongGuessCost > 0 ? `you lose ${s.wrongGuessCost}` : null) : 'you do';

  const say: Record<SayId, string> = {
    live: `Active missions appear here. Submit your answer before the time runs out${s.sideQuestSkipPenalty > 0 ? ', or you’ll get a penalty' : ''}.`,
    kinds: 'Here you can see the different kinds of mission that will appear.',
    map: 'The current pub and everyone’s location can be seen here!',
    standings: 'Player scores are found here.',
    'standing-lines': 'The police check on suspicious players, and trust the word of trustworthy ones!',
    logbook: lines(
      'React with a {heart} or an {eye} on log book updates.',
      s.verdictPoints > 0 && `If yours matches the majority, you look less suspicious${n ? ` (${plus(s.verdictPoints)})` : ''}.`,
    ),
    missions: lines(
      'Everyone has secret tampering missions.',
      missionPay(s, pack, n),
      'Once done, submit it for approval.',
      s.rerollLimit > 0 && 'You can also reroll any that seem too hard.',
    ),
    accuse: 'Is someone doing their secret tampering missions blatantly? Call them out!',
    search: 'Search for the secret mission’s name and tap the one you think they have.',
    sign: lines('Sure? Hold the red button to charge them.', right && `If you’re right, ${right}.`, wrong && `If you’re wrong, ${wrong}.`),
  };
  return STOPS.map((stop) => ({ ...stop, text: say[stop.say] }));
}

/** A tampering mission: what a confirmed one pays itself (nothing in the pack's own rules), then the reward choice. */
function missionPay(s: Rules, pack: PackRules, n: boolean): string {
  const own = s.questPoints > 0 && `Each one confirmed is ${n ? plus(s.questPoints) : 'worth points'}.`;
  if (!pack.features.rewardChoice) return lines(own);
  const choice = n
    ? `destroy incriminating evidence (${plus(s.cleanPoints)}) or frame someone else (${minus(s.framePoints)})`
    : 'destroy incriminating evidence or frame someone else';
  return lines(own, `Each one lets you ${choice}.`);
}
