import { describe, expect, it } from 'vitest';
import { isIconName } from './Icon';

describe('isIconName (a pack names its tab icons as plain strings)', () => {
  it('knows the icon set, the magnifying glass included', () => {
    expect(isIconName('search')).toBe(true);
    expect(isIconName('home')).toBe(true);
    expect(isIconName('phone')).toBe(true);
    expect(isIconName('eye')).toBe(true);
    expect(isIconName('folder')).toBe(true);
    expect(isIconName('notebook')).toBe(true);
  });
  it('turns away names it does not have, and nothing', () => {
    expect(isIconName('house')).toBe(false);
    expect(isIconName('toString')).toBe(false);
    expect(isIconName(undefined)).toBe(false);
  });
});
