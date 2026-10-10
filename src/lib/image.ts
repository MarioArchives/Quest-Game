export const PHOTO_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 400;
export const AVATAR_SIZE = 256;
export const JPEG_QUALITY = 0.8;

/** Scale (w, h) so the long edge is at most maxEdge, keeping aspect ratio. Never upscales. Integers. */
export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const longEdge = Math.max(w, h);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Centred square source rectangle for cropping an avatar out of a w×h image. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h);
  return {
    sx: Math.floor((w - size) / 2),
    sy: Math.floor((h - size) / 2),
    size,
  };
}
