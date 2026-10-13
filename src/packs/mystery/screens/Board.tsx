// The Board: two tabs. Feed is the engine's home (group missions and game updates, minus its ranks strip),
// Standings is bars from zero on a squared grid (±25 in squares of 5, wider when someone goes past it), filed under
// its own tab. The standings move: scores glide from what you last saw to where they are, rows slide to their new
// places, and each change since then shows as a "+5" / "−5" chip for a few seconds.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../../../components/Avatar';
import { Loader } from '../../../components/Loader';
import { useGame } from '../../../data/GameProvider';
import { scaleTicks, signed, standingBars, standingScale } from '../../../lib/standingBars';
import { easeOutCubic, parseSeen, pointDeltas, rankUids, tweenPoints, type PointsByUid } from '../../../lib/standingsMotion';
import { useSession } from '../../../session/SessionProvider';
import { TimelineFeed } from './TimelineFeed';
import './board.css';

type BoardTab = 'feed' | 'standings';
const STORAGE_KEY = 'board-tab';
/** The scores this viewer last saw on the standings (this device only). */
const SEEN_KEY = 'board-standings-seen';
const GLIDE_MS = 1200;
/** The grid's edge rides along with the scores under a key no player id can have. */
const EDGE = ' edge';

function savedTab(): BoardTab {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'standings' ? 'standings' : 'feed';
  } catch {
    return 'feed';
  }
}

export default function Board() {
  const [tab, setTab] = useState<BoardTab>(savedTab);
  const choose = (next: BoardTab) => {
    setTab(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* no storage: the tab just isn't remembered */
    }
  };
  return (
    <>
      <div className={`bd-tabs${tab === 'standings' ? ' bd-tabs--file' : ''}`} role="tablist" aria-label="Board">
        {(['feed', 'standings'] as const).map((id) => (
          <button key={id} type="button" role="tab" id={`bd-tab-${id}`} aria-selected={tab === id} aria-controls="bd-panel" className="bd-tab" onClick={() => choose(id)}>
            {id === 'feed' ? 'Feed' : 'Standings'}
          </button>
        ))}
      </div>
      <div id="bd-panel" role="tabpanel" aria-labelledby={`bd-tab-${tab}`} className={`bd-panel${tab === 'standings' ? ' bd-panel--bleed' : ''}`}>
        {tab === 'feed' ? (
          <TimelineFeed />
        ) : (
          <Standings />
        )}
      </div>
    </>
  );
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function readSeen(): PointsByUid | null {
  try {
    return parseSeen(localStorage.getItem(SEEN_KEY));
  } catch {
    return null;
  }
}

function writeSeen(points: PointsByUid) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(points));
  } catch {
    /* no storage: next time starts from 0 again */
  }
}

/**
 * Scores (and the grid's edge) as shown: gliding from `seen` (or 0) to `target` when the screen opens, and from
 * wherever they are to the new target whenever a score changes. Also what changed, numbered so each change replays.
 */
function useGlide(target: PointsByUid, seen: PointsByUid | null, edge: number, seenEdge: number) {
  const key = JSON.stringify({ ...target, [EDGE]: edge });
  const [shown, setShown] = useState<PointsByUid>(() =>
    reducedMotion() ? { ...target, [EDGE]: edge } : { ...tweenPoints(seen ?? {}, target, 0), [EDGE]: seenEdge },
  );
  const [change, setChange] = useState<{ id: number; deltas: PointsByUid }>({ id: 0, deltas: {} });
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const settled = useRef<PointsByUid | null>(seen);

  useEffect(() => {
    const goal = JSON.parse(key) as PointsByUid;
    const { [EDGE]: _edge, ...points } = goal;
    const deltas = pointDeltas(settled.current, points);
    if (Object.keys(deltas).length > 0) setChange((c) => ({ id: c.id + 1, deltas }));
    settled.current = points;
    writeSeen(points);
    if (reducedMotion()) return setShown(goal);
    const from = shownRef.current;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = easeOutCubic((now - started) / GLIDE_MS);
      setShown(tweenPoints(from, goal, progress));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key]);

  return { shown, change };
}

/** Rows slide from their old place to their new one when the order changes (all rows are the same height). */
function useSlide(order: string[], before: string[]) {
  const list = useRef<HTMLOListElement>(null);
  const last = useRef(before);
  const orderKey = order.join(' ');
  useLayoutEffect(() => {
    const previous = last.current;
    last.current = orderKey.split(' ');
    if (!list.current || reducedMotion()) return;
    for (const el of Array.from(list.current.children) as HTMLElement[]) {
      const uid = el.dataset.uid ?? '';
      const was = previous.indexOf(uid);
      const now = last.current.indexOf(uid);
      if (was < 0 || was === now) continue;
      // While it slides the row is lifted above the grid, so the lines never cross its face; it settles back when no
      // slide is left running on it (a newer one may have started meanwhile).
      el.classList.add('is-moving');
      const slide = el.animate([{ transform: `translateY(${(was - now) * el.offsetHeight}px)` }, { transform: 'none' }], {
        duration: GLIDE_MS,
        easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)',
      });
      const settle = () => {
        if (el.getAnimations().length === 0) el.classList.remove('is-moving');
      };
      slide.onfinish = settle;
      slide.oncancel = settle;
    }
  }, [orderKey]);
  return list;
}

function Standings() {
  const { user } = useSession();
  const { ready, players } = useGame();
  const navigate = useNavigate();

  const bars = standingBars(players, user?.uid ?? null);
  const scale = standingScale(bars.map((b) => b.points));
  const target = Object.fromEntries(bars.map((b) => [b.uid, b.points]));
  // Read once per visit: the glide starts from what you saw last time (or from 0, without chips, the first time).
  const [seen] = useState(readSeen);
  const [seenEdge] = useState(() => (seen ? standingScale(Object.values(seen)).max : scale.max));
  const { shown, change } = useGlide(target, seen, scale.max, seenEdge);
  const [before] = useState(() => (seen ? rankUids(bars, seen) : bars.map((b) => b.uid)));
  const list = useSlide(
    bars.map((b) => b.uid),
    before,
  );

  if (!ready) return <Loader className="app__loader" caption="Loading" />;
  if (bars.length === 0) {
    return (
      <div className="empty">
        <h3>Nobody on the board</h3>
        <p>Suspects show up here once the GM lets them in.</p>
      </div>
    );
  }
  const edge = shown[EDGE] ?? scale.max;
  // A position on the grid, as a share of the half-width: + to the left (in the clear), − to the right.
  const at = (points: number) => points / edge;
  const vars = (v: Record<string, string | number>) => v as CSSProperties;

  return (
    <section className="st" aria-label="Standings" style={vars({ '--rows': bars.length, '--squares': edge / scale.step })}>
      <div className="st__grid" aria-hidden="true">
        {scaleTicks(scale).map((tick) => (
          <span key={tick.value} className={`st__line${tick.value === 0 ? ' st__line--zero' : ''}`} style={vars({ '--x': at(tick.value) })} />
        ))}
      </div>
      <div className="st__top">
        <div className="st__heads" aria-hidden="true">
          <span className="st__head st__head--clear">&larr; In the clear</span>
          <span className="st__head st__head--suspect">Under suspicion &rarr;</span>
        </div>
        <div className="st__axis" aria-hidden="true">
          {scaleTicks(scale).map((tick) =>
            tick.label ? (
              <span key={tick.value} className="st__tick" style={vars({ '--x': at(tick.value) })}>
                {tick.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <ol className="st__rows" ref={list}>
        {bars.map((b) => {
          const now = Math.round(shown[b.uid] ?? b.points);
          const side = now > 0 ? 'plus' : now < 0 ? 'minus' : 'zero';
          const delta = change.deltas[b.uid];
          return (
            <li key={b.uid} className="st__li" data-uid={b.uid}>
              <button
                type="button"
                className={`st__row st__row--${side}${b.me ? ' st__row--me' : ''}`}
                style={vars({ '--f': Math.abs(at(shown[b.uid] ?? b.points)) })}
                aria-label={`${b.me ? 'You' : b.name}, ${b.label}`}
                onClick={() => navigate(`/player/${b.uid}`)}
              >
                {side !== 'zero' ? <span className="st__bar" /> : null}
                <span className="st__face">
                  <Avatar name={b.name} src={b.photoURL} size={40} uid={b.uid} className={`st__icon st__icon--${side}`} />
                </span>
                <span className="st__label" aria-hidden="true">
                  <span className={`st__name${b.me ? ' st__name--me' : ''}`}>{b.me ? 'You' : b.name}</span> <span className="st__score">{signed(now)}</span>
                  {delta ? (
                    <span key={change.id} className={`st__delta st__delta--${delta > 0 ? 'up' : 'down'}`}>
                      {signed(delta)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="st__key">1 square = {scale.step} points</p>
    </section>
  );
}
