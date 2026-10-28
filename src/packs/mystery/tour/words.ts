// What each stop's tag says, worded from tonight's settings: the points (every move worth 5 in the pack's defaults),
// the log book's verdicts and top entry, the charges a night and the wait between them, the hand you're dealt, the roll
// call (the pack's periodic seed) and how the police reach a person of interest (Telegram, a phone call or the app).
// A rule set other than classic moves points its own way, so then the tags say "points" and give no numbers. The lines
// for a trusted confidant and a person of interest never give one either: the GM moves them. In the text, {heart} and
// {eye} are drawn as the log book's two marks. The specimen screens keep the demo's own numbers.
import { isTelegramPolice } from '../../../lib/telegram';
import { resolveRules } from '../../../../functions/src/shared/scoring/engine.ts';
import type { GamePack } from '../../../../functions/src/shared/packs/types.ts';
import type { Settings } from '../../../shared';
import { STOPS, type SayId, type Stop } from './stops';

export interface TourStop extends Stop {
  /** What the tag says, in handwriting. */
  text: string;
}

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
/** A count to start a sentence with: "Five", or the figure past twelve. */
const counted = (n: number) => COUNT[n] ?? String(n);
const plus = (n: number) => `+${n}`;
const minus = (n: number) => `−${n}`;

/** "every hour", "every 2 hours", "every 45 min". */
function every(min: number): string {
  if (min === 60) return 'every hour';
  if (min > 60 && min % 60 === 0) return `every ${min / 60} hours`;
  return `every ${min} min`;
}

/** Sentences, the empty ones left out. */
const lines = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

type Rules = Pick<
  Settings,
  | 'scoring'
  | 'questPoints'
  | 'cleanPoints'
  | 'framePoints'
  | 'sideQuestPoints'
  | 'sideQuestSkipPenalty'
  | 'voteStyle'
  | 'verdictPoints'
  | 'verdictWindowMin'
  | 'verdictMinVotes'
  | 'topEntryPoints'
  | 'starterQuestCount'
  | 'guessLimit'
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

type PackRules = Pick<GamePack, 'scoring' | 'periodics' | 'features' | 'catalogue'>;

/**
 * Every stop with its words for tonight. `missions` is how many tampering missions the charge sheet's book holds (the
 * active catalogue); 0 leaves the count out.
 */
export function stopsFor(settings: Rules, pack: PackRules, missions: number): TourStop[] {
  const s = settings;
  // Numbers only where the classic rules pay the settings' amounts as they stand.
  const n = resolveRules(s, pack).id === 'classic';
  const roll = pack.features.checkins ? (pack.periodics?.[0] ?? null) : null;
  const story = (pack.catalogue.story?.length ?? 0) > 0;
  const yesno = s.voteStyle === 'yesno';
  const telegram = s.policePhone && isTelegramPolice(s);

  const say: Record<SayId, string> = {
    live: lines(
      'What’s live sits in front.',
      roll &&
        `${roll.name} comes ${every(roll.intervalMin)}: one photo or a comment within ${roll.windowMin} min${roll.penalty > 0 ? `, or ${n ? minus(roll.penalty) : 'a fine'}` : ''}.`,
      'Tap a tab behind to pull another forward.',
    ),
    events: lines(
      pack.features.sideQuests &&
        `Group events drop at any time: everyone sends a photo, then ${yesno ? 'yes or no on each' : 'everyone picks one'}. ${yesno ? 'Most yeses' : 'Most votes'} wins ${n ? plus(s.sideQuestPoints) : 'points'}${
          s.sideQuestSkipPenalty > 0 ? `; sit it out, ${n ? minus(s.sideQuestSkipPenalty) : 'and you’re fined'}` : ''
        }.`,
      story && 'Story chapters open as the GM tells the case.',
    ),
    map: 'The route, one bar at a time: the GM reveals each stop as you go. Now and Next up top; the faces are players sharing where they are.',
    standings: 'Everyone’s score, from zero: in the clear to the right, under suspicion to the left. Tap a face to open their file.',
    'standing-lines':
      'Climb past a set score and you’re a trusted confidant: you can tip off the police about someone. Sink below one and you’re a person of interest: the police ring you.',
    swipe: 'Swipe left or right to turn the page between Missions, Log book and My file. Or tap the tabs.',
    logbook: lines(
      'A {heart} or an {eye} on anyone else’s entry, one pick each.',
      s.verdictPoints > 0 &&
        `Counts show once you pick. After ${s.verdictWindowMin} min, with ${s.verdictMinVotes}+ picks, the majority wins: ${n ? `${plus(s.verdictPoints)} to its side` : 'points to its side'}.`,
      s.topEntryPoints > 0
        ? `Most hearts less eyes is pinned on top: ${n ? `${plus(s.topEntryPoints)} to its player` : 'points to its player'} while it stays.`
        : 'Most hearts less eyes is pinned on top.',
    ),
    missions: lines(`${counted(s.starterQuestCount)} secret ${s.starterQuestCount === 1 ? 'one' : 'ones'}.`, missionPay(s, pack, n)),
    accuse: lines(
      'Know what someone’s up to? Tap their face on Standings to open their file, then charge them on Form 3.',
      s.guessLimit > 0 && `${counted(s.guessLimit)} ${s.guessLimit === 1 ? 'charge' : 'charges'} a night.`,
    ),
    search: lines('Type any word from the mission you think they’re on, then tap it.', missions > 0 && `All ${missions} are in the book.`),
    sign: 'Read the terms, then hold the red button to file. A charge can’t be taken back.',
    upheld: lines(
      n ? `Upheld: you ${plus(s.correctGuessReward)}, Alex ${minus(s.exposePenalty)}.` : 'Upheld: points to you, off Alex.',
      'Everyone sees it in the log book, and Alex is dealt a fresh mission.',
    ),
    wrong: lines(
      `Dismissed: ${!n ? 'you lose points' : s.wrongGuessCost > 0 ? `you ${minus(s.wrongGuessCost)}` : 'no fine'}, and nobody’s told.`,
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

/** A confirmed mission: what it pays itself (nothing in the pack's own rules), then the reward choice. */
function missionPay(s: Rules, pack: PackRules, n: boolean): string {
  const ask = 'Done one? Submit it and name a witness: once they confirm,';
  const own = s.questPoints > 0 ? (n ? plus(s.questPoints) : 'it scores') : null;
  if (!pack.features.rewardChoice) return `${ask} ${own ?? 'it’s on your file'}.`;
  const choice = n
    ? `destroy the evidence (${plus(s.cleanPoints)}) or frame someone (${minus(s.framePoints)} to them).`
    : 'destroy the evidence (points to you) or frame someone (points off them).';
  return own ? `${ask} ${own}. Then ${choice}` : `${ask} ${choice}`;
}
