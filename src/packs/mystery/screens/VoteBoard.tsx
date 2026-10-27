// The cork board: every polaroid still in the running pinned round the question, with strings from it. Tap one to
// look closer in a sheet (the big polaroid, the eye and the heart, and your vote on it). The tray has only a way
// back through the deck and Done.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Doc, Judgement, Submission, VoteStyle } from '../../../shared';
import { PinPolaroid, Polaroid, useEntryName } from './Polaroid';
import { boardLayout, boardMark, choosePrompt, doneEnabled, POLAROID, QUESTION_CARD, stringWeight, type DeckEntry, type Mark } from './voteDeck';

/** A few seeded specks on the cork (the same every time). */
function specks(height: number): { x: number; y: number; s: number }[] {
  const r = (i: number, n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
  const count = Math.round(30 * (height / 610));
  return Array.from({ length: count }, (_, i) => ({ x: Math.round(r(i, 1) * 100), y: Math.round(r(i, 2) * height), s: 2 + Math.round(r(i, 3) * 3) }));
}

interface BoardProps {
  style: VoteStyle;
  question: string;
  /** Who is pinned (voteDeck's boardEntries). */
  entries: Doc<Submission>[];
  deck: DeckEntry[];
  marks: Readonly<Record<string, Mark>>;
  pickedId: string | null;
  disabled: boolean;
  onOpen(entry: Doc<Submission>): void;
  onAgain(): void;
  onDone(): void;
}

export function VoteBoard({ style, question, entries, deck, marks, pickedId, disabled, onOpen, onAgain, onDone }: BoardProps) {
  const corkRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);
  // The layout follows the board's width (the layer is the phone's width, but a desktop window is wider).
  useLayoutEffect(() => {
    const el = corkRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = boardLayout(entries.length, width);
  const prompt = choosePrompt(style, pickedId);
  const hub = layout.hub;
  return (
    <div className="vt-boardwrap">
      <div className="vt-cork" ref={corkRef}>
        <div className="vt-board" style={{ width: layout.width, height: layout.height }}>
          <div aria-hidden="true">
            {specks(layout.height).map((k, i) => (
              <span key={i} className="vt-speck" style={{ left: `${k.x}%`, top: k.y, width: k.s, height: k.s }} />
            ))}
            {entries.map((e, i) => {
              const g = layout.strings[i];
              if (!g) return null;
              const weight = stringWeight(style, e.id, marks, pickedId);
              return <span key={e.id} className={`vt-string vt-string--${weight}`} style={{ left: hub.x, top: hub.y, width: g.length, transform: `rotate(${g.angle}deg)` }} />;
            })}
          </div>
          <div className="vt-question" style={{ left: hub.x - QUESTION_CARD.w / 2, top: hub.y - QUESTION_CARD.h / 2, width: QUESTION_CARD.w, minHeight: QUESTION_CARD.h }}>
            <span className="vt-question__pin" aria-hidden="true" />
            {prompt ? <span className="vt-question__prompt">{prompt}</span> : null}
            <span className="vt-question__text">{question}</span>
          </div>
          <ul className="vt-pins">
            {entries.map((e, i) => {
              const spot = layout.spots[i];
              if (!spot) return null;
              const mark = boardMark(style, e.id, marks, pickedId);
              return (
                <PinPolaroid
                  key={e.id}
                  entry={e}
                  tilt={spot.rot}
                  stamp={mark.stamp}
                  tag={mark.tag}
                  voted={e.id === pickedId}
                  style={{ left: spot.left, top: spot.top, width: POLAROID.w }}
                  onOpen={() => onOpen(e)}
                />
              );
            })}
          </ul>
        </div>
      </div>
      <footer className="vt-tray">
        <button type="button" className="vt-tray__again" aria-label="Swipe through them again" disabled={disabled} onClick={onAgain}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <button type="button" className="vt-tray__done" disabled={!doneEnabled(style, deck, marks, pickedId)} onClick={onDone}>
          Done
        </button>
      </footer>
    </div>
  );
}

interface SheetProps {
  style: VoteStyle;
  entry: Doc<Submission>;
  /** "EXHIBIT 02". */
  number: number;
  pickedId: string | null;
  judged: Readonly<Record<string, Judgement>>;
  disabled: boolean;
  /** A no here would leave the ballot without a single yes (noLeavesNoYes): it can't be cast. */
  noBlocked?: boolean;
  onVote(entry: Doc<Submission>, judgement?: Judgement): void;
  onClose(): void;
}

/** The sheet over the board: a pinned polaroid, big, with the eye and the heart and your vote on it. */
export function EntrySheet({ style, entry, number, pickedId, judged, disabled, noBlocked = false, onVote, onClose }: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  const name = useEntryName(entry);
  // Focus goes into the sheet and back to what opened it.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => opener?.focus?.();
  }, []);
  const said = judged[entry.id];
  const pinned = pickedId === entry.id;
  return (
    <div className="vt-sheetwrap">
      <button type="button" className="vt-scrim" aria-label="Back to the board" tabIndex={-1} onClick={onClose} />
      <section
        className="vt-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${name}’s entry`}
        tabIndex={-1}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <Polaroid entry={entry} size="sheet" tilt={-1.2} byline={`${name.toUpperCase()} · EXHIBIT ${String(number).padStart(2, '0')}`} />
        {style === 'pick' ? (
          <button type="button" className="vt-act vt-act--pin" disabled={disabled} onClick={() => onVote(entry)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="5" />
              <path d="M12 13v8" />
            </svg>
            <span>{pinned ? 'Your pin is here' : pickedId ? 'Move my red pin here' : 'Pin my vote here'}</span>
          </button>
        ) : (
          <div className="vt-act-pair" role="group" aria-label="Your vote on this one">
            <button type="button" className="vt-act vt-act--no" aria-pressed={said === 'no'} disabled={disabled || noBlocked} onClick={() => onVote(entry, 'no')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              <span>No</span>
            </button>
            <button type="button" className="vt-act vt-act--yes" aria-pressed={said === 'yes'} disabled={disabled} onClick={() => onVote(entry, 'yes')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <span>Yes</span>
            </button>
            {noBlocked && said !== 'no' ? (
              <p className="vt-hint vt-hint--sheet" role="status">
                Say yes to at least one. To say no here, say yes to another first.
              </p>
            ) : null}
          </div>
        )}
        <button type="button" className="vt-back" onClick={onClose}>
          Back to the board
        </button>
      </section>
    </div>
  );
}

