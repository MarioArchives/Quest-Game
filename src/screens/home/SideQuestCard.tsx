import { useEffect, useMemo, useState } from 'react';
import { castVote, friendlyError } from '../../api';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { EvidenceSheet, type EvidenceTarget } from '../../components/EvidenceSheet';
import { Icon } from '../../components/Icon';
import { PhotoThumb } from '../../components/PhotoViewer';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { formatCountdown } from '../../lib/time';
import { useSession } from '../../session/SessionProvider';
import type { Doc, GlobalQuest, Submission } from '../../shared';

function Countdown({ endsAt, closedText }: { endsAt: number; closedText: string }) {
  const now = useNow(1000);
  const text = formatCountdown(endsAt, now);
  const over = text === 'closed';
  return (
    <p className="hero__clock">
      <span className="hero__time" role="timer" aria-live="off">
        {over ? closedText : text}
      </span>
      {over ? null : <span className="hero__left">left</span>}
    </p>
  );
}

function Pips({ filled, total }: { filled: number; total: number }) {
  const pips = Math.min(Math.max(total, 1), 14);
  const on = Math.min(filled, pips);
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: pips }, (_, i) => (
        <span key={i} className={`pip${i < on ? ' pip--on' : ''}`} />
      ))}
    </span>
  );
}

/** The side quests that are open right now: entering while live, voting after. */
export function SideQuestCards() {
  const { globalQuests, state, settings } = useGame();
  const open = globalQuests.filter((g) => g.status === 'live' || g.status === 'voting').sort((a, b) => (a.status === b.status ? 0 : a.status === 'voting' ? -1 : 1));

  if (open.length === 0) {
    // Nothing to promise while the game is not running (lobby, paused or over).
    if (state.status !== 'active') return null;
    return (
      <section className="quiet" aria-label="Side quest">
        <p className="eyebrow">Side quest</p>
        <p className="quiet__title">None open right now</p>
        <p className="quiet__note">
          They drop at random, roughly every {Math.round((settings.globalIntervalMin / 60) * 10) / 10}&ndash;
          {Math.round((settings.globalIntervalMax / 60) * 10) / 10} hours. Everyone enters, then everyone votes.
        </p>
      </section>
    );
  }
  return (
    <>
      {open.map((quest) => (quest.status === 'voting' ? <VotingCard key={quest.id} quest={quest} /> : <LiveCard key={quest.id} quest={quest} />))}
    </>
  );
}

function LiveCard({ quest }: { quest: Doc<GlobalQuest> }) {
  const { player } = useSession();
  const { state, players, approved, mySubmissions } = useGame();
  const [sheet, setSheet] = useState<EvidenceTarget | null>(null);

  const entered = useMemo(() => new Set(approved.filter((s) => s.kind === 'global' && s.questId === quest.id).map((s) => s.uid)), [approved, quest.id]);
  const mine = mySubmissions.find((s) => s.kind === 'global' && s.questId === quest.id && s.status !== 'rejected');
  if (mine) entered.add(mine.uid);
  const active = state.status === 'active';

  return (
    <>
      <section className="hero halftone" aria-label="Live side quest">
        <span className="sticker hero__sticker">Live now</span>
        <p className="hero__eyebrow eyebrow">Side quest &middot; everyone plays</p>
        <h2 className="hero__title">{quest.title}</h2>
        {quest.description ? <p className="hero__desc">{quest.description}</p> : null}
        <p className="hero__rule">Enter with a photo or a comment, then everyone votes &middot; +{quest.bonusPoints} to the winner</p>
        <div className="hero__row">
          <Countdown endsAt={tsMs(quest.endsAt)} closedText="Closing" />
          <div className="hero__entries">
            <Pips filled={entered.size} total={players.length} />
            <p>
              {entered.size} of {players.length || entered.size} entered
            </p>
          </div>
        </div>
        {player ? (
          mine ? (
            <Button
              block
              onRed
              className="hero__cta"
              icon={<Icon name="edit" size={20} strokeWidth={2.2} />}
              disabled={!active}
              onClick={() => setSheet({ mode: 'evidence', submission: mine as Doc<Submission>, title: quest.title })}
            >
              You&apos;re in &middot; edit until voting starts
            </Button>
          ) : (
            <Button
              variant="primary"
              block
              onRed
              className="hero__cta"
              icon={<Icon name="camera" size={22} strokeWidth={2.2} />}
              disabled={!active}
              onClick={() => setSheet({ mode: 'enter', quest })}
            >
              Enter
            </Button>
          )
        ) : null}
        {player && !active ? <p className="hero__blocked">Entries open while the game is running.</p> : null}
        {!player ? <p className="hero__blocked">Only players can enter.</p> : null}
      </section>
      {sheet ? <EvidenceSheet target={sheet} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

const voteKey = (uid: string, questId: string) => `fq:vote:${uid}:${questId}`;

function readVote(uid: string | null, questId: string): string | null {
  if (!uid) return null;
  try {
    return localStorage.getItem(voteKey(uid, questId));
  } catch {
    return null;
  }
}

function VotingCard({ quest }: { quest: Doc<GlobalQuest> }) {
  const toast = useToast();
  const { user, player } = useSession();
  const { approved, playersById } = useGame();
  const uid = user?.uid ?? null;
  const entries = useMemo(
    () =>
      approved
        .filter((s) => s.kind === 'global' && s.questId === quest.id)
        // A steady order, so the grid doesn't reshuffle by who entered first.
        .sort((a, b) => a.id.localeCompare(b.id)),
    [approved, quest.id],
  );
  // Votes are secret on the server, so the pick is remembered here, on this device.
  const [pick, setPick] = useState<string | null>(() => readVote(uid, quest.id));
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => setPick(readVote(uid, quest.id)), [uid, quest.id]);

  const vote = async (entry: Doc<Submission>) => {
    if (!uid) return;
    setBusyId(entry.id);
    try {
      const { closed } = await castVote({ globalQuestId: quest.id, submissionId: entry.id });
      setPick(entry.id);
      try {
        localStorage.setItem(voteKey(uid, quest.id), entry.id);
      } catch {
        /* the pick just won't survive a reload */
      }
      toast(closed ? "That was the last vote. The result is in the feed." : 'Vote counted. You can change it until voting ends.', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="hero halftone" aria-label="Side quest voting">
      <span className="sticker hero__sticker">Vote now</span>
      <p className="hero__eyebrow eyebrow">Side quest &middot; secret ballot</p>
      <h2 className="hero__title">{quest.title}</h2>
      {quest.description ? <p className="hero__desc">{quest.description}</p> : null}
      <div className="hero__row">
        {quest.votingEndsAt ? <Countdown endsAt={tsMs(quest.votingEndsAt)} closedText="Counting" /> : null}
        <p className="hero__rule hero__rule--right">
          Most votes wins +{quest.bonusPoints}
          <br />
          Ties all win
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="hero__blocked">Nobody entered this one.</p>
      ) : (
        <ul className="entries">
          {entries.map((entry) => {
            const who = playersById.get(entry.uid);
            const own = entry.uid === uid;
            const picked = pick === entry.id;
            const name = who?.displayName ?? 'A player';
            return (
              <li key={entry.id} className={`entry${picked ? ' is-picked' : ''}`}>
                {entry.thumbPath ? (
                  <PhotoThumb submissionId={entry.id} thumbPath={entry.thumbPath} fill label={`Open ${name}'s entry`} />
                ) : (
                  <p className="entry__words">{entry.caption}</p>
                )}
                <p className="entry__who">
                  <Avatar name={name} src={who?.photoURL} size={22} />
                  <span>{own ? 'You' : name}</span>
                </p>
                {entry.thumbPath && entry.caption ? <p className="entry__caption">{entry.caption}</p> : null}
                {player ? (
                  <Button
                    small
                    block
                    variant={picked ? 'primary' : 'secondary'}
                    className="entry__vote"
                    busy={busyId === entry.id}
                    disabled={own || busyId !== null}
                    aria-pressed={picked}
                    onClick={() => void vote(entry)}
                  >
                    {own ? 'Your entry' : picked ? 'Your vote' : 'Vote'}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
