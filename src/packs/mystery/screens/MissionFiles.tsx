// Under the Missions tab's stack (the missions-active mockups, C2): Still open, a green folder of slips, one per group
// or story mission you're in while it still takes entries (your entry, its clock and Change); Filed tonight, every
// closed mission folded into one folder edge with your marks, which opens to list them; the Next line; and the story
// so far (its fired announcements and the case notes).
import { useState } from 'react';
import { EvidenceSheet } from '../../../components/EvidenceSheet';
import { Icon } from '../../../components/Icon';
import { formatDelta } from '../../../components/PointsChip';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useStorageUrl } from '../../../data/hooks';
import type { Mark } from '../../../lib/missionTabs';
import { tabClock } from '../../../lib/missionTabs';
import { clockTime } from '../../../lib/time';
import { zone } from '../../../pack';
import { CaseNotes } from './CaseNotes';
import { FiledResult, MarkIcon } from './MissionBinder';
import type { Deck, DeckMission, FiledMission, StoryNote } from './useMissionDeck';

const MARK_WORDS: Record<Mark, string> = { won: 'you won', entered: 'you were in', missed: 'you missed it' };

/** The slips' anchor, for a link into the tab that lands on one. */
export const slipId = (missionId: string) => `ms-in-${missionId}`;

export function MissionFiles({ deck }: { deck: Deck }) {
  const { state } = useGame();
  return (
    <>
      <StillOpen missions={deck.stillOpen} />
      {deck.filed.length > 0 || state.status !== 'lobby' ? <FiledTonight items={deck.filed} /> : null}
      {deck.next ? <p className="ms-next">{deck.next}</p> : null}
      <StorySoFar notes={deck.story.notes} facts={deck.story.facts} />
    </>
  );
}

/** What you're in and can still change: a slip each, in a folder of its own. */
function StillOpen({ missions }: { missions: DeckMission[] }) {
  if (missions.length === 0) return null;
  return (
    <section className="ms-in" aria-labelledby="ms-in-h" data-tour="still-open">
      <header className="ms-sec__h">
        <h3 id="ms-in-h">Still open</h3>
        <span>you’re in · change it till it closes</span>
      </header>
      <div className="ms-in__folder">
        <span className="ms-in__tab" aria-hidden="true">
          Your entries <b>{missions.length}</b>
        </span>
        <ol className="ms-in__slips">
          {missions.map((m) => (
            <Slip key={m.id} m={m} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** One entry still open: its print, the mission, when you sent it, the time left and Change. */
function Slip({ m }: { m: DeckMission }) {
  const { state } = useGame();
  const now = useNow(1000);
  const entry = m.entry!;
  const thumb = useStorageUrl(entry.thumbPath ?? null);
  const [editing, setEditing] = useState(false);
  const clock = m.deadlineMs !== null && m.deadlineMs > now ? tabClock(m.deadlineMs, now) : null;
  const what = entry.videoPath ? 'Your video' : entry.thumbPath ? 'Your photo' : 'Your note';
  return (
    <li className="ms-slip" id={slipId(m.id)}>
      <span className="ms-slip__print" aria-hidden="true">
        {thumb ? <img src={thumb} alt="" /> : <Icon name={entry.thumbPath || entry.videoPath ? 'image' : 'comment'} size={20} />}
      </span>
      <span className="ms-slip__m">
        <span className="ms-slip__k">{m.kicker}</span>
        <b>{m.title}</b>
        <span className="ms-slip__you">
          {what} · sent {clockTime(tsMs(entry.createdAt), zone)}
        </span>
        {entry.status === 'sealed' ? <span className="ms-slip__note">hidden until voting</span> : null}
      </span>
      <span className="ms-slip__end">
        <span className="ms-slip__clock">
          {clock ?? '00:00'}
          <small>{clock ? 'left' : 'time’s up'}</small>
        </span>
        <button
          type="button"
          className="ms-slip__btn"
          disabled={state.status !== 'active' || !clock}
          aria-label={`Change your entry: ${m.title}`}
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      </span>
      {editing ? <EvidenceSheet target={{ mode: 'evidence', submission: entry, title: m.title }} onClose={() => setEditing(false)} /> : null}
    </li>
  );
}

/** Your mark and what it cost or paid. */
function MarkBits({ f }: { f: FiledMission }) {
  return (
    <>
      {f.mark ? (
        <>
          <MarkIcon mark={f.mark} />
          <span className="visually-hidden"> {MARK_WORDS[f.mark]}</span>
        </>
      ) : null}
      {f.delta ? (
        <span className={f.delta < 0 ? 'ms-neg' : 'ms-pos'}>
          {formatDelta(f.delta)}
          <span className="visually-hidden"> points</span>
        </span>
      ) : null}
    </>
  );
}

/** Every mission closed tonight as one closed folder: your marks along it; it opens to list them. Empty, it waits shut. */
function FiledTonight({ items }: { items: FiledMission[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) {
    return (
      <section className="ms-filed" data-tour="filed" aria-label="Filed tonight">
        <p className="ms-filed__bar is-empty">
          <b>Filed tonight</b>
          <span className="ms-filed__marks">nothing closed yet</span>
          <b>0</b>
        </p>
      </section>
    );
  }
  return (
    <section className={`ms-filed${open ? ' is-open' : ''}`} data-tour="filed" aria-label="Filed tonight">
      <button type="button" className="ms-filed__bar" aria-expanded={open} aria-controls="ms-filed-list" onClick={() => setOpen((o) => !o)}>
        <b>Filed tonight</b>
        <span className="ms-filed__marks">
          {items.map((f) => (
            <span key={f.id} className={`ms-filed__mk${f.mark ? '' : ' is-blank'}`}>
              {f.mark ? <MarkIcon mark={f.mark} /> : null}
            </span>
          ))}
        </span>
        <b>
          {items.length} <Icon name="chevronDown" size={16} strokeWidth={2.4} className="ms-filed__chev" />
        </b>
      </button>
      {open ? (
        <ol className="ms-filed__list" id="ms-filed-list">
          {items.map((f) => (
            <FiledRow key={f.id} f={f} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/** One filed mission; a group or story mission opens to its result. */
function FiledRow({ f }: { f: FiledMission }) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <span className="ms-r__m">
        <i>{f.kicker}</i>
        <span>{f.title}</span>
        <i>{f.mark === 'missed' ? 'missed' : f.mark === 'won' ? 'won' : f.mark === 'entered' ? (f.checkin ? 'present' : 'in') : 'filed'}</i>
      </span>
      <span className="ms-filed__end">
        <MarkBits f={f} />
      </span>
    </>
  );
  if (!f.quest) return <li className="ms-r ms-r--filed">{body}</li>;
  return (
    <li className="ms-r ms-r--filed">
      <button type="button" className="ms-r__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {body}
      </button>
      {open ? (
        <div className="ms-result">
          <FiledResult mission={f.quest} label={f.label} />
        </div>
      ) : null}
    </li>
  );
}

/** The story's fired announcements, as revealed notes, and the case notes (what the night has settled). */
function StorySoFar({ notes, facts }: { notes: StoryNote[]; facts: Deck['story']['facts'] }) {
  if (notes.length === 0 && facts.length === 0) return null;
  return (
    <section className="ms-sec" aria-labelledby="ms-story-h">
      <header className="ms-sec__h">
        <h3 id="ms-story-h">The story so far</h3>
      </header>
      <ol className="ms-rows">
        {notes.map((n) => (
          <li key={n.id} className="ms-r ms-r--note">
            <b>{n.label}</b>
            <span className="ms-r__m">
              <span>{n.title}</span>
              {n.text ? <i>{n.text}</i> : null}
            </span>
          </li>
        ))}
        <CaseNotes facts={facts} />
      </ol>
    </section>
  );
}
