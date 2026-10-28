// The Missions tab's index dividers (option E): Group events, Periodic missions and Story missions, each with what is
// open first (a row's chip names its folder in the stack; tapping the row pulls that folder forward), then what comes
// next (a random drop, the next roll call for the GM, the sealed chapters), then the filed ones folded into one line
// that opens.
import { Fragment, useState, type ReactNode } from 'react';
import { Icon } from '../../../components/Icon';
import { formatDelta } from '../../../components/PointsChip';
import { useGame } from '../../../data/GameProvider';
import { useNow, useQuery } from '../../../data/hooks';
import type { Mark } from '../../../lib/missionTabs';
import { tabClock } from '../../../lib/missionTabs';
import { features, t } from '../../../pack';
import { useSession } from '../../../session/SessionProvider';
import type { CheckinAnswer } from '../../../shared';
import { CaseNotes } from './CaseNotes';
import { FiledResult, MarkIcon } from './MissionBinder';
import { openLine, rangeLabel } from './missionDeck';
import { dropsAside, type Deck, type DeckMission, type FiledMission, type StoryNote } from './useMissionDeck';

type SectionId = 'group' | 'periodic' | 'story';

const SECTIONS: Record<SectionId, { title: string }> = {
  group: { title: 'Group events' },
  periodic: { title: 'Periodic missions' },
  story: { title: 'Story missions' },
};

const MARK_WORDS: Record<Mark, string> = { won: 'you won', entered: 'you were in', missed: 'you missed it' };

export function MissionDividers({ deck, onPull }: { deck: Deck; onPull(id: string): void }) {
  const { state } = useGame();
  const ids: SectionId[] = [
    ...(features.sideQuests ? (['group'] as const) : []),
    ...(features.checkins ? (['periodic'] as const) : []),
    ...(deck.story.total > 0 ? (['story'] as const) : []),
  ];
  const going = state.status !== 'ended';

  if (ids.length === 0) return null;

  return (
    <div className="ms-secs">
        {ids.includes('group') ? (
          <Section id="group" aside={dropsAside(deck.group.drops)}>
            {deck.group.open.map((m) => (
              <OpenRow key={m.id} m={m} onPull={onPull} />
            ))}
            {going ? <DimRow label="Next" title={deck.group.drops ? 'Random drop' : `From the ${t.gm.One}`} line={deck.group.drops ? 'can land at any time' : `when the ${t.gm.one} sends one`} /> : null}
            {deck.group.filed.length > 0 ? <FiledFold items={deck.group.filed} /> : null}
          </Section>
        ) : null}
        {ids.includes('periodic') ? (
          <Section id="periodic" aside={deck.periodic.aside}>
            {deck.periodic.open.map((m) => (
              <OpenRow key={m.id} m={m} onPull={onPull} />
            ))}
            {going ? deck.periodic.next.map((n) => <DimRow key={n.id} label={n.label} title={n.name} line={n.line} />) : null}
            {deck.periodic.open.length + deck.periodic.filed.length + (going ? deck.periodic.next.length : 0) === 0 ? (
              <DimRow label="—" title="None yet tonight" line="they come as the night goes on" />
            ) : null}
            {deck.periodic.filed.length > 0 ? <FiledFold items={deck.periodic.filed} /> : null}
          </Section>
        ) : null}
        {ids.includes('story') ? (
          <Section id="story" aside={`${deck.story.total} chapters`}>
            {deck.story.open.map((m) => (
              <OpenRow key={m.id} m={m} onPull={onPull} />
            ))}
            {deck.story.notes.map((n) => (
              <NoteRow key={n.id} note={n} />
            ))}
            {deck.story.sealed.length > 0 ? <SealedRow numbers={deck.story.sealed} /> : null}
            {deck.story.filed.length > 0 ? <FiledFold items={deck.story.filed} /> : null}
            {deck.story.facts.length > 0 || deck.story.notes.length > 0 ? <CaseNotes facts={deck.story.facts} /> : null}
          </Section>
        ) : null}
    </div>
  );
}

/** The dividers' names for the torch tour (data-tour), which lights them. */
const TOUR: Record<SectionId, string> = { group: 'events', periodic: 'rollcall', story: 'story' };

function Section({ id, aside, children }: { id: SectionId; aside: string; children: ReactNode }) {
  return (
    <section className="ms-sec" aria-labelledby={`ms-sec-${id}`} data-tour={TOUR[id]}>
      <header className="ms-sec__h">
        <h3 id={`ms-sec-${id}`}>
          {SECTIONS[id].title}
        </h3>
        {aside ? <span>{aside}</span> : null}
      </header>
      <ol className="ms-rows">{children}</ol>
    </section>
  );
}

/** An open mission: its number, title and state, and the chip naming its folder; tap to pull that folder forward. */
function OpenRow({ m, onPull }: { m: DeckMission; onPull(id: string): void }) {
  const { user } = useSession();
  const now = useNow(1000);
  // A check-in's answers are read here, so "answered" is never late (the deck only has the feed).
  const answers = useQuery<CheckinAnswer>(m.checkin ? { path: `checkins/${m.checkin.id}/answers` } : null);
  const you = m.checkin ? { ...m.you, done: m.you.done || answers.data.some((a) => a.uid === user?.uid) } : m.you;
  const clock = m.deadlineMs !== null && m.deadlineMs > now ? tabClock(m.deadlineMs, now) : null;
  const line = openLine(m.kind, m.status, clock, you, { longRun: m.longRun });
  return (
    <li className="ms-r ms-r--live">
      <button type="button" className="ms-r__btn" onClick={() => onPull(m.id)} aria-label={`${m.label}, ${m.title}: ${line.text}. Bring its folder to the front`}>
        <b>{m.label}</b>
        <span className="ms-r__m">
          <span>{m.title}</span>
          <i className={line.tone}>{line.text}</i>
        </span>
        <span className="ms-chip" aria-hidden="true">
          {m.name}
        </span>
      </button>
    </li>
  );
}

/** A story announcement that has fired: a revealed note with its words, never a folder. */
function NoteRow({ note }: { note: StoryNote }) {
  return (
    <li className="ms-r ms-r--note">
      <b>{note.label}</b>
      <span className="ms-r__m">
        <span>{note.title}</span>
        {note.text ? <i>{note.text}</i> : null}
      </span>
    </li>
  );
}

/** What comes next, greyed: a random drop, the next one of a series. */
function DimRow({ label, title, line }: { label: string; title: string; line: string }) {
  return (
    <li className="ms-r ms-r--dim">
      <b>{label}</b>
      <span className="ms-r__m">
        <span>{title}</span>
        <i>{line}</i>
      </span>
    </li>
  );
}

/** The chapters still to come, as wax seals: their numbers, never their titles. */
function SealedRow({ numbers }: { numbers: number[] }) {
  const range = rangeLabel(numbers);
  return (
    <li className="ms-r ms-r--dim" aria-label={`${numbers.length === 1 ? 'Chapter' : 'Chapters'} ${range}: sealed until the ${t.gm.one} opens them`}>
      <b aria-hidden="true">{range}</b>
      <span className="ms-r__m" aria-hidden="true">
        <span className="ms-waxes">
          {numbers.map((n) => (
            <i key={n} className="ms-wax" />
          ))}
        </span>
        <i>sealed until the {t.gm.One} opens them</i>
      </span>
    </li>
  );
}

/** Your mark and what it cost or paid, after a filed mission's number. */
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

/** The filed missions folded into one line ("Filed · 2 · No. 1 ✗ −5 · No. 2 ✓"); it opens to list them. */
function FiledFold({ items }: { items: FiledMission[] }) {
  const [open, setOpen] = useState(false);
  const id = `ms-filed-${items[0]!.id}`;
  return (
    <li className={`ms-filed${open ? ' is-open' : ''}`}>
      <button type="button" className="ms-filed__bar" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <b>Filed · {items.length}</b>
        <span className="ms-filed__marks">
          {items.map((f, i) => (
            <Fragment key={f.id}>
              {i > 0 ? <span aria-hidden="true"> · </span> : null}
              <span className="ms-filed__one">
                {f.label}
                {items.length === 1 && f.quest ? ` ${f.title}` : ''} <MarkBits f={f} />
              </span>
            </Fragment>
          ))}
        </span>
        <Icon name="chevronDown" size={18} strokeWidth={2.4} className="ms-filed__chev" />
      </button>
      {open ? (
        <ol className="ms-filed__list" id={id}>
          {items.map((f) => (
            <FiledRow key={f.id} f={f} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** One filed mission; a group or story mission opens to its result. */
function FiledRow({ f }: { f: FiledMission }) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <b>{f.label}</b>
      <span className="ms-r__m">
        <span>{f.checkin ? f.checkin.prompt : f.title}</span>
        <i>
          {f.checkin ? `${f.checkin.name} · ` : ''}
          {f.mark === 'missed' ? 'missed' : f.mark === 'won' ? 'won' : f.mark === 'entered' ? (f.checkin ? 'present' : 'in') : 'filed'}
        </i>
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
