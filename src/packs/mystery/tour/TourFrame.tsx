// The torch tour's heavy half, loaded when a run starts (TourHost.tsx): the specimen night, Maya's night in the demo,
// kept as the game drew it (snap/, scripts/packs/mystery/snapshot-tour.mjs), drawn in a shadow root of its own over
// the app, with the tour over it (TourLayer.tsx). The lights go down on the app, the specimen night is lit stop by stop
// (the tabs turning to follow it, as the game's own do), and the lights come up on the app as it was left: same screen,
// same scroll, same folder tab. Nothing here talks to the backend: the screens are pictures. The real app is inert
// underneath while a run is on, the page doesn't scroll, the keyboard stays on the tag (Tab goes round Back, Next and
// Skip; ← → move; Escape leaves) and Back on the phone leaves too. A police check-in, a vote that takes over or a new
// reward ends the run, with a toast saying why.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRewardSheet } from '../../../components/RewardSheet';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { springSettled, springStep, type Spring } from '../../../lib/spring';
import { pack } from '../../../pack';
import { useVoteTakeover } from '../../../screens/vote/VoteLayer';
import { useSession } from '../../../session/SessionProvider';
import type { PackLayerProps } from '../../types';
import gameCss from './snap/game.css?raw';
import scenesJson from './snap/scenes.json?raw';
import hangtagCss from './hangtag.css?inline';
import tourCss from './tour.css?inline';
import { goodbye, progressOf, runReducer, startRun, type Run, type RunAction } from './run';
import { hopScreen, runRange, SPECIMEN, STOPS, TABS, type SceneId, type TabId } from './stops';
import { closeTour, onTourBack, readMark, writeMark, type TourRequest } from './tourState';
import { TourLayer, type HopView } from './TourLayer';
import { stopsFor } from './words';

/* ---------------------------------------------------------------- the snapshot */

export interface Scene {
  /** The game's .app class names (app--fill on the map). */
  appClass: string;
  /** The app's inside: the app bar and the page. */
  app: string;
  /** The tab bar, as the game drew it on that screen. */
  tabbar: string;
  /** Whatever was over the app: a sheet, the toasts. */
  overlays: string[];
}

export interface Snap {
  taken: string;
  commit: string;
  width: number;
  scenes: Record<SceneId, Scene>;
}

/** The files the screens point at, by name (the snapshot wrote them as __SNAP_ASSET_<name>__). */
const ASSETS = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./snap/assets/*', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [path.split('/').pop()!, url]),
);
const assets = (text: string) => text.replace(/__SNAP_ASSET_([\w.-]+)__/g, (_, name: string) => ASSETS[name] ?? '');

const SNAP = JSON.parse(assets(scenesJson)) as Snap;
const SHEET = `${assets(gameCss)}\n${hangtagCss}\n${tourCss}`;

/** An overlay with something in it (every screen keeps the game's toasts holder, mostly empty). */
const shown = (html: string) => !/^<div class="toasts"[^>]*><\/div>$/.test(html);

/* ---------------------------------------------------------------- timing */

/** How long the lights take to go down, or come up, around the swap to and from the specimen night. */
const DIM_MS = 260;
const HOLD_MS = 360;
/** A hop: the page turning to its screen (when it has one) before the pen points; TourLayer says when it has pointed
 * (HOP_SAFE_MS is in case it never does). */
const HOP_TURN_MS = 560;
const HOP_SAFE_MS = 4000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const q = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!q) return;
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* ---------------------------------------------------------------- the frame */

export interface TourFrameProps extends PackLayerProps {
  request: TourRequest;
}

/** The shadow root over the app, with the game's CSS and the tour's, inside stand-ins for the game's html and body. */
function ShadowFrame({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = host.current!;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    if (!root.querySelector('snap-body')) {
      const style = document.createElement('style');
      style.textContent = SHEET;
      const html = document.createElement('snap-root');
      html.append(document.createElement('snap-body'));
      root.append(style, html);
    }
    setBody(root.querySelector<HTMLElement>('snap-body'));
  }, []);
  return createPortal(
    <div ref={host} className="tour-host" data-tour-host="" style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
      {body ? createPortal(children, body) : null}
    </div>,
    document.body,
  );
}

export default function TourFrame(props: TourFrameProps) {
  return (
    <ShadowFrame>
      <Frame {...props} />
    </ShadowFrame>
  );
}

/**
 * The pages' turn, as one number (the position along the tabs) handed to `paint` each frame: a spring to the tab the
 * stop is on, or straight there with reduced motion. Nobody drags it: the stage is inert while a run is on.
 */
function usePager(paint: (pos: number) => void, reduced: boolean) {
  const pos = useRef(0);
  const frame = useRef(0);
  const goTo = useCallback(
    (target: number, instant = false) => {
      cancelAnimationFrame(frame.current);
      if (instant || reduced) {
        pos.current = target;
        paint(target);
        return;
      }
      let s: Spring = { x: pos.current, v: 0 };
      let last = performance.now();
      const tick = (now: number) => {
        s = springStep(s, target, (now - last) / 1000);
        last = now;
        if (springSettled(s, target)) {
          pos.current = target;
          paint(target);
          return;
        }
        pos.current = s.x;
        paint(s.x);
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [paint, reduced],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return goTo;
}

function Frame({ request, setCovering }: TourFrameProps) {
  const { user } = useSession();
  const { settings, myPoliceCall } = useGame();
  const { showing: voting } = useVoteTakeover();
  const { pending: reward } = useRewardSheet();
  const toast = useToast();
  const uid = user?.uid ?? null;
  const reduced = useReducedMotion();

  const root = useRef<HTMLDivElement>(null);
  const panes = useRef<(HTMLElement | null)[]>([]);
  const stops = useMemo(() => stopsFor(settings, pack), [settings]);
  const [run, dispatch] = useReducer((r: Run, a: RunAction) => runReducer(r, a), request.part, (part) => {
    const { from, to } = runRange(part);
    return startRun(from, to);
  });

  // ---- while a run is on: the app inert and still, the keyboard here, focus back where it was afterwards ----
  useLayoutEffect(() => {
    setCovering(true);
    const body = document.body.style;
    const overflow = body.overflow;
    body.overflow = 'hidden';
    return () => {
      setCovering(false);
      body.overflow = overflow;
      // Back to what opened it (or the page), once the app has stopped being inert (a frame or two).
      const back = request.opener?.isConnected ? request.opener : document.getElementById('main');
      let tries = 0;
      const land = () => {
        back?.focus({ preventScroll: true });
        if (back && document.activeElement !== back && ++tries < 10) requestAnimationFrame(land);
      };
      requestAnimationFrame(land);
    };
  }, [setCovering, request.opener]);

  // Taking it, from anywhere, answers the offer for good.
  useEffect(() => {
    if (uid && readMark(uid)?.offer !== 'taken') writeMark(uid, { ...readMark(uid), offer: 'taken' });
  }, [uid]);

  // ---- the lights, and the end ----
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (run.phase === 'in') {
      const id = window.setTimeout(() => dispatch({ type: 'lit' }), reduced ? 0 : DIM_MS);
      return () => window.clearTimeout(id);
    }
    if (run.phase === 'out') {
      const id = window.setTimeout(() => dispatch({ type: 'dark' }), reduced ? 0 : DIM_MS);
      return () => window.clearTimeout(id);
    }
    if (run.phase === 'gone') {
      const id = window.setTimeout(
        () => {
          toast(goodbye(runRef.current));
          closeTour();
        },
        reduced ? 0 : HOLD_MS + DIM_MS,
      );
      return () => window.clearTimeout(id);
    }
  }, [run.phase, reduced, toast]);

  // Reaching the last stop is touring it: the card in My file says when.
  useEffect(() => {
    if (run.phase === 'out' && run.done && uid) writeMark(uid, { offer: 'taken', touredAt: Date.now() });
  }, [run.phase, run.done, uid]);

  const finish = useCallback((done: boolean, why?: string) => dispatch({ type: 'finish', done, why }), []);
  const step = useCallback((by: 1 | -1) => dispatch({ type: 'step', by }), []);

  // Back on the phone leaves.
  useEffect(() => onTourBack(() => finish(false)), [finish]);

  // Something else needs the player: a police check-in, a vote taking over, a new reward.
  const before = useRef({ call: myPoliceCall?.id ?? null, reward: reward?.id ?? null });
  const why =
    myPoliceCall && myPoliceCall.id !== before.current.call
      ? 'the police are checking in on you'
      : voting
        ? 'a vote needs you'
        : reward && reward.id !== before.current.reward
          ? 'you have a reward to use'
          : null;
  useEffect(() => {
    if (why) finish(false, why);
  }, [why, finish]);

  // A hop that never says it has been shown moves on anyway.
  useEffect(() => {
    const hop = run.hop;
    if (!hop || run.phase !== 'on') return;
    const id = window.setTimeout(() => dispatch({ type: 'hopShown', to: hop.to, i: hop.i }), HOP_SAFE_MS + (STOPS[hop.to]?.via?.[hop.i]?.at ? HOP_TURN_MS : 0));
    return () => window.clearTimeout(id);
  }, [run.hop, run.phase]);

  // ---- the keyboard: ← → and Escape, and Tab round the tag's buttons and Skip ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = runRef.current;
      const keys = ['ArrowRight', 'ArrowLeft', 'Escape', 'Tab'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (r.phase !== 'on') return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') finish(false);
      else {
        const el = root.current;
        const shadow = el?.getRootNode() as ShadowRoot | undefined;
        const ring = el ? [...el.querySelectorAll<HTMLButtonElement>('.tr-ht--tour .tr-ht__back, .tr-ht--tour .tr-ht__go, .tr-skip')].filter((b) => !b.disabled) : [];
        if (!ring.length) return;
        const at = ring.indexOf(shadow?.activeElement as HTMLButtonElement);
        const next = at < 0 ? ring.findIndex((b) => b.classList.contains('tr-ht__go')) : (at + (e.shiftKey ? -1 : 1) + ring.length) % ring.length;
        ring[Math.max(0, next)]?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, finish]);

  // ---- the stage: the tabs turn to follow the stop and its hops ----
  // The game's page turn: going on, the page you leave turns over on its left edge towards you and darkens, the next
  // lying under it; going back, the previous page comes down on top. One number, the position along the tabs, draws it.
  const paint = useCallback((pos: number) => {
    panes.current.forEach((pane, i) => {
      if (!pane) return;
      const d = i - pos;
      const s = pane.style;
      if (d <= -1 || d >= 1) {
        s.visibility = 'hidden';
        s.transform = s.filter = '';
        s.zIndex = '0';
      } else if (d <= 0) {
        s.visibility = '';
        s.zIndex = '2';
        s.transform = d < 0 ? `perspective(2200px) rotateY(${d * 90}deg)` : '';
        s.filter = d < 0 ? `brightness(${1 + 0.45 * d})` : '';
      } else {
        s.visibility = '';
        s.zIndex = '1';
        s.transform = '';
        s.filter = `brightness(${0.45 + 0.55 * (1 - d)})`;
      }
    });
  }, []);
  const goTo = usePager(paint, reduced);

  const via = run.hop ? (STOPS[run.hop.to]?.via ?? []) : [];
  const hopNow = run.hop ? (via[run.hop.i] ?? null) : null;
  const hopAt = run.hop ? hopScreen(via, run.hop.i) : null;
  const stopTab = TABS.indexOf(hopAt?.tab ?? STOPS[run.stop]!.tab);
  const placed = useRef(false);
  useLayoutEffect(() => {
    // The specimen night opens on the first stop's tab; from then on the pages turn.
    goTo(stopTab, !placed.current);
    placed.current = true;
  }, [stopTab, goTo]);

  // The tab bar's height, for the pages' room under it.
  useLayoutEffect(() => {
    const el = root.current;
    const bar = el?.querySelector<HTMLElement>('.tr-bar');
    if (!el || !bar) return;
    const seen = new ResizeObserver(() => el.style.setProperty('--tr-bar-h', `${bar.offsetHeight}px`));
    seen.observe(bar);
    el.style.setProperty('--tr-bar-h', `${bar.offsetHeight}px`);
    return () => seen.disconnect();
  }, []);

  const specimen = run.phase === 'on' || run.phase === 'out';
  const stop = stops[run.stop]!;
  const sceneOf = (tab: TabId): SceneId => (hopAt?.tab === tab ? hopAt.scene : stop.tab === tab ? stop.scene : SPECIMEN[tab]);
  const scenes = TABS.map(sceneOf);
  const barScene = SNAP.scenes[scenes[stopTab]!];
  const overlays = hopAt ? SNAP.scenes[hopAt.scene].overlays.filter(shown) : stop.bare ? [] : SNAP.scenes[stop.scene].overlays.filter(shown);

  // What the pen points at on this hop, and what it points from: what the stop lit, or the hop before's target.
  const hopView = useMemo<HopView | null>(() => {
    if (!run.hop || !hopNow) return null;
    const before = run.hop.i > 0 ? [via[run.hop.i - 1]!.target] : STOPS[run.stop]!.lit;
    return {
      to: run.hop.to,
      i: run.hop.i,
      target: hopNow.target,
      label: hopNow.label,
      from: before,
      settle: hopNow.at && !reduced ? HOP_TURN_MS : 0,
      elsewhere: !!hopScreen(via, run.hop.i),
      arrow: hopNow.arrow !== false,
    };
  }, [run.hop, run.stop, hopNow, via, reduced]);

  return (
    <>
      <div className={`tr-veil${specimen ? ' is-on' : ''}`} aria-hidden="true" />
      <div className={`tr-app${specimen ? ' is-touring' : ''}${specimen && stop.peek && !run.hop ? ' is-peek' : ''}`} ref={root}>
        <div className="tr-stage" inert aria-hidden="true" style={specimen ? undefined : { visibility: 'hidden' }}>
          {TABS.map((id, i) => (
            <section
              key={id}
              className={`tr-pane tr-pane--${id}${SNAP.scenes[scenes[i]!].appClass.includes('app--fill') ? ' is-fill' : ''}`}
              data-scroller=""
              ref={(el) => void (panes.current[i] = el)}
            >
              <Page id={scenes[i]!} />
            </section>
          ))}
        </div>
        <div
          className="tr-bar"
          data-tour="tabbar"
          inert
          aria-hidden="true"
          style={specimen ? undefined : { visibility: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: barScene.tabbar }}
        />
        {specimen
          ? overlays.map((html, i) => <div key={`${hopAt?.scene ?? stop.scene}-${i}`} className="tr-over" inert aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />)
          : null}
        <TourLayer
          root={root}
          stops={stops}
          stop={run.stop}
          phase={run.phase}
          first={run.stop === run.from}
          last={run.stop === run.to}
          progress={progressOf(run)}
          reduced={reduced}
          hop={hopView}
          onHopShown={(to, i) => dispatch({ type: 'hopShown', to, i })}
          onBack={() => step(-1)}
          onNext={() => step(1)}
          onEnd={() => finish(false)}
        />
      </div>
    </>
  );
}

/**
 * One scene's app in a scrolling pane, as the game drew it. When the scene changes, the pane goes back to its top, a
 * carousel brings back the card that was in its middle, the standings share out the sheet's height as the game does,
 * and a map is centred again for this phone's width.
 */
function Page({ id }: { id: SceneId }) {
  const scene = SNAP.scenes[id];
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.parentElement) el.parentElement.scrollTop = 0;
    const fit = () => {
      for (const mid of el.querySelectorAll<HTMLElement>('[data-snap-center]')) {
        const track = mid.parentElement;
        if (!track) continue;
        const r = mid.getBoundingClientRect();
        const t = track.getBoundingClientRect();
        track.scrollLeft += r.left + r.width / 2 - (t.left + track.clientWidth / 2);
      }
      // Standings share the sheet's height out among the rows (standingRowSize in src/lib/standingBars.ts): rows from
      // 58px up to half as big again, faces in step.
      for (const st of el.querySelectorAll<HTMLElement>('.st')) {
        const rows = st.querySelector<HTMLElement>('.st__rows');
        const n = Number(st.style.getPropertyValue('--rows')) || rows?.children.length || 0;
        if (!rows || !n || !rows.clientHeight) continue;
        const row = Math.min(87, Math.max(58, Math.floor(rows.clientHeight / n)));
        const face = Math.round((row * 40) / 58);
        st.style.setProperty('--st-row', `${row}px`);
        st.style.setProperty('--st-face', `${face}px`);
        st.querySelectorAll<HTMLElement>('.st__icon').forEach((icon) => icon.style.setProperty('--size', `${face}px`));
      }
      for (const map of el.querySelectorAll<HTMLElement>('[data-snap-map]')) {
        const [w = 0] = (map.dataset.snapMap ?? '').split('x').map(Number);
        map.style.setProperty('--snap-dx', `${Math.round((map.clientWidth - w) / 2)}px`);
      }
    };
    fit();
    const seen = new ResizeObserver(fit);
    seen.observe(el);
    return () => seen.disconnect();
  }, [id]);
  return <div ref={ref} className={scene.appClass} dangerouslySetInnerHTML={{ __html: scene.app }} />;
}
