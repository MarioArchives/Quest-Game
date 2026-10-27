// Plan edge cases 20 and 24: the GM settings form rebuilds the whole settings doc on save, so it must carry every
// field (the random-drop switch, the two standing lines, the police numbers) and refuse crossed standing lines.
import { describe, expect, it } from 'vitest';
import { defaultSettingsFor, getPack } from '../../../functions/src/shared/packs/index.ts';
import type { Settings } from '../../shared';
import { foldSummary, fromSettings, toSettings, validateSettingsForm } from './settingsForm';

/** What a save gives back: the same settings (only the chosen rule set's params are kept, as before). */
const saved = (s: Settings) => toSettings(fromSettings(s));
const sameAs = (s: Settings) => ({ ...s, scoringParams: expect.any(Object) });

describe('the settings form', () => {
  it.each(['lancaster', 'starter', 'mystery'])("saving the %s defaults unchanged gives back the same settings", (id) => {
    const s = defaultSettingsFor(getPack(id));
    expect(saved(s)).toEqual(sameAs(s));
  });

  it("keeps the police's Telegram account and number, tidied, and refuses ones Telegram wouldn't take", () => {
    const s: Settings = { ...defaultSettingsFor(getPack('mystery')), policeTelegram: 'MancMetPolice', policeTelegramNumber: '+447700900456' };
    expect(saved(s)).toEqual(sameAs(s));
    const form = fromSettings(defaultSettingsFor(getPack('mystery')));
    expect(form).toMatchObject({ telegram: '', telegramNumber: '' });
    const typed = toSettings({ ...form, telegram: ' https://t.me/MancMetPolice ', telegramNumber: '+44 (0)7700 900456' });
    expect(typed).toMatchObject({ policeTelegram: 'MancMetPolice', policeTelegramNumber: '+447700900456' });
    expect(validateSettingsForm({ ...form, telegram: '@MancMetPolice', telegramNumber: '+44 7700 900456' })).toEqual({});
    expect(validateSettingsForm({ ...form, telegram: 'cop' })).toHaveProperty('telegram');
    expect(validateSettingsForm({ ...form, telegram: '@MancMetPolice', telegramNumber: '07700 900456' })).toHaveProperty('telegramNumber');
    expect(foldSummary('police', { ...form, telegram: '@MancMetPolice' })).toMatch(/Telegram/);
    expect(foldSummary('police', form)).not.toMatch(/Telegram/);
  });

  it('keeps the way of voting (plan "Voting takeover…", edge case 16), reading anything unknown as one vote each', () => {
    const s = defaultSettingsFor(getPack('mystery'));
    expect(fromSettings(s).voteStyle).toBe('yesno');
    expect(fromSettings(defaultSettingsFor(getPack('lancaster'))).voteStyle).toBe('pick');
    expect(saved({ ...s, voteStyle: 'pick' })).toEqual(sameAs({ ...s, voteStyle: 'pick' }));
    expect(toSettings({ ...fromSettings(s), voteStyle: 'pick' }).voteStyle).toBe('pick');
    expect(fromSettings({ ...s, voteStyle: 'ranked' as never }).voteStyle).toBe('pick');
    expect(fromSettings({ ...s, voteStyle: undefined as never }).voteStyle).toBe('pick');
  });

  it('carries the case-updates switch (plan "Police that sound official…", edge case 12)', () => {
    const s = defaultSettingsFor(getPack('mystery'));
    expect(fromSettings(s).policeNotices).toBe(true);
    expect(fromSettings(defaultSettingsFor(getPack('lancaster'))).policeNotices).toBe(false);
    expect(toSettings({ ...fromSettings(s), policeNotices: false }).policeNotices).toBe(false);
    expect(saved({ ...s, policeNotices: false })).toEqual(sameAs({ ...s, policeNotices: false }));
    const form = fromSettings({ ...s, policeTelegram: 'MancMetPolice' });
    expect(foldSummary('police', { ...form, policeNotices: true })).toMatch(/case updates/);
    expect(foldSummary('police', { ...form, policeNotices: false })).not.toMatch(/case updates/);
  });

  it('carries the smaller Telegram fine, and refuses a negative one', () => {
    const form = fromSettings(defaultSettingsFor(getPack('mystery')));
    expect((form.numbers as Record<string, string>).policeHeardPenalty).toBe('2');
    expect(validateSettingsForm({ ...form, numbers: { ...form.numbers, policeHeardPenalty: '-1' } as never })).toHaveProperty('policeHeardPenalty');
    expect(toSettings({ ...form, numbers: { ...form.numbers, policeHeardPenalty: '1' } as never }).policeHeardPenalty).toBe(1);
  });

  it('carries the points for the top of the log book, from 0 to 100 (plan "+5 for the log book\'s top entry", edge case 14)', () => {
    const form = fromSettings(defaultSettingsFor(getPack('mystery')));
    expect((form.numbers as Record<string, string>).topEntryPoints).toBe('5');
    for (const bad of ['-1', '101', '2.5']) expect(validateSettingsForm({ ...form, numbers: { ...form.numbers, topEntryPoints: bad } as never }), bad).toHaveProperty('topEntryPoints');
    expect(toSettings({ ...form, numbers: { ...form.numbers, topEntryPoints: '3' } as never }).topEntryPoints).toBe(3);
  });

  it('carries the verdict points, the window and the votes a verdict needs, within their ranges', () => {
    const form = fromSettings(defaultSettingsFor(getPack('mystery')));
    const numbers = form.numbers as Record<string, string>;
    expect([numbers.verdictPoints, numbers.verdictWindowMin, numbers.verdictMinVotes]).toEqual(['1', '30', '3']);
    for (const [key, bad] of [['verdictPoints', '-1'], ['verdictPoints', '101'], ['verdictWindowMin', '4'], ['verdictWindowMin', '241'], ['verdictMinVotes', '0']] as const) {
      expect(validateSettingsForm({ ...form, numbers: { ...form.numbers, [key]: bad } as never }), `${key} ${bad}`).toHaveProperty(key);
    }
    const back = toSettings({ ...form, numbers: { ...form.numbers, verdictPoints: '2', verdictWindowMin: '45', verdictMinVotes: '4' } as never });
    expect([back.verdictPoints, back.verdictWindowMin, back.verdictMinVotes]).toEqual([2, 45, 4]);
  });

  it('keeps the random-drop switch, the standing lines and the police numbers as edited', () => {
    const s: Settings = {
      ...defaultSettingsFor(getPack('mystery')),
      autoSideQuests: false,
      confidantAbove: 25,
      poiBelow: -5,
      policeEveryMin: 20,
      policeTipEveryMin: 45,
      policeWindowMin: 3,
      policePassPoints: 2,
      policeFailPenalty: 4,
      policeHeardPenalty: 3,
    };
    expect(saved(s)).toEqual(sameAs(s));
  });

  it('keeps the phone calls switch, the breaker and the caller name (trimmed)', () => {
    const s: Settings = { ...defaultSettingsFor(getPack('mystery')), policePhone: true, policeBreakerAt: 5, policeCallerName: 'Desk Sergeant' };
    expect(saved(s)).toEqual(sameAs(s));
    expect(toSettings({ ...fromSettings(s), callerName: '  Night Desk  ' }).policeCallerName).toBe('Night Desk');
    expect(fromSettings(defaultSettingsFor(getPack('mystery')))).toMatchObject({ policePhone: true, callerName: 'Manchester Metropolitan Police' });
  });

  it('refuses a blank or overlong caller name and a breaker below 2', () => {
    const form = fromSettings(defaultSettingsFor(getPack('mystery')));
    expect(validateSettingsForm({ ...form, callerName: '  ' })).toHaveProperty('callerName');
    expect(validateSettingsForm({ ...form, callerName: 'x'.repeat(41) })).toHaveProperty('callerName');
    expect(validateSettingsForm({ ...form, numbers: { ...form.numbers, policeBreakerAt: '1' } })).toHaveProperty('policeBreakerAt');
  });

  it('keeps a standing that is switched off as null, and a line at 0 as 0', () => {
    const s: Settings = { ...defaultSettingsFor(getPack('mystery')), confidantAbove: null, poiBelow: 0 };
    expect(saved(s)).toMatchObject({ confidantAbove: null, poiBelow: 0 });
  });

  it('can be saved as it comes', () => {
    expect(validateSettingsForm(fromSettings(defaultSettingsFor(getPack('mystery'))))).toEqual({});
    expect(validateSettingsForm(fromSettings(defaultSettingsFor(getPack('lancaster'))))).toEqual({});
  });

  it('refuses a confidant line below the person-of-interest line', () => {
    const crossed = fromSettings({ ...defaultSettingsFor(getPack('mystery')), confidantAbove: -5, poiBelow: 5 });
    expect(Object.keys(validateSettingsForm(crossed)).length).toBeGreaterThan(0);
  });
});

describe('a fold\'s summary line', () => {
  const form = fromSettings({
    ...defaultSettingsFor(getPack('mystery')),
    starterQuestCount: 3,
    rerollLimit: 2,
    questPoints: 5,
    rejectPenalty: 4,
    fraudPenalty: 6,
    correctGuessReward: 5,
    wrongGuessCost: 5,
    guessLimit: 3,
    globalIntervalMin: 20,
    globalIntervalMax: 40,
    cleanPoints: 5,
    framePoints: 3,
    policeEveryMin: 30,
    policePhone: true,
    confidantAbove: 10,
    poiBelow: -10,
    scoring: 'classic',
    voteStyle: 'pick',
    policeNotices: false,
    refillOnComplete: false,
    revealOnComplete: true,
    pointsFloorZero: true,
  });

  it('says what is in each group', () => {
    expect(foldSummary('hands', form)).toBe('3 dealt · 2 rerolls');
    expect(foldSummary('points', form)).toBe('+5 / −4 · fraud −6');
    expect(foldSummary('guessing', form)).toBe('±5 · 3 each');
    expect(foldSummary('sideQuests', form)).toBe('every 20–40 min');
    expect(foldSummary('rewards', form)).toBe('+5 / −3');
    expect(foldSummary('police', form)).toBe('every 30 min · phone on');
    expect(foldSummary('standings', form)).toBe('above 10 · below −10');
    expect(foldSummary('scoring', form)).toBe('Classic');
    expect(foldSummary('rules', form)).toBe('2 on');
  });

  it('reads the form as typed, and words the edge cases', () => {
    expect(foldSummary('hands', { ...form, numbers: { ...form.numbers, rerollLimit: '1' } })).toBe('3 dealt · 1 reroll');
    expect(foldSummary('guessing', { ...form, numbers: { ...form.numbers, wrongGuessCost: '2', guessLimit: '0' } })).toBe('+5 / −2 · no limit');
    expect(foldSummary('sideQuests', { ...form, numbers: { ...form.numbers, globalIntervalMax: '20' } })).toBe('every 20 min');
    expect(foldSummary('sideQuests', { ...form, voteStyle: 'yesno' })).toBe('every 20–40 min · yes or no');
    expect(foldSummary('police', { ...form, policePhone: false })).toBe('every 30 min · phone off');
    expect(foldSummary('standings', { ...form, standing: { confidantAbove: '', poiBelow: '' } })).toBe('off');
    expect(foldSummary('standings', { ...form, standing: { confidantAbove: '15', poiBelow: '' } })).toBe('above 15 · below off');
  });
});
