// Edge case 39: photo, thumbnail and avatar sizing.
import { describe, expect, it } from 'vitest';
import { AVATAR_SIZE, fitWithin, PHOTO_MAX_EDGE, squareCrop, THUMB_MAX_EDGE } from './image';

describe('fitWithin', () => {
  it('caps the long edge of a landscape photo at 1600', () => {
    expect(fitWithin(4000, 3000, PHOTO_MAX_EDGE)).toEqual({ width: 1600, height: 1200 });
  });

  it('caps the long edge of a portrait photo at 1600', () => {
    expect(fitWithin(3000, 4000, PHOTO_MAX_EDGE)).toEqual({ width: 1200, height: 1600 });
  });

  it('never upscales small images', () => {
    expect(fitWithin(800, 600, PHOTO_MAX_EDGE)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, PHOTO_MAX_EDGE)).toEqual({ width: 1600, height: 1600 });
  });

  it('makes 400 px thumbnails', () => {
    expect(fitWithin(4032, 3024, THUMB_MAX_EDGE)).toEqual({ width: 400, height: 300 });
    expect(fitWithin(3024, 4032, THUMB_MAX_EDGE)).toEqual({ width: 300, height: 400 });
  });

  it('rounds to whole pixels and never returns 0', () => {
    expect(fitWithin(3001, 2000, PHOTO_MAX_EDGE)).toEqual({ width: 1600, height: 1066 });
    expect(fitWithin(10000, 1, PHOTO_MAX_EDGE)).toEqual({ width: 1600, height: 1 });
  });
});

describe('squareCrop', () => {
  it('centres the crop on landscape and portrait images', () => {
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000 });
    expect(squareCrop(3000, 4000)).toEqual({ sx: 0, sy: 500, size: 3000 });
  });

  it('keeps square images whole and floors odd offsets', () => {
    expect(squareCrop(AVATAR_SIZE, AVATAR_SIZE)).toEqual({ sx: 0, sy: 0, size: 256 });
    expect(squareCrop(301, 100)).toEqual({ sx: 100, sy: 0, size: 100 });
  });
});
