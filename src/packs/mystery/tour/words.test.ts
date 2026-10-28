// Torch tour plan edge cases 19–20: what the tags say follows tonight's settings, and with the pack's own it is the
// shortened intro (shortened-intro.md, 2026-10-28) word for word, tidied; stop 2 follows the Missions tab's Still open.
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

/** The shortened intro's words, in the tour's order. */
const APPROVED = [
  'Active missions appear here. Submit your answer before the time runs out, or you’ll get a penalty.',
  'Once you’ve submitted, a mission waits here until it closes, so you can still change your answer. Closed ones are filed below.',
  'The current pub and everyone’s location can be seen here!',
  'Player scores are found here.',
  'The police check on suspicious players, and trust the word of trustworthy ones!',
  'React with a {heart} or an {eye} on log book updates. If yours matches the majority, you look less suspicious (+1).',
  'Everyone has secret tampering missions. Each one lets you destroy incriminating evidence (+5) or frame someone else (−5). Once done, submit it for approval. You can also reroll any that seem too hard.',
  'Is someone doing their secret tampering missions blatantly? Call them out!',
  'Search for the secret mission’s name and tap the one you think they have.',
  'Sure? Hold the red button to charge them. If you’re right, they lose 5 and you gain 5. If you’re wrong, you lose 5.',
];

describe('19. the tags’ words', () => {
  it('with the pack’s settings, every stop says what the shortened intro says', () => {
    expect(mystery.settings.questPoints).toBe(0);
    expect(stopsFor(tonight, mystery).map((s) => s.text)).toEqual(APPROVED);
  });

  it('a mission that pays for itself says so before the reward', () => {
    expect(textOf({ ...tonight, questPoints: 5 }, 'Your missions')).toBe(
      'Everyone has secret tampering missions. Each one confirmed is +5. Each one lets you destroy incriminating evidence (+5) or frame someone else (−5). Once done, submit it for approval. You can also reroll any that seem too hard.',
    );
  });

  it('the numbers follow the settings', () => {
    const s: Settings = { ...tonight, cleanPoints: 3, framePoints: 2, verdictPoints: 2, exposePenalty: 4, correctGuessReward: 6, wrongGuessCost: 2 };
    expect(textOf(s, 'Your missions')).toContain('destroy incriminating evidence (+3) or frame someone else (−2).');
    expect(textOf(s, 'Log book')).toContain('you look less suspicious (+2).');
    expect(textOf(s, 'Charge them')).toBe('Sure? Hold the red button to charge them. If you’re right, they lose 4 and you gain 6. If you’re wrong, you lose 2.');
  });

  it('no skip fine ends the live line at the deadline; no rerolls leaves them out', () => {
    expect(textOf({ ...tonight, sideQuestSkipPenalty: 0 }, 'Active missions')).toMatch(/Submit your answer before the time runs out\.$/);
    expect(textOf({ ...tonight, rerollLimit: 0 }, 'Your missions')).not.toContain('reroll');
  });

  it('a charge that moves no points leaves that outcome out', () => {
    expect(textOf({ ...tonight, exposePenalty: 0, correctGuessReward: 0, wrongGuessCost: 0 }, 'Charge them')).toBe('Sure? Hold the red button to charge them.');
    expect(textOf({ ...tonight, exposePenalty: 0 }, 'Charge them')).toBe('Sure? Hold the red button to charge them. If you’re right, you gain 5. If you’re wrong, you lose 5.');
    expect(textOf({ ...tonight, wrongGuessCost: 0 }, 'Charge them')).toBe('Sure? Hold the red button to charge them. If you’re right, they lose 5 and you gain 5.');
  });

  it('verdicts off say less', () => {
    expect(textOf({ ...tonight, verdictPoints: 0 }, 'Log book')).toBe('React with a {heart} or an {eye} on log book updates.');
  });

  it('the trusted-confidant and person-of-interest lines never give a number', () => {
    for (const s of [tonight, { ...tonight, confidantAbove: 25, poiBelow: -20 }]) expect(textOf(s, 'Trusted or watched')).not.toMatch(/\d/);
  });

  it('another rule set moves points its own way: no amounts on the tags', () => {
    const heist: Settings = { ...tonight, scoring: 'heist' };
    for (const stop of stopsFor(heist, mystery)) expect(stop.text, stop.title).not.toMatch(/\d/);
    expect(textOf(heist, 'Charge them')).toBe('Sure? Hold the red button to charge them. If you’re right, they lose points. If you’re wrong, you do.');
    expect(textOf(heist, 'Your missions')).toContain('destroy incriminating evidence or frame someone else.');
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
