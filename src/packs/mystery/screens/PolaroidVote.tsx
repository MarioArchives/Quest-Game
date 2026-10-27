// The mystery pack's vote (look.screens.vote): the whole app becomes polaroids to swipe, then a cork board to choose
// on (design/mockups/mystery/voting-takeover). Pick one: right is a maybe, left is not it, then pin one on the
// board. Yes or no: every swipe is a vote, sent at once, and the board lets you flip any of them. When the vote has
// closed it shows who won.
import { useEffect, useMemo, useState } from 'react';
import { useNow, tsMs } from '../../../data/hooks';
import { useBallot } from '../../../data/useBallot';
import { formatCountdown } from '../../../lib/time';
import { useSession } from '../../../session/SessionProvider';
import { entryVotesText, noLeavesNoYes, type Doc, type Judgement } from '../../../shared';
import type { Submission } from '../../../shared';
import type { VoteScreenProps } from '../../types';
import { Polaroid, useEntryName } from './Polaroid';
import { EntrySheet, VoteBoard } from './VoteBoard';
import { VoteDeck } from './VoteDeck';
import { boardEntries, clampIndex, deckOrder, marksFor, readShortlist, startAt, writeShortlist, type Shortlist } from './voteDeck';
import './vote.css';

type Stage = { stage: 'deck'; index: number } | { stage: 'board' };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function PolaroidVote({ quest, entries, putAside, done }: VoteScreenProps) {
  const { user } = useSession();
  const uid = user?.uid ?? '';
  const ballot = useBallot(quest, entries);
  const style = ballot.style;
  const now = useNow(1000);
  const endsMs = quest.votingEndsAt ? tsMs(quest.votingEndsAt) : null;
  const counting = endsMs !== null && now >= endsMs;
  const closed = quest.status === 'closed';

  // Everyone else's entries, in this player's own order.
  const deck = useMemo(() => deckOrder(entries, uid, quest.id), [entries, uid, quest.id]);
  const [shortlist, setShortlist] = useState<Shortlist>(() => readShortlist(storage(), uid, quest.id));
  const marks = marksFor(style, shortlist, ballot.judged);

  // It opens once, where you left off, as soon as the ballot has loaded.
  const [where, setWhere] = useState<Stage | null>(null);
  useEffect(() => {
    if (where || ballot.loading) return;
    setWhere(startAt(deck, marks, ballot.progress.finished));
  }, [where, ballot.loading, deck, marks, ballot.progress.finished]);

  const [openId, setOpenId] = useState<string | null>(null);
  const pickedId = style === 'pick' ? ballot.pick : null;
  // At least one yes: a no that would finish the ballot without one can't be cast.
  const listed = useMemo(() => entries.map((e) => ({ id: e.id, uid: e.uid })), [entries]);
  const noBlocked = (entryId: string) => style === 'yesno' && noLeavesNoYes(ballot.judged, listed, uid, entryId);

  const judge = (entry: Doc<Submission>, dir: 'left' | 'right') => {
    if (counting) return;
    if (style === 'yesno') {
      void ballot.vote(entry.id, dir === 'right' ? 'yes' : 'no');
    } else {
      const next: Shortlist = { ...shortlist, [entry.id]: dir === 'right' ? 'maybe' : 'not' };
      setShortlist(next);
      writeShortlist(storage(), uid, quest.id, next);
    }
    setWhere((w) => {
      const index = (w?.stage === 'deck' ? clampIndex(w.index, deck.length) : 0) + 1;
      return index >= deck.length ? { stage: 'board' } : { stage: 'deck', index };
    });
  };

  // From the sheet: pick one pins (and keeps it on the shortlist); yes/no says it.
  const voteOn = (entry: Doc<Submission>, judgement?: Judgement) => {
    if (counting) return;
    void ballot.vote(entry.id, judgement);
    if (style === 'pick') {
      const next: Shortlist = { ...shortlist, [entry.id]: 'maybe' };
      setShortlist(next);
      writeShortlist(storage(), uid, quest.id, next);
      setOpenId(null);
    }
  };

  const stage: Stage | null = where && where.stage === 'deck' && clampIndex(where.index, deck.length) >= deck.length ? { stage: 'board' } : where;
  const question = quest.question ?? quest.title;
  const opened = openId ? (deck.find((e) => e.id === openId) ?? null) : null;

  return (
    <div className="vt">
      <div className="vt-main" inert={opened ? true : undefined}>
        <header className="vt-head">
          <div className="vt-head__row">
            <button type="button" className="vt-head__back" onClick={putAside}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
              <span>Back to the case</span>
            </button>
            {closed ? null : <Stamp endsMs={endsMs} now={now} />}
          </div>
          <h1 className="vt-head__title">{quest.title}</h1>
        </header>

        {closed ? (
          <Result quest={quest} entries={entries} />
        ) : stage?.stage === 'deck' && deck[clampIndex(stage.index, deck.length)] ? (
          <VoteDeck
            style={style}
            deck={deck}
            index={clampIndex(stage.index, deck.length)}
            disabled={counting}
            noBlocked={noBlocked(deck[clampIndex(stage.index, deck.length)]!.id)}
            onJudge={judge}
            onBack={() => setWhere({ stage: 'deck', index: Math.max(0, clampIndex(stage.index, deck.length) - 1) })}
          />
        ) : stage?.stage === 'board' ? (
          <VoteBoard
            style={style}
            question={question}
            entries={boardEntries(style, deck, marks, pickedId)}
            deck={deck}
            marks={marks}
            pickedId={pickedId}
            disabled={counting}
            onOpen={(e) => setOpenId(e.id)}
            onAgain={() => setWhere(deck.length > 0 ? { stage: 'deck', index: 0 } : { stage: 'board' })}
            onDone={done}
          />
        ) : null}
      </div>
      {opened && !closed ? (
        <EntrySheet
          style={style}
          entry={opened}
          number={deck.indexOf(opened) + 1}
          pickedId={pickedId}
          judged={ballot.judged}
          disabled={counting}
          noBlocked={noBlocked(opened.id)}
          onVote={voteOn}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

/** "08:41 TO VOTE", then "COUNTING" once the deadline has passed. */
function Stamp({ endsMs, now }: { endsMs: number | null; now: number }) {
  if (endsMs === null) return null;
  const text = formatCountdown(endsMs, now);
  const over = text === 'closed';
  return (
    <p className="vt-stamp-clock" role="timer" aria-label={over ? 'Counting the votes' : `${text} left to vote`}>
      {over ? (
        <b>COUNTING</b>
      ) : (
        <>
          <b>{text}</b>
          <i>TO VOTE</i>
        </>
      )}
    </p>
  );
}

/** The vote has closed: the winning entries with their votes, or "No winner". */
function Result({ quest, entries }: { quest: VoteScreenProps['quest']; entries: Doc<Submission>[] }) {
  const winners = (quest.winningSubmissionIds ?? []).map((id) => entries.find((e) => e.id === id)).filter((e): e is Doc<Submission> => Boolean(e));
  return (
    <div className="vt-result">
      {winners.length === 0 ? (
        <p className="vt-result__none">No winner</p>
      ) : (
        <ul className="vt-result__list">
          {winners.map((e) => (
            <li key={e.id}>
              <Winner entry={e} words={entryVotesText(quest, e.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Winner({ entry, words }: { entry: Doc<Submission>; words: string | null }) {
  const name = useEntryName(entry);
  return <Polaroid entry={entry} size="sheet" tilt={-1} reactions={false} words={words} byline={name.toUpperCase()} />;
}
