// Mystery plan edge case 21 (tints): a stable tint per player from the pack's palette.
import { describe, expect, it } from 'vitest';
import { avatarTint } from './avatar';

const PALETTE = ['#e8d5c4', '#c9dbe4', '#d9e4c9', '#e4c9d9', '#e4e0c9', '#d0c9e4'];

describe('avatarTint', () => {
  it('gives the same tint for the same uid, every time', () => {
    expect(avatarTint('demo-maya', PALETTE)).toBe(avatarTint('demo-maya', PALETTE));
  });

  it('always picks from the palette, and spreads players across it', () => {
    const uids = Array.from({ length: 30 }, (_, i) => `player-${i}`);
    const tints = uids.map((u) => avatarTint(u, PALETTE));
    for (const t of tints) expect(PALETTE).toContain(t);
    expect(new Set(tints).size).toBeGreaterThanOrEqual(4);
  });

  it('is null with an empty palette, and the only colour with one', () => {
    expect(avatarTint('demo-maya', [])).toBeNull();
    expect(avatarTint('demo-maya', ['#ffffff'])).toBe('#ffffff');
  });
});
