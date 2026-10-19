// The reward's Frame step as the suspect sheet: everyone on the standings, each suspect's score now and after the
// frame on a track with the GM's two lines, stamped where the frame would cross one. Tapping a suspect brings up an
// unsigned tip slip, the only way to send the frame; then the sheet shows who took it, with their dot moved. The
// reward's first step gets a ruled card of who a frame would take across a line, and a way to keep the reward for later.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Avatar } from '../../../components/Avatar';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { useGame } from '../../../data/GameProvider';
import { signed } from '../../../lib/standingBars';
import { t } from '../../../pack';
import type { PlayerStanding } from '../../../shared';
import type { FrameHintProps, FramePickerProps } from '../../types';
import { IndexCard, Stamp } from './CaseKit';
import { linesNote, nearLines, sheetEdge, suspectSheet, type SheetRow, type SheetStamp } from './suspectSheet';
import './suspectsheet.css';

const STAMP: Record<SheetStamp, { word: string; tone: 'bad' | 'good' | 'mute' }> = {
  'loses-confidant': { word: 'Loses confidant', tone: 'bad' },
  'onto-watch-list': { word: 'Onto the watch list', tone: 'bad' },
  'drops-below-you': { word: 'Drops below you', tone: 'good' },
  'under-suspicion': { word: 'Under suspicion', tone: 'bad' },
  'already-watched': { word: 'Already watched', tone: 'mute' },
};

/** A frame sent: who took it, their score before and after, and the points it took. */
interface Sent {
  uid: string;
  name: string;
  before: number;
  after: number;
  taken: number;
}

export default function SuspectSheet({ targets, busy, frame, back, close }: FramePickerProps) {
  const { settings, me } = useGame();
  const [pickedUid, setPickedUid] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const slipRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const doneId = useId();

  const rows = suspectSheet(me ? [...targets, me] : targets, me?.id ?? '', settings, sent);
  const edge = sheetEdge(rows, settings);
  const picked = pickedUid ? (rows.find((r) => r.uid === pickedUid && !r.me) ?? null) : null;
  const note = linesNote(settings);

  // The slip takes the focus as it opens. As the frame lands, the result comes into view and Close takes the focus.
  useEffect(() => {
    if (picked) slipRef.current?.focus();
  }, [picked?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sent) return;
    doneRef.current?.scrollIntoView({ block: 'nearest' });
    closeRef.current?.focus({ preventScroll: true });
  }, [sent]);

  const unpick = () => {
    const uid = pickedUid;
    setPickedUid(null);
    if (uid) requestAnimationFrame(() => rowRefs.current.get(uid)?.focus());
  };
  const send = async (row: SheetRow) => {
    const target = targets.find((p) => p.id === row.uid);
    if (!target || row.after == null) return;
    const points = await frame(target);
    if (points == null) return;
    setSent({ uid: row.uid, name: row.name, before: row.points, after: row.points + points, taken: Math.abs(points) });
    setPickedUid(null);
  };
  const onSlipKey = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      // Round the slip's own buttons (the sheet behind it is inert).
      event.stopPropagation();
      const buttons = [...(slipRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return event.preventDefault();
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === slipRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== 'Escape' || busy) return;
    // Back to the sheet, not out of the pop-up.
    event.stopPropagation();
    unpick();
  };

  if (!sent && targets.length === 0) {
    return (
      <div className="ss">
        <p className="ss__empty">There is nobody else to frame.</p>
        <button type="button" className="ss__back" onClick={back}>
          <Icon name="chevron" size={16} strokeWidth={2.6} className="ss__back-icon" />
          Back
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="ss" inert={picked ? true : undefined}>
        {sent ? (
          <p className="ss__done" role="status" id={doneId} ref={doneRef}>
            <b>
              {sent.name} &minus;{sent.taken}
            </b>{' '}
            <span>No other suspect will know it was you.</span>
          </p>
        ) : (
          <div className="ss__head">
            <span>&minus;{settings.framePoints} off one suspect</span>
            <span className="ss__key" aria-hidden="true">
              <i className="ss__key-now" />
              now <i className="ss__key-after" />
              if framed
            </span>
          </div>
        )}
        <ol className="ss__rows" aria-label="Suspects">
          {rows.map((r) => {
            const hit = sent?.uid === r.uid;
            const chosen = picked?.uid === r.uid;
            const body = <RowBody row={r} edge={edge} sent={sent} />;
            return (
              <li key={r.uid} className={`ss-row${r.me ? ' ss-row--you' : ''}${chosen ? ' is-picked' : ''}${hit ? ' is-hit' : ''}`}>
                {r.me || sent || r.after == null ? (
                  <div className="ss-row__in">{body}</div>
                ) : (
                  <button
                    type="button"
                    className="ss-row__in"
                    disabled={busy}
                    ref={(el) => {
                      if (el) rowRefs.current.set(r.uid, el);
                      else rowRefs.current.delete(r.uid);
                    }}
                    aria-label={`${r.name}, ${signed(r.points)}, ${signed(r.after)} if framed${r.stamp ? `, ${STAMP[r.stamp].word.toLowerCase()}` : ''}`}
                    onClick={() => setPickedUid(r.uid)}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {sent ? (
          <button type="button" className="cf-btn cf-btn--go ss__close" ref={closeRef} aria-describedby={doneId} onClick={close}>
            Close
          </button>
        ) : (
          <div className="ss__foot">
            <button type="button" className="ss__back" disabled={busy} onClick={back}>
              <Icon name="chevron" size={16} strokeWidth={2.6} className="ss__back-icon" />
              Back
            </button>
            <span>Tap a suspect{note ? ` · ${note}` : ''}</span>
          </div>
        )}
        {picked ? <div className="ss__dim" /> : null}
      </div>
      {picked && picked.after != null ? (
        <div className="ss-tip" role="dialog" aria-label="Anonymous tip" tabIndex={-1} ref={slipRef} onKeyDown={onSlipKey}>
          <div className="ss-tip__head">
            <span>Anonymous tip</span>
            <Stamp tone="bad">Unsigned</Stamp>
          </div>
          <p className="ss-tip__text">Look closer at {picked.name}.</p>
          <p className="ss-tip__move">
            <b>{picked.name}</b>
            <span>
              {signed(picked.points)} &rarr; <em>{signed(picked.after)}</em>
            </span>
          </p>
          <p className="ss-tip__sign">
            Signed <span aria-hidden="true" /> <i>left blank</i>
          </p>
          <div className="cf-btns ss-tip__btns">
            <button type="button" className="cf-btn" disabled={busy} onClick={unpick}>
              Back
            </button>
            <button type="button" className="cf-btn cf-btn--red" disabled={busy} aria-busy={busy || undefined} onClick={() => void send(picked)}>
              {busy ? <Loader size={24} label="Sending the tip" /> : null}
              {busy ? 'Sending…' : 'Send it unsigned'}
            </button>
          </div>
          <p className="ss-tip__fine">
            The feed says someone framed {picked.name}. Only the {t.gm.one}&rsquo;s file has your name.
          </p>
        </div>
      ) : null}
    </>
  );
}

/** A row's face, name, stamp, score move and track. */
function RowBody({ row: r, edge, sent }: { row: SheetRow; edge: number; sent: Sent | null }) {
  const { settings, me } = useGame();
  const hit = sent?.uid === r.uid;
  const stamp = sent ? null : r.stamp ? STAMP[r.stamp] : null;
  return (
    <>
      <span className="ss-face">
        <Avatar name={r.name} src={r.photoURL} size={40} uid={r.uid} />
        {r.standing ? <Pin standing={r.standing} /> : null}
      </span>
      <span className="ss-main">
        <span className="ss-top">
          <b className="ss-name">{r.me ? 'You' : r.name}</b>
          {hit ? <span className="ss-chip ss-chip--hit">Framed &minus;{sent.taken}</span> : null}
          {stamp ? <span className={`ss-chip ss-chip--${stamp.tone}`}>{stamp.word}</span> : null}
          <span className="ss-move">
            {r.me ? (
              <>
                {signed(r.points)}
                {me?.rank ? ` · #${me.rank}` : ''}
              </>
            ) : hit ? (
              <em>{signed(r.points)}</em>
            ) : sent || r.after == null ? (
              signed(r.points)
            ) : (
              <>
                {signed(r.points)} &rarr; <em>{signed(r.after)}</em>
              </>
            )}
          </span>
        </span>
        <Track
          edge={edge}
          points={r.points}
          after={sent || r.me ? null : r.after}
          was={hit ? sent.before : null}
          tone={r.me ? 'you' : r.points > 0 ? 'pos' : r.points < 0 ? 'neg' : 'zero'}
          lines={settings}
        />
      </span>
    </>
  );
}

/**
 * The row's track: the Board's scale left to right, the GM's lines dashed across it with the ground beyond each tinted,
 * the dot where they are now and, for a suspect, a red-pen arrow to the ring where a frame would leave them (or, once
 * framed, a pencil ring where they were).
 */
function Track({
  edge,
  points,
  after,
  was,
  tone,
  lines,
}: {
  edge: number;
  points: number;
  after: number | null;
  was: number | null;
  tone: 'you' | 'pos' | 'neg' | 'zero';
  lines: { confidantAbove: number | null; poiBelow: number | null };
}) {
  const x = (p: number) => Math.max(-1, Math.min(1, p / edge));
  const at = (p: number) => ({ '--x': x(p) }) as CSSProperties;
  return (
    <span className="ss-track" aria-hidden="true">
      {lines.poiBelow != null ? <span className="ss-track__band ss-track__band--poi" style={at(lines.poiBelow)} /> : null}
      {lines.confidantAbove != null ? <span className="ss-track__band ss-track__band--confidant" style={at(lines.confidantAbove)} /> : null}
      <span className="ss-track__zero" />
      {lines.poiBelow != null ? <span className="ss-track__line ss-track__line--poi" style={at(lines.poiBelow)} /> : null}
      {lines.confidantAbove != null ? <span className="ss-track__line ss-track__line--confidant" style={at(lines.confidantAbove)} /> : null}
      {after != null && after !== points ? <span className="ss-track__arrow" style={{ '--from': x(points), '--to': x(after) } as CSSProperties} /> : null}
      {after != null && after !== points ? <span className="ss-dot ss-dot--after" style={at(after)} /> : null}
      {was != null ? <span className="ss-dot ss-dot--was" style={at(was)} /> : null}
      <span className={`ss-dot ss-dot--${tone}`} style={at(points)} />
    </span>
  );
}

const PIN_ICON = { confidant: 'phone', poi: 'eye' } as const;

/** A standing's enamel pin: a phone for a trusted confidant, an eye for a person of interest. */
function Pin({ standing }: { standing: PlayerStanding }) {
  return (
    <span className={`ss-pin ss-pin--${standing}`} aria-hidden="true">
      <Icon name={PIN_ICON[standing]} strokeWidth={2.6} />
    </span>
  );
}

/** Under the reward's two choices: who a frame would take across a line now, and keeping the reward for later. */
export function CloseToALine({ targets, busy, close }: FrameHintProps) {
  const { settings, me } = useGame();
  const near = nearLines(suspectSheet(me ? [...targets, me] : targets, me?.id ?? '', settings), settings);
  return (
    <>
      {near.length > 0 ? (
        <IndexCard className="ss-near">
          <b className="ss-near__title">Close to a line</b>
          <ul className="ss-near__list">
            {near.map((n) => (
              <li key={n.uid}>
                <Pin standing={n.line} />
                <span>
                  {n.name} {signed(n.points)} · {n.line === 'confidant' ? `${n.gap} over the teal line` : n.gap === 0 ? 'on the red line' : `${n.gap} off the red line`}
                </span>
              </li>
            ))}
          </ul>
        </IndexCard>
      ) : null}
      <button type="button" className="ss-later" disabled={busy} onClick={close}>
        Keep it for later
      </button>
    </>
  );
}
