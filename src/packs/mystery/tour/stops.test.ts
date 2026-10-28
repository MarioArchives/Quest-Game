// Torch tour plan edge case 18: the stops, the parts and the tilts hang together, and every name a stop uses is on
// the snapshot of the screen it is used on (the snapshot script checks the same in a browser, selectors and all).
import { describe, expect, it } from 'vitest';
import scenesJson from './snap/scenes.json?raw';
import { hopScreen, selectorOf, STOPS, TABS, TILT, type SceneId, type Stop } from './stops';

interface Scene {
  appClass: string;
  app: string;
  tabbar: string;
  overlays: string[];
}
const snap = JSON.parse(scenesJson) as { commit: string; taken: string; scenes: Record<string, Scene> };

/** What a name must find on a screen: its data-tour stamp, or every class and attribute its selector asks for. */
function found(name: string, html: string): boolean {
  if (!/^[.#[]/.test(name)) return html.includes(`data-tour="${name}"`);
  // The tour's own frame (.tr-pane--…, .tr-bar, .tr-over) is not in the snapshot; the rest of the selector is.
  const rest = name.replace(/\.tr-(pane--\w+|bar|over)\b/g, '');
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
  const attrs = [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((m) => (m[2] === undefined ? `${m[1]}=` : `${m[1]}="${m[2]}"`));
  const hasClass = (c: string) => new RegExp(`class="[^"]*(?<![\\w-])${c}(?![\\w-])`).test(html);
  return classes.every(hasClass) && attrs.every((a) => html.includes(a));
}

const sceneHtml = (id: SceneId, overlays: boolean) => {
  const s = snap.scenes[id];
  return s ? [s.app, s.tabbar, ...(overlays ? s.overlays : [])].join('\n') : '';
};

/** Every name a stop uses, with the screen it is used on: its own for what it lights, the screen being left (or a hop's
 * own) for its hops. */
function uses(): { stop: number; name: string; scene: SceneId; overlays: boolean }[] {
  return STOPS.flatMap((stop: Stop, k) => [
    ...[...stop.lit, ...(stop.core ?? [])].map((name) => ({ stop: k + 1, name, scene: stop.scene, overlays: !stop.bare })),
    ...(stop.via ?? []).map((hop, i) => {
      const at = hopScreen(stop.via!, i);
      const prev = STOPS[k - 1]!;
      return { stop: k + 1, name: hop.target, scene: at?.scene ?? prev.scene, overlays: at ? true : !prev.bare };
    }),
  ]);
}

describe('18. the stops', () => {
  it('there are nineteen, on the three tabs', () => {
    expect(STOPS).toHaveLength(19);
    for (const s of STOPS) expect(TABS).toContain(s.tab);
  });

  it('the tags tilt a little, never the same way twice running', () => {
    expect(TILT).toHaveLength(STOPS.length);
    TILT.forEach((t, i) => {
      expect(Math.abs(t)).toBeLessThanOrEqual(1.5);
      if (i > 0) expect(Math.sign(t)).not.toBe(Math.sign(TILT[i - 1]!));
    });
  });

  it('the first stop has no way there: the tour opens on it', () => {
    expect(STOPS[0]!.via).toBeUndefined();
  });

  it('a hop’s screen is the last of its hops so far that moves', () => {
    const via = STOPS[10]!.via!;
    expect(hopScreen(via, 0)).toBeNull();
    expect(hopScreen(via, 1)).toEqual({ tab: 'missions', scene: 'missions' });
    expect(hopScreen(via, 2)).toEqual({ tab: 'missions', scene: 'standings' });
  });

  it('a name is a data-tour name unless it is a selector', () => {
    expect(selectorOf('live')).toBe('[data-tour="live"]');
    expect(selectorOf('.tr-bar .tabbar__tab')).toBe('.tr-bar .tabbar__tab');
  });
});

describe('18. the snapshot', () => {
  it('records when and at which commit it was taken', () => {
    expect(snap.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Number.isNaN(Date.parse(snap.taken))).toBe(false);
  });

  it('has every screen a stop or a hop shows', () => {
    const needed = new Set<SceneId>([...STOPS.map((s) => s.scene), ...STOPS.flatMap((s) => (s.via ?? []).flatMap((h) => (h.at ? [h.at.scene] : []))), 'missions', 'logbook', 'file']);
    for (const id of needed) expect(snap.scenes[id], id).toBeDefined();
  });

  it('every name a stop lights, and every hop’s target, is on the screen it is used on', () => {
    const missing = uses()
      .filter((u) => u.name !== 'tabbar' && !found(u.name, sceneHtml(u.scene, u.overlays)))
      .map((u) => `stop ${u.stop}: ${u.name} on ${u.scene}`);
    expect(missing).toEqual([]);
  });

  it('ships none of the demo’s clips', () => {
    expect(JSON.stringify(snap)).not.toMatch(/demo\/clips\//);
  });
});
