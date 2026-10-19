// Mystery plan edge case 22: every pack has a look; packs without their own tab words or avatar style keep the
// engine's; the mystery pack's tabs read Missions, Feed, My file.
import { describe, expect, it } from 'vitest';
import { getPack, packIds } from '../../functions/src/shared/packs/index.ts';
import { termForms } from '../../functions/src/shared/packs/terms.ts';
import { tabLabels } from '../lib/nav';
import { brands } from './brands';

const labelsFor = (id: string) => {
  const t = termForms(getPack(id).terms);
  return tabLabels(brands[id]!.tabs, { gm: t.gm.One, wrap: t.wrap.One });
};

describe('pack looks', () => {
  it('every rules pack has a look, and every look a rules pack', () => {
    expect(Object.keys(brands).sort()).toEqual(packIds());
  });

  it.each(['lancaster', 'starter'])('%s keeps the engine tab labels and initials on avatars', (id) => {
    const t = termForms(getPack(id).terms);
    expect(brands[id]!.tabs).toBeUndefined();
    expect(brands[id]!.avatar).toBeUndefined();
    expect(labelsFor(id)).toEqual({ home: 'Home', feed: 'Feed', map: 'Map', account: 'Account', gm: t.gm.One, wrap: t.wrap.One });
    expect(brands[id]!.tabIcons).toBeUndefined();
  });

  it('mystery: Missions, Log book and My file (a folder and a notebook), with silhouettes on per-player tints', () => {
    expect(labelsFor('mystery')).toEqual({ home: 'Missions', feed: 'Log book', map: 'Map', account: 'My file', gm: 'GM', wrap: 'Case file' });
    expect(brands.mystery!.tabIcons).toEqual({ home: 'folder', feed: 'notebook' });
    const avatar = brands.mystery!.avatar!;
    expect(avatar.placeholder).toBe('silhouette');
    expect(avatar.tints.length).toBeGreaterThanOrEqual(4);
    for (const c of avatar.tints) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('mystery: the charcoal wall for the browser chrome', () => {
    expect(brands.mystery).toMatchObject({ themeColor: '#3d4042' });
  });
});
