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

  it('has the four demo players with hands, claims, a ledger, a feed with reactions', () => {
    const d = demo();
    const paths = d.docs.map((x) => x.path);
    expect(d.players.map((p) => p.uid)).toEqual(['demo-maya', 'demo-sam', 'demo-priya', 'demo-jonah']);
    for (const { uid } of d.players) {
      expect(paths).toContain(`players/${uid}`);
      expect(under(paths, `players/${uid}/quests/`).length).toBeGreaterThanOrEqual(5);
    }
    expect(under(paths, 'submissions/').length).toBeGreaterThan(0);
    expect(under(paths, 'pointsLedger/').length).toBeGreaterThan(0);
    expect(under(paths, 'feed/').filter((p) => !p.includes('/reactions/')).length).toBeGreaterThan(0);
    expect(paths.some((p) => /^feed\/[^/]+\/reactions\/[^/]+$/.test(p))).toBe(true);
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

