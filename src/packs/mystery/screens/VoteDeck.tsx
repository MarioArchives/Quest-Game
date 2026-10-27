// The deck: one polaroid at a time. Drag it (or use the buttons) right for yes / maybe, left for no / not it. Past
// 90 px it flies off, the ink stamp having faded in as you dragged; the next card snaps in with no transition.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { usePhotoViewer } from '../../../components/PhotoViewer';
import type { Doc, Submission, VoteStyle } from '../../../shared';
import { Polaroid, useEntryName } from './Polaroid';
import { deckLabels } from './voteDeck';

const FLY_PX = 90;
const TAP_PX = 8;
const FLY_MS = 240;
const TILTS = [-2, 1.5, -1, 2, -1.5, 1];

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface Props {
  style: VoteStyle;
  deck: Doc<Submission>[];
  /** The card on top (0 to deck.length - 1). */
  index: number;
  /** Counting: no vote can be cast. */
  disabled: boolean;
  /** The card left to the right (yes / maybe) or the left (no / not it). Then the screen moves on. */
  onJudge(entry: Doc<Submission>, dir: 'left' | 'right'): void;
  onBack(): void;
}

export function VoteDeck({ style, deck, index, disabled, onJudge, onBack }: Props) {
  const entry = deck[index];
  const labels = deckLabels(style);
  const openPhoto = usePhotoViewer();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const drag = useRef<{ x: number; y: number; target: EventTarget | null; moved: number } | null>(null);
  const timers = useRef<number[]>([]);
  const name = useEntryName(entry ?? deck[0]!);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  // A new card starts from rest.
  useEffect(() => {
    setDx(0);
    setLeaving(0);
  }, [entry?.id]);

  if (!entry) return null;
  const tilt = TILTS[index % TILTS.length]!;

  const fly = (dir: 1 | -1) => {
    if (leaving || disabled) return;
    const commit = () => {
      // The next card snaps in at rest, with no transition.
      setDragging(true);
      setDx(0);
      setLeaving(0);
      onJudge(entry, dir === 1 ? 'right' : 'left');
      timers.current.push(window.setTimeout(() => setDragging(false), 40));
    };
    if (reducedMotion()) return commit();
    setLeaving(dir);
    setDragging(false);
    timers.current.push(window.setTimeout(commit, FLY_MS));
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (leaving || disabled) return;
    drag.current = { x: e.clientX, y: e.clientY, target: e.target, moved: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer */
    }
    setDragging(true);
    setDx(0);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.moved = Math.max(d.moved, Math.abs(e.clientX - d.x), Math.abs(e.clientY - d.y));
    setDx(e.clientX - d.x);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const x = e.clientX - d.x;
    if (e.type !== 'pointercancel' && x > FLY_PX) fly(1);
    else if (e.type !== 'pointercancel' && x < -FLY_PX) fly(-1);
    else {
      setDragging(false);
      setDx(0);
      // A tap on the photo, not a drag, looks closer.
      if (e.type !== 'pointercancel' && d.moved < TAP_PX && d.target instanceof Element && d.target.closest('[data-vt-photo]')) openPhoto(entry.id);
    }
  };

  const ink = (v: number) => String(Math.max(0, Math.min(1, v)));
  const shift = leaving ? leaving * 470 : dx;
  const rot = leaving ? tilt + leaving * 16 : tilt + dx / 20;

  return (
    <div className="vt-deck">
      <div className="vt-progress">
        <div className="vt-segs" aria-hidden="true">
          {deck.map((e, i) => (
            <span key={e.id} className={i < index ? 'is-done' : i === index ? 'is-now' : undefined} />
          ))}
        </div>
        <span className="vt-progress__n">
          {index + 1} / {deck.length}
        </span>
      </div>

      <div className="vt-stack">
        <span className="vt-stack__back vt-stack__back--1" aria-hidden="true" />
        <span className="vt-stack__back vt-stack__back--2" aria-hidden="true" />
        <div
          className="vt-card"
          role="group"
          aria-label={`${index + 1} of ${deck.length}: ${name}’s entry`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ transform: `translateX(${shift}px) rotate(${rot}deg)`, transition: dragging ? 'none' : `transform ${FLY_MS}ms ease` }}
        >
          <Polaroid entry={entry} size="card" tilt={0} byline={`${name.toUpperCase()} · ${index + 1} OF ${deck.length}`} />
          <span className="vt-ink vt-ink--right" aria-hidden="true" style={{ opacity: ink(dx / FLY_PX) }}>
            {labels.right}
          </span>
          <span className="vt-ink vt-ink--left" aria-hidden="true" style={{ opacity: ink(-dx / FLY_PX) }}>
            {labels.left}
          </span>
        </div>
      </div>

      <div className="vt-buttons">
        <div className="vt-btn">
          <button type="button" className="vt-round vt-round--back" aria-label="Back to the last one" disabled={index === 0 || disabled} onClick={onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
          <span>BACK</span>
        </div>
        <div className="vt-btn">
          <button type="button" className="vt-round vt-round--left" aria-label={`${labels.left}: ${name}’s entry`} disabled={disabled} onClick={() => fly(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <span>{labels.left}</span>
        </div>
        <div className="vt-btn vt-btn--go">
          <button type="button" className="vt-round vt-round--right" aria-label={`${labels.right}: ${name}’s entry`} disabled={disabled} onClick={() => fly(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={style === 'yesno' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 17v5M8 3h8l-1 6 3 3H6l3-3z'} />
            </svg>
          </button>
          <span>{labels.right}</span>
        </div>
      </div>
    </div>
  );
}
