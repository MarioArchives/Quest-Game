// Data-layer plan edge case 22 (the demo half): the demo game is plain data, the same every time for the same
// inputs, and only includes what the pack has. The seed script and the mock backend both load it.
import { describe, expect, it } from 'vitest';
import { buildDemo } from '../src/shared/demo/index.js';
import { defaultSettingsFor, getPack } from '../src/shared/packs/index.js';
import { Stamp } from '../src/shared/store/stamp.js';
import { testPack } from './packs.js';

const NOW = Date.parse('2026-10-10T14:00:00Z');
const demo = (pack = getPack('lancaster')) => buildDemo({ pack, settings: defaultSettingsFor(pack), nowMs: NOW });
const under = (paths: string[], prefix: string) => paths.filter((p) => p.startsWith(prefix));

describe('buildDemo', () => {
  it('is the same every time for the same inputs', () => {
    expect(JSON.stringify(demo())).toBe(JSON.stringify(demo()));
  });

  it('has the four demo players and the newcomer, with hands, claims, a ledger, a feed with reactions', () => {
    const d = demo();
    const paths = d.docs.map((x) => x.path);
    expect(d.players.map((p) => p.uid)).toEqual(['demo-maya', 'demo-sam', 'demo-priya', 'demo-jonah', 'demo-alex']);
    for (const { uid } of d.players) {
      expect(paths).toContain(`players/${uid}`);
      expect(under(paths, `players/${uid}/quests/`).length).toBeGreaterThanOrEqual(5);
    }
    expect(under(paths, 'submissions/').length).toBeGreaterThan(0);
    expect(under(paths, 'pointsLedger/').length).toBeGreaterThan(0);
    expect(under(paths, 'feed/').filter((p) => !p.includes('/reactions/')).length).toBeGreaterThan(0);
    expect(paths.some((p) => /^feed\/[^/]+\/reactions\/[^/]+$/.test(p))).toBe(true);
  });

  it('a votes pack gets vote docs, counts that match them and a top entry; an emoji pack gets neither', () => {
    const d = demo(getPack('mystery'));
    const byPath = new Map(d.docs.map((x) => [x.path, x.data]));
    const voteDocs = d.docs.filter((x) => /^feed\/[^/]+\/reactions\/[^/]+$/.test(x.path));
    expect(voteDocs.length).toBeGreaterThan(0);
    expect(voteDocs.every((x) => x.data.vote === 1 || x.data.vote === -1)).toBe(true);
    for (const [path, data] of byPath) {
      if (!/^feed\/[^/]+$/.test(path) || data.score === undefined) continue;
      const mine = voteDocs.filter((v) => v.path.startsWith(`${path}/`));
      expect(data.up - data.down).toBe(data.score);
      expect(Object.keys(data.votes).sort()).toEqual(mine.map((v) => v.path.split('/')[3]).sort());
      expect(mine.map((v) => v.path.split('/')[3])).not.toContain(data.uid);
    }
    const t = byPath.get('game/top')!;
    expect(t.feedId).toBeTruthy();
    expect(byPath.get(`feed/${t.feedId}`)!.score).toBe(t.score);
    // Some entries are left without votes.
    expect(d.docs.filter((x) => /^feed\/[^/]+$/.test(x.path) && x.data.score === undefined).length).toBeGreaterThan(0);
    const lan = demo().docs;
    expect(lan.some((x) => x.path === 'game/top')).toBe(false);
    expect(lan.filter((x) => /\/reactions\//.test(x.path)).every((x) => typeof x.data.emoji === 'string')).toBe(true);
  });

  it('the four are booked in with their particulars; the newcomer is fresh, with a hand, and still to do the onboarding', () => {
    const d = demo();
    const player = (uid: string) => d.docs.find((x) => x.path === `players/${uid}`)!.data;
    for (const uid of ['demo-maya', 'demo-sam', 'demo-priya', 'demo-jonah']) {
      expect(player(uid).bookedAt, uid).toBeInstanceOf(Stamp);
      expect(player(uid).particulars, uid).toMatchObject({ heightCm: expect.any(Number) });
    }
    expect(player('demo-alex')).toMatchObject({ displayName: 'Alex', points: 0, questsCompleted: 0, rerollsUsed: 0, bookedAt: null });
    expect(d.docs.filter((x) => x.path.startsWith('players/demo-alex/quests/')).map((x) => x.data.status)).toEqual(Array(5).fill('active'));
    expect(d.docs.some((x) => x.path === 'feed/join-demo-alex')).toBe(true);
    expect(d.docs.some((x) => x.path === 'locations/demo-alex')).toBe(false);
  });

  it('every document path is a document (even number of segments) and appears once', () => {
    const paths = demo().docs.map((x) => x.path);
    for (const p of paths) expect(p.split('/').length % 2, p).toBe(0);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('times are Stamps relative to nowMs, never in the future', () => {
    const player = demo().docs.find((x) => x.path === 'players/demo-maya')!.data;
    expect(player.joinedAt).toBeInstanceOf(Stamp);
    expect(player.joinedAt.toMillis()).toBeLessThanOrEqual(NOW);
  });

  it('every photo a submission points at is among the files, as an SVG poster', () => {
    const d = demo();
    const files = new Map(d.files.map((f) => [f.path, f]));
    const photos = d.docs
      .filter((x) => x.path.startsWith('submissions/'))
      .flatMap((x) => [x.data.imagePath, x.data.thumbPath])
      .filter((p): p is string => typeof p === 'string');
    expect(photos.length).toBeGreaterThan(0);
    for (const p of photos) {
      expect(files.get(p), p).toBeDefined();
      expect(files.get(p)!.contentType).toBe('image/svg+xml');
      expect(files.get(p)!.text).toContain('<svg');
    }
  });

  it('with the map on, players have locations; with it off, none', () => {
    expect(under(demo().docs.map((x) => x.path), 'locations/').length).toBe(4);
    expect(under(demo(testPack({ features: { map: false } })).docs.map((x) => x.path), 'locations/')).toEqual([]);
  });

  it('with side quests on there is a live one with entries; with them off, none', () => {
    const on = demo().docs;
    const live = on.filter((x) => /^globalQuests\/[^/]+$/.test(x.path));
    expect(live.map((x) => x.data.status)).toEqual(['live']);
    expect(on.some((x) => x.path.startsWith('submissions/') && x.data.kind === 'global')).toBe(true);

    const off = demo(testPack({ features: { sideQuests: false } })).docs;
    expect(off.some((x) => x.path.startsWith('globalQuests/'))).toBe(false);
    expect(off.some((x) => x.path.startsWith('submissions/') && x.data.kind === 'global')).toBe(false);
  });

  it("the live side quest's entries are sealed like real ones: hidden until the vote, so a GM can check them", () => {
    const docs = demo().docs;
    const entries = docs.filter((x) => /^submissions\/[^/]+$/.test(x.path) && x.data.kind === 'global');
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.data.status, e.path).toBe('sealed');
      // The entry keeps its photo; its feed post only says who entered.
      expect(e.data.imagePath, e.path).toEqual(expect.any(String));
      const post = docs.find((x) => x.path === `feed/${e.data.feedId}`)!;
      expect(post.data.imagePath ?? null, e.path).toBeNull();
    }
  });

  it('hands are dealt from the pack’s catalogue', () => {
    const pack = getPack('starter');
    const ids = new Set(pack.catalogue.personal.map((q) => q.id));
    const quests = demo(pack).docs.filter((x) => /^players\/[^/]+\/quests\//.test(x.path));
    expect(quests.length).toBeGreaterThan(0);
    for (const q of quests) expect(ids.has(q.data.templateId), q.data.templateId).toBe(true);
  });
});

describe('M23. demo characters and rewards', () => {
  const CHARS = [
    { name: 'Lady Violet Ashcombe', role: 'Niece of the deceased', motive: 'Cut out of the will.' },
    { name: 'Dr Grey', role: 'Family doctor', motive: 'Hush money.' },
  ];
  const at = (d: ReturnType<typeof demo>, path: string) => d.docs.find((x) => x.path === path)?.data;

  it('with characters on, demo players get the pack’s characters in order and a private motive each', () => {
    const d = demo(testPack({ features: { characters: true }, demoCharacters: CHARS }));
    expect(at(d, 'players/demo-maya')?.character).toEqual({ name: 'Lady Violet Ashcombe', role: 'Niece of the deceased' });
    expect(at(d, 'players/demo-sam')?.character).toEqual({ name: 'Dr Grey', role: 'Family doctor' });
    expect(at(d, 'motives/demo-maya')).toMatchObject({ text: 'Cut out of the will.' });
    expect(at(d, 'motives/demo-maya')?.updatedAt).toBeInstanceOf(Stamp);
    expect(at(d, 'motives/demo-sam')).toMatchObject({ text: 'Hush money.' });
    // More players than characters: the rest have none.
    expect(at(d, 'players/demo-priya')?.character ?? null).toBeNull();
    expect(at(d, 'motives/demo-priya')).toBeUndefined();
    // The motive is never on the public player doc.
    expect(JSON.stringify(at(d, 'players/demo-maya'))).not.toContain('Cut out of the will');
  });

  it('with characters off, nobody has one', () => {
    const d = demo(testPack({ demoCharacters: CHARS }));
    expect(d.docs.some((x) => x.path.startsWith('motives/'))).toBe(false);
    expect(at(d, 'players/demo-maya')?.character ?? null).toBeNull();
  });

  it('with the reward choice on, every approved personal claim has a pending reward for its owner', () => {
    const d = demo(testPack({ features: { rewardChoice: true } }));
    const approved = d.docs.filter((x) => /^submissions\/[^/]+$/.test(x.path) && x.data.kind === 'personal' && x.data.status === 'approved');
    expect(approved.length).toBeGreaterThan(0);
    const rewards = d.docs.filter((x) => x.path.startsWith('rewards/'));
    expect(rewards.map((x) => x.path).sort()).toEqual(approved.map((x) => `rewards/${x.path.split('/')[1]}`).sort());
    for (const r of rewards) {
      const sub = approved.find((x) => x.path === `submissions/${r.path.split('/')[1]}`)!;
      expect(r.data).toMatchObject({ uid: sub.data.uid, submissionId: r.path.split('/')[1], status: 'pending' });
      expect(r.data.createdAt).toBeInstanceOf(Stamp);
    }
  });

  it('with it off, no rewards', () => {
    expect(demo().docs.some((x) => x.path.startsWith('rewards/'))).toBe(false);
  });

  it('the mystery pack’s demo has both', () => {
    const d = demo(getPack('mystery'));
    expect(d.docs.filter((x) => x.path.startsWith('motives/')).length).toBe(4);
    expect(d.docs.some((x) => x.path.startsWith('rewards/'))).toBe(true);
  });
});


describe('demo route stops', () => {
  const ROUTE = [
    { name: 'First', lat: 53.41, lng: -2.23 },
    { name: 'Second', lat: 53.42, lng: -2.24 },
    { name: 'Third', lat: 53.43, lng: -2.25 },
    { name: 'Fourth', lat: 53.44, lng: -2.26 },
  ];
  const stops = (d: ReturnType<typeof demo>) => d.docs.filter((x) => x.path.startsWith('stops/'));
  const ms = (v: unknown) => (v as Stamp).toMillis();

  it('with stops on, the pack’s route is seeded: the first three revealed and timed around now, the rest hidden', () => {
    const list = stops(demo(testPack({ features: { stops: true }, route: ROUTE })));
    expect(list.map((x) => x.path)).toEqual(['stops/route-1', 'stops/route-2', 'stops/route-3', 'stops/route-4']);
    expect(list.map((x) => x.data.order)).toEqual([1, 2, 3, 4]);
    expect(list.map((x) => x.data.revealed)).toEqual([true, true, true, false]);
    expect(list[0].data).toMatchObject({ name: 'First', lat: 53.41, lng: -2.23 });
    expect(ms(list[0].data.startsAt)).toBe(NOW - 60 * 60_000);
    expect(ms(list[0].data.endsAt)).toBe(NOW - 5 * 60_000);
    expect(ms(list[1].data.startsAt)).toBe(NOW);
    expect(list[1].data.endsAt).toBeNull();
    expect(ms(list[2].data.startsAt)).toBe(NOW + 60 * 60_000);
    expect(list[3].data.startsAt).toBeNull();
    expect(list[3].data.endsAt).toBeNull();
    expect(list[3].data.createdAt).toBeInstanceOf(Stamp);
  });

  it('a short route is all revealed; with stops off, or no route, none', () => {
    const two = stops(demo(testPack({ features: { stops: true }, route: ROUTE.slice(0, 2) })));
    expect(two.map((x) => x.data.revealed)).toEqual([true, true]);
    expect(stops(demo(testPack({ features: { stops: false }, route: ROUTE })))).toEqual([]);
    expect(stops(demo(testPack({ features: { stops: true } })))).toEqual([]);
    expect(stops(demo())).toEqual([]);
    expect(stops(demo(getPack('starter')))).toEqual([]);
  });

  it('the mystery pack’s demo is its city-centre route: six stops, three revealed', () => {
    const list = stops(demo(getPack('mystery')));
    expect(list.length).toBe(6);
    expect(list.filter((x) => x.data.revealed).length).toBe(3);
    expect(list[0].data.name).toBe('Big Hands');
  });
});
