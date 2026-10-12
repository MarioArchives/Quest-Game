// Per-player avatar tints.

/** A stable tint for a uid from the pack's palette; null when the palette is empty. */
export function avatarTint(uid: string, palette: readonly string[]): string | null {
  if (palette.length === 0) return null;
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (Math.imul(h, 31) + uid.charCodeAt(i)) >>> 0;
  return palette[h % palette.length] ?? null;
}
