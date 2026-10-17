// Plan edge cases 20 and 24: the GM settings form rebuilds the whole settings doc on save, so it must carry every
// field (the random-drop switch, the two standing lines, the police numbers) and refuse crossed standing lines.
import { describe, expect, it } from 'vitest';
import { defaultSettingsFor, getPack } from '../../../functions/src/shared/packs/index.ts';
import type { Settings } from '../../shared';
import { fromSettings, toSettings, validateSettingsForm } from './settingsForm';

/** What a save gives back: the same settings (only the chosen rule set's params are kept, as before). */
const saved = (s: Settings) => toSettings(fromSettings(s));
const sameAs = (s: Settings) => ({ ...s, scoringParams: expect.any(Object) });

describe('the settings form', () => {
  it.each(['lancaster', 'starter', 'mystery'])("saving the %s defaults unchanged gives back the same settings", (id) => {
    const s = defaultSettingsFor(getPack(id));
    expect(saved(s)).toEqual(sameAs(s));
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
    };
    expect(saved(s)).toEqual(sameAs(s));
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
