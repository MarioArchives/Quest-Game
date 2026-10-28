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
const textOf = (settings: Settings, title: string) => stopsFor(settings, mystery).find((s) => s.title === title)!.text;

/** The approved mock's words (Quest-Mocks src/mocks/tour/stops.ts, with the pack's settings in snap/rules.json). */
const APPROVED = [
  'Tonight will have several events. Live events will appear here. If more than one is on, tap the tabs to switch between them. Submit your entry before the time is up, or it’s −5.',
  'Several kinds of event can be triggered. Group events involve voting for the best answer.',
  'Periodic missions are just a submission of some kind: a way for the police to keep track of you.',
  'Story missions develop the plot of the murder. How they’re scored varies from mission to mission.',
  'Here you can see how the pub crawl stands and where other players are: where the crawl is up to, and what’s next.',
  'Everyone’s score, from zero: in the clear to the right, under suspicion to the left. Tap a face to open their file.',
  'How trusted or suspicious you are changes how the police treat you. Above the trusted confidant line, you can get the police to call others. Below the person of interest line, they call you now and then to check on you. Miss a police call and there’s a penalty; answer their questions right and there’s a reward.',
  'Swipe left or right to turn the page between Missions, Log book and My file. Or tap the tabs.',
  'React with a {heart} or an {eye} on log book updates. After 30 min, with at least 3 reactions, if you reacted the same as the majority you get +1 for good detective work! The post with the most {heart} gets +5 for its author.',
  'Everyone also has secret tampering missions! Complete them to clear your name or frame someone else: +5 to you, or −5 to someone else. Done one? Submit it to another player for approval.',
  'Is someone doing their secret tampering mission blatantly? Press charges against them: fill out Form 3.',
  'Search for the tampering mission’s name in the charge section. Then tap the one you think it is!',
  'Read the terms, then hold the red button to file. A charge can’t be taken back.',
  '−5 to them and +5 to you if your charge is sustained, and −5 to you if it’s dropped.',
  'Dropped: you −5, and nobody’s told. Then wait 10 min to charge Alex again.',
  'This phone is your line to the police. A person of interest gets rung on Telegram now and then: answer them in the chat. Case updates land there too.',
  'A trusted confidant’s phone lights up. Tap it and pick who to tip off.',
  'Say what you saw, then send. The police put it to them with a question: right, they gain 5; wrong, they lose 5.',
  'They get the call, and the log book names you and what you wrote. Your line rests a while after.',
];

describe('19. the tags’ words', () => {
  it('with the pack’s settings, every stop says what the approved mock says', () => {
    expect(mystery.settings.questPoints).toBe(0);
    expect(stopsFor(tonight, mystery).map((s) => s.text)).toEqual(APPROVED);
  });

  it('a mission that pays for itself says so before the reward', () => {
    expect(textOf({ ...tonight, questPoints: 5 }, 'Your missions')).toBe(
      'Everyone also has secret tampering missions! Each one confirmed is +5; then clear your name or frame someone else: +5 to you, or −5 to someone else. Done one? Submit it to another player for approval.',
    );
  });

  it('the numbers follow the settings', () => {
    const s: Settings = { ...tonight, sideQuestSkipPenalty: 3, cleanPoints: 3, framePoints: 2, verdictWindowMin: 45, verdictMinVotes: 4, verdictPoints: 2, topEntryPoints: 7, guessCooldownMin: 15, exposePenalty: 4, wrongGuessCost: 2 };
    expect(textOf(s, 'Live now')).toContain('before the time is up, or it’s −3.');
    expect(textOf(s, 'Your missions')).toContain('+3 to you, or −2 to someone else.');
    expect(textOf(s, 'Log book')).toContain('After 45 min, with at least 4 reactions, if you reacted the same as the majority you get +2 for good detective work!');
    expect(textOf(s, 'Log book')).toContain('gets +7 for its author.');
    expect(textOf(s, 'Sustained or dropped')).toBe('−4 to them and +5 to you if your charge is sustained, and −2 to you if it’s dropped.');
    expect(textOf(s, 'If you’re wrong')).toBe('Dropped: you −2, and nobody’s told. Then wait 15 min to charge Alex again.');
  });

  it('no skip fine ends the live line at the deadline; no cool-down drops the wait', () => {
    expect(textOf({ ...tonight, sideQuestSkipPenalty: 0 }, 'Live now')).toMatch(/Submit your entry before the time is up\.$/);
    expect(textOf({ ...tonight, guessCooldownMin: 0 }, 'If you’re wrong')).toBe('Dropped: you −5, and nobody’s told.');
  });

  it('a charge that moves no points says so', () => {
    expect(textOf({ ...tonight, exposePenalty: 0, correctGuessReward: 0, wrongGuessCost: 0 }, 'Sustained or dropped')).toBe(
      'Nothing if your charge is sustained, and nothing if it’s dropped.',
    );
    expect(textOf({ ...tonight, exposePenalty: 0 }, 'Sustained or dropped')).toBe('+5 to you if your charge is sustained, and −5 to you if it’s dropped.');
  });

  it('verdicts and the top entry off say less', () => {
    expect(textOf({ ...tonight, verdictPoints: 0, topEntryPoints: 0 }, 'Log book')).toBe(
      'React with a {heart} or an {eye} on log book updates. The post with the most {heart} is pinned on top.',
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

  it('the trusted-confidant and person-of-interest lines never give a number', () => {
    for (const s of [tonight, { ...tonight, confidantAbove: 25, poiBelow: -20 }]) expect(textOf(s, 'Trusted or watched')).not.toMatch(/\d/);
  });

  it('another rule set moves points its own way: no amounts on the tags', () => {
    const heist: Settings = { ...tonight, scoring: 'heist' };
    const pointy = ['Live now', 'Log book', 'Your missions', 'Sustained or dropped', 'If you’re wrong', 'What they’ve been up to'];
    for (const title of pointy) expect(textOf(heist, title)).not.toMatch(/[+−]\d|gain \d|lose \d/);
    expect(textOf(heist, 'Sustained or dropped')).toBe('Points off them and to you if your charge is sustained, and off you if it’s dropped.');
    // Counts and minutes are not points: they stay.
    expect(textOf(heist, 'If you’re wrong')).toContain('wait 10 min');
    expect(textOf(heist, 'Log book')).toContain('After 30 min, with at least 3 reactions');
  });

  it('every stop has words', () => {
    expect(stopsFor(tonight, mystery)).toHaveLength(STOPS.length);
    for (const s of stopsFor(tonight, mystery)) expect(s.text.length).toBeGreaterThan(20);
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
