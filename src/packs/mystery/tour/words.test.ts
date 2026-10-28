// Torch tour plan edge cases 19–20: what the tags say follows tonight's settings, and with the pack's own it is the
// approved mock word for word (but for the reward rule: a confirmed mission pays only through its reward).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultSettingsFor, getPack } from '../../../../functions/src/shared/packs/index.ts';
import type { Settings } from '../../../shared';
import { TagText, tagWords } from './HangTag';
import { STOPS } from './stops';
import { stopsFor } from './words';

const mystery = getPack('mystery');
/** The pack's settings, with the police on Telegram as on the night. */
const tonight: Settings = { ...defaultSettingsFor(mystery), policeTelegram: 'mmp_police' };
const MISSIONS = 92;
const textOf = (settings: Settings, title: string, missions = MISSIONS) => stopsFor(settings, mystery, missions).find((s) => s.title === title)!.text;

/** The approved mock's words (Quest-Mocks src/mocks/tour/stops.ts), "Your missions" as the reward rule now has it. */
const APPROVED = [
  'What’s live sits in front. Roll call comes every hour: one photo or a comment within 15 min, or −5. Tap a tab behind to pull another forward.',
  'Group events drop at any time: everyone sends a photo, then yes or no on each. Most yeses wins +5; sit it out, −5. Story chapters open as the GM tells the case.',
  'The route, one bar at a time: the GM reveals each stop as you go. Now and Next up top; the faces are players sharing where they are.',
  'Everyone’s score, from zero: in the clear to the right, under suspicion to the left. Tap a face to open their file.',
  'Climb past a set score and you’re a trusted confidant: you can tip off the police about someone. Sink below one and you’re a person of interest: the police ring you.',
  'Swipe left or right to turn the page between Missions, Log book and My file. Or tap the tabs.',
  'A {heart} or an {eye} on anyone else’s entry, one pick each. Counts show once you pick. After 30 min, with 3+ picks, the majority wins: +1 to its side. Most hearts less eyes is pinned on top: +5 to its player while it stays.',
  'Five secret ones. Done one? Submit it and name a witness: once they confirm, destroy the evidence (+5) or frame someone (−5 to them).',
  'Know what someone’s up to? Tap their face on Standings to open their file, then charge them on Form 3. Three charges a night.',
  'Type any word from the mission you think they’re on, then tap it. All 92 are in the book.',
  'Read the terms, then hold the red button to file. A charge can’t be taken back.',
  'Upheld: you +5, Alex −5. Everyone sees it in the log book, and Alex is dealt a fresh mission.',
  'Dismissed: you −5, and nobody’s told. Then wait 10 min to charge Alex again.',
  'This phone is your line to the police. A person of interest gets rung on Telegram now and then: answer them in the chat. Case updates land there too.',
  'A trusted confidant’s phone lights up. Tap it and pick who to tip off.',
  'Say what you saw, then send. The police put it to them with a question: right, they gain 5; wrong, they lose 5.',
  'They get the call, and the log book names you and what you wrote. Your line rests a while after.',
];

describe('19. the tags’ words', () => {
  it('with the pack’s settings, every stop says what the approved mock says', () => {
    expect(mystery.settings.questPoints).toBe(0);
    expect(stopsFor(tonight, mystery, MISSIONS).map((s) => s.text)).toEqual(APPROVED);
  });

  it('a mission that pays for itself says so before the reward', () => {
    expect(textOf({ ...tonight, questPoints: 5 }, 'Your missions')).toBe(
      'Five secret ones. Done one? Submit it and name a witness: once they confirm, +5. Then destroy the evidence (+5) or frame someone (−5 to them).',
    );
  });

  it('the numbers follow the settings', () => {
    const s: Settings = { ...tonight, starterQuestCount: 4, cleanPoints: 3, framePoints: 2, verdictWindowMin: 45, verdictMinVotes: 4, verdictPoints: 2, topEntryPoints: 7, guessCooldownMin: 15, guessLimit: 2 };
    expect(textOf(s, 'Your missions')).toContain('Four secret ones.');
    expect(textOf(s, 'Your missions')).toContain('destroy the evidence (+3) or frame someone (−2 to them).');
    expect(textOf(s, 'Log book')).toContain('After 45 min, with 4+ picks, the majority wins: +2 to its side.');
    expect(textOf(s, 'Log book')).toContain('+7 to its player');
    expect(textOf(s, 'If you’re wrong')).toContain('wait 15 min');
    expect(textOf(s, 'Accuse someone')).toContain('Two charges a night.');
    expect(textOf(tonight, 'Name the mission', 110)).toContain('All 110 are in the book.');
  });

  it('no limit on charges drops the sentence; no cool-down drops the wait', () => {
    expect(textOf({ ...tonight, guessLimit: 0 }, 'Accuse someone')).toBe(
      'Know what someone’s up to? Tap their face on Standings to open their file, then charge them on Form 3.',
    );
    expect(textOf({ ...tonight, guessCooldownMin: 0 }, 'If you’re wrong')).toBe('Dismissed: you −5, and nobody’s told.');
  });

  it('verdicts and the top entry off say less', () => {
    expect(textOf({ ...tonight, verdictPoints: 0, topEntryPoints: 0 }, 'Log book')).toBe(
      'A {heart} or an {eye} on anyone else’s entry, one pick each. Most hearts less eyes is pinned on top.',
    );
  });

  it('the police wording follows the line: Telegram (with or without case updates), a phone call, or the app', () => {
    const police = (s: Partial<Settings>) => textOf({ ...tonight, ...s }, 'The police');
    expect(police({})).toContain('rung on Telegram now and then: answer them in the chat. Case updates land there too.');
    expect(police({ policeNotices: false })).toBe('This phone is your line to the police. A person of interest gets rung on Telegram now and then: answer them in the chat.');
    expect(police({ policeTelegram: '', policeTelegramNumber: '' })).toBe(
      'This phone is your line to the police. A person of interest gets a phone call now and then: key in the answer.',
    );
    expect(police({ policePhone: false })).toBe('This phone is your line to the police. A person of interest gets a check-in now and then: answer it in the app.');
  });

  it('a pick-one vote is worded as one', () => {
    expect(textOf({ ...tonight, voteStyle: 'pick' }, 'Group events and story')).toContain('then everyone picks one. Most votes wins +5');
  });

  it('the trusted-confidant and person-of-interest lines never give a number', () => {
    for (const s of [tonight, { ...tonight, confidantAbove: 25, poiBelow: -20 }]) expect(textOf(s, 'Trusted or watched')).not.toMatch(/\d/);
  });

  it('another rule set moves points its own way: no amounts on the tags', () => {
    const heist: Settings = { ...tonight, scoring: 'heist' };
    const pointy = ['Live now', 'Group events and story', 'Log book', 'Your missions', 'If you’re right', 'If you’re wrong', 'What they’ve been up to'];
    for (const title of pointy) expect(textOf(heist, title)).not.toMatch(/[+−]\d|gain \d|lose \d/);
    expect(textOf(heist, 'If you’re right')).toBe('Upheld: points to you, off Alex. Everyone sees it in the log book, and Alex is dealt a fresh mission.');
    // Counts and minutes are not points: they stay.
    expect(textOf(heist, 'Accuse someone')).toContain('Three charges a night.');
    expect(textOf(heist, 'Log book')).toContain('After 30 min');
  });

  it('every stop has words', () => {
    expect(stopsFor(tonight, mystery, MISSIONS)).toHaveLength(STOPS.length);
    for (const s of stopsFor(tonight, mystery, 0)) expect(s.text.length).toBeGreaterThan(20);
  });
});

describe('20. the eye and the heart in the handwriting', () => {
  it('are drawn as marks a screen reader names', () => {
    const html = renderToStaticMarkup(createElement(TagText, { text: 'A {heart} or an {eye} each.' }));
    expect(html).toContain('role="img" aria-label="heart"');
    expect(html).toContain('role="img" aria-label="eye"');
    expect(html).not.toContain('{heart}');
    expect(html.startsWith('A ')).toBe(true);
  });

  it('read out by name in the plain words', () => {
    expect(tagWords('A {heart} or an {eye}')).toBe('A heart or an eye');
  });
});
