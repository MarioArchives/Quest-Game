// What each stop's tag says, worded from tonight's settings: the points (every move worth 5 in the pack's defaults),
// the log book's verdicts and top entry, the wait between charges, what a tampering mission pays and how the police
// reach a person of interest (Telegram, a phone call or the app). A rule set other than classic moves points its own
// way, so then the tags say "points" and give no numbers. The lines for a trusted confidant and a person of interest
// never give one either: the GM moves them. In the text, {heart} and {eye} are drawn as the log book's two marks. The
// specimen screens keep the demo's own numbers.
import { isTelegramPolice } from '../../../lib/telegram';
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

/** "−5 to them and +5 to you": what one outcome moves, or nothing. */
const moves = (...parts: Array<string | false>) => parts.filter(Boolean).join(' and ') || 'nothing';

/** A sentence with its first letter up. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Rules = Pick<
  Settings,
  | 'scoring'
  | 'questPoints'
  | 'cleanPoints'
  | 'framePoints'
  | 'sideQuestSkipPenalty'
  | 'verdictPoints'
  | 'verdictWindowMin'
  | 'verdictMinVotes'
  | 'topEntryPoints'
  | 'guessCooldownMin'
  | 'correctGuessReward'
  | 'exposePenalty'
  | 'wrongGuessCost'
  | 'policePhone'
  | 'policeNotices'
  | 'policeTelegram'
  | 'policeTelegramNumber'
  | 'policePassPoints'
  | 'policeFailPenalty'
>;

type PackRules = Pick<GamePack, 'scoring' | 'features'>;

/** Every stop with its words for tonight. */
export function stopsFor(settings: Rules, pack: PackRules): TourStop[] {
  const s = settings;
  // Numbers only where the classic rules pay the settings' amounts as they stand.
  const n = resolveRules(s, pack).id === 'classic';
  const telegram = s.policePhone && isTelegramPolice(s);

  const say: Record<SayId, string> = {
    live: lines(
      'Tonight will have several events. Live events will appear here. If more than one is on, tap the tabs to switch between them.',
      `Submit your entry before the time is up${s.sideQuestSkipPenalty > 0 ? `, or it’s ${n ? minus(s.sideQuestSkipPenalty) : 'a fine'}` : ''}.`,
    ),
    events: 'Several kinds of event can be triggered. Group events involve voting for the best answer.',
    periodic: 'Periodic missions are just a submission of some kind: a way for the police to keep track of you.',
    story: 'Story missions develop the plot of the murder. How they’re scored varies from mission to mission.',
    map: 'Here you can see how the pub crawl stands and where other players are: where the crawl is up to, and what’s next.',
    standings: 'Everyone’s score, from zero: in the clear to the right, under suspicion to the left. Tap a face to open their file.',
    'standing-lines':
      'How trusted or suspicious you are changes how the police treat you. Above the trusted confidant line, you can get the police to call others. Below the person of interest line, they call you now and then to check on you. Miss a police call and there’s a penalty; answer their questions right and there’s a reward.',
    swipe: 'Swipe left or right to turn the page between Missions, Log book and My file. Or tap the tabs.',
    logbook: lines(
      'React with a {heart} or an {eye} on log book updates.',
      s.verdictPoints > 0 &&
        `After ${s.verdictWindowMin} min, with at least ${s.verdictMinVotes} reactions, if you reacted the same as the majority you get ${n ? plus(s.verdictPoints) : 'points'} for good detective work!`,
      s.topEntryPoints > 0
        ? `The post with the most {heart} gets ${n ? plus(s.topEntryPoints) : 'points'} for its author.`
        : 'The post with the most {heart} is pinned on top.',
    ),
    missions: lines('Everyone also has secret tampering missions!', missionPay(s, pack, n), 'Done one? Submit it to another player for approval.'),
    accuse: 'Is someone doing their secret tampering mission blatantly? Press charges against them: fill out Form 3.',
    search: 'Search for the tampering mission’s name in the charge section. Then tap the one you think it is!',
    sign: 'Read the terms, then hold the red button to file. A charge can’t be taken back.',
    upheld: n
      ? sentence(
          `${moves(s.exposePenalty > 0 && `${minus(s.exposePenalty)} to them`, s.correctGuessReward > 0 && `${plus(s.correctGuessReward)} to you`)} if your charge is sustained, and ${moves(s.wrongGuessCost > 0 && `${minus(s.wrongGuessCost)} to you`)} if it’s dropped.`,
        )
      : 'Points off them and to you if your charge is sustained, and off you if it’s dropped.',
    wrong: lines(
      `Dropped: ${!n ? 'you lose points' : s.wrongGuessCost > 0 ? `you ${minus(s.wrongGuessCost)}` : 'no fine'}, and nobody’s told.`,
      s.guessCooldownMin > 0 && `Then wait ${s.guessCooldownMin} min to charge Alex again.`,
    ),
    police: lines(
      'This phone is your line to the police.',
      telegram
        ? 'A person of interest gets rung on Telegram now and then: answer them in the chat.'
        : s.policePhone
          ? 'A person of interest gets a phone call now and then: key in the answer.'
          : 'A person of interest gets a check-in now and then: answer it in the app.',
      telegram && s.policeNotices && 'Case updates land there too.',
    ),
    tip: 'A trusted confidant’s phone lights up. Tap it and pick who to tip off.',
    'tip-note': lines(
      'Say what you saw, then send.',
      n
        ? `The police put it to them with a question: right, they gain ${s.policePassPoints}; wrong, they lose ${s.policeFailPenalty}.`
        : 'The police put it to them with a question: right, they gain points; wrong, they lose some.',
    ),
    'tip-call': 'They get the call, and the log book names you and what you wrote. Your line rests a while after.',
  };
  return STOPS.map((stop) => ({ ...stop, text: say[stop.say] }));
}

/** A tampering mission: what a confirmed one pays itself (nothing in the pack's own rules), then the reward choice. */
function missionPay(s: Rules, pack: PackRules, n: boolean): string {
  const own = s.questPoints > 0 ? (n ? plus(s.questPoints) : 'points') : null;
  if (!pack.features.rewardChoice) return own ? `Each one confirmed is ${own}.` : '';
  const choice = n ? `${plus(s.cleanPoints)} to you, or ${minus(s.framePoints)} to someone else` : 'points to you, or off someone else';
  return own
    ? `Each one confirmed is ${own}; then clear your name or frame someone else: ${choice}.`
    : `Complete them to clear your name or frame someone else: ${choice}.`;
}
