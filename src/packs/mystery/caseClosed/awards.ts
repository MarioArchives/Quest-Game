// Each award as the Evening Post prints it: its name and rubber stamp, a kicker, a headline written for tonight and
// a short story from the case file's numbers. One winner reads "Maya takes the title"; several share a headline. Pure.
import {
  AWARD_IDS,
  type AwardId,
  type CaseAward,
  type CaseLine,
  type CaseVerdict,
} from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { capitalise, listed, numberWord, plural, possessive } from './words';

export type StampTone = 'good' | 'bad' | 'warm' | 'plain';

/** The award's own name, stamp colour and icon (Stamp.tsx), and the section of the paper it runs in. */
export const AWARD_LOOK: Record<AwardId, { name: string; tone: StampTone; icon: string; kicker: string }> = {
  murderer: { name: 'Murderer', tone: 'bad', icon: 'knife', kicker: 'Case closed' },
  innocent: { name: 'Allegedly Innocent', tone: 'warm', icon: 'scales', kicker: 'Free to go' },
  called: { name: 'Most Called by Police', tone: 'plain', icon: 'phone', kicker: 'Police' },
  unresponsive: { name: 'Least Responsive', tone: 'bad', icon: 'mute', kicker: 'No comment' },
  popular: { name: 'Most Popular Submission', tone: 'good', icon: 'star', kicker: 'Log book' },
  snitch: { name: 'Biggest Snitch', tone: 'warm', icon: 'ear', kicker: 'Police' },
  hustler: { name: 'Greatest Hustler', tone: 'good', icon: 'coin', kicker: 'Business' },
  disliked: { name: 'Least Liked', tone: 'bad', icon: 'thumb', kicker: 'Letters' },
  puppet: { name: 'Puppet Master', tone: 'plain', icon: 'strings', kicker: 'Investigation' },
  sidepiece: { name: 'Whore', tone: 'bad', icon: 'lips', kicker: 'Exclusive' },
  champion: { name: 'Top of the Table', tone: 'good', icon: 'cup', kicker: 'Sport' },
  spoon: { name: 'Wooden Spoon', tone: 'bad', icon: 'spoon', kicker: 'Sport' },
  early: { name: 'Peaked Too Early', tone: 'warm', icon: 'peak', kicker: 'Sport' },
  brink: { name: 'Back from the Brink', tone: 'good', icon: 'rope', kicker: 'Comeback' },
  sharp: { name: 'Sharp Eye', tone: 'good', icon: 'eye', kicker: 'Investigation' },
  alibi: { name: 'Airtight Alibi', tone: 'good', icon: 'shield', kicker: 'Alibis' },
  pen: { name: 'Poison Pen', tone: 'bad', icon: 'pen', kicker: 'Motives' },
  untouchable: { name: 'Untouchable', tone: 'good', icon: 'glove', kicker: 'Crime' },
  fallguy: { name: 'Fall Guy', tone: 'bad', icon: 'target', kicker: 'Crime' },
  weapon: { name: 'Weapon of Choice', tone: 'warm', icon: 'corkscrew', kicker: 'Weapons' },
  scout: { name: 'Location Scout', tone: 'warm', icon: 'pin', kicker: 'Crime scene' },
  farewell: { name: 'Bob’s Favourite', tone: 'warm', icon: 'heart', kicker: 'Obituary' },
  lastseen: { name: 'Last Seen Alive', tone: 'warm', icon: 'clock', kicker: 'Police' },
  present: { name: 'Present and Correct', tone: 'plain', icon: 'tick', kicker: 'Roll call' },
  loyal: { name: 'Never Left His Side', tone: 'plain', icon: 'link', kicker: 'Tributes' },
  pet: { name: 'The GM’s Pet', tone: 'good', icon: 'apple', kicker: 'Diary' },
};

/** How many awards there are to win. */
export const AWARD_COUNT = AWARD_IDS.length;

export interface AwardContext {
  name: (uid: string) => string;
  timeline: readonly CaseLine[];
  verdict: CaseVerdict;
  /** "23:02" in the pack's zone. */
  time: (ms: number) => string;
  deathAt: number | null;
  /** Who told the booking desk they were Bob's lover, for the sidepiece story. */
  lovers: string[];
}

export interface AwardStory {
  id: AwardId;
  name: string;
  tone: StampTone;
  icon: string;
  kicker: string;
  headline: string;
  story: string;
  uids: string[];
}

/** "one missed, two passed": the non-zero parts, in words. */
function parts(items: Array<[number, string]>): string {
  return listed(items.filter(([n]) => n > 0).map(([n, what]) => `${numberWord(n)} ${what}`));
}

/** One winner's headline and story. */
function single(id: AwardId, uid: string, n: Record<string, number>, c: AwardContext): { headline: string; story: string } {
  const N = c.name(uid);
  switch (id) {
    case 'murderer':
      return { headline: `It was ${N}`, story: `${plural(n.votes, 'vote')} on the ${plural(n.photos, 'incriminating photo', 'incriminating photos', true)} that tag ${N}. Police have closed the case.` };
    case 'innocent':
      return { headline: `${N} “allegedly innocent”`, story: `Second-most incriminated, on ${plural(n.votes, 'vote')}. Police say ${N} is free to go, for now.` };
    case 'called':
      return {
        headline: `Police have ${N} on speed dial`,
        story: `${capitalise(plural(n.calls, 'check-in', 'check-ins', true))} in one night: ${parts([[n.missed, 'missed'], [n.failed, 'fluffed'], [n.passed, 'passed']])}.`,
      };
    case 'unresponsive':
      return {
        headline: `${N} “unavailable for comment”`,
        story: `${capitalise(
          listed(
            [
              n.police ? `missed ${plural(n.police, 'police call', 'police calls', true)}` : '',
              n.rollCalls ? `${n.police ? '' : 'missed '}${plural(n.rollCalls, 'roll call', 'roll calls', true)}` : '',
              n.skipped ? `skipped ${plural(n.skipped, 'story mission', 'story missions', true)}` : '',
            ].filter(Boolean),
          ),
        )}.`,
      };
    case 'popular':
      return { headline: `${possessive(N)} entry is the talk of the town`, story: `${n.up} Credible, ${n.down} Doubtful: top of the log book when the case closed.` };
    case 'snitch':
      return {
        headline: `Supergrass ${N} keeps the lines busy`,
        story: `${capitalise(plural(n.tips, 'tip-off', 'tip-offs', true))} to the police.${n.landed ? ` ${capitalise(numberWord(n.landed))} ended in a missed or fluffed check-in.` : ''}`,
      };
    case 'hustler':
      return {
        headline: `${possessive(N)} ${n.earned}-point graft`,
        story: `Earned ${n.earned} points before fines, more than anyone.${n.lost ? ` Gave ${n.lost} of them back.` : ' Kept every one.'}`,
      };
    case 'disliked':
      return {
        headline: `Readers doubt every word from ${N}`,
        story: `${capitalise(plural(n.doubtful, 'Doubtful stamp', 'Doubtful stamps', true))} across ${plural(n.posts, 'log-book post', 'log-book posts', true)}. “We don’t buy it,” say readers.`,
      };
    case 'puppet':
      return { headline: `${N} pulled the strings`, story: `${capitalise(plural(n.frames, 'frame', 'frames', true))} chosen as a reward. Whom ${N} framed stays sealed.` };
    case 'sidepiece':
      return {
        headline: 'Bob’s secret lover named',
        story: `${N} told the booking desk they were Bob’s sidepiece.${c.lovers.length ? ` Bob’s lover, ${listed(c.lovers)}, declined to comment.` : ''}`,
      };
    case 'champion':
      return { headline: `${N} takes the title`, story: `Finished on ${n.points}${n.lead > 0 ? `, ${n.lead} clear of the rest` : ''}.` };
    case 'spoon':
      return { headline: `${N} bottom on ${n.points < 0 ? `−${-n.points}` : n.points}`, story: 'Last in the table when the case closed.' };
    case 'early':
      return { headline: 'From top spot to rock bottom', story: `${N} led the table on ${n.peak} at ${c.time(n.at)}. Lost ${n.lost} points from there.` };
    case 'brink':
      return { headline: `${possessive(N)} great escape`, story: `A person of interest on −${-n.low} at ${c.time(n.at)}. A trusted confidant on ${n.points} at the close.` };
    case 'sharp':
      return {
        headline: `${N} cracks ${plural(n.upheld, 'case', 'cases', true)}`,
        story: `${capitalise(plural(n.made, 'charge', 'charges', true))} filed, ${numberWord(n.upheld)} upheld.`,
      };
    case 'alibi':
      return { headline: `“${N} was with me”`, story: `${possessive(N)} alibi video took ${plural(n.votes, 'vote')}, the most of any alibi.` };
    case 'pen': {
      const about = Object.entries(c.verdict.motiveBy).filter(([, by]) => by === uid).map(([killer]) => c.name(killer));
      return { headline: `${possessive(N)} motive read out in court`, story: `${N} wrote why ${listed(about)} did it. The case closed on ${listed(about)}.` };
    }
    case 'untouchable':
      return { headline: `Nobody laid a finger on ${N}`, story: `${capitalise(plural(n.missions, 'tampering mission', 'tampering missions', true))}, never exposed, never framed.` };
    case 'fallguy': {
      const when = c.timeline.filter((l) => l.uid === uid && l.reason === 'framed').map((l) => c.time(l.t));
      return { headline: `${N} framed ${numberWord(n.framed)} times`, story: `At ${listed(when)}. The Post protects its sources.` };
    }
    case 'weapon':
      return { headline: `${N} found the weapon`, story: `${possessive(N)} entry won Murder weapon with ${plural(n.votes, 'vote')}.` };
    case 'scout':
      return { headline: `${N} found the scene`, story: `${possessive(N)} photo won The room where it happened with ${plural(n.votes, 'vote')}.` };
    case 'farewell':
      return { headline: `${possessive(N)} tribute wins hearts`, story: `${possessive(N)} memory of Bob won The good old days with ${plural(n.votes, 'vote')}.` };
    case 'lastseen': {
      const before = c.deathAt !== null ? Math.round((c.deathAt - n.at) / 60_000) : null;
      return {
        headline: `${N} last to see Bob alive`,
        story: `${possessive(N)} roll-call answer at ${c.time(n.at)} came${before !== null ? ` ${plural(before, 'minute', 'minutes', true)}` : ''} before the time of death.`,
      };
    }
    case 'present':
      return { headline: `${N} answered every roll call`, story: `${capitalise(numberWord(n.answered))} out of ${numberWord(n.answered)}, on the hour.` };
    case 'loyal':
      return { headline: `${N} stood by Bob all night`, story: `Entered all ${plural(n.missions, 'story mission', 'story missions', true)}.` };
    case 'pet': {
      const note = [...c.timeline].reverse().find((l) => l.uid === uid && l.reason === 'adjust' && l.delta > 0)?.note;
      return { headline: `The GM rewards ${N}`, story: `+${n.points} from the GM by hand${note ? `: “${note.trim().replace(/[.!?]+$/, '')}”` : ''}.` };
    }
  }
}

/** Several winners on one headline. */
function shared(id: AwardId, uids: string[], c: AwardContext): { headline: string; story: string } {
  const names = listed(uids.map(c.name));
  const all = numberWord(uids.length);
  switch (id) {
    case 'murderer':
      return { headline: `It was ${names}`, story: 'Tied on the most votes on the incriminating photos. Police are charging them together.' };
    case 'champion':
      return { headline: `${names} share the title`, story: 'Level on points at the top when the case closed.' };
    case 'spoon':
      return { headline: `${names} share the spoon`, story: 'Level on points at the bottom when the case closed.' };
    case 'present':
      return { headline: `${capitalise(all)} answered every roll call`, story: `${names}, present and correct.` };
    case 'loyal':
      return { headline: `${capitalise(all)} stood by Bob all night`, story: `${names} entered every story mission.` };
    case 'sidepiece':
      return { headline: 'Bob’s secret lovers named', story: `${names} all told the booking desk they were Bob’s sidepiece.` };
    case 'weapon':
      return { headline: `${names} share the blame`, story: 'Their entries tied for Murder weapon. All of them are now the weapon.' };
    default:
      return { headline: `${capitalise(all)} share ${AWARD_LOOK[id].name}`, story: `${names}, level at the top.` };
  }
}

/** An award as one story: one winner's own words, or a shared headline. */
export function awardStory(award: CaseAward, c: AwardContext): AwardStory {
  const look = AWARD_LOOK[award.id];
  const words = award.uids.length === 1 ? single(award.id, award.uids[0], award.n[award.uids[0]] ?? {}, c) : shared(award.id, award.uids, c);
  return { id: award.id, ...look, ...words, uids: award.uids };
}

/** The award as told in one winner's own profile, even when it was shared. */
export function myStory(award: CaseAward, uid: string, c: AwardContext): AwardStory {
  const look = AWARD_LOOK[award.id];
  return { id: award.id, ...look, ...single(award.id, uid, award.n[uid] ?? {}, c), uids: [uid] };
}
