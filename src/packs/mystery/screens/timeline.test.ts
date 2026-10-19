import { describe, expect, it } from 'vitest';
import { chapterCounts, chapterLine, chapterize, kicker, missionRef, walk, walkLabel } from './timeline';

const stop = (id: string, number: number, startMs: number | null, lat = 53.4, lng = -2.2, revealed = true) => ({
  id, number, name: id, lat, lng, revealed, startMs,
});
const post = (id: string, ms: number, type = 'approved', ref: string | null = null) => ({ id, type, ref, ms });

describe('chapterize', () => {
  it('returns nothing for no posts and no stops', () => {
    expect(chapterize([], [])).toEqual([]);
  });

  it('keeps one headerless list when no stop has a chapter', () => {
    const out = chapterize([post('a', 1), post('b', 2)], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ stop: null, headed: false, now: false });
    expect(out[0].posts.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('starts chapters at stop times, newest first, with the newest as NOW', () => {
    const out = chapterize(
      [post('a', 5), post('b', 15), post('c', 25), post('d', 35)],
      [stop('s1', 1, 10), stop('s2', 2, 20), stop('s3', 3, 30)],
    );
    expect(out.map((c) => c.stop?.id ?? 'before')).toEqual(['s3', 's2', 's1', 'before']);
    expect(out.map((c) => c.posts.map((p) => p.id))).toEqual([['d'], ['c'], ['b'], ['a']]);
    expect(out.map((c) => c.now)).toEqual([true, false, false, false]);
  });

  it('leaves out a stop timed for later (the map shows what is next); the newest started one is NOW', () => {
    const out = chapterize([], [stop('s1', 1, 10), stop('s2', 2, 50)], 20);
    expect(out.map((c) => c.stop?.id)).toEqual(['s1']);
    expect(out.map((c) => c.now)).toEqual([true]);
    expect(out[0].walk).toBeNull();
  });

  it('falls back to the reveal post when a stop has no time', () => {
    const out = chapterize([post('r', 20, 'stop-revealed', 's2'), post('x', 25), post('y', 5)], [stop('s1', 1, 10), stop('s2', 2, null)]);
    expect(out.map((c) => c.stop?.id ?? 'before')).toEqual(['s2', 's1', 'before']);
    expect(out[0].posts.map((p) => p.id)).toEqual(['x', 'r']);
  });

  it('leaves out a revealed stop with no time and no reveal post, and unrevealed stops', () => {
    const out = chapterize([post('a', 5)], [stop('s1', 1, null), stop('s2', 2, 1, 0, 0, false)]);
    expect(out).toHaveLength(1);
    expect(out[0].headed).toBe(false);
  });

  it('puts a post exactly on a boundary in the chapter that starts then', () => {
    const out = chapterize([post('a', 20), post('b', 19)], [stop('s1', 1, 10), stop('s2', 2, 20)]);
    expect(out[0].posts.map((p) => p.id)).toEqual(['a']);
    expect(out[1].posts.map((p) => p.id)).toEqual(['b']);
  });

  it('adds the walk between consecutive stops only', () => {
    const out = chapterize([post('a', 5), post('b', 15)], [stop('s1', 1, 10, 53.4, -2.2), stop('s2', 2, 20, 53.405, -2.2)]);
    expect(out[0].walk).toEqual({ metres: 560, minutes: 7 });
    expect(out[1].walk).toBeNull(); // first stop
    expect(out[2].stop).toBeNull();
    expect(out[2].walk).toBeNull(); // nothing before the crawl
  });

  it('keeps an empty stop chapter but no empty "before" chapter', () => {
    const out = chapterize([], [stop('s1', 1, 10)]);
    expect(out).toHaveLength(1);
    expect(out[0].posts).toEqual([]);
  });
});

describe('walk', () => {
  const at = (lat: number) => ({ lat, lng: -2.2 });
  it('rounds metres to 10 and uses 80 m a minute', () => {
    expect(walk(at(53.4), at(53.405))).toEqual({ metres: 560, minutes: 7 });
  });
  it('is at least a minute', () => {
    expect(walk(at(53.4), at(53.4003))).toEqual({ metres: 30, minutes: 1 });
    expect(walk(at(53.4), at(53.4))).toEqual({ metres: 0, minutes: 1 });
  });
  it('labels metres below 1 km and km above', () => {
    expect(walkLabel({ metres: 560, minutes: 7 })).toBe('560 M · 7 MIN WALK');
    expect(walkLabel(walk(at(53.4), at(53.411)))).toBe('1.2 KM · 15 MIN WALK');
  });
});

describe('kicker', () => {
  it('names the witness, or the entry', () => {
    expect(kicker('approved', { witness: 'Priya' })).toBe('CONFIRMED · PRIYA');
    expect(kicker('approved', { entry: true })).toBe('ENTRY BAGGED');
    expect(kicker('framed')).toBe('ANONYMOUS TIP');
    expect(kicker('stop-revealed')).toBe('NEW LOCATION');
    expect(kicker('checkin-open')).toBe('ANSWER NOW');
    expect(kicker('checkin-answer')).toBe('PRESENT');
    expect(kicker('checkin-closed')).toBe("TIME'S UP");
  });
});

describe('missionRef (Open in Missions)', () => {
  it('links the posts that open or move on a mission', () => {
    expect(missionRef({ type: 'global-open', ref: 'g1' })).toBe('g1');
    expect(missionRef({ type: 'voting-open', ref: 'g1' })).toBe('g1');
    expect(missionRef({ type: 'checking', ref: 'g1' })).toBe('g1');
    expect(missionRef({ type: 'checkin-open', ref: 'c1' })).toBe('c1');
  });

  it('leaves every other post alone, and one with no ref', () => {
    expect(missionRef({ type: 'global-won', ref: 'sub1' })).toBeNull();
    expect(missionRef({ type: 'approved', ref: 'sub1' })).toBeNull();
    expect(missionRef({ type: 'global-open', ref: null })).toBeNull();
  });
});

describe('a stop’s line', () => {
  it('counts entries and photos', () => {
    expect(chapterCounts([{ photo: true }, { photo: false }, { photo: true }])).toEqual({ entries: 3, photos: 2 });
  });

  it('the open stop: since when, and how many entries', () => {
    expect(chapterLine({ from: '21:20', to: null }, { entries: 11, photos: 2 }, true)).toBe('Since 21:20 · 11 entries');
    expect(chapterLine({ from: null, to: null }, { entries: 1, photos: 0 }, true)).toBe('1 entry');
  });

  it('a folded stop: its span, entries and photos', () => {
    expect(chapterLine({ from: '20:25', to: '21:20' }, { entries: 14, photos: 3 }, false)).toBe('20:25–21:20 · 14 entries · 3 photos');
    expect(chapterLine({ from: '19:30', to: null }, { entries: 0, photos: 0 }, false)).toBe('from 19:30 · 0 entries');
    expect(chapterLine({ from: null, to: null }, { entries: 2, photos: 1 }, false)).toBe('2 entries · 1 photo');
  });
});
